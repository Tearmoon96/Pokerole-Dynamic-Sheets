# Architecture

How the app is put together, and where to find each piece.

The repository holds the app in two sibling folders, with the sources and
tooling that produce them alongside. None of the tooling ships.

```
Pokerole Dynamic Sheets React/
├── PDS React Develop/    ← the app, tracked. Copy it anywhere and it runs.
├── PDS React Deploy/     ← generated + gitignored. The clean copy Pages publishes.
├── src/                  ← TypeScript + React sources
├── scripts/              ← build driver, deploy assembler, verification harnesses
├── legacy/               ← the three original inline-HTML pages, kept as reference
├── public/               ← copied verbatim into the build (PWA icons, index.html)
├── worker/               ← the rolling table's relay. Deployed separately, not to Pages.
├── .github/workflows/    ← the GitHub Pages deployment
├── vite.config.ts        ← build and dev-server configuration
├── tsconfig*.json        ← three configs: solution, app, node-side tooling
└── package.json
```

**Develop is the working copy; Deploy is what goes on the web.** Develop may
hold real trainer sheets, personal photos and rulebook PDFs — all gitignored.
Deploy is assembled from an allowlist, so none of that can reach the site, and
it is wiped and rebuilt on every `npm run deploy`; never edit it by hand.

## The stack

