/* Moving files through the relay's file store.

   The table's socket carries 32 KB frames, which is a roll, not a song. So a
   file — a track, the shared map — is cut into parts, every part is sealed
   with the room key (crypto.ts `sealPart`) and PUT to the relay, and only a
   small reference travels on the socket, signed by the GM like everything
   else they publish.

   What a receiver checks, in order: each part opens under the room key with
   its own index and count as additional data (so nothing can be reordered,
   dropped or swapped in by the store), and the reassembled file hashes to
   the `sha` the GM signed. Only then is it handed to the page. */

import { sealPart, sha256Hex, unsealPart } from './crypto';
import type { Bytes } from './encoding';
import { cachedFile, keepFile } from './fileCache';
import { FILE_MIME_RE } from './protocol';
import { relayBase } from './relay';

/** Plaintext per part. With the IV and the tag it stays under the relay's
    1 MiB part limit. */
export const PART_BYTES = 1_000_000;
/** The relay keeps 64 parts a file. */
export const MAX_FILE_BYTES = 64 * PART_BYTES;
/** Parts per request, both ways: the relay's free allowance counts requests,
    so a 6 MB track is one GET rather than six. */
const BATCH_PARTS = 8;

export interface BlobRef {
    /** 32 hex characters, drawn here at random. */
    id: string;
    /** SHA-256 of the whole plaintext, hex. */
    sha: string;
    size: number;
    parts: number;
    mime: string;
}

export type Progress = (fraction: number) => void;

export function partsFor(size: number): number {
    return Math.max(1, Math.ceil(size / PART_BYTES));
}

function randomHex(bytes: number): string {
    let s = '';
    for (const b of crypto.getRandomValues(new Uint8Array(bytes))) s += b.toString(16).padStart(2, '0');
    return s;
}

/** The MIME types a reference may carry (protocol.ts). Anything else is
    filed as bytes — an SVG among them. */
export function cleanMime(raw: string): string {
    return FILE_MIME_RE.test(raw) ? raw : 'application/octet-stream';
}

export class BlobChannel {
    private base: string;

    constructor(
        private key: CryptoKey,
        private addr: string,
        /** Only the host has one; a player can read, never write. */
        private uploadKey: string | null,
    ) {
        this.base = relayBase().replace(/^ws/, 'http') + '/room/' + addr;
    }

    private writeHeaders(): Record<string, string> {
        return this.uploadKey ? { 'x-upload-key': this.uploadKey } : {};
    }

    /** Takes the room's file store for this GM. True when it is theirs. */
    async claim(): Promise<boolean> {
        if (!this.uploadKey) return false;
        try {
            const res = await fetch(this.base + '/claim', { method: 'POST', headers: this.writeHeaders() });
            return res.ok;
        } catch {
            return false;
        }
    }

    async upload(file: Blob, onProgress?: Progress, signal?: AbortSignal): Promise<BlobRef> {
        if (!this.uploadKey) throw new Error('Only the GM can share files.');
        if (file.size === 0) throw new Error('That file is empty.');
        if (file.size > MAX_FILE_BYTES) throw new Error('That file is over 64 MB.');

        const data = new Uint8Array(await file.arrayBuffer()) as Bytes;
        const sha = await sha256Hex(data);
        const id = randomHex(16);
        const parts = partsFor(data.length);

        for (let from = 0; from < parts; from += BATCH_PARTS) {
            const sealed: Bytes[] = [];
            for (let i = from; i < Math.min(parts, from + BATCH_PARTS); i++) {
                signal?.throwIfAborted();
                const plain = data.slice(i * PART_BYTES, (i + 1) * PART_BYTES);
                sealed.push(await sealPart(this.key, this.addr, id, i, parts, plain));
            }
            await this.putBatch(id, from, frame(sealed), signal);
            onProgress?.((from + sealed.length) / parts);
        }
        return { id, sha, size: data.length, parts, mime: cleanMime(file.type) };
    }

