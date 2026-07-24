"""Generate one card page per Pokemon type in type-pages/.

Each page is a tiny stub that forwards to pokemon-card.html with a
representative single-type Pokemon of that type, so every one of the 18
type themes has a directly openable page. Also writes type-pages/index.html
linking them all. Re-run after changing the picks:

    python3 scripts/build_type_pages.py
"""
import json
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POKEDEX_DIR = os.path.join(REPO_ROOT, 'v3.0', 'Pokedex')
OUT_DIR = os.path.join(REPO_ROOT, 'type-pages')

# Preferred face of each type; must be single-type or the fallback kicks in
PICKS = {
    'Normal': 'Snorlax',
    'Fire': 'Arcanine',
    'Water': 'Blastoise',
    'Electric': 'Pikachu',
    'Grass': 'Sceptile',
    'Ice': 'Glaceon',
    'Fighting': 'Machamp',
    'Poison': 'Muk',
    'Ground': 'Groudon',
    'Flying': 'Rookidee',
    'Psychic': 'Alakazam',
    'Bug': 'Pinsir',
    'Rock': 'Sudowoodo',
    'Ghost': 'Misdreavus',
    'Dragon': 'Goodra',
    'Dark': 'Umbreon',
    'Steel': 'Registeel',
    'Fairy': 'Sylveon',
}

# Same palette as typeColors in pokemon-card.html, for the index tiles
TYPE_COLORS = {
    'Normal': '#9ca3af', 'Fire': '#f97316', 'Water': '#3b82f6',
    'Electric': '#facc15', 'Grass': '#22c55e', 'Ice': '#22d3ee',
    'Fighting': '#ef4444', 'Poison': '#c026d3', 'Ground': '#d97706',
    'Flying': '#93c5fd', 'Psychic': '#ec4899', 'Bug': '#84cc16',
    'Rock': '#b45309', 'Ghost': '#a855f7', 'Dragon': '#6366f1',
    'Dark': '#6b7280', 'Steel': '#94a3b8', 'Fairy': '#f9a8d4',
}

STUB = """<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0;url=../pokemon-card.html?pokemon={pid}">
    <title>Pokerole Card - {type} ({name})</title>
    <script>location.replace('../pokemon-card.html?pokemon={pid}');</script>
</head>

<body>
    <p><a href="../pokemon-card.html?pokemon={pid}">{type} card: {name}</a></p>
</body>

</html>
"""


def load_dex():
    dex = []
    for filename in os.listdir(POKEDEX_DIR):
        if filename.endswith('.json'):
            with open(os.path.join(POKEDEX_DIR, filename), encoding='utf-8') as f:
                dex.append(json.load(f))
    dex.sort(key=lambda p: (p.get('Number', 0), p.get('Name', '')))
    return dex


def pick_for(ptype, dex):
    by_name = {p['Name']: p for p in dex}
    wanted = by_name.get(PICKS.get(ptype, ''))
    if wanted and wanted['Type1'] == ptype and not wanted.get('Type2'):
        return wanted
    for p in dex:
        if p['Type1'] == ptype and not p.get('Type2'):
            return p
    raise SystemExit(f'No single-type {ptype} Pokemon found')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    dex = load_dex()
    tiles = []
    for ptype in PICKS:
        p = pick_for(ptype, dex)
        fname = ptype.lower() + '.html'
        with open(os.path.join(OUT_DIR, fname), 'w', encoding='utf-8') as f:
            f.write(STUB.format(pid=p['_id'], type=ptype, name=p['Name']))
        c = TYPE_COLORS[ptype]
        tiles.append(
            f'        <a class="tile" href="{fname}" style="--c: {c};">'
            f'<span class="type">{ptype}</span><span class="name">{p["Name"]}</span></a>'
        )
        print(f'{ptype:10s} -> {p["Name"]}')

    index = """<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pokerole Cards - One Per Type</title>
    <style>
        body {
            background: linear-gradient(135deg, #14101f 0%, #0b0713 100%) no-repeat fixed;
            font-family: sans-serif;
            color: #eee;
            min-height: 100vh;
            margin: 0;
            padding: 40px 20px;
        }

        h1 {
            text-align: center;
            font-weight: 600;
            margin-bottom: 30px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
            gap: 14px;
            max-width: 900px;
            margin: 0 auto;
        }

        .tile {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 16px;
            border-radius: 14px;
            text-decoration: none;
            background: color-mix(in srgb, var(--c) 15%, #000);
            border: 1px solid var(--c);
            transition: all 0.2s;
        }

        .tile:hover {
            background: color-mix(in srgb, var(--c) 35%, #000);
            box-shadow: 0 0 12px var(--c);
        }

        .tile .type {
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--c);
        }

        .tile .name {
            font-size: 0.85rem;
            color: #ddd;
        }
    </style>
</head>

<body>
    <h1>Pokerole Cards - One Per Type</h1>
    <div class="grid">
{tiles}
    </div>
</body>

</html>
""".replace('{tiles}', '\n'.join(tiles))
    with open(os.path.join(OUT_DIR, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(index)
    print(f'Wrote {len(PICKS)} type pages + index.html to {OUT_DIR}')


if __name__ == '__main__':
    main()
