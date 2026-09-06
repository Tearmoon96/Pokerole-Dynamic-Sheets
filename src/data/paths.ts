/* Where the app looks for its data folder.

   Relative to the document, exactly as the old inline `DATA_BASE` line was, so
   app-data/ keeps sitting next to the pages and a GitHub Pages sub-path needs
   no configuration. Set `window.DATA_BASE` in the page shell before the app
   boots to point somewhere else — that is the same one-line escape hatch the
   README documents. */
declare global {
    interface Window { DATA_BASE?: string }
}

export const DATA_BASE: string = window.DATA_BASE ?? 'app-data/';

/** Shared base for every local sprite path. */
export const IMG_BASE = DATA_BASE + 'images/';

/** GitHub-raw fallback for any sprite that is not bundled locally. Absolute on purpose. */
export const GITHUB_RAW = 'https://raw.githubusercontent.com/Willowlark/Pokerole-Data/master';

/* The data bundles read a bare `DATA_BASE` off the global scope, so it has to
   be there before the first one is injected. */
window.DATA_BASE = DATA_BASE;

/* Whether the app is being served over the network rather than opened off the
   disk. The two cases genuinely differ — a service worker only exists on the
   first, `fetch` of a sibling file only works on the first, and a copy that
   updates itself only exists on the first — so the check is shared rather than
   spelled out separately wherever it matters. */
export function isHostedOrigin(): boolean {
    /* The UI comparison harness drives the original page and this one side by
       side over http, because that is the only way to script them both. The
       original has no notion of a hosted copy, so anything this flag hides or
       adds would read as a regression in every view that uses it. The harness
       sets __PDS_ASSUME_DISK__ on BOTH pages to compare like with like; nothing
       in the app ever sets it, and the hosted behaviour is checked separately. */
    if ((window as unknown as Record<string, unknown>).__PDS_ASSUME_DISK__) return false;
    return location.protocol === 'http:' || location.protocol === 'https:';
}
