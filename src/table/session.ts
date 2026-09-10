/* The rolling table: who is here, what was rolled, and who is allowed to say so.

   Every security decision on the client side lives in this file, so that the
   transport underneath it can be swapped without any of them moving.

   The shape of the thing:

     - The HOST is the only member who rolls dice. Players send a request; the
       host validates it, rolls, and publishes the result. A player cannot
       fabricate a result because the lobby id is the host's public key
       fingerprint, so `f === lobbyId` is a check anyone can make from the id
       they typed into the join box.

     - Inbound messages are decrypted, parsed, key-checked, signature-checked,
       clock-checked and replay-checked BEFORE anything reaches the UI. The
       order matters and is spelled out at `receive` below.

     - The store follows the same pattern as the GM screen's: a mutable state
       object plus a version counter, read through useSyncExternalStore. */

import { CRIT_MARGIN } from '../gm/constants';
import { roll } from '../gm/dice';
import { deriveRoom, fingerprint, seal, sign, unseal, verify } from './crypto';
import type { RoomSecrets } from './crypto';
import { formatLobbyId, fromB64u, generatePassword, normaliseLobbyId, toB64u, utf8 } from './encoding';
import type { Bytes } from './encoding';
import { createHostIdentity, loadHostIdentity, memberIdentity } from './identity';
import type { Identity } from './identity';
import { HEARTBEAT_MS, LIMITS, PRESENCE_TIMEOUT_MS, PROTOCOL_VERSION, randomId } from './protocol';
import type { Body, Inner, WireMember, WireRoll } from './protocol';
import { roomUrl } from './relay';
import { fabricateD6, fabricateTotal } from './scripted';
import { RelayTransport } from './transport';
import type { TransportStatus } from './transport';
import { cleanText, parseInner, parseSigned, safeParse } from './validate';

/** A roll as this browser holds it. `hidden` is set only on the host's own
    machine, for a roll that was never published — it is not a wire field and
    there is nothing for a patched client elsewhere to reveal. */
export interface LocalRoll extends WireRoll {
    hidden?: boolean;
}

export interface PendingRoll {
    rid: string;
    label: string;
    at: number;
}

export type Phase = 'setup' | 'joining' | 'live';

export interface TableState {
    phase: Phase;
    /** Connection to the relay, not presence of the GM. */
    status: TransportStatus;
    statusDetail: string;
    /** Fatal, shown on the join screen. */
    error: string;
    /** Transient, plain text. Never HTML — see the note on notices below. */
    notice: string;

    lobbyId: string;
    password: string;
    myId: string;
    myName: string;
    isHost: boolean;

    members: WireMember[];
    rolls: LocalRoll[];
    pending: PendingRoll[];
    /** False when the GM has gone quiet: the table waits rather than rolls. */
    hostOnline: boolean;

    /* Roll controls. */
    count: number;
    sides: number;
    note: string;

    /* Host-only controls. Meaningless for a player and never sent. */
    hideMyRolls: boolean;
    scripted: boolean;
    scriptSuccesses: number;
    scriptTotal: number;
}

function initialState(): TableState {
    return {
        /* A saved session is restored on load, so showing the join form first
           would be a flash of the wrong screen on every refresh. */
        phase: hasSavedSession() ? 'joining' : 'setup',
        status: 'offline',
        statusDetail: '',
        error: '',
        notice: '',
        lobbyId: '',
        password: '',
        myId: '',
        myName: '',
        isHost: false,
        members: [],
        rolls: [],
        pending: [],
        hostOnline: false,
        count: 4,
        sides: 6,
        note: '',
        /* GMs hide their rolls far more often than not, so that is the state the
           checkbox starts in. Making it opt-in would mean the first roll of
           every session leaks by accident. */
        hideMyRolls: true,
        scripted: false,
        scriptSuccesses: 2,
        scriptTotal: 10,
    };
}

/* The lobby the browser is currently sitting at, so a refresh does not mean
   retyping a 32-character password. This does put the password in localStorage:
   the alternative is a table that falls apart every time the GM reloads, and
   the same profile already holds the signing keys in IndexedDB, so it changes
   nothing about who can take over a session with access to the machine.
   "Leave table" clears it. */
