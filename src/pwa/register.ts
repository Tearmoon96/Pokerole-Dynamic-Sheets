import { registerSW } from 'virtual:pwa-register';

/* The service worker is what makes this installable and usable with no network.

   It only exists on an http(s) origin. Opened straight off the disk the page
   still has navigator.serviceWorker — the property is there, it is the
   registration that is refused — so the protocol is what has to be checked, or
   double-clicking the .html throws before the sheet ever renders. Nothing on
   the page depends on it.

   ---

   Updates are OFFERED, never taken. `registerType: 'prompt'` in vite.config.ts
   means a new worker installs and then stops at `waiting`; it takes over only
   when something posts SKIP_WAITING. That is deliberate — a sheet open at the
   table must not have its assets swapped mid-session — but it used to be paired
   with an empty `onNeedRefresh`, and the comment claiming "the new version is
   taken on the next load instead" was simply false.

   A waiting worker activates when EVERY client of the old one is gone, and a
   reload does not release the client, it replaces it. Measured: six reloads
   with the tab open, still the old build every time, `registration.waiting`
   true throughout. The page only changed after navigating away and back. Since
   the worker also serves the precached HTML, that visitor keeps being handed an
   old page naming an old bundle — for as long as they keep the tab open, which
   for this app can be a whole session or longer.

   So the waiting worker is now surfaced: `UpdatePrompt` renders a bar offering
   the reload, and `applyUpdate()` is the only thing that takes it. The reload
   itself comes from workbox-window, which listens for `controlling` and
   reloads once the new worker is in charge. */

type Updater = (reloadPage?: boolean) => Promise<void>;

let updater: Updater | null = null;
let waiting = false;
const listeners = new Set<() => void>();

function announce(): void {
    listeners.forEach((fn) => fn());
}

export function registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    updater = registerSW({
        immediate: true,
        /* Fires for a worker that becomes ready now AND for one already sitting
           in `waiting` when the page registers — workbox-window checks for both,
           which is what makes the offer survive a reload. */
        onNeedRefresh() { waiting = true; announce(); },
        onOfflineReady() { /* nothing to say: it already worked offline */ },
    });
}

/* A tiny store rather than a context: the four pages have four separate React
   roots and the registration happens outside all of them. */
export function subscribeToUpdate(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export function updateIsWaiting(): boolean {
    return waiting;
}

/** Take the waiting version. The page reloads itself once it is in charge. */
export function applyUpdate(): void {
    if (!updater) { location.reload(); return; }
    void updater(true);
}

/** Not now. The offer comes back on the next load, since the worker is still
    waiting and `onNeedRefresh` fires again. */
export function dismissUpdate(): void {
    waiting = false;
    announce();
}
