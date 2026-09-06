import { TRAINER_MARKER } from './constants';
import { genId } from './defaults';
import { normalizeState } from './normalize';
import { trainerJson } from './workingSet';
import type { WorkingTrainer } from './workingSet';
import { IDB_HANDLE_KEY, idbGet } from './idb';
import { dirEntries, rememberDirHandle } from '../lib/fileSystem';
import type { TrainerState } from './types';

/* Restoring the previous browser session, and checking it against disk.

   The working set in localStorage is only ever a mirror; the .json files are
   the real thing. So a restored session is provisional until it has been
   compared with the folder — and when the two disagree the user decides which
   one wins, rather than the app silently picking. */

export interface StoredSession {
    trainers: { id: string; name: string; fileName: string | null; data: TrainerState }[];
    active: number;
}

export interface DiskTrainer {
    entry: FileSystemFileHandle;
    fileName: string;
    data: TrainerState;
}

export interface RestoreConflict { name: string; reason: string }

export type RestoreVerdict =
    /* No folder access at all: nothing could be checked. */
    | { kind: 'unverified'; message: string }
    /* Read the folder and everything lined up. */
    | { kind: 'match'; message: string }
    /* Read the folder and something differs; the user has to choose. */
    | { kind: 'conflict'; conflicts: RestoreConflict[]; disk: DiskTrainer[] }
    /* The folder itself could not be read. */
    | { kind: 'unreadable'; message: string };

/** Rebuild working-set entries from a stored session. Handles are not
    serialisable, so they start null and are relinked by the disk check. */
export function sessionToTrainers(w: StoredSession): WorkingTrainer[] {
    return w.trainers.map((t) => ({
        id: t.id || genId(),
        handle: null,
        fileName: t.fileName || null,
        data: normalizeState(t.data),
        savedJson: undefined,
    }));
}

/** Compare the just-restored browser session to the files on disk, relinking
    each trainer to its file so Save All can write back. Mutates `trainers`. */
export async function verifyRestoreAgainstDisk(trainers: WorkingTrainer[]): Promise<RestoreVerdict> {
    const handle = await idbGet<FileSystemDirectoryHandle>(IDB_HANDLE_KEY);
    if (!handle || !window.showDirectoryPicker) {
        trainers.forEach((t) => { t.savedJson = undefined; });   // can't verify -> treat as unsaved
        return {
            kind: 'unverified',
            message: '<i class="fa-solid fa-triangle-exclamation"></i> Restored from the browser'
                + ' — not verified against disk. Save All to be safe.',
        };
    }

    let perm: PermissionState = handle.queryPermission
        ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
    if (perm !== 'granted' && handle.requestPermission) {
        perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (perm !== 'granted') {
        trainers.forEach((t) => { t.savedJson = undefined; });
        return {
            kind: 'unverified',
            message: '<i class="fa-solid fa-triangle-exclamation"></i> Folder access denied'
                + ' — restored data not verified against disk.',
        };
    }
    rememberDirHandle(handle);

    const disk: Record<string, DiskTrainer> = {};
    try {
        for await (const entry of dirEntries(handle)) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
                try {
                    const parsed = JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text());
                    if (parsed && parsed[TRAINER_MARKER]) {
                        const norm = normalizeState(parsed);
                        disk[norm.id] = { entry: entry as FileSystemFileHandle, fileName: entry.name, data: norm };
                    }
                } catch { /* skip bad file */ }
            }
        }
    } catch {
        return {
            kind: 'unreadable',
            message: '<i class="fa-solid fa-triangle-exclamation"></i> Could not read the folder to verify.',
        };
    }

    const conflicts: RestoreConflict[] = [];
    trainers.forEach((t) => {
        const d = disk[t.id];
        if (!d) {
            conflicts.push({ name: t.data.name || t.fileName || 'Unnamed', reason: 'not found on disk' });
            return;
        }
        t.handle = d.entry;              // relink so Save All writes back
        t.fileName = d.fileName;
        const diskJson = trainerJson({ data: d.data });
        if (trainerJson(t) === diskJson) t.savedJson = diskJson;
        else {
            t.savedJson = undefined;
            conflicts.push({ name: t.data.name || d.fileName, reason: 'differs from the file on disk' });
        }
    });

    if (conflicts.length) return { kind: 'conflict', conflicts, disk: Object.values(disk) };
    return {
        kind: 'match',
        message: '<i class="fa-solid fa-circle-check"></i> Restored session matches the files on disk.',
    };
}
