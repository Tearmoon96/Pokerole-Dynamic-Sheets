import { GmQuotaError, loadGmState, readGmState, writeGmState } from './state';
import { GM_KEY } from './constants';
import { invalidateWorking } from './workingSet';
import type { GmState } from './types';

/* One mutable store behind the GM screen, in the same shape as the two sheets'.

   The board is a lot of small independent widgets, and the original re-rendered
   whichever panel a change touched. React re-renders the tree instead, which is
   cheaper than the innerHTML rebuilds it replaces. */

type Listener = () => void;

export class GmStore {
    private listeners = new Set<Listener>();
    private version = 0;

    state: GmState;

    /* Warned once per session: a full quota fires on every keystroke once it
       first trips, and a toast storm would bury the message it carries. */
    private quotaWarned = false;
    onToast: ((html: string) => void) | null = null;

    /* The stored text as this tab last read or wrote it. Each tab holds the
       whole board and writes the whole board, so with the GM screen open in
       two tabs the one that changed something last wrote its copy over the
       other's — notes typed there, a fight advanced there, gone without a
       sign. A stored text that is not this one is another tab's write, and
       is taken in (syncFromStorage) instead of being written over. */
    private lastRaw: string | null = null;
    /** The last write was refused: this tab is ahead of storage, and reading
        storage back would undo what is on screen. */
    private behind = false;

    constructor(state?: GmState) {
        this.state = state ?? loadGmState();
        try { this.lastRaw = localStorage.getItem(GM_KEY); } catch { /* private mode */ }
    }

    subscribe = (cb: Listener): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    getSnapshot = (): number => this.version;

    notify(): void {
        this.version++;
        this.listeners.forEach((l) => l());
    }

    /** Apply a mutation to the board state, persist it and re-render. */
    update(mutate: (s: GmState) => void): void {
        const next = { ...this.state };
        mutate(next);
        this.state = next;
        this.save();
        this.notify();
    }

    /** Re-render without changing anything of our own — for when a write went
        into the shared working set instead. */
    refresh(): void {
        invalidateWorking();
        this.notify();
    }

    save(): void {
        try {
            this.lastRaw = writeGmState(this.state);
            this.quotaWarned = false;
            this.behind = false;
        } catch (e) {
            if (!(e instanceof GmQuotaError)) throw e;
            this.behind = true;
            if (!this.quotaWarned) {
                this.quotaWarned = true;
                this.onToast?.('<i class="fa-solid fa-triangle-exclamation"></i> Browser storage is full '
                    + '&mdash; GM screen changes are NOT being kept.');
            }
        }
    }

    /** Takes in the board another tab stored. True when it did. */
    syncFromStorage(): boolean {
        if (this.behind) return false;
        let raw: string | null = null;
        try { raw = localStorage.getItem(GM_KEY); } catch { return false; }
        if (raw === null || raw === this.lastRaw) return false;
        const stored = readGmState();
        if (!stored) return false;
        this.lastRaw = stored.raw;
        this.state = stored.state;
        invalidateWorking();
        this.notify();
        return true;
    }

    /** Replace everything — loading a session file. */
    replace(state: GmState): void {
        this.state = state;
        this.save();
        this.notify();
    }
}
