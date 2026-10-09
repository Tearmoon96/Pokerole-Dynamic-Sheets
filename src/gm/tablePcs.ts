/* Players' characters copied in from the rolling table (GmState.tablePcs).

   Addressed by a token of their own, `p:<memberId>:<key>` — `key` is `t` for
   the trainer or the team slot — so the entity helpers (entities.ts) read and
   write them the way they do a roster trainer or a wild, and every view built
   on those helpers works on them unchanged.

   A change the GM makes to one is also a change to that player's own sheet:
   the helpers report it here, and the table link (useCombatLink) sends it on. */

import type { PcOp } from '../lib/combatLink';
import type { CharKey } from '../table/slim';
import { isCharKey } from '../table/slim';
import type { GmState } from './types';

export const pcToken = (member: string, key: CharKey): string => 'p:' + member + ':' + key;

export function parsePcToken(token: string): { member: string; key: CharKey } | null {
    const p = String(token || '').split(':');
    if (p[0] !== 'p' || p.length !== 3 || !p[1] || !isCharKey(p[2])) return null;
    return { member: p[1], key: p[2] };
}

type Listener = (member: string, key: CharKey, op: PcOp) => void;
let listener: Listener | null = null;

export function onPcEdit(fn: Listener | null): void { listener = fn; }
export function emitPcEdit(member: string, key: CharKey, op: PcOp): void { listener?.(member, key, op); }

/** Drops the copies no combatant names any more. */
export function pruneTablePcs(s: GmState): void {
    const used = new Set<string>();
    s.combats.forEach((c) => c.participants.forEach((p) => {
        const t = parsePcToken(String((p as unknown as { src?: string }).src || ''));
        if (t) used.add(t.member + ':' + t.key);
    }));
    let changed = false;
    const next: GmState['tablePcs'] = {};
    for (const [member, pc] of Object.entries(s.tablePcs)) {
        const mons: typeof pc.mons = {};
        for (const [k, m] of Object.entries(pc.mons)) {
            if (used.has(member + ':' + k)) mons[k] = m; else changed = true;
        }
        const trainer = used.has(member + ':t') ? pc.trainer : null;
        if (trainer !== pc.trainer) changed = true;
        if (trainer || Object.keys(mons).length) next[member] = { ...pc, trainer, mons };
        else changed = true;
    }
    if (changed) s.tablePcs = next;
}
