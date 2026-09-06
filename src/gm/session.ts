import { idbDel, idbGet, idbSet } from '../state/idb';
import { normalizeGmState } from './state';
import { workingTrainerData } from './workingSet';
import type { GmState } from './types';
import type { TrainerState } from '../state/types';

/* Session files.

   localStorage keeps the screen across reloads, but it is per-browser and
   silently capped. A session file is the copy you can keep beside the campaign,
   hand to someone, or put on another machine — so it carries the trainers
   themselves, not just the ids the roster holds: there is no shared working set
   to look them up in over there. */

export const SESSION_MARKER = '_pokeroleGmSession';
export const SESSION_HANDLE_KEY = 'gmSessionFile';

export interface SessionPayload {
    app: string | null;
    savedAt: string;
    gm: GmState;
    trainers: TrainerState[];
    [marker: string]: unknown;
}

export function sessionFileName(): string {
    return 'pokerole-gm-session.json';
}

export function sessionPayload(state: GmState, appVersion: string): SessionPayload {
    /* The trainers travel with the session, resolved out of the shared working
       set at save time. Wilds and everything else already live inside the
       board's own state. */
    return {
        [SESSION_MARKER]: true,
        app: appVersion || null,
        savedAt: new Date().toISOString(),
        gm: state,
        trainers: state.trainerIds.map(workingTrainerData).filter((t): t is TrainerState => !!t),
    };
}

export function sessionJson(state: GmState, appVersion: string): string {
    return JSON.stringify(sessionPayload(state, appVersion), null, 2);
}

export function parseSession(text: string): SessionPayload | null {
    let data: SessionPayload;
    try { data = JSON.parse(text); }
    catch { return null; }
    return (data && data[SESSION_MARKER]) ? data : null;
}

export function readSessionHandle(): Promise<FileSystemFileHandle | undefined> {
    return idbGet<FileSystemFileHandle>(SESSION_HANDLE_KEY);
}

export function rememberSessionHandle(handle: FileSystemFileHandle): Promise<void> {
    return idbSet(SESSION_HANDLE_KEY, handle);
}

export function forgetSessionHandle(): Promise<void> {
    return idbDel(SESSION_HANDLE_KEY);
}

export async function ensureWritable(handle: FileSystemFileHandle | null): Promise<boolean> {
    if (!handle || !handle.queryPermission) return false;
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && handle.requestPermission) {
        perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted';
}

export function downloadSession(json: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sessionFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export interface WriteResult { ok: boolean; status: string; warn: boolean }

export async function writeSession(handle: FileSystemFileHandle, json: string): Promise<WriteResult> {
    try {
        const w = await handle.createWritable();
        await w.write(json);
        await w.close();
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return { ok: true, status: handle.name + ' — saved ' + time, warn: false };
    } catch (e) {
        /* Moved, deleted, or a drive that went away: forget it so the next save
           asks for a file instead of failing again */
        console.warn('Session save failed', e);
        await forgetSessionHandle();
        return { ok: false, status: 'Could not write that file — use Save to pick another.', warn: true };
    }
}

/** Put the trainers back in the shared working set, then rebuild the board.
    One already open in the License page wins: that is the live one. */
export function sessionToState(
    data: SessionPayload,
    upsert: (t: TrainerState) => void,
): GmState {
    (data.trainers || []).forEach((t) => { if (t && t.id) upsert(t); });
    return normalizeGmState(data.gm);
}
