import { idbDel, idbGet, idbSet } from '../state/idb';
import { normalizeDoc } from './doc';
import { blobToDataUrl, dataUrlToBlob, pictureBlob, storePicture } from './picture';
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

/** The file's text. A map with a picture under it carries the picture too,
    as a data URL, so the file opens in any browser. */
export async function mapJson(doc: MapDoc, appVersion: string): Promise<string> {
    const blob = doc.picture ? await pictureBlob(doc.picture.id) : null;
    return JSON.stringify({
        [MAP_MARKER]: true,
        app: appVersion || null,
        savedAt: new Date().toISOString(),
        map: doc,
        ...(blob && doc.picture ? { picture: { id: doc.picture.id, data: await blobToDataUrl(blob) } } : {}),
    });
}

/** The map in a file, its picture put back into this browser's store. */
export async function parseMapFile(text: string): Promise<MapDoc | null> {
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!data || !data[MAP_MARKER]) return null;
    const doc = normalizeDoc(data.map);
    if (!doc?.picture) return doc;
    const pic = data.picture as { id?: unknown; data?: unknown } | undefined;
    const blob = pic && pic.id === doc.picture.id && typeof pic.data === 'string' ? dataUrlToBlob(pic.data) : null;
    if (blob) await storePicture(doc.picture.id, blob);
    return doc;
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
