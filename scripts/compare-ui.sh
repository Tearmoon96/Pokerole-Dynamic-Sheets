#!/bin/sh
# Screenshot the React page and the original inline-HTML page side by side and
# report how many pixels differ. The UI is supposed to be unchanged by the
# conversion, so anything above antialiasing noise is a regression.
#
#   scripts/compare-ui.sh            # landing screen + populated sheet
#
# Needs google-chrome-stable and ImageMagick.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/.verify"
PORT=8099

command -v google-chrome-stable >/dev/null || { echo "google-chrome-stable not found"; exit 1; }
command -v magick >/dev/null || { echo "ImageMagick not found"; exit 1; }

npm run --silent build >/dev/null

rm -rf "$OUT/compare"
mkdir -p "$OUT/compare" "$OUT/shots"
cp -r "$ROOT/dist-pwa/." "$OUT/compare/"
ln -sfn "$ROOT/PDS React Develop/app-data" "$OUT/compare/app-data"

rm -f "$OUT/compare-fail"
node "$ROOT/scripts/build-compare-pages.mjs" "$ROOT"

node "$ROOT/scripts/static-server.mjs" "$OUT/compare" $PORT &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 2

shoot() {
    google-chrome-stable --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
        --window-size=1400,2400 --virtual-time-budget=18000 \
        --screenshot="$2" "$1" 2>/dev/null
}

# ImageMagick 7's HDRI builds report -metric AE scaled by QuantumRange (65535 on
# Q16-HDRI) and in scientific notation; IM6 printed a plain count. Both broke the
# old parser -- `cut -d'.' -f1` turned "1.24625e+09" into "1", so every view read
# as one pixel and the run passed no matter what had changed. Calibrate against a
# pair that differs by exactly one pixel instead of hardcoding the scale.
magick -size 2x1 xc:black "$OUT/ae-cal-a.png"
magick "$OUT/ae-cal-a.png" -fill white -draw "point 0,0" "$OUT/ae-cal-b.png"
AESCALE=$(magick compare -metric AE "$OUT/ae-cal-a.png" "$OUT/ae-cal-b.png" null: 2>&1 \
    | tail -1 | awk '{ printf "%.0f", $1 }')
rm -f "$OUT/ae-cal-a.png" "$OUT/ae-cal-b.png"
[ "${AESCALE:-0}" -lt 1 ] && AESCALE=1

# Differing pixels between two shots, as a plain integer.
ae() {
    magick compare -metric AE "$1" "$2" null: 2>&1 | tail -1 \
        | awk -v s="$AESCALE" '{ printf "%.0f", $1 / s }'
}

# Each entry is "<label>|<page>|<query string>": the closed sheet, then one per
# dialog, for both pages.
VIEWS="landing|legacy|react|
sheet|legacy|react|?trainer=tseedtrainer
theme|legacy|react|?trainer=tseedtrainer&view=theme
info|legacy|react|?trainer=tseedtrainer&view=info
storage|legacy|react|?trainer=tseedtrainer&view=storage
equipment|legacy|react|?trainer=tseedtrainer&view=equipment
manual|legacy|react|?trainer=tseedtrainer&view=manual
team|legacy|react|?trainer=tseedtrainer&view=team
badge|legacy|react|?trainer=tseedtrainer&view=badge
card|legacy-card|react-card|?pokemon=pikachu
card-dual|legacy-card|react-card|?pokemon=charizard
card-egg|legacy-card|react-card|?pokemon=egg
card-types|legacy-card|react-card|?pokemon=pikachu&view=cardTypes
card-ailments|legacy-card|react-card|?pokemon=pikachu&view=cardAilments
card-weather|legacy-card|react-card|?pokemon=pikachu&view=cardWeather
card-load|legacy-card|react-card|?pokemon=pikachu&view=cardLoad
card-ability|legacy-card|react-card|?pokemon=pikachu&view=cardAbility
card-blank|legacy-card|react-card|
gm|legacy-gm|react-gm|
gm-tip|legacy-gm|react-gm|?view=gmTip
gm-combat-tip|legacy-gm|react-gm|?view=gmCombatTip
gm-ailment|legacy-gm|react-gm|?view=gmAilment"

fail=0
echo "$VIEWS" | while IFS='|' read -r label lpage rpage view; do
    [ -z "$label" ] && continue
    shoot "http://localhost:$PORT/$lpage.html$view" "$OUT/shots/$label-legacy.png"
    shoot "http://localhost:$PORT/$rpage.html$view"  "$OUT/shots/$label-react.png"
    px=$(ae "$OUT/shots/$label-legacy.png" "$OUT/shots/$label-react.png")

    # A handful of pixels is subpixel antialiasing. Above that, measure this
    # view's own noise floor rather than guessing a threshold: Chrome resamples a
    # transformed sprite slightly differently between runs, so a page can differ
    # from ITSELF by a few hundred pixels along the sprite's edge. Shoot the
    # original twice and compare the two.
    #
    # The two magnitudes are far apart, which is what makes this workable: the
    # residual noise runs to a few hundred pixels out of 3.4 million, while every
    # real regression this harness has caught measured in the tens of thousands
    # (a wrapper element that resized the whole grid, a nesting change that broke
    # the subgrid row alignment).
    if [ "${px:-0}" -gt 100 ]; then
        # Two samples, because one is itself noisy: the floor has to be the
        # worst this view does against itself, not whatever it did once.
        npx=0
        for n in 1 2; do
            shoot "http://localhost:$PORT/$lpage.html$view" "$OUT/shots/$label-legacy-n$n.png"
            this=$(ae "$OUT/shots/$label-legacy.png" "$OUT/shots/$label-legacy-n$n.png")
            [ "${this:-0}" -gt "$npx" ] && npx=${this:-0}
        done
        floor=$(( npx * 2 + 500 ))
        if [ "${px:-0}" -gt "$floor" ]; then
            echo "$label: $px pixels differ (self-noise ${npx:-0}, floor $floor)  <-- DIFFERS"
            echo differ >> "$OUT/compare-fail"
        else
            echo "$label: $px pixels differ, within this view's noise (self-noise ${npx:-0}, floor $floor)"
        fi
    else
        echo "$label: $px pixels differ"
    fi
done

if [ -s "$OUT/compare-fail" ]; then
    echo "UI DIFFERS - inspect $OUT/shots/"
    rm -f "$OUT/compare-fail"
    exit 1
fi
echo "UI matches the original."
exit 0
