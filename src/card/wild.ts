import { idbDel, idbGet, idbSet } from '../state/idb';
import { WILD_MARKER, WILD_OPEN_KEY, wildSheetKey } from './cardContext';
import type { CardSheet } from './types';
import type { PokedexEntry } from '../data/types';

/* Wild Pokémon: sheets that belong to no trainer.

   A wild used to be addressed by its species alone, so two wild Rattata were one
   sheet overwriting each other. A sheet now has an id of its own, and the ids of
   every open one are listed under WILD_OPEN_KEY so the switcher can page through
   them. The list lives in localStorage, so a wild card opened in a second tab
   sees the same set. */

export interface WildPayload {
    dexId: string;
    sheet: CardSheet;
    [marker: string]: unknown;
}

export interface WildOpenEntry {
    wid: string;
    dexId: string;
    /** The .json a sheet was imported from, kept only so a folder picked twice
        does not open the same sheet twice. Never written back. */
    file?: string;
}

export function wildPayload(p: PokedexEntry, sheet: CardSheet): WildPayload {
    return { [WILD_MARKER]: true, dexId: p._id, sheet };
}

/** Named after the nickname when there is one — several wild Rattata in an
    encounter otherwise all want the same filename. */
export function wildFileName(p: PokedexEntry, sheet: CardSheet): string {
    const base = (sheet.nickname || '').trim() || p.Name || 'pokemon';
    return 'wild-' + base.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() + '.json';
}

/* ---- The open set ---- */

export function readWildOpen(): WildOpenEntry[] {
    try {
        const raw = JSON.parse(localStorage.getItem(WILD_OPEN_KEY) || 'null');
        return Array.isArray(raw) ? raw.filter((e) => e && e.wid && e.dexId) : [];
    } catch { return []; }
}

export function writeWildOpen(list: WildOpenEntry[]): void {
    try { localStorage.setItem(WILD_OPEN_KEY, JSON.stringify(list)); }
    catch { /* quota / private mode: the switcher simply forgets */ }
}

/** `file` is left alone when the caller has none — a reload must not forget
    where a sheet came from. */
export function addWildOpen(wid: string, dexId: string, file?: string): WildOpenEntry[] {
    const list = readWildOpen();
    const hit = list.find((e) => e.wid === wid);
    if (hit) {
        hit.dexId = dexId;
        if (file) hit.file = file;
    } else {
        const entry: WildOpenEntry = { wid, dexId };
        if (file) entry.file = file;
        list.push(entry);
    }
    writeWildOpen(list);
    return list;
}

/** An id for a new sheet. The first of a species takes the species' own id —
    see the wildId note in cardContext for why that spelling has to stay
    reachable — and any further one is suffixed. */
export function newWildId(dexId: string): string {
    const taken = readWildOpen().map((e) => e.wid);
    if (!taken.includes(dexId)) return dexId;
    /* A dot, because no species id has one and URLSearchParams leaves it alone —
       the suffixed id reads as itself in the address bar. */
    let n = 2;
    while (taken.includes(dexId + '.' + n)) n++;
    return dexId + '.' + n;
}

export function wildUrl(dexId: string, wid: string): string {
    const p = new URLSearchParams();
    p.set('pokemon', dexId);
    p.set('wild', '1');
    if (wid !== dexId) p.set('wid', wid);
    return '?' + p.toString();
}

/* ---- The file each sheet saves to ----

   Export downloads a new copy every time, which is what you want for handing one
   to a trainer sheet but not for working on the same creature across a session —
   that leaves a trail of "wild-x (3).json" and no single file that is current.
   Save keeps a handle to one file and overwrites it: it asks where exactly once,
   then never again.

   The handle lives in IndexedDB (handles are structured-cloneable, localStorage
   can't hold them) under the sheet's own id, so every wild sheet open at once —
   two Rattata included — keeps its own file. */

/** Keyed by the sheet, not the species: two wild Rattata are two creatures and
    must not overwrite one another's file. */
export function wildFileHandleKey(wid: string): string {
    return 'wildFileHandle:' + wid;
}

export function readWildFileHandle(wid: string): Promise<FileSystemFileHandle | undefined> {
    return idbGet<FileSystemFileHandle>(wildFileHandleKey(wid));
}

