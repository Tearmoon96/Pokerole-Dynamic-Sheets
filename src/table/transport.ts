/* The socket, and getting it back when it goes.

   Deliberately knows nothing about the protocol: it moves strings, reports
   whether it is connected, and reconnects on its own. Everything about who may
   say what lives in session.ts, so that swapping this for a different relay
   would not move a single security decision. */

export type TransportStatus = 'offline' | 'connecting' | 'online';

export interface TransportHandlers {
    onMessage: (text: string) => void;
    onStatus: (status: TransportStatus, detail: string) => void;
}

/* A dropped GM must come back quickly enough that the table barely notices, but
   a relay that is down must not be hammered by every client at once. Start
   fast, back off to a quarter of a minute, and jitter so five browsers that
   dropped together do not retry in lockstep. */
const FIRST_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;
const GROWTH = 1.7;

export class RelayTransport {
    private ws: WebSocket | null = null;
    private timer: number | null = null;
    private delay = FIRST_DELAY_MS;
    private stopped = false;

    constructor(private url: string, private handlers: TransportHandlers) {}

    start(): void {
        this.stopped = false;
        this.open();
    }

    stop(): void {
        this.stopped = true;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const ws = this.ws;
        this.ws = null;
        if (ws) {
            /* Drop the handlers first: closing fires onclose, which would
               otherwise schedule a reconnect for a table we have left. */
            ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
            try { ws.close(1000, 'left the table'); } catch { /* already closing */ }
        }
        this.handlers.onStatus('offline', '');
    }

    get connected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /** Returns false when the socket is not open, so the caller can queue. */
    send(text: string): boolean {
        if (!this.connected) return false;
        try {
            this.ws!.send(text);
            return true;
        } catch {
            return false;
        }
    }

    private open(): void {
        if (this.stopped) return;
        this.handlers.onStatus('connecting', '');

        let ws: WebSocket;
        try {
            ws = new WebSocket(this.url);
        } catch {
            /* A malformed URL, or a mixed-content block. Retrying will not fix
               either, but the status line is more use than a thrown error. */
            this.handlers.onStatus('offline', 'The relay address is not usable.');
            return;
        }
        this.ws = ws;

        ws.onopen = () => {
            this.delay = FIRST_DELAY_MS;
            this.handlers.onStatus('online', '');
        };

        ws.onmessage = (ev) => {
            if (typeof ev.data === 'string') this.handlers.onMessage(ev.data);
        };

        ws.onerror = () => {
            /* Browsers deliberately give no detail here, so there is nothing to
               report that onclose will not report a moment later. */
        };

        ws.onclose = (ev) => {
            if (this.ws === ws) this.ws = null;
            if (this.stopped) return;

            /* The relay closes with 1008 for a rate limit and 1009 for an
               oversized frame. Both mean this client did something wrong, and
               reconnecting into the same behaviour would just do it again. */
            if (ev.code === 1008 || ev.code === 1009 || ev.code === 1003) {
                this.stopped = true;
                this.handlers.onStatus('offline', 'The relay closed this connection: '
                    + (ev.reason || 'policy violation') + '.');
                return;
            }

            this.handlers.onStatus('offline', ev.code === 1006 ? '' : ev.reason || '');
            this.scheduleRetry();
        };
    }

    private scheduleRetry(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        const jitter = 0.75 + Math.random() * 0.5;
        const wait = Math.round(this.delay * jitter);
        this.delay = Math.min(MAX_DELAY_MS, this.delay * GROWTH);
        this.timer = window.setTimeout(() => {
            this.timer = null;
            this.open();
        }, wait);
    }
}
