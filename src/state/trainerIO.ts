import { TRAINER_MARKER } from './constants';
import { genId } from './defaults';
import { normalizeState } from './normalize';
import { markSaved, readTrainerOrder, trainerFileName, trainerJson } from './workingSet';
import { sortByOrder } from '../lib/reorder';
import type { WorkingTrainer } from './workingSet';
import { dirEntries, ensureWorkingFolderScaffold, getDirHandle, rememberDirHandle } from '../lib/fileSystem';
import { showAlert } from '../lib/dialog';
import { escapeHtml } from '../lib/html';

/* Reading and writing the trainer .json files.

   Two paths throughout: the File System Access API when the browser has it
   (Chromium), which writes straight back into the working folder, and a plain
   download when it does not. Nothing here ever loses a file silently — every
   failure either falls back to a download or says why it stopped. */

export interface FolderDiagnostics {
    json: number;
    marked: number;
    skipped: string[];
}

export interface FolderLoad {
    loaded: WorkingTrainer[];
    diag: FolderDiagnostics;
    /** Set when the load could not even start; the caller reports it. */
    error?: string;
    /** The user closed the picker — not an error, just nothing to do. */
    cancelled?: boolean;
}

function blankDiag(): FolderDiagnostics { return { json: 0, marked: 0, skipped: [] }; }

