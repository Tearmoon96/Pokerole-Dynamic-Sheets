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
import { NpcShare } from './npcShare';
import { RULES_KEY, readGmMegaRules, writeTableMegaRules } from '../lib/megaRules';
import { MusicController } from './music/music';
import type { TransportStatus } from './transport';
import { TabLock } from './tabLock';
import { cleanText, parseInner, parseRoll, parseSigned, safeParse } from './validate';

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

/** `elsewhere`: another tab of this browser took the table (tabLock.ts). */
export type Phase = 'setup' | 'joining' | 'live' | 'elsewhere';

/** A roll set up from a character sheet and waiting for the Roll button. The
    player may still change the dice (or the bonus) for a modifier first. */
export interface PreparedRoll {
    extras: RollExtras;
    /** Reported to the GM screen's tracker when it is rolled: an attack, or
        an Evasion or Clash, which also spends an action. */
    quick: { op: 'acc' | 'eva' | 'clash'; id: string; move?: string } | null;
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
    /** The feed shows a pool's successes before its other dice, as the GM
        screen's Dice panel can. The GM's and each player's own choice:
        display only, this browser only, never sent. */
    successesFirst: boolean;

    /* Host-only controls. Meaningless for a player and never sent. */
    /** The room is locked: only those at the table when it was locked can
        come back. */
    locked: boolean;
    /** Lock and unlock wait this long after a change (epoch ms). */
    lockBusyUntil: number;
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
        joinWait: false,
        count: 4,
        sides: 6,
        note: '',
        /* GMs hide their rolls far more often than not, so that is the state the
           checkbox starts in. Making it opt-in would mean the first roll of
           every session leaks by accident. */
        prep: null,
        locked: false,
        lockBusyUntil: 0,
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

/** The table an invite link names (`?lobby=`), if any. */
function linkedLobby(): string | null {
    try {
        const id = normaliseLobbyId(new URLSearchParams(location.search).get('lobby') || '');
        return id.length === 16 ? id : null;
    } catch {
        return null;
    }
}

/** The saved session to rejoin on load — unless the page was opened from an
    invite to a DIFFERENT table. Yesterday's session would otherwise win over
    today's link and drop the player into an empty old room; the link's table
    gets the join form instead (the password is never in a link). */
function sessionToRestore(): SavedSession | null {
    const saved = loadSession();
    if (!saved) return null;
    const linked = linkedLobby();
    return linked && linked !== saved.lobbyId ? null : saved;
}

function hasSavedSession(): boolean {
    return sessionToRestore() !== null;
}

/** The name this browser last sat at a table with, to fill the join form. */
export function lastTableName(): string {
    return loadSession()?.name ?? '';
}

function clearSession(): void {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing to do */ }
}

/* The GM's own feed. Players get theirs back from the GM, but the GM's page
   is the one copy there is — its hidden rolls exist nowhere else — so it is
   kept for the table being hosted, and a reload, or the table moving to
   another tab (tabLock.ts), starts with it. One table's at a time. */
const FEED_KEY = 'pokerole_table_feed';

function saveFeed(lobbyId: string, rolls: LocalRoll[]): void {
    const kept = rolls.map((r) => (r.hidden ? { ...stripLocal(r), hidden: true } : stripLocal(r)));
    try { localStorage.setItem(FEED_KEY, JSON.stringify({ lobbyId, rolls: kept })); } catch { /* full, or private mode */ }
}

function loadFeed(lobbyId: string): LocalRoll[] {
    try {
        const raw = JSON.parse(localStorage.getItem(FEED_KEY) || 'null');
        if (!raw || raw.lobbyId !== lobbyId || !Array.isArray(raw.rolls)) return [];
        const out: LocalRoll[] = [];
        for (const r of raw.rolls.slice(0, LIMITS.HISTORY)) {
            if (!r || typeof r !== 'object') continue;
            const { hidden, ...wire } = r as Record<string, unknown>;
            const roll = parseRoll(wire);
            if (roll) out.push(hidden === true ? { ...roll, hidden: true } : roll);
        }
        return out;
    } catch {
        return [];
    }
}

