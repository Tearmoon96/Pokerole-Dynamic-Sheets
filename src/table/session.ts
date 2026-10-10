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

import { savedColor } from './colors';
import { CRIT_MARGIN } from '../gm/constants';
import { roll } from '../gm/dice';
import { deriveRoom, fingerprint, seal, sign, unseal, verify } from './crypto';
import type { RoomSecrets } from './crypto';
import { formatLobbyId, fromB64u, generatePassword, normaliseLobbyId, toB64u, utf8 } from './encoding';
import type { Bytes } from './encoding';
import {
    createHostIdentity, forgetMemberIdentity, hasMemberIdentity, hostRoomAddr, loadHostIdentity, memberIdentity,
    rememberHostRoom,
} from './identity';
import type { Identity } from './identity';
import { HEARTBEAT_MS, LIMITS, PRESENCE_TIMEOUT_MS, PROTOCOL_VERSION, randomId } from './protocol';
import type { Body, Inner, RollExtras, WireMember, WireRoll } from './protocol';
import type { CharKey } from './slim';
import { roomUrl } from './relay';
import { fabricateD6, fabricateTotal } from './scripted';
import { RelayTransport } from './transport';
import { BlobChannel } from './blobs';
import { ServerClock } from './clock';
import { hostUploadKey } from './identity';
import type { TableApi } from './link';
import { MapShare } from './mapShare';
import { CombatShare } from './combatShare';
import { MusicController } from './music/music';
import type { TransportStatus } from './transport';
import { cleanText, parseInner, parseSigned, safeParse } from './validate';

/** A roll as this browser holds it. `hidden` is set only on the host's own
    machine, for a roll that was never published — it is not a wire field and
    there is nothing for a patched client elsewhere to reveal. */
export interface LocalRoll extends WireRoll {
    hidden?: boolean;
    /** When this browser got it live (not from a history sync): the feed
        lights a fresh roll up for a moment. Local time, never sent. */
    seenAt?: number;
}

export interface PendingRoll {
    rid: string;
    label: string;
    at: number;
}

export type Phase = 'setup' | 'joining' | 'live';

/** A roll set up from a character sheet and waiting for the Roll button. The
    player may still change the dice (or the bonus) for a modifier first. */
export interface PreparedRoll {
    extras: RollExtras;
    /** Reported to the GM screen's tracker when it is rolled: an attack, or
        an Evasion or Clash, which also spends an action. */
    quick: { op: 'acc' | 'eva' | 'clash'; id: string } | null;
    /** Initiative into the fight on the table: the GM rolls 1d6 + the bonus. */
    enter: { trainerId: string; key: CharKey; slot: number | null } | null;
}

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
    /** Joining: connected, and waiting for the GM's page to answer. */
    joinWait: boolean;

    /* Roll controls. */
    count: number;
    sides: number;
    note: string;
    prep: PreparedRoll | null;

    /* Host-only controls. Meaningless for a player and never sent. */
    hideMyRolls: boolean;
    scripted: boolean;
    scriptSuccesses: number;
    scriptTotal: number;
    /** The GM's feed shows a pool's successes before its other dice, as the
        GM screen's Dice panel can. Display only, this browser only. */
    successesFirst: boolean;
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
        joinWait: false,
        count: 4,
        sides: 6,
        note: '',
        /* GMs hide their rolls far more often than not, so that is the state the
           checkbox starts in. Making it opt-in would mean the first roll of
           every session leaks by accident. */
        prep: null,
        hideMyRolls: true,
        scripted: false,
        successesFirst: readFlag(SORT_KEY),
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

/* How long a player's join waits for the GM's page to answer. The GM answers
   a hello at once, from its message handler, so this only has to cover the
   socket opening and a slow phone. */
const JOIN_WAIT_MS = 15_000;

