/* Everything arriving from another browser passes through here first.

   The rule this file follows is that a message is not "cleaned up" — it is
   either exactly what the protocol allows or it is dropped. Nothing is coerced,
   no missing field is defaulted, and no unknown field is tolerated. A validator
   that repairs its input is a validator that will one day repair an attack into
   something the rest of the app accepts.

   The one thing that IS rewritten is display text, because there is no valid
   reason for a nickname to contain a bidi override and every reason for someone
   to try. */

import { LIMITS } from './protocol';
import type {
    Body, ChannelId, ChannelState, Fade, Inner, TrackLoad, WireFile, WireMapImage, WireMember, WireRoll, WireTrack,
} from './protocol';

/* Keys that must never survive a parse. `__proto__` in a JSON object literal is
   inert on its own, but the moment any code spreads or assigns that object into
   another one it becomes prototype pollution, and this page merges remote data
   into React state on every message. Dropped at the door instead. */
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** JSON.parse with the prototype-pollution keys removed as they are read. */
export function safeParse(text: string): unknown {
    return JSON.parse(text, function reviver(key, value) {
        if (POISON_KEYS.has(key)) return undefined;
        return value;
    });
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Rejects an object carrying any field the protocol does not define. */
function exactly(o: Record<string, unknown>, allowed: readonly string[]): boolean {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) return false;
    return true;
}

function int(v: unknown, min: number, max: number): number | null {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return null;
    return v;
}

/* C0/C1 controls, zero-width characters, line separators, the byte-order mark
   and the bidirectional overrides. The last group is the interesting one:
   U+202E flips the rendering direction of everything after it, which is the
   classic way to make one display name look like another on screen. */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Display text, normalised and stripped. Returns '' for anything unusable,
    which every caller treats as a missing field rather than an empty one. */
export function cleanText(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    if (v.length > max * 4) return '';
    return v.normalize('NFC').replace(UNSAFE_TEXT, '').trim().slice(0, max);
}

/** A short opaque id — request ids, roll ids, session ids. */
function idText(v: unknown): string | null {
    return typeof v === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(v) ? v : null;
}

/** A finite number in range; fractions allowed. */
function num(v: unknown, min: number, max: number): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return null;
    return v;
}

function fingerprintText(v: unknown): string | null {
    return typeof v === 'string' && /^[A-Z2-7]{16}$/.test(v) ? v : null;
}

const LABEL_RE = /^(\d{1,2})d(\d{1,4})$/;

/** A roll, with every derived number recomputed from the faces.

    This is stricter than a friendly table strictly needs: the host is the only
    one allowed to publish a roll, so in principle its arithmetic could be taken
    on trust. Recomputing means a compromised host cannot show five successes on
    faces that plainly total three — the numbers on screen always describe the
    dice printed next to them.

    It is also what keeps a scripted roll honest. The GM's predetermined result
    has to be real faces that genuinely produce the outcome, not a claimed
    total, which is exactly why scripting fabricates faces rather than numbers. */
export function parseRoll(raw: unknown): WireRoll | null {
    if (!isRecord(raw)) return null;
    if (!exactly(raw, ['id', 'label', 'vals', 'total', 'succ', 'net', 't', 'who', 'note'])) return null;

    const id = idText(raw.id);
    if (!id) return null;

    if (typeof raw.label !== 'string') return null;
    const m = LABEL_RE.exec(raw.label);
    if (!m) return null;
    const count = int(Number(m[1]), LIMITS.MIN_COUNT, LIMITS.MAX_COUNT);
    const sides = int(Number(m[2]), LIMITS.MIN_SIDES, LIMITS.MAX_SIDES);
    if (count === null || sides === null) return null;

    if (!Array.isArray(raw.vals) || raw.vals.length !== count) return null;
    const vals: number[] = [];
    for (const v of raw.vals) {
        const face = int(v, 1, sides);
        if (face === null) return null;
        vals.push(face);
    }

    const t = int(raw.t, 0, Number.MAX_SAFE_INTEGER);
    if (t === null) return null;

    const who = cleanText(raw.who, LIMITS.MAX_NAME);
    if (!who) return null;

    const note = raw.note === undefined
        ? undefined
        : cleanText(raw.note, LIMITS.MAX_NOTE) || undefined;

    /* Pokerole counts 4, 5 and 6 as successes; other dice only have a total.
       The same rule as src/gm/dice.ts, applied to the faces we were handed. */
    const total = vals.reduce((a, b) => a + b, 0);
    const succ = sides === 6 ? vals.filter((v) => v >= 4).length : null;

    return { id, label: raw.label, vals, total, succ, net: succ, t, who, note };
}

