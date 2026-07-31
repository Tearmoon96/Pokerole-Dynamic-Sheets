#!/usr/bin/env python3
#
# Build test.html: every Pokemon, one row each, with its Home, Book and Box
# sprite in the same round well PC storage draws them in — so the framing can be
# reviewed sprite by sprite instead of a screenshot at a time.
#
# It is a throwaway review page, not part of the app. Delete it when done.
#
# The point of building it from a script is that it does NOT restate the
# framing: it lifts the CSS rules and the whole boxSpriteFrame() block verbatim
# out of trainer-license.html, so the page cannot drift from what the app
# actually does. Retune the policy, re-run this, and the page follows.
#
# Usage: tools/make-sprite-test.py /path/to/a/checkout/of/main

import os
import sys

CSS_RULES = [
    ".box-tile {",
    ".box-tile img {",
    ".box-tile img.sprite-pixel,",
    ".box-tile img.sprite-smooth,",
]

# everything from the fallback table through the end of boxSpriteFrame()
JS_FROM = "        /* Fallback framing, one number per set"
JS_TO = "        function boxSpriteFrame("


def css_rule(src, anchor):
    i = src.index(anchor)
    return src[i:src.index("}", i) + 1]


def js_block(src):
    start = src.index(JS_FROM)
    i = src.index(JS_TO)
    # the file indents top-level functions by 8 spaces, so their closing brace
    # is the first "\n        }" after the opening line
    end = src.index("\n        }", i) + len("\n        }")
    return src[start:end]


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: tools/make-sprite-test.py /path/to/a/checkout/of/main")
    target = sys.argv[1]
    page = os.path.join(target, "trainer-license.html")
    if not os.path.isfile(page):
        sys.exit("no trainer-license.html in %s" % target)
    src = open(page, encoding="utf-8").read()

    css = "\n".join(css_rule(src, a) for a in CSS_RULES)
    policy = js_block(src)
    for name in ("BOX_WELL", "BOX_SPRITE_PX", "SPRITE_FIT_TARGET", "boxSpriteFrame"):
        if name not in policy:
            sys.exit("extraction missed %s — the source layout changed" % name)

    dest = os.path.join(target, "test.html")
    with open(dest, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(TEMPLATE.replace("/*__CSS__*/", css).replace("/*__POLICY__*/", policy))
    print("wrote %s" % dest)
    print("open it from disk; delete it when the review is done")


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sprite framing review</title>
<!-- Built by tools/make-sprite-frames' companion, tools/make-sprite-test.py, on
     the dev-data branch. Throwaway review page — not part of the app.
     The CSS and the framing policy below are lifted verbatim out of
     trainer-license.html so this shows exactly what PC storage shows. -->
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
        --bg: #14161b; --panel: #1b1e25; --line: #2a2e37;
        --text: #e6e8ec; --muted: #8b93a3; --accent: #e05252;
        --border-color: #3a3f4b; --box-well: #00000059;
    }
    body { background: var(--bg); color: var(--text);
           font: 14px/1.4 Outfit, system-ui, sans-serif; padding: 0 0 60px; }
    header { position: sticky; top: 0; z-index: 5; background: var(--panel);
             border-bottom: 1px solid var(--line); padding: 12px 16px;
             display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    h1 { font-size: 15px; font-weight: 700; }
    .count { color: var(--muted); font-size: 12px; }
    input { background: #0f1116; border: 1px solid var(--line); color: var(--text);
            border-radius: 8px; padding: 7px 11px; font: inherit; font-size: 13px;
            min-width: 260px; }
    input:focus { outline: none; border-color: var(--accent); }
    table { border-collapse: collapse; width: 100%; }
    thead th { position: sticky; top: 57px; background: var(--panel); z-index: 4;
               font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
               color: var(--muted); text-align: left; padding: 8px 16px;
               border-bottom: 1px solid var(--line); }
    tbody tr { border-bottom: 1px solid #ffffff0d; }
    tbody tr:hover { background: #ffffff08; }
    td { padding: 5px 16px; vertical-align: middle; }
    .num { color: var(--muted); font-variant-numeric: tabular-nums; width: 70px; }
    .name { font-weight: 600; width: 230px; }
    .cell { width: 110px; }
    .zoom { display: block; color: var(--muted); font-size: 10px;
            font-variant-numeric: tabular-nums; margin-top: 2px; }
    .missing { width: 62px; height: 62px; border-radius: 50%;
               border: 1px dashed var(--line); display: flex; align-items: center;
               justify-content: center; color: var(--muted); font-size: 10px; }

    /* ---- verbatim from trainer-license.html ---- */
/*__CSS__*/
</style>
</head>
<body>
<header>
    <h1>Sprite framing review</h1>
    <input id="q" placeholder="Filter by name or number…" autocomplete="off">
    <span class="count" id="count"></span>
    <span class="count">circles are the real PC-storage well; the number under each is its zoom</span>
</header>
<table>
    <thead><tr><th>#</th><th>Pokémon</th><th>Home</th><th>Book</th><th>Box</th></tr></thead>
    <tbody id="rows"></tbody>
</table>

<script src="app-data/pokedex-db.js"></script>
<script src="app-data/sprite-frames-db.js"></script>
<script>
/* ---- verbatim from trainer-license.html ---- */
/*__POLICY__*/

const IMG_BASE = 'app-data/images/';
const GITHUB_RAW = 'https://raw.githubusercontent.com/Willowlark/Pokerole-Data/master/images/';
const FOLDERS = { Home: 'HomeSprites', Book: 'BookSprites', Box: 'BoxSprites' };

function well(p, set) {
    const td = document.createElement('td');
    td.className = 'cell';
    const known = SPRITE_FRAMES[set] && SPRITE_FRAMES[set][p.Image];
    if (usableSpriteType(p.Image, set) !== set) {
        /* the file exists but is the wrong Pokémon, or the pack lacks it —
           the app substitutes another set here (see SPRITE_SET_BLOCKED) */
        const d = document.createElement('div');
        d.className = 'missing';
        d.textContent = 'wrong';
        d.title = set + ' art for ' + p.Name + ' is unusable; the app draws '
                + usableSpriteType(p.Image, set) + ' instead';
        td.appendChild(d);
        return td;
    }
    if (!known) {
        /* no local sprite in this set — the app falls back to GitHub and to the
           per-set default framing, so say so rather than pretending */
        const d = document.createElement('div');
        d.className = 'missing';
        d.textContent = 'none';
        d.title = p.Image + ' is not in ' + FOLDERS[set];
        td.appendChild(d);
        return td;
    }
    const fr = boxSpriteFrame(p.Image, set, BOX_WELL);
    const tile = document.createElement('div');
    tile.className = 'box-tile';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    /* same rule as applyTeamSprite: nearest-neighbour only at an exact ratio above 1x */
    const smooth = fr.exact === false || fr.scale < 1;
    if (set === 'Box') img.className = 'sprite-pixel' + (smooth ? ' sprite-smooth' : '');
    img.style.setProperty('--sprite-scale', fr.scale);
    img.style.setProperty('--sprite-x', fr.offsetX + 'px');
    img.style.setProperty('--sprite-y', fr.offsetY + 'px');
    img.onerror = () => { img.onerror = null; img.src = GITHUB_RAW + FOLDERS[set] + '/' + p.Image; };
    img.src = IMG_BASE + FOLDERS[set] + '/' + p.Image;
    tile.appendChild(img);
    td.appendChild(tile);
    const z = document.createElement('span');
    z.className = 'zoom';
    z.textContent = (Math.round(fr.scale * 100) / 100) + '×'
        + (set === 'Box' ? (smooth ? ' soft' : ' crisp') : '');
    td.appendChild(z);
    return td;
}

const MONS = ALL_POKEMON.filter(p => p.Image);
const body = document.getElementById('rows');

function draw(list) {
    body.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(p => {
        const tr = document.createElement('tr');
        const n = document.createElement('td');
        n.className = 'num';
        n.textContent = p.DexID;
        const nm = document.createElement('td');
        nm.className = 'name';
        nm.textContent = p.Name;
        tr.appendChild(n);
        tr.appendChild(nm);
        ['Home', 'Book', 'Box'].forEach(s => tr.appendChild(well(p, s)));
        frag.appendChild(tr);
    });
    body.appendChild(frag);
    document.getElementById('count').textContent =
        list.length + ' of ' + MONS.length + ' Pokémon';
}

function filter(q) {
    q = (q || '').trim().toLowerCase();
    draw(!q ? MONS : MONS.filter(p =>
        p.Name.toLowerCase().includes(q) || String(p.DexID).includes(q)));
}
document.getElementById('q').addEventListener('input', e => filter(e.target.value));

/* ?q=charizard opens straight at one Pokémon — handy for pointing at a
   specific sprite, and it keeps the whole 1200-row list off the page when
   only one is being looked at */
const fromUrl = new URLSearchParams(location.search).get('q') || '';
document.getElementById('q').value = fromUrl;
filter(fromUrl);
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
