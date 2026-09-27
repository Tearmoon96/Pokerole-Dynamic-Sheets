import { useEffect, useRef, useState } from 'react';
import { useMap } from '../../map/MapContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { useGmConfirm } from '../gm/ConfirmDialog';
import { HomeButton } from '../common/HomeButton';
import { BackgroundControl, BordersControl, ExportControl, GridControl, ScaleControl, SizeControl, SnapToggle, StyleControl } from './TopBarControls';
import {
    downloadMap, ensureWritable, forgetMapHandle, mapFileName, mapJson, parseMapFile,
    readMapHandle, rememberMapHandle, writeMapFile,
} from '../../map/files';
import type { MapDoc } from '../../map/types';
import { keyHint, useHotkeys } from '../../map/hotkeys';

/* The bar across the top: which map, how it is drawn, and its file. */

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function MapTopBar({ onMaps, onSprites, onHotkeys, onRecipe }: {
    onMaps: () => void; onSprites: () => void; onHotkeys: () => void; onRecipe: () => void;
}) {
    const { store, doc } = useMap();
    useHotkeys();
    const { data } = useAppData();
    const toast = useToast();
    const confirm = useGmConfirm();
    const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
    const [status, setStatus] = useState<{ text: string; warn: boolean }>({ text: '', warn: false });
    const fileInput = useRef<HTMLInputElement>(null);

    /* Each map remembers its own file. */
    useEffect(() => {
        let live = true;
        setHandle(null);
        setStatus({ text: '', warn: false });
        readMapHandle(doc.id).then((h) => { if (live && h) setHandle(h); });
        return () => { live = false; };
    }, [doc.id]);

    const saveAs = async () => {
        store.flush();
        const json = mapJson(doc, data.version);
        if (!window.showSaveFilePicker) {
            downloadMap(json, mapFileName(doc));
            setStatus({ text: 'Downloaded — this browser cannot overwrite a file in place.', warn: false });
            return;
        }
        let h: FileSystemFileHandle;
        try {
            h = await window.showSaveFilePicker({
                suggestedName: mapFileName(doc),
                types: [{ description: 'Pokerole map', accept: { 'application/json': ['.json'] } }],
            });
        } catch (e) {
            if (e && (e as DOMException).name === 'AbortError') return;
            setStatus({ text: 'Press Save again to choose a file.', warn: true });
            return;
        }
        setHandle(h);
        await rememberMapHandle(doc.id, h);
        await report(await writeMapFile(h, json), h);
    };

    const report = async (ok: boolean, h: FileSystemFileHandle) => {
        if (ok) {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setStatus({ text: 'Saved ' + h.name + ' ' + time, warn: false });
        } else {
            /* Moved, deleted, or a drive that went away: forget it, so the next
               save asks for a file instead of failing again. */
            setHandle(null);
            await forgetMapHandle(doc.id);
            setStatus({ text: 'Could not write that file — use Save to pick another.', warn: true });
        }
    };

    const quickSave = async () => {
        if (!handle) { await saveAs(); return; }
        if (!(await ensureWritable(handle))) {
            setStatus({ text: 'That file is no longer writable — choose it again with Save.', warn: true });
            return;
        }
        await report(await writeMapFile(handle, mapJson(doc, data.version)), handle);
    };

    const accept = async (parsed: MapDoc, name: string, h: FileSystemFileHandle | null) => {
        const existing = store.maps.find((m) => m.id === parsed.id);
        if (existing) {
            const ok = await confirm({
                icon: 'fa-folder-open', danger: true, confirmLabel: 'Replace',
                title: 'Replace ' + (existing.name || 'this map') + '?',
                text: 'That file is a saved copy of a map you already have here. Opening it replaces the '
                    + 'copy in this browser with what is in the file.',
            });
            if (!ok) return;
        }
        store.importMap(parsed);
        if (h) await rememberMapHandle(parsed.id, h);
        else await forgetMapHandle(parsed.id);
        toast('<i class="fa-solid fa-folder-open"></i> Opened ' + escapeHtml(name) + '.');
    };

    const open = async () => {
        if (!window.showOpenFilePicker) { fileInput.current?.click(); return; }
        let h: FileSystemFileHandle;
        try {
            [h] = await window.showOpenFilePicker({
                types: [{ description: 'Pokerole map', accept: { 'application/json': ['.json'] } }],
            });
        } catch { return; }
        const parsed = parseMapFile(await (await h.getFile()).text());
        if (!parsed) { toast('<i class="fa-solid fa-triangle-exclamation"></i> That is not a map file.'); return; }
        await accept(parsed, h.name, h);
    };

    return (
        <div className="topbar map-topbar">
            <HomeButton className="icon-btn" />
            <span className="logo"><i className="fa-solid fa-map"></i> <span className="map-logo-text">Map Maker</span></span>

            <button className="map-name-btn" onClick={onMaps} title="Your maps — open, create, rename">
                <i className="fa-solid fa-layer-group"></i>
                <span className="map-name-text">{doc.name || 'Untitled map'}</span>
                <i className="fa-solid fa-caret-down"></i>
            </button>

            <div className="map-history" role="group" aria-label="History">
                <button className="icon-btn" title={'Undo' + keyHint('undo')} disabled={!store.undoStack.length} onClick={() => store.undo()}>
                    <i className="fa-solid fa-rotate-left"></i>
                </button>
                <button className="icon-btn" title={'Redo' + keyHint('redo')} disabled={!store.redoStack.length} onClick={() => store.redo()}>
                    <i className="fa-solid fa-rotate-right"></i>
                </button>
            </div>

            <div className="map-styles">
                <StyleControl />
                <BackgroundControl />
                <BordersControl />
            </div>

            <div className="map-settings" role="group" aria-label="Map settings">
                <GridControl />
                <SnapToggle />
                <SizeControl />
                <ScaleControl />
            </div>

            <span className="spacer"></span>
            <span className={'session-status' + (status.warn ? ' warn' : '')}>{status.text}</span>
            <div className="session-actions">
                <button className="icon-btn" onClick={onRecipe} title="Map from a description: a chat assistant draws it from your words">
                    <i className="fa-solid fa-scroll"></i>
                </button>
                <button className="icon-btn" onClick={onSprites} title="Sprite checklist: which art the page has found">
                    <i className="fa-solid fa-images"></i>
                </button>
                <ExportControl />
                <button className="icon-btn" onClick={() => { void saveAs(); }} title="Save this map to a .json file, choosing where">
                    <i className="fa-solid fa-floppy-disk"></i><span className="map-btn-text"> Save</span>
                </button>
                <button className="icon-btn" onClick={() => { void quickSave(); }} title="Quick save: overwrite this map's file, no dialog">
                    <i className="fa-solid fa-bolt"></i><span className="map-btn-text"> Quick Save</span>
                </button>
                <button className="icon-btn" onClick={() => { void open(); }} title="Open a saved map .json">
                    <i className="fa-solid fa-folder-open"></i><span className="map-btn-text"> Open</span>
                </button>
                <button className="icon-btn" onClick={onHotkeys} title="Keyboard shortcuts: choose or edit a hotkey profile">
                    <i className="fa-solid fa-keyboard"></i>
                </button>
            </div>
            <span className="version">{data.version ? 'v' + data.version : ''}</span>

            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (!file) return;
                    const parsed = parseMapFile(await file.text());
                    if (!parsed) { toast('<i class="fa-solid fa-triangle-exclamation"></i> That is not a map file.'); return; }
                    await accept(parsed, file.name, null);
                }}
            />
        </div>
    );
}
