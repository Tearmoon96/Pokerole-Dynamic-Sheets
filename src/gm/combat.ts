import { activeAilments } from './ailments';
import type { GmAilment, GmStatus } from './ailments';
import type { EntityRef } from './entities';
import type { GmCombatant } from './types';

/* The combat tracker's rules.

   Actions in a round get harder as they go, but not by shrinking the pool: a
   move's Accuracy is fixed, and it is the target that climbs — the Nth action of
   a round needs N successes to land, up to five. */

export const MAX_ACTIONS = 5;

/** Paralysis takes 2 points off Dexterity, and so off Initiative. */
export const PARALYSIS_INIT = -2;

/** The two ailments whose damage grows each round they persist. */
export const ESCALATING = ['burn3', 'badlyPoison'];

/** Which ailments put a flag on the combat row at the start of a round. */
export const ROUND_FLAGGED = ['burn1', 'burn2', 'burn3', 'poison', 'badlyPoison',
    'sleep', 'confusion', 'inLove'];

export function initOffset(status: GmStatus | null): number {
    return status && status.major === 'paralysis' ? PARALYSIS_INIT : 0;
}

export function ailmentDamage(ailKey: string, elapsed: number): number {
    const e = Math.max(0, elapsed || 0);
    switch (ailKey) {
        case 'burn1': return 1;
        case 'burn2': return 2;
        case 'burn3': return 3 + e;
        case 'poison': return 2;
        case 'badlyPoison': return 2 + 2 * e;
        default: return 0;
    }
}

export interface AilmentRoll {
    label: string;
    dice: number;
    target: number;
    /** Whether successes accumulate across rounds toward the target. */
    accumulates: boolean;
    /** The other pool, when the rules offer a choice. */
    alt?: string;
}

export function ailmentRoll(ref: EntityRef, ailKey: string): AilmentRoll | null {
    const v = ref.value;
    const burn = (need: number): AilmentRoll => ({
        label: 'Dexterity + Athletic', dice: v('Dexterity') + v('Athletic'),
        target: need, accumulates: true,
    });
    switch (ailKey) {
        case 'burn1': return burn(4);
        case 'burn2': return burn(6);
        case 'burn3': return burn(8);
        case 'sleep': return { label: 'Insight', dice: v('Insight'), target: 5, accumulates: true };
        case 'confusion': return { label: 'Insight', dice: v('Insight'), target: 2, accumulates: false };
        case 'inLove': {
            /* "Loyalty or Insight" — offer whichever is the better bet, and say
               what the other one was */
            const loy = v('Loyalty'), ins = v('Insight');
            return {
                label: loy >= ins ? 'Loyalty' : 'Insight',
                alt: loy >= ins ? 'Insight ' + ins : 'Loyalty ' + loy,
                dice: Math.max(loy, ins), target: 3, accumulates: false,
            };
        }
        default: return null;
    }
}

export interface RoundFlag { ail: GmAilment; damage: number; roll: AilmentRoll | null }

export function roundFlags(ref: EntityRef, p: GmCombatant, round: number): RoundFlag[] {
    const rec = p as unknown as Record<string, Record<string, number>>;
    return activeAilments(ref.status)
        .filter((a) => ROUND_FLAGGED.includes(a.key))
        .map((a) => ({
            ail: a,
            damage: ailmentDamage(a.key,
                (rec.since && rec.since[a.key] != null) ? round - rec.since[a.key] : 0),
            roll: ailmentRoll(ref, a.key),
        }));
}

/** Keep a participant's per-round bookkeeping in step with its current
    ailments. Returns true when anything changed, so the caller can save. */
export function syncRoundState(p: GmCombatant, status: GmStatus, round: number): boolean {
    const rec = p as unknown as Record<string, Record<string, number>>;
    if (!rec.since) rec.since = {};
    if (!rec.cure) rec.cure = {};
    if (!rec.dealt) rec.dealt = {};
    const on = activeAilments(status).map((a) => a.key);
    let changed = false;
    ESCALATING.forEach((k) => {
        if (on.includes(k)) {
            if (rec.since[k] == null) { rec.since[k] = round; changed = true; }
        } else if (rec.since[k] != null) {
            delete rec.since[k];
            changed = true;
        }
    });
    Object.keys(rec.cure).forEach((k) => {
        if (!on.includes(k)) { delete rec.cure[k]; changed = true; }
    });
    /* "Dealt" is a fact about one Round only: the Round moving on, or the
       ailment being cured, puts the flag back to waiting. */
    Object.keys(rec.dealt).forEach((k) => {
        if (!on.includes(k) || rec.dealt[k] !== round) { delete rec.dealt[k]; changed = true; }
    });
    return changed;
}
