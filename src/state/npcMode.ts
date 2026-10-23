/* A GM's trainer shared at the rolling table, as the player's own pages see it.

   The table (src/table/npcShare.ts) keeps each shared trainer in a working set
   of its own, NPC_KEY_PREFIX + id, and an index of them under INDEX_KEY: name,
   and whether this player may change it. A License or card opened with
   `?npc=<id>` works on that set (WORKING_KEY in constants.ts), and asks here
   whether it may write. The answer is read each time, because the GM can hand
   out or take back the right to edit while the page is open. */

import { NPC_ID, NPC_KEY_PREFIX } from './constants';

export const NPC_INDEX_KEY = 'pokerole_table_npcs';

export interface NpcCopy {
    id: string;
    name: string;
    /** This player may change it. */
    edit: boolean;
    /** The GM's revision this copy is at. */
    rev: number;
}

export interface NpcIndex {
    lobby: string;
    list: NpcCopy[];
}

export function readNpcIndex(): NpcIndex | null {
    try {
        const raw = JSON.parse(localStorage.getItem(NPC_INDEX_KEY) || 'null');
        return raw && typeof raw.lobby === 'string' && Array.isArray(raw.list) ? raw : null;
    } catch { return null; }
}

export function writeNpcIndex(index: NpcIndex | null): void {
    try {
        if (index) localStorage.setItem(NPC_INDEX_KEY, JSON.stringify(index));
        else localStorage.removeItem(NPC_INDEX_KEY);
    } catch { /* quota: the copies are sent again on the next welcome */ }
}

export const npcKey = (id: string): string => NPC_KEY_PREFIX + id;

/** This tab is on a shared trainer the player may not change: always, unless
    the table says otherwise — a copy the index has lost is the GM's. */
export function npcReadOnly(): boolean {
    if (!NPC_ID) return false;
    const copy = readNpcIndex()?.list.find((c) => c.id === NPC_ID);
    return !copy || !copy.edit;
}

/** The shared trainer's name, for this tab's banner. */
export function npcName(): string {
    return (NPC_ID && readNpcIndex()?.list.find((c) => c.id === NPC_ID)?.name) || 'Trainer';
}

/** On a read-only shared trainer no key or paste reaches a field: the stores
    already refuse the change (store.ts, card/store.ts), and this keeps an
    uncontrolled field from showing a letter that will never be kept. */
export function installReadOnlyGuard(): void {
    if (!NPC_ID) return;
    const mark = () => document.documentElement.classList.toggle('npc-readonly', npcReadOnly());
    mark();
    window.addEventListener('storage', mark);
    window.setInterval(mark, 1000);
    document.addEventListener('beforeinput', (e) => {
        /* A search box only looks things up (the move list, the gear), and
           a player reading the sheet wants those. */
        const el = e.target as HTMLInputElement | null;
        if (el && el.tagName === 'INPUT' && /^Search/.test(el.placeholder || '')) return;
        if (npcReadOnly()) e.preventDefault();
    }, true);
}
