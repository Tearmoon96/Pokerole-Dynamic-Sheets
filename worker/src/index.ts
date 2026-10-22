/* The Rolling Table relay — a blind pipe.

   Everything that matters about this file is what it does NOT do. It never
   decrypts, never validates a roll, never stores a message and never learns a
   lobby id or a password. Clients derive a 32-character room address from the
   lobby id and the password; that address is the only thing this service sees,
   and it cannot be turned back into either half. The payloads are AES-GCM
   ciphertext signed by their sender, so a hostile relay — this one, breached —
   could drop or reorder messages but could not read one or forge one.

   That is deliberate. It means the security of a table does not rest on the
   relay being trustworthy, which is the only honest way to run a service on
   someone's free tier.

   Limits below exist to stop one table (or one script) from eating the whole
   account's quota. They are all about volume, never about content.

   There is no server-side keepalive: clients already announce themselves
   every 25 seconds for presence, which is well inside any proxy's idle
   timeout, so a second heartbeat would only wake this object for nothing.

   Two things were added for the shared map and the table's music, and both
   keep the same blindness:

   - a FILE STORE for what is too big for a socket frame — audio, map images.
     Every part arrives already sealed with the room key; this side stores
     bytes it cannot open, under an id the client drew at random. Only the
     member holding the room's upload key (the GM, see `claim`) may write.

   - a CLOCK. A frame of `\u0001t<n>` is answered to its sender alone with
     this object's time, so every browser at a table can agree on one clock
     without the GM answering N pings. It carries no content at all. */

export interface Env {
    TABLE_ROOM: DurableObjectNamespace;
    /** The usage counter. Optional: without the binding nothing is counted. */
    STATS?: AnalyticsEngineDataset;
}

/* Big enough for a joiner's history sync — 30 rolls of up to 99 dice, encrypted
   and base64'd — and nowhere near big enough to be worth abusing as storage. */
const MAX_MSG_CHARS = 32 * 1024;

/* A Pokerole table is a handful of people. The cap is what stops a leaked
   password turning into an unbounded room. */
const MAX_SOCKETS = 16;

/* Per socket, not per room: one loud client cannot silence the others. */
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 40;

/* A room with sockets that stopped talking is torn down rather than left to
   hold connections open on a free plan. Clients heartbeat every 25s. */
const IDLE_MS = 6 * 60 * 60 * 1000;

/* 160 bits of room address, base32. Anything else is not one of ours, and is
   refused before a Durable Object is ever created — otherwise a crawler could
   spawn actors just by walking URLs. */
const ADDR_RE = /^[A-Z2-7]{32}$/;

/* The file store. A part is one sealed chunk: 1 000 000 bytes of plaintext
   plus the IV and the GCM tag, well under SQLite's 2 MB row. 64 parts caps a
   file at 64 MB — an hour of music at 128 kbps fits — and the room cap is what
   keeps one table from eating the account's storage. When a new part would
   pass it, the oldest files go first. */
const MAX_PART_BYTES = 1024 * 1024;
const MAX_PARTS = 64;
const ROOM_QUOTA_BYTES = 256 * 1024 * 1024;

/* Every request is what the free plan counts, not every byte, so parts travel
   in batches: `?from=<i>&n=<k>` reads up to BATCH_PARTS of them in one GET, and
   `?from=<i>` writes as many in one PUT. A batch is each part prefixed by its
   length (4 bytes, big-endian). The one-part routes stay for older pages. */
const BATCH_PARTS = 8;
const MAX_BATCH_BYTES = BATCH_PARTS * (MAX_PART_BYTES + 4);

/* 128 random bits, hex. The client draws it; anything else is refused. */
const BLOB_ID_RE = /^[a-f0-9]{32}$/;

/* The clock frame, and the most a ping's counter may be. */
const CLOCK_PREFIX = '\u0001t';
const CLOCK_MAX_CHARS = 24;

const CORS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-upload-key',
    'Access-Control-Max-Age': '86400',
};

/* The pages that may use the relay from a browser: the site, and a page
   served from this machine while it is worked on. A browser always says
   which page a socket or a cross-origin request comes from, and the page
   cannot change it — so another website cannot have its visitors' browsers
   spend this account's daily allowance through the relay. A program outside
   a browser can claim anything, or nothing; for those the limits are what
   count, so a request that names no origin is let through. */