const SESSION_KEY = 'pokerole_table_session';

interface SavedSession {
    lobbyId: string;
    password: string;
    name: string;
}

function saveSession(s: SavedSession): void {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

function loadSession(): SavedSession | null {
    try {
        const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return null;
        const lobbyId = normaliseLobbyId(String(raw.lobbyId || ''));
        const password = String(raw.password || '');
        const name = cleanText(raw.name, LIMITS.MAX_NAME);
        if (lobbyId.length !== 16 || !password || !name) return null;
        return { lobbyId, password, name };
    } catch {
        return null;
    }
}

function hasSavedSession(): boolean {
    return loadSession() !== null;
}

function clearSession(): void {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing to do */ }
}

type Listener = () => void;

export class TableStore {
    private listeners = new Set<Listener>();
    private version = 0;
    state: TableState = initialState();

    subscribe = (cb: Listener): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    getSnapshot = (): number => this.version;

    update(mutate: (s: TableState) => void): void {
        const next = { ...this.state };
        mutate(next);
        this.state = next;
        this.version++;
        this.listeners.forEach((l) => l());
    }
}

/** Token bucket: five rolls in hand, one back every two seconds. Enough that a
    player never notices it, low enough that a script cannot fill the feed. */
interface Bucket { tokens: number; last: number }
const BUCKET_MAX = 5;
const BUCKET_REFILL_MS = 2000;

export class TableSession {
    readonly store = new TableStore();

    private transport: RelayTransport | null = null;
    private room: RoomSecrets | null = null;
    private identity: Identity | null = null;

    /* Fresh every page load, so a reloaded tab starting its counter at zero is
       not mistaken for a replay of the old one. */
    private sid = randomId(6);
    private seq = 0;
    private seen = new Map<string, number>();

    /* Host-side bookkeeping. Empty on a player. */
    private names = new Map<string, string>();
    private lastSeenAt = new Map<string, number>();
    /* memberId -> the page-load id we last sent history to. Keyed by session
       rather than by member so a player who reloads gets the feed back, while
       a heartbeat from someone already sitting there does not resend it. */
    private greeted = new Map<string, string>();
    private handledRids = new Set<string>();
    private buckets = new Map<string, Bucket>();

    /* Requests made while the socket was down. Held as bodies, not as sealed
       envelopes, because they are re-signed with a fresh sequence and timestamp
       on the way out — an old signature would fall outside the replay window by
       the time the GM came back. */
    private queue: Body[] = [];

    private heartbeat: number | null = null;
    private hostSeenAt = 0;

    /* ------------------------------------------------------------- joining */

    /** Creates a lobby. The id is the fingerprint of the keypair generated here,
        which is what lets every other client verify the host from the id alone. */
    async createLobby(rawName: string): Promise<void> {
        const name = cleanText(rawName, LIMITS.MAX_NAME);
        if (!name) { this.fail('Choose a name first.'); return; }

        this.store.update((s) => { s.phase = 'joining'; s.error = ''; });
        try {
            const identity = await createHostIdentity();
            const password = generatePassword();
            await this.begin(identity, identity.id, password, name, true);
        } catch (e) {
            this.fail('Could not create the lobby: ' + describe(e));
        }
    }

    /** Joins an existing lobby — or rejoins one this browser hosts, which is how
        a GM who reloaded gets their authority back without anyone re-pinning. */
    async joinLobby(rawId: string, password: string, rawName: string): Promise<void> {
        const lobbyId = normaliseLobbyId(rawId);
        const name = cleanText(rawName, LIMITS.MAX_NAME);

        if (lobbyId.length !== 16) { this.fail('That lobby id is not 16 characters.'); return; }
        if (!password) { this.fail('Enter the lobby password.'); return; }
        if (!name) { this.fail('Choose a name first.'); return; }

        this.store.update((s) => { s.phase = 'joining'; s.error = ''; });
        try {
            const host = await loadHostIdentity(lobbyId);
            const identity = host ?? await memberIdentity(lobbyId);
            await this.begin(identity, lobbyId, password, name, host !== null);
        } catch (e) {
            this.fail('Could not join: ' + describe(e));
        }
    }

    /** Rejoins whatever table this browser was last at. Called once on load. */
    private restored = false;

