import { mixHex, distinctVariant } from '../lib/color';
import { ACCENT_TRAINED_TYPES, CUSTOM_THEMES, typeColors } from '../lib/themeTables';
import type { ThemeDef, ThemeVars } from '../lib/themeTables';
import type { PokedexEntry } from '../data/types';
import type { CardSheet } from './types';

/* The card themes itself from the loaded Pokémon's typing: the primary type
   drives the palette, the other type becomes the accent (a single-type Pokémon
   gets a lighter tint of its own colour instead). A named theme overrides all
   of that.

   It shares the trainer sheet's colour tables. The card's own copy carried two
   extra entries, Typeless and Varies, both '#e5e7eb' — which is exactly the
   fallback every `typeColors[...]` lookup here already applies, so dropping them
   changes nothing. It also lacked the `combat` key, which only the licence's
   attribute pills read. */

export interface ThemeTypes { primary: string; secondary: string | null }

export function currentThemeTypes(p: PokedexEntry, sheet: CardSheet): ThemeTypes {
    const types = [p.Type1, p.Type2].filter(Boolean);
    const primary = types.includes(sheet.themeType) ? sheet.themeType : types[0];
    return { primary, secondary: types.find((t) => t !== primary) || null };
}

/** The named theme in force, or null when the page is themed from the typing. */
export function themeConfig(sheet: CardSheet): ThemeDef | null {
    return CUSTOM_THEMES[sheet.pageTheme] || null;
}

export function isLightTheme(sheet: CardSheet): boolean {
    const custom = themeConfig(sheet);
    return !!(custom && custom.light);
}

/* typeColors is tuned for a dark page. Painted straight onto a light panel the
   pale entries all but vanish — Steel and Normal land around 2:1, Flying /
   Fairy / Ice / Electric nearer 1.5:1 — so any border or glyph drawn in the raw
   type colour disappears. On the light theme, ink them halfway to black
   instead. `onDark` is what the colour should stay while the page is dark. */
export function typeInk(sheet: CardSheet, c: string, onDark?: string): string {
    return isLightTheme(sheet) ? mixHex(c, '#000000', 0.5) : (onDark || c);
}

/** The ailment and weather band labels sit on a wash of the tile's own colour:
    lightened to read on a dark tile, darkened on a light one. */
export function ailInk(sheet: CardSheet, c: string): string {
    return isLightTheme(sheet) ? mixHex(c, '#000000', 0.35) : mixHex(c, '#ffffff', 0.44);
}

export function cardThemeVars(p: PokedexEntry, sheet: CardSheet): ThemeVars {
    const custom = themeConfig(sheet);
    if (custom) return custom.vars;

    const { primary, secondary } = currentThemeTypes(p, sheet);
    const c1 = typeColors[primary] || '#a855f7';
    const c2 = secondary ? (typeColors[secondary] || c1) : mixHex(c1, '#ffffff', 0.4);
    /* Types whose hue-shifted trained colour clashes use the accent (the
       willpower bar colour) instead. */
    const trained = (secondary || ACCENT_TRAINED_TYPES.includes(primary))
        ? c2 : distinctVariant(c1);
    const panel = mixHex(c1, '#000000', 0.87);
    return {
        '--ghost-color': c1,
        '--ghost-color-glow': c1 + '66',
        '--border-color': c1 + '40',
        '--border-glow': c1 + '26',
        '--primary-soft': c1 + '33',
        '--primary-faint': c1 + '0d',
        '--accent': c2,
        '--accent-glow': c2 + '4c',
        '--accent-faint': c2 + '26',
        '--accent-soft': c2 + '14',
        '--accent-border': c2 + '40',
        '--trained-color': trained,
        '--trained-glow': trained + '4c',
        '--text-primary': mixHex(c1, '#ffffff', 0.88),
        '--text-secondary': mixHex(c1, '#ffffff', 0.5),
        '--text-muted': mixHex(c1, '#000000', 0.3),
        '--bg-color': mixHex(c1, '#000000', 0.93),
        '--bg-top': mixHex(c2, '#000000', 0.82),
        '--card-bg': panel + 'b2',
        '--panel-strong': panel + 'f2',
        '--panel-medium': panel + 'e6',
        '--panel-soft': panel + 'cc',
        '--panel-solid': panel,
    };
}

/** Recolour the whole page. */
export function applyCardTheme(p: PokedexEntry, sheet: CardSheet): void {
    const root = document.documentElement.style;
    Object.entries(cardThemeVars(p, sheet)).forEach(([k, v]) => root.setProperty(k, v));
    const custom = themeConfig(sheet);
    /* Light themes flip a root class so the white-alpha hairlines and the
       near-black wells switch to their light-appropriate values */
    const light = !!(custom && custom.light);
    document.documentElement.classList.toggle('light-theme', light);
    /* The Dark License is the one theme whose panels sit dark enough that the
       quick-move boxes' #ffffff0a hairline disappears; the Pain box's edge is
       drawn differently there. See .pain-quick.on */
    document.documentElement.classList.toggle('dark-license', !!custom && !light);
}
