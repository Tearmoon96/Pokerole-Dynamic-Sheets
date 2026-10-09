/* Music at the table: the GM's library, two decks, and everyone in time.

   How it stays in sync. The GM never streams sound. Every browser holds its
   own copy of each track — files are downloaded ahead of time, YouTube links
   load in each player's own YouTube box — and the GM publishes only what each
   deck is doing: which track, playing or not, and "at table-clock time `ref`
   it was `pos` seconds in" (protocol.ts `ChannelState`). Every browser,
   the GM's included, works out from the shared clock (clock.ts) where the
   track should be at this instant and steers its own player there:

   - more than SEEK_FILE_S out (a YouTube box: SEEK_YT_S) → jump;
   - a little out → play up to 5% faster or slower until it is back, which is
     inaudible where a jump would click;
   - a start is scheduled LEAD_MS ahead, so everyone begins on the same beat
     instead of each as their message lands.

   The ready check. Before a deck starts, the GM's page looks at what every
   player last reported (`mstat`): downloaded, sound enabled, nothing failed.
   If anyone is not ready the GM sees who and why, and either waits — the deck
   starts by itself the moment they all are — or starts anyway. A player who
   catches up later comes in at the right place on their own.

   Headphones that lag — Bluetooth ones by 150-250 ms — need nothing extra. A
   media element's currentTime is the moment reaching the speaker: the browser
   counts the output's own delay into the media clock. So steering currentTime
   onto the table clock already puts what each person HEARS in time, whatever
   they listen through.

   Titles stay with the GM unless they reveal one (`reveal` on a library
   entry): a hidden track goes out with an empty title, so the name never
   reaches a player's browser at all. */

import { MissingFileError } from '../blobs';
import { LIMITS } from '../protocol';
import type { Body, ChannelId, ChannelState, TrackLoad, WireFile, WireTrack } from '../protocol';
import { CHANNELS, randomId } from '../protocol';
import type { TableApi } from '../link';
import { cleanText } from '../validate';
import { FileOutput, YtOutput, loadYouTube, parseYouTube, youTubeReady } from './outputs';
import type { Output } from './outputs';
import { correctionRate, driftOf, fadeActive, fadeGain, fadeStartFor, fadedOut, positionAt } from './position';
import { loadDecks, loadLibrary, loadUploads, saveDecks, saveLibrary, saveUploads } from './library';
import type { LibEntry } from './library';

/** How far ahead a start is scheduled, so every browser has the message
    before the moment it names. */
export const LEAD_MS = 1200;
const TICK_MS = 250;
const HEARTBEAT_MS = 5000;
const STAT_MS = 5000;
/** Past this, jump; under it, nudge the rate. */
const SEEK_FILE_S = 0.25;
const SEEK_YT_S = 0.6;
/** Close enough: back to normal speed. */
const IN_SYNC_S = 0.012;
/** After a jump or a start, the player's clock needs a moment to settle. */
const SETTLE_MS = 600;
/** A player report older than this counts as no report. */
const STAT_STALE_MS = 20_000;
/** A file the relay did not have is asked for again after this. */
const RETRY_MS = 10_000;
const VERIFY_MS = 10 * 60_000;

/* Fades: in a touch longer than out, so a scene settles in and an ambience
   slips away. The lead gives the message time to land before the volume
   starts to move; FADER_MS is how often the volume steps while it does. */
const FADE_IN_MS = 3500;
const FADE_OUT_MS = 2500;
const FADE_LEAD_MS = 250;
const FADER_MS = 40;

const MIX_KEY = 'pokerole_table_mix';
const FADE_KEY = 'pokerole_table_fade';
const ACCEPTED_AUDIO = /^(audio\/|video\/(mp4|webm|ogg))/;

export type TrackState = 'queued' | 'loading' | 'ready' | 'failed';

export interface TrackStatus {
    state: TrackState;
    pct: number;
    error: string;
}

export interface MemberMusic {
    unlocked: boolean;
    ready: string[];
    loading: TrackLoad[];
    drift: { bg: number | null; scene: number | null };
    stall: ChannelId[];
    failed: string[];
    at: number;
}

/** A track as the GM's panel lists it. */
export interface GmTrack {
    id: string;
    title: string;
    kind: 'file' | 'yt';
    yt?: string;
    dur: number;
    /** Players see the title. */
    reveal: boolean;
    size: number;
    /** 0..1 while it is going up to the relay. */
    upload: number | null;
    uploadError: string;
    /** Players can have it: uploaded, or a YouTube link. */
    onTable: boolean;
}

/** This browser's own volume, never sent. */
export interface LocalMix {
    master: number;
    bg: number;
    scene: number;
    muted: boolean;
}

/** Someone who is not ready for a track, and why. */
export interface Blocker {
    id: string;
    name: string;
    why: string;
}

export interface MusicView {
    library: WireTrack[];
    gm: GmTrack[];
    decks: Record<ChannelId, ChannelState>;
    rev: number;
    unlocked: boolean;
    mix: LocalMix;
    tracks: Record<string, TrackStatus>;
    drift: Record<ChannelId, number | null>;
    stall: ChannelId[];
    errors: Record<ChannelId, string>;
    members: Record<string, MemberMusic>;
    waiting: Record<ChannelId, boolean>;
    /** GM: this deck fades in on Play and out on Pause or Stop. */
    fadeOn: Record<ChannelId, boolean>;
    busy: string;
}

export function silentDeck(): ChannelState {
    return { track: null, playing: false, pos: 0, ref: 0, loop: true, vol: 1, fade: null };
}

function loadFadeOn(): Record<ChannelId, boolean> {
    try {
        const raw = JSON.parse(localStorage.getItem(FADE_KEY) || 'null');
        return { bg: raw?.bg === true, scene: raw?.scene === true };
    } catch {
        return { bg: false, scene: false };
    }
}

