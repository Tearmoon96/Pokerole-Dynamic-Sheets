/* Will spent on a Round: Take Your Chances and Pushing Fate.

   Both are bought with Will next to the Roll button (the GM screen's Dice
   panel, the table's dice controls), and both are about ONE Round:

     Take Your Chances   1 Will: for the rest of the Round, every action roll
                         may throw ONE of its failed dice again.
     Pushing Fate        1 Will each: an automatic success on one roll, which
                         pain and Low Accuracy cannot strike. Never on damage.

   They exclude each other within a Round; several Pushing Fates are fine.

   So what a character has done this Round has to be remembered until the
   Round ends, and by both pages. It is kept here, in localStorage, under a
   key per character and a STAMP naming the Round — the fight and its round
   number. When the stamp a page asks with is no longer the one stored, the
   Round is over and the entry reads as empty: nothing has to clear it.

   Outside a fight there is no Round to end (stamp FREE). Take Your Chances
   is then a switch that stays on until it is clicked off, and Pushing Fate
   is not remembered at all — it only yields to a Take Your Chances that is
   on right now. */

import { useSyncExternalStore } from 'react';

const KEY = 'pokerole_will_round';
const MAX_ENTRIES = 64;

export const FREE = 'free';

interface Entry { stamp: string; tyc?: boolean; fate?: number }
type Book = Record<string, Entry>;

export interface RoundWill {
    /** Take Your Chances is on. */
    tyc: boolean;
    /** Pushing Fates used this Round. */
    fate: number;
}

let version = 0;
const listeners = new Set<() => void>();

function readBook(): Book {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || '{}');
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Book : {};
    } catch { return {}; }
}

function writeBook(book: Book): void {
    const keys = Object.keys(book);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete book[k];
    try { localStorage.setItem(KEY, JSON.stringify(book)); } catch { /* quota, private mode */ }
    version++;
    listeners.forEach((fn) => fn());
}

export function roundWill(key: string, stamp: string): RoundWill {
    const e = Object.prototype.hasOwnProperty.call(readBook(), key) ? readBook()[key] : null;
    if (!e || e.stamp !== stamp) return { tyc: false, fate: 0 };
    return { tyc: !!e.tyc, fate: stamp === FREE ? 0 : Math.max(0, Math.floor(Number(e.fate) || 0)) };
}

function put(key: string, stamp: string, change: (now: RoundWill) => RoundWill): void {
    const book = readBook();
    const next = change(roundWill(key, stamp));
    delete book[key];
    if (next.tyc || next.fate) book[key] = { stamp, ...(next.tyc ? { tyc: true } : {}), ...(next.fate ? { fate: next.fate } : {}) };
    writeBook(book);
}

export function setTakeChances(key: string, stamp: string, on: boolean): void {
    put(key, stamp, (now) => ({ ...now, tyc: on }));
}

export function notePushedFate(key: string, stamp: string, n: number): void {
    if (stamp === FREE || !(n > 0)) return;
    put(key, stamp, (now) => ({ ...now, fate: now.fate + n }));
}

function subscribe(fn: () => void): () => void {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { version++; fn(); } };
    listeners.add(fn);
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}

/** Re-renders the caller whenever anything here changes, in this tab or another. */
export function useRoundWillVersion(): number {
    return useSyncExternalStore(subscribe, () => version);
}
