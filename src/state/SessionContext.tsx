import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from './SheetContext';
import { defaultState } from './defaults';
import { anyDirty, markSaved } from './workingSet';
import type { WorkingTrainer } from './workingSet';
import {
    adoptLoadedTrainers, downloadAllTrainers, pickWorkingFolder, readTrainerFiles,
    saveAllTrainers, writeTrainerFile,
} from './trainerIO';
import type { FolderDiagnostics } from './trainerIO';
import { readPendingRestore } from './store';
import { sessionToTrainers, verifyRestoreAgainstDisk } from './restore';
import type { DiskTrainer, RestoreConflict, StoredSession } from './restore';
import { useToast } from '../components/common/Toast';

/* Session-level actions: which trainers are loaded, where they came from, and
   everything that writes them back to disk.

   The dialogs these raise are rendered by <SessionDialogs>, so a component that
   only needs "save all" imports the action and nothing else. */

export interface SessionValue {
    /** The previous browser session, if there is one to offer. */
    pendingRestore: StoredSession | null;
    landingOpen: boolean;
    closeLanding: () => void;
    restoreLastSession: () => Promise<void>;
    startBlank: () => void;

    openWorkingFolder: () => void;
    saveAll: () => Promise<void>;
    backupAll: () => void;
    newTrainer: () => void;

    trainerPickerOpen: boolean;
    setTrainerPickerOpen: (open: boolean) => void;
    requestCloseTrainer: (index: number) => void;

    /* Dialog state the renderer below owns. */
    dialogs: DialogState;
    setDialogs: (next: DialogState) => void;
}

export interface DialogState {
    discardOpen: boolean;
    newTrainerName: string | null;
    noTrainers: FolderDiagnostics | null;
    conflict: { conflicts: RestoreConflict[]; disk: DiskTrainer[] } | null;
    closeTrainer: number | null;
}

const EMPTY_DIALOGS: DialogState = {
    discardOpen: false, newTrainerName: null, noTrainers: null, conflict: null, closeTrainer: null,
};

