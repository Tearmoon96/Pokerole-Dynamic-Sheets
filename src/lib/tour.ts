/* The guided tours: who has seen which, and where the one running is now.

   Every page has one (the rolling table two, the GM's and a player's), and
   whether to offer it is this browser's own business: one key,
   `{ never: page[], seen: tour[] }`. A tour is seen once finished or closed
   part-way; "Not now" leaves it unseen and asks again on the next load, but
   only once a load. "Don't ask again" is per page — the table's covers both
   of its tours.

   The store is read with useSyncExternalStore. While a step is up it can
   hold a folded panel open (`unfold`, never saved) and pick a view the page
   switches to (`view`: the table's Map / Table on a phone, the GM board's
   panel tab), so its target is on screen. */

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export type TourId = 'table-gm' | 'table-player' | 'license' | 'card' | 'gm' | 'map';
type TourPage = 'table' | 'license' | 'card' | 'gm' | 'map';

const TOUR_IDS: TourId[] = ['table-gm', 'table-player', 'license', 'card', 'gm', 'map'];
const PAGES: TourPage[] = ['table', 'license', 'card', 'gm', 'map'];
const pageOf = (id: TourId): TourPage => (id.startsWith('table') ? 'table' : id as TourPage);

export interface TourStep {
    id: string;
    title: string;
    body: ReactNode;
    /** Candidate selectors; the first VISIBLE match is lit. */
    target?: string[];
    /** Light every visible match together, as one box. */
    union?: boolean;
    /** Left out when no candidate is on the page at all. */
    optional?: boolean;
    /** A folded side panel held open while this step is up. */
    unfold?: string;
    /** A view the page switches to for this step (see `view`). */
    view?: string;
    links?: { label: string; href: string; icon: string }[];
    /** A live line under the text: has the other tool arrived yet? */
    status?: () => { ok: boolean; text: string } | null;
}

const KEY = 'pokerole_tours';

interface TourPrefs { never: TourPage[]; seen: TourId[] }

function prefs(): TourPrefs {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        return {
            never: Array.isArray(raw?.never) ? raw.never.filter((p: TourPage) => PAGES.includes(p)) : [],
            seen: Array.isArray(raw?.seen) ? raw.seen.filter((t: TourId) => TOUR_IDS.includes(t)) : [],
        };
    } catch {
        return { never: [], seen: [] };
    }
}

function save(p: TourPrefs): void {
    try { localStorage.setItem(KEY, JSON.stringify(p)); }
    catch { /* private mode: it will simply ask again */ }
}

function markSeen(id: TourId): void {
    const p = prefs();
    if (!p.seen.includes(id)) save({ ...p, seen: [...p.seen, id] });
}

/* Headless Chrome is every harness and the pixel comparison, each in a
   fresh profile: the question would sit over the page in all of them. The
   tour's own harness sets __PDS_TOUR__ to be asked anyway. Only the first-time
   question is held back; the ? buttons work everywhere. */
function automated(): boolean {
    const w = window as unknown as { __PDS_TOUR__?: boolean };
    return !w.__PDS_TOUR__ && /HeadlessChrome/.test(navigator.userAgent);
}

let asked = false;

/** Whether to offer `id`'s tour now: once a load at most, never after
    "Don't ask again" for its page, never once it has been taken. */
export function shouldAsk(id: TourId): boolean {
    if (asked || automated()) return false;
    const p = prefs();
    return !p.never.includes(pageOf(id)) && !p.seen.includes(id);
}

export interface TourState {
    /** The tour running, or null. */
    id: TourId | null;
    index: number;
    /** The first-time question is up, for this tour. */
    prompt: TourId | null;
    unfold: string | null;
    view: string | null;
}

let state: TourState = { id: null, index: 0, prompt: null, unfold: null, view: null };
const listeners = new Set<() => void>();

function set(patch: Partial<TourState>): void {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
}

export const tour = {
    subscribe(l: () => void) {
        listeners.add(l);
        return () => { listeners.delete(l); };
    },
    get: () => state,

    ask(id: TourId) { asked = true; set({ prompt: id }); },
    start(id: TourId) {
        asked = true;
        set({ id, index: 0, prompt: null, unfold: null, view: null });
    },
    go(index: number) { set({ index }); },
    /** What a step needs open, set by the overlay as each step comes up. */
    stage(unfold: string | null, view: string | null) {
        if (unfold !== state.unfold || view !== state.view) set({ unfold, view });
    },
    /** Finished or closed part-way: either way taken, and ? replays it. */
    stop() {
        if (state.id) markSeen(state.id);
        set({ id: null, index: 0, unfold: null, view: null });
    },
    /** "Not now": asked again on the next load. */
    dismiss() { set({ prompt: null }); },
    never() {
        const id = state.prompt;
        if (id) {
            const p = prefs();
            if (!p.never.includes(pageOf(id))) save({ ...p, never: [...p.never, pageOf(id)] });
        }
        set({ prompt: null });
    },
};

export function useTour(): TourState {
    return useSyncExternalStore(tour.subscribe, tour.get, tour.get);
}
