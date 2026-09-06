import { mixHex, distinctVariant } from './color';
import {
    ACCENT_TRAINED_TYPES, CUSTOM_THEMES, TYPE_THEME_OVERRIDES, typeColors,
} from './themeTables';
import type { ThemeDef, ThemeVars } from './themeTables';

export function themeConfig(type: string): ThemeDef | null {
    return CUSTOM_THEMES[type] || TYPE_THEME_OVERRIDES[type] || null;
}

/** The CSS custom properties a theme resolves to — hand-tuned when the theme
    has its own table, derived from the single type colour otherwise. */
export function themeVars(type: string): ThemeVars {
    const custom = themeConfig(type);
    if (custom) return custom.vars;

    const c1 = typeColors[type] || '#ef4444';
    const c2 = mixHex(c1, '#ffffff', 0.4);
    const trained = ACCENT_TRAINED_TYPES.includes(type) ? c2 : distinctVariant(c1);
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

/** Paint a theme onto the document. Called from a layout effect so the page
    never renders a frame with the previous palette still on it. */
export function applyTheme(type: string): void {
    const root = document.documentElement.style;
    Object.entries(themeVars(type)).forEach(([k, v]) => root.setProperty(k, v));
    const custom = themeConfig(type);
    /* Light themes flip a root class so the dark-assuming hairline borders
       (and pill rendering) switch to light-appropriate values. */
    document.documentElement.classList.toggle('light-theme', !!(custom && custom.light));
    /* Named, not derived from "custom and not light": Steel, Dark and Normal are
       dark themes too, and they keep the themed pool fills. The light one is
       named to match rather than reusing .light-theme, so the crimson bars and
       the License pool pair stay tied to the License itself and cannot leak
       into a light elemental theme. */
    document.documentElement.classList.toggle('dark-license', type === 'License');
    document.documentElement.classList.toggle('light-license', type === 'LicenseLight');
}

export function isLightTheme(type: string): boolean {
    const custom = themeConfig(type);
    return !!(custom && custom.light);
}

/* typeColors is tuned for a dark page. Painted straight onto a light panel the
   pale entries all but vanish — Steel and Normal land around 2:1, Flying /
   Fairy / Ice / Electric nearer 1.5:1 — so any border or glyph drawn in the raw
   type colour disappears. On the light themes, ink them halfway to black
   instead. `onDark` is what the colour should stay while the page is dark. */
export function typeInk(themeType: string, c: string, onDark?: string): string {
    return isLightTheme(themeType) ? mixHex(c, '#000000', 0.5) : (onDark || c);
}
