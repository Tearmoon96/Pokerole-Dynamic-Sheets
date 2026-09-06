/* The GM screen's dice-pool maths, compared against the original page.

   The GM screen re-implements the card's pool functions with the sheet passed
   in, so this checks the port of THAT code — and, as a bonus, that the GM
   screen and the card still agree with each other. */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const GM = readFileSync(ROOT + '/legacy/gm-screen.html', 'utf8');

function fn(name, src) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('not found: ' + name);
    let i = src.indexOf('{', start), depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error('unterminated: ' + name);
}

const names = ['statBase', 'monStat', 'monPoolMax', 'trainerPoolMax', 'trainerPoolValue',
    'resolvePoolValue', 'resolvePoolString', 'formatPoolTotal'];
const legacySrc = `
    const COMBAT_STATS = ['strength', 'dexterity', 'vitality', 'special', 'insight'];
    const SOCIAL_STATS = ['tough', 'cool', 'beauty', 'cute', 'clever'];
    ${names.map((n) => fn(n, GM)).join('\n')}
    export { ${names.join(', ')} };`;

async function load(contents, loader = 'js') {
    const out = await build({
        stdin: { contents, loader, resolveDir: ROOT + '/src/gm' },
        bundle: true, write: false, format: 'esm',
    });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const legacy = await load(legacySrc);
const ported = await load(`export * from './pools.ts';`, 'ts');

const db = (f, g) => { const src = readFileSync(ROOT + '/PDS React Develop/app-data/' + f, 'utf8'); const w = {}; new Function('window', src)(w); return w[g]; };
const ALL_POKEMON = db('pokedex-db.js', 'ALL_POKEMON');
const ALL_MOVES = db('moves-db.js', 'ALL_MOVES');

const SHEETS = [
    {},
    { trainedStats: { strength: 2, vitality: 3, insight: 1, tough: 2 }, hpMaxBonus: 2, willMaxBonus: -1 },
    { customBaseStats: { strength: 5, tough: 3 }, skills: { brawl: 3, clash: 4, nature: 2 },
      categoryRatings: { fight: 2, knowledge: 4 }, specialties: [{ name: 'Sneaking', value: 3 }],
      loyalty: 4, happiness: 2, disobedience: 1 },
    { hpMax: 17, willMax: 9 },
];

const TRAINERS = [
    { stats: { vitality: 3, insight: 4, strength: 2 }, skills: { brawl: 2, alert: 5 }, extras: [{ name: 'Cooking', value: 3 }] },
    { stats: { vitality: 1, insight: 1 }, hpMax: 12, willMax: 8, skills: {}, extras: [] },
    { stats: { vitality: 5, insight: 2 }, hpMaxBonus: 3, willMaxBonus: 2, skills: { evasion: 1 }, extras: [] },
];

const TOKENS = ['Strength', 'Vitality', 'Insight', 'Tough', 'Clever', 'HP', 'Will', 'Willpower',
    'Loyalty', 'Happiness', 'Disobedience', 'brawl', 'clash', 'nature', 'fight', 'knowledge',
    'Sneaking', 'Nonsense', '', 'Tough/Cute', 'alert', 'Cooking'];

let checked = 0, bad = 0;
const species = ['Pikachu', 'Charizard', 'Blissey', 'Shuckle', 'Egg'].map((n) => ALL_POKEMON.find((p) => p.Name === n));

for (const dex of species) {
    for (const sheet of SHEETS) {
        for (const key of ['hp', 'will']) {
            checked++;
            if (legacy.monPoolMax(dex, sheet, key) !== ported.monPoolMax(dex, sheet, key)) {
                bad++; console.log(`MISMATCH monPoolMax ${dex.Name} ${key}`);
            }
        }
        for (const t of TOKENS) {
            checked++;
            const a = legacy.resolvePoolValue(dex, sheet, t);
            const b = ported.resolvePoolValue(dex, sheet, t);
            if (a !== b) { bad++; if (bad < 8) console.log(`MISMATCH resolvePoolValue ${dex.Name} "${t}": ${a} vs ${b}`); }
        }
        /* Every accuracy and damage string in the move list, resolved. */
        for (const m of ALL_MOVES) {
            for (const s of [m.Accuracy1, m.Accuracy2, m.Damage1, m.Damage2]) {
                if (!s) continue;
                checked++;
                const a = JSON.stringify(legacy.resolvePoolString(dex, sheet, s));
                const b = JSON.stringify(ported.resolvePoolString(dex, sheet, s));
                if (a !== b) { bad++; if (bad < 8) console.log(`MISMATCH resolvePoolString "${s}"`); }
            }
        }
    }
}

for (const t of TRAINERS) {
    for (const key of ['hp', 'will']) {
        checked++;
        if (legacy.trainerPoolMax(t, key) !== ported.trainerPoolMax(t, key)) {
            bad++; console.log('MISMATCH trainerPoolMax ' + key);
        }
    }
    for (const tok of TOKENS) {
        checked++;
        const a = legacy.trainerPoolValue(t, tok);
        const b = ported.trainerPoolValue(t, tok);
        if (a !== b) { bad++; if (bad < 8) console.log(`MISMATCH trainerPoolValue "${tok}": ${a} vs ${b}`); }
    }
}

console.log(`${checked} comparisons, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
