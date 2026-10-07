/* The GM's music library, kept in this browser.

   The tracks themselves — the audio files, or YouTube ids — belong to the
   browser, not to a table: a GM builds a library once and uses it at every
   lobby they host. What a TABLE knows is where each file sits on its relay
   (`uploads`), which is per lobby, and what the two decks are doing (`decks`),
   so a GM who reloads mid-session picks up exactly where the music was.

   IndexedDB, because a File is structured-cloneable and localStorage cannot
   hold one. */

import { idbDel, idbGet, idbSet } from '../../state/idb';
import type { ChannelState, WireFile } from '../protocol';

const LIBRARY_KEY = 'pokeroleTable:library';
const UPLOADS_PREFIX = 'pokeroleTable:uploads:';
const DECKS_PREFIX = 'pokeroleTable:decks:';

export interface LibEntry {
    id: string;
    title: string;
    kind: 'file' | 'yt';
    /** The audio itself, for a file track. */
    blob?: Blob;
    yt?: string;
    dur: number;
    /** Players see the title. Off unless the GM turns it on. */
    reveal?: boolean;
}

export interface SavedDecks {
    rev: number;
    bg: ChannelState;
    scene: ChannelState;
}

export async function loadLibrary(): Promise<LibEntry[]> {
    const raw = await idbGet<LibEntry[]>(LIBRARY_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter((e) => e && typeof e.id === 'string' && typeof e.title === 'string'
        && (e.kind === 'yt' ? typeof e.yt === 'string' : e.blob instanceof Blob));
}

export function saveLibrary(entries: LibEntry[]): Promise<void> {
    return idbSet(LIBRARY_KEY, entries);
}

export async function loadUploads(lobbyId: string): Promise<Record<string, WireFile>> {
    const raw = await idbGet<Record<string, WireFile>>(UPLOADS_PREFIX + lobbyId);
    return raw && typeof raw === 'object' ? raw : {};
}

export function saveUploads(lobbyId: string, uploads: Record<string, WireFile>): Promise<void> {
    return idbSet(UPLOADS_PREFIX + lobbyId, uploads);
}

export async function loadDecks(lobbyId: string): Promise<SavedDecks | null> {
    const raw = await idbGet<SavedDecks>(DECKS_PREFIX + lobbyId);
    return raw && raw.bg && raw.scene ? raw : null;
}

export function saveDecks(lobbyId: string, decks: SavedDecks): Promise<void> {
    return idbSet(DECKS_PREFIX + lobbyId, decks);
}

export async function forgetTable(lobbyId: string): Promise<void> {
    await idbDel(UPLOADS_PREFIX + lobbyId);
    await idbDel(DECKS_PREFIX + lobbyId);
}