interface SavedSession {
    lobbyId: string;
    password: string;
    name: string;
    /** The GM answered on these credentials, so a reload may rejoin without
        asking again — the GM may well be away when it does. */
    ok?: boolean;
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
        return { lobbyId, password, name, ok: raw.ok === true };
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

/* What this browser itself may send. The relay closes a socket that sends
   more than 40 frames in 10 seconds — for good, since reconnecting into the
   same flood would only repeat it — and the clock pings come out of the same
   allowance. So messages leave through one queue, at most 12 in a burst and
   two a second after that: the most any 10 seconds can then hold is 12 + 20,
   plus the clock's pings (at most 4 while it settles) and the keepalive, which
   stays under 40 with room to spare. The queue also keeps them in sequence
   order: signing is asynchronous, and two messages overtaking each other on
   the way out would have the later one rejected as a replay. */
const SEND_BURST = 12;
/** The relay's own ceiling on a frame (worker/src/index.ts), less a margin. */
const RELAY_FRAME_CHARS = 32 * 1024 - 512;
const SEND_PER_SECOND = 2;

export class TableSession {
    readonly store = new TableStore();

    private transport: RelayTransport | null = null;
    private room: RoomSecrets | null = null;
    private identity: Identity | null = null;

    /* Fresh with every join (begin), alongside the counter going back to zero,
       so a session starting again is not mistaken for a replay of the old one.
       It used to be fresh only per page load: a player removed by the GM, or
       who left, and joined again without reloading kept the old sid with a
       counter back at 1, and the GM dropped everything they sent as replays —
       they saw the table but could not roll. */
    private sid = randomId(6);
    private seq = 0;
    private seen = new Map<string, number>();

    /* Host-side bookkeeping. Empty on a player. */
    private names = new Map<string, string>();
    /** member -> their colour (colors.ts), as their hello said. */
    private colors = new Map<string, number>();
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

    /* A player's join waits here until the lobby's GM answers. */
    private verifying: { lobbyId: string; password: string; name: string; known: boolean } | null = null;
    private verifyTimer: number | null = null;

    private outbox: Promise<unknown> = Promise.resolve();
    private sendTokens = SEND_BURST;
    private sendTokensAt = 0;