const SITE_ORIGINS = ['https://tearmoon96.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

function originAllowed(req: Request): boolean {
    const origin = req.headers.get('Origin');
    return origin === null || SITE_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

/* The idle alarm is a storage write. Moved on every message it would cost a
   write per roll, so a busy table moves it at most this often; the idle wipe
   comes at most this much sooner than IDLE_MS after the last message. */
const REARM_MS = 5 * 60 * 1000;

/* The usage counter. Two kinds of data point, and only numbers in either:

   - `join`: a socket opened. double1 = how many are in the room with it.
   - `session`: a room emptied (or was wiped idle). double1 = the most people
     it held at once, double2 = minutes from its first socket to its last.

   A session's peak is the honest head count: a reload or a dropped Wi-Fi is
   a second `join` but not a second person. A GM preparing alone and reloading
   makes sessions of one, so the query script counts tables of two or more.
   The room's own record (`STATS_KEY`) is deleted when the session is counted,
   and with everything else in an idle wipe. */
const STATS_KEY = 'stats';

interface RoomStats {
    /** When the session's first socket opened. */
    start: number;
    /** The most open sockets seen at once. */
    peak: number;
    /** Last sign of life: a join, a leave, or a move of the idle alarm. */
    seen: number;
}

function text(body: string, status: number): Response {
    return new Response(body, { status, headers: CORS });
}

/** A request's body, or null when it is longer than `max` bytes — read to its
    end either way, but never more than `max` of it held in memory (reading a
    100 MB upload whole to find it too big held all of it first). Never
    cancelled: a response sent over an unread or cancelled upload makes the
    runtime fail reading it afterwards, and makes `wrangler dev` exit. */
async function readCapped(req: Request, max: number): Promise<ArrayBuffer | null> {
    if (!req.body) return new ArrayBuffer(0);
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size <= max) chunks.push(value);
    }
    if (size > max) return null;
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.byteLength; }
    return out.buffer;
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);

        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

        /* A plain GET answers, so `wrangler dev` and the app's setup screen can
           both check the relay is alive without opening a socket. */
        if (url.pathname === '/' || url.pathname === '/health') {
            return new Response(
                JSON.stringify({ ok: true, service: 'pokerole-rolling-table' }),
                { headers: { 'content-type': 'application/json', ...CORS } },
            );
        }

        if (!url.pathname.startsWith('/room/')) return text('not found', 404);
        if (!originAllowed(req)) {
            await readCapped(req, 0);
            return text('not from this site', 403);
        }
        const [addr, ...rest] = url.pathname.slice('/room/'.length).split('/');
        if (!ADDR_RE.test(addr)) return text('bad room address', 400);

        /* The socket, as before. */
        if (rest.length === 0) {
            if (req.headers.get('Upgrade') !== 'websocket') return text('expected a websocket upgrade', 426);
            return env.TABLE_ROOM.get(env.TABLE_ROOM.idFromName(addr)).fetch(req);
        }

        /* The file store: `claim`, `blobs`, `blob/<id>` and `blob/<id>/<part>`.
           Shapes are checked here, before a Durable Object is woken for them. */
        const okShape = (rest.length === 1 && (rest[0] === 'claim' || rest[0] === 'blobs'))
            || (rest[0] === 'blob' && rest.length >= 2 && rest.length <= 3 && BLOB_ID_RE.test(rest[1])
                && (rest.length === 2 || /^\d{1,2}$/.test(rest[2])));
        /* A body is always read to the end before anything answers: a
           response sent over an unread upload makes the runtime fail reading
           it afterwards (and `wrangler dev` exits outright). A request that
           goes no further is drained here; one that does is handed on
           unread, and the room reads it — this side has 10 ms of CPU, which
           copying an 8 MB batch could eat into. */
        if (!okShape) {
            await readCapped(req, 0);
            return text('not found', 404);
        }
        const upload = req.method === 'PUT' || req.method === 'POST';
        if (!upload) await readCapped(req, 0);
        return env.TABLE_ROOM.get(env.TABLE_ROOM.idFromName(addr)).fetch(
            new Request(req.url, { method: req.method, headers: req.headers, body: upload ? req.body : null }));
    },
};

/** `?from=<i>&n=<k>` on a blob, or null when there is none or it is out of
    range. `n` is 1 when absent (a PUT says how many by its body). */
function batchOf(url: URL): { from: number; n: number } | null {
    const from = url.searchParams.get('from');
    if (from === null || !/^\d{1,2}$/.test(from)) return null;
    const raw = url.searchParams.get('n');
    const n = raw === null ? 1 : /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
    if (n < 1 || n > BATCH_PARTS || Number(from) + n > MAX_PARTS) return null;
    return { from: Number(from), n };
}

