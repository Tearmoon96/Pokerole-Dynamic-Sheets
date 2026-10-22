/* Temporary combat offsets: what a move did to a character's numbers for the
   rest of a fight — Strength −1 from a Growl, Defense +2 from a Harden, an
   extra Evasion from a Double Team.

   They ride on the sheet itself (`combatMods`, on a Pokemon's card sheet and
   on a trainer's .json), so they reach every roll made from it, follow a
   reload and travel with a shared file. Nothing ever clears them on its own:
   the player or the GM does, from the stats popup, which is why everywhere a
   number they change is shown it is shown in their colour.

   A Pokemon's Defense and Sp. Defense are NOT in here: the card already kept
   those as `defBonus` / `spDefBonus`, and the popup edits those same two
   fields, so the card and the table can never disagree. A trainer has no such
   fields and keeps `def` / `spDef` in this object. `modsOfSheet` /
   `modsOfTrainer` read either shape into one. */

export const ATTR_MOD_KEYS = ['strength', 'dexterity', 'vitality', 'special', 'insight'] as const;
export const DICE_MOD_KEYS = ['accuracy', 'damage', 'evasion', 'clash', 'init'] as const;

export type AttrModKey = typeof ATTR_MOD_KEYS[number];
export type ModKey = AttrModKey | typeof DICE_MOD_KEYS[number]
    | 'def' | 'spDef' | 'crit' | 'extraEva' | 'extraClash';

export type CombatMods = Partial<Record<ModKey, number>>;

export const MOD_KEYS: readonly ModKey[] = [
    ...ATTR_MOD_KEYS, ...DICE_MOD_KEYS, 'def', 'spDef', 'crit', 'extraEva', 'extraClash',
];

/** Each offset's range. The card's own defence offsets stop at ±10, and so
    does everything else that adds or takes dice. A critical needs at least
    one success over the target, so 2 is the most the crit offset can take off
    the usual 3; Evasion and Clash go up to five a Round, one plus four. */
export const MOD_RANGE: Record<ModKey, [number, number]> = {
    strength: [-10, 10], dexterity: [-10, 10], vitality: [-10, 10], special: [-10, 10], insight: [-10, 10],
    accuracy: [-10, 10], damage: [-10, 10], evasion: [-10, 10], clash: [-10, 10], init: [-10, 10],
    def: [-10, 10], spDef: [-10, 10],
    crit: [0, 2],
    extraEva: [0, 4], extraClash: [0, 4],
};

export function clampMod(key: ModKey, v: number): number {
    const [lo, hi] = MOD_RANGE[key];
    return Math.max(lo, Math.min(hi, Math.round(v) || 0));
}

/** Only the known keys, in range, and only those that are not 0 — so a
    character with nothing on carries no field at all. */
export function normalizeMods(raw: unknown): CombatMods {
    const out: CombatMods = {};
    if (!raw || typeof raw !== 'object') return out;
    const rec = raw as Record<string, unknown>;
    for (const k of MOD_KEYS) {
        const v = rec[k];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        const n = clampMod(k, v);
        if (n) out[k] = n;
    }
    return out;
}

export function isEmptyMods(m: CombatMods | null | undefined): boolean {
    return !m || MOD_KEYS.every((k) => !m[k]);
}

export function modOf(m: CombatMods | null | undefined, key: ModKey): number {
    return (m && m[key]) || 0;
}

interface ModSheet { combatMods?: unknown; defBonus?: number; spDefBonus?: number }

/** A Pokemon's offsets, its two defence offsets included. */
export function modsOfSheet(sheet: ModSheet | null | undefined): CombatMods {
    if (!sheet) return {};
    const m = normalizeMods(sheet.combatMods);
    delete m.def; delete m.spDef;
    const def = clampMod('def', sheet.defBonus || 0), spDef = clampMod('spDef', sheet.spDefBonus || 0);
    if (def) m.def = def;
    if (spDef) m.spDef = spDef;
    return m;
}

export function modsOfTrainer(data: { combatMods?: unknown } | null | undefined): CombatMods {
    return normalizeMods(data && data.combatMods);
}

/** Writes `mods` onto a Pokemon's sheet: the two defences into the card's own
    fields, the rest into `combatMods` (dropped when empty). */
export function putSheetMods(sheet: Record<string, unknown>, mods: CombatMods): void {
    const m = normalizeMods(mods);
    sheet.defBonus = m.def || 0;
    sheet.spDefBonus = m.spDef || 0;
    delete m.def; delete m.spDef;
    if (isEmptyMods(m)) delete sheet.combatMods;
    else sheet.combatMods = m;
}

export function putTrainerMods(data: Record<string, unknown>, mods: CombatMods): void {
    const m = normalizeMods(mods);
    if (isEmptyMods(m)) delete data.combatMods;
    else data.combatMods = m;
}

/* The critical. An Accuracy roll is a critical hit at three successes over
   what the action needs; a move tagged High Critical needs two, and the crit
   offset takes up to two more off — never below one. A move that always
   crits (Frost Breath, Wicked Blow) has a margin of 0: every hit is one. A
   miss by three is a critical failure whatever the move: that margin is not
   this one. */
export const BASE_CRIT_MARGIN = 3;

interface CritMove { Attributes?: { HighCritical?: unknown; AlwaysCrit?: unknown;[key: string]: unknown } }

export function isHighCritical(move: CritMove | null | undefined): boolean {
    return !!(move && move.Attributes && move.Attributes.HighCritical);
}

export function isAlwaysCrit(move: CritMove | null | undefined): boolean {
    return !!(move && move.Attributes && move.Attributes.AlwaysCrit);
}

export function critMargin(move: CritMove | null | undefined, mods: CombatMods | null | undefined): number {
    if (isAlwaysCrit(move)) return 0;
    const base = BASE_CRIT_MARGIN - (isHighCritical(move) ? 1 : 0);
    return Math.max(1, base - modOf(mods, 'crit'));
}

/** How many Evasions (or Clashes) a Round allows. */
export function evaLimit(mods: CombatMods | null | undefined): number {
    return 1 + modOf(mods, 'extraEva');
}
export function clashLimit(mods: CombatMods | null | undefined): number {
    return 1 + modOf(mods, 'extraClash');
}

/** "+2", "−1", or '' for none: how an offset is printed beside a number. */
export function signed(n: number): string {
    if (!n) return '';
    return (n > 0 ? '+' : '−') + Math.abs(n);
}

/** The strict reading, for what arrives over the wire: every key a known
    one, every value a whole number in its range — anything else and the
    whole set is refused (null), as the table's validator refuses a message.
    Zeroes are accepted and dropped. */
export function parseMods(raw: unknown): CombatMods | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out: CombatMods = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!(MOD_KEYS as readonly string[]).includes(k)) return null;
        if (typeof v !== 'number' || !Number.isInteger(v)) return null;
        const [lo, hi] = MOD_RANGE[k as ModKey];
        if (v < lo || v > hi) return null;
        if (v) out[k as ModKey] = v;
    }
    return out;
}
