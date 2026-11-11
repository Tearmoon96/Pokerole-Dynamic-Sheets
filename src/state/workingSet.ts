import { TRAINER_MARKER, TRAINER_ORDER_KEY, WORKING_KEY } from './constants';
import { defaultState } from './defaults';
import { normalizeState } from './normalize';
import type { TrainerEntry, TrainerState } from './types';
import { HOMEBREW_FIELD, homebrewFor } from '../data/homebrew';

/* The working set: every loaded / created trainer.

   It is the single source of truth, shared across tabs through localStorage, so
   a Pokémon card opened in another tab reads and writes the same JSON. The
   files on disk are only written when the user clicks Save All. */

/** A trainer as it sits in the working set, plus the disk snapshot used for
    dirty tracking. Handles are not serialisable and stay in memory. */
export interface WorkingTrainer extends TrainerEntry {
    /** The last on-disk snapshot; undefined for a trainer never written out. */
    savedJson?: string;
    /** The saved mark this trainer was stored with (`StoredTrainer.saved`),
        carried while `savedJson` is not known — a session restored and not
        yet checked against the folder. */
    storedMark?: string;
}

export interface StoredTrainer {
    id: string;
    name: string;
    fileName: string | null;
    data: TrainerState;
    /** A mark of the trainer as last written to its file (`savedMark`).
        The cards, the GM screen and the rolling table change `data` and
        leave this alone, so a stored trainer whose data no longer gives this
        mark has changes no file holds — which is what opening a folder
        checks before it replaces the browser's copy. Absent for a trainer
        never saved, or stored before the mark existed. */
    saved?: string;
}

interface StoredWorkingSet {
    trainers: StoredTrainer[];
    active: number;
}

/** A short mark of a trainer's file text: two 32-bit FNV-1a sums. Not a
    secret and not a signature, only a cheap "is this still that text". */
export function savedMark(json: string): string {
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < json.length; i++) {
        const c = json.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193);
        b = Math.imul(b ^ (c + i), 0x811c9dc5);
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36) + json.length.toString(36);
}

/* The mark of each trainer's saved text, worked out once per text: the
   working set is written on every keystroke. */
const marks = new Map<string, { json: string; mark: string }>();
function markOf(t: WorkingTrainer): string | undefined {
    if (t.savedJson == null) return t.storedMark;
    const had = marks.get(t.id);
    if (had && had.json === t.savedJson) return had.mark;
    const mark = savedMark(t.savedJson);
    marks.set(t.id, { json: t.savedJson, mark });
    return mark;
}

export function readWorkingSet(): StoredWorkingSet | null {
    try {
        const w = JSON.parse(localStorage.getItem(WORKING_KEY) || 'null');
        if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
        /* An entry that is not a trainer at all is no entry; what is inside
           one is normalizeState's to check. */
        if (Array.isArray(w.trainers)) {
            w.trainers = w.trainers.filter((t: unknown) => !!t && typeof t === 'object' && !Array.isArray(t)
                && !!(t as { data?: unknown }).data && typeof (t as { data?: unknown }).data === 'object');
            for (const t of w.trainers) {
                if (typeof t.id !== 'string') t.id = '';
                if (typeof t.name !== 'string') t.name = '';
                if (typeof t.fileName !== 'string') t.fileName = null;
            }
        }
        return w;
    } catch { return null; }
}

/** Thrown when localStorage refuses the write, so the caller can say so. The
    working set is the source of truth: a silent failure loses edits, and a card
    in another tab would go on reading the stale copy. */
export class WorkingSetQuotaError extends Error {}

export function writeWorkingSet(trainers: WorkingTrainer[], active: number): void {
    try {
        localStorage.setItem(WORKING_KEY, JSON.stringify({
            trainers: trainers.map((t) => {
                const saved = markOf(t);
                return { id: t.id, name: t.data.name, fileName: t.fileName, data: t.data, ...(saved ? { saved } : {}) };
            }),
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

/** The file carries the definition of every homebrew species on the team or
    in the boxes, so it opens anywhere (data/homebrew). */
export function trainerJson(t: Pick<WorkingTrainer, 'data'>): string {
    const mons = [...(t.data.team || []), ...(t.data.boxes || []).flatMap((b) => b.mons || [])];
    const homebrew = homebrewFor(mons.map((m) => m && m.dexId).filter(Boolean));
    return JSON.stringify({
        ...t.data,
        ...(homebrew.length ? { [HOMEBREW_FIELD]: homebrew } : null),
        [TRAINER_MARKER]: true,
    }, null, 2);
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

/* The order trainers were arranged in, kept apart from the working set.

   The working set already carries its trainers in order, so a restored session
   needs nothing more. This is for opening the folder again: files come back in
   whatever order the directory lists them, and without it the arrangement would
   be lost every time. It holds ids, never data, and only once the user has
   actually moved something — a folder nobody rearranged loads as it always did.
   Trainers not loaded right now keep their places at the end, so arranging one
   folder never forgets another's. */
export function readTrainerOrder(): string[] {
    try {
        const raw = JSON.parse(localStorage.getItem(TRAINER_ORDER_KEY) || 'null');
        return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
    } catch { return []; }
}

export function rememberTrainerOrder(ids: string[]): void {
    const rest = readTrainerOrder().filter((id) => !ids.includes(id));
    try { localStorage.setItem(TRAINER_ORDER_KEY, JSON.stringify([...ids, ...rest])); }
    catch { /* quota: the working set still holds this session's order */ }
}
