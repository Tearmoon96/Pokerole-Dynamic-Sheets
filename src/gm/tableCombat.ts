/* The GM screen's half of a fight shown on the rolling table: what the strip
   says, and how what the players do lands on the combat tracker. Pure over the
   board state; the link itself is useCombatLink.ts. */

import type { PokedexEntry } from '../data/types';
import type { CharKey } from '../table/slim';
import type { WireTurnEntry, WireTurns } from '../table/protocol';
import { LIMITS } from '../table/protocol';
import { IMAGE_RE } from '../table/slim';
import { initOffset } from './combat';
import { entityPain, entityPool, entityRef, monShownName, participantLook, participantToken, resolveToken, setPainOff } from './entities';
import { painCost } from '../lib/pain';
import type { NpcPain } from '../lib/combatLink';
import { uid } from './state';
import { parsePcToken, pcToken } from './tablePcs';
import { actedOf, hasActions, passOrderOf, pidOf, usedCount } from './turns';
import { clashLimit, evaLimit } from '../lib/combatMods';
import type { CanAct } from './turns';
import type { GmCombat, GmCombatant, GmState } from './types';

type DexById = (id: string) => PokedexEntry | null;

const rec = (p: GmCombatant) => p as unknown as Record<string, unknown>;

/** Out of the fight: a subject with an HP pool at 0. A hand-typed combatant
    has no pool and is never out on that count. */
export function canActIn(state: GmState, dexById: DexById): CanAct {
    return (p) => {
        const ref = entityRef(state, dexById, participantToken(state, dexById, p));
        const hp = ref ? entityPool(ref, 'hp') : null;
        return !hp || hp.cur > 0;
    };
}

export function tableCombatOf(state: GmState): GmCombat | null {
    return state.tableCombat ? state.combats.find((c) => c.gid === state.tableCombat) || null : null;
}

/** The fight as the table should show it — every count included; the table
    strips the GM's own combatants down before anything reaches a player. */
export function buildTurns(state: GmState, c: GmCombat, dexById: DexById): WireTurns {
    const canAct = canActIn(state, dexById);
    const byId = new Map(c.participants.map((p) => [pidOf(p), p] as const));
    const order: WireTurnEntry[] = passOrderOf(c).map((pid) => {
        const p = byId.get(pid)!;
        const r = rec(p);
        /* As it is now: a Mega Evolution since it joined changes its picture. */
        const look = participantLook(state, dexById, p);
        const dex = look.dexId ? dexById(look.dexId) : null;
        const img = dex && IMAGE_RE.test(dex.Image) ? dex.Image : '';
        const pc = parsePcToken(String(r.src || ''));
        /* A player's character goes by its own name — the tracker's label
           puts the trainer's in front, which the strip has no room for. */
        const own = pc ? entityRef(state, dexById, String(r.src)) : null;
        const base: WireTurnEntry = {
            id: pid,
            name: String((own && own.name) || look.label || '?').slice(0, 48) || '?',
            img,
            own: '', ck: '',
            done: c.passed.includes(pid),
            out: !hasActions(p) || !canAct(p),
            /* Everyone's action count is on the strip: which action the
               fight is on is no secret at the table. */
            acted: actedOf(p),
        };
        const used = Array.isArray(r.usedMoves) ? (r.usedMoves as string[]).filter((m) => typeof m === 'string' && m).slice(0, 16) : [];
        return pc ? {
            ...base, own: pc.member, ck: pc.key,
            /* Whether there are any left this Round: the player's panel
               greys the chip on that, however many the offsets allow. */
            eva: usedCount(r.usedEva) >= evaLimit(own && own.mods),
            clash: usedCount(r.usedClash) >= clashLimit(own && own.mods),
            /* The player's own moves used this Round: the GM's never go out. */
            ...(used.length ? { used: used.map((m) => m.slice(0, 60)) } : {}),
        } : base;
    });
    return {
        name: (c.name || 'Combat').slice(0, 60),
        round: Math.min(999, Math.max(1, c.round)),
        pass: Math.min(999, Math.max(1, c.pass)),
        run: c.turnsOn,
        cur: c.turn && byId.has(c.turn) ? c.turn : null,
        order,
    };
}

/** The combatant `member` owns under `pid` in this fight, if they own it. */
export function ownedBy(c: GmCombat, member: string, pid: string): GmCombatant | null {
    const p = c.participants.find((x) => pidOf(x) === pid);
    const pc = p ? parsePcToken(String(rec(p).src || '')) : null;
    return p && pc && pc.member === member ? p : null;
}

