/* The ailment popover's text and cure rolls, compared against the original.

   Both are quoted at the player as rules, so a drifted number is worse than a
   drifted layout: it would be read and acted on. The reference text is
   whitespace-normalised before comparing, because it is injected as HTML where
   runs of space collapse, and the template literals are indented differently in
   a .ts module than they were inside the page's <script>. */
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

const names = ['ailmentText', 'ailmentRoll', 'ailmentDamage'];
const legacySrc = `
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
const ported = await load(`export * from './ailmentText.ts';\nexport * from './combat.ts';`, 'ts');

const KEYS = ['burn1', 'burn2', 'burn3', 'paralysis', 'poison', 'badlyPoison',
    'frozen', 'sleep', 'confusion', 'flinch', 'inLove', 'nonsense'];

/* Stand-in subjects: `value` is the only thing either function reads off a ref,
   so a table of pools covers every branch without building real sheets. */
const POOLS = [
    {},
    { Dexterity: 3, Athletic: 2, Insight: 4, Loyalty: 5 },
    { Dexterity: 0, Athletic: 0, Insight: 0, Loyalty: 0 },
    { Insight: 5, Loyalty: 5 },
    { Insight: 6, Loyalty: 1 },
    { Insight: 1, Loyalty: 6 },
];
const KINDS = ['trainer', 'mon', 'wild', 'custom'];

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

let checked = 0, bad = 0;
for (const pools of POOLS) {
    for (const kind of KINDS) {
        const ref = { kind, name: 'Subject', token: 't:0', value: (n) => pools[n] || 0 };
        for (const key of KEYS) {
            for (const damage of [0, 1, 3, 7, 12]) {
                checked++;
                const a = legacy.ailmentText(ref, key, damage);
                const b = ported.ailmentText(ref, key, damage);
                const same = (!a && !b) || (a && b
                    && norm(a.effect) === norm(b.effect)
                    && norm(a.treatment) === norm(b.treatment)
                    && norm(a.duration) === norm(b.duration));
                if (!same) { bad++; if (bad < 8) console.log(`MISMATCH ailmentText ${key} dmg=${damage}`); }
            }
            checked++;
            const ra = JSON.stringify(legacy.ailmentRoll(ref, key));
            const rb = JSON.stringify(ported.ailmentRoll(ref, key));
            if (ra !== rb) { bad++; if (bad < 8) console.log(`MISMATCH ailmentRoll ${key}: ${ra} vs ${rb}`); }
        }
    }
}

/* The climbing ailments' per-Round damage, which the popover quotes. */
for (const key of KEYS) {
    for (let elapsed = 0; elapsed < 12; elapsed++) {
        checked++;
        const a = legacy.ailmentDamage(key, elapsed);
        const b = ported.ailmentDamage(key, elapsed);
        if (a !== b) { bad++; if (bad < 8) console.log(`MISMATCH ailmentDamage ${key} @${elapsed}: ${a} vs ${b}`); }
    }
}

console.log(`${checked} comparisons, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
