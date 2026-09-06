import { TRAINER_MARKER } from './constants';
import { genId } from './defaults';
import { normalizeState } from './normalize';
import { markSaved, trainerFileName, trainerJson } from './workingSet';
import type { WorkingTrainer } from './workingSet';
import { dirEntries, ensureWorkingFolderScaffold, getDirHandle, rememberDirHandle } from '../lib/fileSystem';

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
    return loaded;
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
            for (const t of trainers) {
                if (!t.handle) {
                    t.handle = await dir.getFileHandle(trainerFileName(t), { create: true });
                    t.fileName = t.handle.name;
                }
                const writable = await t.handle.createWritable();
                await writable.write(trainerJson(t));
                await writable.close();
                markSaved(t);
            }
            return {
                ok: true, downloaded: false,
                message: '<i class="fa-solid fa-circle-check"></i> Saved ' + trainers.length
                    + ' trainer' + plural(trainers.length) + ' to the folder',
            };
        } catch (e) {
            console.error(e);
            /* The folder refused the write; the data still has to land
               somewhere, so it goes to Downloads and the user is told. */
            downloadAllTrainers(trainers, true);
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
                if (perm !== 'granted') { alert('Write permission was denied.'); return null; }
            }
            const h = await dir.getFileHandle(fname, { create: true });
            const w = await h.createWritable();
            await w.write(json);
            await w.close();
            entry.handle = h;
            entry.fileName = h.name;
            return { message: '<i class="fa-solid fa-circle-check"></i> Saved ' + entry.fileName + ' to the folder' };
        } catch (e) { alert('Could not save the file: ' + (e as Error).message); return null; }
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
            return { message: '<i class="fa-solid fa-circle-check"></i> Saved ' + entry.fileName };
        } catch { return null; }   // user cancelled the save dialog
    }

    // No File System Access API: fall back to a download
    download(json, fname);
    entry.fileName = fname;
    return { message: '<i class="fa-solid fa-download"></i> Downloaded ' + fname };
}
