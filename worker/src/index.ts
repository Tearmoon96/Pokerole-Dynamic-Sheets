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

function text(body: string, status: number): Response {
    return new Response(body, { status, headers: CORS });
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
        const [addr, ...rest] = url.pathname.slice('/room/'.length).split('/');
        if (!ADDR_RE.test(addr)) return text('bad room address', 400);

        /* The socket, as before. */
        if (rest.length === 0) {
            if (req.headers.get('Upgrade') !== 'websocket') return text('expected a websocket upgrade', 426);
            return env.TABLE_ROOM.get(env.TABLE_ROOM.idFromName(addr)).fetch(req);
        }

        /* The file store: `claim`, `blob/<id>` and `blob/<id>/<part>`. Shapes
           are checked here, before a Durable Object is woken for them. */
        const okShape = (rest.length === 1 && rest[0] === 'claim')
            || (rest[0] === 'blob' && rest.length >= 2 && rest.length <= 3 && BLOB_ID_RE.test(rest[1])
                && (rest.length === 2 || /^\d{1,2}$/.test(rest[2])));
        /* A body is always read to the end, here, before anything answers:
           a response sent over an unread upload makes the runtime fail
           reading it afterwards (and `wrangler dev` exits outright). The
           part limit keeps that read small. */
        let body: ArrayBuffer | null = null;
        if (req.method === 'PUT' || req.method === 'POST') {
            body = await req.arrayBuffer();
            if (body.byteLength > MAX_PART_BYTES) return text('part too large', 413);
        }
        if (!okShape) return text('not found', 404);

        return env.TABLE_ROOM.get(env.TABLE_ROOM.idFromName(addr)).fetch(
            body === null ? req : new Request(req.url, { method: req.method, headers: req.headers, body }));
    },
};

/** Per-socket bookkeeping. Kept on the socket itself so the room can hibernate
    between messages instead of holding memory open for an idle table. */
interface SocketMeta {
    /** Messages seen in the current window. */
    n: number;
    /** When the current window opened. */
    since: number;
}

export class TableRoom implements DurableObject {
    constructor(private state: DurableObjectState) {}

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

        await this.state.storage.setAlarm(Date.now() + IDLE_MS);

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

        await this.state.storage.setAlarm(now + IDLE_MS);
    }

    webSocketError(ws: WebSocket): void {
        try { ws.close(1011, 'socket error'); } catch { /* already gone */ }
    }

    async alarm(): Promise<void> {
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
        const data = req.method === 'PUT' || req.method === 'POST' ? await req.arrayBuffer() : null;
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

        const id = rest[1];
        const part = rest.length === 3 ? Number(rest[2]) : null;

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

        if (req.method === 'PUT' && part !== null) {
            if (part >= MAX_PARTS) return text('too many parts', 413);
            if (!data || data.byteLength === 0) return text('empty part', 400);
            if (data.byteLength > MAX_PART_BYTES) return text('part too large', 413);

            this.sql.exec('DELETE FROM blobs WHERE id = ? AND part = ?', id, part);
            if (!this.makeRoom(data.byteLength, id)) return text('room storage full', 507);
            this.sql.exec('INSERT INTO blobs (id, part, data, size, at) VALUES (?, ?, ?, ?, ?)',
                id, part, data, data.byteLength, Date.now());
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
        await this.state.storage.setAlarm(Date.now() + IDLE_MS);
    }
}

async function sha256Hex(s: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
