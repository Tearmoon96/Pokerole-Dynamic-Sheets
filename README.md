# Pokerole Dynamic Sheets

Character sheets and a wild-encounter builder for the [Pokerole](https://www.pokeroleproject.com/) tabletop RPG, running entirely in your browser. There are two pages — one for trainers, one for individual Pokémon — and they talk to each other. No install, no sign-up, no server. Your data stays in plain `.json` files on your own computer. The app is developed with the dataset version 3.0 and the manual version of reference is the 3.0, but almost everything can be manually changed and adapted to other versions.

## What's in here

Two HTML files, each a standalone app:

- **`trainer-license.html`** — a trainer's sheet: attributes, skills, the six-Pokémon team, bag and money, potions, badges, and achievements. A GM can point it at a folder full of players' sheets and flip between them during a session.
- **`pokemon-card.html`** — a single Pokémon's sheet: stats, moves and their effects, ability, HP and Will tracking, status conditions, and evolutions. The page recolors itself to match the Pokémon's type; on a dual-type Pokémon you click the type badge to switch which one drives the palette. It's also where you build wild Pokémon.

The two are linked. Click a team slot on a trainer's license and it opens that Pokémon's card; whatever you change there syncs back into the trainer's file.

## What it does

- Keeps a full trainer and their whole team in a single file.
- Lets a GM build wild Pokémon, export them, and lets a player "capture" one straight into an open team slot.
- Stores full-resolution portraits on disk while embedding a small thumbnail inside the `.json`, so a file still shows its art when you hand it to someone else.
- Autofills Pokédex, move, ability, and item data from a bundled database, so you pick from real Pokerole values instead of typing them by hand.

## What you need

- **A browser.** Chrome, Edge, or another Chromium browser is recommended, because they support the File System Access API. That's what lets the app open a folder and write changes straight back to your files ("Open working folder" plus "Save All"). Firefox and Safari can still open files, but they can't save.
- **The `app-data/` folder.** It sits next to the two HTML files and holds the game database (Pokédex, moves, abilities, items) plus sprites. The apps won't run without it. Don't rename it — or if you really have to, update the single `DATA_BASE` line near the top of each HTML file.
- **Internet is optional.** The apps work offline, but fonts and icons load from a CDN, and any sprite that isn't stored locally is fetched from the Pokerole-Data GitHub. Offline, everything still works; it just looks plainer.

## Your files

Everything you make is plain JSON on disk. There's one file per trainer, and that file already contains their six Pokémon, so sharing a character is just sending one `.json` over Discord, Drive, or a USB stick.

```
Pokerole Dynamic Sheets/
├── trainer-license.html      # trainer sheet
├── pokemon-card.html         # Pokémon card & wild-encounter builder
├── app-data/                 # game database & sprites  (required)
├── Pokerole Core Book/       # rulebook PDFs (reference)
└── Trainers and Pokemons/    # your working folder
    ├── <name>.json           # one trainer + their team
    ├── Custom Images/        # full-res portraits
    │   ├── Trainers/
    │   └── Pokemons/
    └── Wild Pokemons/        # wild encounters exported by the GM
```

The Core Books version 1.25 and 3.0 already have pre-set bookmarks toward the most relevant parts of the book, however you can add other versions and other bookmarks. Just follow the naming scheme of the already existing ones.

You choose the working folder yourself, so you can name it whatever you like. The folders the app creates inside it (`Custom Images/`, `Wild Pokemons/`) are looked up by name, so leave those as they are. There's more detail in [FOLDER-STRUCTURE.md](./FOLDER-STRUCTURE.md).

## Using it

**As a player**

1. Open `trainer-license.html`.
2. Click the folder button, choose "Open working folder," and pick your `Trainers and Pokemons` folder.
3. Fill in your trainer. Click a team slot to open a Pokémon's card and edit it.
4. Click "Save All" to write everything to disk. The button turns amber when you have unsaved changes.
5. To share, send your `.json` from the working folder.

**As a GM**

- Point "Open working folder" at a directory that holds all your players' trainer files, then use the side arrows to move between sheets mid-session.
- To make an encounter, open `pokemon-card.html`, create a wild Pokémon, and export it into `Wild Pokemons/`. Players capture it from their license into an open team slot.

## Under the hood

Plain HTML, CSS, and JavaScript — no framework, no build step, nothing to install. The game data lives in `app-data/` as pre-built JS bundles (`pokedex-db.js`, `moves-db.js`, `abilities-db.js`, `items-db.js`, `equip-icons-db.js`, `equip-icons-mono-db.js`). Fonts are Outfit and Fira Code from Google Fonts; icons are FontAwesome 6.4.

## Credits

- Game data comes from the [Pokerole-Data](https://github.com/Willowlark/Pokerole-Data) dataset by [Willowlark](https://github.com/Willowlark) and contributors — the `app-data/*-db.js` bundles are built from it.
- The trainer equipment icons come from two packs: [D&D Item Icons](https://github.com/Gwillewyn/dnd-item-icons-by-gwill) by Gwillewyn (the colour set), and the monochrome originals from [game-icons.net](https://game-icons.net/) by Lorc, Delapouite and others, used under CC BY 3.0 / CC0 — see `app-data/dnd-monochrome-icons/license.txt` for the full attribution list.
- Pokerole is made by the [Pokerole Project](https://www.pokeroleproject.com/); the rules and mechanics are theirs.
- Pokémon and its character names are trademarks of Nintendo, The Pokémon Company, and Game Freak.

This is a free, non-commercial fan tool.
