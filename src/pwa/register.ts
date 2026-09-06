import { registerSW } from 'virtual:pwa-register';

/* The service worker is what makes this installable and usable with no network.

   It only exists on an http(s) origin. Opened straight off the disk the page
   still has navigator.serviceWorker — the property is there, it is the
   registration that is refused — so the protocol is what has to be checked, or
   double-clicking the .html throws before the sheet ever renders. Nothing on
   the page depends on it. */
export function registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    registerSW({
        immediate: true,
        /* A sheet open mid-session must never be swapped out from under the
           player. The new version is taken on the next load instead. */
        onNeedRefresh() { /* handled on next load */ },
        onOfflineReady() { /* nothing to say: it already worked offline */ },
    });
}
