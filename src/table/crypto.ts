/* The cryptography behind a shared table.

   Two separate jobs, and keeping them separate is the point:

   1. CONFIDENTIALITY comes from the password. Everyone who knows the lobby id
      and the password derives the same AES-GCM key, and the relay — which knows
      neither — sees only ciphertext. It also derives the room ADDRESS from the
      same secret, so a relay cannot even enumerate which rooms exist.

   2. AUTHORITY comes from a signing key, not from the password. Everyone at the
      table holds the room key, so the room key alone cannot tell members apart:
      any player could otherwise forge a message claiming to be the GM. So every
      member also has an ECDSA keypair, every message is signed, and — the part
      that makes this simpler than it sounds — THE LOBBY ID IS THE HOST'S PUBLIC
      KEY FINGERPRINT. A client that knows the lobby id therefore already knows
      exactly which key is allowed to publish a roll. There is no trust-on-first-
      use step and no fingerprint to read aloud; the id people paste into the
      join box is itself the pin. */

import { fromB64u, fromUtf8, toB64u, toBase32, utf8 } from './encoding';
import type { Bytes } from './encoding';

const DOMAIN = 'PDS-table-v1';

/* Both halves of the room secret come from one slow derivation, split by
   domain-separated HKDF so the address cannot be used to attack the key.

   210k iterations is roughly a fifth of a second in a browser. Against the
   32-character generated password it is already irrelevant — that password is
   not falling to any amount of guessing — but it is what protects someone who
   overrides it with a password they invented. */
const KDF_ITERATIONS = 210_000;

/** Truncated fingerprint length, in base32 characters. 16 chars is 80 bits:
    finding a second key with the same fingerprint means 2^80 keypair
    generations, while a human still has a hope of retyping it. */
export const ID_CHARS = 16;

export interface RoomSecrets {
    /** Encrypts and decrypts every payload. Never leaves the browser. */
    key: CryptoKey;
    /** 32 base32 characters. The only thing the relay is told. */
    addr: string;
}

export async function deriveRoom(lobbyId: string, password: string): Promise<RoomSecrets> {
    const material = await crypto.subtle.importKey(
        'raw', utf8(password), 'PBKDF2', false, ['deriveBits']);

    const masterBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: utf8(DOMAIN + '|salt|' + lobbyId),
            iterations: KDF_ITERATIONS,
            hash: 'SHA-256',
        },
        material, 256);

    const master = await crypto.subtle.importKey(
        'raw', masterBits, 'HKDF', false, ['deriveBits', 'deriveKey']);

    const key = await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(DOMAIN + '|key') },
        master, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

    const addrBits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(DOMAIN + '|addr') },
        master, 160);

    return { key, addr: toBase32(new Uint8Array(addrBits)) };
}

/* ------------------------------------------------------------------ sealing */

/** Wraps a plaintext into the envelope the relay forwards.

    The room address is passed as AES-GCM additional data, so a message lifted
    out of one room and replayed into another fails to decrypt rather than
    arriving as a valid-looking roll. */
export async function seal(key: CryptoKey, addr: string, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: utf8(DOMAIN + '|' + addr) },
        key, utf8(plaintext));
    return JSON.stringify({ v: 1, n: toB64u(iv), c: toB64u(new Uint8Array(ct)) });
}

/** The inverse, and the reason a wrong password needs no error path of its own.

    GCM is authenticated encryption, so a wrong key, a flipped bit and a message
    from another room are all the same event: it does not open. Returning null
    rather than throwing keeps that a normal outcome at the call site. */
export async function unseal(key: CryptoKey, addr: string, wire: string): Promise<string | null> {
    try {
        const env: unknown = JSON.parse(wire);
        if (typeof env !== 'object' || env === null) return null;
        const e = env as Record<string, unknown>;
        if (e.v !== 1 || typeof e.n !== 'string' || typeof e.c !== 'string') return null;
        const iv = fromB64u(e.n);
        if (iv.length !== 12) return null;
        const pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, additionalData: utf8(DOMAIN + '|' + addr) },
            key, fromB64u(e.c));
        return fromUtf8(pt);
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ signing */

/** `extractable: false` applies to the private key; WebCrypto always allows the
    public half to be exported, which is what the protocol announces. The private
    key can be stored in IndexedDB and used later, but never read back out —
    not by this app, and not by anything else that reaches the same origin. */
export function generateSigningKeys(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

export async function exportPublicKey(pair: CryptoKeyPair): Promise<Bytes> {
    return new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
}

/** The identity of a member, and — for the host — the lobby id itself. */
export async function fingerprint(publicRaw: Bytes): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', publicRaw);
    return toBase32(new Uint8Array(digest)).slice(0, ID_CHARS);
}

export async function sign(pair: CryptoKeyPair, data: Bytes): Promise<string> {
    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data);
    return toB64u(new Uint8Array(sig));
}

export async function verify(
    publicRaw: Bytes, signature: string, data: Bytes,
): Promise<boolean> {
    try {
        const key = await crypto.subtle.importKey(
            'raw', publicRaw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' }, key, fromB64u(signature), data);
    } catch {
        return false;
    }
}

/** WebCrypto is only present in a secure context. Localhost and https qualify;
    a page served over plain http from another machine does not, and saying so
    up front beats an undefined-property crash three screens later. */
export function cryptoAvailable(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}
