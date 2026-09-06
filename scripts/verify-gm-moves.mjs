/* The GM screen's move totals — including STAB and the type-boosting items the
   card leaves to the player — compared against the original page. */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const GM = readFileSync(ROOT + '/legacy/gm-screen.html', 'utf8');

function fn(name) {
    const start = GM.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('not found: ' + name);
    let i = GM.indexOf('{', start), depth = 0;
    for (; i < GM.length; i++) {
        if (GM[i] === '{') depth++;
        else if (GM[i] === '}' && --depth === 0) return GM.slice(start, i + 1);
    }
    throw new Error('unterminated: ' + name);
}

const names = ['statBase', 'monStat', 'monPoolMax', 'resolvePoolValue', 'resolvePoolString',
    'formatPoolTotal', 'sameType', 'isStab', 'typeBoost', 'itemByName', 'damageBonuses',
    'moveAccuracyPenalty', 'applyMoveOverrides', 'computeMoveTotals', 'painPenalty'];

const legacySrc = `
    const COMBAT_STATS = ['strength', 'dexterity', 'vitality', 'special', 'insight'];
    const SOCIAL_STATS = ['tough', 'cool', 'beauty', 'cute', 'clever'];
    const VAGUE_TYPES = ['', 'typeless', 'varies', 'any', 'none'];
    const PLATE_RE = /adds? (\\d+) damage dic?e? to (\\w+)[- ]type moves/i;
    let ALL_ITEMS;
    export function setItems(v) { ALL_ITEMS = v; }
    ${names.map(fn).join('\n')}
    export { computeMoveTotals, painPenalty, isStab, damageBonuses, applyMoveOverrides };`;

async function load(contents, loader = 'js') {
    const out = await build({
        stdin: { contents, loader, resolveDir: ROOT + '/src/gm' },
        bundle: true, write: false, format: 'esm',
    });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const legacy = await load(legacySrc);
const ported = await load(`export * from './moves.ts';`, 'ts');

const db = (f, g) => { const src = readFileSync(ROOT + '/PDS React Develop/app-data/' + f, 'utf8'); const w = {}; new Function('window', src)(w); return w[g]; };
const ALL_POKEMON = db('pokedex-db.js', 'ALL_POKEMON');
const ALL_MOVES = db('moves-db.js', 'ALL_MOVES');
const ALL_ITEMS = db('items-db.js', 'ALL_ITEMS');
legacy.setItems(ALL_ITEMS);

const itemByName = (name) => {
    if (!name) return null;
    const want = String(name).trim().toLowerCase();
    if (!want) return null;
    return ALL_ITEMS.find((i) => String(i.Name || '').trim().toLowerCase() === want) || null;
};

/* Every type-boosting item, so the plate/orb parsing is exercised end to end. */
const BOOSTERS = ALL_ITEMS.filter((i) => i.Category === 'TypeBoosting').map((i) => i.Name);
const HELD = ['', 'Oran Berry', 'Leftovers', ...BOOSTERS];

const SHEETS = [
    {},
    { trainedStats: { strength: 2, special: 3, dexterity: 1 }, skills: { brawl: 2, clash: 3 } },
    { moveOverrides: { Tackle: { acc1: 'Dexterity', power: 4, accOffset: -1, powOffset: 2 } },
      trainedStats: { insight: 2 }, hp: 3 },
];

const SPECIES = ['Pikachu', 'Charizard', 'Dialga', 'Arceus', 'Gengar', 'Blissey'];
let checked = 0, bad = 0;

for (const name of SPECIES) {
    const dex = ALL_POKEMON.find((p) => p.Name === name);
    if (!dex) continue;
    for (const base of SHEETS) {
        for (const held of HELD) {
            const sheet = { ...base, heldItem: held };
            checked++;
            if (legacy.painPenalty(dex, sheet) !== ported.painPenalty(dex, sheet)) {
                bad++; console.log('MISMATCH painPenalty ' + name);
            }
            /* This species' learnset plus a fixed spread of others. */
            const learned = (dex.Moves || []).map((m) => m.Name);
            const extra = ['Tackle', 'Thunderbolt', 'Flamethrower', 'Judgment', 'Roar of Time',
                'Swords Dance', 'Head Smash', 'Shadow Ball'];
            for (const mn of [...new Set([...learned, ...extra])]) {
                const move = ALL_MOVES.find((m) => m.Name === mn);
                if (!move) continue;
                checked++;
                const a = JSON.stringify(legacy.computeMoveTotals(dex, sheet,
                    legacy.applyMoveOverrides(sheet, move)));
                const b = JSON.stringify(ported.computeMoveTotals(dex, sheet,
                    ported.applyMoveOverrides(sheet, move), itemByName));
                if (a !== b) {
                    bad++;
                    if (bad < 6) console.log(`MISMATCH ${name} / ${held || 'no item'} / ${mn}\n  ${a}\n  ${b}`);
                }
            }
        }
    }
}
console.log(`${checked} comparisons, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