/** Splits a batch body into its parts. Null when the framing is wrong. */
function unframe(body: ArrayBuffer): ArrayBuffer[] | null {
    const view = new DataView(body);
    const parts: ArrayBuffer[] = [];
    let at = 0;
    while (at < body.byteLength) {
        if (at + 4 > body.byteLength || parts.length >= BATCH_PARTS) return null;
        const len = view.getUint32(at);
        at += 4;
        if (len === 0 || len > MAX_PART_BYTES || at + len > body.byteLength) return null;
        parts.push(body.slice(at, at + len));
        at += len;
    }
    return parts.length ? parts : null;
}

function frame(parts: ArrayBuffer[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + 4 + p.byteLength, 0));
    const view = new DataView(out.buffer);
    let at = 0;
    for (const p of parts) {
        view.setUint32(at, p.byteLength);
        out.set(new Uint8Array(p), at + 4);
        at += 4 + p.byteLength;
    }
    return out;
}

/** Per-socket bookkeeping. Kept on the socket itself so the room can hibernate
    between messages instead of holding memory open for an idle table. */
interface SocketMeta {
    /** Messages seen in the current window. */
    n: number;
    /** When the current window opened. */
    since: number;
}

export class TableRoom implements DurableObject {
    /** When this object last moved its idle alarm. Kept in memory only: an
        object woken from hibernation starts at 0 and moves it on its first
        message, which is all the bookkeeping needs. */
    private armedAt = 0;

    constructor(private state: DurableObjectState, private env: Env) {}

    /** Pushes the idle wipe IDLE_MS into the future — at most once every
        REARM_MS, since each move is a storage write. */
    private async rearm(now: number): Promise<void> {
        if (now - this.armedAt < REARM_MS) return;
        this.armedAt = now;
        await this.state.storage.setAlarm(now + IDLE_MS);
        const stats = await this.state.storage.get<RoomStats>(STATS_KEY);
        if (stats) await this.state.storage.put(STATS_KEY, { ...stats, seen: now });
    }

    /* ------------------------------------------------------- the counter */

    /** One data point. Never throws: counting must not cost a table a socket. */
    private count(kind: 'join' | 'session', doubles: number[]): void {
        try {
            this.env.STATS?.writeDataPoint({ blobs: [kind], doubles, indexes: [kind] });
        } catch { /* the counter is best effort */ }
    }

    /** Sockets still open, leaving out `except` (the one going away). */
    private openSockets(except?: WebSocket): number {
        return this.state.getWebSockets().filter((w) => w !== except && w.readyState === WebSocket.OPEN).length;
    }

    /** Counts a finished session and forgets it. */
    private async endSession(stats: RoomStats, end: number): Promise<void> {
        this.count('session', [stats.peak, Math.max(0, Math.round((end - stats.start) / 60_000))]);
        await this.state.storage.delete(STATS_KEY);
    }

    /** A socket just opened: `n` are open now, itself included. */
    private async joined(n: number, now: number): Promise<void> {
        this.count('join', [n]);
        let stats = await this.state.storage.get<RoomStats>(STATS_KEY);
        /* Alone in a room that still has a session: the last one ended
           without a close reaching us (a redeploy, an eviction). Count it
           as of its last sign of life, and start afresh. */
        if (stats && n === 1) {
            await this.endSession(stats, stats.seen);
            stats = undefined;
        }
        stats = stats
            ? { ...stats, peak: Math.max(stats.peak, n), seen: now }
            : { start: now, peak: n, seen: now };
        await this.state.storage.put(STATS_KEY, stats);
    }

    /** A socket went away; the last one out ends the session. */
    private async left(ws: WebSocket): Promise<void> {
        if (this.openSockets(ws) > 0) return;
        const stats = await this.state.storage.get<RoomStats>(STATS_KEY);
        if (stats) await this.endSession(stats, Date.now());
    }

    async fetch(req: Request): Promise<Response> {
        const rest = new URL(req.url).pathname.split('/').slice(3);
        if (rest.length > 0) return this.files(req, rest);

        if (this.state.getWebSockets().length >= MAX_SOCKETS) {
            return new Response('table full', { status: 503, headers: CORS });
        }

        const pair = new WebSocketPair();
        const server = pair[1];

        /* Hibernation: the runtime holds the socket while this object sleeps,
           so an idle table costs nothing. It is also why per-socket state is
           serialised onto the socket rather than kept in a field. */
        this.state.acceptWebSocket(server);
        server.serializeAttachment({ n: 0, since: Date.now() } satisfies SocketMeta);

        await this.joined(this.openSockets(), Date.now());
        await this.rearm(Date.now());

        return new Response(null, { status: 101, webSocket: pair[0] });
    }

