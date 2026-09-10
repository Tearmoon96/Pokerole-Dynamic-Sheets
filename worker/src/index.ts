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
   timeout, so a second heartbeat would only wake this object for nothing. */

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

const CORS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
};

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

        if (!url.pathname.startsWith('/room/')) {
            return new Response('not found', { status: 404, headers: CORS });
        }
        const addr = url.pathname.slice('/room/'.length);
        if (!ADDR_RE.test(addr)) {
            return new Response('bad room address', { status: 400, headers: CORS });
        }
        if (req.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected a websocket upgrade', { status: 426, headers: CORS });
        }

        return env.TABLE_ROOM.get(env.TABLE_ROOM.idFromName(addr)).fetch(req);
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

    async fetch(_req: Request): Promise<Response> {
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
    }
}
