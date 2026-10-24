import type { MapDoc, MapPicture } from './types';
import { MAP_PREFIX } from './store';

/* A picture of the GM's own under a map: one drawn by hand, or in another
   program, to paint over, mark up and fog like any map.

   The picture is far too big for localStorage, where each map lives, so the
   map holds only its id and where it lies (`MapDoc.picture`), and the bytes
   live in IndexedDB under that id. The id is the picture's hash, so the same
   file chosen twice is stored once, and a duplicated map shares it. A map
   FILE carries the bytes with it (files.ts), so it opens anywhere.

   Pictures no map names any more are swept on a later visit, not the moment
   they are let go: Undo can bring a removed picture back. */

const DB_NAME = 'pokerole-map-pictures';
const STORE = 'pictures';

interface Stored { blob: Blob; at: number }

/** What the picture field accepts: raster only. An SVG is a document that
    can run script, and nothing here needs one. */
export const PICTURE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';
const MAX_BYTES = 40 * 1024 * 1024;
/** Wider or taller than this is scaled down on the way in: the players'
    picture is capped at the same size, and a canvas will not take much more. */
const MAX_SIDE = 8192;
/** High enough that lines and lettering stay crisp; a map is mostly flat
    colour, which WebP keeps small at any quality. */
const WEBP_QUALITY = 0.9;
/** How long an unnamed picture is kept: another tab may have just chosen it
    and not yet written its map. */
const SWEEP_AFTER_MS = 10 * 60 * 1000;

function open(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}

async function run<T>(mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    try {
        const db = await open();
        const out = await new Promise<T>((res, rej) => {
            const tx = db.transaction(STORE, mode);
            const req = body(tx.objectStore(STORE));
            tx.oncomplete = () => res(req.result);
            tx.onerror = () => rej(tx.error);
            tx.onabort = () => rej(tx.error);
        });
        db.close();
        return out;
    } catch (e) {
        console.warn('Map picture storage failed', e);
        return undefined;
    }
}

export async function pictureBlob(id: string): Promise<Blob | null> {
    const rec = await run<Stored | undefined>('readonly', (s) => s.get(id) as IDBRequest<Stored | undefined>);
    return rec?.blob ?? null;
}

export async function storePicture(id: string, blob: Blob): Promise<boolean> {
    const ok = await run('readwrite', (s) => s.put({ blob, at: Date.now() } satisfies Stored, id));
    return ok !== undefined;
}

/* ------------------------------------------------------------ in memory */

const bitmaps = new Map<string, ImageBitmap | null>();
const loading = new Map<string, Promise<ImageBitmap | null>>();
const listeners = new Set<() => void>();

/** Called whenever a picture finishes loading, so a canvas can redraw. */
export function onPictureArrived(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

export function loadPicture(id: string): Promise<ImageBitmap | null> {
    if (bitmaps.has(id)) return Promise.resolve(bitmaps.get(id)!);
    let p = loading.get(id);
    if (!p) {
        p = (async () => {
            const blob = await pictureBlob(id);
            const bmp = blob ? await createImageBitmap(blob).catch(() => null) : null;
            bitmaps.set(id, bmp);
            loading.delete(id);
            listeners.forEach((l) => l());
            return bmp;
        })();
        loading.set(id, p);
    }
    return p;
}

/** The picture if it is ready; otherwise null, and it starts loading. */
export function pictureNow(id: string): ImageBitmap | null {
    if (bitmaps.has(id)) return bitmaps.get(id)!;
    void loadPicture(id);
    return null;
}

/** Whether the picture was looked for and is not in this browser. */
export function pictureMissing(id: string): boolean {
    return bitmaps.has(id) && bitmaps.get(id) === null;
}

/* ------------------------------------------------------------ choosing one */

export interface PictureInfo { id: string; name: string; w: number; h: number }

async function hashOf(blob: Blob): Promise<string> {
    try {
        const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        return [...new Uint8Array(d).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
}

/** Reads a picture the GM chose, stores it, and says how big it is. Throws
    with a sentence to show when it cannot be used. */
export async function importPicture(file: File): Promise<PictureInfo> {
    if (!file.type.startsWith('image/') || file.type.includes('svg')) {
        throw new Error('That is not a picture this can use: choose a PNG, JPEG, WebP or GIF.');
    }
    if (file.size > MAX_BYTES) throw new Error('That picture is over 40 MB. Save a smaller copy and choose that.');
    let bmp: ImageBitmap;
    try {
        bmp = await createImageBitmap(file);
    } catch {
        throw new Error('The browser could not read that picture.');
    }
    /* Every picture is re-encoded as WebP on the way in, and the smaller of
       that and the original is kept: an exported PNG of a map is often ten
       times the size for no difference anyone can see, and the bytes are
       carried in IndexedDB, in every map file and up to the table. Too big a
       picture is scaled down first. */
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', WEBP_QUALITY));
    canvas.width = canvas.height = 0;
    let blob: Blob = file;
    if (k < 1) {
        if (!webp) throw new Error('The browser could not scale that picture down.');
        blob = webp;
    } else if (webp && webp.type === 'image/webp' && webp.size < file.size) {
        blob = webp;
    }
    if (blob !== file) {
        bmp.close();
        bmp = await createImageBitmap(blob);
    }
    const id = await hashOf(blob);
    if (!(await storePicture(id, blob))) throw new Error('This browser would not keep the picture: its storage may be full.');
    bitmaps.set(id, bmp);
    listeners.forEach((l) => l());
    return { id, name: file.name.slice(0, 120), w: bmp.width, h: bmp.height };
}

/** Where a picture of `w` x `h` pixels lies on a map: as large as fits,
    keeping its shape, in the middle. */
export function fitPicture(doc: Pick<MapDoc, 'cols' | 'rows'>, info: PictureInfo, opacity = 1): MapPicture {
    const k = Math.min(doc.cols / info.w, doc.rows / info.h);
    const w = info.w * k, h = info.h * k;
    return { id: info.id, name: info.name, x: (doc.cols - w) / 2, y: (doc.rows - h) / 2, w, h, opacity };
}

/** The rows a map of `cols` columns needs to take a picture's shape. */
export function rowsFor(cols: number, info: { w: number; h: number }): number {
    return Math.round(cols * info.h / info.w);
}

/* ------------------------------------------------------------ the sweep */

/** Every picture a map in this browser names. Read off storage, so a map
    another tab holds counts too. */
function namedPictures(): Set<string> {
    const ids = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(MAP_PREFIX)) continue;
        try {
            const id = (JSON.parse(localStorage.getItem(key) || 'null') as MapDoc | null)?.picture?.id;
            if (id) ids.add(id);
        } catch { /* not a map */ }
    }
    return ids;
}

/** Deletes the pictures no map names any more. */
export async function sweepPictures(): Promise<void> {
    let named: Set<string>;
    try { named = namedPictures(); } catch { return; }
    const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    if (!keys) return;
    for (const key of keys) {
        const id = String(key);
        if (named.has(id)) continue;
        const rec = await run<Stored | undefined>('readonly', (s) => s.get(id) as IDBRequest<Stored | undefined>);
        if (rec && Date.now() - rec.at > SWEEP_AFTER_MS) await run('readwrite', (s) => s.delete(id));
    }
}

/* ------------------------------------------------------------ files */

export async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsDataURL(blob);
    });
}

export function dataUrlToBlob(url: string): Blob | null {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(url);
    if (!m || /svg/i.test(m[1])) return null;
    try {
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: m[1] });
    } catch {
        return null;
    }
}