function parseMember(raw: unknown): WireMember | null {
    if (!isRecord(raw)) return null;
    if (!exactly(raw, ['id', 'name', 'host'])) return null;
    const id = fingerprintText(raw.id);
    const name = cleanText(raw.name, LIMITS.MAX_NAME);
    if (!id || !name || typeof raw.host !== 'boolean') return null;
    return { id, name, host: raw.host };
}

export function parseFile(raw: unknown): WireFile | null {
    if (!isRecord(raw) || !exactly(raw, ['id', 'sha', 'size', 'parts', 'mime'])) return null;
    if (typeof raw.id !== 'string' || !/^[a-f0-9]{32}$/.test(raw.id)) return null;
    if (typeof raw.sha !== 'string' || !/^[a-f0-9]{64}$/.test(raw.sha)) return null;
    const size = int(raw.size, 1, LIMITS.MAX_FILE_BYTES);
    const parts = int(raw.parts, 1, LIMITS.MAX_PARTS);
    if (size === null || parts === null) return null;
    /* The count must be the one the size implies, or a reference could ask
       for parts that do not exist, or stop short of the end. */
    if (parts !== Math.max(1, Math.ceil(size / 1_000_000))) return null;
    if (typeof raw.mime !== 'string'
        || !/^((audio|image|video)\/[a-z0-9.+-]{1,40}|application\/octet-stream)$/.test(raw.mime)) return null;
    return { id: raw.id, sha: raw.sha, size, parts, mime: raw.mime };
}

function parseTrack(raw: unknown): WireTrack | null {
    if (!isRecord(raw) || !exactly(raw, ['id', 'title', 'kind', 'file', 'yt', 'dur'])) return null;
    const id = idText(raw.id);
    /* '' is a title the GM has not revealed. */
    const title = raw.title === '' ? '' : cleanText(raw.title, LIMITS.MAX_TITLE);
    const dur = num(raw.dur, 0, LIMITS.MAX_SECONDS);
    if (typeof raw.title !== 'string' || !id || (!title && raw.title !== '') || dur === null) return null;
    if (raw.kind === 'file') {
        if (raw.yt !== undefined) return null;
        const file = parseFile(raw.file);
        if (!file || !/^(audio|video)\/|^application\/octet-stream$/.test(file.mime)) return null;
        return { id, title, kind: 'file', file, dur };
    }
    if (raw.kind === 'yt') {
        if (raw.file !== undefined) return null;
        if (typeof raw.yt !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(raw.yt)) return null;
        return { id, title, kind: 'yt', yt: raw.yt, dur };
    }
    return null;
}

function parseFade(raw: unknown): Fade | null | undefined {
    if (raw === null) return null;
    if (!isRecord(raw) || !exactly(raw, ['dir', 'at', 'ms', 'then'])) return undefined;
    const at = int(raw.at, 0, Number.MAX_SAFE_INTEGER);
    const ms = int(raw.ms, 1, LIMITS.MAX_FADE_MS);
    if (at === null || ms === null) return undefined;
    if (raw.dir === 'in' && raw.then === null) return { dir: 'in', at, ms, then: null };
    if (raw.dir === 'out' && (raw.then === 'pause' || raw.then === 'stop')) return { dir: 'out', at, ms, then: raw.then };
    return undefined;
}

function parseChannel(raw: unknown): ChannelState | null {
    if (!isRecord(raw) || !exactly(raw, ['track', 'playing', 'pos', 'ref', 'loop', 'vol', 'fade'])) return null;
    const track = raw.track === null ? null : idText(raw.track);
    if (raw.track !== null && !track) return null;
    const pos = num(raw.pos, 0, LIMITS.MAX_SECONDS);
    const ref = int(raw.ref, 0, Number.MAX_SAFE_INTEGER);
    const vol = num(raw.vol, 0, 1);
    if (pos === null || ref === null || vol === null) return null;
    if (typeof raw.playing !== 'boolean' || typeof raw.loop !== 'boolean') return null;
    const fade = parseFade(raw.fade);
    if (fade === undefined) return null;
    return { track, playing: raw.playing, pos, ref, loop: raw.loop, vol, fade };
}