export function rememberWildFileHandle(wid: string, handle: FileSystemFileHandle): Promise<void> {
    return idbSet(wildFileHandleKey(wid), handle);
}

export function forgetWildFileHandle(wid: string): Promise<void> {
    return idbDel(wildFileHandleKey(wid));
}

export function downloadWild(p: PokedexEntry, sheet: CardSheet): void {
    const blob = new Blob([JSON.stringify(wildPayload(p, sheet), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = wildFileName(p, sheet);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Copy an imported payload into a fresh sheet id, ready to navigate to. */
export async function stashWildSheet(
    data: WildPayload | null, sourceName?: string,
): Promise<string | null> {
    if (!data || !data[WILD_MARKER] || !data.dexId) return null;
    const wid = newWildId(data.dexId);

    /* A file reached through a picker carries no writable handle, so drop
       whatever this sheet id was linked to: Save must ask where this one goes
       rather than overwrite a different file. */
    await forgetWildFileHandle(wid);

    try {
        localStorage.setItem(wildSheetKey(wid), JSON.stringify(data.sheet || {}));
    } catch { /* quota / private mode: it opens on defaults */ }
    addWildOpen(wid, data.dexId, sourceName);
    return wid;
}

/* ---- Importing a whole folder ----

   A GM keeps an encounter's sheets together — the working folder's
   "Wild Pokemons" subfolder is exactly that — and picking them one at a time is
   busywork. This reads every .json in the chosen folder and a couple of levels
   under it, so picking the working folder's root finds them just as well as
   picking the subfolder itself.

   Only files marked as wild Pokémon sheets are opened. A trainer's .json is
   read, recognised as not one, and dropped: the trainer and every Pokémon on its
   team or in its boxes belong to that file and are edited from the Trainer
   License. Nothing here writes to any file. */

export const WILD_FOLDER_DEPTH = 3;

/** Every .json in a directory, down to `depth` levels of subfolder. */
export async function collectJsonFiles(
    dir: FileSystemDirectoryHandle, depth: number,
): Promise<File[]> {
    const out: File[] = [];
    for await (const entry of (dir as unknown as AsyncIterable<FileSystemHandle>)) {
        if (entry.kind === 'file') {
            if (entry.name.toLowerCase().endsWith('.json')) {
                out.push(await (entry as FileSystemFileHandle).getFile());
            }
        } else if (entry.kind === 'directory' && depth > 1) {
            out.push(...await collectJsonFiles(entry as FileSystemDirectoryHandle, depth - 1));
        }
    }
    return out;
}

export interface OpenFilesResult {
    /** Where to navigate, or null when nothing new was opened. */
    first: { dexId: string; wid: string } | null;
    /** What to say when nothing opened; a picker that closes on nothing reads
        as broken. */
    report: string;
}

/** Open every wild sheet among these files. A file already open is skipped
    rather than opened twice, so picking the same folder again adds only what is
    new to it. */
export async function openWildFiles(files: File[]): Promise<OpenFilesResult> {
    let opened = 0, already = 0, notWild = 0, unreadable = 0;
    let first: { dexId: string; wid: string } | null = null;

    for (const file of files) {
        let data: WildPayload;
        try { data = JSON.parse(await file.text()); }
        catch { unreadable++; continue; }
        if (!data || !data[WILD_MARKER] || !data.dexId) { notWild++; continue; }
        if (readWildOpen().some((e) => e.file === file.name && e.dexId === data.dexId)) {
            already++;
            continue;
        }
        const wid = await stashWildSheet(data, file.name);
        if (!wid) { notWild++; continue; }
        if (!first) first = { dexId: data.dexId, wid };
        opened++;
    }

    return { first, report: wildFolderReport(files.length, already, notWild, unreadable) };
}

function wildFolderReport(seen: number, already: number, notWild: number, unreadable: number): string {
    if (!seen) return 'No .json files in that folder.';
    const bits: string[] = [];
    if (already) bits.push(already + ' already open');
    if (notWild) {
        bits.push(notWild + ' not wild Pokémon sheets '
            + '(trainers and the Pokémon on their teams are left alone)');
    }
    if (unreadable) bits.push(unreadable + ' unreadable');
    return 'Nothing new to open.\n\n' + seen + ' .json file' + (seen === 1 ? '' : 's')
        + ' read' + (bits.length ? ': ' + bits.join(', ') : '') + '.';
}
