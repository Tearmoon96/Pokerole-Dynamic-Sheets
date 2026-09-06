/* A one-store key/value box in IndexedDB. It exists for directory handles,
   which are structured-cloneable but cannot go in localStorage. Every call
   swallows its own failure: a private window with IndexedDB disabled must
   degrade to "you'll be asked for the folder again", never to an error. */

const DB_NAME = 'pokerole-license';
const STORE = 'kv';

export const IDB_HANDLE_KEY = 'dirHandle';
export const IDB_COREBOOK_KEY = 'coreBookDirHandle';

function idbOpen(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const open = indexedDB.open(DB_NAME, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE);
        open.onsuccess = () => res(open.result);
        open.onerror = () => rej(open.error);
    });
}

export async function idbSet(key: string, val: unknown): Promise<void> {
    try {
        const db = await idbOpen();
        await new Promise<void>((res, rej) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(val, key);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
        db.close();
    } catch (e) { console.warn('idbSet failed', e); }
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
    try {
        const db = await idbOpen();
        const val = await new Promise<T>((res, rej) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => res(req.result as T);
            req.onerror = () => rej(req.error);
        });
        db.close();
        return val;
    } catch { return undefined; }
}

export async function idbDel(key: string): Promise<void> {
    try {
        const db = await idbOpen();
        await new Promise<void>((res, rej) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(key);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
        db.close();
    } catch (e) { console.warn('idbDel failed', e); }
}