    async restore(): Promise<boolean> {
        if (this.restored) return true;
        this.restored = true;
        const saved = loadSession();
        if (!saved) {
            this.store.update((s) => { s.phase = 'setup'; });
            return false;
        }
        await this.joinLobby(saved.lobbyId, saved.password, saved.name);
        return true;
    }

    private async begin(
        identity: Identity, lobbyId: string, password: string, name: string, isHost: boolean,
    ): Promise<void> {
        /* A rejoin, or StrictMode mounting the effect twice: never leave the
           previous socket and heartbeat running alongside the new ones. */
        this.teardown();

        this.room = await deriveRoom(lobbyId, password);
        this.identity = identity;
        this.seq = 0;
        this.seen.clear();
        this.queue = [];
        this.hostSeenAt = isHost ? Date.now() : 0;

        this.names.clear();
        this.lastSeenAt.clear();
        this.greeted.clear();
        this.handledRids.clear();
        this.buckets.clear();
        if (isHost) this.names.set(identity.id, name);

        saveSession({ lobbyId, password, name });

        this.store.update((s) => {
            s.phase = 'live';
            s.lobbyId = lobbyId;
            s.password = password;
            s.myId = identity.id;
            s.myName = name;
            s.isHost = isHost;
            s.members = isHost ? [{ id: identity.id, name, host: true }] : [];
            s.rolls = [];
            s.pending = [];
            s.hostOnline = isHost;
            s.error = '';
        });

        this.transport = new RelayTransport(roomUrl(this.room.addr), {
            onMessage: (text) => { void this.receive(text); },
            onStatus: (status, detail) => this.onStatus(status, detail),
        });
        this.transport.start();

        this.heartbeat = window.setInterval(() => this.tick(), HEARTBEAT_MS);
    }

    private teardown(): void {
        if (this.heartbeat !== null) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        this.transport?.stop();
        this.transport = null;
        this.room = null;
        this.identity = null;
    }

    private fail(message: string): void {
        this.store.update((s) => { s.phase = 'setup'; s.error = message; });
    }

    /** Leaves for good: stops the socket, forgets the saved session, and resets.
        The host's keypair is deliberately kept, so the same lobby can be hosted
        again later — see identity.ts. */
    leave(): void {
        this.teardown();
        clearSession();
        this.store.state = initialState();
        this.store.update(() => { /* reset, and notify */ });
    }

    /* ------------------------------------------------------------ outbound */

    private async publish(body: Body): Promise<boolean> {
        if (!this.room || !this.identity) return false;

        const inner: Inner = {
            v: PROTOCOL_VERSION,
            a: this.room.addr,
            f: this.identity.id,
            k: toB64u(this.identity.publicRaw),
            sid: this.sid,
            s: ++this.seq,
            ts: Date.now(),
            b: body,
        };

        /* The exact string that gets signed is the exact string that travels,
           and the receiver verifies before parsing it. No canonical-JSON
           agreement is needed anywhere. */
        const p = JSON.stringify(inner);
        if (p.length > LIMITS.MAX_WIRE_CHARS) {
            this.notify('That message is too large to send.');
            return false;
        }
        const g = await sign(this.identity.pair, utf8(p));
        const wire = await seal(this.room.key, this.room.addr, JSON.stringify({ p, g }));

        return this.transport?.send(wire) ?? false;
    }

    private onStatus(status: TransportStatus, detail: string): void {
        this.store.update((s) => {
            s.status = status;
            s.statusDetail = detail;
            if (status !== 'online') s.hostOnline = s.isHost;
        });

        if (status === 'online') {
            /* Announce first so the host can put us back in the roster, then
               replay anything that piled up while the socket was down. */
            void this.announce().then(() => this.flushQueue());
        }
    }

    private announce(): Promise<boolean> {
        return this.publish({ k: 'hello', name: this.store.state.myName });
    }

    private flushQueue(): void {
        const queued = this.queue;
        this.queue = [];
        void (async () => {
            for (const body of queued) {
                if (!await this.publish(body)) {
                    /* Still down. Put the rest back and wait for the next open. */
                    this.queue.push(body);
                }
            }
        })();
    }