const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useSession must be used inside <SessionProvider>');
    return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const store = useStore();
    const toast = useToast();

    /* Snapshotted once: everything below writes the working set, and the offer
       has to describe the session as it was when the page opened. */
    const pendingRestore = useRef<StoredSession | null>(null);
    if (pendingRestore.current === undefined as never) pendingRestore.current = null;

    const [landingOpen, setLandingOpen] = useState(false);
    const [trainerPickerOpen, setTrainerPickerOpen] = useState(false);
    const [dialogs, setDialogs] = useState<DialogState>(EMPTY_DIALOGS);
    const booted = useRef(false);

    /* Boot: start blank, then either jump straight to the trainer named on the
       URL (that is how the GM screen links in) or stop at the landing. */
    useEffect(() => {
        if (booted.current) return;
        booted.current = true;
        pendingRestore.current = readPendingRestore();
        store.startBlank();

        const wanted = new URLSearchParams(location.search).get('trainer');
        const w = pendingRestore.current;
        const i = (wanted && w) ? w.trainers.findIndex((t) => t && t.id === wanted) : -1;
        if (i >= 0 && w) {
            const trainers = sessionToTrainers(w);
            store.setTrainers(trainers, i);
            /* Not awaited: it only settles the dirty marks. */
            verify(trainers);
        } else {
            setLandingOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const verify = useCallback(async (trainers: WorkingTrainer[]) => {
        const verdict = await verifyRestoreAgainstDisk(trainers);
        store.notify();
        if (verdict.kind === 'conflict') {
            setDialogs((d) => ({ ...d, conflict: { conflicts: verdict.conflicts, disk: verdict.disk } }));
        } else {
            toast(verdict.message);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, toast]);

    const adopt = useCallback((loaded: WorkingTrainer[], diag?: FolderDiagnostics) => {
        if (!loaded.length) {
            setDialogs((d) => ({ ...d, noTrainers: diag ?? { json: 0, marked: 0, skipped: [] } }));
            return;
        }
        const trainers = adoptLoadedTrainers(loaded);
        store.setTrainers(trainers, 0);
        if (trainers.length > 1) setTrainerPickerOpen(true);
    }, [store]);

    const doOpenWorkingFolder = useCallback(async () => {
        if (!window.showDirectoryPicker) {
            /* Browser without the File System Access API: read-only load */
            folderInputRef.current?.click();
            return;
        }
        const { loaded, diag, error, cancelled } = await pickWorkingFolder();
        if (cancelled) return;
        if (error) { alert(error); return; }
        adopt(loaded, diag);
    }, [adopt]);

    const folderInputRef = useRef<HTMLInputElement>(null);

    const openWorkingFolder = useCallback(() => {
        /* Opening a different folder replaces the working set, so warn first
           when any loaded trainer has changes not written to disk. */
        if (anyDirty(store.trainers)) { setDialogs((d) => ({ ...d, discardOpen: true })); return; }
        doOpenWorkingFolder();
    }, [store, doOpenWorkingFolder]);

    const saveAll = useCallback(async () => {
        store.syncFromStorage();          // pull in Pokémon edits from card tabs
        const outcome = await saveAllTrainers(store.trainers);
        store.save();
        store.notify();
        if (!outcome.ok && !outcome.downloaded) { alert(outcome.message); return; }
        if (!outcome.ok && outcome.downloaded) { alert(outcome.message); return; }
        toast(outcome.message);
    }, [store, toast]);

    const backupAll = useCallback(() => {
        store.syncFromStorage();          // pull in Pokémon edits from card tabs
        downloadAllTrainers(store.trainers, false);
        const n = store.trainers.length;
        toast('<i class="fa-solid fa-download"></i> Backed up ' + n
            + ' trainer file' + (n === 1 ? '' : 's'));
    }, [store, toast]);

    const newTrainer = useCallback(() => {
        setDialogs((d) => ({ ...d, newTrainerName: 'trainer-new.json' }));
    }, []);

    const restoreLastSession = useCallback(async () => {
        setLandingOpen(false);
        const w = pendingRestore.current;
        if (!w || !w.trainers.length) { store.startBlank(); return; }
        const trainers = sessionToTrainers(w);
        store.setTrainers(trainers, Math.min(Math.max(0, w.active || 0), trainers.length - 1));
        await verify(trainers);
    }, [store, verify]);

    const value = useMemo<SessionValue>(() => ({
        pendingRestore: pendingRestore.current,
        landingOpen,
        closeLanding: () => setLandingOpen(false),
        restoreLastSession,
        startBlank: () => { setLandingOpen(false); store.startBlank(); },
        openWorkingFolder,
        saveAll,
        backupAll,
        newTrainer,
        trainerPickerOpen,
        setTrainerPickerOpen,
        requestCloseTrainer: (index: number) => {
            const t = store.trainers[index];
            if (!t) return;
            if (store.isDirty(t)) setDialogs((d) => ({ ...d, closeTrainer: index }));
            else store.removeTrainer(index);
        },
        dialogs,
        setDialogs,
    }), [landingOpen, restoreLastSession, openWorkingFolder, saveAll, backupAll, newTrainer,
        trainerPickerOpen, dialogs, store]);

    return (
        <Ctx.Provider value={value}>
            {children}
            {/* Fallback folder load for browsers without the File System Access API */}
            <input
                ref={folderInputRef}
                type="file"
                id="trainer-folder-input"
                /* React needs these as lowercase attributes; both spellings ship. */
                {...{ webkitdirectory: '', directory: '' }}
                multiple
                style={{ display: 'none' }}
                onChange={async (e) => {
                    const files = Array.from(e.currentTarget.files || []);
                    e.currentTarget.value = '';
                    adopt(await readTrainerFiles(files));
                }}
            />
        </Ctx.Provider>
    );
}

/** Shared by the landing and the new-trainer dialog: create a file-backed
    trainer, or say why it could not be created. */
export async function createTrainerFile(
    fileName: string, toast: (html: string) => void,
): Promise<WorkingTrainer | null> {
    let fname = fileName.trim();
    if (!fname) { alert('Please name the file.'); return null; }
    if (!fname.toLowerCase().endsWith('.json')) fname += '.json';

    const fresh = defaultState();
    /* The file's own name is the trainer's name to start with — naming the
       file "Ash" and then finding an "Unnamed" trainer inside it is a small
       thing to have to fix by hand every time.

       Only a starting value: the two are not bound together afterwards, so
       renaming the trainer leaves the file alone, which is what you want when
       the file is called `ash-backup` or the trainer changes their name
       mid-campaign. */
    fresh.name = fname.replace(/\.json$/i, '').trim() || fresh.name;

    const entry: WorkingTrainer = { id: fresh.id, handle: null, fileName: fname, data: fresh };

    // Write to disk first; only add the trainer if the save succeeds
    const result = await writeTrainerFile(entry, fname);
    if (!result) return null;
    markSaved(entry);
    toast(result.message);
    return entry;
}
