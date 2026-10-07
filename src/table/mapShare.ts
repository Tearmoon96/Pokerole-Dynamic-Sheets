/* The map in the middle of the table.

   The GM's browser holds the picture: from an image file, or rendered for the
   players by the Map Maker in another tab (src/lib/tableLink.ts). It uploads
   it to the relay's file store sealed with the room key, and only when the GM
   SHOWS it does a reference go out on the socket — so a player cannot fetch a
   map before it is on screen, and hiding it sends no picture at all.

   A player downloads what the reference names, checks it against the hash the
   GM signed (blobs.ts), and shows it. */

import { MissingFileError } from './blobs';
import type { BlobChannel } from './blobs';
import { formatLobbyId } from './encoding';
import { HOST_BEAT_MS, openLink, parseLink } from '../lib/tableLink';
import type { LinkMessage } from '../lib/tableLink';
import { idbDel, idbGet, idbSet } from '../state/idb';
import { LIMITS } from './protocol';
import type { Body, WireFile } from './protocol';
import type { TableApi } from './link';
import { cleanText } from './validate';

/** A map image is re-encoded to fit this. */
const MAX_SIDE = 4096;
/** An old picture stays on the relay this long after it is replaced, so a
    player halfway through downloading it is not cut off. */
const RETIRE_MS = 90_000;
const SAVED_PREFIX = 'pokeroleTable:map:';

export interface MapView {
    /** On screen for the players. */
    show: boolean;
    title: string;
    /** Following the Map Maker as the GM edits. */
    live: boolean;
    url: string | null;
    w: number;
    h: number;
    /** 0..1 while a picture is uploading (GM) or downloading (player). */
    loading: number | null;
    error: string;
    /** GM: a picture is ready, shown or not. */
    ready: boolean;
}

export function emptyMapView(): MapView {
    return { show: false, title: '', live: false, url: null, w: 0, h: 0, loading: null, error: '', ready: false };
}

interface Staged {
    file: WireFile;
    w: number;
    h: number;
    title: string;
    live: boolean;
    /** The Map Maker map it came from, or null for an image file. */
    mapId: string | null;
    blob: Blob;
}

interface Saved {
    staged: Staged | null;
    shown: boolean;
}

/** Decodes any image the browser can read and re-encodes it as WebP no
    larger than MAX_SIDE, which also strips whatever metadata the file
    carried — a phone photo's location, for one. */
export async function prepareImage(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
    if (!file.type.startsWith('image/')) throw new Error('That is not an image.');
    let bmp: ImageBitmap;
    try {
        bmp = await createImageBitmap(file);
    } catch {
        throw new Error('This browser cannot read that image.');
    }
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.88));
    if (!blob) throw new Error('This browser could not encode the image.');
    return { blob, w, h };
}

export class MapShare {
    view: MapView = emptyMapView();

    private host = false;
    private lobby = '';
    private rev = 0;
    private staged: Staged | null = null;
    private shown = false;
    /** Player: the file on screen, and the one being fetched. */
    private currentFile = '';
    private fetching = '';
    private abort: AbortController | null = null;
    private retry: number | null = null;
    /** GM: a newer picture arrived while one was uploading. */
    private queued: { run: () => Promise<void>; skip: () => void } | null = null;
    private uploading = false;

    private channel: BroadcastChannel | null = null;
    private beat: number | null = null;
    /** Bumped by every begin and end: a begin still reading IndexedDB when
        the table is left must not open the Map Maker's line afterwards. */
    private generation = 0;

    constructor(private api: TableApi) {}

    private set(patch: Partial<MapView>): void {
        this.view = { ...this.view, ...patch };
        this.api.changed();
    }

    private files(): BlobChannel | null {
        return this.api.files();
    }

    /* ---------------------------------------------------------- lifecycle */

    async begin(isHost: boolean, lobbyId: string): Promise<void> {
        this.end();
        this.host = isHost;
        this.lobby = lobbyId;
        this.view = emptyMapView();
        if (!isHost) return;

        const gen = this.generation;
        const saved = await idbGet<Saved>(SAVED_PREFIX + lobbyId);
        if (gen !== this.generation) return;
        if (saved?.staged?.blob instanceof Blob) {
            this.staged = saved.staged;
            this.shown = !!saved.shown;
            this.showLocal();
        }
        this.openLink();
    }

