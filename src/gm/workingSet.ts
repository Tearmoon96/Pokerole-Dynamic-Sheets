import { WORKING_KEY } from '../state/constants';
import type { TrainerState } from '../state/types';

/* The shared working set, as the GM screen sees it.

   The Trainer License owns this key; the GM screen reads trainers out of it and
   writes small changes (an HP nudge, a status chip) straight back, so a Pokémon
   paralysed here is paralysed on its card and on the licence.

   Caveat worth knowing: the License page keeps its trainers in memory and does
   not watch this key, so if it is open it may write its own copy back over an HP
   change made here. Nothing to do about that from this side — it is how the card
   behaves too. */

interface WorkingSet {
    trainers: { id: string; name: string; fileName: string | null; data: TrainerState }[];
    active: number;
}

/* Parsed once per distinct raw string: the roster re-reads this on every render
   and JSON.parse of a whole campaign is not free. */
let cachedRaw: string | null = null;
let cachedParsed: WorkingSet | null = null;

export function readWorking(): WorkingSet | null {
    const raw = localStorage.getItem(WORKING_KEY);
    if (raw === cachedRaw) return cachedParsed;
    cachedRaw = raw;
    try { cachedParsed = raw ? JSON.parse(raw) : null; }
    catch { cachedParsed = null; }
    return cachedParsed;
}

export function invalidateWorking(): void {
    cachedRaw = null;
    cachedParsed = null;
}

export function workingTrainerData(id: string): TrainerState | null {
    const w = readWorking();
    const t = (w && Array.isArray(w.trainers)) ? w.trainers.find((x) => x.id === id) : null;
    return t ? t.data : null;
}

export type UpsertResult = 'added' | 'exists' | 'quota';

/** Register a file-loaded trainer in the shared working set so Pokémon cards
    opened from here read and write the same single copy the License page uses.
    If the id is already open there, that live copy wins over the file. */
export function upsertWorkingTrainer(data: TrainerState): UpsertResult {
    const w = readWorking() || { trainers: [], active: 0 };
    if (!Array.isArray(w.trainers)) w.trainers = [];
    if (w.trainers.some((t) => t.id === data.id)) return 'exists';
    w.trainers.push({ id: data.id, name: data.name, fileName: null, data });
    try { localStorage.setItem(WORKING_KEY, JSON.stringify(w)); }
    catch { return 'quota'; }
    return 'added';
}

/** Read-modify-write one trainer inside the shared set — the same shape of
    update the Pokémon card performs, so the two stay compatible. Re-reading
    immediately before the write keeps a concurrent edit from another tab from
    being rolled back by our stale copy. */
export function mutateWorkingTrainer(id: string, fn: (data: TrainerState) => void): boolean {
    const w = readWorking();
    const entry = (w && Array.isArray(w.trainers)) ? w.trainers.find((t) => t.id === id) : null;
    if (!entry || !entry.data) return false;
    fn(entry.data);
    try { localStorage.setItem(WORKING_KEY, JSON.stringify(w)); }
    catch {
        /* `w` came out of the parse cache and has already been mutated, so a
           failed write leaves it disagreeing with storage. Drop it or the bars
           would keep showing a change that was never kept. */
        invalidateWorking();
        return false;
    }
    return true;
}
