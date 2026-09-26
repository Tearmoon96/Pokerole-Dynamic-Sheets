import { idbDel, idbGet, idbSet } from '../state/idb';
import { normalizeDoc } from './doc';
import type { MapDoc } from './types';

/* Map files: one map per .json, to keep beside the campaign or hand to a
   player. The same arrangement as the GM screen's session files
   (src/gm/session.ts) — a remembered handle for Quick Save, a download where
   the browser cannot write a file in place — but the handle is remembered PER
   MAP, since each map is its own file. */

export const MAP_MARKER = '_pokeroleMap';

export function mapFileName(doc: MapDoc): string {
    const base = doc.name.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ') || 'map';
    return base + '.map.json';
}

export function mapJson(doc: MapDoc, appVersion: string): string {
    return JSON.stringify({
        [MAP_MARKER]: true,
        app: appVersion || null,
        savedAt: new Date().toISOString(),
        map: doc,
    });
}

export function parseMapFile(text: string): MapDoc | null {
    try {
        const data = JSON.parse(text);
        if (!data || !data[MAP_MARKER]) return null;
        return normalizeDoc(data.map);
    } catch {
        return null;
    }
}

const handleKey = (id: string) => 'mapFile:' + id;

export function readMapHandle(id: string): Promise<FileSystemFileHandle | undefined> {
    return idbGet<FileSystemFileHandle>(handleKey(id));
}

export function rememberMapHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
    return idbSet(handleKey(id), handle);
}

export function forgetMapHandle(id: string): Promise<void> {
    return idbDel(handleKey(id));
}

export async function ensureWritable(handle: FileSystemFileHandle | null | undefined): Promise<boolean> {
    if (!handle || !handle.queryPermission) return false;
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && handle.requestPermission) {
        perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted';
}

export function downloadMap(json: string, name: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function writeMapFile(handle: FileSystemFileHandle, json: string): Promise<boolean> {
    try {
        const w = await handle.createWritable();
        await w.write(json);
        await w.close();
        return true;
    } catch (e) {
        console.warn('Map save failed', e);
        return false;
    }
}