    async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
        /* Text only. The client sends JSON envelopes; anything binary is either
           a bug or someone poking at the endpoint. */
        if (typeof msg !== 'string') {
            ws.close(1003, 'text frames only');
            return;
        }
        if (msg.length > MAX_MSG_CHARS) {
            ws.close(1009, 'message too large');
            return;
        }

        const now = Date.now();
        const meta = (ws.deserializeAttachment() as SocketMeta | null) ?? { n: 0, since: now };
        if (now - meta.since > RATE_WINDOW_MS) {
            meta.n = 0;
            meta.since = now;
        }
        meta.n += 1;
        ws.serializeAttachment(meta);
        if (meta.n > RATE_MAX) {
            ws.close(1008, 'rate limit');
            return;
        }

        /* A clock ping goes back to its sender with this object's time, and
           nowhere else. Date.now() inside a Worker is the time the event
           arrived, which is exactly the instant a ping wants. */
        if (msg.startsWith(CLOCK_PREFIX)) {
            if (msg.length <= CLOCK_MAX_CHARS && /^\d{1,12}$/.test(msg.slice(CLOCK_PREFIX.length))) {
                try { ws.send(msg + ':' + now); } catch { /* going away */ }
            }
            return;
        }

        /* The whole job. Copy the opaque blob to everyone else and forget it. */
        for (const peer of this.state.getWebSockets()) {
            if (peer === ws) continue;
            try {
                peer.send(msg);
            } catch {
                /* A peer that is already going away is not this send's problem. */
            }
        }

