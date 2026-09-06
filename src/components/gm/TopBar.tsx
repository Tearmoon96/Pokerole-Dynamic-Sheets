import { useEffect, useRef, useState } from 'react';
import { useGm } from '../../gm/GmContext';
import { useGmConfirm } from './ConfirmDialog';
import { useToast } from '../common/Toast';
import { useAppData } from '../../data/AppDataContext';
import { upsertWorkingTrainer } from '../../gm/workingSet';
import {
    downloadSession, ensureWritable, forgetSessionHandle, parseSession, readSessionHandle,
    rememberSessionHandle, sessionFileName, sessionJson, sessionToState, writeSession,
} from '../../gm/session';

/* The bar across the top: the session file controls and the version label. */

export function TopBar() {
    const { state, store } = useGm();
    const { data } = useAppData();
    const confirm = useGmConfirm();
    const toast = useToast();
    const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
    const [status, setStatus] = useState<{ text: string; warn: boolean }>({ text: '', warn: false });
    const fileInput = useRef<HTMLInputElement>(null);

    /* Remember which file Quick Save writes to, from a previous session */
    useEffect(() => {
        let live = true;
        readSessionHandle().then((h) => {
            if (live && h) { setHandle(h); setStatus({ text: h.name, warn: false }); }
        });
        return () => { live = false; };
    }, []);

    const confirmReplace = (name: string) => confirm({
        icon: 'fa-folder-open', danger: true, confirmLabel: 'Load',
        title: 'Load ' + name + '?',
        text: 'Everything on this screen — roster, combat, notes, NPCs and dice history — is '
            + 'replaced by what is in that file. Save first if you want to keep it.',
    });

    const saveAs = async (): Promise<void> => {
        const json = sessionJson(state, data.version);
        /* No File System Access API (Firefox, Safari): downloading is the only
           route out, and Quick Save has nothing to overwrite */
        if (!window.showSaveFilePicker) {
            downloadSession(json);
            setStatus({ text: 'Downloaded — this browser cannot overwrite a file in place.', warn: false });
            return;
        }
        let h: FileSystemFileHandle;
        try {
            h = await window.showSaveFilePicker({
                suggestedName: sessionFileName(),
                types: [{ description: 'GM session', accept: { 'application/json': ['.json'] } }],
            });
        } catch (e) {
            if (e && (e as DOMException).name === 'AbortError') return;   // cancelled: say nothing
            setStatus({ text: 'Press Save again to choose a file.', warn: true });
            return;
        }
        setHandle(h);
        await rememberSessionHandle(h);
        const r = await writeSession(h, json);
        if (!r.ok) setHandle(null);
        setStatus({ text: r.status, warn: r.warn });
    };

    const quickSave = async () => {
        /* Nothing to be quick about yet — ask where it goes this once */
        if (!handle) { await saveAs(); return; }
        if (!(await ensureWritable(handle))) {
            setStatus({ text: 'That file is no longer writable — choose it again with Save.', warn: true });
            return;
        }
        const r = await writeSession(handle, sessionJson(state, data.version));
        if (!r.ok) setHandle(null);
        setStatus({ text: r.status, warn: r.warn });
    };

    const load = async () => {
        if (!window.showOpenFilePicker) { fileInput.current?.click(); return; }
        let h: FileSystemFileHandle;
        try {
            [h] = await window.showOpenFilePicker({
                types: [{ description: 'GM session', accept: { 'application/json': ['.json'] } }],
            });
        } catch { return; }   // cancelled
        const parsed = parseSession(await (await h.getFile()).text());
        if (!parsed) {
            toast('<i class="fa-solid fa-triangle-exclamation"></i> That is not a GM session file.');
            return;
        }
        if (!(await confirmReplace(h.name))) return;
        /* Loaded through the picker, so Quick Save can write straight back to
           the file it came from */
        setHandle(h);
        await rememberSessionHandle(h);
        store.replace(sessionToState(parsed, upsertWorkingTrainer));
        setStatus({ text: h.name, warn: false });
        toast('<i class="fa-solid fa-folder-open"></i> Session loaded from ' + escapeHtml(h.name) + '.');
    };

    return (
        <>
            <div className="topbar">
                <span className="logo"><i className="fa-solid fa-chess-board"></i> Pokerole GM Screen</span>
                <span className="spacer"></span>
                <span className={'session-status' + (status.warn ? ' warn' : '')} id="session-status">
                    {status.text}
                </span>
                <div className="session-actions">
                    <button
                        className="icon-btn"
                        onClick={() => { void saveAs(); }}
                        title="Save the session to a .json file, choosing where"
                    >
                        <i className="fa-solid fa-floppy-disk"></i> Save
                    </button>
                    <button
                        className="icon-btn"
                        onClick={() => { void quickSave(); }}
                        title="Quick save: overwrite that same file, no dialog"
                    >
                        <i className="fa-solid fa-bolt"></i> Quick Save
                    </button>
                    <button
                        className="icon-btn"
                        onClick={() => { void load(); }}
                        title="Load a saved session .json, replacing what is on screen"
                    >
                        <i className="fa-solid fa-folder-open"></i> Load
                    </button>
                </div>
                <span className="version" id="version-label">{data.version ? 'v' + data.version : ''}</span>
            </div>

            {/* Fallback for browsers without showOpenFilePicker */}
            <input
                ref={fileInput}
                type="file"
                id="session-file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (!file) return;
                    const parsed = parseSession(await file.text());
                    if (!parsed) {
                        toast('<i class="fa-solid fa-triangle-exclamation"></i> That is not a GM session file.');
                        return;
                    }
                    if (!(await confirmReplace(file.name))) return;
                    setHandle(null);
                    await forgetSessionHandle();
                    store.replace(sessionToState(parsed, upsertWorkingTrainer));
                    setStatus({ text: 'Loaded ' + file.name + ' — use Save to link a file.', warn: false });
                }}
            />
        </>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