    private async putBatch(id: string, from: number, body: Bytes, signal?: AbortSignal): Promise<void> {
        /* A part that fails is tried again a couple of times: a phone hotspot
           drops a request now and then, and starting a 40 MB upload over for
           one of them would be the wrong answer. */
        let lastError = '';
        let reclaimed = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(this.base + '/blob/' + id + '?from=' + from, {
                    method: 'PUT', body, headers: this.writeHeaders(), signal,
                });
                if (res.ok) return;
                /* An idle wipe takes the claim with the files: claim again once. */
                if (res.status === 403 && !reclaimed) {
                    reclaimed = true;
                    if (await this.claim()) { attempt--; continue; }
                }
                if (res.status === 403) throw new Error('The relay refused the upload (this table is not yours to write to).');
                if (res.status === 507) throw new Error('The table’s file space is full.');
                lastError = 'the relay answered ' + res.status;
            } catch (e) {
                if (signal?.aborted || (e instanceof Error && e.message.startsWith('The '))) throw e;
                lastError = e instanceof Error ? e.message : 'network error';
            }
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
        throw new Error('Upload failed: ' + lastError + '.');
    }

    /** Which files are still whole on the relay — an idle table is wiped
        after six hours, and a full one drops its oldest files — in one
        request for all of them. Null when the relay could not be asked, which
        callers take as "no news" rather than as everything lost. */
    async inventory(): Promise<Inventory | null> {
        try {
            const res = await fetch(this.base + '/blobs', { cache: 'no-store' });
            if (!res.ok) return null;
            const body = await res.json() as { files?: unknown };
            if (!body.files || typeof body.files !== 'object') return null;
            const files = body.files as Record<string, unknown>;
            return { has: (ref) => files[ref.id] === ref.parts };
        } catch {
            return null;
        }
    }

    /** True when every part of this one file is still on the relay. */
    async present(ref: BlobRef): Promise<boolean> {
        return (await this.inventory())?.has(ref) ?? false;
    }

    async remove(id: string): Promise<void> {
        if (!this.uploadKey) return;
        try {
            await fetch(this.base + '/blob/' + id, { method: 'DELETE', headers: this.writeHeaders() });
        } catch { /* it is evicted in time anyway */ }
    }

    /** The file, checked. Throws on anything that does not verify. A file
        this browser has had before, under any id at any table, comes from
        its own cache (fileCache.ts) and costs the relay nothing. */
    async download(ref: BlobRef, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
        /* The validator already refused any other type; this is the line that
           decides what the blob URL opens as, so it checks again. */
        const mime = cleanMime(ref.mime);
        const kept = await cachedFile(ref.sha, ref.size, mime);
        if (kept) { onProgress?.(1); return kept; }

        const chunks: Bytes[] = [];
        let total = 0;
        for (let from = 0; from < ref.parts; from += BATCH_PARTS) {
            const n = Math.min(BATCH_PARTS, ref.parts - from);
            const res = await fetch(this.base + '/blob/' + ref.id + '?from=' + from + '&n=' + n, { signal });
            if (res.status === 404) throw new MissingFileError();
            if (!res.ok) throw new Error('the relay answered ' + res.status);
            const wires = unframe(new Uint8Array(await res.arrayBuffer()) as Bytes);
            if (!wires || wires.length !== n) throw new Error('a part of the file did not verify');
            for (let k = 0; k < n; k++) {
                const plain = await unsealPart(this.key, this.addr, ref.id, from + k, ref.parts, wires[k]);
                if (!plain) throw new Error('a part of the file did not verify');
                chunks.push(plain);
                total += plain.length;
            }
            onProgress?.((from + n) / ref.parts);
        }
        if (total !== ref.size) throw new Error('the file is not the size the GM announced');

        const whole = new Uint8Array(total) as Bytes;
        let at = 0;
        for (const c of chunks) { whole.set(c, at); at += c.length; }
        if (await sha256Hex(whole) !== ref.sha) throw new Error('the file does not match what the GM shared');
        const blob = new Blob([whole], { type: mime });
        void keepFile(ref.sha, blob);
        return blob;
    }
}

/** What `inventory` found: whether a file is still whole on the relay. */
export interface Inventory {
    has(ref: BlobRef): boolean;
}

/* A batch on the wire: each part prefixed by its length, 4 bytes big-endian
   (worker/src/index.ts reads and writes the same). */
function frame(parts: Bytes[]): Bytes {
    const out = new Uint8Array(parts.reduce((n, p) => n + 4 + p.length, 0)) as Bytes;
    const view = new DataView(out.buffer);
    let at = 0;
    for (const p of parts) {
        view.setUint32(at, p.length);
        out.set(p, at + 4);
        at += 4 + p.length;
    }
    return out;
}

function unframe(body: Bytes): Bytes[] | null {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const parts: Bytes[] = [];
    let at = 0;
    while (at < body.length) {
        if (at + 4 > body.length) return null;
        const len = view.getUint32(at);
        at += 4;
        if (at + len > body.length) return null;
        parts.push(body.slice(at, at + len) as Bytes);
        at += len;
    }
    return parts;
}

/** The relay no longer has the file: the GM's page sends it again. */
export class MissingFileError extends Error {
    constructor() { super('the file is not on the relay any more'); }
}