/** Read every marked trainer .json out of a folder the user picks. */
export async function pickWorkingFolder(): Promise<FolderLoad> {
    if (!window.showDirectoryPicker) return { loaded: [], diag: blankDiag(), cancelled: true };

    let handle: FileSystemDirectoryHandle;
    try {
        handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch {
        return { loaded: [], diag: blankDiag(), cancelled: true };   // user cancelled the picker
    }
    rememberDirHandle(handle);

    /* Read the trainers FIRST; scaffolding happens afterwards so it can never
       block or perturb the directory enumeration. */
    const loaded: WorkingTrainer[] = [];
    const diag = blankDiag();
    try {
        for await (const entry of dirEntries(handle)) {
            if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
            diag.json++;
            try {
                const file = await (entry as FileSystemFileHandle).getFile();
                const parsed = JSON.parse(await file.text());
                if (parsed && parsed[TRAINER_MARKER]) {
                    diag.marked++;
                    loaded.push({
                        id: '', handle: entry as FileSystemFileHandle,
                        fileName: entry.name, data: normalizeState(parsed),
                    });
                }
            } catch (e) { diag.skipped.push(entry.name + ' (' + (e as Error).message + ')'); }
        }
    } catch (e) {
        return { loaded: [], diag, error: 'Could not read the folder: ' + (e as Error).message };
    }

    ensureWorkingFolderScaffold(handle);   // fire-and-forget; must not block loading
    return { loaded, diag };
}

/** Fallback path: <input webkitdirectory> gives files but no write-back. */
export async function readTrainerFiles(files: File[]): Promise<WorkingTrainer[]> {
    const loaded: WorkingTrainer[] = [];
    for (const file of files.filter((f) => f.name.toLowerCase().endsWith('.json'))) {
        try {
            const parsed = JSON.parse(await file.text());
            if (parsed && parsed[TRAINER_MARKER]) {
                loaded.push({ id: '', handle: null, fileName: file.name, data: normalizeState(parsed) });
            }
        } catch { /* skip */ }
    }
    return loaded;
}

/** Give every loaded trainer a unique id and mark it in sync with disk. */
export function adoptLoadedTrainers(loaded: WorkingTrainer[]): WorkingTrainer[] {
    const seen = new Set<string>();
    loaded.forEach((t) => {
        t.id = t.data.id;
        if (!t.id || seen.has(t.id)) { t.id = genId(); t.data.id = t.id; }
        seen.add(t.id);
        markSaved(t);   // freshly loaded == in sync with disk
    });
    return sortByOrder(loaded, (t) => t.id, readTrainerOrder());
}

function download(json: string, fileName: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/* A name in the folder is free for a trainer when no file has it, or the
   file that has it is that trainer's own.

   `getFileHandle(name, { create: true })` hands back an existing file as
   readily as a new one, and writing to it empties it first. So a new trainer
   given a name already in the folder — `trainer-new` is offered every time —
   silently replaced whoever's file that was, and from then on both trainers
   were written to the one file, the last over the first. */
async function heldByAnother(dir: FileSystemDirectoryHandle, name: string, id: string): Promise<boolean> {
    let file: File;
    try {
        file = await (await dir.getFileHandle(name)).getFile();
    } catch {
        return false;   // no such file
    }
    if (file.size === 0) return false;
    try {
        const parsed = JSON.parse(await file.text());
        return !(parsed && parsed[TRAINER_MARKER] && parsed.id === id);
    } catch {
        return true;    // something else's file: not ours to replace
    }
}

/** Whether the folder already has a file of this name, whatever is in it. */
export async function nameInFolder(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    try { await dir.getFileHandle(name); return true; } catch { return false; }
}

/** `ash.json`, then `ash-2.json`, `ash-3.json`… until `taken` says no. */
async function firstFree(wanted: string, taken: (name: string) => Promise<boolean> | boolean): Promise<string> {
    const base = wanted.replace(/\.json$/i, '');
    for (let n = 1; ; n++) {
        const name = (n === 1 ? base : base + '-' + n) + '.json';
        if (!await taken(name)) return name;
    }
}

/** The first of `trainer-new`, `trainer-new-2`… no loaded trainer uses. */
export function freeTrainerBase(trainers: Pick<WorkingTrainer, 'fileName'>[], wanted = 'trainer-new'): string {
    const used = new Set(trainers.map((t) => (t.fileName || '').toLowerCase()));
    for (let n = 1; ; n++) {
        const base = n === 1 ? wanted : wanted + '-' + n;
        if (!used.has(base + '.json')) return base;
    }
}

export interface SaveOutcome {
    ok: boolean;
    /** True when the files went to the Downloads folder instead. */
    downloaded: boolean;
    message: string;
}

/** Save every loaded trainer back to its JSON file. */
export async function saveAllTrainers(trainers: WorkingTrainer[]): Promise<SaveOutcome> {
    const plural = (n: number) => n === 1 ? '' : 's';

    if (window.showDirectoryPicker) {
        try {
            let dir = getDirHandle();
            if (!dir) {
                dir = await window.showDirectoryPicker({ mode: 'readwrite' });
                rememberDirHandle(dir);
                ensureWorkingFolderScaffold(dir);
            }
            if (dir.requestPermission) {
                const perm = await dir.requestPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    return { ok: false, downloaded: false, message: 'Write permission was denied.' };
                }
            }
            /* One file a trainer. Two that ended up on the same file (see
               heldByAnother) are parted here: the first keeps it, the other
               is given a file of its own below. */
            const moved: string[] = [];
            for (let i = 0; i < trainers.length; i++) {
                const h = trainers[i].handle;
                if (!h) continue;
                for (let j = 0; j < i; j++) {
                    const other = trainers[j].handle;
                    if (other && await h.isSameEntry(other)) { trainers[i].handle = null; break; }
                }
            }
            const names = new Set(trainers.filter((t) => t.handle).map((t) => (t.fileName || '').toLowerCase()));
            for (const t of trainers) {
                if (!t.handle) {
                    const wanted = trainerFileName(t);
                    const name = await firstFree(wanted,
                        async (n) => names.has(n.toLowerCase()) || await heldByAnother(dir!, n, t.id));
                    if (name !== wanted) moved.push(escapeHtml(t.data.name || 'A trainer') + ' is now in ' + escapeHtml(name));
                    t.handle = await dir.getFileHandle(name, { create: true });
                    t.fileName = t.handle.name;
                    names.add(name.toLowerCase());
                }
                const writable = await t.handle.createWritable();
                await writable.write(trainerJson(t));
                await writable.close();
                markSaved(t);
            }
            return {
                ok: true, downloaded: false,
                message: '<i class="fa-solid fa-circle-check"></i> Saved ' + trainers.length
                    + ' trainer' + plural(trainers.length) + ' to the folder'
                    + (moved.length ? ' — ' + moved.join('; ') + '.' : ''),
            };
        } catch (e) {
            console.error(e);
            /* The folder refused the write; the data still has to land
               somewhere, so it goes to Downloads and the user is told. The
               trainers stay marked unsaved: a browser may hold back all but
               the first of several downloads, and "saved" would then be a
               claim nothing checked. */
            downloadAllTrainers(trainers, false);
            return {
                ok: false, downloaded: true,
                message: 'Could not write to the folder (' + (e as Error).message
                    + ').\nDownloading the files instead.',
            };
        }
    }
    downloadAllTrainers(trainers, true);
    return {
        ok: true, downloaded: true,
        message: '<i class="fa-solid fa-download"></i> Downloaded ' + trainers.length + ' trainer file(s)',
    };
}

/** Download a copy of every loaded trainer's JSON.

    `clearsDirty` is what separates Save All's fallback from the manual backup
    button: the backup is an extra copy in Downloads, not the canonical save, so
    it must not clear the unsaved-changes indicator. */
export function downloadAllTrainers(trainers: WorkingTrainer[], clearsDirty: boolean): void {
    trainers.forEach((t) => {
        download(trainerJson(t), trainerFileName(t));
        if (clearsDirty) markSaved(t);
    });
}

/** Write one trainer entry to a .json, preferring the open working folder, then
    a save dialog, then a plain download. Returns null if the user cancels or the
    write fails, so the caller can abort. */
export async function writeTrainerFile(
    entry: WorkingTrainer, fname: string,
): Promise<{ message: string } | null> {
    const json = trainerJson(entry);
    const dir = getDirHandle();

    if (dir) {
        try {
            if (dir.requestPermission) {
                const perm = await dir.requestPermission({ mode: 'readwrite' });
                if (perm !== 'granted') { void showAlert('Write permission was denied.', { title: 'Not saved', icon: 'fa-lock' }); return null; }
            }
            /* Never over a file that is already there (see heldByAnother). */
            if (await nameInFolder(dir, fname)) {
                void showAlert('The folder already has a file named ' + fname + '.\nChoose another name: creating this one would replace it.',
                    { title: 'Name already used', icon: 'fa-triangle-exclamation' });
                return null;
            }
            const h = await dir.getFileHandle(fname, { create: true });
            const w = await h.createWritable();
            await w.write(json);
            await w.close();
            entry.handle = h;
            entry.fileName = h.name;
            return { message: '<i class="fa-solid fa-circle-check"></i> Saved ' + escapeHtml(entry.fileName) + ' to the folder' };
        } catch (e) { void showAlert('Could not save the file: ' + (e as Error).message, { title: 'Not saved', icon: 'fa-triangle-exclamation' }); return null; }
    }

    if (window.showSaveFilePicker) {
        try {
            const h = await window.showSaveFilePicker({
                suggestedName: fname,
                types: [{ description: 'Trainer JSON', accept: { 'application/json': ['.json'] } }],
            });
            const w = await h.createWritable();
            await w.write(json);
            await w.close();
            entry.handle = h;
            entry.fileName = h.name;
            return { message: '<i class="fa-solid fa-circle-check"></i> Saved ' + escapeHtml(entry.fileName) };
        } catch { return null; }   // user cancelled the save dialog
    }

    // No File System Access API: fall back to a download
    download(json, fname);
    entry.fileName = fname;
    return { message: '<i class="fa-solid fa-download"></i> Downloaded ' + escapeHtml(fname) };
}