    end(): void {
        this.generation++;
        this.abort?.abort();
        this.abort = null;
        if (this.retry !== null) clearTimeout(this.retry);
        this.retry = null;
        if (this.channel) {
            this.post({ t: 'bye' });
            this.channel.close();
            this.channel = null;
        }
        if (this.beat !== null) clearInterval(this.beat);
        this.beat = null;
        if (this.view.url) URL.revokeObjectURL(this.view.url);
        this.view = emptyMapView();
        this.staged = null;
        this.shown = false;
        this.currentFile = '';
        this.fetching = '';
        this.rev = 0;
    }

    /** Forget this lobby's map for good — leaving the table. */
    async forget(lobbyId: string): Promise<void> {
        await idbDel(SAVED_PREFIX + lobbyId);
    }

    /* ---------------------------------------------------------------- GM */

    /** The GM's own screen shows exactly the picture players get. */
    private showLocal(): void {
        const s = this.staged;
        if (this.view.url) URL.revokeObjectURL(this.view.url);
        this.set({
            ready: !!s,
            show: this.shown && !!s,
            title: s?.title ?? '',
            live: !!s?.live,
            url: s ? URL.createObjectURL(s.blob) : null,
            w: s?.w ?? 0,
            h: s?.h ?? 0,
        });
    }

    private save(): void {
        const saved: Saved = { staged: this.staged, shown: this.shown };
        void idbSet(SAVED_PREFIX + this.lobby, saved);
    }

    private body(): Body {
        const s = this.staged;
        if (this.shown && s) {
            return { k: 'map', rev: this.rev, show: true, title: s.title, live: s.live, image: { file: s.file, w: s.w, h: s.h } };
        }
        return { k: 'map', rev: this.rev, show: false, title: '', live: false, image: null };
    }

    private announce(): void {
        this.rev = Math.max(this.rev + 1, Math.round(this.api.clock.now()));
        void this.api.publish(this.body());
        this.beatNow();
    }

    /** A player who just joined. */
    greet(): void {
        if (!this.host) return;
        if (this.rev === 0) this.rev = Math.round(this.api.clock.now());
        void this.api.publish(this.body());
    }

    setShown(show: boolean): void {
        if (!this.host || (show && !this.staged)) return;
        this.shown = show;
        this.save();
        this.showLocal();
        this.announce();
    }

    /** Takes the picture off the table and out of the relay. */
    clear(): void {
        if (!this.host) return;
        const old = this.staged;
        this.staged = null;
        this.shown = false;
        this.save();
        this.showLocal();
        this.announce();
        if (old) void this.files()?.remove(old.file.id);
    }

    /** An image file the GM chose. */
    async useImage(file: File): Promise<void> {
        if (!this.host) return;
        try {
            const img = await prepareImage(file);
            const title = cleanText(file.name.replace(/\.[^.]+$/, ''), LIMITS.MAX_TITLE) || 'Map';
            await this.stage(img.blob, img.w, img.h, title, false, null);
        } catch (e) {
            this.set({ error: e instanceof Error ? e.message : 'Could not use that image.' });
        }
    }

    /** Uploads a picture and makes it the table's map. Pictures that arrive
        while one is uploading replace each other: only the newest goes next. */
    private stage(blob: Blob, w: number, h: number, title: string, live: boolean, mapId: string | null): Promise<void> {
        const run = async () => {
            const files = this.files();
            if (!files) throw new Error('Not connected to a table.');
            this.uploading = true;
            this.set({ loading: 0, error: '' });
            try {
                const file = await files.upload(blob, (f) => this.set({ loading: f }));
                const old = this.staged;
                this.staged = { file, w, h, title, live, mapId, blob };
                this.save();
                this.showLocal();
                if (this.shown) this.announce();
                else this.beatNow();
                if (old && old.file.id !== file.id) {
                    window.setTimeout(() => { void files.remove(old.file.id); }, RETIRE_MS);
                }
            } finally {
                this.uploading = false;
                this.set({ loading: null });
            }
        };
        if (this.uploading) {
            return new Promise<void>((resolve, reject) => {
                /* A picture still waiting is overtaken: it never needs sending. */
                this.queued?.skip();
                this.queued = { run: () => run().then(resolve, reject), skip: resolve };
            });
        }
        return run().finally(() => this.drain());
    }

    private drain(): void {
        const next = this.queued;
        this.queued = null;
        if (next) void next.run().finally(() => this.drain());
    }

    /** The relay may have dropped the picture — an idle wipe, or the room's
        space filling up. Puts it back under a new id. */
    async verify(): Promise<void> {
        const s = this.staged, files = this.files();
        if (!this.host || !s || !files || this.uploading) return;
        if (await files.present(s.file)) return;
        try {
            await this.stage(s.blob, s.w, s.h, s.title, s.live, s.mapId);
        } catch { /* tried again at the next check */ }
    }

