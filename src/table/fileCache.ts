/* What a player has already downloaded from a table, kept by its content.

   A GM's playlist is the same week after week, but every table and every
   upload gives a file a fresh relay id, and the relay wipes an idle table
   after six hours. So a file is filed here by the SHA-256 of its bytes —
   which the GM signs in every reference — and a player who has heard a
   track once never fetches it from the relay again, whichever table, lobby
   or upload it comes back under. Each fetch saved is a request the relay's
   free allowance does not spend.

   IndexedDB, through the same small box the rest of the app uses. The
   bytes are hashed again on the way out, so a damaged entry is a miss,
   never a wrong file. Least recently used goes first past BUDGET_BYTES. */

import { idbDel, idbGet, idbSet } from '../state/idb';
import { sha256Hex } from './crypto';
import type { Bytes } from './encoding';

const INDEX_KEY = 'pokeroleTable:fileCache';
const FILE_PREFIX = 'pokeroleTable:file:';
const BUDGET_BYTES = 400 * 1024 * 1024;

type Index = Record<string, { size: number; at: number }>;

async function readIndex(): Promise<Index> {
    const raw = await idbGet<Index>(INDEX_KEY);
    return raw && typeof raw === 'object' ? raw : {};
}

/* Writes to the index are chained, so two downloads finishing together do
   not each write back an index missing the other's entry. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
    const next = chain.then(job, job);
    chain = next.catch(() => undefined);
    return next;
}

/** The file with this hash and size, or null. */
export async function cachedFile(sha: string, size: number, mime: string): Promise<Blob | null> {
    const index = await readIndex();
    if (index[sha]?.size !== size) return null;
    const blob = await idbGet<Blob>(FILE_PREFIX + sha);
    if (!(blob instanceof Blob) || blob.size !== size) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer()) as Bytes;
    if (await sha256Hex(bytes) !== sha) {
        void forget(sha);
        return null;
    }
    void serial(async () => {
        const now = await readIndex();
        if (now[sha]) { now[sha].at = Date.now(); await idbSet(INDEX_KEY, now); }
    });
    return new Blob([bytes], { type: mime });
}

/** Keeps a file that has just been checked against its hash. */
export function keepFile(sha: string, blob: Blob): Promise<void> {
    if (blob.size > BUDGET_BYTES / 4) return Promise.resolve();
    return serial(async () => {
        const index = await readIndex();
        if (index[sha]?.size === blob.size) return;
        let used = Object.values(index).reduce((n, e) => n + e.size, 0);
        const oldest = Object.entries(index).sort((a, b) => a[1].at - b[1].at);
        while (used + blob.size > BUDGET_BYTES && oldest.length) {
            const [gone, e] = oldest.shift()!;
            delete index[gone];
            used -= e.size;
            await idbDel(FILE_PREFIX + gone);
        }
        await idbSet(FILE_PREFIX + sha, blob);
        index[sha] = { size: blob.size, at: Date.now() };
        await idbSet(INDEX_KEY, index);
    });
}

function forget(sha: string): Promise<void> {
    return serial(async () => {
        const index = await readIndex();
        delete index[sha];
        await idbDel(FILE_PREFIX + sha);
        await idbSet(INDEX_KEY, index);
    });
}
