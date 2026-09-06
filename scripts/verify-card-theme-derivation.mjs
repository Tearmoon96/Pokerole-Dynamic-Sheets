/* Every species and both named themes, derived by the original inline code and
   by the ported module, compared variable by variable. */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = process.argv[2];
const CARD = readFileSync(ROOT + '/legacy/pokemon-card.html', 'utf8');

function slice(open, close, from) {
    let i = CARD.indexOf(open, from), depth = 0, start = i;
    for (; i < CARD.length; i++) {
        if (CARD[i] === '{') depth++;
        else if (CARD[i] === '}' && --depth === 0) return CARD.slice(start, i + 1);
    }
    throw new Error('unterminated ' + open);
}
const decl = (n) => slice('const ' + n + ' = ', '}', 0) + ';';
function fn(name) {
    const start = CARD.indexOf('function ' + name + '(');
    let i = CARD.indexOf('{', start), depth = 0;
    for (; i < CARD.length; i++) {
        if (CARD[i] === '{') depth++;
        else if (CARD[i] === '}' && --depth === 0) return CARD.slice(start, i + 1);
    }
    throw new Error('unterminated ' + name);
}

const legacySrc = `
    let sheetState, pokemonData;
    export function setup(s, p) { sheetState = s; pokemonData = p; }
    ${decl('typeColors')}
    ${decl('CUSTOM_THEMES')}
    const ACCENT_TRAINED_TYPES = ['Electric', 'Fire', 'Flying', 'Ground', 'Water'];
    ${['mixHex', 'hexToHsl', 'hslToHex', 'distinctVariant', 'currentThemeTypes', 'themeConfig'].map(fn).join('\n')}
    export function legacyVars() {
        const custom = themeConfig();
        if (custom) return custom.vars;
        const { primary, secondary } = currentThemeTypes();
        const c1 = typeColors[primary] || '#a855f7';
        const c2 = secondary ? (typeColors[secondary] || c1) : mixHex(c1, '#ffffff', 0.4);
        const trained = (secondary || ACCENT_TRAINED_TYPES.includes(primary)) ? c2 : distinctVariant(c1);
        const panel = mixHex(c1, '#000000', 0.87);
        return {'--ghost-color':c1,'--ghost-color-glow':c1+'66','--border-color':c1+'40','--border-glow':c1+'26',
         '--primary-soft':c1+'33','--primary-faint':c1+'0d','--accent':c2,'--accent-glow':c2+'4c',
         '--accent-faint':c2+'26','--accent-soft':c2+'14','--accent-border':c2+'40','--trained-color':trained,
         '--trained-glow':trained+'4c','--text-primary':mixHex(c1,'#ffffff',0.88),
         '--text-secondary':mixHex(c1,'#ffffff',0.5),'--text-muted':mixHex(c1,'#000000',0.3),
         '--bg-color':mixHex(c1,'#000000',0.93),'--bg-top':mixHex(c2,'#000000',0.82),
         '--card-bg':panel+'b2','--panel-strong':panel+'f2','--panel-medium':panel+'e6',
         '--panel-soft':panel+'cc','--panel-solid':panel};
    }
`;

async function load(contents, loader = 'js', dir = ROOT + '/src/card') {
    const out = await build({ stdin: { contents, loader, resolveDir: dir }, bundle: true, write: false, format: 'esm' });
    return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const legacy = await load(legacySrc);
const ported = await load(`
    export { cardThemeVars } from './theme.ts';
    export { defaultCardSheet } from './defaults.ts';
`, 'ts');

const src = readFileSync(ROOT + '/PDS React Develop/app-data/pokedex-db.js', 'utf8');
const w = {}; new Function('window', src)(w);
const ALL_POKEMON = w.ALL_POKEMON;

let checked = 0, bad = 0, species = 0;
for (const p of ALL_POKEMON) {
    species++;
    /* Default sheet, the other typing selected, and each named theme. */
    const variants = [
        {},
        { themeType: p.Type2 || p.Type1 },
        { pageTheme: 'License' },
        { pageTheme: 'LicenseLight' },
    ];
    for (const v of variants) {
        const sheet = { ...ported.defaultCardSheet(p), ...v };
        legacy.setup(sheet, { pokemon: p });
        const a = legacy.legacyVars();
        const b = ported.cardThemeVars(p, sheet);
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            checked++;
            if (a[k] !== b[k]) {
                bad++;
                if (bad < 10) console.log(`MISMATCH ${p.Name} ${JSON.stringify(v)} ${k}: ${a[k]} vs ${b[k]}`);
            }
        }
    }
}
console.log(`${species} species x 4 variants, ${checked} variables compared, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
