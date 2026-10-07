import { HOST_BEAT_MS, HOST_LOST_MS, openLink, parseLink } from '../lib/tableLink';
import type { LinkMessage } from '../lib/tableLink';
import { exportLoader } from './render/exportImages';
import { fogSnapshot, renderPlayerView, revealStats } from './render/playerView';
import type { FogSnapshot, RevealStats } from './render/playerView';
import type { MapStore } from './store';
import type { MapDoc } from './types';

/* The Map Maker's end of the line to the rolling table (src/lib/tableLink.ts).

   Two ways to share a map. A SNAPSHOT is one picture, sent when the GM asks.
   LIVE follows the map: every finished change is sent on its own, so the
   table shows the map as the GM works on it.

   Live is the one that can hurt — a slip of the unfog brush is on every
   player's screen a moment later — so it is built to fail shut:

   - by default nothing is sent until the GM presses Sync: they finish their
     changes, look, and send them in one go. Automatic sync is a choice, and
     then nothing is sent mid-stroke or until the map has been still for the
     GM's own wait — `editHold` after any change, `revealHold` after one that
     uncovers fog. An undo inside that wait means nothing leaves;
   - an update that uncovers more than `threshold` of the map, or clears the
     fog entirely, is HELD. Live stops until the GM publishes it or throws it
     away;
   - live is bound to one map. Switching to another pauses it, and coming back
     does not resume it on its own;
   - when the table goes quiet, or starts showing something else, live ends.

   And the picture itself is the players' view (render/playerView.ts): fog
   always on and sealed, hidden objects not drawn, no map data sent. */

export const MIN_HOLD_MS = 500;
export const MAX_HOLD_MS = 10_000;
const DEFAULT_EDIT_HOLD_MS = 1000;
const DEFAULT_REVEAL_HOLD_MS = 2000;
const AUTO_KEY = 'pokerole_map_table_auto';
const EDIT_HOLD_KEY = 'pokerole_map_table_edit_hold';
const REVEAL_HOLD_KEY = 'pokerole_map_table_reveal_hold';
const ACK_TIMEOUT_MS = 180_000;
const THRESHOLD_KEY = 'pokerole_map_table_threshold';
export const DEFAULT_THRESHOLD = 0.15;

export type LiveMode = 'off' | 'live' | 'paused' | 'held';

export interface LiveState {
    /** A table this browser is hosting is open in another tab. */
    connected: boolean;
    table: string;
    /** The table has its map on show to the players. */
    shown: boolean;
    mode: LiveMode;
    /** The map live follows. */
    mapId: string | null;
    mapName: string;
    /** Why live is paused, in a sentence; '' when it is not. */
    why: string;
    /** The update the guard is holding back. */
    held: RevealStats | null;
    /** When the next live update is due, while one is waiting. */
    dueAt: number | null;
    /** Rendering or uploading. */
    busy: boolean;
    /** What players were last sent, as a picture. */
    lastUrl: string | null;
    lastAt: number | null;
    error: string;
    /** Share of the map one update may uncover before it is held, 0..1. */
    threshold: number;
    /** Changes go out by themselves after a wait; off, only on Sync. */
    auto: boolean;
    /** Automatic sync: how long the map must be still before a change goes, ms. */
    editHold: number;
    /** ...and before a change that uncovers fog goes, ms. */
    revealHold: number;
    /** Live, with changes on the map that the players have not been sent. */
    pending: boolean;
}

function loadHold(key: string, fallback: number): number {
    try {
        const v = Number(localStorage.getItem(key));
        return v >= MIN_HOLD_MS && v <= MAX_HOLD_MS ? v : fallback;
    } catch {
        return fallback;
    }
}

function loadAuto(): boolean {
    try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
}

function loadThreshold(): number {
    try {
        const v = Number(localStorage.getItem(THRESHOLD_KEY));
        return v > 0 && v <= 1 ? v : DEFAULT_THRESHOLD;
    } catch {
        return DEFAULT_THRESHOLD;
    }
}

