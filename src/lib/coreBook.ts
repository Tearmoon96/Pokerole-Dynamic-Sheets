import { IDB_COREBOOK_KEY, idbGet, idbSet } from '../state/idb';
import { dirEntries } from './fileSystem';
import { MANUALS, manualJsonFor } from './manuals';
import type { ManualBookmark } from './manuals';

/* The manuals folder: wherever the reader keeps their Core Book PDFs.

   By default the picker opens "Pokerole Core Book/<file>.pdf" by a relative
   URL, which only works when the folder sits beside the pages — and never on
   the hosted site, where the PDFs are not shipped at all. Choosing a folder
   (the button in the manual picker) gives a handle instead: the PDF is read
   through it and opened from a blob URL, so the book can live anywhere, and
   the edition list is whatever "Pokerole Core Book <label>.pdf" files the
   folder holds.

   User-added editions are NOT stored on the trainer. Their default quick
   links live in that same folder as one JSON file per edition, named like its
   PDF ("Pokerole Core Book <label>.json"), so every trainer shares them.
   (Custom bookmarks stay on the trainer.) The handle is picked once and
   cached in IndexedDB. */

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

/** Choose (or re-choose) the manuals folder. Null when the picker was
    cancelled or the browser has no File System Access API. */
export async function pickCoreBookDir(): Promise<FileSystemDirectoryHandle | null> {
    if (!window.showDirectoryPicker) return null;
    let handle: FileSystemDirectoryHandle;
    try {
        handle = await window.showDirectoryPicker({ id: 'pokerole-corebook', mode: 'readwrite' });
    } catch { return null; }
    coreBookHandle = handle;
    await idbSet(IDB_COREBOOK_KEY, handle);
    return coreBookDir(false);
}

/** The folder's name, for the picker to show, or null when none is chosen
    (or the cached one cannot be reached without asking). */
export async function coreBookDirName(): Promise<string | null> {
    const dir = await coreBookDir(false);
    return dir ? dir.name : null;
}

export interface CoreBookFolder {
    /** User-added editions, from their JSON files and from any PDF the folder
        holds that no built-in edition claims. */
    versions: CoreBookVersion[];
    /** Every PDF file name in the folder, so the picker can say which
        editions are actually there to open. */
    pdfs: Set<string>;
}

/** Read the manuals folder: every "Pokerole Core Book <label>.json" and
    every PDF. Uses a cached handle only (never pops the picker), so opening
    the manual with no folder chosen just shows the built-in editions. */
export async function loadCoreBookFolder(): Promise<CoreBookFolder> {
    const out: CoreBookFolder = { versions: [], pdfs: new Set() };
    const dir = await coreBookDir(false);
    if (!dir) return out;
    const isBuiltIn = (label: string) => MANUALS.some((m) => m.label.toLowerCase() === label.toLowerCase());
    const pdfLabels: string[] = [];
    try {
        for await (const entry of dirEntries(dir)) {
            if (entry.kind !== 'file') continue;
            if (/\.pdf$/i.test(entry.name)) {
                out.pdfs.add(entry.name);
                const m = entry.name.match(/^Pokerole Core Book (.+)\.pdf$/i);
                if (m && !isBuiltIn(m[1])) pdfLabels.push(m[1]);
                continue;
            }
            const mtch = entry.name.match(/^Pokerole Core Book (.+)\.json$/i);
            if (!mtch) continue;
            const label = mtch[1];
            if (isBuiltIn(label)) continue;
            try {
                const data = JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text());
                out.versions.push({ label, bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [] });
            } catch { /* skip an unreadable / invalid edition file */ }
        }
        /* A PDF with no quick-link file yet is still an edition: it shows up
           with an empty list, and the pen on it writes the file. */
        pdfLabels.forEach((label) => {
            if (!out.versions.some((v) => v.label.toLowerCase() === label.toLowerCase())) {
                out.versions.push({ label, bookmarks: [] });
            }
        });
        out.versions.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    } catch (e) { console.warn('Reading the manuals folder failed', e); }
    return out;
}

/** Kept for callers that only want the editions. */
export async function loadCoreBookVersions(): Promise<CoreBookVersion[]> {
    return (await loadCoreBookFolder()).versions;
}

/** Open a PDF out of the chosen folder in a new tab, at `page`. False when
    there is no folder, or the folder has no such file — the caller then
    falls back to the relative URL beside the pages. The blob URL is never
    revoked: the tab it opened in needs it for as long as it is open. */
export async function openCoreBookPdf(file: string, page: number): Promise<boolean> {
    const dir = await coreBookDir(false);
    if (!dir) return false;
    try {
        const fh = await dir.getFileHandle(file);
        const blob = await fh.getFile();
        const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
        window.open(url + '#page=' + (page || 1), '_blank');
        return true;
    } catch { return false; }
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
