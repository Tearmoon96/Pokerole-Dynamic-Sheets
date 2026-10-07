/* What the map and the music need from the session, and nothing more.

   The session owns the socket, the signing and the store; the two features
   are kept in files of their own so session.ts stays about who may say what.
   They reach the table only through this. */

import type { BlobChannel } from './blobs';
import type { ServerClock } from './clock';
import type { Body, WireMember } from './protocol';

export interface TableApi {
    readonly clock: ServerClock;
    /** Signs, seals and sends. False when the socket is down. */
    publish(body: Body): Promise<boolean>;
    notify(text: string): void;
    /** The relay's file store for this room; null until joined. */
    files(): BlobChannel | null;
    isHost(): boolean;
    lobbyId(): string;
    members(): WireMember[];
    myId(): string;
    /** Re-render the page: a feature's state changed. */
    changed(): void;
}

/** One hex id per file the GM's browser has put on the relay. */
export function isFileId(v: string): boolean {
    return /^[a-f0-9]{32}$/.test(v);
}
