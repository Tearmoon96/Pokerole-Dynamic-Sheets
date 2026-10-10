/* A player at the rolling table rolled an attack, an Evasion or a Clash for a
   character in the fight: the combat tracker lights that row up, as a
   reminder to count the action — the one thing a GM forgets most. An Evasion
   or a Clash lights its own chip too. Hovering a light puts it out.

   Kept in memory, per combatant: a reminder, not a record, so a reload that
   loses it loses nothing that matters. */

import { useSyncExternalStore } from 'react';

/** `row`: the light on the row's action pips, for any of the three rolls;
    `eva` / `clash`: the light on that chip. Each goes out on its own. */
export type PingKind = 'row' | 'eva' | 'clash';

let pings: Record<string, PingKind[]> = {};
const watchers = new Set<() => void>();

function emit(next: Record<string, PingKind[]>): void {
    pings = next;
    watchers.forEach((w) => w());
}

export function addPing(pid: string, rolled: 'acc' | 'eva' | 'clash'): void {
    const had = pings[pid] || [];
    const want: PingKind[] = rolled === 'acc' ? ['row'] : ['row', rolled];
    if (want.every((k) => had.includes(k))) return;
    emit({ ...pings, [pid]: [...had, ...want.filter((k) => !had.includes(k))] });
}

/** Puts out one light of a combatant's, or all of them. */
export function clearPing(pid: string, kind?: PingKind): void {
    const had = pings[pid];
    if (!had) return;
    const left = kind ? had.filter((k) => k !== kind) : [];
    const next = { ...pings };
    if (left.length) next[pid] = left; else delete next[pid];
    emit(next);
}

const EMPTY: PingKind[] = [];

export function usePings(pid: string): PingKind[] {
    return useSyncExternalStore(
        (cb) => { watchers.add(cb); return () => { watchers.delete(cb); }; },
        () => pings[pid] || EMPTY,
        () => pings[pid] || EMPTY,
    );
}