    private tick(): void {
        void this.announce();

        if (this.store.state.isHost) {
            this.prunePresence();
            void this.publishRoster();
        } else {
            const online = Date.now() - this.hostSeenAt < PRESENCE_TIMEOUT_MS;
            if (online !== this.store.state.hostOnline) {
                this.store.update((s) => { s.hostOnline = online; });
            }
        }

        /* A request that never came back — the GM was away when it was sent, or
           dropped it. Expire it rather than leave a spinner forever. */
        const cutoff = Date.now() - PRESENCE_TIMEOUT_MS;
        if (this.store.state.pending.some((p) => p.at < cutoff)) {
            this.store.update((s) => { s.pending = s.pending.filter((p) => p.at >= cutoff); });
        }
    }

    /* ------------------------------------------------------------- inbound */

    /** The gauntlet every remote message runs, in this order and no other:

        1. decrypt        — wrong password, tampering, and another room's traffic
                            all fail here and are indistinguishable, as they
                            should be
        2. parse          — strict, unknown fields rejected, prototype keys dropped
        3. key matches id — the announced public key must hash to the claimed
                            fingerprint, so `f` cannot be borrowed
        4. signature      — over the exact bytes that were signed
        5. clock window   — bounds how long a captured message stays replayable
        6. sequence       — monotonic per sender per session

        Only then does anything reach the state. Every failure is a silent drop:
        a hostile sender learns nothing from the difference between "malformed"
        and "bad signature". */
    private async receive(wire: string): Promise<void> {
        if (!this.room || !this.identity) return;
        if (wire.length > LIMITS.MAX_WIRE_CHARS * 2) return;

        const plain = await unseal(this.room.key, this.room.addr, wire);
        if (plain === null) return;

        let outer: unknown;
        try { outer = safeParse(plain); } catch { return; }
        const signed = parseSigned(outer);
        if (!signed) return;

        let innerRaw: unknown;
        try { innerRaw = safeParse(signed.p); } catch { return; }
        const inner = parseInner(innerRaw, this.room.addr);
        if (!inner) return;

        if (inner.f === this.identity.id) return;
        if (Math.abs(Date.now() - inner.ts) > LIMITS.CLOCK_SKEW_MS) return;

        let publicRaw: Bytes;
        try { publicRaw = fromB64u(inner.k); } catch { return; }
        if (publicRaw.length !== 65) return;
        if (await fingerprint(publicRaw) !== inner.f) return;

        if (!await verify(publicRaw, signed.g, utf8(signed.p))) return;

        const seenKey = inner.f + '|' + inner.sid;
        const last = this.seen.get(seenKey);
        if (last !== undefined && inner.s <= last) return;
        this.seen.set(seenKey, inner.s);
        /* Bounded: a long session with several reconnects would otherwise keep
           one entry per sender per page load forever. */
        if (this.seen.size > 256) {
            const oldest = this.seen.keys().next().value;
            if (oldest !== undefined) this.seen.delete(oldest);
        }

        this.dispatch(inner);
    }

    private dispatch(inner: Inner): void {
        const body = inner.b;

        if (this.store.state.isHost) {
            /* The host acts only on what a player is allowed to say. Anything
               claiming authority is ignored outright: there is only one host,
               and this is it. */
            if (body.k === 'hello') this.onHello(inner.f, body.name, inner.sid);
            else if (body.k === 'request') this.onRequest(inner.f, body);
            return;
        }

        /* A player accepts authority ONLY from the key the lobby id names.
           This single comparison is what makes a forged roll impossible: an
           impostor would need a keypair whose fingerprint matches the lobby id. */
        if (inner.f !== this.store.state.lobbyId) return;

        this.hostSeenAt = Date.now();

        switch (body.k) {
            case 'roster':
                this.store.update((s) => {
                    s.members = body.members;
                    s.hostOnline = true;
                });
                break;

            case 'result':
                this.store.update((s) => {
                    if (s.rolls.some((r) => r.id === body.roll.id)) return;
                    s.rolls = [body.roll, ...s.rolls].slice(0, LIMITS.HISTORY);
                    if (body.rid) s.pending = s.pending.filter((p) => p.rid !== body.rid);
                    s.hostOnline = true;
                });
                break;

            case 'sync':
                /* Merged, not replaced: the same public history reaches everyone
                   when anyone joins, and replacing would reorder a feed someone
                   is in the middle of reading. */
                this.store.update((s) => {
                    const byId = new Map(s.rolls.map((r) => [r.id, r] as const));
                    for (const r of body.rolls) if (!byId.has(r.id)) byId.set(r.id, r);
                    s.rolls = [...byId.values()]
                        .sort((a, b) => b.t - a.t)
                        .slice(0, LIMITS.HISTORY);
                    s.hostOnline = true;
                });
                break;

            case 'clear':
                this.store.update((s) => { s.rolls = []; });
                break;

            case 'kick':
                if (body.id === this.store.state.myId) {
                    this.leave();
                    this.store.update((s) => { s.error = 'The GM removed you from the table.'; });
                }
                break;

            default:
                /* hello, request: other players talking to the host. Not ours. */
                break;
        }
    }

