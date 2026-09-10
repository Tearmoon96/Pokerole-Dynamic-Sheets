import { useEffect, useRef, useState } from 'react';
import { useGm } from '../../gm/GmContext';
import { PANEL_TABS } from '../../gm/phoneBoard';
import { HomeButton } from '../common/HomeButton';
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
            if (live && h) setHandle(h);   // remembered silently: the name is not shown
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
        setStatus({ text: '', warn: false });
        toast('<i class="fa-solid fa-folder-open"></i> Session loaded from ' + escapeHtml(h.name) + '.');
    };

    return (
        <>
            <div className="topbar">
                <HomeButton className="icon-btn" />
                <span className="logo"><i className="fa-solid fa-chess-board"></i> Pokerole GM Screen</span>

                {/* One toggle per board section, lit while the section is on.
                    Switching one off drops it from the board entirely rather
                    than collapsing it, so the panels left over share its width
                    — .panel is `flex: 1 1 390px`, which does that by itself. */}
                <div className="section-toggles" role="group" aria-label="Show or hide board sections">
                    {PANEL_TABS.map((t) => {
                        const on = !state.layout.hidden.includes(t.key);
                        return (
                            <button
                                key={t.key}
                                className={'section-toggle' + (on ? ' on' : '')}
                                aria-pressed={on}
                                title={(on ? 'Hide' : 'Show') + ' ' + t.label}
                                onClick={() => store.update((s) => {
                                    const hidden = on
                                        ? [...s.layout.hidden, t.key]
                                        : s.layout.hidden.filter((k) => k !== t.key);
                                    s.layout = { ...s.layout, hidden };
                                })}
                            >
                                <i className={'fa-solid ' + t.icon}></i>
                            </button>
                        );
                    })}
                </div>

                <span className="spacer"></span>
                <span className={'session-status' + (status.warn ? ' warn' : '')} id="session-status">
                    {status.text}
                </span>
                <div className="session-actions">
                    <button
                        className="icon-btn"
                        onClick={() => store.update((s) => {
                            /* Widths only. Which panels are on, and the order
                               they sit in, are both deliberate arrangements
                               with controls of their own; wiping them here
                               would make this button a surprise. */
                            s.layout = { ...s.layout, widths: {} };
                        })}
                        title="Give every section its default width again"
                    >
                        <i className="fa-solid fa-table-columns"></i> Reset tabs
                    </button>
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
                    setStatus({ text: 'Loaded — use Save to link a file.', warn: false });
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
