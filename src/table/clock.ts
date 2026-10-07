/* One clock for the whole table.

   Music only sounds together if every browser agrees on what time it is, and
   their own clocks can be seconds apart. So everyone measures the RELAY's
   clock instead — one Durable Object, one clock — the way NTP does: send a
   ping, note when it left and when the answer came back, and assume the relay
   read its clock halfway between. The error of one sample is at most half its
   round trip, so of the recent samples the one with the shortest round trip
   is the one believed.

   The relay answers the sender alone (worker/src/index.ts), so this costs the
   GM nothing however many players there are. */

import { CLOCK_PREFIX } from './transport';

/** Samples kept; the fastest round trip among them wins. */
const WINDOW = 8;
/** On connect: a quick burst, so music can start within a few seconds. */
const BURST = 5;
const BURST_GAP_MS = 400;
/** After that, often enough to follow a drifting clock and no more. */
const STEADY_MS = 30_000;
/** A ping with no answer by then is forgotten. */
const TIMEOUT_MS = 5000;

interface Sample { offset: number; rtt: number }

/** A monotonic local clock in epoch milliseconds. `Date.now()` can jump when
    the system clock is corrected; this cannot. */
export function localNow(): number {
    return performance.timeOrigin + performance.now();
}

export class ServerClock {
    private samples: Sample[] = [];
    private sent = new Map<number, number>();
    private n = 0;
    private timers: number[] = [];
    private steady: number | null = null;
    private listeners = new Set<() => void>();

    /** relay time − local time, in ms. */
    offset = 0;
    /** The round trip of the sample `offset` came from. */
    rtt = Infinity;

    constructor(private send: (frame: string) => boolean) {}

    get synced(): boolean {
        return this.samples.length > 0;
    }

    /** The table's time, in epoch milliseconds. */
    now(): number {
        return localNow() + this.offset;
    }

    onChange(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    }

    /** Called on every (re)connect. */
    start(): void {
        this.stop();
        for (let i = 0; i < BURST; i++) {
            this.timers.push(window.setTimeout(() => this.ping(), i * BURST_GAP_MS));
        }
        this.steady = window.setInterval(() => this.ping(), STEADY_MS);
    }

    stop(): void {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        if (this.steady !== null) clearInterval(this.steady);
        this.steady = null;
        this.sent.clear();
    }

    private ping(): void {
        const n = ++this.n;
        const at = localNow();
        if (!this.send(CLOCK_PREFIX + n)) return;
        this.sent.set(n, at);
        for (const [k, t] of this.sent) if (at - t > TIMEOUT_MS) this.sent.delete(k);
    }

    /** `\u0001t<n>:<relay ms>` */
    onFrame(text: string): void {
        const t1 = localNow();
        const m = /^\u0001t(\d{1,12}):(\d{1,16})$/.exec(text);
        if (!m) return;
        const t0 = this.sent.get(Number(m[1]));
        if (t0 === undefined) return;
        this.sent.delete(Number(m[1]));

        const rtt = t1 - t0;
        const offset = Number(m[2]) - (t0 + t1) / 2;
        this.samples = [...this.samples, { offset, rtt }].slice(-WINDOW);
        const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        this.offset = best.offset;
        this.rtt = best.rtt;
        this.listeners.forEach((l) => l());
    }
}
