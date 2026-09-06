import { IDB_COREBOOK_KEY, idbGet, idbSet } from '../state/idb';
import { dirEntries } from './fileSystem';
import { CORE_BOOK_DIR_NAME, MANUALS, manualJsonFor } from './manuals';
import type { ManualBookmark } from './manuals';

/* User-added editions are NOT stored on the trainer. Their default quick links
   live in the Core Book folder as one JSON file per edition, named like its PDF
   ("Pokerole Core Book <label>.json"). The folder sits beside the working
   folder, so it needs its own read/write handle — picked once and cached in
   IndexedDB. (Custom bookmarks stay on the trainer.) */

export interface CoreBookVersion { label: string; bookmarks: ManualBookmark[] }

let coreBookHandle: FileSystemDirectoryHandle | null = null;

/** Resolve a read/write handle to the Core Book folder. `pick` allows popping
    the folder picker when there is no cached handle; without it we only reuse
    (and, if needed, re-authorize) a handle chosen before. */
export async function coreBookDir(pick: boolean): Promise<FileSystemDirectoryHandle | null> {
    let handle = coreBookHandle || await idbGet<FileSystemDirectoryHandle>(IDB_COREBOOK_KEY);
    if (!handle) {
        if (!pick || !window.showDirectoryPicker) return null;
        try {
            handle = await window.showDirectoryPicker({ id: 'pokerole-corebook', mode: 'readwrite' });
        } catch { return null; }   // user cancelled the picker
        if (handle.name !== CORE_BOOK_DIR_NAME) {
            alert('Please choose the "' + CORE_BOOK_DIR_NAME + '" folder (you chose "'
                + handle.name + '").');
            return null;
        }
    }
    if (!handle.queryPermission) return null;
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && handle.requestPermission) {
        perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (perm !== 'granted') return null;
    coreBookHandle = handle;
    idbSet(IDB_COREBOOK_KEY, handle);
    return handle;
}

/** Read every "Pokerole Core Book <label>.json" into a list. Uses a cached
    handle only (never pops the picker), so opening the manual with no folder
    authorized just shows the built-in editions. */
export async function loadCoreBookVersions(): Promise<CoreBookVersion[]> {
    const out: CoreBookVersion[] = [];
    const dir = await coreBookDir(false);
    if (!dir) return out;
    try {
        for await (const entry of dirEntries(dir)) {
            if (entry.kind !== 'file') continue;
            const mtch = entry.name.match(/^Pokerole Core Book (.+)\.json$/i);
            if (!mtch) continue;
            const label = mtch[1];
            if (MANUALS.some((m) => m.label.toLowerCase() === label.toLowerCase())) continue;
            try {
                const data = JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text());
                out.push({ label, bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [] });
            } catch { /* skip an unreadable / invalid edition file */ }
        }
        out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    } catch (e) { console.warn('Reading Core Book editions failed', e); }
    return out;
}

/** Create or overwrite one edition's default-quick-links file. */
export async function writeCoreBookVersion(label: string, bookmarks: ManualBookmark[]): Promise<boolean> {
    const dir = await coreBookDir(true);
    if (!dir) return false;
    try {
        const fh = await dir.getFileHandle(manualJsonFor(label), { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify({ label, bookmarks }, null, 2));
        await w.close();
        return true;
    } catch (e) { console.warn('Core Book edition save failed', e); return false; }
}

export async function deleteCoreBookVersionFile(label: string): Promise<boolean> {
    const dir = await coreBookDir(true);
    if (!dir) return false;
    try { await dir.removeEntry(manualJsonFor(label)); return true; }
    catch (e) {
        if (e && (e as DOMException).name === 'NotFoundError') return true;   // already gone
        console.warn('Core Book edition delete failed', e);
        return false;
    }
}