function parseMapImage(raw: unknown): WireMapImage | null {
    if (!isRecord(raw) || !exactly(raw, ['file', 'w', 'h'])) return null;
    const file = parseFile(raw.file);
    const w = int(raw.w, 1, LIMITS.MAX_MAP_SIDE);
    const h = int(raw.h, 1, LIMITS.MAX_MAP_SIDE);
    if (!file || w === null || h === null || !file.mime.startsWith('image/')) return null;
    return { file, w, h };
}

function idList(raw: unknown, max: number): string[] | null {
    if (!Array.isArray(raw) || raw.length > max) return null;
    const out: string[] = [];
    for (const v of raw) {
        const id = idText(v);
        if (!id) return null;
        out.push(id);
    }
    return out;
}

function driftValue(v: unknown): number | null | undefined {
    if (v === null) return null;
    const d = int(v, -3_600_000, 3_600_000);
    return d === null ? undefined : d;
}

export function parseBody(raw: unknown): Body | null {
    if (!isRecord(raw) || typeof raw.k !== 'string') return null;

    switch (raw.k) {
        case 'hello': {
            if (!exactly(raw, ['k', 'name'])) return null;
            const name = cleanText(raw.name, LIMITS.MAX_NAME);
            return name ? { k: 'hello', name } : null;
        }
        case 'roster': {
            if (!exactly(raw, ['k', 'members'])) return null;
            if (!Array.isArray(raw.members) || raw.members.length > LIMITS.MAX_MEMBERS) return null;
            const members: WireMember[] = [];
            for (const m of raw.members) {
                const parsed = parseMember(m);
                if (!parsed) return null;
                members.push(parsed);
            }
            return { k: 'roster', members };
        }
        case 'request': {
            if (!exactly(raw, ['k', 'rid', 'count', 'sides', 'note'])) return null;
            const rid = idText(raw.rid);
            const count = int(raw.count, LIMITS.MIN_COUNT, LIMITS.MAX_COUNT);
            const sides = int(raw.sides, LIMITS.MIN_SIDES, LIMITS.MAX_SIDES);
            if (!rid || count === null || sides === null) return null;
            const note = raw.note === undefined
                ? undefined
                : cleanText(raw.note, LIMITS.MAX_NOTE) || undefined;
            return { k: 'request', rid, count, sides, note };
        }
        case 'result': {
            if (!exactly(raw, ['k', 'rid', 'roll'])) return null;
            const roll = parseRoll(raw.roll);
            if (!roll) return null;
            if (raw.rid !== undefined && !idText(raw.rid)) return null;
            return { k: 'result', rid: raw.rid as string | undefined, roll };
        }
        case 'sync': {
            if (!exactly(raw, ['k', 'rolls'])) return null;
            if (!Array.isArray(raw.rolls) || raw.rolls.length > LIMITS.MAX_SYNC) return null;
            const rolls: WireRoll[] = [];
            for (const r of raw.rolls) {
                const parsed = parseRoll(r);
                if (!parsed) return null;
                rolls.push(parsed);
            }
            return { k: 'sync', rolls };
        }
        case 'clear': {
            if (!exactly(raw, ['k'])) return null;
            return { k: 'clear' };
        }
        case 'kick': {
            if (!exactly(raw, ['k', 'id'])) return null;
            const id = fingerprintText(raw.id);
            return id ? { k: 'kick', id } : null;
        }
        case 'library': {
            if (!exactly(raw, ['k', 'tracks'])) return null;
            if (!Array.isArray(raw.tracks) || raw.tracks.length > LIMITS.MAX_TRACKS) return null;
            const tracks: WireTrack[] = [];
            for (const t of raw.tracks) {
                const parsed = parseTrack(t);
                if (!parsed || tracks.some((x) => x.id === parsed.id)) return null;
                tracks.push(parsed);
            }
            return { k: 'library', tracks };
        }
        case 'music': {
            if (!exactly(raw, ['k', 'rev', 'bg', 'scene'])) return null;
            const rev = int(raw.rev, 0, Number.MAX_SAFE_INTEGER);
            const bg = parseChannel(raw.bg);
            const scene = parseChannel(raw.scene);
            if (rev === null || !bg || !scene) return null;
            return { k: 'music', rev, bg, scene };
        }
        case 'mstat': {
            if (!exactly(raw, ['k', 'unlocked', 'ready', 'loading', 'drift', 'stall', 'failed'])) return null;
            if (typeof raw.unlocked !== 'boolean') return null;
            const ready = idList(raw.ready, LIMITS.MAX_TRACKS);
            const failed = idList(raw.failed, LIMITS.MAX_TRACKS);
            if (!ready || !failed) return null;
            if (!Array.isArray(raw.loading) || raw.loading.length > LIMITS.MAX_TRACKS) return null;
            const loading: TrackLoad[] = [];
            for (const l of raw.loading) {
                if (!isRecord(l) || !exactly(l, ['id', 'pct'])) return null;
                const id = idText(l.id);
                const pct = int(l.pct, 0, 100);
                if (!id || pct === null) return null;
                loading.push({ id, pct });
            }
            if (!isRecord(raw.drift) || !exactly(raw.drift, ['bg', 'scene'])) return null;
            const bg = driftValue(raw.drift.bg);
            const scene = driftValue(raw.drift.scene);
            if (bg === undefined || scene === undefined) return null;
            if (!Array.isArray(raw.stall) || raw.stall.length > 2) return null;
            const stall: ChannelId[] = [];
            for (const c of raw.stall) {
                if (c !== 'bg' && c !== 'scene') return null;
                stall.push(c);
            }
            return { k: 'mstat', unlocked: raw.unlocked, ready, loading, drift: { bg, scene }, stall, failed };
        }
        case 'map': {
            if (!exactly(raw, ['k', 'rev', 'show', 'title', 'live', 'image'])) return null;
            const rev = int(raw.rev, 0, Number.MAX_SAFE_INTEGER);
            if (rev === null || typeof raw.show !== 'boolean' || typeof raw.live !== 'boolean') return null;
            const title = raw.title === '' ? '' : cleanText(raw.title, LIMITS.MAX_TITLE);
            if (typeof raw.title !== 'string') return null;
            const image = raw.image === null ? null : parseMapImage(raw.image);
            if (raw.image !== null && !image) return null;
            /* Shown means there is a picture; hidden means there is none on
               the wire at all — a hidden map is not sent and then masked. */
            if (raw.show !== (image !== null)) return null;
            return { k: 'map', rev, show: raw.show, title, live: raw.live, image };
        }
        default:
            return null;
    }
}

