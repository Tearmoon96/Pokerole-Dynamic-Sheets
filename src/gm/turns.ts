/* Whose turn it is.

   A Round gives every combatant five actions (MAX_ACTIONS). Within it the
   fight goes round in PASSES: each combatant in initiative order takes one
   turn, and a turn is one action. When everyone still able to act has had
   their turn, the next pass starts at the top — a new action for everyone —
   and that repeats until nobody has an action left. Only the GM starts a new
   Round, which is what gives the five back.

   A pip is filled when an action is DONE — the turn passing, or an Evasion
   or a Clash rolled out of turn (2026-10-11, the owner's rule). So the
   filled pips count the actions already taken, and the action being played
   is the next one: with none filled a combatant is on action 1 and needs one
   success, with two filled on action 3 and needs three (`actionOf`). Five
   filled and they are done for the Round. A delay costs nothing: the pip
   fills when the turn is finally played.

   A combatant may delay: step out of the order and come back later in this
   pass, after a chosen combatant or at the end. That reorders this pass only
   (`passOrder`); the next pass is in initiative order again.

   Everything here is pure: (combat, who can act) -> combat. */

import { MAX_ACTIONS } from './combat';
import type { GmCombat, GmCombatant } from './types';

export const pidOf = (p: GmCombatant): string => (p as unknown as { pid: string }).pid;
export const actedOf = (p: GmCombatant): number => (p.acted as number) || 0;

/** Can still take a turn: has an action left, and whatever else the caller
    knows (a Pokémon at 0 HP is out of the fight). */
export type CanAct = (p: GmCombatant) => boolean;

export const hasActions = (p: GmCombatant): boolean => actedOf(p) < MAX_ACTIONS;

/** The action a combatant is on — the one after those already taken — which
    is also how many successes its Accuracy needs. Past the last, they have
    none left; callers show that rather than a sixth action. */
export function actionOf(acted: number): number {
    return Math.max(0, acted) + 1;
}

/** This pass's order: the delayed one if there is one — with anyone added
    since appended and anyone removed dropped — else the initiative order. */
export function passOrderOf(c: GmCombat): string[] {
    const live = c.participants.map(pidOf);
    if (!c.passOrder) return live;
    const kept = c.passOrder.filter((id) => live.includes(id));
    return kept.concat(live.filter((id) => !kept.includes(id)));
}

const byPid = (c: GmCombat, pid: string | null) =>
    (pid ? c.participants.find((p) => pidOf(p) === pid) || null : null);

function withActed(c: GmCombat, pid: string, delta: number): GmCombat {
    return {
        ...c,
        participants: c.participants.map((p) => (pidOf(p) === pid
            ? { ...p, acted: Math.max(0, Math.min(MAX_ACTIONS, actedOf(p) + delta)) }
            : p)),
    };
}

/** Hands the turn to `pid`. Their pip fills when the turn is over. */
function begin(c: GmCombat, pid: string | null): GmCombat {
    return { ...c, turn: pid };
}

/** The first in this pass's order who has not had their turn and can act. */
function nextUp(c: GmCombat, canAct: CanAct): string | null {
    for (const id of passOrderOf(c)) {
        if (c.passed.includes(id)) continue;
        const p = byPid(c, id);
        if (p && hasActions(p) && canAct(p)) return id;
    }
    return null;
}

/** Starts a fresh pass and gives the first turn of it, or none when nobody
    has an action left — the Round is over and waits for the GM. */
function newPass(c: GmCombat, canAct: CanAct, count: boolean): GmCombat {
    const fresh: GmCombat = { ...c, passed: [], passOrder: null, pass: count ? c.pass + 1 : c.pass };
    return begin(fresh, nextUp(fresh, canAct));
}

/** Turns on the tracker at the top of the order. */
export function startTurns(c: GmCombat, canAct: CanAct): GmCombat {
    return newPass({ ...c, turnsOn: true, turn: null, pass: 1 }, canAct, false);
}

export function stopTurns(c: GmCombat): GmCombat {
    return { ...c, turnsOn: false, turn: null, passed: [], passOrder: null, pass: 1 };
}

/** The current turn is over: its action is done, and its pip fills. */
export function passTurn(c: GmCombat, canAct: CanAct): GmCombat {
    if (!c.turnsOn || !c.turn) return c;
    const acted = withActed(c, c.turn, 1);
    const done: GmCombat = { ...acted, passed: c.passed.includes(c.turn) ? c.passed : [...c.passed, c.turn], turn: null };
    const next = nextUp(done, canAct);
    return next ? begin(done, next) : newPass(done, canAct, true);
}

/** The current combatant steps back to act after `after` (null: at the end of
    the pass). Nothing is spent: the pip fills when the turn is played. */
export function delayTurn(c: GmCombat, after: string | null, canAct: CanAct): GmCombat {
    const pid = c.turn;
    if (!pid) return c;
    const order = passOrderOf(c).filter((id) => id !== pid);
    const at = after ? order.indexOf(after) : -1;
    /* Only later in the pass: a slot behind somebody who has already gone
       would just be the end of the pass with extra steps. */
    if (after && (at < 0 || c.passed.includes(after))) return c;
    order.splice(at < 0 ? order.length : at + 1, 0, pid);
    const moved: GmCombat = { ...c, passOrder: order, turn: null };
    const next = nextUp(moved, canAct);
    /* Delaying behind nobody who can act leaves the turn where it was. */
    return next && next !== pid ? begin(moved, next) : begin(moved, pid);
}

/** Evasion or Clash, rolled out of turn: one action, and the Round's mark. */
export function spendQuick(c: GmCombat, pid: string, what: 'eva' | 'clash'): GmCombat {
    const key = what === 'eva' ? 'usedEva' : 'usedClash';
    const spent = withActed(c, pid, 1);
    return {
        ...spent,
        participants: spent.participants.map((p) => (pidOf(p) === pid ? { ...p, [key]: true } : p)),
    };
}

/** Marks a move used this Round, or clears the mark. */
export function markMove(c: GmCombat, pid: string, move: string, used: boolean): GmCombat {
    if (!c.participants.some((p) => pidOf(p) === pid)) return c;
    return {
        ...c,
        participants: c.participants.map((p) => {
            if (pidOf(p) !== pid) return p;
            const had = Array.isArray(p.usedMoves) ? p.usedMoves : [];
            const next = used ? (had.includes(move) ? had : [...had, move]) : had.filter((m) => m !== move);
            return { ...p, usedMoves: next };
        }),
    };
}

/** A new Round: the actions and the once-a-Round marks come back (the panel
    does that part), and a tracker that was running starts at the top again. */
export function roundTurns(c: GmCombat, canAct: CanAct): GmCombat {
    if (!c.turnsOn) return { ...c, pass: 1, passed: [], passOrder: null };
    return newPass({ ...c, turn: null, pass: 1 }, canAct, false);
}

/** After anything that may have taken the current combatant away — removed,
    knocked out — hands the turn on rather than leave it on nobody. */
export function settleTurn(c: GmCombat, canAct: CanAct): GmCombat {
    if (!c.turnsOn) return c;
    /* Somebody new in a Round that had run dry: they get to act. */
    if (!c.turn) return begin(c, nextUp(c, canAct));
    const p = byPid(c, c.turn);
    if (p && canAct(p)) return c;
    const done: GmCombat = { ...c, turn: null, passed: p ? [...c.passed, c.turn] : c.passed };
    const next = nextUp(done, canAct);
    return next ? begin(done, next) : newPass(done, canAct, true);
}
