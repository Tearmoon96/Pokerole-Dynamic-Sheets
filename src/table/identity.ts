/* Who this browser is at a given table, and how it stays that person.

   Keys are per lobby, not per browser: two tables share no identity, so nothing
   links a player across them. They are kept in IndexedDB because a CryptoKey is
   structured-cloneable but cannot be stringified into localStorage — the same
   reason the trainer sheet keeps its directory handle there.

   This is also what makes the GM's reconnection work. Authority is pinned to a
   key, so a GM whose wifi drops has to come back as the SAME key or every
   client would stop accepting their rolls. Reloading the page reloads the
   keypair, the fingerprint is unchanged, and the lobby id still matches it —
   so nobody re-pins anything and nobody has to rejoin. */

import { idbGet, idbSet, idbDel } from '../state/idb';
import { exportPublicKey, fingerprint, generateSigningKeys } from './crypto';
import type { Bytes } from './encoding';

const HOST_PREFIX = 'pokeroleTable:host:';
const MEMBER_PREFIX = 'pokeroleTable:member:';

export interface Identity {
    id: string;
    pair: CryptoKeyPair;
    publicRaw: Bytes;
}

interface StoredKeys {
    pair: CryptoKeyPair;
    publicRaw: ArrayBuffer;
}

async function load(key: string): Promise<Identity | null> {
    const saved = await idbGet<StoredKeys>(key);
    if (!saved || !saved.pair || !saved.publicRaw) return null;
    const publicRaw = new Uint8Array(saved.publicRaw);
    return { id: await fingerprint(publicRaw), pair: saved.pair, publicRaw };
}

async function store(key: string, identity: Identity): Promise<void> {
    await idbSet(key, {
        pair: identity.pair,
        /* Stored as a plain buffer: a Uint8Array survives structured clone, but
           reading it back as one across browsers has been less reliable than
           re-wrapping a buffer. */
        publicRaw: identity.publicRaw.buffer.slice(
            identity.publicRaw.byteOffset,
            identity.publicRaw.byteOffset + identity.publicRaw.byteLength) as ArrayBuffer,
    } satisfies StoredKeys);
}

async function fresh(): Promise<Identity> {
    const pair = await generateSigningKeys();
    const publicRaw = await exportPublicKey(pair);
    return { id: await fingerprint(publicRaw), pair, publicRaw };
}

/** Creates a lobby. The id is not chosen or drawn at random — it IS the
    fingerprint of the keypair generated here, which is what lets every client
    verify the host from the id alone. */
export async function createHostIdentity(): Promise<Identity> {
    const identity = await fresh();
    await store(HOST_PREFIX + identity.id, identity);
    return identity;
}

/** The host's keypair for a lobby, if this browser is the one that made it.
    A `null` here is how the join flow tells a returning GM from a player. */
export function loadHostIdentity(lobbyId: string): Promise<Identity | null> {
    return load(HOST_PREFIX + lobbyId);
}

/** A player's key for one lobby, reused across reconnects so their roll history
    and their place in the roster survive a refresh. */
export async function memberIdentity(lobbyId: string): Promise<Identity> {
    const key = MEMBER_PREFIX + lobbyId;
    const existing = await load(key);
    if (existing) return existing;
    const identity = await fresh();
    await store(key, identity);
    return identity;
}

/** Leaving a table for good. The host's key is deliberately kept: dropping it
    would make the lobby permanently unhostable, and a GM who closes the tab
    between sessions is the normal case, not an exceptional one. */
export async function forgetMemberIdentity(lobbyId: string): Promise<void> {
    await idbDel(MEMBER_PREFIX + lobbyId);
}
