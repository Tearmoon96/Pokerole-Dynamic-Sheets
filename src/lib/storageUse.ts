/* How much of the browser's storage is used, and keeping what is in it.

   Everything the app remembers between visits — trainers, the GM board,
   maps, homebrew — is in localStorage, and the browser gives a site only so
   much of it: Chrome refused more after about 5.2 million characters,
   measured. Past that every save fails. So the pages say when it is getting
   full, and say loudly when a save did not happen.

   Storage is also the browser's to clear. `persist()` asks it not to when
   the device runs short; Safari on iPhone and iPad goes further and erases a
   site's stored data after a week without a visit unless the site was added
   to the Home Screen. Where the app cannot write a folder (Safari, Firefox)
   a downloaded backup is the only copy that lasts, so it is asked for. */

/** What Chrome allowed, in characters; the others are close to it. */
const CAPACITY_CHARS = 5_200_000;
const NEARLY_FULL = 0.8;
const BACKUP_KEY = 'pokerole_last_backup';
const BACKUP_STALE_DAYS = 7;

/** The share of the browser's storage in use, 0 to 1 (an estimate). */
export function storageShare(): number {
    let used = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) used += k.length + (localStorage.getItem(k) ?? '').length;
        }
    } catch { return 0; }
    return used / CAPACITY_CHARS;
}

let warned = false;

/** Says once per page load that storage is nearly full, if it is. */
export function warnIfNearlyFull(toast: (html: string) => void): void {
    if (warned) return;
    const share = storageShare();
    if (share < NEARLY_FULL) return;
    warned = true;
    toast('<i class="fa-solid fa-triangle-exclamation"></i> This browser’s storage is about '
        + Math.min(100, Math.round(share * 100)) + '% full. Save All, then close trainers or maps you are not using.');
}

/** Asks the browser to keep this site's data when the device runs short.
    Called from something the user did: Firefox asks them first. */
export function requestPersistence(): void {
    try {
        const s = navigator.storage;
        if (s && s.persist) void s.persist().catch(() => { /* refused: as before */ });
    } catch { /* no such API */ }
}

/** A save to files or a backup download just happened. */
export function noteBackup(): void {
    try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch { /* full, or private mode */ }
}

/** Whole days since the last save or backup; null when there never was one. */
export function daysSinceBackup(): number | null {
    try {
        const at = Number(localStorage.getItem(BACKUP_KEY));
        return at > 0 ? Math.floor((Date.now() - at) / 86_400_000) : null;
    } catch { return null; }
}

export function backupIsStale(): boolean {
    const days = daysSinceBackup();
    return days === null || days >= BACKUP_STALE_DAYS;
}

/** Safari on an iPhone or iPad, in a tab rather than from the Home Screen:
    the one place a site's stored data is erased after a week unvisited. */
export function needsHomeScreen(): boolean {
    try {
        const nav = navigator as Navigator & { standalone?: boolean };
        const ios = /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
        if (!ios) return false;
        return !(nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches);
    } catch { return false; }
}