/** A player's characters joining the fight: one combatant each, at the place
    their initiative puts them — ahead of the first combatant who rolled lower,
    so an order already sorted stays sorted. One already in the fight keeps its
    place and takes the new roll. */
export function enterFight(
    state: GmState, c: GmCombat, dexById: DexById,
    member: string, chars: { key: CharKey; init: number }[],
): GmCombat {
    const copy = state.tablePcs[member];
    if (!copy) return c;
    /* Characters from as many table members as a table holds, and no more:
       keys that come and go at the table must not fill the GM's fight — and
       the saved board, which carries each one's sheet — without end. A member
       already in keeps entering their own characters (seven at most: their
       trainer and six team slots, each one combatant). */
    const members = new Set<string>();
    for (const p of c.participants) {
        const pc = parsePcToken(String(rec(p).src || ''));
        if (pc) members.add(pc.member);
    }
    if (!members.has(member) && members.size >= LIMITS.MAX_MEMBERS - 1) return c;
    let parts = c.participants.slice();
    for (const ch of chars) {
        const src = pcToken(member, ch.key);
        const ref = entityRef(state, dexById, src);
        if (!ref) continue;
        /* The roll was made on the Dexterity the character has now; the field
           keeps the unparalysed number, as a roll made on this screen does. */
        const init = ch.init - initOffset(ref.status);
        const have = parts.findIndex((p) => rec(p).src === src);
        if (have >= 0) {
            parts[have] = { ...parts[have], init };
            continue;
        }
        const trainer = copy.trainer ? copy.trainer.name : '';
        const mon = ch.key === 't' ? null : copy.mons[ch.key];
        const label = ch.key === 't'
            ? (trainer || copy.player)
            : (trainer ? trainer + ' - ' : '') + monShownName(dexById, mon!.dexId, mon!.sheet as never);
        const made = {
            pid: uid(), label, kind: ch.key === 't' ? 'trainer' : 'mon',
            dexId: mon ? mon.dexId : null, src, init, acted: 0, pc: member,
        } as unknown as GmCombatant;
        const eff = (p: GmCombatant) => {
            const v = rec(p).init;
            if (typeof v !== 'number') return -Infinity;
            const r = entityRef(state, dexById, participantToken(state, dexById, p));
            return v + initOffset(r ? r.status : null);
        };
        const mine = init + initOffset(ref.status);
        const at = parts.findIndex((p) => eff(p) < mine);
        parts = at < 0 ? [...parts, made] : [...parts.slice(0, at), made, ...parts.slice(at)];
    }
    return { ...c, participants: parts };
}

/* ---- Ignore pain for the GM's own combatants, from the table (RollControls).
   Only the GM's side of the fight on the table — a player's character is
   theirs to pay for — and only one with HP and Will behind it. */

function npcTarget(state: GmState, dexById: DexById, p: GmCombatant): string | null {
    if (parsePcToken(String(rec(p).src || ''))) return null;
    const token = participantToken(state, dexById, p);
    return resolveToken(state, token) || token;
}

export function npcPains(state: GmState, c: GmCombat, dexById: DexById): NpcPain[] {
    const out: NpcPain[] = [];
    for (const p of c.participants) {
        const target = npcTarget(state, dexById, p);
        const ref = target ? entityRef(state, dexById, target) : null;
        const pain = entityPain(ref);
        const will = ref ? entityPool(ref, 'will') : null;
        if (!ref || !pain || !will || pain.ruleOff) continue;
        const name = String(participantLook(state, dexById, p).label || ref.name || '?').slice(0, 80) || '?';
        out.push({ id: pidOf(p), name, tiers: pain.tiers, off: pain.off, will: Math.min(999, will.cur) });
    }
    return out.slice(0, 64);
}

/** Power Through the Pain for the GM's combatant `pid`: `off` tiers bought
    off, its Will charged. False when it is not the GM's, not in that pain,
    already paid, or short of Will. */
export function npcPainOff(state: GmState, c: GmCombat, dexById: DexById, pid: string, off: number, save: () => void): boolean {
    const p = c.participants.find((x) => pidOf(x) === pid);
    const target = p ? npcTarget(state, dexById, p) : null;
    const ref = target ? entityRef(state, dexById, target) : null;
    const pain = entityPain(ref);
    const will = ref ? entityPool(ref, 'will') : null;
    if (!target || !pain || !will || pain.ruleOff || off <= pain.off || off > pain.tiers) return false;
    const cost = painCost(pain.off, off);
    if (will.cur < cost) return false;
    setPainOff(state, dexById, target, off, cost, save);
    return true;
}
