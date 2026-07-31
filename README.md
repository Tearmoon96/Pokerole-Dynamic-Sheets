# Pokerole Dynamic Sheets

Character sheets and a wild-encounter builder for the [Pokerole](https://www.pokeroleproject.com/) tabletop RPG, running entirely in your browser. There are two pages — one for trainers, one for individual Pokémon — and they talk to each other. No install, no sign-up, no server. Your data stays in plain `.json` files on your own computer. The app is developed with the dataset version 3.0 and the manual version of reference is the 3.0, but almost everything can be manually changed and adapted to other versions.

## What's in here

Two HTML files, each a standalone app:

- **`trainer-license.html`** — a trainer's sheet: attributes, skills, the six-Pokémon team, PC storage for the ones not being carried, bag and money, potions, badges, and achievements. A GM can point it at a folder full of players' sheets and flip between them during a session.
- **`pokemon-card.html`** — a single Pokémon's sheet: stats, moves and their effects, ability, HP and Will tracking, status conditions, and evolutions. The page recolors itself to match the Pokémon's type; on a dual-type Pokémon you click the type badge to switch which one drives the palette. It's also where you build wild Pokémon.

The two are linked. Click a team slot on a trainer's license and it opens that Pokémon's card; whatever you change there syncs back into the trainer's file. Stored Pokémon work the same way — being in the PC doesn't make one read-only.

## What it does

- Keeps a full trainer, their whole team, and everything in their PC storage in a single file.
- Gives each trainer six renameable PC boxes for Pokémon they own but aren't carrying, so freeing a team slot no longer means deleting a Pokémon. Deposit and withdraw by dragging, or with the box button on a team slot.
- Lets a GM build wild Pokémon, export them, and lets a player "capture" one straight into an open team slot — or into PC storage when the team is full.
- Stores full-resolution portraits on disk while embedding a small thumbnail inside the `.json`, so a file still shows its art when you hand it to someone else.
- Autofills Pokédex, move, ability, and item data from a bundled database, so you pick from real Pokerole values instead of typing them by hand.

## What you need

- **A browser.** Chrome, Edge, or another Chromium browser is recommended, because they support the File System Access API. That's what lets the app open a folder and write changes straight back to your files ("Open working folder" plus "Save All"). Firefox and Safari can still open files, but they can't save.
- **The `app-data/` folder.** It sits next to the two HTML files and holds the game database (Pokédex, moves, abilities, items) plus sprites. The apps won't run without it. Don't rename it — or if you really have to, update the single `DATA_BASE` line near the top of each HTML file.
- **Internet is optional.** The apps work offline, but fonts and icons load from a CDN, and any sprite that isn't stored locally is fetched from the Pokerole-Data GitHub. Offline, everything still works; it just looks plainer.

## Your files

Everything you make is plain JSON on disk. There's one file per trainer, and that file already contains their six Pokémon and their PC boxes, so sharing a character is just sending one `.json` over Discord, Drive, or a USB stick.

```
Pokerole Dynamic Sheets/
├── trainer-license.html      # trainer sheet
├── pokemon-card.html         # Pokémon card & wild-encounter builder
├── app-data/                 # game database & sprites  (required)
├── Pokerole Core Book/       # rulebook PDFs (reference)
└── Trainers and Pokemons/    # your working folder
    ├── <name>.json           # one trainer + their team + their PC boxes
    ├── Custom Images/        # full-res portraits
    │   ├── Trainers/
    │   └── Pokemons/
    └── Wild Pokemons/        # wild encounters exported by the GM
```

The Core Books version 1.25 and 3.0 already have pre-set bookmarks toward the most relevant parts of the book, however you can add other versions and other bookmarks. Just follow the naming scheme of the already existing ones.

### What's safe to rename

**Safe:** the working folder itself (`Trainers and Pokemons/`) — you pick it through the browser's folder picker, so the app never cares what it's called. Name it `Trainers`, `MyCampaign`, whatever. Your trainer `.json` files can be renamed freely too.

**Leave alone:** everything the app creates *inside* the working folder. These are looked up by their exact names, and renaming one doesn't crash the app — it silently recreates the folder it expected and loses track of the full-resolution images filed under the old name. The small embedded thumbnails still show, so it degrades quietly rather than failing loudly.

- `Custom Images/`, and its `Trainers/` and `Pokemons/` subfolders
- `Wild Pokemons/`
- `app-data/` — required for the app to work at all. If you really must rename it, update the one `DATA_BASE` line inside **both** HTML files.
- `app-data/dnd-item-icons-by-gwill-main/` and `app-data/dnd-monochrome-icons/` — the two icon packs the trainer equipment window draws from. If you rename either, update the matching `EQUIP_ICON_DIR` / `EQUIP_ICON_MONO_DIR` line at the top of `app-data/equip-icons-db.js` or `equip-icons-mono-db.js`. Without them the equipment slots fall back to plain symbols.

> Rule of thumb: the working folder you select is yours to name. Everything the app creates inside it — keep those names exactly as they are.

## Using it

**As a player**

1. Open `trainer-license.html`.
2. Click the folder button, choose "Open working folder," and pick your `Trainers and Pokemons` folder.
3. Fill in your trainer. Click a team slot to open a Pokémon's card and edit it.
4. Caught more than six? Hit **PC Storage** next to "Capture Wild Pokémon" and drag Pokémon between the six boxes and the team strip. Stored Pokémon keep their whole sheet and can still be opened and edited. Boxes can be renamed, and one button switches every sprite between the Home and Book art sets.
5. Click "Save All" to write everything to disk. The button turns amber when you have unsaved changes.
6. To share, send your `.json` from the working folder.

**As a GM**

- Point "Open working folder" at a directory that holds all your players' trainer files, then use the side arrows to move between sheets mid-session.
- To make an encounter, open `pokemon-card.html`, create a wild Pokémon, and export it into `Wild Pokemons/`. Players capture it from their license into an open team slot — or straight into PC storage if their team is already full.

## Under the hood

Plain HTML, CSS, and JavaScript — no framework, no build step, nothing to install. The game data lives in `app-data/` as pre-built JS bundles (`pokedex-db.js`, `moves-db.js`, `abilities-db.js`, `items-db.js`, `equip-icons-db.js`, `equip-icons-mono-db.js`, `sprite-frames-db.js`). Fonts are Outfit and Fira Code from Google Fonts; icons are FontAwesome 6.4.

This branch carries the app and nothing else, so a download stays as small as it can while still working offline. The raw Pokerole dataset those bundles are compiled from, the Python scripts that compile it, and the two icon packs in full live on the **[`dev-data`](../../tree/dev-data)** branch — or in the developer zip attached to any release. None of it is needed to run the app.

## Contact

If you have any suggestion, bug to report, request to make or any funny idea:

- Email: leggluca96@gmail.com
- Discord: tearmoon_

## Credits

- Game data comes from the [Pokerole-Data](https://github.com/Willowlark/Pokerole-Data) dataset by [Willowlark](https://github.com/Willowlark) and contributors — the `app-data/*-db.js` bundles are built from it.
- The trainer equipment icons come from two packs: [D&D Item Icons](https://github.com/Gwillewyn/dnd-item-icons-by-gwill) by Gwillewyn (the colour set), and the monochrome originals from [game-icons.net](https://game-icons.net/) by Lorc, Delapouite and others, used under CC BY 3.0 / CC0 — see `app-data/dnd-monochrome-icons/license.txt` for the full attribution list.
- Pokerole is made by the [Pokerole Project](https://www.pokeroleproject.com/); the rules and mechanics are theirs.
- Pokémon and its character names are trademarks of Nintendo, The Pokémon Company, and Game Freak.

This is a free, non-commercial fan tool.