    /* -------------------------------------------------------- host duties */

    private onHello(id: string, name: string, sid: string): void {
        this.lastSeenAt.set(id, Date.now());
        this.names.set(id, name);

        /* Answered every time, not only on a change. A player who reconnects is
           already known to us, and waiting for the next heartbeat to tell them
           the table is alive would leave their Roll button greyed out for up to
           25 seconds for no reason. */
        void this.publishRoster();

        /* The public feed, once per page load of theirs. */
        if (this.greeted.get(id) !== sid) {
            this.greeted.set(id, sid);
            const rolls = this.store.state.rolls
                .filter((r) => !r.hidden)
                .slice(0, LIMITS.MAX_SYNC)
                .map(stripLocal);
            if (rolls.length) void this.publish({ k: 'sync', rolls });
        }
    }

    private onRequest(
        id: string, body: Extract<Body, { k: 'request' }>,
    ): void {
        const who = this.names.get(id);
        /* Must have introduced themselves first: it is what binds a request to
           a display name, and it means a stranger cannot roll anonymously. */
        if (!who) return;

        /* Delivered twice — a reconnect flush, or a relay hiccup. Rolling again
           would mean two different results for one request, which at a dice
           table is the worst possible failure. */
        if (this.handledRids.has(body.rid)) return;

        if (!this.allow(id)) {
            this.notify(who + ' is rolling faster than the table can follow.');
            return;
        }

        this.handledRids.add(body.rid);
        if (this.handledRids.size > 512) {
            const oldest = this.handledRids.values().next().value;
            if (oldest !== undefined) this.handledRids.delete(oldest);
        }

        this.execute(body.count, body.sides, who, body.note, body.rid, false, false);
    }

    private allow(id: string): boolean {
        const now = Date.now();
        const b = this.buckets.get(id) ?? { tokens: BUCKET_MAX, last: now };
        b.tokens = Math.min(BUCKET_MAX, b.tokens + (now - b.last) / BUCKET_REFILL_MS);
        b.last = now;
        if (b.tokens < 1) {
            this.buckets.set(id, b);
            return false;
        }
        b.tokens -= 1;
        this.buckets.set(id, b);
        return true;
    }

    private prunePresence(): void {
        const cutoff = Date.now() - PRESENCE_TIMEOUT_MS;
        let changed = false;
        for (const [id, at] of this.lastSeenAt) {
            if (id === this.store.state.myId) continue;
            if (at < cutoff) {
                this.lastSeenAt.delete(id);
                this.names.delete(id);
                this.greeted.delete(id);
                changed = true;
            }
        }
        if (changed) void this.publishRoster();
    }

    private publishRoster(): Promise<boolean> {
        const me = this.store.state.myId;
        const members: WireMember[] = [...this.names].map(([id, name]) => ({
            id, name, host: id === me,
        }));
        this.store.update((s) => { s.members = members; });
        return this.publish({ k: 'roster', members });
    }

