/* The colour tables the whole app themes itself from.

   Lifted verbatim out of the inline script — the values are hand-tuned and the
   comments record why, so both travel together. Nothing here is derived at
   build time; `applyTheme` in theme.ts does the deriving. */

export interface ThemeVars { [cssVar: string]: string }

export interface ThemeDef {
    label?: string;
    icon?: string;
    swatch?: string;
    /** Colours the combat attribute pills; social pills keep their pastels. */
    combat?: string;
    /** Flips the root .light-theme class so dark-assuming borders adapt. */
    light?: boolean;
    vars: ThemeVars;
}

export const typeColors: Record<string, string> = {
    Normal: '#9ca3af',
    Fire: '#f97316',
    Water: '#3b82f6',
    Electric: '#facc15',
    Grass: '#22c55e',
    Ice: '#22d3ee',
    Fighting: '#ef4444',
    Poison: '#c026d3',
    Ground: '#d97706',
    Flying: '#93c5fd',
    Psychic: '#ec4899',
    Bug: '#84cc16',
    Rock: '#b45309',
    Ghost: '#a855f7',
    Dragon: '#6366f1',
    Dark: '#6b7280',
    Steel: '#94a3b8',
    Fairy: '#f9a8d4'
};

export const TYPE_ICONS: Record<string, string> = {
    Normal: 'fa-circle', Fire: 'fa-fire', Water: 'fa-droplet', Electric: 'fa-bolt',
    Grass: 'fa-leaf', Ice: 'fa-snowflake', Fighting: 'fa-hand-fist', Poison: 'fa-skull-crossbones',
    Ground: 'fa-mountain', Flying: 'fa-dove', Psychic: 'fa-eye', Bug: 'fa-bug',
    Rock: 'fa-gem', Ghost: 'fa-ghost', Dragon: 'fa-dragon', Dark: 'fa-circle-half-stroke',
    Steel: 'fa-shield-halved', Fairy: 'fa-wand-magic-sparkles'
};

/* Named themes that don't derive from a single type color. Both License
   themes mirror the official printed sheet: crimson-red bars with teal
   combat pills. Dark uses neutral warm-charcoal panels; Light uses
   near-white panels (and sets `light` so pills/dividers adapt).
   `vars` overrides the CSS palette directly; `combat` colors the combat
   attribute pills (social pills keep their pastels). The key 'License'
   is kept for the dark theme so previously saved sheets still resolve. */
export const CUSTOM_THEMES: Record<string, ThemeDef> = {
    License: {
        label: 'Dark License',
        icon: 'fa-moon',
        swatch: '#c8383b',
        combat: '#3aa593',
        vars: {
            '--ghost-color': '#c8383b',
            '--ghost-color-glow': '#c8383b59',
            '--border-color': '#c8383b3a',
            '--border-glow': '#c8383b1e',
            '--primary-soft': '#c8383b33',
            '--primary-faint': '#c8383b10',
            '--accent': '#e0645c',
            '--accent-glow': '#e0645c4c',
            '--accent-faint': '#e0645c26',
            '--accent-soft': '#e0645c14',
            '--accent-border': '#e0645c40',
            '--trained-color': '#e0645c',
            '--trained-glow': '#e0645c4c',
            '--text-primary': '#f4efef',
            '--text-secondary': '#c8b4b4',
            '--text-muted': '#8a7c7c',
            '--bg-color': '#161514',
            '--bg-top': '#231d1e',
            '--card-bg': '#2b2928b0',
            '--panel-strong': '#302e2df7',
            '--panel-medium': '#302e2dec',
            '--panel-soft': '#302e2dd9',
            '--panel-solid': '#302e2d'
        }
    },
    LicenseLight: {
        label: 'Light License',
        icon: 'fa-sun',
        swatch: '#c0272b',
        combat: '#2f9384',
        light: true,
        vars: {
            '--ghost-color': '#c0272b',
            '--ghost-color-glow': '#c0272b4a',
            '--border-color': '#c0272b42',
            '--border-glow': '#c0272b1a',
            '--primary-soft': '#c0272b30',
            '--primary-faint': '#c0272b14',
            '--accent': '#cf3b39',
            '--accent-glow': '#cf3b3944',
            '--accent-faint': '#cf3b3926',
            '--accent-soft': '#cf3b3914',
            '--accent-border': '#cf3b3940',
            '--trained-color': '#cf3b39',
            '--trained-glow': '#cf3b3944',
            '--text-primary': '#2a2020',
            '--text-secondary': '#785454',
            '--text-muted': '#9a8585',
            '--bg-color': '#ddd2ca',
            '--bg-top': '#ebe0d9',
            '--card-bg': '#fdfbf9f7',
            '--panel-strong': '#fdfbf9fa',
            '--panel-medium': '#fdfbf9f2',
            '--panel-soft': '#fdfbf9ec',
            '--panel-solid': '#fdfbf9'
        }
    }
};

