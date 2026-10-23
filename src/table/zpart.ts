/* A piece of a shared sheet as it travels: JSON, deflated, base64url.

   A Pokémon's card is ~2 KB of JSON and deflates to a third of that or less,
   so a whole trainer with a full team fits in one frame. The relay counts
   frames, not bytes, but the frame has a ceiling (protocol.ts), and this is
   what keeps a sheet under it.

   Inflating is where a hostile sender could hand over a few KB that grow to
   gigabytes, so it stops reading past `max` and fails. */

import { fromB64u, toB64u } from './encoding';
import type { Bytes } from './encoding';
import { safeParse } from './validate';

/** The most a part may inflate to. A trainer without its pictures is a few
    KB; this is room for long notes and many custom moves. */
export const PART_MAX_CHARS = 96 * 1024;

async function pipe(bytes: Bytes, stream: CompressionStream | DecompressionStream, max: number): Promise<Bytes | null> {
    const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > max) { void reader.cancel(); return null; }
        chunks.push(value);
    }
    const out = new Uint8Array(total) as Bytes;
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
}

export async function packPart(text: string): Promise<string> {
    const raw = new TextEncoder().encode(text) as Bytes;
    const z = await pipe(raw, new CompressionStream('deflate-raw'), Infinity);
    return toB64u(z!);
}

/** The part's JSON, parsed with the prototype keys dropped, or null for
    anything that is not a well-formed part within the limit. */
export async function unpackPart(z: string): Promise<unknown> {
    try {
        const raw = await pipe(fromB64u(z), new DecompressionStream('deflate-raw'), PART_MAX_CHARS * 3);
        if (!raw) return null;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
        if (text.length > PART_MAX_CHARS) return null;
        return safeParse(text);
    } catch {
        return null;
    }
}
