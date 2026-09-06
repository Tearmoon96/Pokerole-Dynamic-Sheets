/* The NPC name generator's language banks, compared against the original, and
   the generator itself checked to produce the same names from the same random
   stream. */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const GM = readFileSync(ROOT + '/legacy/gm-screen.html', 'utf8');

function decl(name, open, close) {
    const start = GM.indexOf('const ' + name + ' = ');
    const from = GM.indexOf(open, start);
    let depth = 0;
    for (let i = from; i < GM.length; i++) {
        if (GM[i] === open) depth++;
        else if (GM[i] === close && --depth === 0) return GM.slice(start, i + 1) + ';';
    }
    throw new Error('unterminated ' + name);
}

function fn(name) {
    const start = GM.indexOf('function ' + name + '(');
    let i = GM.indexOf('{', start), depth = 0;
    for (; i < GM.length; i++) {
        if (GM[i] === '{') depth++;
        else if (GM[i] === '}' && --depth === 0) return GM.slice(start, i + 1);
    }
    throw new Error('unterminated ' + name);
}

const legacySrc = `
    const DEFAULT_NAME_OPTS = { region: 'Mixed', gender: 'any', letter: '', withNature: false };
    ${decl('LANGS', '{', '}')}
    ${decl('REGIONS', '{', '}')}
    ${decl('GENDERS', '[', ']')}
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    ${fn('startOptions')}
    ${fn('randomName')}
    export { LANGS, REGIONS, GENDERS, randomName };`;

async function load(contents, loader = 'js') {
    const out = await build({
        stdin: { contents, loader, resolveDir: ROOT + '/src/gm' },
        bundle: true, write: false, format: 'esm',
    });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const legacy = await load(legacySrc);
const ported = await load(`export * from './names.ts';`, 'ts');

let bad = 0;
for (const n of ['LANGS', 'REGIONS', 'GENDERS']) {
    if (JSON.stringify(legacy[n]) !== JSON.stringify(ported[n])) { bad++; console.log('MISMATCH ' + n); }
    else console.log('ok ' + n);
}

/* Same seed, same names: replace Math.random with a deterministic stream and
   run both generators over the same option grid. */
function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const REGION_KEYS = Object.keys(legacy.REGIONS);
const LETTERS = ['', 'a', 'k', 'z', 'q'];
let checked = 0;
for (const region of REGION_KEYS) {
    for (const gender of ['any', 'm', 'f', 'n']) {
        for (const letter of LETTERS) {
            for (let seed = 1; seed <= 12; seed++) {
                checked++;
                const opts = { region, gender, letter };
                const real = Math.random;
                Math.random = seeded(seed);
                const a = JSON.stringify(legacy.randomName(opts));
                Math.random = seeded(seed);
                const b = JSON.stringify(ported.randomName(opts));
                Math.random = real;
                if (a !== b) {
                    bad++;
                    if (bad < 6) console.log(`MISMATCH randomName ${region}/${gender}/"${letter}" seed ${seed}\n  ${a}\n  ${b}`);
                }
            }
        }
    }
}
console.log(`${checked} generated names compared, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
