/* Does the Pokémon card use the same colour tables as the trainer sheet?
   If so the port can share one module; if not it must keep its own copy. */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const CARD = readFileSync(ROOT + '/legacy/pokemon-card.html', 'utf8');

function decl(name, src) {
    const start = src.indexOf('const ' + name + ' = ');
    if (start < 0) throw new Error('not found: ' + name);
    let i = src.indexOf('{', start), depth = 0;
    if (src[src.indexOf('=', start) + 2] === '[') {           // array literal
        i = src.indexOf('[', start);
        for (; i < src.length; i++) {
            if (src[i] === '[') depth++;
            else if (src[i] === ']' && --depth === 0) return src.slice(start, i + 1) + ';';
        }
    }
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1) + ';';
    }
    throw new Error('unterminated: ' + name);
}

const names = ['typeColors', 'TYPE_ICONS', 'CUSTOM_THEMES', 'ACCENT_TRAINED_TYPES'];
const cardSrc = names.map((n) => decl(n, CARD)).join('\n')
    + `\nexport { ${names.join(', ')} };`;

async function load(contents, loader = 'js') {
    const out = await build({
        stdin: { contents, loader, resolveDir: ROOT + '/src/lib' },
        bundle: true, write: false, format: 'esm',
    });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const card = await load(cardSrc);
const shared = await load(`export * from './themeTables.ts';`, 'ts');

let bad = 0;
for (const n of names) {
    const a = JSON.stringify(card[n]), b = JSON.stringify(shared[n]);
    if (a === b) { console.log('same  ' + n); continue; }
    bad++;
    console.log('DIFFERS ' + n);
    const ca = card[n], sh = shared[n];
    if (ca && typeof ca === 'object' && !Array.isArray(ca)) {
        for (const k of new Set([...Object.keys(ca), ...Object.keys(sh)])) {
            const x = ca[k], y = sh[k];
            if (JSON.stringify(x) === JSON.stringify(y)) continue;
            if (x && typeof x === 'object') {
                for (const k2 of new Set([...Object.keys(x), ...Object.keys(y || {})])) {
                    if (JSON.stringify(x[k2]) !== JSON.stringify((y || {})[k2])) {
                        console.log(`   -> ${k}.${k2}: card=${JSON.stringify(x[k2])} licence=${JSON.stringify((y || {})[k2])}`);
                    }
                }
            } else {
                console.log(`   -> ${k}: card=${JSON.stringify(x)} licence=${JSON.stringify(y)}`);
            }
        }
    }
}
console.log(bad ? bad + ' table(s) differ - the card needs its own copy' : 'all tables identical');
