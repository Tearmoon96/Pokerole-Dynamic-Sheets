/* Whose turn it is.

   A Round gives every combatant five actions (MAX_ACTIONS). Within it the
   fight goes round in PASSES: each combatant in initiative order takes one
   turn, and a turn is one action. When everyone still able to act has had
   their turn, the next pass starts at the top — a new action for everyone —
   and that repeats until nobody has an action left. Only the GM starts a new
   Round, which is what gives the five back.

   A pip is filled when an action is DONE (2026-10-11, the owner's rule). So
   the filled pips count the actions already taken, and the action being
   played is the next one: with none filled a combatant is on action 1 and
   needs one success, with two filled on action 3 and needs three
   (`actionOf`). Five filled and they are done for the Round. A delay costs
   nothing: the pip fills when the turn is finally played.

   Rolling an Accuracy, an Evasion or a Clash IS doing the action, so the
   roll fills the pip there and then (`spendRoll`, 2026-10-18, the owner's
   ask), on the GM screen and from the table alike. A turn passed after its
   own roll has nothing left to count (`turnSpent`); one passed without a
   roll (a support move, a manoeuvre) fills its pip on passing, as before.
   Each filled pip is written to the combatant's `actLog` for the Round,
   which is what the tracker's hover on the sprite reads.

   A combatant may delay: step out of the order and come back later in this
   pass, after a chosen combatant or at the end. That reorders this pass only
   (`passOrder`); the next pass is in initiative order again.

   Everything here is pure: (combat, who can act) -> combat. */

import { MAX_ACTIONS } from './combat';
import { LIMITS } from '../table/protocol';
import type { ActLogEntry, GmCombat, GmCombatant } from './types';

export const pidOf = (p: GmCombatant): string => (p as unknown as { pid: string }).pid;
export const actedOf = (p: GmCombatant): number => (p.acted as number) || 0;

/** Can still take a turn: has an action left, and whatever else the caller
    knows (a Pokémon at 0 HP is out of the fight). */
export type CanAct = (p: GmCombatant) => boolean;

export const hasActions = (p: GmCombatant): boolean => actedOf(p) < MAX_ACTIONS;

/* Kept to a bound, since a player's rolls arrive by message. */
const MAX_LOG = MAX_ACTIONS * 2;

export function actLogOf(p: GmCombatant): ActLogEntry[] {
    return Array.isArray(p.actLog) ? p.actLog : [];
}

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

/** One more action done by `pid`, written to the Round's log. Nothing once
    the five are spent: a sixth roll is not a sixth action. */
function spendOne(c: GmCombat, pid: string, entry: ActLogEntry): GmCombat {
    return {
        ...c,
        participants: c.participants.map((p) => {
            if (pidOf(p) !== pid || !hasActions(p)) return p;
            const log = actLogOf(p);
            return {
                ...p,
                acted: actedOf(p) + 1,
                actLog: log.length < MAX_LOG ? [...log, entry] : log,
            };
        }),
    };
}

/** Hands the turn to `pid`. Their pip fills when they roll, or when the turn
    is over if they never did. */
function begin(c: GmCombat, pid: string | null): GmCombat {
    return { ...c, turn: pid, turnSpent: false };
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
    return { ...c, turnsOn: false, turn: null, turnSpent: false, passed: [], passOrder: null, pass: 1 };
}

/** The current turn is over: its action is done, and its pip fills — unless
    a roll in the turn already filled it. */
export function passTurn(c: GmCombat, canAct: CanAct): GmCombat {
    if (!c.turnsOn || !c.turn) return c;
    const acted = c.turnSpent ? c : spendOne(c, c.turn, { k: 'turn' });
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
    /* Delaying behind nobody who can act leaves the turn where it was, a
       roll already made in it still counted. */
    return next && next !== pid ? begin(moved, next) : { ...moved, turn: pid };
}

/** An Accuracy, an Evasion or a Clash was rolled: one action done, in its
    turn or out of it. An Evasion or a Clash also takes the Round's mark, an
    Accuracy its move (`markMove`). Rolled in the combatant's own turn, it is
    that turn's action, and passing the turn fills nothing more. */
export function spendRoll(c: GmCombat, pid: string, what: 'acc' | 'eva' | 'clash', move?: string): GmCombat {
    if (!byPid(c, pid)) return c;
    let next = spendOne(c, pid, what === 'acc' && move ? { k: what, move: move.slice(0, 60) } : { k: what });
    if (what === 'acc') {
        if (move) next = markMove(next, pid, move, true);
    } else {
        const key = what === 'eva' ? 'usedEva' : 'usedClash';
        next = { ...next, participants: next.participants.map((p) => (pidOf(p) === pid ? { ...p, [key]: true } : p)) };
    }
    return c.turnsOn && c.turn === pid ? { ...next, turnSpent: true } : next;
}

/** Marks a move used this Round, or clears the mark. A combatant holds at
    most LIMITS.MAX_USED_MOVES marks: a player's attacks arrive with the move's
    name from the table, and a page sending a new name each time must not grow
    the GM's saved board without end. */
export function markMove(c: GmCombat, pid: string, move: string, used: boolean): GmCombat {
    if (!c.participants.some((p) => pidOf(p) === pid)) return c;
    return {
        ...c,
        participants: c.participants.map((p) => {
            if (pidOf(p) !== pid) return p;
            const had = Array.isArray(p.usedMoves) ? p.usedMoves : [];
            if (used && (had.includes(move) || had.length >= LIMITS.MAX_USED_MOVES)) return p;
            const next = used ? [...had, move] : had.filter((m) => m !== move);
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
    const done: GmCombat = { ...c, turn: null, turnSpent: false, passed: p ? [...c.passed, c.turn] : c.passed };
    const next = nextUp(done, canAct);
    return next ? begin(done, next) : newPass(done, canAct, true);
}
