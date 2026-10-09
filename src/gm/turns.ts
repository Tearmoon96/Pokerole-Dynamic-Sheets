/* Whose turn it is.

   A Round gives every combatant five actions (MAX_ACTIONS). Within it the
   fight goes round in PASSES: each combatant in initiative order takes one
   turn, and a turn is one action. When everyone still able to act has had
   their turn, the next pass starts at the top — a new action for everyone —
   and that repeats until nobody has an action left. Only the GM starts a new
   Round, which is what gives the five back.

   The pip for a turn is filled the moment the turn STARTS, which is the
   tracker's own convention (the move panel reads "Action N · needs N
   successes" off the filled pips, and N has to be right while the turn is
   being played). So passing costs nothing more; a delay hands the pip back.
   Evasion and Clash are rolled out of turn and spend an action of their own.

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

/** Hands the turn to `pid` and fills their pip for it. */
function begin(c: GmCombat, pid: string | null): GmCombat {
    const next = { ...c, turn: pid };
    return pid ? withActed(next, pid, 1) : next;
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

/** The current turn is over. */
export function passTurn(c: GmCombat, canAct: CanAct): GmCombat {
    if (!c.turnsOn || !c.turn) return c;
    const done: GmCombat = { ...c, passed: c.passed.includes(c.turn) ? c.passed : [...c.passed, c.turn], turn: null };
    const next = nextUp(done, canAct);
    return next ? begin(done, next) : newPass(done, canAct, true);
}

/** The current combatant steps back to act after `after` (null: at the end of
    the pass). Their pip is handed back; it fills again when the turn comes. */
export function delayTurn(c: GmCombat, after: string | null, canAct: CanAct): GmCombat {
    const pid = c.turn;
    if (!pid) return c;
    const order = passOrderOf(c).filter((id) => id !== pid);
    const at = after ? order.indexOf(after) : -1;
    /* Only later in the pass: a slot behind somebody who has already gone
       would just be the end of the pass with extra steps. */
    if (after && (at < 0 || c.passed.includes(after))) return c;
    order.splice(at < 0 ? order.length : at + 1, 0, pid);
    const moved = withActed({ ...c, passOrder: order, turn: null }, pid, -1);
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
