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
import { relayBase } from './relay';

/** Plaintext per part. With the IV and the tag it stays under the relay's
    1 MiB part limit. */
export const PART_BYTES = 1_000_000;
/** The relay keeps 64 parts a file. */
export const MAX_FILE_BYTES = 64 * PART_BYTES;

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

/** The MIME types a reference may carry. Anything else is filed as bytes. */
export function cleanMime(raw: string): string {
    return /^(audio|image|video)\/[a-z0-9.+-]{1,40}$/.test(raw) ? raw : 'application/octet-stream';
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

        for (let i = 0; i < parts; i++) {
            signal?.throwIfAborted();
            const plain = data.slice(i * PART_BYTES, (i + 1) * PART_BYTES);
            const sealed = await sealPart(this.key, this.addr, id, i, parts, plain);
            await this.putPart(id, i, sealed, signal);
            onProgress?.((i + 1) / parts);
        }
        return { id, sha, size: data.length, parts, mime: cleanMime(file.type) };
    }

    private async putPart(id: string, part: number, body: Bytes, signal?: AbortSignal): Promise<void> {
        /* A part that fails is tried again a couple of times: a phone hotspot
           drops a request now and then, and starting a 40 MB upload over for
           one of them would be the wrong answer. */
        let lastError = '';
        let reclaimed = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(this.base + '/blob/' + id + '/' + part, {
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

    /** True when every part of the file is still on the relay. An idle table
        is wiped after six hours, and a full one drops its oldest files. */
    async present(ref: BlobRef): Promise<boolean> {
        try {
            const res = await fetch(this.base + '/blob/' + ref.id, { cache: 'no-store' });
            if (!res.ok) return false;
            const body = await res.json() as { parts?: unknown };
            return Array.isArray(body.parts) && body.parts.length === ref.parts;
        } catch {
            return false;
        }
    }

    async remove(id: string): Promise<void> {
        if (!this.uploadKey) return;
        try {
            await fetch(this.base + '/blob/' + id, { method: 'DELETE', headers: this.writeHeaders() });
        } catch { /* it is evicted in time anyway */ }
    }

    /** The file, checked. Throws on anything that does not verify. */
    async download(ref: BlobRef, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
        const chunks: Bytes[] = [];
        let total = 0;
        for (let i = 0; i < ref.parts; i++) {
            const res = await fetch(this.base + '/blob/' + ref.id + '/' + i, { signal });
            if (res.status === 404) throw new MissingFileError();
            if (!res.ok) throw new Error('the relay answered ' + res.status);
            const wire = new Uint8Array(await res.arrayBuffer()) as Bytes;
            const plain = await unsealPart(this.key, this.addr, ref.id, i, ref.parts, wire);
            if (!plain) throw new Error('a part of the file did not verify');
            chunks.push(plain);
            total += plain.length;
            onProgress?.((i + 1) / ref.parts);
        }
        if (total !== ref.size) throw new Error('the file is not the size the GM announced');

        const whole = new Uint8Array(total) as Bytes;
        let at = 0;
        for (const c of chunks) { whole.set(c, at); at += c.length; }
        if (await sha256Hex(whole) !== ref.sha) throw new Error('the file does not match what the GM shared');
        return new Blob([whole], { type: ref.mime });
    }
}

/** The relay no longer has the file: the GM's page sends it again. */
export class MissingFileError extends Error {
    constructor() { super('the file is not on the relay any more'); }
}