function forgetFeed(): void {
    try { localStorage.removeItem(FEED_KEY); } catch { /* nothing to do */ }
}

/* The locked room. The GM keeps who was at the table when it was locked —
   their key fingerprints — so a reload of the GM's page keeps it locked and
   keeps letting the same people back. One table's at a time, as the feed. */
const LOCK_KEY = 'pokerole_table_lock';
/** A lock or an unlock, then nothing for this long: no spamming it. */
const LOCK_GAP_MS = 3000;
/** Refusals to people knocking on a locked room: at most one this often. */
const REFUSE_GAP_MS = 1500;

function saveLock(lobbyId: string, ids: Set<string> | null): void {
    try {
        if (ids) localStorage.setItem(LOCK_KEY, JSON.stringify({ lobbyId, ids: [...ids] }));
        else localStorage.removeItem(LOCK_KEY);
    } catch { /* full, or private mode */ }
}

function loadLock(lobbyId: string): Set<string> | null {
    try {
        const raw = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
        if (!raw || raw.lobbyId !== lobbyId || !Array.isArray(raw.ids)) return null;
        return new Set(raw.ids.filter((id: unknown) => typeof id === 'string').slice(0, LIMITS.MAX_MEMBERS));
    } catch {
        return null;
    }
}

/* The replay record (`seen`) outlives a reload, a rejoin and the table moving
   to another tab. Kept in memory only, it started empty each time, and for the
   five minutes a message's timestamp stays acceptable the relay — or anyone
   who had recorded the traffic — could send the GM's kick or a roll round
   again. Older than that it is worth nothing, and is not read back. */
const SEEN_KEY = 'pokerole_table_seen';

type Seen = Map<string, Map<string, number>>;

function saveSeen(lobbyId: string, seen: Seen): void {
    const list = [...seen].map(([f, sids]) => [f, [...sids]]);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify({ lobbyId, at: Date.now(), seen: list })); } catch { /* full, or private mode */ }
}

