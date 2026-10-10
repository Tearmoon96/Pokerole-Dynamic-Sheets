/* The line between the GM screen and the rolling table, in the GM's own
   browser — the combat counterpart of tableLink.ts, which carries the Map
   Maker's maps.

   The GM runs the fight in the GM screen's combat tracker. The table tab shows
   it to the players as a turn strip, and brings back what the players do: a
   character entering the fight with its initiative, a turn passed or delayed,
   an action spent on an Evasion or a Clash, and the character sheets the GM's
   temporary copies follow. The GM screen stays the authority on the order and
   the turn; the table relays.

   Same-origin and same-profile only, like the map link. Only a HOSTING table
   opens the channel, so a GM screen in a player's browser never hears one. */

import { MAX_COLOR } from '../table/colors';
import { isCharKey, parseSlimMon, parseSlimTrainer, parseStatus } from '../table/slim';
import type { CharKey, SlimMon, SlimTrainer } from '../table/slim';
import type { TurnOp, WireTurns } from '../table/protocol';
import type { GmStatus } from '../gm/ailments';

export const COMBAT_LINK_CHANNEL = 'pds-table-combat';

/** How often the table says it is there, and how long silence means gone. */
export const COMBAT_BEAT_MS = 2000;
export const COMBAT_LOST_MS = 6000;

export interface LinkMember { id: string; name: string; color?: number }

/** A change the GM made to a player's character: what its HP, Will or status
    now IS — never a step, so a message delivered twice changes nothing. */
export interface PcOp { hp?: number; will?: number; status?: GmStatus }

export type CombatLinkMessage =
    /** Table → GM screen: a hosted table is open, with these players at it. */
    | { t: 'host'; table: string; members: LinkMember[] }
    /** Table → GM screen: the table was closed or left. */
    | { t: 'bye' }
    /** Table → GM screen: send the strip now (the table just opened). */
    | { t: 'want' }
    /** Table → GM screen: a character as its player has it. */
    | { t: 'pc'; member: string; player: string; key: CharKey; trainer?: SlimTrainer; mon?: SlimMon }
    /** Table → GM screen: these characters join the fight, initiative rolled. */
    | { t: 'enter'; member: string; player: string; chars: { key: CharKey; init: number }[] }
    /** Table → GM screen: a player passed, delayed or spent an action. */
    | { t: 'act'; member: string; op: TurnOp; pid: string; after: string | null }
    /** Table → GM screen: the GM pressed Next on the table's strip. */
    | { t: 'next' }
    /** GM screen → table: say you are there, now. Answered from the table's
        message handler, which a hidden tab still runs promptly when its
        timers have been slowed to once a minute. */
    | { t: 'ping' }
    /** GM screen → table: the fight on the table, or none. Every count is in
        it; the table strips what players may not see. */
    | { t: 'turns'; turns: WireTurns | null }
    /** GM screen → table: the GM changed a player's character. */
    | { t: 'op'; member: string; key: CharKey; op: PcOp };

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

/** Same-origin pages only, but still checked: a message that does not have
    exactly the expected shape is ignored. The turn strip is re-checked by the
    relay's own validator before it leaves for the players. */
export function parseCombatLink(raw: unknown): CombatLinkMessage | null {
    if (!isRecord(raw) || typeof raw.t !== 'string') return null;
    switch (raw.t) {
        case 'host': {
            const table = str(raw.table, 80);
            if (table === null || !Array.isArray(raw.members) || raw.members.length > 64) return null;
            const members: LinkMember[] = [];
            for (const m of raw.members) {
                if (!isRecord(m)) return null;
                const id = str(m.id, 80), name = str(m.name, 80);
                if (id === null || name === null) return null;
                const color = Number.isInteger(m.color) && (m.color as number) >= 0 && (m.color as number) <= MAX_COLOR
                    ? m.color as number : undefined;
                members.push(color === undefined ? { id, name } : { id, name, color });
            }
            return { t: 'host', table, members };
        }
        case 'bye': return { t: 'bye' };
        case 'want': return { t: 'want' };
        case 'ping': return { t: 'ping' };
        case 'next': return { t: 'next' };
        case 'pc': {
            const member = str(raw.member, 80), player = str(raw.player, 80);
            if (member === null || player === null || !isCharKey(raw.key)) return null;
            if (raw.key === 't') {
                const trainer = parseSlimTrainer(raw.trainer);
                return trainer ? { t: 'pc', member, player, key: 't', trainer } : null;
            }
            const mon = parseSlimMon(raw.mon);
            return mon ? { t: 'pc', member, player, key: raw.key, mon } : null;
        }
        case 'enter': {
            const member = str(raw.member, 80), player = str(raw.player, 80);
            if (member === null || player === null || !Array.isArray(raw.chars) || raw.chars.length > 7) return null;
            const chars: { key: CharKey; init: number }[] = [];
            for (const c of raw.chars) {
                if (!isRecord(c) || !isCharKey(c.key) || typeof c.init !== 'number' || !Number.isInteger(c.init)) return null;
                chars.push({ key: c.key, init: c.init });
            }
            return { t: 'enter', member, player, chars };
        }
        case 'act': {
            const member = str(raw.member, 80), pid = str(raw.pid, 80);
            const after = raw.after === null ? null : str(raw.after, 80);
            const op = raw.op;
            if (member === null || pid === null || (raw.after !== null && after === null)) return null;
            if (op !== 'pass' && op !== 'delay' && op !== 'eva' && op !== 'clash' && op !== 'acc') return null;
            return { t: 'act', member, op, pid, after };
        }
        case 'turns': {
            if (raw.turns !== null && !isRecord(raw.turns)) return null;
            return { t: 'turns', turns: raw.turns as WireTurns | null };
        }
        case 'op': {
            const member = str(raw.member, 80);
            if (member === null || !isCharKey(raw.key) || !isRecord(raw.op)) return null;
            const o = raw.op;
            const op: PcOp = {};
            if (o.hp !== undefined) { if (typeof o.hp !== 'number' || !Number.isInteger(o.hp) || o.hp < 0) return null; op.hp = o.hp; }
            if (o.will !== undefined) { if (typeof o.will !== 'number' || !Number.isInteger(o.will) || o.will < 0) return null; op.will = o.will; }
            if (o.status !== undefined) {
                const status = parseStatus(o.status);
                if (!status) return null;
                op.status = status;
            }
            return { t: 'op', member, key: raw.key, op };
        }
        default: return null;
    }
}

export function openCombatLink(): BroadcastChannel | null {
    try {
        return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(COMBAT_LINK_CHANNEL);
    } catch {
        return null;
    }
}