        await this.rearm(now);
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
        /* 1005 and 1006 mean "no code" and may not be sent back. */
        try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch { /* already gone */ }
        await this.left(ws);
    }

    async webSocketError(ws: WebSocket): Promise<void> {
        try { ws.close(1011, 'socket error'); } catch { /* already gone */ }
        await this.left(ws);
    }

    async alarm(): Promise<void> {
        /* No alarm is set any more: the next activity must set one. */
        this.armedAt = 0;
        const stats = await this.state.storage.get<RoomStats>(STATS_KEY);
        if (stats) this.count('session', [stats.peak, Math.max(0, Math.round((stats.seen - stats.start) / 60_000))]);
        for (const ws of this.state.getWebSockets()) {
            try { ws.close(1001, 'table idle'); } catch { /* already gone */ }
        }
        /* An abandoned table's files and upload key go with it. */
        await this.state.storage.deleteAll();
    }

    /* ------------------------------------------------------- the file store */

    private get sql(): SqlStorage {
        return this.state.storage.sql;
    }

    /* Created on use rather than once: `deleteAll()` in the alarm drops the
       tables along with the rows. */
    private schema(): void {
        this.sql.exec(`CREATE TABLE IF NOT EXISTS blobs (
            id TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL,
            size INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (id, part))`);
        this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    }

    /** Whether the request carries the room's upload key. The key itself is
        never stored, only its hash, so reading this object's storage would not
        hand anyone the right to write. */
    private async keyMatches(req: Request): Promise<boolean> {
        const presented = req.headers.get('x-upload-key') || '';
        if (!/^[A-Za-z0-9_-]{32,64}$/.test(presented)) return false;
        const row = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'key'").toArray()[0];
        return !!row && row.v === await sha256Hex(presented);
    }

    private async files(req: Request, rest: string[]): Promise<Response> {
        this.schema();
        /* Read before anything can answer — see the note in the Worker. */
        let data: ArrayBuffer | null = null;
        if (req.method === 'PUT' || req.method === 'POST') {
            data = await readCapped(req, MAX_BATCH_BYTES);
            if (data === null) return text('part too large', 413);
        }
        return this.route(req, rest, data);
    }

    private async route(req: Request, rest: string[], data: ArrayBuffer | null): Promise<Response> {
        /* The first claim wins, and is what makes the GM the only writer: the
           host's page claims the room the moment it connects, before anyone
           else can have the address. A repeat claim with the same key is
           fine — that is the GM reloading. */
        if (rest[0] === 'claim') {
            if (req.method !== 'POST') return text('method not allowed', 405);
            const presented = req.headers.get('x-upload-key') || '';
            if (!/^[A-Za-z0-9_-]{32,64}$/.test(presented)) return text('bad key', 400);
            const hash = await sha256Hex(presented);
            const row = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'key'").toArray()[0];
            if (row && row.v !== hash) return text('room already claimed', 403);
            if (!row) this.sql.exec("INSERT INTO meta (k, v) VALUES ('key', ?)", hash);
            await this.touch();
            return text('ok', 200);
        }

        /* Every file in the room and how many parts of each are here: the
           GM's one look at what survived, rather than one look per file. */
        if (rest[0] === 'blobs') {
            if (req.method !== 'GET') return text('method not allowed', 405);
            const files: Record<string, number> = {};
            for (const r of this.sql.exec<{ id: string; n: number }>('SELECT id, COUNT(*) AS n FROM blobs GROUP BY id')) {
                files[r.id] = r.n;
            }
            return new Response(JSON.stringify({ files }), {
                headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
            });
        }

        const id = rest[1];
        const part = rest.length === 3 ? Number(rest[2]) : null;
        const url = new URL(req.url);
        const batch = part === null && url.searchParams.has('from') ? batchOf(url) : null;
        if (part === null && url.searchParams.has('from') && !batch) return text('bad batch', 400);

        if (req.method === 'GET' && batch) {
            const rows = this.sql.exec<{ part: number; data: ArrayBuffer }>(
                'SELECT part, data FROM blobs WHERE id = ? AND part >= ? AND part < ? ORDER BY part',
                id, batch.from, batch.from + batch.n).toArray();
            if (rows.length !== batch.n) return text('no such part', 404);
            return new Response(frame(rows.map((r) => r.data)), {
                headers: {
                    'content-type': 'application/octet-stream',
                    'cache-control': 'private, max-age=21600, immutable',
                    ...CORS,
                },
            });
        }

        if (req.method === 'GET') {
            if (part === null) {
                /* Which parts exist — how the GM finds out a file was evicted
                   and needs sending again. */
                const parts = this.sql.exec<{ part: number }>(
                    'SELECT part FROM blobs WHERE id = ? ORDER BY part', id).toArray().map((r) => r.part);
                return new Response(JSON.stringify({ parts }), {
                    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
                });
            }
            const row = this.sql.exec<{ data: ArrayBuffer }>(
                'SELECT data FROM blobs WHERE id = ? AND part = ?', id, part).toArray()[0];
            if (!row) return text('no such part', 404);
            return new Response(row.data, {
                headers: {
                    'content-type': 'application/octet-stream',
                    /* An id is never reused for different bytes, so a reload
                       need not download a track twice. */
                    'cache-control': 'private, max-age=21600, immutable',
                    ...CORS,
                },
            });
        }

        if (!await this.keyMatches(req)) return text('upload key required', 403);

        if (req.method === 'DELETE' && part === null) {
            this.sql.exec('DELETE FROM blobs WHERE id = ?', id);
            return text('ok', 200);
        }

        if (req.method === 'PUT' && (part !== null || batch)) {
            let parts: ArrayBuffer[];
            const first = part ?? batch!.from;
            if (part !== null) {
                if (!data || data.byteLength === 0) return text('empty part', 400);
                if (data.byteLength > MAX_PART_BYTES) return text('part too large', 413);
                parts = [data];
            } else {
                const split = data ? unframe(data) : null;
                if (!split) return text('bad batch', 400);
                parts = split;
            }
            if (first + parts.length > MAX_PARTS) return text('too many parts', 413);

            const total = parts.reduce((n, p) => n + p.byteLength, 0);
            this.sql.exec('DELETE FROM blobs WHERE id = ? AND part >= ? AND part < ?', id, first, first + parts.length);
            if (!this.makeRoom(total, id)) return text('room storage full', 507);
            const now = Date.now();
            parts.forEach((p, i) => {
                this.sql.exec('INSERT INTO blobs (id, part, data, size, at) VALUES (?, ?, ?, ?, ?)',
                    id, first + i, p, p.byteLength, now);
            });
            await this.touch();
            return text('ok', 200);
        }

        return text('method not allowed', 405);
    }

    /** Frees space for `incoming` bytes, oldest files first, never touching
        the file being written. False when that still is not enough. */
    private makeRoom(incoming: number, keep: string): boolean {
        const used = () => this.sql.exec<{ n: number }>('SELECT COALESCE(SUM(size), 0) AS n FROM blobs').one().n;
        while (used() + incoming > ROOM_QUOTA_BYTES) {
            const oldest = this.sql.exec<{ id: string }>(
                'SELECT id FROM blobs WHERE id != ? GROUP BY id ORDER BY MAX(at) LIMIT 1', keep).toArray()[0];
            if (!oldest) return false;
            this.sql.exec('DELETE FROM blobs WHERE id = ?', oldest.id);
        }
        return true;
    }

    /** A file write is activity too: it keeps the room from its idle wipe. */
    private async touch(): Promise<void> {
        await this.rearm(Date.now());
    }
}

async function sha256Hex(s: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