    /** A player could not fetch this file. */
    missing(fileId: string): boolean {
        return !!this.staged && this.staged.file.id === fileId;
    }

    /* ------------------------------------------------ the Map Maker's line */

    private openLink(): void {
        this.channel = openLink();
        if (!this.channel) return;
        this.channel.onmessage = (e) => { void this.onLink(parseLink(e.data)); };
        this.beat = window.setInterval(() => this.beatNow(), HOST_BEAT_MS);
        this.beatNow();
    }

    private post(m: LinkMessage): void {
        try { this.channel?.postMessage(m); } catch { /* closed */ }
    }

    private beatNow(): void {
        if (!this.channel) return;
        const s = this.staged;
        this.post({
            t: 'host', table: formatLobbyId(this.lobby),
            live: s?.live && s.mapId ? s.mapId : null, shown: this.shown && !!s,
        });
    }

    private async onLink(m: LinkMessage | null): Promise<void> {
        if (!m || !this.host) return;
        if (m.t === 'ping') { this.beatNow(); return; }
        if (m.t === 'unlive') {
            const s = this.staged;
            if (s && s.live && s.mapId === m.mapId) {
                this.staged = { ...s, live: false };
                this.save();
                this.showLocal();
                if (this.shown) this.announce();
                else this.beatNow();
            }
            return;
        }
        if (m.t !== 'image') return;

        let error = '';
        try {
            if (!m.image.type.startsWith('image/') || m.image.size === 0) throw new Error('That is not a picture.');
            const title = cleanText(m.title, LIMITS.MAX_TITLE) || 'Map';
            const w = Math.round(m.w), h = Math.round(m.h);
            if (!(w > 0 && h > 0 && w <= LIMITS.MAX_MAP_SIDE && h <= LIMITS.MAX_MAP_SIDE)) throw new Error('That picture is too big.');
            await this.stage(m.image, w, h, title, m.live, m.mapId);
        } catch (e) {
            error = e instanceof Error ? e.message : 'The table could not take the map.';
            this.set({ error });
        }
        this.post({ t: 'ack', seq: m.seq, ok: !error, error });
    }

    /* ------------------------------------------------------------ players */

    onMap(body: Extract<Body, { k: 'map' }>): void {
        if (this.host || body.rev < this.rev) return;
        this.rev = body.rev;

        if (!body.show || !body.image) {
            this.abort?.abort();
            this.fetching = '';
            this.currentFile = '';
            if (this.view.url) URL.revokeObjectURL(this.view.url);
            this.set({ show: false, url: null, title: '', live: false, loading: null, error: '' });
            return;
        }

        const image = body.image;
        if (image.file.id === this.currentFile) {
            this.set({ show: true, title: body.title, live: body.live });
            return;
        }
        if (image.file.id === this.fetching) return;
        void this.fetch(body.title, body.live, image.file, image.w, image.h);
    }

    private async fetch(title: string, live: boolean, file: WireFile, w: number, h: number): Promise<void> {
        const files = this.files();
        if (!files) return;
        this.abort?.abort();
        const abort = new AbortController();
        this.abort = abort;
        this.fetching = file.id;
        if (this.retry !== null) { clearTimeout(this.retry); this.retry = null; }
        /* While a live map refreshes, the old picture stays up: a blank flash
           at every edit would be worse than a second of the old one. */
        this.set({ loading: 0, error: '', title, live });
        try {
            const blob = await files.download(file, (f) => this.set({ loading: f }), abort.signal);
            if (abort.signal.aborted || this.fetching !== file.id) return;
            if (this.view.url) URL.revokeObjectURL(this.view.url);
            this.currentFile = file.id;
            this.fetching = '';
            this.set({ show: true, url: URL.createObjectURL(blob), w, h, title, live, loading: null, error: '' });
        } catch (e) {
            if (abort.signal.aborted) return;
            this.fetching = '';
            const gone = e instanceof MissingFileError;
            if (gone) this.onMissing?.(file.id);
            this.set({
                loading: null,
                error: gone ? 'The map is being sent again…' : 'The map did not arrive intact (' + (e instanceof Error ? e.message : 'error') + ').',
            });
            /* Try again in a while: the GM's page sends a dropped file again. */
            this.retry = window.setTimeout(() => {
                this.retry = null;
                if (this.currentFile !== file.id) void this.fetch(title, live, file, w, h);
            }, 8000);
        }
    }

    /** Player: a file the relay no longer had, for the GM to send again. */
    onMissing: ((fileId: string) => void) | null = null;
}
