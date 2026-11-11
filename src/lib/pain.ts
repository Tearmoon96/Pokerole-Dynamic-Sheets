/* Pain Penalization, and paying Will to ignore it.

   Two tiers that stack. At half HP or less (rounded down) every roll loses 1
   success; at 1 HP it loses 2 MORE, so 3 in all. Each tier can be bought off
   with Will — "Power Through the Pain": 1 Will for the first, 2 more for the
   second, 3 for both at once when one blow took the character straight to 1.

   What has been bought off rides in the sheet's `combatMods` as `painOff`
   (0, 1 or 2 tiers), so it reaches every page that reads the sheet and
   travels with a player's copy. It only ever counts up to the tiers the HP is
   in now (`min`), and the HP writers lower it when the HP climbs back out of
   a tier: pain that returns later is new pain, to be paid for again.

   Two switches turn the whole rule off: `noPain` in the same `combatMods`,
   for one Pokémon (its card's button), and the table's own switch for
   everybody, which is the GM's and lives in localStorage like the Mega rules
   (lib/megaRules.ts): the GM's browser under PAIN_OFF_KEY, a player's under
   TABLE_PAIN_OFF_KEY from the GM's `rules` message until they leave. */

import { modOf } from './combatMods';
import type { CombatMods } from './combatMods';

export const PAIN_OFF_KEY = 'pokerole_pain_off';
export const TABLE_PAIN_OFF_KEY = 'pokerole_pain_off_table';

/** Successes each tier takes, and the Will each costs to ignore. */
export const PAIN_LOSS = [1, 2] as const;
export const PAIN_COST = [1, 2] as const;

/** How many tiers this HP is in: 0, 1 (half or less) or 2 (1 HP or less). */
export function painTiers(cur: number, max: number): number {
    if (cur <= 1) return 2;
    if (cur <= Math.floor(max / 2)) return 1;
    return 0;
}

function flag(key: string): boolean {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

/** The GM's own switch, in the GM's browser. */
export function readGmPainOff(): boolean { return flag(PAIN_OFF_KEY); }

export function writeGmPainOff(off: boolean): void {
    try {
        if (off) localStorage.setItem(PAIN_OFF_KEY, '1');
        else localStorage.removeItem(PAIN_OFF_KEY);
    } catch { /* private mode */ }
}

/** What the GM's table sent a player — '1' off, '0' on — or null to forget
    it, when they leave. */
export function writeTablePainOff(off: boolean | null): void {
    try {
        if (off === null) localStorage.removeItem(TABLE_PAIN_OFF_KEY);
        else localStorage.setItem(TABLE_PAIN_OFF_KEY, off ? '1' : '0');
    } catch { /* private mode */ }
}

/** The rule is off for everybody. A player at a table goes by what that
    table's GM said, whatever this browser's own GM screen is set to; with
    no table, it is this browser's GM's switch. */
export function painRuleOff(): boolean {
    let table: string | null = null;
    try { table = localStorage.getItem(TABLE_PAIN_OFF_KEY); } catch { /* private mode */ }
    return table !== null ? table === '1' : flag(PAIN_OFF_KEY);
}

export interface PainView {
    /** Tiers the HP is in. */
    tiers: number;
    /** Tiers bought off with Will, never more than `tiers`. */
    off: number;
    /** Successes lost on a roll, after all of the above. */
    penalty: number;
    /** The rule is ignored: this character's own switch, or the table's. */
    ruleOff: boolean;
}

export function painView(
    cur: number, max: number, mods: CombatMods | null | undefined, tableOff: boolean = painRuleOff(),
): PainView {
    const ruleOff = tableOff || !!modOf(mods, 'noPain');
    const tiers = painTiers(cur, max);
    const off = Math.min(tiers, modOf(mods, 'painOff'));
    let penalty = 0;
    if (!ruleOff) for (let i = off; i < tiers; i++) penalty += PAIN_LOSS[i];
    return { tiers, off, penalty, ruleOff };
}

/** Will to go from `from` tiers bought off to `to`; negative when it comes back. */
export function painCost(from: number, to: number): number {
    let c = 0;
    for (let i = Math.min(from, to); i < Math.max(from, to); i++) c += PAIN_COST[i];
    return to >= from ? c : -c;
}

/** `painOff` once the HP has changed: never more tiers than the HP is in. */
export function settledPainOff(mods: CombatMods | null | undefined, cur: number, max: number): number {
    return Math.min(modOf(mods, 'painOff'), painTiers(cur, max));
}
