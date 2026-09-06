import { defaultState } from './defaults';
import { normalizeState } from './normalize';
import { STORAGE_KEY } from './constants';
import {
    anyDirty, isDirty, markSaved, mergeFromStorage, readWorkingSet, trainerJson,
    writeWorkingSet, WorkingSetQuotaError,
} from './workingSet';
import type { WorkingTrainer } from './workingSet';
import type { StoredSession } from './restore';
import type { TrainerState } from './types';

/* One mutable store behind the whole sheet.

   The original page kept a single `sheetState` global, mutated it in place and
   called a render function afterwards. That shape is kept here on purpose: the
   editing logic ports across unchanged, and React subscribes to the store
   through useSyncExternalStore instead of the page calling renderAll() by hand.

   Re-rendering the whole tree on every change is well within budget — the page
   it replaces rebuilt entire panels with innerHTML on each keystroke. */

type Listener = () => void;

export interface ToastRequest { html: string }

export class SheetStore {
    private listeners = new Set<Listener>();
    private version = 0;

    trainers: WorkingTrainer[];
    active = 0;
    dirHandle: FileSystemDirectoryHandle | null = null;

    /* Warned once per session: a full quota fires on every keystroke once it
       first trips, and a toast storm would bury the message it carries. */
    private quotaWarned = false;
    onToast: ((html: string) => void) | null = null;

    constructor(initial?: WorkingTrainer[], active = 0) {
        const first = initial && initial.length
            ? initial
            : [{ id: '', handle: null, fileName: null, data: defaultState() }];
        if (!first[0].id) first[0].id = first[0].data.id;
        this.trainers = first;
        this.active = Math.min(Math.max(0, active), this.trainers.length - 1);
    }

    /* ---- React glue ---- */
    subscribe = (cb: Listener): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    getSnapshot = (): number => this.version;

    notify(): void {
        this.version++;
        this.listeners.forEach((l) => l());
    }

    /* ---- The sheet currently being edited ---- */
    get sheet(): TrainerState {
        return (this.trainers[this.active] || this.trainers[0]).data;
    }

    get entry(): WorkingTrainer {
        return this.trainers[this.active] || this.trainers[0];
    }

    /** Apply a mutation to the active sheet, persist it and re-render.

        The mutator edits a shallow clone, so React sees a new object and any
        memoised child actually updates — but nested objects are shared until
        the mutator replaces them, exactly as the original code assumed. */
    update(mutate: (s: TrainerState) => void): void {
        const next = { ...this.sheet };
        mutate(next);
        const entry = this.entry;
        entry.data = next;
        entry.id = next.id;
        this.save();
        this.notify();
    }

    /** Persist without touching the sheet — for handle / selection changes. */
    save(): void {
        try {
            writeWorkingSet(this.trainers, this.active);
            this.quotaWarned = false;
        } catch (e) {
            if (!(e instanceof WorkingSetQuotaError)) throw e;
            if (!this.quotaWarned) {
                this.quotaWarned = true;
                this.onToast?.('<i class="fa-solid fa-triangle-exclamation"></i> Browser storage is '
                    + 'full — changes are NOT being kept. Save All now, then close a trainer.');
            }
        }
    }

    setActive(index: number): void {
        this.active = Math.min(Math.max(0, index), this.trainers.length - 1);
        this.save();
        this.notify();
    }

    /** Drop everything and show one fresh, unsaved trainer. */
    startBlank(): void {
        const data = defaultState();
        this.trainers = [{ id: data.id, handle: null, fileName: null, data, savedJson: undefined }];
        this.active = 0;
        this.notify();
    }

    /** Add a trainer alongside the current ones and switch to it. */
    addTrainer(entry: WorkingTrainer): void {
        this.trainers = [...this.trainers, entry];
        this.active = this.trainers.length - 1;
        this.save();
        this.notify();
    }

    /** Unload one trainer from the session. The file on disk is untouched. */
    removeTrainer(index: number): void {
        const next = this.trainers.filter((_, i) => i !== index);
        if (!next.length) { this.startBlank(); this.save(); return; }
        this.trainers = next;
        this.active = Math.min(this.active > index ? this.active - 1 : this.active, next.length - 1);
        this.save();
        this.notify();
    }

    setTrainers(trainers: WorkingTrainer[], active = 0): void {
        this.trainers = trainers.length
            ? trainers
            : [{ id: '', handle: null, fileName: null, data: defaultState() }];
        if (!this.trainers[0].id) this.trainers[0].id = this.trainers[0].data.id;
        this.active = Math.min(Math.max(0, active), this.trainers.length - 1);
        this.save();
        this.notify();
    }

    isDirty(t = this.entry): boolean { return isDirty(t); }
    anyDirty(): boolean { return anyDirty(this.trainers); }
    markSaved(t = this.entry): void { markSaved(t); this.notify(); }
    json(t = this.entry): string { return trainerJson(t); }

    /** A Pokémon card edited in another tab writes the working set; pull those
        changes back in when this tab regains focus. */
    syncFromStorage(): void {
        const merged = mergeFromStorage(this.trainers);
        if (!merged) return;
        this.trainers = merged;
        this.notify();
    }
}

/* The landing dialog, not an auto-restore.

   The working set in localStorage is a mirror of files the user owns, and
   silently reopening it would hide a session that has drifted from disk. So the
   page starts blank, snapshots what was there, and asks. */

/** What the previous session left behind, read once at boot. */
export function readPendingRestore(): StoredSession | null {
    const w = readWorkingSet();
    if (w && Array.isArray(w.trainers) && w.trainers.length) return w as StoredSession;
    /* Legacy single-sheet key, migrated on first run. */
    try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
            const data = normalizeState(JSON.parse(legacy));
            return { trainers: [{ id: data.id, name: data.name, fileName: null, data }], active: 0 };
        }
    } catch { /* unparseable leftovers are not worth a failed boot */ }
    return null;
}

/** A fresh, unsaved trainer — what the page shows before the user chooses. */
export function createBlankStore(): SheetStore {
    return new SheetStore();
}
