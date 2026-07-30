# `dev-data` — the maintenance branch

Nothing here is needed to *use* Pokerole Dynamic Sheets. The app lives on `main`;
this branch holds only the material that was stripped out of it so that a normal
download stays about 250 MB instead of 330 MB, and so the repository's file
listing shows the app rather than five thousand source files.

This is an **orphan branch**. It shares no history with `main` and holds no copy
of the app, which is deliberate: a parallel branch that *did* carry the app would
have to be merged from `main` periodically, and every such merge would replay
`main`'s deletions and wipe `app-data/build/` right back off again. With no
overlap there is nothing to sync — this branch only changes when the dataset or
the tooling does.

## What is here

```
app-data/build/                          the raw Pokerole dataset and its build scripts
  v3.0/                                  the source the four *-db.js bundles are compiled from
  v2.0/                                  the older dataset; nothing in this repo reads it
  Homebrew/Items/                        extra items merged into items-db.js
  scripts/build_*.py                     the compilers
  DDL.md                                 data reference
app-data/dnd-item-icons-by-gwill-main/   the colour icon pack, complete (908 icons)
app-data/dnd-monochrome-icons/           the monochrome icon pack, complete (4180 icons)
tools/                                   release and icon tooling
```

`main` ships only the 869 icons its two catalogues actually reference. The full
packs stay here so new icons can still be picked without re-downloading anything.

## Cutting a release

From a checkout that has both branches:

```sh
# 1. bump APP_VERSION in app-data/version.js on main, commit, push
# 2. then, from this branch's tools:
tools/make-release.sh v1.0.8 --notes "What changed." --dry-run   # look first
tools/make-release.sh v1.0.8 --notes "What changed."
```

It builds both zips from the git refs — never from the working tree, so a real
trainer `.json` sitting in the folder cannot end up in a release — and refuses to
publish when the tag and `APP_VERSION` disagree. That check exists because
v1.0.4, v1.0.6 and v1.0.7 each shipped a version string one behind their own tag,
which told everyone who downloaded them that an update was permanently available.

## Adding an equipment icon

1. Find the SVG in the full pack here.
2. Add its entry to `app-data/equip-icons-db.js` (colour) or
   `equip-icons-mono-db.js` (monochrome) **on `main`**.
3. Run `tools/sync-icons.sh /path/to/main/checkout`.

The script copies in exactly what the catalogues name and deletes anything they
no longer do, so `main`'s packs are always exactly the referenced set.

## Rebuilding the data bundles

`app-data/build/scripts/build_moves_db.py` and `build_pokedex_db.py` compile
`v3.0/` (plus `Homebrew/Items/`) into `moves-db.js`, `pokedex-db.js`,
`abilities-db.js` and `items-db.js`.

Their paths are stale — they were written for an older flat layout and still
compute `REPO_ROOT` as the parent of `scripts/`, expecting `images/` and the
output bundles beside it. Fix `REPO_ROOT`, the image path and the output path
before running either, and write the results to `main`'s `app-data/`.

## Working with both branches at once

```sh
git worktree add ../pds-dev dev-data
```

gives you this branch in a sibling folder while `main` stays checked out where it
is. `main` also gitignores `app-data/build/`, so the raw dataset can simply be
copied into place there without cluttering `git status`.
