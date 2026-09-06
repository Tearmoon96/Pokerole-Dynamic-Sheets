/* The card's reference tables — weather, environments and the ailment text —
   compared against the original.
   The original array literals carry stray commas, so they are sparse; the port
   drops the holes, which map and filter skipped anyway. */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const CARD = readFileSync(ROOT + '/legacy/pokemon-card.html', 'utf8');

function decl(name) {
    const start = CARD.indexOf('const ' + name + ' = ');
    const open = CARD.indexOf('[', start);
    let depth = 0;
    for (let i = open; i < CARD.length; i++) {
        if (CARD[i] === '[') depth++;
        else if (CARD[i] === ']' && --depth === 0) return CARD.slice(start, i + 1) + ';';
    }
    throw new Error('unterminated ' + name);
}

async function load(contents, loader = 'js') {
    const out = await build({
        stdin: { contents, loader, resolveDir: ROOT + '/src/card' },
        bundle: true, write: false, format: 'esm',
    });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const names = ['WEATHER_CONDITIONS', 'ENVIRONMENTS', 'WEATHER_TABS'];
const legacy = await load(names.map(decl).join('\n') + `\nexport { ${names.join(', ')} };`);
const ported = await load(`export * from './weather.ts';`, 'ts');

/* Every one of these strings is injected as HTML, where a run of whitespace
   collapses to a single space — so the indentation inside the template literals
   is not part of the rendered text. The port is dedented one level by having
   moved out of the inline script; compare on the collapsed text. */
const collapse = (v) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim()
    : Array.isArray(v) ? v.map(collapse)
    : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, collapse(x)]))
    : v;

let bad = 0;
for (const n of names) {
    /* filter(Boolean) is what the holes amount to once map/filter have run. */
    const a = JSON.stringify(collapse(legacy[n].filter(Boolean)));
    const b = JSON.stringify(collapse(ported[n]));
    if (a !== b) {
        bad++;
        console.log('MISMATCH ' + n);
        const la = collapse(legacy[n].filter(Boolean)), lb = collapse(ported[n]);
        for (let i = 0; i < Math.max(la.length, lb.length); i++) {
            const x = JSON.stringify(la[i]), y = JSON.stringify(lb[i]);
            if (x === y) continue;
            console.log('  index ' + i + ':');
            const ka = Object.keys(la[i] || {}), kb = Object.keys(lb[i] || {});
            for (const k of new Set([...ka, ...kb])) {
                if (JSON.stringify((la[i] || {})[k]) !== JSON.stringify((lb[i] || {})[k])) {
                    console.log('    ' + k + ':\n      legacy: ' + JSON.stringify((la[i] || {})[k]) + '\n      ported: ' + JSON.stringify((lb[i] || {})[k]));
                }
            }
            break;
        }
    } else console.log('ok ' + n + '  (' + ported[n].length + ' entries)');
}
/* The ailment text interpolates the sheet's own dice numbers, so it is compared
   as a function of a stat source rather than as a constant. */
const legacyAil = await load(`
    let sheetState, pokemonData, defaultStats;
    export function setup(s, p, d) { sheetState = s; pokemonData = p; defaultStats = d; }
    ${['getStatBase', 'getPoolMax', 'derivedPoolMax', 'resolvePoolValue', 'resolvePoolString', 'formatPoolTotal'].map(fnSrc).join('\n')}
    ${ailmentTextBody()}
    export { legacyAilmentText };
`);
const portedAil = await load(`
    export { ailmentText } from './ailmentText.ts';
    export { defaultCardSheet, defaultStats } from './defaults.ts';
`, 'ts');

function fnSrc(name) {
    const start = CARD.indexOf('function ' + name + '(');
    let i = CARD.indexOf('{', start), depth = 0;
    for (; i < CARD.length; i++) {
        if (CARD[i] === '{') depth++;
        else if (CARD[i] === '}' && --depth === 0) return CARD.slice(start, i + 1);
    }
    throw new Error('unterminated ' + name);
}

function ailmentTextBody() {
    const lines = CARD.split("\n").slice(9109, 9219).join("\n");
    return 'function legacyAilmentText() {\n' + lines + '\n return text; }';
}

const dexSrc = readFileSync(ROOT + '/PDS React Develop/app-data/pokedex-db.js', 'utf8');
const wnd = {}; new Function('window', dexSrc)(wnd);
let ailChecked = 0;
for (const name of ['Pikachu', 'Blissey', 'Shuckle']) {
    const p = wnd.ALL_POKEMON.find((x) => x.Name === name);
    const sheet = portedAil.defaultCardSheet(p);
    sheet.trainedStats = { dexterity: 2, insight: 3 };
    sheet.skills = { ...sheet.skills, athletic: 4 };
    sheet.loyalty = 4;
    legacyAil.setup(sheet, { pokemon: p }, portedAil.defaultStats(p));
    const a = collapse(legacyAil.legacyAilmentText());
    const b = collapse(portedAil.ailmentText({ pokemon: p, sheet }));
    ailChecked += Object.keys(b).length;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        bad++;
        console.log('MISMATCH ailmentText for ' + name);
        for (const k of Object.keys(b)) {
            if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log('  -> ' + k);
        }
    }
}
console.log('ok ailmentText  (' + ailChecked + ' entries across 3 sheets)');

process.exit(bad ? 1 : 0);