function loadMix(): LocalMix {
    const base: LocalMix = { master: 0.8, bg: 1, scene: 1, muted: false };
    try {
        const raw = JSON.parse(localStorage.getItem(MIX_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return base;
        const unit = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
        return {
            master: unit(raw.master, base.master),
            bg: unit(raw.bg, 1),
            scene: unit(raw.scene, 1),
            muted: raw.muted === true,
        };
    } catch {
        return base;
    }
}

export function emptyMusicView(): MusicView {
    return {
        library: [], gm: [],
        decks: { bg: silentDeck(), scene: silentDeck() },
        rev: 0,
        unlocked: typeof navigator !== 'undefined' && !!navigator.userActivation?.hasBeenActive,
        mix: loadMix(),
        tracks: {},
        drift: { bg: null, scene: null },
        stall: [],
        errors: { bg: '', scene: '' },
        members: {},
        waiting: { bg: false, scene: false },
        fadeOn: loadFadeOn(),
        busy: '',
    };
}

class Deck {
    file: FileOutput | null = null;
    yt: YtOutput | null = null;
    settleUntil = 0;
    startTimer: number | null = null;
    drift: number | null = null;
    stall = false;
    /** How late this player starts sounding after it is told to start or
        jump, learnt from the last few. Every jump aims that far ahead. */
    lag: Record<'file' | 'yt', number> = { file: 0.05, yt: 0.25 };
    /** The next reading is the first after a jump: it teaches `lag`. */
    afterJump = false;
    /** The last few readings. A player's clock jitters by tens of ms from one
        reading to the next; the median is what is steered by. */
    recent: number[] = [];

    jumped(): void {
        this.afterJump = true;
        this.recent = [];
        this.settleUntil = performance.now() + SETTLE_MS;
    }

    constructor(readonly id: ChannelId) {}

    output(kind: 'file' | 'yt'): Output {
        if (kind === 'file') {
            this.yt?.unload();
            return (this.file ??= new FileOutput());
        }
        this.file?.unload();
        return (this.yt ??= new YtOutput(this.id === 'bg' ? 'Background' : 'Scene'));
    }

    silence(): void {
        this.file?.unload();
        this.yt?.unload();
        this.drift = null;
        this.stall = false;
    }

    destroy(): void {
        if (this.startTimer !== null) clearTimeout(this.startTimer);
        this.file?.destroy();
        this.yt?.destroy();
        this.file = this.yt = null;
    }
}

/** Reads an audio file's length, and whether this browser can play it at all.

    Only a decoding error rejects. A tab in the background may not load media
    metadata until it is shown again, so a probe that simply hears nothing is
    "length not known yet" (0) — the deck learns it once it plays — never
    "cannot play". */
function probe(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const a = new Audio();
        a.preload = 'metadata';
        const done = (ok: boolean, d: number) => {
            clearTimeout(timer);
            a.onloadedmetadata = a.onerror = null;
            a.removeAttribute('src');
            a.load();
            if (ok) resolve(Number.isFinite(d) ? d : 0);
            else reject(new Error('This browser cannot play that file.'));
        };
        const timer = window.setTimeout(() => done(true, 0), 8000);
        a.onloadedmetadata = () => done(true, a.duration);
        a.onerror = () => done(false, 0);
        a.src = url;
    });
}