    /* The shared map and the music. They reach the table only through this. */
    private files: BlobChannel | null = null;
    readonly clock = new ServerClock((frame) => this.transport?.send(frame) ?? false);
    private api: TableApi = {
        clock: this.clock,
        publish: (body) => this.publish(body),
        notify: (text) => this.notify(text),
        files: () => this.files,
        isHost: () => this.store.state.isHost,
        lobbyId: () => this.store.state.lobbyId,
        members: () => this.store.state.members,
        myId: () => this.store.state.myId,
        changed: () => this.store.update(() => { /* a feature's view moved */ }),
    };
    readonly map = new MapShare(this.api);
    readonly music = new MusicController(this.api);
    readonly combat = new CombatShare(this.api);

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
            await this.begin(identity, identity.id, password, name, true, true);
        } catch (e) {
            this.fail('Could not create the lobby: ' + describe(e));
        }
    }

    /** Joins an existing lobby — or rejoins one this browser hosts, which is how
        a GM who reloaded gets their authority back without anyone re-pinning. */
    async joinLobby(rawId: string, password: string, rawName: string, saved: SavedSession | null = null): Promise<void> {
        const lobbyId = normaliseLobbyId(rawId);
        const name = cleanText(rawName, LIMITS.MAX_NAME);

        if (lobbyId.length !== 16) { this.fail('That lobby id is not 16 characters.'); return; }
        if (!password) { this.fail('Enter the lobby password.'); return; }
        if (!name) { this.fail('Choose a name first.'); return; }

        this.store.update((s) => { s.phase = 'joining'; s.error = ''; });
        try {
            const host = await loadHostIdentity(lobbyId);
            const known = host !== null || await hasMemberIdentity(lobbyId);
            const identity = host ?? await memberIdentity(lobbyId);
            /* A GM's saved session holds the password the table was made
               with; a player's is trusted once the GM has answered on it. */
            const trusted = !!saved && (host !== null || saved.ok === true);
            await this.begin(identity, lobbyId, password, name, host !== null, trusted, known);
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
        await this.joinLobby(saved.lobbyId, saved.password, saved.name, saved);
        return true;
    }

    /** `trusted`: the credentials are known good (a table just made, a saved
        session the GM answered on), so nothing waits for the GM. Otherwise
        a player is let in only once the lobby's GM answers, and a GM only
        with the password the table was made with.

        The relay cannot check either: it sees a room address derived from
        the id and the password together, and any address is a room. A
        wrong id or a wrong password is simply an EMPTY room, so the only
        proof a table exists is its GM's signed answer — the GM's key is
        what the lobby id names, and the room key is what the password makes. */
    private async begin(
        identity: Identity, lobbyId: string, password: string, name: string, isHost: boolean,
        trusted: boolean, known = true,
    ): Promise<void> {
        /* A rejoin, or StrictMode mounting the effect twice: never leave the
           previous socket and heartbeat running alongside the new ones. */
        this.teardown();

        const room = await deriveRoom(lobbyId, password);
        if (isHost) {
            const addr = await hostRoomAddr(lobbyId);
            if (addr && addr !== room.addr) {
                this.fail('That is not this table\u2019s password.');
                return;
            }
            /* A table made before the address was kept learns it from its
               saved session, never from a password typed into the form. */
            if (!addr && trusted) await rememberHostRoom(lobbyId, room.addr);
        }
        this.room = room;
        this.identity = identity;
        this.files = new BlobChannel(this.room.key, this.room.addr, isHost ? await hostUploadKey(lobbyId) : null);
        this.sid = randomId(6);
        this.seq = 0;
        this.seen.clear();
        this.queue = [];
        this.hostSeenAt = isHost ? Date.now() : 0;

        this.names.clear();
        this.lastSeenAt.clear();
        this.greeted.clear();
        this.handledRids.clear();
        this.buckets.clear();
        this.colors.clear();
        if (isHost) {
            this.names.set(identity.id, name);
            this.colors.set(identity.id, savedColor());
        }

        const wait = !isHost && !trusted;
        if (wait) {
            this.verifying = { lobbyId, password, name, known };
            this.verifyTimer = window.setTimeout(() => this.noTable(), JOIN_WAIT_MS);
        } else {
            saveSession({ lobbyId, password, name, ok: true });
        }

        this.store.update((s) => {
            s.phase = wait ? 'joining' : 'live';
            s.joinWait = wait;
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
            onClock: (text) => this.clock.onFrame(text),
        });
        this.transport.start();
        this.combat.begin(isHost, lobbyId);

        this.heartbeat = window.setInterval(() => this.tick(), HEARTBEAT_MS);

        /* The GM takes the room's file store before anything is uploaded to it;
           both features start once that is settled either way. */
        const files = this.files;
        void (async () => {
            if (isHost && !await files.claim()) {
                this.notify('The relay\u2019s file space could not be reached; music and maps will retry.');
            }
            if (this.files !== files) return;
            this.map.onMissing = (id) => this.music.reportMissing(id);
            await this.map.begin(isHost, lobbyId);
            await this.music.begin(isHost, lobbyId);
        })();
    }

    /** The lobby's GM answered: the id and the password are right. */
    private joined(): void {
        const v = this.verifying;
        if (!v) return;
        this.verifying = null;
        if (this.verifyTimer !== null) { clearTimeout(this.verifyTimer); this.verifyTimer = null; }
        saveSession({ lobbyId: v.lobbyId, password: v.password, name: v.name, ok: true });
        this.store.update((s) => { s.phase = 'live'; s.joinWait = false; });
    }

    /** Nobody answered as the lobby's GM: no such table, a wrong password,
        or a GM who is not there. Out, and nothing of it is kept. */
    private noTable(): void {
        const v = this.verifying;
        if (!v) return;
        const reached = this.store.state.status === 'online';
        this.teardown();
        clearSession();
        if (!v.known) void forgetMemberIdentity(v.lobbyId).catch(() => { /* nothing to undo */ });
        this.store.update((s) => { s.joinWait = false; s.status = 'offline'; });
        this.fail(reached
            ? 'No table answered with that lobby id and password. Check both, and that the GM has the table open.'
            : 'Could not reach the table\u2019s relay. Check your connection and try again.');
    }

    private teardown(): void {
        this.verifying = null;
        if (this.verifyTimer !== null) {
            clearTimeout(this.verifyTimer);
            this.verifyTimer = null;
        }
        if (this.heartbeat !== null) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        this.map.end();
        this.music.end();
        this.combat.end();
        this.clock.stop();
        this.transport?.stop();
        this.transport = null;
        this.room = null;
        this.identity = null;
        this.files = null;
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

    private publish(body: Body): Promise<boolean> {
        const run = this.outbox.then(() => this.publishNow(body));
        this.outbox = run.catch(() => false);
        return run;
    }

    private async takeSendToken(): Promise<void> {
        for (;;) {
            const now = performance.now();
            this.sendTokens = Math.min(SEND_BURST, this.sendTokens + (now - this.sendTokensAt) / 1000 * SEND_PER_SECOND);
            this.sendTokensAt = now;
            if (this.sendTokens >= 1) { this.sendTokens -= 1; return; }
            await new Promise((r) => setTimeout(r, Math.ceil((1 - this.sendTokens) / SEND_PER_SECOND * 1000)));
        }
    }

    private async publishNow(body: Body): Promise<boolean> {
        if (!this.room || !this.identity || !this.transport?.connected) return false;
        await this.takeSendToken();
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
        /* The relay measures the SEALED frame, and closes the socket for good
           past 32 KB (1009, which the transport does not reconnect from). JSON
           escaped into the envelope, encrypted and base64'd, a dense `p` well
           under its own limit can still cross it. */
        if (wire.length > RELAY_FRAME_CHARS) {
            this.notify('That message is too large to send.');
            return false;
        }

        return this.transport?.send(wire) ?? false;
    }

    private onStatus(status: TransportStatus, detail: string): void {
        this.store.update((s) => {
            s.status = status;
            s.statusDetail = detail;
            if (status !== 'online') s.hostOnline = s.isHost;
        });

        if (status === 'online') {
            this.clock.start();
            /* Announce first so the host can put us back in the roster, then
               replay anything that piled up while the socket was down. */
            void this.announce().then(() => {
                this.flushQueue();
                this.music.hello();
            });
            /* A relay that idled out forgot the GM's claim; take it back. */
            if (this.store.state.isHost) void this.files?.claim();
        } else {
            this.clock.stop();
        }
    }

    private announce(): Promise<boolean> {
        return this.publish({ k: 'hello', name: this.store.state.myName, color: savedColor() });
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
            /* Anyone whose socket dropped for a moment missed what changed. */
            this.map.greet();
            this.music.greet();
            this.combat.greet();
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
            if (body.k === 'hello') this.onHello(inner.f, body.name, inner.sid, body.color);
            else if (body.k === 'request') this.onRequest(inner.f, body);
            else if (body.k === 'pc' && this.names.has(inner.f)) this.combat.onPc(inner.f, this.names.get(inner.f)!, body);
            else if (body.k === 'enter') this.onEnter(inner.f, body);
            else if (body.k === 'turn' && this.names.has(inner.f)) this.combat.onTurn(inner.f, body);
            else if (body.k === 'mstat' && this.names.has(inner.f)) {
                this.music.onStat(inner.f, body);
                if (body.failed.some((id) => this.map.missing(id))) void this.map.verify();
            }
            return;
        }

        /* A player accepts authority ONLY from the key the lobby id names.
           This single comparison is what makes a forged roll impossible: an
           impostor would need a keypair whose fingerprint matches the lobby id. */
        if (inner.f !== this.store.state.lobbyId) return;

        this.hostSeenAt = Date.now();
        if (this.verifying) this.joined();

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
                    s.rolls = [{ ...body.roll, seenAt: Date.now() }, ...s.rolls].slice(0, LIMITS.HISTORY);
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

            case 'library':
                this.music.onLibrary(body.tracks);
                break;

            case 'music':
                this.music.onMusic(body);
                break;

            case 'map':
                this.map.onMap(body);
                break;

            case 'turns':
                this.combat.onTurns(body.turns);
                break;

            case 'pcop':
                this.combat.onPcop(body);
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

    private onHello(id: string, name: string, sid: string, color: number | undefined): void {
        this.lastSeenAt.set(id, Date.now());
        this.names.set(id, name);
        if (color === undefined) this.colors.delete(id);
        else this.colors.set(id, color);

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
            /* In two parts: a client from before rolls carried a bonus, pain
               or target refuses a whole sync holding one, and would otherwise
               lose every plain roll with it. Receivers merge by id and time. */
            const plain = rolls.filter((r) => !hasExtras(r));
            const extended = rolls.filter(hasExtras);
            if (plain.length) void this.publish({ k: 'sync', rolls: plain });
            if (extended.length) void this.publish({ k: 'sync', rolls: extended });
            this.map.greet();
            this.music.greet();
            this.combat.greet();
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

        this.execute(body.count, body.sides, who, body.note, body.rid, false, false, extrasOf(body));
    }

    /** A player brings characters into the fight: one initiative roll each,
        1d6 + Dexterity + Alert + their modifier, rolled here like any other
        die and published, then handed to the GM screen with the totals. */
    private onEnter(id: string, body: Extract<Body, { k: 'enter' }>): void {
        const who = this.names.get(id);
        if (!who || this.handledRids.has(body.rid)) return;
        const keys = body.chars.map((c) => c.key);
        if (!this.combat.canEnter(id, keys)) {
            this.notify(who + ' tried to join a fight, but none is open on the table.');
            return;
        }
        if (!this.allow(id)) {
            this.notify(who + ' is rolling faster than the table can follow.');
            return;
        }
        this.handledRids.add(body.rid);
        const chars = body.chars.map((c) => {
            const name = this.combat.charName(id, c.key) || 'Character';
            const roll = this.execute(1, 6, who, name + ' · Initiative', body.rid, false, false, { bonus: c.bonus });
            return { key: c.key, init: roll.total };
        });
        this.combat.entered(id, who, chars);
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
                this.music.forget(id);
                changed = true;
            }
        }
        if (changed) void this.publishRoster();
    }

    private publishRoster(): Promise<boolean> {
        const me = this.store.state.myId;
        const members: WireMember[] = [...this.names].map(([id, name]) => {
            const color = this.colors.get(id);
            return color === undefined ? { id, name, host: id === me } : { id, name, host: id === me, color };
        });
        this.store.update((s) => { s.members = members; });
        return this.publish({ k: 'roster', members });
    }

    /** The only place dice are actually rolled. Host-only by construction: a
        player's copy never reaches here, because a player never dispatches a
        `request` to itself. */
    private execute(
        count: number, sides: number, who: string, note: string | undefined,
        rid: string | undefined, hidden: boolean, scripted: boolean, extras: RollExtras = {},
    ): LocalRoll {
        let vals: number[];
        /* A sum roll has no successes to script; it is rolled straight. */
        if (scripted && extras.bonus === undefined) {
            const s = this.store.state;
            vals = sides === 6
                ? fabricateD6(count, s.scriptSuccesses)
                : fabricateTotal(count, sides, s.scriptTotal);
        } else {
            /* The GM screen's own roller, not a copy of it, so a shared table
               and a solo session cannot drift apart on what a die does. */
            vals = roll(count, sides, {}, CRIT_MARGIN).vals;
        }

        /* The same arithmetic every receiver redoes in parseRoll. */
        const total = vals.reduce((a, b) => a + b, 0) + (extras.bonus ?? 0);
        const succ = sides === 6 && extras.bonus === undefined ? vals.filter((v) => v >= 4).length : null;

        const entry: LocalRoll = {
            id: randomId(),
            label: count + 'd' + sides,
            vals,
            total,
            succ,
            net: succ === null ? null : Math.max(0, succ - (extras.pain ?? 0)),
            t: Date.now(),
            who,
            note: note || undefined,
            ...extras,
        };

        this.store.update((s) => {
            s.rolls = [{ ...entry, hidden, seenAt: Date.now() }, ...s.rolls].slice(0, LIMITS.HISTORY);
        });

        /* A hidden roll is not published at all, rather than published with a
           flag telling clients to look away. Nothing leaves this browser, so
           there is nothing for a patched client at the table to reveal. */
        if (!hidden) void this.publish({ k: 'result', rid, roll: stripLocal(entry) });
        return entry;
    }

    /* ------------------------------------------------------- player actions */

    /** Asks for a roll. On the host this rolls immediately; on a player it sends
        a request and waits, queueing if the GM is away. */
    requestRoll(): void {
        const s = this.store.state;
        const count = clamp(s.count, LIMITS.MIN_COUNT, LIMITS.MAX_COUNT);
        const sides = clamp(s.sides, LIMITS.MIN_SIDES, LIMITS.MAX_SIDES);
        const note = cleanText(s.note, LIMITS.MAX_NOTE) || undefined;

        const prep = s.prep;
        if (prep && !s.isHost) {
            this.store.update((st) => { st.prep = null; });
            if (prep.enter) {
                const e = prep.enter;
                this.enterCombat(e.trainerId, [{ key: e.key, bonus: prep.extras.bonus ?? 0, slot: e.slot }]);
                return;
            }
            /* Pain and a target number are about successes, which only d6 have. */
            const extras: RollExtras = sides === 6 ? prep.extras
                : prep.extras.bonus !== undefined ? { bonus: prep.extras.bonus } : {};
            this.rollFor(count, sides, note || '', extras);
            if (prep.quick) this.combat.act(prep.quick.op, prep.quick.id);
            return;
        }

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

    /** A roll off a character sheet — a move's accuracy, an evasion, the
        initiative — rather than off the dice controls. Always a request to the
        GM, published for the whole table: a player's character panel is never
        on the host's page. `who` is still the player's own name; the note says
        which character and what for. */
    rollFor(count: number, sides: number, note: string, extras: RollExtras = {}): void {
        const s = this.store.state;
        if (s.isHost) return;
        count = clamp(count, LIMITS.MIN_COUNT, LIMITS.MAX_COUNT);
        sides = clamp(sides, LIMITS.MIN_SIDES, LIMITS.MAX_SIDES);
        const rid = randomId(8);
        const body: Body = {
            k: 'request', rid, count, sides,
            note: cleanText(note, LIMITS.MAX_NOTE) || undefined,
            ...cleanExtras(extras),
        };
        const label = count + 'd' + sides + (extras.bonus !== undefined ? signed(extras.bonus) : '');
        this.store.update((st) => {
            st.pending = [...st.pending, { rid, label, at: Date.now() }];
        });
        void this.publish(body).then((sent) => {
            if (!sent) this.queue.push(body);
        });
    }

    /** Sets a roll up from a character sheet: the dice, what it is for, and
        what goes with it. Nothing is sent until Roll. */
    prepare(count: number, sides: number, note: string, prep: PreparedRoll): void {
        this.store.update((s) => {
            s.count = clamp(count, LIMITS.MIN_COUNT, LIMITS.MAX_COUNT);
            s.sides = clamp(sides, LIMITS.MIN_SIDES, LIMITS.MAX_SIDES);
            s.note = cleanText(note, LIMITS.MAX_NOTE);
            s.prep = prep;
        });
    }

    /** Brings characters into the fight on the table (combatShare.ts); the
        initiative rolls come back like any other. */
    enterCombat(trainerId: string, chars: { key: CharKey; bonus: number; slot: number | null }[]): void {
        const rid = this.combat.enter(trainerId, chars);
        if (!rid) return;
        this.store.update((st) => {
            st.pending = [...st.pending, { rid, label: 'Initiative', at: Date.now() }];
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
        this.music.forget(id);
        this.combat.forget(id);
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
const SORT_KEY = 'pokerole_table_sorted';

function readFlag(key: string): boolean {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

/** Successes first in the feed — the GM's own preference, kept in this browser. */
export function saveSuccessesFirst(on: boolean): void {
    try { localStorage.setItem(SORT_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

function stripLocal(r: LocalRoll): WireRoll {
    return {
        id: r.id, label: r.label, vals: r.vals, total: r.total,
        succ: r.succ, net: r.net, t: r.t, who: r.who, note: r.note,
        ...extrasOf(r),
    };
}

/** Only the extras a message actually carries: an absent field stays absent,
    because the validator reads `undefined` and a missing key alike but an
    older peer's `exactly()` does not. */
function extrasOf(r: RollExtras): RollExtras {
    const out: RollExtras = {};
    if (r.bonus !== undefined) out.bonus = r.bonus;
    if (r.pain !== undefined) out.pain = r.pain;
    if (r.need !== undefined) out.need = r.need;
    return out;
}

/** Clamped to what the validator accepts; a zero pain is left off the wire. */
function cleanExtras(e: RollExtras): RollExtras {
    if (e.bonus !== undefined) return { bonus: clamp(e.bonus, LIMITS.MIN_BONUS, LIMITS.MAX_BONUS) };
    const out: RollExtras = {};
    if (e.pain) out.pain = clamp(e.pain, 0, LIMITS.MAX_PAIN);
    if (e.need !== undefined) out.need = clamp(e.need, 1, LIMITS.MAX_NEED);
    return out;
}

function hasExtras(r: WireRoll): boolean {
    return r.bonus !== undefined || r.pain !== undefined || r.need !== undefined;
}

function signed(n: number): string {
    return n < 0 ? ' − ' + Math.abs(n) : ' + ' + n;
}

function describe(e: unknown): string {
    return e instanceof Error ? e.message : 'unexpected error';
}
