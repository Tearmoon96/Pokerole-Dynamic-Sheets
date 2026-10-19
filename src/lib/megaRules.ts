/* The Mega-Evolution rules a table plays by.

   The Core Book's official set is the default; the GM changes any of it in the
   GM screen's Settings (src/components/gm/SettingsDialog.tsx). Three pages read
   it, so it lives in localStorage rather than in one page's state:

     - the GM screen writes the GM's own choice under RULES_KEY;
     - the GM's rolling table reads that key and sends it to every player
       (`k: 'rules'`, src/table/session.ts);
     - a player's table keeps what it was sent under TABLE_RULES_KEY, until
       the player leaves the table.

   The card and the table's character panel Mega Evolve by `activeMegaRules()`:
   a table's rules while sitting at one, else this browser's GM's, else the
   book's. The transformation itself is src/card/mega.ts. */

export interface MegaRules {
    /** Ask, on Mega Evolving, whether the Mega form keeps a moveset of its own. */
    moves: boolean;
    /** Mega Evolving costs Will. */
    costOn: boolean;
    cost: number;
    /** Mega Evolving restores HP: all of it, or `hp` points. */
    hpOn: boolean;
    hpAll: boolean;
    hp: number;
    /** The same for Will. */
    willOn: boolean;
    willAll: boolean;
    will: number;
    /** Mega Evolving heals every status condition. */
    statusOn: boolean;
    /** The original form keeps its damage, spent Will and status: they come
        back as they were when the transformation ends. */
    keepOriginal: boolean;
    /** Trained attributes (vitamins included) and the Def / Sp. Def offsets
        carry over to the Mega form. */
    keepBoosts: boolean;
    /** The Mega form's attributes may go past its species' limit (and past
        10): carried-over points are never cut to fit. */
    beyondLimit: boolean;
    /** The Mega Stone cannot be taken, switched or removed: the held item is
        locked while Mega Evolved. */
    lockStone: boolean;
    /** Lethal damage to the Mega form does not pass to the original form. */
    lethalStays: boolean;
}

export const DEFAULT_MEGA_RULES: MegaRules = {
    moves: true,
    costOn: true, cost: 1,
    hpOn: true, hpAll: true, hp: 10,
    willOn: true, willAll: true, will: 5,
    statusOn: true,
    keepOriginal: true,
    keepBoosts: true,
    beyondLimit: true,
    lockStone: true,
    lethalStays: true,
};

export const RULES_KEY = 'pokerole_mega_rules';
export const TABLE_RULES_KEY = 'pokerole_mega_rules_table';

export const MAX_RULE_AMOUNT = 99;

const BOOL_KEYS = ['moves', 'costOn', 'hpOn', 'hpAll', 'willOn', 'willAll', 'statusOn',
    'keepOriginal', 'keepBoosts', 'beyondLimit', 'lockStone', 'lethalStays'] as const;
const NUM_KEYS = ['cost', 'hp', 'will'] as const;
export const MEGA_RULE_KEYS: readonly string[] = [...BOOL_KEYS, ...NUM_KEYS];

const amount = (v: unknown, dflt: number): number =>
    (typeof v === 'number' && Number.isFinite(v)
        ? Math.max(1, Math.min(MAX_RULE_AMOUNT, Math.round(v))) : dflt);

/** Whatever was stored, as a full set: a missing or broken field takes the
    book's value, so a set saved before a rule existed still reads. */
export function normalizeMegaRules(raw: unknown): MegaRules {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out = { ...DEFAULT_MEGA_RULES };
    for (const k of BOOL_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
    for (const k of NUM_KEYS) out[k] = amount(r[k], DEFAULT_MEGA_RULES[k]);
    return out;
}

/** The strict reading for the wire: exactly these fields, each of its type,
    or nothing (src/table/validate.ts). */
export function parseMegaRules(v: unknown): MegaRules | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const r = v as Record<string, unknown>;
    if (Object.keys(r).length !== MEGA_RULE_KEYS.length
        || !Object.keys(r).every((k) => MEGA_RULE_KEYS.includes(k))) return null;
    if (!BOOL_KEYS.every((k) => typeof r[k] === 'boolean')) return null;
    if (!NUM_KEYS.every((k) => Number.isInteger(r[k]) && (r[k] as number) >= 1
        && (r[k] as number) <= MAX_RULE_AMOUNT)) return null;
    return normalizeMegaRules(r);
}

function readKey(key: string): unknown {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

/** The GM's own rules, as the GM screen keeps them. */
export function readGmMegaRules(): MegaRules {
    return normalizeMegaRules(readKey(RULES_KEY));
}

export function writeGmMegaRules(rules: MegaRules): void {
    try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { /* private mode */ }
}

/** A table's rules, as a player's page received them. */
export function readTableMegaRules(): MegaRules | null {
    const t = readKey(TABLE_RULES_KEY) as { rules?: unknown } | null;
    return t && t.rules ? normalizeMegaRules(t.rules) : null;
}

export function writeTableMegaRules(lobby: string, rules: MegaRules | null): void {
    try {
        if (rules) localStorage.setItem(TABLE_RULES_KEY, JSON.stringify({ lobby, rules }));
        else localStorage.removeItem(TABLE_RULES_KEY);
    } catch { /* private mode: the book's rules apply */ }
}

/** The rules a Mega Evolution in this browser follows now. */
export function activeMegaRules(): MegaRules {
    return readTableMegaRules() ?? readGmMegaRules();
}

/** Where the rules in force come from, for the dialogs to say so. */
export function megaRulesSource(): 'table' | 'gm' | 'book' {
    if (readTableMegaRules()) return 'table';
    return readKey(RULES_KEY) ? 'gm' : 'book';
}

export function sameMegaRules(a: MegaRules, b: MegaRules): boolean {
    return MEGA_RULE_KEYS.every((k) => (a as unknown as Record<string, unknown>)[k]
        === (b as unknown as Record<string, unknown>)[k]);
}
