/* Where a deck should be, at a given moment of the table's clock.

   Pure arithmetic, kept apart so a harness can check it without a browser. */

import type { ChannelState } from '../protocol';

export interface Position {
    /** Seconds into the track. */
    t: number;
    /** A scheduled start that has not come yet: hold at `pos`. */
    before: boolean;
    /** Past the end of a track that does not loop. */
    ended: boolean;
}

/** `dur` is the track's length in seconds, 0 when unknown — which only
    matters for wrapping a loop and for knowing a track has ended. */
export function positionAt(ch: ChannelState, dur: number, now: number): Position {
    if (!ch.playing) return { t: ch.pos, before: false, ended: dur > 0 && ch.pos >= dur };
    const elapsed = (now - ch.ref) / 1000;
    if (elapsed < 0) return { t: ch.pos, before: true, ended: false };
    let t = ch.pos + elapsed;
    if (dur > 0) {
        if (ch.loop) t %= dur;
        else if (t >= dur) return { t: dur, before: false, ended: true };
    }
    return { t, before: false, ended: false };
}

/** How far `actual` is from `expected`, in seconds, ahead positive. On a
    looping track the short way round counts: 0.1 s past the end and 0.1 s
    before the start are 0.2 s apart, not a whole track. */
export function driftOf(actual: number, expected: number, dur: number, loop: boolean): number {
    let d = actual - expected;
    if (loop && dur > 0) {
        d = ((d % dur) + dur) % dur;
        if (d > dur / 2) d -= dur;
    }
    return d;
}

/** The playback rate that closes a drift in a little over a second, never
    more than 5% off true: past that, pitch-corrected music starts to sound
    wrong. */
export function correctionRate(drift: number): number {
    return 1 - Math.max(-0.05, Math.min(0.05, drift / 1.2));
}

export function formatTime(s: number): string {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    if (m >= 60) return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    return m + ':' + String(r).padStart(2, '0');
}
