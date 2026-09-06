import { TRAINER_MARKER, WORKING_KEY } from './constants';
import { defaultState } from './defaults';
import { normalizeState } from './normalize';
import type { TrainerEntry, TrainerState } from './types';

/* The working set: every loaded / created trainer.

   It is the single source of truth, shared across tabs through localStorage, so
   a Pokémon card opened in another tab reads and writes the same JSON. The
   files on disk are only written when the user clicks Save All. */

/** A trainer as it sits in the working set, plus the disk snapshot used for
    dirty tracking. Handles are not serialisable and stay in memory. */
export interface WorkingTrainer extends TrainerEntry {
    /** The last on-disk snapshot; undefined for a trainer never written out. */
    savedJson?: string;
}

interface StoredWorkingSet {
    trainers: { id: string; name: string; fileName: string | null; data: TrainerState }[];
    active: number;
}

export function readWorkingSet(): StoredWorkingSet | null {
    try { return JSON.parse(localStorage.getItem(WORKING_KEY) || 'null') || null; }
    catch { return null; }
}

/** Thrown when localStorage refuses the write, so the caller can say so. The
    working set is the source of truth: a silent failure loses edits, and a card
    in another tab would go on reading the stale copy. */
export class WorkingSetQuotaError extends Error {}

export function writeWorkingSet(trainers: WorkingTrainer[], active: number): void {
    try {
        localStorage.setItem(WORKING_KEY, JSON.stringify({
            trainers: trainers.map((t) => ({ id: t.id, name: t.data.name, fileName: t.fileName, data: t.data })),
            active,
        } satisfies StoredWorkingSet));
    } catch (e) {
        console.warn('Working set not saved (storage full?)', e);
        throw new WorkingSetQuotaError('Browser storage is full');
    }
}

export function trainerFileName(t: Pick<WorkingTrainer, 'fileName' | 'data'>): string {
    return t.fileName
        || ('trainer-' + ((t.data.name || 'trainer').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() || 'trainer') + '.json');
}

export function trainerJson(t: Pick<WorkingTrainer, 'data'>): string {
    return JSON.stringify({ ...t.data, [TRAINER_MARKER]: true }, null, 2);
}

/* ---- Unsaved-changes (dirty) tracking ----
   A trainer is "dirty" when its content differs from what is on disk.
   `savedJson` holds the last on-disk snapshot. A trainer never written to a
   file compares against a fresh default, so an untouched placeholder reads as
   clean while any edit — or a loaded-but-unsaved trainer — reads as dirty. */
export function cleanBaseline(t: WorkingTrainer): string {
    if (t.savedJson != null) return t.savedJson;
    return trainerJson({ data: { ...defaultState(), id: t.data.id } });
}

export function isDirty(t: WorkingTrainer): boolean {
    return trainerJson(t) !== cleanBaseline(t);
}

export function anyDirty(trainers: WorkingTrainer[]): boolean {
    return trainers.some(isDirty);
}

export function markSaved(t: WorkingTrainer): void {
    t.savedJson = trainerJson(t);
}

/** Rebuild in-memory trainers from what another tab left in localStorage,
    keeping the file handles this tab holds. */
export function mergeFromStorage(current: WorkingTrainer[]): WorkingTrainer[] | null {
    const w = readWorkingSet();
    if (!w || !Array.isArray(w.trainers)) return null;
    let changed = false;
    const next = current.map((t) => {
        const wt = w.trainers.find((x) => x.id === t.id);
        if (!wt) return t;
        changed = true;
        return { ...t, data: normalizeState(wt.data) };
    });
    return changed ? next : null;
}
