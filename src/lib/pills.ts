import { themeConfig } from './theme';
import { typeColors } from './themeTables';

/* The five social attributes keep their own pastels whatever the page theme
   is; the combat five follow the theme. */
export const SOCIAL_PILL_COLORS: Record<string, string> = {
    tough: '#facc15',
    cool: '#fb923c',
    beauty: '#60a5fa',
    cute: '#f9a8d4',
    clever: '#a3e635',
};

export function pillColor(key: string, themeType: string): string {
    if (SOCIAL_PILL_COLORS[key]) return SOCIAL_PILL_COLORS[key];
    const custom = themeConfig(themeType);
    if (custom && custom.combat) return custom.combat;
    return typeColors[themeType] || '#ef4444';
}

export const COMBAT_STATS = ['strength', 'dexterity', 'vitality', 'special', 'insight'] as const;
export const SOCIAL_STATS = ['tough', 'cool', 'beauty', 'cute', 'clever'] as const;

export const STAT_LABELS: Record<string, string> = {
    strength: 'Strength', dexterity: 'Dexterity', vitality: 'Vitality',
    special: 'Special', insight: 'Insight',
    tough: 'Tough', cool: 'Cool', beauty: 'Beauty', cute: 'Cute', clever: 'Clever',
};

/* The skills tower, in the order it is drawn. Two labels differ from their
   storage key on purpose — "Throw" is stored as `channel` and "Etiquette" as
   `charm`, so trainer .json files written before the rename still load. */
export const SKILL_GROUPS: { label: string; skills: { key: string; label: string }[] }[] = [
    {
        label: 'Fight', skills: [
            { key: 'brawl', label: 'Brawl' },
            { key: 'channel', label: 'Throw' },
            { key: 'clash', label: 'Clash' },
            { key: 'evasion', label: 'Evasion' },
        ],
    },
    {
        label: 'Survival', skills: [
            { key: 'alert', label: 'Alert' },
            { key: 'athletic', label: 'Athletic' },
            { key: 'nature', label: 'Nature' },
            { key: 'stealth', label: 'Stealth' },
        ],
    },
    {
        label: 'Social', skills: [
            { key: 'charm', label: 'Etiquette' },
            { key: 'empathy', label: 'Empathy' },
            { key: 'intimidate', label: 'Intimidate' },
            { key: 'perform', label: 'Perform' },
        ],
    },
    {
        label: 'Knowledge', skills: [
            { key: 'craft', label: 'Craft' },
            { key: 'lore', label: 'Lore' },
            { key: 'medicine', label: 'Medicine' },
            { key: 'science', label: 'Science' },
        ],
    },
];
