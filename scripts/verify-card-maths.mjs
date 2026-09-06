/* The card's dice-pool maths, computed by the original inline code and by the
   ported modules, compared move by move over several sheets.

   The original is sliced out of the HTML by name rather than copied, so this
   cannot drift: if a function moves or changes there, the slice changes with it.

   Usage: node scripts/verify-card-maths.mjs <repo root> */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const HTML = readFileSync(ROOT + '/legacy/pokemon-card.html', 'utf8');

/** Slice one `function name(...) { ... }` out of the page by brace matching. */
function fn(name) {
    const start = HTML.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('function not found: ' + name);
    let i = HTML.indexOf('{', start), depth = 0;
    for (; i < HTML.length; i++) {
        if (HTML[i] === '{') depth++;
        else if (HTML[i] === '}' && --depth === 0) return HTML.slice(start, i + 1);
    }
    throw new Error('unterminated: ' + name);
}

const legacySrc = `
    let sheetState, pokemonData, defaultStats;
    export function setup(s, p, d) { sheetState = s; pokemonData = p; defaultStats = d; }
    ${['getStatBase', 'getStatMax', 'derivedPoolMax', 'getPoolMax', 'defenceValue',
       'resolvePoolValue', 'resolvePoolString', 'formatPoolTotal', 'painPenalty',
       'moveAccuracyPenalty', 'applyMoveOverrides', 'computeMoveTotals'].map(fn).join('\n')}
    export { computeMoveTotals, resolvePoolString, getPoolMax, defenceValue, painPenalty, applyMoveOverrides };
`;

async function load(contents, loader = 'js', resolveDir = ROOT + '/src/card') {
    const out = await build({
        stdin: { contents, loader, resolveDir }, bundle: true, write: false, format: 'esm',
    });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const legacy = await load(legacySrc);
const ported = await load(`
    export { computeMoveTotals, applyMoveOverrides } from './moves.ts';
    export { getPoolMax, defenceValue, painPenalty, resolvePoolString } from './pools.ts';
    export { defaultCardSheet, defaultStats } from './defaults.ts';
`, 'ts');

const db = (f, g) => { const src = readFileSync(ROOT + '/PDS React Develop/app-data/' + f, 'utf8'); const w = {}; new Function('window', src)(w); return w[g]; };
const ALL_POKEMON = db('pokedex-db.js', 'ALL_POKEMON');
const ALL_MOVES = db('moves-db.js', 'ALL_MOVES');

/* A handful of species, each with a sheet exercising trained stats, skills,
   specialties, categories, offsets and a wounded pool. */
const SPECIES = ['Pikachu', 'Charizard', 'Gengar', 'Blissey', 'Egg', 'Shuckle'];

function sheetFor(p, variant) {
    const s = ported.defaultCardSheet(p);
    if (variant === 0) return s;
    s.trainedStats = { strength: 2, dexterity: 1, vitality: 3, special: 2, insight: 1, tough: 2, clever: 1 };
    s.skills = { ...s.skills, brawl: 3, channel: 2, clash: 4, evasion: 1, alert: 2, nature: 5, medicine: 3, etiquette: 2 };
    s.categoryRatings = { fight: 2, survival: 3, social: 1, knowledge: 4 };
    s.specialties = [{ name: 'Thunder Wrangling', value: 3 }, { name: 'Baking', value: 1 }];
    s.defBonus = 2; s.spDefBonus = -1;
    s.hpMaxBonus = variant > 1 ? 3 : 0;
    s.willMaxBonus = variant > 1 ? -1 : 0;
    s.customBaseStats = variant > 2 ? { strength: 4 } : {};
    s.customMaxStats = variant > 2 ? { strength: 6 } : {};
    /* Wound the Pokémon so the pain flag is exercised at both thresholds. */
    if (variant === 2) s.hp = 1;
    if (variant === 3) s.hp = Math.max(1, Math.floor(ported.getPoolMax({ pokemon: p, sheet: s }, 'hp') / 2));
    s.moveOverrides = variant > 1 ? {
        Tackle: { acc1: 'Dexterity', acc2: 'Brawl', power: 3, accOffset: -1, powOffset: 2 },
        Thunderbolt: { damage: 'Special + Channel', target: 'Foe', effect: 'Rewritten.', ailment: 'Paralysis' },
    } : {};
    return s;
}

let checked = 0, bad = 0;
for (const name of SPECIES) {
    const p = ALL_POKEMON.find((x) => x.Name === name);
    if (!p) { console.log('missing species ' + name); bad++; continue; }
    for (let variant = 0; variant < 4; variant++) {
        const sheet = sheetFor(p, variant);
        const src = { pokemon: p, sheet };
        legacy.setup(sheet, { pokemon: p, moves: ALL_MOVES }, ported.defaultStats(p));

        for (const key of ['hp', 'will']) {
            checked++;
            if (legacy.getPoolMax(key) !== ported.getPoolMax(src, key)) {
                bad++; console.log(`MISMATCH ${name} v${variant} poolMax ${key}`);
            }
        }
        for (const key of ['def', 'spDef']) {
            checked++;
            const a = JSON.stringify(legacy.defenceValue(key));
            const b = JSON.stringify(ported.defenceValue(src, key));
            if (a !== b) { bad++; console.log(`MISMATCH ${name} v${variant} defence ${key}: ${a} vs ${b}`); }
        }
        checked++;
        if (legacy.painPenalty() !== ported.painPenalty(src)) {
            bad++; console.log(`MISMATCH ${name} v${variant} painPenalty`);
        }

        /* Every move this species learns, plus a fixed spread of others. */
        const learned = (p.Moves || []).map((m) => m.Name);
        const extra = ['Tackle', 'Thunderbolt', 'Swords Dance', 'Hyper Beam', 'Head Smash',
            'Triple Axel', 'Bleakwind Storm', 'Charm', 'Rest', 'Sing'];
        const names = [...new Set([...learned, ...extra])];
        for (const mn of names) {
            const base = ALL_MOVES.find((m) => m.Name === mn);
            if (!base) continue;
            checked++;
            const a = JSON.stringify(legacy.computeMoveTotals(legacy.applyMoveOverrides(base)));
            const b = JSON.stringify(ported.computeMoveTotals(src, ported.applyMoveOverrides(sheet, base)));
            if (a !== b) { bad++; console.log(`MISMATCH ${name} v${variant} move ${mn}\n  legacy ${a}\n  ported ${b}`); }
        }
    }
}
console.log(`${checked} comparisons, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