/* A few Pokémon-type themes share such similar gray type colors that the
   plain c1-derivation makes them near-identical. These give the three
   grays their own character while still living in the type picker:
   Normal a mid graphite, Steel a luminous cool slate, Dark a deep
   near-black. All three are dark pages that follow the same convention
   as the other fifteen types — one dominant shade through the borders,
   bars and headings, the rose heart and the accent star on the pools —
   and use the alphas applyTheme() derives with. Only the base colors
   are hand-picked, to pull the three apart. */
export const TYPE_THEME_OVERRIDES: Record<string, ThemeDef> = {
    /* Graphite: the palest of the three grays in its chrome, on the
       mid-tone page that keeps it clear of Dark's near-black below and
       Steel's blue slate above. Neutral on purpose — those two hold the
       blue end, and plain is the type. No `combat`, so the attribute
       pills take typeColors.Normal exactly as a derived theme does. */
    Normal: {
        vars: {
            '--ghost-color': '#b3b8bd',
            '--ghost-color-glow': '#b3b8bd66',
            '--border-color': '#b3b8bd40',
            '--border-glow': '#b3b8bd26',
            '--primary-soft': '#b3b8bd33',
            '--primary-faint': '#b3b8bd0d',
            '--accent': '#d2d6da',
            '--accent-glow': '#d2d6da4c',
            '--accent-faint': '#d2d6da26',
            '--accent-soft': '#d2d6da14',
            '--accent-border': '#d2d6da40',
            '--trained-color': '#e3e6e8',
            '--trained-glow': '#e3e6e84c',
            '--text-primary': '#f5f6f7',
            '--text-secondary': '#c6cacd',
            '--text-muted': '#868b8f',
            '--bg-color': '#141618',
            '--bg-top': '#212427',
            '--card-bg': '#2a2e31b2',
            '--panel-strong': '#2a2e31f2',
            '--panel-medium': '#2a2e31e6',
            '--panel-soft': '#2a2e31cc',
            '--panel-solid': '#2a2e31'
        }
    },
    Steel: {
        combat: '#9fb4c8',
        vars: {
            '--ghost-color': '#aab6c6',
            '--ghost-color-glow': '#aab6c659',
            '--border-color': '#aab6c645',
            '--border-glow': '#aab6c622',
            '--primary-soft': '#aab6c636',
            '--primary-faint': '#aab6c614',
            '--accent': '#c2ccd8',
            '--accent-glow': '#c2ccd84c',
            '--accent-faint': '#c2ccd826',
            '--accent-soft': '#c2ccd818',
            '--accent-border': '#c2ccd84a',
            '--trained-color': '#c2ccd8',
            '--trained-glow': '#c2ccd84c',
            '--text-primary': '#f2f5f8',
            '--text-secondary': '#c0c9d4',
            '--text-muted': '#8390a0',
            '--bg-color': '#20262e',
            '--bg-top': '#2c3540',
            '--card-bg': '#333d49b8',
            '--panel-strong': '#38424ff2',
            '--panel-medium': '#38424fe8',
            '--panel-soft': '#38424fd4',
            '--panel-solid': '#38424f'
        }
    },
    Dark: {
        combat: '#8b93a1',
        vars: {
            '--ghost-color': '#7d8694',
            '--ghost-color-glow': '#7d869459',
            '--border-color': '#7d86943a',
            '--border-glow': '#7d86941e',
            '--primary-soft': '#7d869433',
            '--primary-faint': '#7d869410',
            '--accent': '#9aa3b2',
            '--accent-glow': '#9aa3b24c',
            '--accent-faint': '#9aa3b226',
            '--accent-soft': '#9aa3b214',
            '--accent-border': '#9aa3b240',
            '--trained-color': '#9aa3b2',
            '--trained-glow': '#9aa3b24c',
            '--text-primary': '#eef0f3',
            '--text-secondary': '#a9afb9',
            '--text-muted': '#6d7481',
            '--bg-color': '#0c0d10',
            '--bg-top': '#16181d',
            '--card-bg': '#1b1d22b0',
            '--panel-strong': '#1e2126f7',
            '--panel-medium': '#1e2126ec',
            '--panel-soft': '#1e2126d9',
            '--panel-solid': '#1e2126'
        }
    }
};

/* Types whose derived accent is already distinct enough that the plain
   lightened variant reads better than a hue rotation. */
export const ACCENT_TRAINED_TYPES = ['Electric', 'Fire', 'Flying', 'Ground', 'Water'];