function loadSeen(lobbyId: string): Seen {
    const out: Seen = new Map();
    try {
        const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
        if (!raw || raw.lobbyId !== lobbyId || !Array.isArray(raw.seen)) return out;
        if (typeof raw.at !== 'number' || Math.abs(Date.now() - raw.at) > LIMITS.CLOCK_SKEW_MS) return out;
        for (const entry of raw.seen.slice(-SEEN_SENDERS)) {
            if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
            const sids = new Map<string, number>();
            for (const pair of entry[1].slice(-SEEN_SIDS)) {
                if (Array.isArray(pair) && typeof pair[0] === 'string' && Number.isInteger(pair[1])) sids.set(pair[0], pair[1]);
            }
            if (sids.size) out.set(entry[0], sids);
        }
    } catch { /* unreadable: start empty, as before */ }
    return out;
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

/* Everything else players send that makes the GM's page work — sheets, turn
   moves, music reports — shares one allowance on the host: far above what a
   table of real people sends (a few a second at a fight's start), and low
   enough that a flood, from any number of keys, leaves the GM's page usable
   and the GM screen's saved board alone. */
const OP_BURST = 80;
const OP_PER_SECOND = 12;

/* The host's replies that go to the whole table, paced: a roster at most once
   a second, and the welcome a newcomer gets (history, map, music, the fight)
   at most once every few seconds, covering everyone who arrived meanwhile.
   A newcomer after a quiet spell still gets both at once. */
const ROSTER_GAP_MS = 1000;
const GREET_GAP_MS = 3000;

/* The replay check remembers this many sessions per sender and this many
   senders; see `fresh`. */
const SEEN_SIDS = 8;
const SEEN_SENDERS = 64;

/** Two names that read the same are the same name at the table. */
function nameKey(name: string): string {
    return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

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
    /** sender -> their session ids, least recently heard first -> the last
        sequence number taken from each. */
    private seen: Seen = new Map();
    /** Player: the session id the GM's page last spoke with. A new one means
        that page started again — see dispatch. */
    private hostSid = '';

    /** This tab's hold on the table, and whether it was at it when another
        tab took it — then taking it back needs no GM to answer first. */
    private tabLock = new TabLock();
    private wasLive = false;

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
    private ops: Bucket = { tokens: OP_BURST, last: 0 };
    private rosterAt = 0;
    private rosterTimer: number | null = null;
    private greetAt = 0;
    private greetTimer: number | null = null;
    private fullNoticeAt = 0;
    /** Locked: who may come back. Null while the room is open. */
    private allowed: Set<string> | null = null;
    private refusedAt = 0;
    private refusedNoticeAt = 0;
    private lockTimer: number | null = null;

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
    readonly npcs = new NpcShare(this.api);

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
        const saved = sessionToRestore();
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
        const uploadKey = isHost ? await hostUploadKey(lobbyId) : null;
        /* Before anything starts: any other tab of this browser at this
           table stands down first (tabLock.ts). Nothing from here waits on
           anything until the socket is started, so a tab that loses the
           table later is one that has wholly begun, and teardown stops all
           of it. */
        await this.tabLock.take(lobbyId, () => this.movedAway());
        this.room = room;
        this.identity = identity;
        this.files = new BlobChannel(this.room.key, this.room.addr, uploadKey);
        this.sid = randomId(6);
        this.seq = 0;
        this.seen = loadSeen(lobbyId);
        this.hostSid = '';
        this.queue = [];
        this.hostSeenAt = isHost ? Date.now() : 0;

        this.names.clear();
        this.lastSeenAt.clear();
        this.greeted.clear();
        this.handledRids.clear();
        this.buckets.clear();
        this.ops = { tokens: OP_BURST, last: Date.now() };
        this.rosterAt = this.greetAt = 0;
        this.colors.clear();
        if (isHost) {
            this.names.set(identity.id, name);
            this.colors.set(identity.id, savedColor());
        }
        this.allowed = isHost ? loadLock(lobbyId) : null;

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
            s.rolls = isHost ? loadFeed(lobbyId) : [];
            s.pending = [];
            s.hostOnline = isHost;
            s.locked = this.allowed !== null;
            s.error = '';
        });

        this.transport = new RelayTransport(roomUrl(this.room.addr), {
            onMessage: (text) => { void this.receive(text); },
            onStatus: (status, detail) => this.onStatus(status, detail),
            onClock: (text) => this.clock.onFrame(text),
        });
        this.transport.start();
        this.combat.begin(isHost, lobbyId);
        this.npcs.begin(isHost, lobbyId);
        if (isHost) window.addEventListener('storage', this.onRulesSaved);

        this.heartbeat = window.setInterval(() => this.tick(), HEARTBEAT_MS);
        window.addEventListener('pagehide', this.keepSeen);

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
            /* Left meanwhile, or moved to another tab: no music here. */
            if (this.files !== files) return;
            await this.music.begin(isHost, lobbyId);
        })();
    }

    /** The lobby's GM let us in: the id and the password are right, and the
        GM's roster lists us. */
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

    /** The GM's room is locked and we were not at the table when it was.
        A newcomer goes as one whose table never answered — nothing kept; a
        player who had sat here keeps the saved session, so a reload tries
        again (the GM may have unlocked by then). */
    private turnedAway(): void {
        const v = this.verifying;
        this.teardown();
        if (v) {
            clearSession();
            if (!v.known) void forgetMemberIdentity(v.lobbyId).catch(() => { /* nothing to undo */ });
        }
        this.store.update((s) => { s.joinWait = false; s.status = 'offline'; s.members = []; });
        this.fail('The table is locked: only the people who were at it can come back. Ask the GM to unlock it.');
    }

    /** `moved`: the table carries on in another tab of this browser, so the
        Map Maker and the GM screen get no goodbye — it would end a live map
        and drop the fight's link — and the new tab's beat simply takes over. */
    private teardown(moved = false): void {
        this.keepSeen();
        window.removeEventListener('pagehide', this.keepSeen);
        this.verifying = null;
        if (this.verifyTimer !== null) {
            clearTimeout(this.verifyTimer);
            this.verifyTimer = null;
        }
        if (this.heartbeat !== null) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        if (this.rosterTimer !== null) { clearTimeout(this.rosterTimer); this.rosterTimer = null; }
        if (this.greetTimer !== null) { clearTimeout(this.greetTimer); this.greetTimer = null; }
        this.map.end(moved);
        this.music.end();
        this.combat.end(moved);
        this.npcs.end();
        window.removeEventListener('storage', this.onRulesSaved);
        this.publishedRules = '';
        this.clock.stop();
        this.transport?.stop();
        this.transport = null;
        this.room = null;
        this.identity = null;
        this.files = null;
        this.tabLock.drop();
    }

    /** Only a session that got as far as a room has a record worth keeping;
        the teardown that opens every begin() must not wipe the saved one. */
    private keepSeen = (): void => {
        if (this.room) saveSeen(this.store.state.lobbyId, this.seen);
    };

    private fail(message: string): void {
        this.store.update((s) => { s.phase = 'setup'; s.error = message; });
    }

    /** Another tab of this browser took the table: this one lets go of all of
        it and says so. The lobby, password and name stay, to take it back. */
    private movedAway(): void {
        this.wasLive = this.store.state.phase === 'live';
        this.teardown(true);
        this.store.update((s) => {
            s.phase = 'elsewhere';
            s.joinWait = false;
            s.pending = [];
            s.prep = null;
        });
    }

    /** Takes the table back from the tab that has it, which stands down in
        turn. A tab that was still waiting for the GM to answer waits again. */
    async resume(): Promise<void> {
        const s = this.store.state;
        if (s.phase !== 'elsewhere') return;
        const saved = this.wasLive ? { lobbyId: s.lobbyId, password: s.password, name: s.myName, ok: true } : null;
        await this.joinLobby(s.lobbyId, s.password, s.myName, saved);
    }

    /** Leaves for good: stops the socket, forgets the saved session, and resets.
        The host's keypair is deliberately kept, so the same lobby can be hosted
        again later — see identity.ts. */
    leave(): void {
        /* A player's table rules go with the table; a GM's own stay theirs. */
        if (!this.store.state.isHost) { writeTableMegaRules('', null); this.npcs.forgetAll(); }
        else { forgetFeed(); saveLock('', null); }
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
            this.publishRoster();
            /* Anyone whose socket dropped for a moment missed what changed. */
            this.map.greet();
            this.music.greet();
            this.combat.greet();
            this.npcs.greet(false);
            this.publishRules(false);
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
        /* A player acts on the GM's key alone (dispatch), so anyone else's
           message is dropped before the costly checks, not after. */
        if (!this.store.state.isHost && inner.f !== this.store.state.lobbyId) return;
        if (Math.abs(Date.now() - inner.ts) > LIMITS.CLOCK_SKEW_MS) return;

        let publicRaw: Bytes;
        try { publicRaw = fromB64u(inner.k); } catch { return; }
        if (publicRaw.length !== 65) return;
        if (await fingerprint(publicRaw) !== inner.f) return;

        if (!await verify(publicRaw, signed.g, utf8(signed.p))) return;

        if (!this.fresh(inner.f, inner.sid, inner.s)) return;

        this.dispatch(inner);
    }

    /** The replay check: true the first time a sender's session shows this
        sequence number or a higher one, which it then records.

        It has to forget — a long session with reconnects makes new session ids
        — and what it forgets could be replayed within the clock window. So the
        senders whose messages carry weight here are never the ones forgotten:
        the GM on a player's page, the members at the table on the GM's. The
        rest go least recently heard first, so a flood of made-up keys or
        session ids only ever pushes out its own kind. It used to forget the
        OLDEST entry, which was the GM's: 256 junk sessions, and a GM's kick or
        clear from a minute before could be sent round again. */
    private fresh(f: string, sid: string, s: number): boolean {
        const sids = this.seen.get(f) ?? new Map<string, number>();
        const last = sids.get(sid);
        if (last !== undefined && s <= last) return false;
        sids.delete(sid);
        sids.set(sid, s);
        while (sids.size > SEEN_SIDS) {
            const oldest = sids.keys().next().value;
            if (oldest === undefined) break;
            sids.delete(oldest);
        }
        this.seen.delete(f);
        this.seen.set(f, sids);
        if (this.seen.size > SEEN_SENDERS) {
            for (const k of this.seen.keys()) {
                if (this.seen.size <= SEEN_SENDERS) break;
                if (!this.weighs(k)) this.seen.delete(k);
            }
        }
        return true;
    }

    /** A sender whose messages carry weight on this page. */
    private weighs(f: string): boolean {
        return this.store.state.isHost ? this.names.has(f) : f === this.store.state.lobbyId;
    }

    private dispatch(inner: Inner): void {
        const body = inner.b;

        if (this.store.state.isHost) {
            /* The host acts only on what a player is allowed to say. Anything
               claiming authority is ignored outright: there is only one host,
               and this is it. */
            if (body.k === 'hello') this.onHello(inner.f, body.name, inner.sid, body.color);
            else if (body.k === 'request') this.onRequest(inner.f, body);
            else if (body.k === 'enter') this.onEnter(inner.f, body);
            else if (!this.names.has(inner.f) || !this.allowOp()) return;
            else if (body.k === 'pc') this.combat.onPc(inner.f, this.names.get(inner.f)!, body);
            else if (body.k === 'turn') this.combat.onTurn(inner.f, body);
            else if (body.k === 'npcset') void this.npcs.onSet(inner.f, body);
            else if (body.k === 'npcwant') this.npcs.onWant(inner.f, body.id);
            else if (body.k === 'giftr') this.npcs.onGiftReply(inner.f, body, this.names.get(inner.f)!);
            else if (body.k === 'mstat') {
                this.music.onStat(inner.f, body);
                if (body.failed.some((id) => this.map.missing(id))) this.map.checkSoon();
            }
            return;
        }

        /* A player accepts authority ONLY from the key the lobby id names.
           This single comparison is what makes a forged roll impossible: an
           impostor would need a keypair whose fingerprint matches the lobby id. */
        if (inner.f !== this.store.state.lobbyId) return;

        this.hostSeenAt = Date.now();

        /* The GM's page has started (again): a reload, the table moving to
           another tab of the GM's browser, or a GM arriving after us. It knows
           nobody yet and drops a roll asked for by anyone who has not said
           hello, so say it now rather than at the next heartbeat. */
        if (inner.sid !== this.hostSid) {
            this.hostSid = inner.sid;
            void this.announce();
        }

        switch (body.k) {
            case 'roster':
                this.store.update((s) => {
                    s.members = body.members;
                    s.hostOnline = true;
                });
                /* Admitted means listed. Any message from the GM proves the
                   table is real, but a locked room answers a stranger too —
                   with a refusal — and its next heartbeat must not count as
                   letting them in. */
                if (this.verifying && body.members.some((m) => m.id === this.store.state.myId)) this.joined();
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

            case 'npcs':
                this.npcs.onList(body.ids);
                break;

            case 'npc':
                void this.npcs.onNpc(body);
                break;

            case 'gift':
                void this.npcs.onGift(body);
                break;

            case 'giftoff':
                this.npcs.onGiftOff(body.oid);
                break;

            case 'rules':
                /* Kept for this browser's cards until the player leaves. */
                writeTableMegaRules(this.store.state.lobbyId, body.mega);
                break;

            case 'kick':
                if (body.id === this.store.state.myId) {
                    this.leave();
                    this.store.update((s) => { s.error = 'The GM removed you from the table.'; });
                }
                break;

            case 'locked':
                if (body.id === this.store.state.myId) this.turnedAway();
                break;

            default:
                /* hello, request: other players talking to the host. Not ours. */
                break;
        }
    }

    /* -------------------------------------------------------- host duties */

    private onHello(id: string, name: string, sid: string, color: number | undefined): void {
        /* The roster every player's page accepts holds 16 people. Past that a
           newcomer stays outside, so a stream of made-up keys can neither
           push the roster past what players take nor grow the GM's page. */
        if (!this.names.has(id) && this.names.size >= LIMITS.MAX_MEMBERS) {
            if (Date.now() - this.fullNoticeAt > 60_000) {
                this.fullNoticeAt = Date.now();
                this.notify('The table is full (' + LIMITS.MAX_MEMBERS + ' people): someone could not join.');
            }
            return;
        }
        /* Locked: only those at the table when it was locked come back.
           Someone already sitting here (a heartbeat) is one of them. */
        if (this.allowed && !this.allowed.has(id) && !this.names.has(id)) {
            this.refuse(id);
            return;
        }
        this.lastSeenAt.set(id, Date.now());
        this.names.set(id, this.uniqueName(id, name));
        if (color === undefined) this.colors.delete(id);
        else this.colors.set(id, color);

        /* Answered every time, not only on a change. A player who reconnects is
           already known to us, and waiting for the next heartbeat to tell them
           the table is alive would leave their Roll button greyed out for up to
           25 seconds for no reason. */
        this.publishRoster();

        /* The public feed, once per page load of theirs. */
        if (this.greeted.get(id) !== sid) {
            this.greeted.set(id, sid);
            this.greetArrivals();
        }
    }

    /** Tells a stranger at a locked room so, rather than leave an up-to-date
        page waiting out its 15 seconds. One refusal at a time across the
        table, so a flood of made-up keys costs a frame every 1.5 s and no
        more; an older page ignores it and simply never gets a seat. */
    private refuse(id: string): void {
        const now = Date.now();
        if (now - this.refusedAt >= REFUSE_GAP_MS) {
            this.refusedAt = now;
            void this.publish({ k: 'locked', id });
        }
        if (now - this.refusedNoticeAt > 60_000) {
            this.refusedNoticeAt = now;
            this.notify('Someone tried to join the locked table.');
        }
    }

    /** The name a member goes by at this table: the one they asked for, unless
        someone else already has it — the GM's own above all — and then with a
        number after it. Rolls carry who rolled them as this name, so without
        it a player could roll as the GM, or as another player, and have every
        page show it so (their own as "mine"). */
    private uniqueName(id: string, wanted: string): string {
        const taken = new Set<string>();
        for (const [other, n] of this.names) if (other !== id) taken.add(nameKey(n));
        if (!taken.has(nameKey(wanted))) return wanted;
        for (let i = 2; ; i++) {
            const tag = ' (' + i + ')';
            const candidate = wanted.slice(0, LIMITS.MAX_NAME - tag.length).trimEnd() + tag;
            if (!taken.has(nameKey(candidate))) return candidate;
        }
    }

    /** What a newcomer needs — the public feed, the map, the music, the
        fight. All of it goes to the whole table, so arrivals close together
        share one welcome; and however many hellos arrive, it goes out at most
        once every GREET_GAP_MS. */
    private greetArrivals(): void {
        if (this.greetTimer !== null) return;
        const wait = this.greetAt + GREET_GAP_MS - Date.now();
        if (wait <= 0) { this.greetNow(); return; }
        this.greetTimer = window.setTimeout(() => { this.greetTimer = null; this.greetNow(); }, wait);
    }

    private greetNow(): void {
        this.greetAt = Date.now();
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
        this.npcs.greet(true);
        this.publishRules(true);
    }

    /** The GM's Mega-Evolution rules, to everyone: when they change (read on
        every heartbeat, and at once when the GM screen saves them) and to
        whoever just arrived. */
    private publishedRules = '';
    private publishRules(force: boolean): void {
        if (!this.store.state.isHost || !this.room) return;
        const mega = readGmMegaRules();
        const text = JSON.stringify(mega);
        if (!force && text === this.publishedRules) return;
        this.publishedRules = text;
        void this.publish({ k: 'rules', mega });
    }

    private onRulesSaved = (e: StorageEvent): void => {
        if (e.key === RULES_KEY) this.publishRules(false);
    };

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

    /** The shared allowance for players' sheets, turn moves and music
        reports (OP_BURST). Over it, a message is dropped. */
    private allowOp(): boolean {
        const now = Date.now();
        const b = this.ops;
        b.tokens = Math.min(OP_BURST, b.tokens + (now - b.last) / 1000 * OP_PER_SECOND);
        b.last = now;
        if (b.tokens < 1) return false;
        b.tokens -= 1;
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
                this.buckets.delete(id);
                this.music.forget(id);
                /* The sheets they sent go too, unless a character of theirs is
                   still in the fight: a key that comes and goes must not leave
                   its sheets on the GM's page for good. */
                if (!this.combat.onStrip(id)) this.combat.forget(id);
                changed = true;
            }
        }
        if (changed) this.publishRoster();
    }

    /** The roster on the GM's own screen at once, and to the table at once
        too — unless one went out less than ROSTER_GAP_MS ago, and then once
        at the end of that gap with whatever changed meanwhile. A flood of
        hellos costs one roster a second, not one each. */
    private publishRoster(): void {
        const me = this.store.state.myId;
        const members: WireMember[] = [...this.names].map(([id, name]) => {
            const color = this.colors.get(id);
            return color === undefined ? { id, name, host: id === me } : { id, name, host: id === me, color };
        });
        this.store.update((s) => { s.members = members; });
        if (this.rosterTimer !== null) return;
        const wait = this.rosterAt + ROSTER_GAP_MS - Date.now();
        if (wait <= 0) { this.sendRoster(); return; }
        this.rosterTimer = window.setTimeout(() => { this.rosterTimer = null; this.sendRoster(); }, wait);
    }

    private sendRoster(): void {
        this.rosterAt = Date.now();
        void this.publish({ k: 'roster', members: this.store.state.members });
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
        saveFeed(this.store.state.lobbyId, this.store.state.rolls);

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
            if (prep.quick) this.combat.act(prep.quick.op, prep.quick.id, undefined, prep.quick.move);
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
        saveFeed(this.store.state.lobbyId, []);
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
        /* Kicked from a locked room is out until it is unlocked. */
        if (this.allowed?.delete(id)) saveLock(this.store.state.lobbyId, this.allowed);
        void this.publish({ k: 'kick', id });
        this.publishRoster();
    }

    /** Locks the room — whoever is at the table now (and anyone dropped in
        the last 80 s, still on the roster) may come back, nobody else — or
        opens it again. Then nothing for LOCK_GAP_MS either way. */
    setLock(on: boolean): void {
        const s = this.store.state;
        if (!s.isHost || s.locked === on || Date.now() < s.lockBusyUntil) return;
        this.allowed = on ? new Set(this.names.keys()) : null;
        saveLock(s.lobbyId, this.allowed);
        const until = Date.now() + LOCK_GAP_MS;
        this.store.update((st) => { st.locked = on; st.lockBusyUntil = until; });
        if (this.lockTimer !== null) clearTimeout(this.lockTimer);
        this.lockTimer = window.setTimeout(() => {
            this.lockTimer = null;
            this.store.update((st) => { st.lockBusyUntil = 0; });
        }, LOCK_GAP_MS);
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

/** Successes first in the feed — this person's own preference, kept in this browser. */
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
    if (r.crit !== undefined) out.crit = r.crit;
    return out;
}

/** Clamped to what the validator accepts; a zero pain is left off the wire. */
function cleanExtras(e: RollExtras): RollExtras {
    if (e.bonus !== undefined) return { bonus: clamp(e.bonus, LIMITS.MIN_BONUS, LIMITS.MAX_BONUS) };
    const out: RollExtras = {};
    if (e.pain) out.pain = clamp(e.pain, 0, LIMITS.MAX_PAIN);
    if (e.need !== undefined) out.need = clamp(e.need, 1, LIMITS.MAX_NEED);
    /* The usual margin stays off the wire, so an ordinary attack still reads
       on a page from before the margin travelled. */
    if (out.need !== undefined && e.crit !== undefined && e.crit !== LIMITS.MAX_CRIT) {
        out.crit = clamp(e.crit, 0, LIMITS.MAX_CRIT);
    }
    return out;
}

function hasExtras(r: WireRoll): boolean {
    return r.bonus !== undefined || r.pain !== undefined || r.need !== undefined || r.crit !== undefined;
}

function signed(n: number): string {
    return n < 0 ? ' − ' + Math.abs(n) : ' + ' + n;
}

function describe(e: unknown): string {
    return e instanceof Error ? e.message : 'unexpected error';
}
