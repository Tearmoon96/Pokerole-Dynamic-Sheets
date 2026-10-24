/* The old room, after the GM changed the password.

   A new password is a new room: the address and the key both come from it
   (crypto.ts). Whoever is at the table when it changes is handed the new one
   sealed to them alone (`move`) and follows. Someone who had crashed, or was
   reloading at that moment, comes back to the OLD room with the old password
   in their saved session — and would find it empty.

   So for an hour (PORTER_MS) the GM's page keeps a line open to each room it
   left and answers there, and only there, the members it carried over: when
   one of them announces their key, they get the new password sealed to that
   key. Nobody else gets anything, so a player kicked before the change, who
   still has the old password, stays out. It never answers more than once in
   ANSWER_GAP_MS for the same member, and sends nothing on its own.

   Kept in localStorage so a reload of the GM's page keeps the doors it left
   open, and forgotten when the GM closes the table. */

import { boxSeal, deriveRoom, exportDhPublic, fingerprint, generateDhKeys, seal, sign, unseal, verify } from './crypto';
import { fromB64u, toB64u, utf8 } from './encoding';
import type { Identity } from './identity';
import { LIMITS, PROTOCOL_VERSION, randomId } from './protocol';
import type { Body, Inner } from './protocol';
import { roomUrl } from './relay';
import { RelayTransport } from './transport';
import { parseInner, parseSigned, safeParse } from './validate';

export const PORTER_MS = 60 * 60 * 1000;
const ANSWER_GAP_MS = 10_000;
const MOVED_KEY = 'pokerole_table_moved';
/** Old rooms kept open at once: three password changes within the hour. */
const MAX_ROOMS = 3;

export interface MovedRecord {
    lobbyId: string;
    /** The rooms left behind, by the password that made them. */
    rooms: { password: string; until: number }[];
    /** The members who may be handed the current password there. */
    carry: string[];
}

export function loadMoved(lobbyId: string): MovedRecord | null {
    try {
        const raw = JSON.parse(localStorage.getItem(MOVED_KEY) || 'null');
        if (!raw || raw.lobbyId !== lobbyId || !Array.isArray(raw.rooms) || !Array.isArray(raw.carry)) return null;
        const now = Date.now();
        const rooms = raw.rooms
            .filter((r: { password?: unknown; until?: unknown }) => typeof r?.password === 'string' && typeof r?.until === 'number' && r.until > now)
            .slice(-MAX_ROOMS);
        if (!rooms.length) return null;
        const carry = raw.carry.filter((id: unknown) => typeof id === 'string' && /^[A-Z2-7]{16}$/.test(id)).slice(0, LIMITS.MAX_MEMBERS * 2);
        return { lobbyId, rooms, carry };
    } catch {
        return null;
    }
}

export function saveMoved(r: MovedRecord | null): void {
    try {
        if (r) localStorage.setItem(MOVED_KEY, JSON.stringify(r));
        else localStorage.removeItem(MOVED_KEY);
    } catch { /* quota: the doors close on the GM's next reload */ }
}

/** A room just left: open for another hour, beside the ones still open. */
export function rememberMove(lobbyId: string, oldPassword: string, carry: Iterable<string>): void {
    const prev = loadMoved(lobbyId);
    const rooms = [...(prev?.rooms ?? []).filter((r) => r.password !== oldPassword), { password: oldPassword, until: Date.now() + PORTER_MS }]
        .slice(-MAX_ROOMS);
    saveMoved({ lobbyId, rooms, carry: [...new Set([...(prev?.carry ?? []), ...carry])] });
}

/** A member kicked after a change is not carried over any more either. */
export function dropFromMoved(lobbyId: string, id: string): void {
    const r = loadMoved(lobbyId);
    if (r && r.carry.includes(id)) saveMoved({ ...r, carry: r.carry.filter((x) => x !== id) });
}

export class Porter {
    private transport: RelayTransport | null = null;
    private room: { key: CryptoKey; addr: string } | null = null;
    private sid = randomId(6);
    private seq = 0;
    private seen = new Map<string, number>();
    private answered = new Map<string, number>();
    private closer: number | null = null;
    private outbox: Promise<unknown> = Promise.resolve();

    constructor(
        private identity: Identity,
        private lobbyId: string,
        private oldPassword: string,
        private until: number,
        /** The password to hand out now: the GM's current one. */
        private current: () => string,
    ) {}

    async start(): Promise<void> {
        const room = await deriveRoom(this.lobbyId, this.oldPassword);
        if (Date.now() >= this.until) return;
        this.room = room;
        this.transport = new RelayTransport(roomUrl(room.addr), {
            onMessage: (text) => { void this.receive(text); },
            onStatus: () => { /* nothing to show: this is a door, not the table */ },
            onClock: () => { /* no clock here */ },
        });
        this.transport.start();
        this.closer = window.setTimeout(() => this.stop(), this.until - Date.now());
    }

    stop(): void {
        if (this.closer !== null) clearTimeout(this.closer);
        this.closer = null;
        this.transport?.stop();
        this.transport = null;
        this.room = null;
    }

    /** The same gauntlet as the table's own (session.ts `receive`), for the
        one message this door listens to. */
    private async receive(wire: string): Promise<void> {
        const room = this.room;
        if (!room || wire.length > LIMITS.MAX_WIRE_CHARS * 2) return;
        const plain = await unseal(room.key, room.addr, wire);
        if (plain === null) return;
        let outer: unknown;
        try { outer = safeParse(plain); } catch { return; }
        const signed = parseSigned(outer);
        if (!signed) return;
        let innerRaw: unknown;
        try { innerRaw = safeParse(signed.p); } catch { return; }
        const inner = parseInner(innerRaw, room.addr);
        if (!inner || inner.b.k !== 'key' || inner.f === this.identity.id) return;
        const carry = loadMoved(this.lobbyId)?.carry ?? [];
        if (!carry.includes(inner.f)) return;
        if (Math.abs(Date.now() - inner.ts) > LIMITS.CLOCK_SKEW_MS) return;
        let publicRaw: Uint8Array;
        try { publicRaw = fromB64u(inner.k); } catch { return; }
        if (publicRaw.length !== 65 || await fingerprint(publicRaw as never) !== inner.f) return;
        if (!await verify(publicRaw as never, signed.g, utf8(signed.p))) return;
        const last = this.seen.get(inner.f + '|' + inner.sid);
        if (last !== undefined && inner.s <= last) return;
        this.seen.set(inner.f + '|' + inner.sid, inner.s);
        if (Date.now() - (this.answered.get(inner.f) ?? 0) < ANSWER_GAP_MS) return;
        this.answered.set(inner.f, Date.now());

        const eph = await generateDhKeys();
        const c = await boxSeal(eph.privateKey, inner.b.dh, room.addr + '|' + inner.f, this.current());
        await this.send({ k: 'move', dh: await exportDhPublic(eph), to: [{ id: inner.f, c }] });
    }

    private send(body: Body): Promise<void> {
        const run = this.outbox.then(async () => {
            const room = this.room;
            if (!room || !this.transport?.connected) return;
            const inner: Inner = {
                v: PROTOCOL_VERSION, a: room.addr, f: this.identity.id, k: toB64u(this.identity.publicRaw),
                sid: this.sid, s: ++this.seq, ts: Date.now(), b: body,
            };
            const p = JSON.stringify(inner);
            const g = await sign(this.identity.pair, utf8(p));
            this.transport?.send(await seal(room.key, room.addr, JSON.stringify({ p, g })));
        });
        this.outbox = run.catch(() => undefined);
        return run;
    }
}
