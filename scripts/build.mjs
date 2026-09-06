/* Builds the three pages and puts them where the app is opened from.

   One Vite pass per page, because each bundle has to be a classic script:
   Rollup will not code-split an iife, and an ES module cannot be loaded from
   file:// at all. The pages are then copied into APP_DIR, next to app-data/ —
   that folder is the app as a user gets it, and dist-pwa/ is only the staging
   area the build assembles in. */
import { build } from 'vite';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist-pwa');
const APP = join(ROOT, 'PDS React Develop');
const PAGES = ['trainer-license', 'pokemon-card', 'gm-screen'];

for (const page of PAGES) {
    process.env.PAGE = page;
    await build({ configFile: join(ROOT, 'vite.config.ts') });
}

/* Everything the built pages need, copied into the app folder. assets/ is
   replaced wholesale so a rename never leaves last build's chunks behind. */
rmSync(join(APP, 'assets'), { recursive: true, force: true });
mkdirSync(join(APP, 'assets'), { recursive: true });
for (const name of readdirSync(OUT)) {
    const from = join(OUT, name);
    cpSync(from, join(APP, name), { recursive: statSync(from).isDirectory() });
}
console.log('\npages written to PDS React Develop/: ' + PAGES.map((p) => p + '.html').join(', '));