export class TableLiveLink {
    private listeners = new Set<() => void>();
    private version = 0;
    state: LiveState = {
        connected: false, table: '', shown: false, mode: 'off', mapId: null, mapName: '', why: '', held: null,
        dueAt: null, busy: false, lastUrl: null, lastAt: null, error: '', threshold: loadThreshold(),
        auto: loadAuto(), editHold: loadHold(EDIT_HOLD_KEY, DEFAULT_EDIT_HOLD_MS),
        revealHold: loadHold(REVEAL_HOLD_KEY, DEFAULT_REVEAL_HOLD_MS), pending: false,
    };

    private channel: BroadcastChannel | null = null;
    private lastHostAt = 0;
    private beat: number | null = null;
    private hold: number | null = null;
    private unsubscribe: (() => void) | null = null;
    /** The doc live last scheduled for; a notify that changed nothing in the map is not a change. */
    private seenDoc: MapDoc | null = null;
    /** The fog players last received. */
    private published: FogSnapshot | null = null;
    /** The very map players last received. An undo hands this object back,
        and then there is nothing new to send. */
    private publishedDoc: MapDoc | null = null;
    /** At least one live picture reached the table. */
    private landed = false;
    private seq = 0;
    private acks = new Map<number, (m: Extract<LinkMessage, { t: 'ack' }>) => void>();
    private sending = false;
    /** Sync was pressed while a picture was still on its way. */
    private syncAfter = false;
    private loader = exportLoader(null);

    constructor(private store: MapStore) {}

    subscribe = (cb: () => void): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    getSnapshot = (): number => this.version;

    private set(patch: Partial<LiveState>): void {
        this.state = { ...this.state, ...patch };
        this.version++;
        this.listeners.forEach((l) => l());
    }

    start(): void {
        if (this.channel) return;
        this.channel = openLink();
        if (!this.channel) return;
        this.channel.onmessage = (e) => this.onMessage(parseLink(e.data));
        this.post({ t: 'ping' });
        this.beat = window.setInterval(() => this.checkHost(), HOST_BEAT_MS);
        this.unsubscribe = this.store.subscribe(() => this.onStore());
    }

    dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        if (this.beat !== null) clearInterval(this.beat);
        this.clearHold();
        if (this.state.mode !== 'off' && this.state.mapId) this.post({ t: 'unlive', mapId: this.state.mapId });
        this.channel?.close();
        this.channel = null;
    }

    private post(m: LinkMessage): void {
        try { this.channel?.postMessage(m); } catch { /* closed */ }
    }

    /* ------------------------------------------------------------ the table */

    private onMessage(m: LinkMessage | null): void {
        if (!m) return;
        if (m.t === 'host') {
            this.lastHostAt = Date.now();
            if (!this.state.connected || this.state.table !== m.table || this.state.shown !== m.shown) {
                this.set({ connected: true, table: m.table, shown: m.shown });
            }
            /* The table moved on — another image, the map hidden, a snapshot
               of something else. Live is over; following on regardless would
               put this map back on screen at the next edit. */
            if (this.state.mode !== 'off' && this.landed && !this.sending && m.live !== this.state.mapId) {
                this.end('The table stopped showing this map, so live ended.');
            }
        } else if (m.t === 'bye') {
            this.lost();
        } else if (m.t === 'ack') {
            const done = this.acks.get(m.seq);
            if (done) { this.acks.delete(m.seq); done(m); }
        }
    }

    /* The table answers a ping from its message handler, which a browser
       runs promptly even in a hidden tab — unlike the table's own timers,
       which Chrome slows to once a minute in a tab hidden for five minutes.
       The GM working in this tab is exactly that case, so presence rides on
       this tab's pings, not on the table's beat. */
    private checkHost(): void {
        this.post({ t: 'ping' });
        if (this.state.connected && Date.now() - this.lastHostAt > HOST_LOST_MS) this.lost();
    }

    private lost(): void {
        if (this.state.mode !== 'off') this.end('The rolling table was closed, so live ended.');
        this.set({ connected: false, table: '' });
    }

    /** Live ends, with a reason the bar shows. */
    private end(why: string): void {
        this.clearHold();
        this.landed = false;
        this.published = null;
        this.publishedDoc = null;
        this.set({ mode: 'off', mapId: null, mapName: '', held: null, dueAt: null, why: '', error: why, pending: false });
    }

    /* --------------------------------------------------------- the map side */

    private onStore(): void {
        const s = this.state;
        if (s.mode !== 'live' || this.store.dragging) return;
        if (this.store.activeId !== s.mapId) {
            this.clearHold();
            this.set({
                mode: 'paused', dueAt: null,
                why: 'You switched to another map, so live is paused. That map is not being shown.',
            });
            return;
        }
        const doc = this.store.doc;
        if (doc === this.seenDoc) return;
        this.seenDoc = doc;
        if (doc.name !== s.mapName) this.set({ mapName: doc.name });
        this.changed();
    }

    /** The map moved on from what players have: wait for Sync, or for the
        automatic wait. An undo back to what they have is no change at all. */
    private changed(): void {
        const doc = this.store.doc;
        const pending = doc !== this.publishedDoc;
        if (pending !== this.state.pending) this.set({ pending });
        if (!pending) { this.clearHold(); this.set({ dueAt: null }); return; }
        if (this.state.auto) this.schedule(this.holdFor(doc));
    }

    /** How long this version of the map waits: longer if it uncovers fog. */
    private holdFor(doc: MapDoc): number {
        return revealStats(this.published, doc).revealed > 0 ? this.state.revealHold : this.state.editHold;
    }

    private clearHold(): void {
        if (this.hold !== null) clearTimeout(this.hold);
        this.hold = null;
    }

    private schedule(ms: number): void {
        this.clearHold();
        this.set({ dueAt: Date.now() + ms });
        this.hold = window.setTimeout(() => { this.hold = null; void this.due(); }, ms);
    }

    /** The hold window ran out: guard, then send. */
    private async due(): Promise<void> {
        if (this.state.mode !== 'live') return;
        if (this.sending) { this.syncAfter = true; return; }
        const doc = this.store.doc;
        if (doc.id !== this.state.mapId) { this.onStore(); return; }
        if (doc === this.publishedDoc) { this.set({ dueAt: null, pending: false }); return; }

        const stats = revealStats(this.published, doc);
        if (stats.clearedAll || stats.revealed > this.state.threshold) {
            this.set({ mode: 'held', held: stats, dueAt: null });
            return;
        }
        this.set({ dueAt: null });
        await this.send(doc, true);
    }

    private async send(doc: MapDoc, live: boolean): Promise<boolean> {
        if (!this.state.connected) {
            this.set({ error: 'No rolling table is open in this browser.' });
            return false;
        }
        this.sending = true;
        this.set({ busy: true, error: '' });
        try {
            const view = await renderPlayerView(doc, this.loader);
            const seq = ++this.seq;
            const ack = new Promise<Extract<LinkMessage, { t: 'ack' }>>((resolve) => {
                this.acks.set(seq, resolve);
                window.setTimeout(() => {
                    if (this.acks.delete(seq)) resolve({ t: 'ack', seq, ok: false, error: 'The table did not answer.' });
                }, ACK_TIMEOUT_MS);
            });
            this.post({
                t: 'image', seq, mapId: doc.id, title: doc.name || 'Map', live,
                image: view.blob, w: view.width, h: view.height,
            });
            const reply = await ack;
            if (!reply.ok) {
                this.set({ busy: false, error: reply.error || 'The table could not take the map.' });
                if (this.state.mode === 'live') {
                    this.set({ mode: 'paused', why: 'The last update did not reach the table, so live is paused.' });
                }
                return false;
            }
            if (this.state.lastUrl) URL.revokeObjectURL(this.state.lastUrl);
            if (live) {
                this.published = fogSnapshot(doc);
                this.publishedDoc = doc;
                this.landed = true;
            }
            this.set({
                busy: false, lastUrl: URL.createObjectURL(view.blob), lastAt: Date.now(),
                pending: this.state.mode === 'live' && this.store.doc !== this.publishedDoc,
            });
            return true;
        } catch (e) {
            this.set({ busy: false, error: 'Could not draw the map: ' + (e instanceof Error ? e.message : 'unknown error') });
            if (this.state.mode === 'live') this.set({ mode: 'paused', why: 'Drawing the map failed, so live is paused.' });
            return false;
        } finally {
            this.sending = false;
            /* Changed while it was being sent: that change waits its own turn. */
            if (this.state.mode === 'live' && this.store.doc !== doc && this.store.activeId === this.state.mapId) {
                this.seenDoc = this.store.doc;
                if (this.syncAfter) { this.syncAfter = false; void this.due(); }
                else this.changed();
            }
        }
    }

    /* ---------------------------------------------------------- GM actions */

    /** One picture of the map on screen, now. Not live. */
    async snapshot(): Promise<void> {
        if (this.state.mode !== 'off') this.stop();
        await this.send(this.store.doc, false);
    }

    /** Start following the map on screen. The caller asks first when the map
        has no fog at all (see `needsFogWarning`). */
    async goLive(): Promise<void> {
        const doc = this.store.doc;
        this.clearHold();
        this.landed = false;
        this.published = null;
        this.publishedDoc = null;
        this.seenDoc = doc;
        this.set({ mode: 'live', mapId: doc.id, mapName: doc.name, why: '', held: null, error: '' });
        const ok = await this.send(doc, true);
        if (!ok && this.state.mode === 'live') this.set({ mode: 'off', mapId: null });
    }

    /** Live with no fog shows everything — worth a question first. */
    needsFogWarning(): boolean {
        return !this.store.doc.fog;
    }

    pause(): void {
        if (this.state.mode !== 'live') return;
        this.clearHold();
        this.set({ mode: 'paused', dueAt: null, why: 'Paused. Changes stay here until you resume.' });
    }

    resume(): void {
        if (this.state.mode !== 'paused') return;
        if (this.store.activeId !== this.state.mapId) {
            this.set({ error: 'Switch back to “' + this.state.mapName + '” to resume it, or stop live.' });
            return;
        }
        this.seenDoc = this.store.doc;
        this.set({ mode: 'live', why: '', error: '' });
        /* What changed while paused goes through the guard like any edit:
           at once when syncing by itself, on Sync otherwise. */
        if (this.state.auto) this.schedule(0);
        else this.changed();
    }

    /** Send what is on the map now. Still through the reveal guard. */
    syncNow(): void {
        if (this.state.mode !== 'live') return;
        this.clearHold();
        this.set({ dueAt: null });
        void this.due();
    }

    /** Sync by itself after a wait, or only when asked. */
    setAuto(auto: boolean): void {
        try { localStorage.setItem(AUTO_KEY, auto ? '1' : '0'); } catch { /* private mode */ }
        this.set({ auto });
        if (this.state.mode !== 'live') return;
        if (auto) this.changed();
        else { this.clearHold(); this.set({ dueAt: null }); }
    }

    togglePause(): void {
        if (this.state.mode === 'live') this.pause();
        else if (this.state.mode === 'paused') this.resume();
    }

    stop(): void {
        if (this.state.mode === 'off') return;
        const mapId = this.state.mapId;
        this.clearHold();
        this.landed = false;
        this.published = null;
        this.publishedDoc = null;
        this.set({ mode: 'off', mapId: null, mapName: '', why: '', held: null, dueAt: null, pending: false });
        if (mapId) this.post({ t: 'unlive', mapId });
    }

    /** The GM looked at the held update and wants it shown. */
    async publishHeld(): Promise<void> {
        if (this.state.mode !== 'held') return;
        this.set({ mode: 'live', held: null });
        if (this.store.activeId !== this.state.mapId) { this.onStore(); return; }
        await this.send(this.store.doc, true);
    }

    /** The GM threw the held update away. Live stays paused until they resume,
        so the same change cannot slip through at the next edit. */
    discardHeld(): void {
        if (this.state.mode !== 'held') return;
        this.set({ mode: 'paused', held: null, why: 'Update not sent. Fix the fog, then resume.' });
    }

    setThreshold(v: number): void {
        const t = Math.max(0.01, Math.min(1, v));
        try { localStorage.setItem(THRESHOLD_KEY, String(t)); } catch { /* private mode */ }
        this.set({ threshold: t });
    }

    setHold(which: 'edit' | 'reveal', ms: number): void {
        const v = Math.round(Math.max(MIN_HOLD_MS, Math.min(MAX_HOLD_MS, ms)));
        try { localStorage.setItem(which === 'edit' ? EDIT_HOLD_KEY : REVEAL_HOLD_KEY, String(v)); } catch { /* private mode */ }
        this.set(which === 'edit' ? { editHold: v } : { revealHold: v });
    }
}
