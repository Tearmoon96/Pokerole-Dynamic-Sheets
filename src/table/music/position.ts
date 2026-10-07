/* Where a deck should be, at a given moment of the table's clock.

   Pure arithmetic, kept apart so a harness can check it without a browser. */

import type { ChannelState, Fade } from '../protocol';

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

/* Fades. The volume follows a square law rather than a straight line: the
   ear hears loudness roughly logarithmically, so a linear sweep seems to do
   nothing for most of its length and then drop away at the end. */

function fadeProgress(f: Fade, now: number): number {
    return Math.max(0, Math.min(1, (now - f.at) / f.ms));
}

/** 0..1, the share of the deck's volume a fade lets through at `now`. */
export function fadeGain(f: Fade | null, now: number): number {
    if (!f) return 1;
    const t = fadeProgress(f, now);
    return f.dir === 'in' ? t * t : (1 - t) * (1 - t);
}

/** The fade is under way: the volume is still moving. */
export function fadeActive(f: Fade | null, now: number): boolean {
    return !!f && now < f.at + f.ms;
}

/** A fade-out has run its course: the deck is silent and should be still. */
export function fadedOut(f: Fade | null, now: number): boolean {
    return !!f && f.dir === 'out' && now >= f.at + f.ms;
}

/** Where a new fade has to have begun for it to pick up at `gain` — so
    stopping halfway through a fade-in fades out from where the sound is,
    rather than jumping to full volume first. */
export function fadeStartFor(dir: 'in' | 'out', gain: number, ms: number, from: number): number {
    const g = Math.sqrt(Math.max(0, Math.min(1, gain)));
    const t = dir === 'in' ? g : 1 - g;
    return Math.round(from - t * ms);
}

export function formatTime(s: number): string {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    if (m >= 60) return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    return m + ':' + String(r).padStart(2, '0');
}
