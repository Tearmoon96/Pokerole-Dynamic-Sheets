# 📁 Folder Structure — What's Safe to Rename

A quick guide to how the folders are organized and which names you can change without breaking the app.

## Layout

```text
Pokerole Data Master/
├── trainer-license.html      # Trainer character sheet app
├── pokemon-card.html         # Pokémon card & encounter app
├── app-data/                 # Game database & sprites (REQUIRED)
├── Pokerole Core Book/       # Rulebook PDFs (reference, optional)
└── Trainers and Pokemons/    # Your working folder — holds trainer .json files
    ├── <YourName>.json       # One file per trainer (trainer + their 6 Pokémon)
    ├── Custom Images/        # Full-res portraits & sprites
    │   ├── Trainers/         #   → trainer photos
    │   └── Pokemons/         #   → Pokémon art
    └── Wild Pokemons/        # Wild encounter .json files exported by the GM
```

## ✅ Safe to rename

- **The working folder** (`Trainers and Pokemons/`). You pick this folder yourself
  through the browser's folder picker, so the app never cares what it's called.
  Name it anything — `Trainers`, `MyCampaign`, `Party`, etc. No functional impact.
- **Your trainer `.json` files.** Rename them freely.

## ⚠️ Do NOT rename

These are looked up by their exact names in the code. Rename them and the app can't
find them — it silently recreates the expected folders and loses track of the
full-resolution images stored under the old names (small embedded thumbnails still
show, so things degrade rather than crash):

- `Custom Images/`
- `Custom Images/Trainers/` and `Custom Images/Pokemons/`
- `Wild Pokemons/`
- `app-data/` — required for the app to work at all. (If you really must rename it,
  update the one `DATA_BASE` line inside **both** HTML files.)
- `app-data/dnd-item-icons-by-gwill-main/` and `app-data/dnd-monochrome-icons/` —
  the two icon packs the trainer equipment window draws from: the colour set and
  the monochrome one. Their paths are listed in `app-data/equip-icons-db.js` and
  `app-data/equip-icons-mono-db.js`; if you rename a folder, update the
  `EQUIP_ICON_DIR` / `EQUIP_ICON_MONO_DIR` line at the top of the matching file.
  Without them the equipment slots simply fall back to plain symbols.

## Rule of thumb

> The **working folder** you select is yours to name. Everything the app creates
> **inside** it — keep those names exactly as they are.