/** The inner message, before its signature has been checked.

    Order matters and is not an accident: this parses untrusted JSON, and only
    once it is known to be structurally sound does the caller verify the
    signature over the ORIGINAL string. Parsing first is safe precisely because
    nothing in here trusts what it reads. */
export function parseInner(raw: unknown, expectedAddr: string): Inner | null {
    if (!isRecord(raw)) return null;
    if (!exactly(raw, ['v', 'a', 'f', 'k', 'sid', 's', 'ts', 'b'])) return null;
    if (raw.v !== 1) return null;
    if (raw.a !== expectedAddr) return null;

    const f = fingerprintText(raw.f);
    const sid = idText(raw.sid);
    const s = int(raw.s, 0, Number.MAX_SAFE_INTEGER);
    const ts = int(raw.ts, 0, Number.MAX_SAFE_INTEGER);
    if (!f || !sid || s === null || ts === null) return null;
    /* An uncompressed P-256 point is 65 bytes, 87 base64url characters. The
       range leaves room for nothing but that. */
    if (typeof raw.k !== 'string' || !/^[A-Za-z0-9_-]{80,120}$/.test(raw.k)) return null;

    const b = parseBody(raw.b);
    if (!b) return null;

    return { v: 1, a: raw.a, f, k: raw.k, sid, s, ts, b };
}

/** The `{p,g}` wrapper. Kept separate so the caller still holds `p` as the
    exact string that was signed. */
export function parseSigned(raw: unknown): { p: string; g: string } | null {
    if (!isRecord(raw)) return null;
    if (!exactly(raw, ['p', 'g'])) return null;
    if (typeof raw.p !== 'string' || typeof raw.g !== 'string') return null;
    if (raw.p.length > LIMITS.MAX_WIRE_CHARS) return null;
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(raw.g)) return null;
    return { p: raw.p, g: raw.g };
}
