/* The type chart and the ability immunity table, compared entry by entry
   against the original page, plus every effectiveness read-out the card can
   produce for any species. */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const CARD = readFileSync(ROOT + '/legacy/pokemon-card.html', 'utf8');

function decl(name) {
    const start = CARD.indexOf('const ' + name + ' = ');
    const open = CARD.indexOf(name.startsWith('ALL_') ? '[' : '{', start);
    const [o, c] = name.startsWith('ALL_') ? ['[', ']'] : ['{', '}'];
    let depth = 0;
    for (let i = open; i < CARD.length; i++) {
        if (CARD[i] === o) depth++;
        else if (CARD[i] === c && --depth === 0) return CARD.slice(start, i + 1) + ';';
    }
    throw new Error('unterminated ' + name);
}

const names = ['ALL_TYPES', 'TYPE_CHART', 'ABILITY_IMMUNITIES'];
const legacySrc = names.map(decl).join('\n') + `
    export function legacyBuckets(defTypes, abilityName) {
        const abilityImmune = ABILITY_IMMUNITIES[(abilityName || '').toLowerCase()] || [];
        const buckets = { '4': [], '2': [], '1': [], '0.5': [], '0.25': [], '0': [] };
        ALL_TYPES.forEach(attacker => {
            let mult = 1;
            defTypes.forEach(defender => {
                const value = (TYPE_CHART[attacker] || {})[defender];
                mult *= value !== undefined ? value : 1;
            });
            if (abilityImmune.includes(attacker)) mult = 0;
            buckets[String(mult)].push(attacker);
        });
        return buckets;
    }
    export { ${names.join(', ')} };`;

async function load(contents, loader = 'js') {
    const out = await build({
        stdin: { contents, loader, resolveDir: ROOT + '/src/card' },
        bundle: true, write: false, format: 'esm',
    });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const legacy = await load(legacySrc);
const ported = await load(`export * from './typeChart.ts';`, 'ts');

let bad = 0;
for (const n of names) {
    if (JSON.stringify(legacy[n]) !== JSON.stringify(ported[n])) { bad++; console.log('MISMATCH table ' + n); }
    else console.log('ok table ' + n);
}

const src = readFileSync(ROOT + '/PDS React Develop/app-data/pokedex-db.js', 'utf8');
const w = {}; new Function('window', src)(w);

let checked = 0;
const abilityNames = ['', ...Object.keys(legacy.ABILITY_IMMUNITIES)];
for (const p of w.ALL_POKEMON) {
    const defTypes = [p.Type1, p.Type2].filter(Boolean);
    for (const ab of abilityNames) {
        checked++;
        const a = JSON.stringify(legacy.legacyBuckets(defTypes, ab));
        const b = JSON.stringify(ported.computeTypeEffectiveness(defTypes, ab));
        if (a !== b) { bad++; if (bad < 6) console.log(`MISMATCH ${p.Name} / ${ab || 'no ability'}`); }
    }
}
console.log(`${checked} effectiveness read-outs compared, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
