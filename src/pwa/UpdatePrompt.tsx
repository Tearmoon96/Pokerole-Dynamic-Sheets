import { useSyncExternalStore } from 'react';
import { applyUpdate, dismissUpdate, subscribeToUpdate, updateIsWaiting } from './register';

/* "A new version is ready" — the offer to take a waiting service worker.

   It has to be its own thing rather than a `useToast` call: the sheet's toast
   dismisses itself after 2.4 seconds, and an offer nobody was looking at when it
   appeared is an offer nobody gets. This one stays until it is answered.

   Reloading is safe to press at any moment — both sheets write every change
   straight to localStorage, so there is nothing held in memory to lose — but it
   IS a reload, so it says so rather than doing it quietly.

   The server-side snapshot never lies about a version; a browser can. Anyone
   chasing "the live site is missing a feature" should read the service-worker
   note in CLAUDE.md before touching the deploy. */
export function UpdatePrompt() {
    const waiting = useSyncExternalStore(subscribeToUpdate, updateIsWaiting, () => false);
    if (!waiting) return null;

    return (
        <div className="update-prompt" role="status">
            <i className="fa-solid fa-arrows-rotate update-prompt-icon"></i>
            <span className="update-prompt-text">
                A new version of the app is ready.
            </span>
            <button className="update-prompt-go" onClick={applyUpdate}>
                Reload now
            </button>
            <button
                className="update-prompt-later"
                title="Keep using this version — the offer comes back next time you open the page"
                onClick={dismissUpdate}
            >
                Later
            </button>
        </div>
    );
}
