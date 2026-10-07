/* The wire format.

   Three layers, outermost first:

     envelope   {v,n,c}          what the relay forwards. Opaque to it.
     signed     {p,g}            p is the inner JSON *as a string*, g its signature
     inner      {v,a,f,k,sid,s,ts,b}

   The middle layer is a string on purpose. Signing the exact bytes that were
   sent, and verifying those same bytes before parsing them, sidesteps every
   canonical-JSON problem there is: no key ordering to agree on, no number
   formatting to match, no reserialisation that might not reproduce the original.

   `k` carries the sender's public key, so a message is self-certifying — the
   receiver checks that `k` hashes to `f`, then that the signature holds under
   `k`. For anything the host publishes, it additionally checks that `f` equals
   the lobby id, which is the host key's fingerprint. */

export const PROTOCOL_VERSION = 1;

/** A roll as it travels. Deliberately smaller than the GM screen's RollEntry:
    the fields a receiver can recompute are recomputed rather than trusted, and
    nothing about how the roll was produced is included — see `hidden` and
    `scripted` in session.ts, neither of which is ever on the wire. */
export interface WireRoll {
    id: string;
    /** `<count>d<sides>`, e.g. `4d6`. */
    label: string;
    vals: number[];
    total: number;
    succ: number | null;
    net: number | null;
    t: number;
    /** Display name of whoever asked for it. */
    who: string;
    /** Optional free-text label — "Insight", "Clash". */
    note?: string;
}

export interface WireMember {
    id: string;
    name: string;
    host: boolean;
}

/** A file on the relay's file store (blobs.ts). The receiver checks the
    reassembled bytes against `sha`, which is why a reference is only ever
    accepted from the GM. */
export interface WireFile {
    id: string;
    sha: string;
    size: number;
    parts: number;
    mime: string;
}

/** A track in the GM's library: a file everyone downloads ahead of time, or a
    YouTube video everyone loads in their own player. */
export interface WireTrack {
    id: string;
    title: string;
    kind: 'file' | 'yt';
    file?: WireFile;
    /** An 11-character YouTube video id. */
    yt?: string;
    /** Seconds; 0 while unknown. */
    dur: number;
}

/** The two decks the GM mixes: a Background bed and the current Scene. */
export type ChannelId = 'bg' | 'scene';
export const CHANNELS: readonly ChannelId[] = ['bg', 'scene'];

/** One deck, as everyone should be hearing it.

    The position is not sent as "now": it is sent as `pos` seconds at the
    table-clock instant `ref` (clock.ts), so anyone can work out where the
    track is at any moment — a late joiner, or a player whose tab was
    throttled — without asking. A `ref` in the future is a scheduled start,
    which is how everyone begins on the same beat. */
export interface ChannelState {
    track: string | null;
    playing: boolean;
    pos: number;
    ref: number;
    loop: boolean;
    /** The GM's mix for this deck, 0..1. Players scale it by their own. */
    vol: number;
}

/** A shared map image, as shown. */
export interface WireMapImage {
    file: WireFile;
    w: number;
    h: number;
}

/** What a player reports about their music, to the GM only. */
export interface TrackLoad {
    id: string;
    /** Whole percent. */
    pct: number;
}

export type Body =
    /** Any member, on connect and every heartbeat. Doubles as presence. */
    | { k: 'hello'; name: string }
    /** Host only. Also the liveness signal players watch for. */
    | { k: 'roster'; members: WireMember[] }
    /** Player to host: please roll this. */
    | { k: 'request'; rid: string; count: number; sides: number; note?: string }
    /** Host only. The result, for everyone. */
    | { k: 'result'; rid?: string; roll: WireRoll }
    /** Host only. Recent public rolls, sent to someone who just joined. */
    | { k: 'sync'; rolls: WireRoll[] }
    /** Host only. */
    | { k: 'clear' }
    /** Host only. */
    | { k: 'kick'; id: string }
    /** Host only. The music library everyone prefetches. */
    | { k: 'library'; tracks: WireTrack[] }
    /** Host only. Both decks. Sent on every change and every few seconds. */
    | { k: 'music'; rev: number; bg: ChannelState; scene: ChannelState }
    /** Player to host: what this player can play, and how far off they are. */
    | {
        k: 'mstat';
        unlocked: boolean;
        ready: string[];
        loading: TrackLoad[];
        /** Milliseconds ahead (+) or behind (−) per deck; null when silent. */
        drift: { bg: number | null; scene: number | null };
        /** Decks that should be playing and cannot (buffering, an advert). */
        stall: ChannelId[];
        failed: string[];
    }
    /** Host only. The shared map, or that there is none on show. */
    | { k: 'map'; rev: number; show: boolean; title: string; live: boolean; image: WireMapImage | null };

export interface Inner {
    v: number;
    /** Room address — binds this message to one room. */
    a: string;
    /** Sender fingerprint. */
    f: string;
    /** Sender public key, base64url raw. */
    k: string;
    /** Per page load, so a reloaded tab's counter restarting at 0 is not
        mistaken for a replay. */
    sid: string;
    /** Sequence within this session. */
    s: number;
    ts: number;
    b: Body;
}

/* Every bound a hostile message is checked against. Collected here because a
   limit that lives next to the code that enforces it is a limit nobody can
   audit in one pass. */
export const LIMITS = {
    /** Matches the GM screen's own stepper clamps, so a shared table cannot ask
        for a pool the rest of the app would refuse to draw. */
    MIN_COUNT: 1,
    MAX_COUNT: 99,
    MIN_SIDES: 2,
    MAX_SIDES: 1000,

    MAX_NAME: 24,
    MAX_NOTE: 60,
    MAX_MEMBERS: 16,
    MAX_SYNC: 30,

    /** Kept below the relay's own 32 KB ceiling. */
    MAX_WIRE_CHARS: 24 * 1024,

    /** How far a sender's clock may be out before its messages are ignored.
        Also the window outside which a captured message stops being replayable. */
    CLOCK_SKEW_MS: 5 * 60 * 1000,

    /** Roll history kept on screen. Mirrors the GM screen's HISTORY_LIMIT. */
    HISTORY: 30,

    MAX_TRACKS: 40,
    MAX_TITLE: 60,
    /** Matches blobs.ts: 64 parts of 1 000 000 bytes. */
    MAX_FILE_BYTES: 64_000_000,
    MAX_PARTS: 64,
    /** Ten hours: longer than any track or session needs. */
    MAX_SECONDS: 36_000,
    /** The largest map image side, in pixels. */
    MAX_MAP_SIDE: 8192,
} as const;

/** How often everyone announces themselves, and how long the host waits before
    treating a silent member as gone. Three missed beats, so one dropped packet
    does not empty the roster. */
export const HEARTBEAT_MS = 25_000;
export const PRESENCE_TIMEOUT_MS = 80_000;

export function randomId(bytes = 9): string {
    const raw = crypto.getRandomValues(new Uint8Array(bytes));
    let s = '';
    for (const b of raw) s += b.toString(16).padStart(2, '0');
    return s;
}
