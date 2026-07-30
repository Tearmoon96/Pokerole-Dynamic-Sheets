#!/usr/bin/env bash
#
# Re-prune main's icon packs from the full packs on this branch.
#
# main ships only the icons the catalogues actually name — 869 of the 5088 the
# two packs contain. This script is what makes that prune reproducible instead
# of a one-off deletion: give it a checkout of main, and it copies in exactly
# what equip-icons-db.js and equip-icons-mono-db.js reference, then deletes
# whatever they no longer do.
#
# So adding an icon to the gear catalogue is:
#   1. find it in the full pack on this branch,
#   2. add its entry to app-data/equip-icons-db.js (or -mono-db.js) on main,
#   3. run this, and the SVG lands next to it.
#
# Usage: tools/sync-icons.sh /path/to/a/checkout/of/main

set -euo pipefail

die() { printf '%s\n' "$*" >&2; exit 1; }

target="${1:-}"
[ -n "$target" ] || die "usage: tools/sync-icons.sh /path/to/a/checkout/of/main"
[ -d "$target" ] || die "not a directory: $target"

src="$(cd "$(dirname "$0")/.." && pwd)"

[ -d "$src/app-data/dnd-item-icons-by-gwill-main/Library" ] \
    || die "full colour pack not found — run this from a dev-data checkout"
[ -d "$src/app-data/dnd-monochrome-icons" ] \
    || die "full monochrome pack not found — run this from a dev-data checkout"

# $1 catalogue file   $2 pack directory   $3 label
sync_pack() {
    db="$target/app-data/$1"
    from="$src/app-data/$2"
    into="$target/app-data/$2"
    label="$3"

    [ -f "$db" ] || die "catalogue not found: $db"

    wanted="$(mktemp)"
    present="$(mktemp)"

    # Every entry looks like {"n": ..., "c": ..., "f": "path/in/pack.svg"}
    grep -o '"f": "[^"]*"' "$db" | sed 's/"f": "//; s/"$//' | sort -u > "$wanted"

    missing=0
    while IFS= read -r f; do
        if [ ! -f "$from/$f" ]; then
            printf 'missing from pack: %s\n' "$f" >&2
            missing=1
            continue
        fi
        mkdir -p "$into/$(dirname "$f")"
        cp -p "$from/$f" "$into/$f"
    done < "$wanted"

    if [ "$missing" -ne 0 ]; then
        rm -f "$wanted" "$present"
        die "$label: the catalogue names icons the full pack does not have (listed above) — fix the catalogue first"
    fi

    # Anything left in the target pack that the catalogue no longer names goes.
    ( cd "$into" && find . -name '*.svg' -type f ) | sed 's|^\./||' | sort -u > "$present"

    removed=0
    while IFS= read -r f; do
        if ! grep -qxF -- "$f" "$wanted"; then
            rm -f "$into/$f"
            removed=$((removed + 1))
        fi
    done < "$present"

    find "$into" -mindepth 1 -type d -empty -delete

    printf '%-11s kept %4d, removed %4d\n' "$label" "$(wc -l < "$wanted")" "$removed"
    rm -f "$wanted" "$present"
}

sync_pack equip-icons-db.js      dnd-item-icons-by-gwill-main/Library "colour"
sync_pack equip-icons-mono-db.js dnd-monochrome-icons                 "monochrome"

# NOTICE credits the monochrome artists by name and points readers at this file.
cp -p "$src/app-data/dnd-monochrome-icons/license.txt" \
      "$target/app-data/dnd-monochrome-icons/license.txt"

printf '\nDone. Review with: git -C "%s" status\n' "$target"
