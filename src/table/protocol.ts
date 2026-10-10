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

import type { GmStatus } from '../gm/ailments';
import type { CharKey, SlimMon, SlimTrainer } from './slim';

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
    /** A flat number added to the faces. Its presence makes this a SUM roll —
        Initiative, 1d6 + Dexterity + Alert — with no successes counted, the
        same rule as the GM screen's RollEntry.bonus. */
    bonus?: number;
    /** Successes the pain penalty strikes off; `net` is what is left. */
    pain?: number;
    /** The successes an accuracy roll needed: its action number this round. */
    need?: number;
}

/** The optional extras a roll request can carry, as they travel. */
export interface RollExtras {
    bonus?: number;
    pain?: number;
    need?: number;
}

export interface WireMember {
    id: string;
    name: string;
    host: boolean;
    /** Index into PLAYER_COLORS (colors.ts); absent from an older client. */
    color?: number;
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
    /** Empty while the GM keeps the title to themself, which is the default. */
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
    /** A fade in or out under way, or null. */
    fade: Fade | null;
}

/** A deck's sound sweeping in or out over `ms`, from table-clock time `at`.
    Everyone works out the same volume from the clock, so the whole table
    fades together. A fade-out ends the deck: it `then` pauses where it got
    to, or stops and goes back to the start. */
export interface Fade {
    dir: 'in' | 'out';
    at: number;
    ms: number;
    then: 'pause' | 'stop' | null;
}

/** A shared map image, as shown. */
export interface WireMapImage {
    file: WireFile;
    w: number;
    h: number;
}

/** One combatant on the turn strip. Players see who and in what order, and
    whose turn it is; the counts ride only on the entries that are a player's
    own character, which is the one thing about the fight they track. */
export interface WireTurnEntry {
    /** The combatant's id in the GM's tracker. */
    id: string;
    name: string;
    /** A Pokédex image file name for a Pokémon, '' for a trainer or a name. */
    img: string;
    /** The member whose character this is, '' for the GM's own. */
    own: string;
    /** Which of their characters (CharKey), '' when `own` is ''. */
    ck: string;
    /** Has had its turn in this pass. */
    done: boolean;
    /** Has no action left this Round, or is out of the fight. */
    out: boolean;
    acted?: number;
    eva?: boolean;
    clash?: boolean;
}

export interface WireTurns {
    name: string;
    round: number;
    pass: number;
    /** Turns are being kept (the GM pressed Start). */
    run: boolean;
    /** Whose turn it is, or null before the start and once a Round is spent. */
    cur: string | null;
    order: WireTurnEntry[];
}

/** What a player reports about their music, to the GM only. */
export interface TrackLoad {
    id: string;
    /** Whole percent. */
    pct: number;
}

export type Body =
    /** Any member, on connect and every heartbeat. Doubles as presence. */
    | { k: 'hello'; name: string; color?: number }
    /** Host only. Also the liveness signal players watch for. */
    | { k: 'roster'; members: WireMember[] }
    /** Player to host: please roll this. */
    | ({ k: 'request'; rid: string; count: number; sides: number; note?: string } & RollExtras)
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
    | { k: 'map'; rev: number; show: boolean; title: string; live: boolean; image: WireMapImage | null }
    /** Host only. The turn strip, or null when no fight is on the table. */
    | { k: 'turns'; rev: number; turns: WireTurns | null }
    /** Host only. The GM changed one of `to`'s characters in the fight: the
        HP, Will or status it now has. Values, not steps, so a resend is
        harmless. */
    | { k: 'pcop'; to: string; key: CharKey; oid: string; hp?: number; will?: number; status?: GmStatus }
    /** Player to host: one of my characters as the GM's copy should have it.
        `ack` is the last `pcop` applied to it, so the host stops resending. */
    | { k: 'pc'; key: CharKey; ack?: string; trainer?: SlimTrainer; mon?: SlimMon }
    /** Player to host: put these characters into the fight; roll each one's
        initiative, 1d6 + bonus. */
    | { k: 'enter'; rid: string; chars: { key: CharKey; bonus: number }[] }
    /** Player to host: my turn is over, I delay it, or I spent an action on an
        Evasion or a Clash. */
    | { k: 'turn'; op: TurnOp; id: string; after?: string };

/** `acc`: an attack rolled, which costs nothing here — the GM screen only
    flags it, as a reminder to count the action. */
export type TurnOp = 'pass' | 'delay' | 'eva' | 'clash' | 'acc';

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
    /** Initiative's flat bonus: Dexterity + Alert plus a hand modifier. */
    MIN_BONUS: -99,
    MAX_BONUS: 99,
    MAX_PAIN: 5,
    MAX_NEED: 5,

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
    MAX_FADE_MS: 10_000,
    /** The largest map image side, in pixels. */
    MAX_MAP_SIDE: 8192,
    /** Combatants on the turn strip. */
    MAX_TURNS: 60,
    MAX_ROUND: 999,
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
