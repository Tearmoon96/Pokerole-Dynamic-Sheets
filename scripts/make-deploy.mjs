/* Assembles "PDS React Deploy/" — the copy that goes on the web.

   The develop folder is a working folder: real trainer sheets, personal photos,
   whatever PDFs the author dropped in, the raw dataset. None of that may ever
   reach a public site, and some of it is not ours to hand out at all.

   So this copies by ALLOWLIST, never by copy-then-delete. Anything that appears
   in the develop folder later — a new folder, a stray export, a backup — is
   excluded by default and has to be named here to be published. The audit at the
   bottom then re-checks the finished folder and refuses to leave a bad one on
   disk, so a mistake in the list above cannot quietly ship. */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'PDS React Develop');
const OUT = join(ROOT, 'PDS React Deploy');

/* Files copied as-is from the top of the develop folder. The four pages plus
   index.html are the app; NOTICE is not optional — the monochrome icon pack is
   CC BY 3.0 and that file carries its attribution. */
const TOP_FILES = [
    'index.html', 'trainer-license.html', 'pokemon-card.html', 'gm-screen.html',
    'rolling-table.html',
    'manifest.webmanifest', 'sw.js',
    'pwa-icon-192.png', 'pwa-icon-512.png',
    'README.md', 'LICENSE', 'NOTICE',
];

/* Copied whole. assets/ is the built bundles; app-data/ gets its own filter. */
const TOP_DIRS = ['assets'];

/* Kept from the two user-data folders: the instructions that explain what the
   folder is for, and nothing else. The folders themselves are the reader's, on
   their own disk — these are here to document the shape. */
const SCAFFOLD_DIRS = ['Trainers and Pokemons', 'Pokerole Core Book'];
const SCAFFOLD_KEEP = /^Instructions\.txt$/i;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

const say = (m) => console.log(m);

if (!existsSync(SRC)) {
    console.error('No "PDS React Develop/" folder — run `npm run build` first.');
    process.exit(1);
}

/* Always build, so a deploy can never publish yesterday's bundles. */
say('building…');
execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit', cwd: ROOT });

say('assembling PDS React Deploy/…');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const f of TOP_FILES) {
    const from = join(SRC, f);
    if (!existsSync(from)) {
        console.error('missing from the build: ' + f);
        process.exit(1);
    }
    cpSync(from, join(OUT, f));
}

/* Workbox emits its runtime beside sw.js under a content hash, so it cannot be
   named literally above. */
for (const f of readdirSync(SRC)) {
    if (/^workbox-[-\w]+\.js$/.test(f)) cpSync(join(SRC, f), join(OUT, f));
}

for (const d of TOP_DIRS) {
    cpSync(join(SRC, d), join(OUT, d), { recursive: true });
}

/* app-data: everything except the raw dataset and the odd non-image file that
   rides along in the sprite folders (a spreadsheet, a readme) and would
   otherwise be published for no reason. */
cpSync(join(SRC, 'app-data'), join(OUT, 'app-data'), {
    recursive: true,
    filter: (from) => {
        const rel = relative(join(SRC, 'app-data'), from);
        if (!rel) return true;
        const parts = rel.split(sep);
        if (parts[0] === 'build') return false;
        if (statSync(from).isDirectory()) return true;
        if (parts[0] === 'images') return IMAGE_EXT.test(rel);
        return true;
    },
});

for (const d of SCAFFOLD_DIRS) {
    const from = join(SRC, d);
    if (!existsSync(from)) continue;
    mkdirSync(join(OUT, d), { recursive: true });
    for (const f of readdirSync(from)) {
        if (SCAFFOLD_KEEP.test(f)) cpSync(join(from, f), join(OUT, d, f));
    }
}

/* No .nojekyll on purpose. The Actions deployment never runs Jekyll — the
   workflow IS the build — so it would buy nothing, and it would not survive
   anyway: upload-pages-artifact excludes dotfiles unless include-hidden-files
   is set, so the file would be dropped from the upload without a word. If the
   Pages source is ever switched to a branch, add both together. */

// ---------------------------------------------------------------- the audit

/* Re-read what was actually produced. The list above is a statement of intent;
   this is the check that it came true. */
const all = [];
(function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else all.push(relative(OUT, full).split(sep).join('/'));
    }
})(OUT);

const FORBIDDEN = [
    [/\.pdf$/i, 'a PDF — the Core Book is not ours to redistribute'],
    [/^Trainers and Pokemons\/.*\.json$/i, 'a trainer sheet (personal data)'],
    [/^Trainers and Pokemons\/Custom Images\//i, 'a custom image (personal data)'],
    [/^app-data\/build\//, 'the raw dataset (not needed to run the app)'],
    [/\.xlsx?$/i, 'a spreadsheet'],
];

const bad = [];
for (const f of all) {
    for (const [re, why] of FORBIDDEN) {
        if (re.test(f)) bad.push('  ' + f + '  — ' + why);
    }
}

if (bad.length) {
    console.error('\nREFUSING TO DEPLOY. These would have been published:\n' + bad.join('\n'));
    rmSync(OUT, { recursive: true, force: true });
    process.exit(1);
}

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
const bytes = all.reduce((a, f) => a + statSync(join(OUT, f)).size, 0);
say('\nPDS React Deploy/ — ' + all.length + ' files, ' + mb(bytes));
say('audit passed: no PDFs, no trainer sheets, no personal images, no raw dataset.');
