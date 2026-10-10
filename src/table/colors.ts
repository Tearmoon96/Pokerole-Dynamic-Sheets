/* Each person at the table picks a colour on joining, so the table can tell
   at a glance who did what: their name in the member list, their rolls in the
   feed, their portraits on the turn strip and their characters' copies in the
   GM screen's combat tracker all wear it.

   It travels as an index into this list — a number the validator can bound —
   never as a colour string someone could fill with CSS. */

export const PLAYER_COLORS: readonly { hex: string; name: string }[] = [
    { hex: '#ef4444', name: 'Red' },
    { hex: '#f97316', name: 'Orange' },
    { hex: '#f59e0b', name: 'Amber' },
    { hex: '#eab308', name: 'Yellow' },
    { hex: '#84cc16', name: 'Lime' },
    { hex: '#22c55e', name: 'Green' },
    { hex: '#10b981', name: 'Emerald' },
    { hex: '#14b8a6', name: 'Teal' },
    { hex: '#06b6d4', name: 'Cyan' },
    { hex: '#0ea5e9', name: 'Sky' },
    { hex: '#3b82f6', name: 'Blue' },
    { hex: '#6366f1', name: 'Indigo' },
    { hex: '#8b5cf6', name: 'Violet' },
    { hex: '#d946ef', name: 'Fuchsia' },
    { hex: '#ec4899', name: 'Pink' },
];

export const MAX_COLOR = PLAYER_COLORS.length - 1;

/** Teal: what the copies wore before anyone chose. */
export const DEFAULT_COLOR = 7;

const KEY = 'pokerole_table_color';

export function colorHex(index: number | undefined | null): string {
    return (PLAYER_COLORS[index ?? DEFAULT_COLOR] || PLAYER_COLORS[DEFAULT_COLOR]).hex;
}

/** The custom properties a coloured element reads (`--who`, and two
    see-through mixes of it for fills and borders). */
export function colorVars(index: number | undefined | null): Record<string, string> {
    const hex = colorHex(index);
    return { '--who': hex, '--who-faint': hex + '24', '--who-border': hex + '99' };
}

export function savedColor(): number {
    try {
        const v = parseInt(localStorage.getItem(KEY) || '', 10);
        return Number.isInteger(v) && v >= 0 && v <= MAX_COLOR ? v : DEFAULT_COLOR;
    } catch {
        return DEFAULT_COLOR;
    }
}

export function saveColor(index: number): void {
    try { localStorage.setItem(KEY, String(index)); } catch { /* private mode */ }
}

/** The same colour for the GM screen's copies, whose stylesheet reads
    `--pc-color` and friends (gm/base.css holds the teal default). */
export function pcColorVars(index: number | undefined | null): Record<string, string> | undefined {
    if (index === undefined || index === null || !PLAYER_COLORS[index]) return undefined;
    const hex = PLAYER_COLORS[index].hex;
    return { '--pc-color': hex, '--pc-faint': hex + '1f', '--pc-border': hex + '80' };
}