| Layer | Choice |
|---|---|
| UI | React 18 |
| Language | TypeScript 5.7, `strict`, `verbatimModuleSyntax`, `noUnusedLocals` |
| Build | Vite 6, multi-page, one pass per page |
| Offline / install | `vite-plugin-pwa` 0.21 (`generateSW`), Workbox runtime caching |
| Styling | Plain CSS, no preprocessor and no CSS-in-JS |
| State | `useSyncExternalStore` over a mutable store |
| Persistence | File System Access API, `localStorage`, IndexedDB |
| Tests | No test runner — see [Verification](#verification) |

No component library, no router, no state-management dependency. Runtime
dependencies are React and React DOM, and nothing else.

## How it runs

Four independent pages, not a single-page app. Each is its own entry, its own
bundle, and its own browser tab:

| Page | What it is |
|---|---|
| `trainer-license.html` | The trainer sheet: stats, skills, team, PC storage, bag, equipment |
| `pokemon-card.html` | One Pokémon's card — a team member, a boxed one, or a wild |
| `gm-screen.html` | The GM board: roster, combat tracker, dice, NPC names, notes |
| `rolling-table.html` | A shared dice table. The only page that needs the network — see [The rolling table](#the-rolling-table) |

They are linked by a shared working set in `localStorage` under
`pokerole_working`. The license writes it; the card reads the Pokémon it was
asked for out of it, edits in place, and writes back; the GM screen watches it
and redraws. So clicking a team slot opens a card in a new tab
([`src/lib/navigation.ts`](src/lib/navigation.ts)) and whatever changes there
lands back in the trainer's file. The GM screen keeps its own board state under
`pokerole_gm_screen`.

Because the pages are separate documents, `localStorage` is the only channel
between them — plus a one-second poll, since the `storage` event is not
guaranteed between `file://` documents. That is deliberate and is commented at
[`src/components/gm/GmApp.tsx`](src/components/gm/GmApp.tsx).

**Files on disk.** The app never uploads anything. "Open working folder" uses
the File System Access API to get a directory handle; the handle is kept in
IndexedDB ([`src/state/idb.ts`](src/state/idb.ts)) so the folder is remembered
between sessions, because a handle is structured-cloneable but cannot go in
`localStorage`. Trainers are plain `.json` files, and "Save All" writes them
straight back. Chromium browsers support this; Firefox and Safari can open files
but not save.

**Game data.** `PDS React Develop/app-data/` holds the Pokédex, moves, abilities, items,
natures, sprite framing and the two equipment icon catalogues as pre-built
`window.X = [...]` scripts, plus ~330 MB of sprites. They are injected as classic
scripts at boot ([`src/data/loadAppData.ts`](src/data/loadAppData.ts)) rather
than imported, so Vite never parses or bundles them. One line in each page shell
(`window.DATA_BASE`) says where the folder is.

## Where each piece lives

### `src/` — the sources

| Path | What is in it |
|---|---|
| `src/pages/` | The three HTML shells. ~1.2 KB each: a `<div id="root">`, a script tag, and the `DATA_BASE` line |
| `src/main/` | One entry per page — mounts React and wires the providers |
| `src/components/license/` | Trainer sheet UI (30 files) |
| `src/components/card/` | Pokémon card UI (21 files) |
| `src/components/gm/` | GM screen UI (14 files) |
| `src/components/table/` | Rolling table UI |
| `src/components/common/` | Shared widgets — toast, modal, pickers, sprites |
| `src/state/` | Trainer sheet store, working set, trainer file I/O, PC boxes, IndexedDB |
| `src/card/` | Card logic: pools, moves, evolution, type chart, weather, ailments, wild import |
| `src/gm/` | GM logic: entities and tokens, combat, ailments, dice, names, session files, folders |
| `src/table/` | Rolling table: crypto, identity, protocol, validation, transport, session |
| `src/data/` | Loading `app-data/`, and the context that serves it to components |
| `src/lib/` | Cross-page helpers: themes, sprites, colour, gear, file system, manuals, update check, device class, touch reordering |
| `src/hooks/` | Small React hooks — theme, document title, drag ghosts, name fitting |
| `src/styles/` | All CSS, split by page (`license/`, `card/`, `gm/`, `shared/`), plus `responsive/` — the phone and tablet layer |
| `src/pwa/` | Service-worker registration |

### `PDS React Develop/` — the app

| Path | What it is |
|---|---|
| `*.html` + `assets/` | The three built pages and their bundles |
| `app-data/` | Game database and sprites |
| `Trainers and Pokemons/` | The working folder — trainer `.json`, wild exports, custom images |
| `Pokerole Core Book/` | Where the rulebook PDFs go; the sheet's manual button opens them |
| `manifest.webmanifest`, `sw.js`, `workbox-*.js`, `pwa-icon-*.png` | PWA install and offline support |
| `README.md`, `LICENSE`, `NOTICE` | `NOTICE` is required: the monochrome icon pack is CC BY 3.0 and names its artists |

### `scripts/` — tooling

| Script | What it does |
|---|---|
| `build.mjs` | Runs Vite once per page, then publishes the result into `PDS React Develop/` |
| `compare-ui.sh` | Screenshots every view of both the original and the React build and counts differing pixels |
| `build-compare-pages.mjs` | Seeds both pages with identical data and drives them to a given view |
| `make-seed.mjs` | Builds that seed — a populated trainer and a populated GM board |
| `static-server.mjs` | Serves the comparison pages over HTTP |
| `verify-*.mjs` | Nine harnesses comparing ported logic against the original functions |

`.verify/responsive-audit.mjs` (gitignored) is the phone and tablet counterpart:
it drives each page at four viewport sizes and reports horizontal overflow,
content clipped away by `overflow: hidden`, controls too small to hit, and
fields that would trigger the iOS zoom.

## The rolling table

The one feature that cannot work from a `file://` page, and the only one with a
service behind it. Everything else in the app is local by design; a shared lobby
needs two browsers on two machines to agree on something, and GitHub Pages
serves files and runs no code.

`worker/` holds that service: a Cloudflare Worker with one Durable Object per
lobby, doing nothing but copying opaque messages between the sockets in a room.
It is deployed on its own (`wrangler deploy`), never to Pages, and
`worker/README.md` is the setup and local-testing guide.

**The relay cannot read a table.** Clients derive an AES-GCM key and a room
address from the lobby id and the password; the relay is told the address and
nothing else. Every payload is encrypted and signed before it leaves the
browser.

**Authority is cryptographic, not conventional.** The host rolls every die —
players send a request and the host publishes the result — and the lobby id *is*
the fingerprint of the host's signing key. So `sender === lobbyId` is a check any
client can make from the id it was given, with no trust-on-first-use step. A
player who patches their client to publish a result produces a message every
other browser drops.

Dice come from [`src/gm/dice.ts`](src/gm/dice.ts), unchanged and unforked, so a
shared table and the solo GM board cannot drift on what a die does. Receivers
recompute a roll's total and successes from its faces rather than trusting the
summary — which is also why a GM's scripted roll fabricates real faces that add
up to the intended outcome instead of asserting a number.

## Phones and tablets

The three original pages were built for a window that could spare 60px of
padding at the top and 1240px across. They are also, increasingly, opened on a
phone at the table. `src/styles/responsive/` adapts them without a second
layout to maintain.

Everything keys off two attributes that [`src/lib/device.ts`](src/lib/device.ts)
stamps on `<html>` before React mounts:

| Attribute | Values | Answers |
|---|---|---|
| `data-device` | `phone` ≤640px · `tablet` ≤1180px · `desktop` | how much room there is |
| `data-pointer` | `coarse` · `fine` | what is doing the pointing |
| `data-orient` | `portrait` · `landscape` | which way up |

Splitting size from pointer is the point. A desktop window dragged narrow
should stack like a phone — that is a size question — but must **not** grow
finger-sized buttons, because the mouse is still a mouse. Keying both off one
breakpoint is why so many sites turn chunky when you resize them.

| File | Scope |
|---|---|
| `responsive/base.css` | All four pages: safe-area insets, the 16px input floor, touch hit areas |
| `responsive/sheets.css` | Trainer's License and Pokémon card |
| `responsive/gm.css` | GM screen, including the phone tab bar |
| `responsive/table.css` | Rolling table |

Three things it fixes that no amount of narrowing does on its own:

- **iOS zoom-on-focus.** Safari zooms the page in when a field with a font
  under 16px takes focus and never zooms back out. It is a property of the font
  size alone, and the fix is a 16px floor — not `maximum-scale=1`, which takes
  pinch-zoom away from people who need it.
- **Touch drag-and-drop.** HTML5 `draggable` never fires from a finger, so the
  GM board's panels, the card's move list and the PC storage boxes were inert
  on every phone and tablet. [`src/lib/touchDrag.ts`](src/lib/touchDrag.ts) adds
  a long-press route into the same `onReorder` the native path uses.
- **The GM board.** Five 390px panels side by side is right on a 10.5" tablet
  and wrong on a 412px phone, where four of them sit off-screen with nothing to
  say so. On a phone the board becomes one panel behind a tab bar
  ([`src/gm/phoneBoard.ts`](src/gm/phoneBoard.ts)); panels stay mounted and
  hidden so none loses its scroll position or a half-typed field.

## The store pattern

The original pages kept one mutable global and called a render function after
changing it. That shape is preserved rather than rewritten into reducers: the
editing logic ported across unchanged, and React subscribes through
`useSyncExternalStore` instead of the page calling `renderAll()` by hand. Each
store is a plain object plus a version counter; `store.update(fn)` mutates and
bumps it. See [`src/state/store.ts`](src/state/store.ts),
[`src/card/store.ts`](src/card/store.ts), [`src/gm/store.ts`](src/gm/store.ts).

Re-rendering the whole tree on every keystroke is well within budget — the pages
this replaces rebuilt entire panels with `innerHTML` on each one.

## The build

```sh
npm install
npm run dev      # dev server; pages at /trainer-license.html
npm run build    # writes the three pages and assets/ into PDS React Develop/
npm run deploy   # builds, then assembles + audits PDS React Deploy/
```

`npm run build` runs Vite **once per page** and emits a **classic script**, not an
ES module. Both are forced by the same requirement: the app is opened by
double-clicking the `.html`, and a browser refuses to load an ES module over
`file://` on CORS grounds. A classic script has no such restriction, but Rollup
will not code-split an `iife` — hence one self-contained bundle per page, and
hence one pass each. A build plugin in [`vite.config.ts`](vite.config.ts) then
flattens the emitted path, rewrites the relative URLs, and swaps `type="module"`
for `defer` (a classic script is not deferred, so without it React would run
before `#root` exists).

`dist-pwa/` is only the staging folder the build assembles in. The product is
`PDS React Develop/`.

In dev, `/trainer-license.html` is rewritten onto `src/pages/trainer-license.html`,
so the dev server shows live sources rather than the built file sitting in
`PDS React Develop/`.

## Publishing

`.github/workflows/deploy-pages.yml` runs on every push to `main`: `npm ci`,
`npm run verify`, then `npm run deploy`, and uploads `PDS React Deploy/` as the
Pages artifact. The repo's Pages **Source must be set to "GitHub Actions"**.

`scripts/make-deploy.mjs` copies by allowlist rather than copy-then-delete, so
anything new in the develop folder is excluded until it is named. It then
re-audits the finished folder and exits non-zero — deleting the output — if it
finds a PDF, a trainer `.json`, anything under `Custom Images/`, or
`app-data/build/`. A leak fails the workflow instead of reaching the web.

Two behaviours differ once hosted, both keyed off `isHostedOrigin()` in
[`src/data/paths.ts`](src/data/paths.ts): the update check goes silent, because
the service worker already fetches the new version on the next load; and the
manual buttons explain that the Core Book PDF is not part of the site instead of
opening a 404 tab. The comparison harness serves over http, so it sets
`window.__PDS_ASSUME_DISK__` on both pages to keep comparing like with like.

There is deliberately no `.nojekyll`: the Actions path never runs Jekyll, and
`upload-pages-artifact` drops dotfiles unless `include-hidden-files` is set, so
the file would vanish from the upload without a word.

## Verification

There is no test runner. Two harnesses stand in for one, both measuring the port
against `legacy/`, which holds the three original pages.

```sh
npm run verify       # logic: ~214k comparisons against the original functions
npm run compare-ui   # pixels: 22 views, original vs React
```

`verify` slices the original functions out of the legacy HTML with esbuild and
runs them beside the ported modules on the same inputs — pool maths, move totals,
the type chart, theme derivation, generated names, ailment text and cure rolls.

`compare-ui` seeds both versions with the same trainer and GM board, drives each
to a given view (opening dialogs, hovering a flag), screenshots both in headless
Chrome and counts differing pixels. Sprite compositing is not bit-for-bit
reproducible between runs, so each view measures its own noise floor by shooting
the original twice; a real regression measures in the tens of thousands of pixels
against a floor in the hundreds.

Both need only Node. `compare-ui` also wants Chrome and ImageMagick.