/** YouTube's public oEmbed answers with a video's title. Best effort. */
async function youTubeTitle(id: string): Promise<string> {
    try {
        const res = await fetch('https://www.youtube.com/oembed?format=json&url='
            + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
        if (!res.ok) return '';
        const body = await res.json() as { title?: unknown };
        return cleanText(body.title, LIMITS.MAX_TITLE);
    } catch {
        return '';
    }
}

export class MusicController {
    view: MusicView = emptyMusicView();

    private host = false;
    private lobby = '';
    private decks: Record<ChannelId, Deck> = { bg: new Deck('bg'), scene: new Deck('scene') };
    /** trackId → the object URL of its audio, and which relay file it came from. */
    private sources = new Map<string, { url: string; file: string }>();
    private ticker: number | null = null;
    private beat: number | null = null;
    private verifier: number | null = null;
    private lastStat = '';
    private lastStatAt = 0;
    private statTimer: number | null = null;
    private viewDriftAt = 0;
    private volumeTimer: number | null = null;
    private retryAt = new Map<string, number>();
    private fetching = false;
    private fetchAbort: AbortController | null = null;

    /* GM only. */
    private entries: LibEntry[] = [];
    private uploads: Record<string, WireFile> = {};
    private uploading = new Map<string, number>();
    private uploadErrors = new Map<string, string>();
    private pumping = false;

    private onGesture = () => this.unlock();
    /** Bumped by every begin and end, so a begin still awaiting the
        library when the table is left does not carry on afterwards. */
    private generation = 0;

    constructor(private api: TableApi) {}

    private set(patch: Partial<MusicView>): void {
        this.view = { ...this.view, ...patch };
        this.api.changed();
    }

    /* ---------------------------------------------------------- lifecycle */

    async begin(isHost: boolean, lobbyId: string): Promise<void> {
        this.end();
        const gen = this.generation;
        this.host = isHost;
        this.lobby = lobbyId;
        this.view = emptyMusicView();

        document.addEventListener('pointerdown', this.onGesture, true);
        document.addEventListener('keydown', this.onGesture, true);
        this.ticker = window.setInterval(() => this.tick(), TICK_MS);

        if (isHost) {
            const entries = await loadLibrary();
            const uploads = await loadUploads(lobbyId);
            const saved = await loadDecks(lobbyId);
            if (gen !== this.generation) return;
            this.entries = entries;
            this.uploads = uploads;
            for (const e of this.entries) {
                if (e.kind === 'file' && e.blob) this.sources.set(e.id, { url: URL.createObjectURL(e.blob), file: 'local' });
            }
            /* Forget decks that point at tracks no longer in the library. */
            const known = (d: ChannelState): ChannelState => (d.track && !this.entries.some((e) => e.id === d.track)
                ? silentDeck() : { ...silentDeck(), ...d, fade: d.fade ?? null });
            if (saved) {
                /* One track on both decks, saved before a track could only be
                   on one: it stays the Background. */
                const bg = known(saved.bg);
                const scene = saved.scene.track && saved.scene.track === bg.track
                    ? { ...silentDeck(), loop: saved.scene.loop, vol: saved.scene.vol } : known(saved.scene);
                this.view = { ...this.view, rev: saved.rev, decks: { bg, scene } };
            }
            this.refreshGm();
            if (this.entries.some((e) => e.kind === 'yt')) void loadYouTube().catch(() => {});
            this.beat = window.setInterval(() => { if (this.hasMusic()) this.announceDecks(false); }, HEARTBEAT_MS);
            this.verifier = window.setInterval(() => { void this.verifyUploads(); }, VERIFY_MS);
            void this.verifyUploads();
        } else {
            this.beat = window.setInterval(() => this.sendStat(true), STAT_MS);
        }
    }

    end(): void {
        this.generation++;
        document.removeEventListener('pointerdown', this.onGesture, true);
        document.removeEventListener('keydown', this.onGesture, true);
        for (const t of [this.ticker, this.beat, this.verifier, this.fader]) if (t !== null) clearInterval(t);
        this.ticker = this.beat = this.verifier = this.fader = null;
        if (this.statTimer !== null) clearTimeout(this.statTimer);
        if (this.libraryTimer !== null) clearTimeout(this.libraryTimer);
        this.libraryTimer = null;
        if (this.volumeTimer !== null) clearTimeout(this.volumeTimer);
        this.statTimer = this.volumeTimer = null;
        this.fetchAbort?.abort();
        this.fetchAbort = null;
        this.fetching = false;
        for (const d of CHANNELS) this.decks[d].destroy();
        this.decks = { bg: new Deck('bg'), scene: new Deck('scene') };
        for (const s of this.sources.values()) URL.revokeObjectURL(s.url);
        this.sources.clear();
        this.retryAt.clear();
        this.entries = [];
        this.uploads = {};
        this.uploading.clear();
        this.uploadErrors.clear();
        this.lastStat = '';
        this.view = emptyMusicView();
    }

    private hasMusic(): boolean {
        return CHANNELS.some((c) => this.view.decks[c].track !== null);
    }

    /* ------------------------------------------------- the sound, locally */

    /** Any click or key on the page: the browser now lets it play sound. */
    unlock(): void {
        if (this.view.unlocked) return;
        this.set({ unlocked: true });
        /* Inside the gesture itself, so a deck that should be playing starts
           now rather than at the next tick. */
        this.reconcileAll();
        this.queueStat();
    }

    setMix(patch: Partial<LocalMix>): void {
        const mix = { ...this.view.mix, ...patch };
        try { localStorage.setItem(MIX_KEY, JSON.stringify(mix)); } catch { /* private mode */ }
        this.set({ mix });
        this.reconcileAll();
    }

    private trackOf(id: string | null): WireTrack | LibEntry | null {
        if (!id) return null;
        if (this.host) return this.entries.find((e) => e.id === id) ?? null;
        return this.view.library.find((t) => t.id === id) ?? null;
    }

    /** The length the table knows, or what the player found out. */
    durationOf(ch: ChannelId): number {
        const t = this.trackOf(this.view.decks[ch].track);
        const d = this.decks[ch];
        const out = t?.kind === 'yt' ? d.yt : d.file;
        return (t?.dur || 0) || out?.duration || 0;
    }

    /** Where a deck is now, for the panel's seek bar. */
    positionOf(ch: ChannelId): { t: number; dur: number; ended: boolean; before: boolean } {
        const dur = this.durationOf(ch);
        const p = positionAt(this.view.decks[ch], dur, this.api.clock.now());
        return { ...p, dur };
    }

    private tick(): void {
        if (this.host && this.api.clock.synced) this.finishFades();
        this.reconcileAll();
        const now = Date.now();
        if (now - this.viewDriftAt > 1000) {
            this.viewDriftAt = now;
            const drift = { bg: this.decks.bg.drift, scene: this.decks.scene.drift };
            const stall = CHANNELS.filter((c) => this.decks[c].stall);
            const errors = {
                bg: this.outputError('bg'),
                scene: this.outputError('scene'),
            };
            const v = this.view;
            if (JSON.stringify([v.drift, v.stall, v.errors]) !== JSON.stringify([drift, stall, errors])) {
                this.set({ drift, stall, errors });
                this.queueStat();
            }
            if (this.host) {
                this.checkWaiting();
                this.learnDurations();
            }
        }
    }

    private outputError(ch: ChannelId): string {
        const t = this.trackOf(this.view.decks[ch].track);
        if (!t) return '';
        const d = this.decks[ch];
        return (t.kind === 'yt' ? d.yt?.error : d.file?.error) || '';
    }

    private reconcileAll(): void {
        if (!this.api.clock.synced) return;
        const now = this.api.clock.now();
        for (const c of CHANNELS) this.reconcile(c, now);
        this.keepFading(now);
    }

    /** What this browser plays a deck at: the GM's mix, this person's own,
        and any fade under way. */
    private volumeOf(ch: ChannelId, now: number): number {
        const st = this.view.decks[ch];
        const mix = this.view.mix;
        return mix.muted ? 0 : st.vol * mix[ch] * mix.master * fadeGain(st.fade, now);
    }

    private fader: number | null = null;

    /* The 250 ms tick is too coarse for a fade — the volume would audibly
       step — so while one runs, the volume alone is updated far more often. */
    private keepFading(now: number): void {
        const active = CHANNELS.some((c) => this.view.decks[c].playing && fadeActive(this.view.decks[c].fade, now));
        if (active && this.fader === null) this.fader = window.setInterval(() => this.applyVolumes(), FADER_MS);
        else if (!active && this.fader !== null) { clearInterval(this.fader); this.fader = null; }
    }

    private applyVolumes(): void {
        if (!this.api.clock.synced) return;
        const now = this.api.clock.now();
        for (const c of CHANNELS) {
            const t = this.trackOf(this.view.decks[c].track);
            const out = t?.kind === 'yt' ? this.decks[c].yt : t ? this.decks[c].file : null;
            out?.setVolume(this.volumeOf(c, now));
        }
        this.keepFading(now);
    }

    /** Steers one deck to where the table says it should be. */
    private reconcile(ch: ChannelId, now: number): void {
        const deck = this.decks[ch];
        const st = this.view.decks[ch];
        const track = this.trackOf(st.track);
        if (!track) { deck.silence(); return; }

        const out = deck.output(track.kind);
        if (track.kind === 'file') {
            const src = this.sources.get(track.id);
            if (!src) {
                out.pause();
                deck.drift = null;
                deck.stall = st.playing;
                return;
            }
            out.load(src.url);
        } else {
            out.load(track.yt!);
        }

        out.setLoop(st.loop);
        out.setVolume(this.volumeOf(ch, now));

        const dur = (track.dur || 0) || out.duration;
        const p = positionAt(st, dur, now);

        /* A fade-out that has run its course is as good as paused, here and
           now, whether or not the GM's word that it is has arrived yet. */
        if (!st.playing || p.ended || fadedOut(st.fade, now)) {
            out.pause();
            out.setRate(1);
            /* Only a file is parked at the paused spot: YouTube starts playing
               when told to seek from a cued state. */
            if (!st.playing && out.kind === 'file' && out.ready && Math.abs(out.time() - st.pos) > 0.5) out.seek(st.pos);
            deck.drift = null;
            deck.stall = false;
            return;
        }

        if (p.before) {
            out.pause();
            if (out.kind === 'file' && out.ready && Math.abs(out.time() - st.pos) > 0.05) out.seek(st.pos);
            /* Wake exactly when the start is due rather than up to a tick late. */
            if (deck.startTimer === null) {
                const wait = Math.max(0, st.ref - now);
                deck.startTimer = window.setTimeout(() => {
                    deck.startTimer = null;
                    this.reconcile(ch, this.api.clock.now());
                }, wait);
            }
            deck.drift = null;
            deck.stall = false;
            return;
        }

        if (!this.view.unlocked) { deck.stall = true; deck.drift = null; return; }

        if (out.paused) {
            if (track.kind === 'yt' && !out.ready) { deck.stall = true; return; }
            out.seek(p.t + deck.lag[track.kind]);
            out.setRate(1);
            out.play().catch((e: unknown) => {
                if (e instanceof DOMException && e.name === 'NotAllowedError') this.set({ unlocked: false });
            });
            deck.jumped();
            deck.stall = false;
            return;
        }

        deck.stall = track.kind === 'yt' && !out.ready && out.seeking;
        if (out.seeking || performance.now() < deck.settleUntil) return;

        const d = driftOf(out.time(), p.t, dur, st.loop);
        /* A reading that triggers a jump is not reported: it describes the
           moment before the fix, and would flash a player amber on the GM's
           list for nothing. */
        if (!out.fineRate) deck.drift = Math.round(d * 1000);

        /* The first reading after a jump says how late this player really
           starts; aim the next jump that much further ahead. */
        if (deck.afterJump) {
            deck.afterJump = false;
            if (Math.abs(d) < 0.4) {
                deck.lag[track.kind] = Math.max(0, Math.min(0.6, deck.lag[track.kind] - d * 0.8));
            }
        }

        const limit = out.fineRate ? SEEK_FILE_S : SEEK_YT_S;
        /* Just round a loop point the player restarts a beat late. Jumping
           there is not heard — the track has only just begun again — and
           nudging the rate would take seconds to close it. */
        const justLooped = st.loop && p.t < 1.5 && out.fineRate && Math.abs(d) > IN_SYNC_S * 3;
        if (Math.abs(d) > limit || justLooped) {
            out.seek(p.t + deck.lag[track.kind]);
            out.setRate(1);
            deck.jumped();
            return;
        }
        if (!out.fineRate) return;

        deck.recent = [...deck.recent, d].slice(-5);
        const sorted = [...deck.recent].sort((a, b) => a - b);
        const m = sorted[Math.floor(sorted.length / 2)];
        deck.drift = Math.round(m * 1000);
        if (Math.abs(m) > IN_SYNC_S * 2) out.setRate(correctionRate(m));
        else if (Math.abs(m) < IN_SYNC_S) out.setRate(1);
    }

    /** Where each deck's player actually is against where the table says it
        should be, read at one instant. For the local test harnesses. */
    probe(): Record<ChannelId, { time: number; expected: number; paused: boolean; rate: number; volume: number; kind: string }> {
        const now = this.api.clock.now();
        const one = (ch: ChannelId) => {
            const st = this.view.decks[ch];
            const t = this.trackOf(st.track);
            const out = t?.kind === 'yt' ? this.decks[ch].yt : this.decks[ch].file;
            const dur = (t?.dur || 0) || out?.duration || 0;
            return {
                time: out ? out.time() : -1,
                expected: positionAt(st, dur, now).t,
                paused: out ? out.paused : true,
                rate: out instanceof FileOutput ? out.rateNow : 1,
                volume: out instanceof FileOutput ? out.volumeNow : -1,
                kind: t?.kind ?? '',
            };
        };
        return { bg: one('bg'), scene: one('scene') };
    }

    /* ------------------------------------------------------------ players */

    onLibrary(tracks: WireTrack[]): void {
        if (this.host) return;
        const ids = new Set(tracks.map((t) => t.id));
        for (const [id, s] of this.sources) {
            const t = tracks.find((x) => x.id === id);
            if (!ids.has(id) || !t || t.kind !== 'file' || t.file?.id !== s.file) {
                URL.revokeObjectURL(s.url);
                this.sources.delete(id);
            }
        }
        const statuses: Record<string, TrackStatus> = {};
        for (const t of tracks) {
            if (t.kind !== 'file') continue;
            const old = this.view.tracks[t.id];
            const have = this.sources.get(t.id);
            statuses[t.id] = have ? { state: 'ready', pct: 100, error: '' }
                : old && old.state !== 'ready' ? old : { state: 'queued', pct: 0, error: '' };
        }
        this.set({ library: tracks, tracks: statuses });
        if (tracks.some((t) => t.kind === 'yt')) void loadYouTube().then(() => this.queueStat(), () => {});
        void this.prefetch();
        this.queueStat();
    }

    onMusic(body: Extract<Body, { k: 'music' }>): void {
        if (this.host || body.rev < this.view.rev) return;
        for (const c of CHANNELS) {
            const deck = this.decks[c];
            if (deck.startTimer !== null && body[c].ref !== this.view.decks[c].ref) {
                clearTimeout(deck.startTimer);
                deck.startTimer = null;
            }
        }
        this.set({ rev: body.rev, decks: { bg: body.bg, scene: body.scene } });
        this.reconcileAll();
        void this.prefetch();
    }

    /** Downloads the library one file at a time, the decks' tracks first. */
    private async prefetch(): Promise<void> {
        if (this.fetching || this.host) return;
        const files = this.api.files();
        if (!files) return;
        this.fetching = true;
        try {
            for (;;) {
                const lib = this.view.library;
                const onDeck = new Set(CHANNELS.map((c) => this.view.decks[c].track));
                const wanted = lib
                    .filter((t) => t.kind === 'file' && t.file && !this.sources.has(t.id))
                    .filter((t) => {
                        const st = this.view.tracks[t.id];
                        if (!st || st.state !== 'failed') return true;
                        return (this.retryAt.get(t.id) ?? Infinity) <= Date.now();
                    })
                    .sort((a, b) => Number(onDeck.has(b.id)) - Number(onDeck.has(a.id)));
                const next = wanted[0];
                if (!next || !next.file) break;
                await this.fetchTrack(next, next.file);
                if (!this.fetchAbort) break;
            }
        } finally {
            this.fetching = false;
        }
        /* Something failed for a while: look again when its retry is due. */
        const due = [...this.retryAt.values()].filter((t) => t > Date.now());
        if (due.length) window.setTimeout(() => { void this.prefetch(); }, Math.min(...due) - Date.now() + 50);
    }

    private async fetchTrack(t: WireTrack, file: WireFile): Promise<void> {
        const files = this.api.files();
        if (!files) return;
        const abort = new AbortController();
        this.fetchAbort = abort;
        const status = (s: TrackStatus) => this.set({ tracks: { ...this.view.tracks, [t.id]: s } });
        status({ state: 'loading', pct: 0, error: '' });
        let lastPct = -1;
        try {
            const blob = await files.download(file, (f) => {
                const pct = Math.floor(f * 100);
                if (pct !== lastPct) {
                    lastPct = pct;
                    status({ state: 'loading', pct, error: '' });
                    if (pct % 10 === 0) this.queueStat();
                }
            }, abort.signal);
            /* The library may have moved on while it downloaded. */
            const still = this.view.library.find((x) => x.id === t.id);
            if (!still || still.file?.id !== file.id) return;
            const url = URL.createObjectURL(blob);
            try {
                await probe(url);
            } catch (e) {
                URL.revokeObjectURL(url);
                throw e;
            }
            this.sources.set(t.id, { url, file: file.id });
            this.retryAt.delete(t.id);
            status({ state: 'ready', pct: 100, error: '' });
            this.reconcileAll();
        } catch (e) {
            if (abort.signal.aborted) return;
            const gone = e instanceof MissingFileError;
            this.retryAt.set(t.id, Date.now() + RETRY_MS);
            status({
                state: 'failed', pct: 0,
                error: gone ? 'Waiting for the GM to send it again' : (e instanceof Error ? e.message : 'Download failed'),
            });
        } finally {
            this.queueStat();
        }
    }

    /** What this player can play, for the GM's ready check. */
    private stat(): Extract<Body, { k: 'mstat' }> {
        const ready: string[] = [];
        const loading: TrackLoad[] = [];
        const failed: string[] = [];
        for (const t of this.view.library) {
            if (t.kind === 'yt') {
                if (youTubeReady()) ready.push(t.id);
                continue;
            }
            const st = this.view.tracks[t.id];
            if (this.sources.has(t.id)) ready.push(t.id);
            else if (st?.state === 'loading') loading.push({ id: t.id, pct: Math.max(0, Math.min(100, st.pct)) });
            else if (st?.state === 'failed') failed.push(t.id);
        }
        if (this.extraFailed && failed.length < LIMITS.MAX_TRACKS) failed.push(this.extraFailed);
        return {
            k: 'mstat',
            unlocked: this.view.unlocked,
            ready: ready.slice(0, LIMITS.MAX_TRACKS),
            loading: loading.slice(0, LIMITS.MAX_TRACKS),
            drift: { bg: this.decks.bg.drift, scene: this.decks.scene.drift },
            stall: CHANNELS.filter((c) => this.decks[c].stall),
            failed: failed.slice(0, LIMITS.MAX_TRACKS),
        };
    }

    /** A file the map could not fetch, reported alongside the tracks so the
        GM's page sends it again. */
    private extraFailed = '';

    reportMissing(fileId: string): void {
        if (this.extraFailed === fileId) return;
        this.extraFailed = fileId;
        this.queueStat();
    }

    private queueStat(): void {
        if (this.host || this.statTimer !== null) return;
        this.statTimer = window.setTimeout(() => {
            this.statTimer = null;
            this.sendStat(false);
        }, 1000);
    }

    private sendStat(force: boolean): void {
        if (this.host) return;
        const body = this.stat();
        /* The drift moves every report; only the rest decides "changed". */
        const key = JSON.stringify({ ...body, drift: null });
        if (!force && key === this.lastStat && Date.now() - this.lastStatAt < STAT_MS) return;
        this.lastStat = key;
        this.lastStatAt = Date.now();
        void this.api.publish(body);
    }

    /** Sent on (re)connect, so the GM hears about this player at once. */
    hello(): void {
        if (!this.host) this.sendStat(true);
    }

    /* ---------------------------------------------------------------- GM */

    onStat(from: string, body: Extract<Body, { k: 'mstat' }>): void {
        if (!this.host) return;
        const { k: _k, ...rest } = body;
        this.set({ members: { ...this.view.members, [from]: { ...rest, at: Date.now() } } });
        /* A player could not fetch a track: the relay may have dropped it. */
        const lost = body.failed.filter((id) => this.uploads[id]);
        if (lost.length) void this.verifyUploads(lost);
    }

    forget(memberId: string): void {
        if (!this.view.members[memberId]) return;
        const members = { ...this.view.members };
        delete members[memberId];
        this.set({ members });
    }

    /** A player who just joined gets the library and the decks. */
    greet(): void {
        if (!this.host) return;
        this.announceLibrary();
        this.announceDecks(false);
    }

    private wireTracks(): WireTrack[] {
        const out: WireTrack[] = [];
        for (const e of this.entries) {
            const title = e.reveal ? e.title : '';
            if (e.kind === 'yt' && e.yt) out.push({ id: e.id, title, kind: 'yt', yt: e.yt, dur: e.dur });
            else if (e.kind === 'file' && this.uploads[e.id]) {
                out.push({ id: e.id, title, kind: 'file', file: this.uploads[e.id], dur: e.dur });
            }
        }
        return out.slice(0, LIMITS.MAX_TRACKS);
    }

    private libraryTimer: number | null = null;

    /** Coalesced: forty uploads finishing in a row are one announcement. */
    private announceLibrary(): void {
        if (!this.host || this.libraryTimer !== null) return;
        this.libraryTimer = window.setTimeout(() => {
            this.libraryTimer = null;
            if (this.host) void this.api.publish({ k: 'library', tracks: this.wireTracks() });
        }, 400);
    }

    private announceDecks(bump: boolean): void {
        if (!this.host) return;
        const v = this.view;
        if (bump) {
            const rev = Math.max(v.rev + 1, Math.round(this.api.clock.now()));
            this.view = { ...this.view, rev };
            void saveDecks(this.lobby, { rev, bg: v.decks.bg, scene: v.decks.scene });
        }
        void this.api.publish({ k: 'music', rev: this.view.rev, bg: this.view.decks.bg, scene: this.view.decks.scene });
    }

    private refreshGm(): void {
        const gm: GmTrack[] = this.entries.map((e) => ({
            id: e.id, title: e.title, kind: e.kind, yt: e.yt, dur: e.dur, reveal: e.reveal === true,
            size: e.blob?.size ?? 0,
            upload: this.uploading.get(e.id) ?? null,
            uploadError: this.uploadErrors.get(e.id) ?? '',
            onTable: e.kind === 'yt' || !!this.uploads[e.id],
        }));
        this.set({ gm, library: this.wireTracks() });
    }

    private persistLibrary(): void {
        void saveLibrary(this.entries);
    }

    /** Sends every file track the relay does not have yet, one at a time. */
    private async pumpUploads(): Promise<void> {
        if (this.pumping || !this.host) return;
        const files = this.api.files();
        if (!files) return;
        this.pumping = true;
        try {
            for (;;) {
                const next = this.entries.find((e) => e.kind === 'file' && e.blob && !this.uploads[e.id]
                    && !this.uploadErrors.has(e.id));
                if (!next || !next.blob) break;
                this.uploading.set(next.id, 0);
                this.refreshGm();
                let last = 0;
                try {
                    const ref = await files.upload(next.blob, (f) => {
                        this.uploading.set(next.id, f);
                        if (f - last >= 0.05 || f === 1) { last = f; this.refreshGm(); }
                    });
                    if (!this.entries.some((e) => e.id === next.id)) { void files.remove(ref.id); continue; }
                    this.uploads = { ...this.uploads, [next.id]: ref };
                    void saveUploads(this.lobby, this.uploads);
                } catch (e) {
                    this.uploadErrors.set(next.id, e instanceof Error ? e.message : 'Upload failed.');
                } finally {
                    this.uploading.delete(next.id);
                    this.refreshGm();
                    this.announceLibrary();
                }
            }
        } finally {
            this.pumping = false;
        }
    }

    /** Checks the relay still has the files the table was told about, and
        sends again any it lost. `only` limits it to those tracks. */
    private async verifyUploads(only?: string[]): Promise<void> {
        const files = this.api.files();
        if (!this.host || !files) return;
        let changed = false;
        for (const [id, ref] of Object.entries(this.uploads)) {
            if (only && !only.includes(id)) continue;
            if (!this.entries.some((e) => e.id === id)) {
                delete this.uploads[id];
                changed = true;
                continue;
            }
            if (!await files.present(ref)) {
                const next = { ...this.uploads };
                delete next[id];
                this.uploads = next;
                changed = true;
            }
        }
        if (changed) {
            void saveUploads(this.lobby, this.uploads);
            this.refreshGm();
            this.announceLibrary();
        }
        void this.pumpUploads();
    }

    async addFiles(list: File[]): Promise<void> {
        if (!this.host) return;
        const problems: string[] = [];
        for (const f of list) {
            if (this.entries.length >= LIMITS.MAX_TRACKS) { problems.push('The library holds ' + LIMITS.MAX_TRACKS + ' tracks.'); break; }
            if (!ACCEPTED_AUDIO.test(f.type) && !/\.(mp3|ogg|oga|opus|m4a|aac|wav|flac|webm)$/i.test(f.name)) {
                problems.push(f.name + ' is not an audio file.');
                continue;
            }
            if (f.size > 64_000_000) { problems.push(f.name + ' is over 64 MB.'); continue; }
            const url = URL.createObjectURL(f);
            let dur = 0;
            try {
                dur = await probe(url);
            } catch {
                URL.revokeObjectURL(url);
                problems.push(f.name + ': this browser cannot play it.');
                continue;
            }
            const id = randomId(8);
            const title = cleanText(f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), LIMITS.MAX_TITLE) || 'Track';
            this.entries = [...this.entries, { id, title, kind: 'file', blob: f, dur: Math.min(dur, LIMITS.MAX_SECONDS) }];
            this.sources.set(id, { url, file: 'local' });
        }
        this.persistLibrary();
        this.refreshGm();
        if (problems.length) this.api.notify(problems.join(' '));
        void this.pumpUploads();
    }

    async addYouTube(input: string): Promise<boolean> {
        if (!this.host) return false;
        const yt = parseYouTube(input);
        if (!yt) { this.api.notify('That is not a YouTube link.'); return false; }
        if (this.entries.length >= LIMITS.MAX_TRACKS) { this.api.notify('The library holds ' + LIMITS.MAX_TRACKS + ' tracks.'); return false; }
        const id = randomId(8);
        this.entries = [...this.entries, { id, title: 'YouTube ' + yt, kind: 'yt', yt, dur: 0 }];
        this.persistLibrary();
        this.refreshGm();
        this.announceLibrary();
        void loadYouTube().catch(() => this.api.notify('YouTube could not be reached from this browser.'));
        const title = await youTubeTitle(yt);
        if (title) this.rename(id, title);
        return true;
    }

    rename(id: string, raw: string): void {
        const title = cleanText(raw, LIMITS.MAX_TITLE);
        if (!this.host || !title) return;
        this.entries = this.entries.map((e) => (e.id === id ? { ...e, title } : e));
        this.persistLibrary();
        this.refreshGm();
        this.announceLibrary();
    }

    /** Whether players see this track's title. */
    setReveal(id: string, reveal: boolean): void {
        if (!this.host) return;
        this.entries = this.entries.map((e) => (e.id === id ? { ...e, reveal } : e));
        this.persistLibrary();
        this.refreshGm();
        this.announceLibrary();
    }

    remove(id: string): void {
        if (!this.host) return;
        const ref = this.uploads[id];
        this.entries = this.entries.filter((e) => e.id !== id);
        if (ref) {
            const next = { ...this.uploads };
            delete next[id];
            this.uploads = next;
            void saveUploads(this.lobby, this.uploads);
            void this.api.files()?.remove(ref.id);
        }
        const src = this.sources.get(id);
        if (src) { URL.revokeObjectURL(src.url); this.sources.delete(id); }
        this.uploadErrors.delete(id);
        let decks = this.view.decks;
        for (const c of CHANNELS) {
            if (decks[c].track === id) decks = { ...decks, [c]: { ...silentDeck(), loop: decks[c].loop, vol: decks[c].vol } };
        }
        this.persistLibrary();
        this.set({ decks });
        this.refreshGm();
        this.announceLibrary();
        this.announceDecks(true);
    }

    /** Tries a failed upload again. */
    retryUpload(id: string): void {
        this.uploadErrors.delete(id);
        this.refreshGm();
        void this.pumpUploads();
    }

    private setDeck(ch: ChannelId, patch: Partial<ChannelState>): void {
        this.set({ decks: { ...this.view.decks, [ch]: { ...this.view.decks[ch], ...patch } } });
        const deck = this.decks[ch];
        if (deck.startTimer !== null) { clearTimeout(deck.startTimer); deck.startTimer = null; }
        this.announceDecks(true);
        this.reconcileAll();
    }

    /** Marks a track as this deck's: "this is the Background now". Again on
        the deck's own track takes it off; a track is on one deck at most, so
        the other deck lets it go. */
    assign(ch: ChannelId, id: string): void {
        if (!this.host) return;
        if (this.view.decks[ch].track === id) { this.clearDeck(ch); return; }
        for (const c of CHANNELS) if (c !== ch && this.view.decks[c].track === id) this.clearDeck(c);
        const wasPlaying = this.view.decks[ch].playing;
        this.setWaiting(ch, false);
        this.setDeck(ch, { track: id, playing: false, pos: 0, ref: 0, fade: null });
        if (wasPlaying) this.play(ch);
    }

    /** Leaves a deck with no track, keeping its loop and volume. */
    private clearDeck(ch: ChannelId): void {
        const st = this.view.decks[ch];
        this.setWaiting(ch, false);
        this.setDeck(ch, { ...silentDeck(), loop: st.loop, vol: st.vol });
    }

    /** Who cannot play this track yet, and why. Empty means everyone can. */
    blockers(trackId: string | null): Blocker[] {
        if (!trackId) return [];
        const entry = this.entries.find((e) => e.id === trackId);
        if (!entry) return [];
        const out: Blocker[] = [];
        if (entry.kind === 'file' && !this.uploads[trackId]) {
            const up = this.uploading.get(trackId);
            out.push({
                id: '', name: 'Upload',
                why: up !== undefined ? 'still uploading (' + Math.round(up * 100) + '%)' : this.uploadErrors.get(trackId) || 'not uploaded yet',
            });
        }
        const now = Date.now();
        for (const m of this.api.members()) {
            if (m.host || m.id === this.api.myId()) continue;
            const s = this.view.members[m.id];
            if (!s || now - s.at > STAT_STALE_MS) { out.push({ id: m.id, name: m.name, why: 'no answer yet' }); continue; }
            if (!s.unlocked) { out.push({ id: m.id, name: m.name, why: 'sound not enabled' }); continue; }
            if (s.ready.includes(trackId)) continue;
            if (s.failed.includes(trackId)) { out.push({ id: m.id, name: m.name, why: 'could not load it' }); continue; }
            const l = s.loading.find((x) => x.id === trackId);
            out.push({
                id: m.id, name: m.name,
                why: entry.kind === 'yt' ? 'YouTube still loading' : l ? 'downloading ' + l.pct + '%' : 'waiting to download',
            });
        }
        return out;
    }

    private setWaiting(ch: ChannelId, on: boolean): void {
        if (this.view.waiting[ch] === on) return;
        this.set({ waiting: { ...this.view.waiting, [ch]: on } });
    }

    /* ------------------------------------------------------------ fades */

    setFadeOn(ch: ChannelId, on: boolean): void {
        const fadeOn = { ...this.view.fadeOn, [ch]: on };
        this.set({ fadeOn });
        try { localStorage.setItem(FADE_KEY, JSON.stringify(fadeOn)); } catch { /* private mode */ }
    }

    private fadingOut(ch: ChannelId): boolean {
        const st = this.view.decks[ch];
        return st.playing && st.fade?.dir === 'out';
    }

    /** Fades a playing deck out from wherever its volume is now, then
        pauses or stops it (finishFades). */
    private fadeOut(ch: ChannelId, then: 'pause' | 'stop'): void {
        const now = this.api.clock.now();
        const from = now + FADE_LEAD_MS;
        const gain = fadeGain(this.view.decks[ch].fade, now);
        this.setDeck(ch, { fade: { dir: 'out', at: fadeStartFor('out', gain, FADE_OUT_MS, from), ms: FADE_OUT_MS, then } });
    }

    /** Can this deck go out with a fade, rather than at once? */
    private canFade(ch: ChannelId): boolean {
        const p = this.positionOf(ch);
        return this.view.fadeOn[ch] && this.view.decks[ch].playing && !p.before && !p.ended;
    }

    /** A fade-out that has finished becomes the pause or stop it was for. */
    private finishFades(): void {
        const now = this.api.clock.now();
        for (const c of CHANNELS) {
            const st = this.view.decks[c];
            if (!st.playing || !st.fade || !fadedOut(st.fade, now)) continue;
            if (st.fade.then === 'stop') {
                this.setDeck(c, { playing: false, pos: 0, ref: 0, fade: null });
            } else {
                const dur = this.durationOf(c);
                const p = positionAt(st, dur, st.fade.at + st.fade.ms);
                this.setDeck(c, { playing: false, pos: Math.min(p.t, dur || p.t), ref: 0, fade: null });
            }
        }
    }

    /** Play, with the ready check. */
    play(ch: ChannelId): void {
        if (!this.host) return;
        const st = this.view.decks[ch];
        if (!st.track) return;
        /* Fading out: bring it back up from where it is, no ready check —
           everyone is already playing it. */
        if (this.fadingOut(ch)) {
            const now = this.api.clock.now();
            const gain = fadeGain(st.fade, now);
            this.setDeck(ch, { fade: { dir: 'in', at: fadeStartFor('in', gain, FADE_IN_MS, now + FADE_LEAD_MS), ms: FADE_IN_MS, then: null } });
            return;
        }
        if (this.blockers(st.track).length === 0) { this.start(ch); return; }
        this.setWaiting(ch, true);
    }

    /** Starts without waiting for anyone. */
    start(ch: ChannelId): void {
        if (!this.host) return;
        const st = this.view.decks[ch];
        if (!st.track) return;
        const p = this.positionOf(ch);
        const pos = p.ended || (p.dur > 0 && p.t >= p.dur - 0.05) ? 0 : p.t;
        this.setWaiting(ch, false);
        const ref = Math.round(this.api.clock.now() + LEAD_MS);
        const fade = this.view.fadeOn[ch] ? { dir: 'in' as const, at: ref, ms: FADE_IN_MS, then: null } : null;
        this.setDeck(ch, { playing: true, pos, ref, fade });
    }

    cancelWait(ch: ChannelId): void {
        this.setWaiting(ch, false);
    }

    private checkWaiting(): void {
        for (const c of CHANNELS) {
            if (this.view.waiting[c] && this.blockers(this.view.decks[c].track).length === 0) this.start(c);
        }
    }

    pause(ch: ChannelId): void {
        if (!this.host) return;
        const st = this.view.decks[ch];
        this.setWaiting(ch, false);
        if (!st.playing) return;
        if (this.canFade(ch)) {
            if (!this.fadingOut(ch)) this.fadeOut(ch, 'pause');
            return;
        }
        const p = this.positionOf(ch);
        this.setDeck(ch, { playing: false, pos: Math.min(p.t, p.dur || p.t), ref: 0, fade: null });
    }

    stop(ch: ChannelId): void {
        if (!this.host) return;
        this.setWaiting(ch, false);
        const st = this.view.decks[ch];
        if (this.canFade(ch)) {
            /* Already on its way out: it now ends at the start, not where it is. */
            if (this.fadingOut(ch) && st.fade) this.setDeck(ch, { fade: { ...st.fade, then: 'stop' } });
            else this.fadeOut(ch, 'stop');
            return;
        }
        this.setDeck(ch, { playing: false, pos: 0, ref: 0, fade: null });
    }

    seek(ch: ChannelId, t: number): void {
        if (!this.host) return;
        const st = this.view.decks[ch];
        const dur = this.durationOf(ch);
        const pos = Math.max(0, Math.min(dur > 0 ? dur - 0.1 : t, t));
        /* A short lead, so everyone jumps together rather than as their
           message lands. */
        this.setDeck(ch, st.playing ? { pos, ref: Math.round(this.api.clock.now() + 400) } : { pos });
    }

    setLoop(ch: ChannelId, loop: boolean): void {
        if (!this.host) return;
        const st = this.view.decks[ch];
        if (!st.playing) { this.setDeck(ch, { loop }); return; }
        /* Re-anchor first: the old anchor may be several laps back, and
           without the loop that arithmetic would land past the end. */
        const p = this.positionOf(ch);
        this.setDeck(ch, { loop, pos: p.t, ref: Math.round(this.api.clock.now()) });
    }

    /** The GM's mix for a deck. Sent a moment after the slider stops. */
    setVolume(ch: ChannelId, vol: number): void {
        if (!this.host) return;
        const v = Math.max(0, Math.min(1, vol));
        this.set({ decks: { ...this.view.decks, [ch]: { ...this.view.decks[ch], vol: v } } });
        this.reconcileAll();
        if (this.volumeTimer !== null) clearTimeout(this.volumeTimer);
        this.volumeTimer = window.setTimeout(() => { this.volumeTimer = null; this.announceDecks(true); }, 200);
    }

    /** The GM's own player learnt a length the library did not have: a
        YouTube video, or a file probed while the tab was in the background. */
    private learnDurations(): void {
        let changed = false;
        for (const c of CHANNELS) {
            const id = this.view.decks[c].track;
            const e = this.entries.find((x) => x.id === id);
            const out = e?.kind === 'yt' ? this.decks[c].yt : this.decks[c].file;
            const d = out?.duration ?? 0;
            if (e && !e.dur && d > 0) {
                this.entries = this.entries.map((x) => (x.id === e.id ? { ...x, dur: Math.min(d, LIMITS.MAX_SECONDS) } : x));
                changed = true;
            }
        }
        if (changed) {
            this.persistLibrary();
            this.refreshGm();
            this.announceLibrary();
        }
    }

}