    /** The only place dice are actually rolled. Host-only by construction: a
        player's copy never reaches here, because a player never dispatches a
        `request` to itself. */
    private execute(
        count: number, sides: number, who: string, note: string | undefined,
        rid: string | undefined, hidden: boolean, scripted: boolean,
    ): void {
        let vals: number[];
        if (scripted) {
            const s = this.store.state;
            vals = sides === 6
                ? fabricateD6(count, s.scriptSuccesses)
                : fabricateTotal(count, sides, s.scriptTotal);
        } else {
            /* The GM screen's own roller, not a copy of it, so a shared table
               and a solo session cannot drift apart on what a die does. */
            vals = roll(count, sides, {}, CRIT_MARGIN).vals;
        }

        const total = vals.reduce((a, b) => a + b, 0);
        const succ = sides === 6 ? vals.filter((v) => v >= 4).length : null;

        const entry: LocalRoll = {
            id: randomId(),
            label: count + 'd' + sides,
            vals,
            total,
            succ,
            net: succ,
            t: Date.now(),
            who,
            note: note || undefined,
        };

        this.store.update((s) => {
            s.rolls = [{ ...entry, hidden }, ...s.rolls].slice(0, LIMITS.HISTORY);
        });

        /* A hidden roll is not published at all, rather than published with a
           flag telling clients to look away. Nothing leaves this browser, so
           there is nothing for a patched client at the table to reveal. */
        if (!hidden) void this.publish({ k: 'result', rid, roll: stripLocal(entry) });
    }

    /* ------------------------------------------------------- player actions */

    /** Asks for a roll. On the host this rolls immediately; on a player it sends
        a request and waits, queueing if the GM is away. */
    requestRoll(): void {
        const s = this.store.state;
        const count = clamp(s.count, LIMITS.MIN_COUNT, LIMITS.MAX_COUNT);
        const sides = clamp(s.sides, LIMITS.MIN_SIDES, LIMITS.MAX_SIDES);
        const note = cleanText(s.note, LIMITS.MAX_NOTE) || undefined;

        if (s.isHost) {
            this.execute(count, sides, s.myName, note, undefined, s.hideMyRolls, s.scripted);
            return;
        }

        const rid = randomId(8);
        const body: Body = { k: 'request', rid, count, sides, note };
        this.store.update((st) => {
            st.pending = [...st.pending, { rid, label: count + 'd' + sides, at: Date.now() }];
        });

        void this.publish(body).then((sent) => {
            if (!sent) this.queue.push(body);
        });
    }

    cancelPending(rid: string): void {
        this.queue = this.queue.filter((b) => b.k !== 'request' || b.rid !== rid);
        this.store.update((s) => { s.pending = s.pending.filter((p) => p.rid !== rid); });
    }

    /* --------------------------------------------------------- host actions */

    clearFeed(): void {
        if (!this.store.state.isHost) return;
        this.store.update((s) => { s.rolls = []; });
        void this.publish({ k: 'clear' });
    }

    kick(id: string): void {
        if (!this.store.state.isHost || id === this.store.state.myId) return;
        this.names.delete(id);
        this.lastSeenAt.delete(id);
        this.greeted.delete(id);
        this.buckets.delete(id);
        void this.publish({ k: 'kick', id });
        void this.publishRoster();
    }

    /* ------------------------------------------------------------ UI state */

    set<K extends keyof TableState>(key: K, value: TableState[K]): void {
        this.store.update((s) => { s[key] = value; });
    }

    /** Plain text, and plain text only.

        The app's toast takes an HTML fragment (`dangerouslySetInnerHTML` in
        src/components/common/Toast.tsx) on the promise that nothing user-typed
        reaches it. A table full of strangers' names would break that promise,
        so notices on this page live in the store and render as text children. */
    notify(text: string): void {
        this.store.update((s) => { s.notice = text; });
        window.setTimeout(() => {
            this.store.update((s) => { if (s.notice === text) s.notice = ''; });
        }, 4000);
    }

    /** The lobby id as it is shown and copied. */
    get prettyLobbyId(): string {
        return formatLobbyId(this.store.state.lobbyId);
    }
}

/* ---------------------------------------------------------------- helpers */

function clamp(v: number, min: number, max: number): number {
    return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : min;
}

/** Drops the host-only fields before a roll goes on the wire. */
function stripLocal(r: LocalRoll): WireRoll {
    return {
        id: r.id, label: r.label, vals: r.vals, total: r.total,
        succ: r.succ, net: r.net, t: r.t, who: r.who, note: r.note,
    };
}

function describe(e: unknown): string {
    return e instanceof Error ? e.message : 'unexpected error';
}
