import { GmQuotaError, loadGmState, writeGmState } from './state';
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

    constructor(state?: GmState) {
        this.state = state ?? loadGmState();
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
            writeGmState(this.state);
            this.quotaWarned = false;
        } catch (e) {
            if (!(e instanceof GmQuotaError)) throw e;
            if (!this.quotaWarned) {
                this.quotaWarned = true;
                this.onToast?.('<i class="fa-solid fa-triangle-exclamation"></i> Browser storage is full '
                    + '&mdash; GM screen changes are NOT being kept.');
            }
        }
    }

    /** Replace everything — loading a session file. */
    replace(state: GmState): void {
        this.state = state;
        this.save();
        this.notify();
    }
}
