import { DATA_BASE } from '../../data/paths';
import { idbGet, idbSet } from '../../state/idb';
import type { ImageLoader, LoadedImage } from './exportPng';

/* Where an export's pictures come from.

   A canvas that draws an image the page may not read back refuses to become a
   file. Served over http(s) every picture in app-data/ is same-origin and
   fine. Opened from the DISK — how most people run this — a file:// page may
   not read any other file:// resource, its own sprites included, and the
   export would fail outright.

   The way round is the one the app already uses for trainers and manuals: a
   folder the user picks. Pictures read out of a directory handle are the
   user's own data, and a canvas drawing them stays clean. The handle is
   kept in IndexedDB, so it is asked for once.

   The GitHub copies of the Pokémon sprites are fine either way: that host
   sends CORS headers, so they load clean with crossOrigin set. */

export const APP_FOLDER_KEY = 'mapAppFolder';

export function readsFromDisk(): boolean {
    /* __PDS_ASSUME_DISK__ is the harnesses' switch (see isHostedOrigin in
       data/paths.ts): a test served over http can take the disk's path —
       the only way to drive the folder route, since a file:// page has no
       private file system to plant a folder in. Nothing in the app sets it. */
    return location.protocol === 'file:' || !!(window as unknown as Record<string, unknown>).__PDS_ASSUME_DISK__;
}

export function readAppFolder(): Promise<FileSystemDirectoryHandle | undefined> {
    return idbGet<FileSystemDirectoryHandle>(APP_FOLDER_KEY);
}

/** The data folder inside whatever was picked: the app's folder (which holds
    app-data/), or app-data itself. Null if it is neither. */
async function dataFolderIn(dir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
    const name = DATA_BASE.replace(/\/+$/, '').split('/').pop() || 'app-data';
    try { return await dir.getDirectoryHandle(name); } catch { /* not the app's folder */ }
    try { await dir.getDirectoryHandle('images'); return dir; } catch { /* not app-data either */ }
    return null;
}

/** Ask for the app's folder. Resolves to the folder's name, or throws with a
    sentence for the user. */
export async function pickAppFolder(): Promise<string> {
    if (!window.showDirectoryPicker) throw new Error('This browser cannot open a folder — use Chrome or Edge, or the hosted site.');
    const dir = await window.showDirectoryPicker({ id: 'pds-app-folder', mode: 'read' });
    const data = await dataFolderIn(dir);
    if (!data) throw new Error('"' + dir.name + '" is not the app\'s folder — choose the one with map-maker.html and app-data in it.');
    await idbSet(APP_FOLDER_KEY, data);
    return dir.name;
}

/** Make sure a remembered folder may still be read. Needs the click that
    started the export: a permission prompt is only allowed from a gesture. */
export async function folderReadable(handle: FileSystemDirectoryHandle): Promise<boolean> {
    if (!handle.queryPermission) return true;
    let perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted' && handle.requestPermission) perm = await handle.requestPermission({ mode: 'read' });
    return perm === 'granted';
}

function viaImage(url: string, cross: boolean): Promise<LoadedImage | null> {
    return new Promise((resolve) => {
        const img = new Image();
        if (cross) img.crossOrigin = 'anonymous';
        img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight, url });
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

async function viaFolder(data: FileSystemDirectoryHandle, url: string): Promise<LoadedImage | null> {
    if (!url.startsWith(DATA_BASE)) return null;
    const parts = url.slice(DATA_BASE.length).split('/').filter((p) => p && p !== '.').map(decodeURIComponent);
    try {
        let dir = data;
        for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
        const file = await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
        const bmp = await createImageBitmap(file);
        return { img: bmp, w: bmp.width, h: bmp.height, url };
    } catch {
        return null;
    }
}

/** A loader for this page: from the folder handle on the disk, straight from
    the server otherwise. Each URL is fetched once per export. */
export function exportLoader(folder: FileSystemDirectoryHandle | null): ImageLoader {
    const cache = new Map<string, Promise<LoadedImage | null>>();
    const one = (url: string): Promise<LoadedImage | null> => {
        let p = cache.get(url);
        if (!p) {
            const absolute = /^[a-z]+:\/\//i.test(url);
            if (absolute) p = viaImage(url, true);
            else if (readsFromDisk()) p = folder ? viaFolder(folder, url) : Promise.resolve(null);
            else p = viaImage(url, false);
            cache.set(url, p);
        }
        return p;
    };
    return async (candidates) => {
        for (const url of candidates) {
            const got = await one(url);
            if (got) return got;
        }
        return null;
    };
}
