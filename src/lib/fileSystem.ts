import { IDB_HANDLE_KEY, idbGet, idbSet } from '../state/idb';

/* Everything that touches the user's working folder.

   The File System Access API is Chromium-only; every entry point here returns
   null rather than throwing when it is missing, so Firefox and Safari fall back
   to download-and-open exactly as they did before. */

export const CUSTOM_IMG_ROOT = 'Custom Images';
export type CustomImageKind = 'Trainers' | 'Pokemons';

/** Object URLs live as long as the page; revoking one would blank a sprite
    still on screen, so they are cached by path instead. */
const customImgUrlCache: Record<string, string> = {};

/* The entries of a directory, as handles.

   Iterating a FileSystemDirectoryHandle DIRECTLY does not give you this. The
   interface is declared `async iterable<USVString, FileSystemHandle>`, so its
   default async iterator is entries() and yields [name, handle] PAIRS. A pair
   has no `.kind`, so a loop written as

       for await (const entry of handle)          // WRONG
           if (entry.kind !== 'file') continue;

   skips every single file and reports the folder as empty — which is exactly
   what happened: opening a folder full of trainers said there were none.

   values() is the one that yields bare handles, and it is what the original
   pages used. TypeScript's lib.dom declares none of values/entries/the
   iterator, so a cast is unavoidable; keeping the cast in one place is what
   stops the wrong one being written again in the next loader. */
export function dirEntries(dir: FileSystemDirectoryHandle): AsyncIterable<FileSystemHandle> {
    return (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
}

export function hasFileSystemAccess(): boolean {
    return typeof window.showDirectoryPicker === 'function';
}

let dirHandle: FileSystemDirectoryHandle | null = null;

export function getDirHandle(): FileSystemDirectoryHandle | null { return dirHandle; }

export function rememberDirHandle(handle: FileSystemDirectoryHandle | null): void {
    dirHandle = handle;
    if (handle) idbSet(IDB_HANDLE_KEY, handle);
}

/** Restore the folder chosen in an earlier session, without prompting. */
export async function restoreDirHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (dirHandle) return dirHandle;
    const handle = await idbGet<FileSystemDirectoryHandle>(IDB_HANDLE_KEY);
    if (handle) dirHandle = handle;
    return dirHandle;
}

/** The working folder if we have read/write access. `interactive` — only true
    from a click — may prompt for permission; renders pass false. */
export async function workingDirWritable(interactive: boolean): Promise<FileSystemDirectoryHandle | null> {
    const handle = dirHandle || await idbGet<FileSystemDirectoryHandle>(IDB_HANDLE_KEY);
    const withPerm = handle as (FileSystemDirectoryHandle & {
        queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
        requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
    }) | undefined;
    if (!withPerm || !withPerm.queryPermission) return null;
    let perm = await withPerm.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && interactive && withPerm.requestPermission) {
        perm = await withPerm.requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted' ? withPerm : null;
}

export function extForType(type: string): string {
    return ({
        'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
        'image/gif': 'gif', 'image/bmp': 'bmp',
    } as Record<string, string>)[type] || 'png';
}

async function customImagesSubdir(
    dir: FileSystemDirectoryHandle, kind: CustomImageKind, create: boolean,
): Promise<FileSystemDirectoryHandle> {
    const root = await dir.getDirectoryHandle(CUSTOM_IMG_ROOT, { create });
    return root.getDirectoryHandle(kind, { create });
}

/** Write the original file bytes (full res); returns the filename or null. */
export async function writeCustomImageTo(
    dir: FileSystemDirectoryHandle | null, kind: CustomImageKind, base: string, file: File,
): Promise<string | null> {
    if (!dir) return null;
    try {
        const sub = await customImagesSubdir(dir, kind, true);
        const name = base + '.' + extForType(file.type);
        const fh = await sub.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(file);
        await w.close();
        return name;
    } catch (e) { console.warn('Custom image save failed', e); return null; }
}

/** Read a saved file back to an object URL for display, else null. */
export async function readCustomImage(kind: CustomImageKind, name: string): Promise<string | null> {
    if (!name) return null;
    const key = kind + '/' + name;
    if (customImgUrlCache[key]) return customImgUrlCache[key];
    try {
        const dir = await workingDirWritable(false);   // never prompt during a render
        if (!dir) return null;
        const sub = await customImagesSubdir(dir, kind, false);
        const fh = await sub.getFileHandle(name, { create: false });
        const url = URL.createObjectURL(await fh.getFile());
        customImgUrlCache[key] = url;
        return url;
    } catch { return null; }
}

export async function deleteCustomImage(kind: CustomImageKind, name: string): Promise<void> {
    if (!name) return;
    try {
        const dir = await workingDirWritable(true);
        if (dir) {
            const sub = await customImagesSubdir(dir, kind, false);
            await sub.removeEntry(name);
        }
    } catch { /* already gone / no access */ }
    delete customImgUrlCache[kind + '/' + name];
}

/** Forget a cached URL so the next read picks up fresh bytes. */
export function invalidateCustomImage(kind: CustomImageKind, name: string): void {
    delete customImgUrlCache[kind + '/' + name];
}

/** On opening a working folder, make sure it has the structure the app uses
    (image backups + a wild-Pokémon drop) so it's ready to go. */
export async function ensureWorkingFolderScaffold(dir: FileSystemDirectoryHandle | null): Promise<void> {
    if (!dir || !dir.getDirectoryHandle) return;
    try {
        const ci = await dir.getDirectoryHandle(CUSTOM_IMG_ROOT, { create: true });
        await ci.getDirectoryHandle('Trainers', { create: true });
        await ci.getDirectoryHandle('Pokemons', { create: true });
        await dir.getDirectoryHandle('Wild Pokemons', { create: true });
    } catch (e) { console.warn('Folder scaffold failed', e); }
}
