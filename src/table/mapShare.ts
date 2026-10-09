/* The maps in the middle of the table.

   The GM's browser holds the pictures: from image files, or rendered for the
   players by the Map Maker in another tab (src/lib/tableLink.ts). It can hold
   several at once and shows at most ONE — the active map. Every picture is
   uploaded to the relay's file store sealed with the room key as soon as it
   arrives, so switching is instant, but only the active one is ever named on
   the socket: a player cannot fetch a map before it is on screen, and an
   inactive or hidden map sends no reference at all.

   A player downloads what the reference names, checks it against the hash the
   GM signed (blobs.ts), and shows it. Players never learn that the GM holds
   other maps. */

import { MissingFileError } from './blobs';
import type { BlobChannel } from './blobs';
import { formatLobbyId } from './encoding';
import { HOST_BEAT_MS, openLink, parseLink } from '../lib/tableLink';
import { parseHide, parseObjects } from '../lib/tableLink';
import type { HideKind, LinkMessage, MapObjectInfo, PlayerHide } from '../lib/tableLink';
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
/** How many maps the GM can hold on one table. */
export const MAX_TABLE_MAPS = 12;

/** One map the GM holds, as the GM's own panel lists it. */
export interface MapEntry {
    key: string;
    title: string;
    live: boolean;
    /** From the Map Maker rather than an image file. */
    fromMaker: boolean;
    url: string;
    w: number;
    h: number;
    /** The one on show to the players. */
    active: boolean;
    /** A live map's landmarks, tokens and labels, as its last picture had them. */
    objects: MapObjectInfo[];
    /** What of them the GM keeps off the players' picture. */
    hide: PlayerHide;
}

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
    /** GM: at least one map is ready, shown or not. */
    ready: boolean;
    /** GM: every map held, in the order they arrived. Empty for a player. */
    entries: MapEntry[];
}

export function emptyMapView(): MapView {
    return { show: false, title: '', live: false, url: null, w: 0, h: 0, loading: null, error: '', ready: false, entries: [] };
}

interface Staged {
    /** The entry's own id at this table: `mm:<mapId>` for a Map Maker map,
        so a new picture of it replaces the old one, random for an image. */
    key: string;
    file: WireFile;
    w: number;
    h: number;
    title: string;
    live: boolean;
    /** The Map Maker map it came from, or null for an image file. */
    mapId: string | null;
    blob: Blob;
    /** A Map Maker map's objects, as the picture was drawn. */
    objects?: MapObjectInfo[];
}

interface Saved {
    entries: Staged[];
    /** The key of the map on show, or null. */
    active: string | null;
    /** What the GM keeps off the players' picture, by Map Maker map id. */
    hide?: Record<string, PlayerHide>;
}

/** What IndexedDB held, from this version or the one-map one before it. */
function readSaved(raw: unknown): Saved | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as { entries?: unknown; active?: unknown; staged?: Staged | null; shown?: unknown };
    if (Array.isArray(r.entries)) {
        const entries = (r.entries as Staged[]).filter((e) => e && e.blob instanceof Blob && typeof e.key === 'string');
        const active = typeof r.active === 'string' && entries.some((e) => e.key === r.active) ? r.active : null;
        const hide: Record<string, PlayerHide> = {};
        const rawHide = (raw as { hide?: unknown }).hide;
        if (rawHide && typeof rawHide === 'object') {
            for (const [k, v] of Object.entries(rawHide)) {
                const h = parseHide(v);
                if (h) hide[k] = h;
            }
        }
        for (const e of entries) e.objects = e.objects ? parseObjects(e.objects) ?? [] : [];
        return { entries, active, hide };
    }
    const s = r.staged;
    if (!s || !(s.blob instanceof Blob)) return null;
    const key = s.mapId ? 'mm:' + s.mapId : 'img:old';
    return { entries: [{ ...s, key }], active: r.shown ? key : null };
}

const randomKey = (): string => 'img:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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
    /** GM: every map held, and the key of the one on show. */
    private entries: Staged[] = [];
    private active: string | null = null;
    /** GM: what each Map Maker map keeps off the players' picture. The Map
        Maker draws that picture, so it reads this from the beat. */
    private hides: Record<string, PlayerHide> = {};
    /** GM: object URLs of the held pictures, by file id. */
    private urls = new Map<string, string>();
    /** Player: the file on screen, and the one being fetched. */
    private currentFile = '';
    private fetching = '';
    private abort: AbortController | null = null;
    private retry: number | null = null;
    /** GM: pictures waiting while another uploads, by entry key — a newer
        picture of the same map overtakes one still waiting. */
    private queued = new Map<string, { run: () => Promise<void>; skip: () => void }>();
    private uploading = false;
    /** GM: the entry whose picture is uploading, and whether the GM removed
        it meanwhile — then the upload is thrown away rather than filed. */
    private uploadingKey = '';
    private droppedWhileUploading = false;

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
        const saved = readSaved(await idbGet<unknown>(SAVED_PREFIX + lobbyId));
        if (gen !== this.generation) return;
        if (saved?.entries.length) {
            this.entries = saved.entries;
            this.active = saved.active;
            this.hides = saved.hide ?? {};
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
        if (this.view.url && !this.host) URL.revokeObjectURL(this.view.url);
        for (const url of this.urls.values()) URL.revokeObjectURL(url);
        this.urls.clear();
        for (const q of this.queued.values()) q.skip();
        this.queued.clear();
        this.view = emptyMapView();
        this.entries = [];
        this.active = null;
        this.hides = {};
        this.currentFile = '';
        this.fetching = '';
        this.rev = 0;
    }

    /** Forget this lobby's maps for good — leaving the table. */
    async forget(lobbyId: string): Promise<void> {
        await idbDel(SAVED_PREFIX + lobbyId);
    }

    /* ---------------------------------------------------------------- GM */

    /** The map on show, or else the newest one held — what the harnesses
        in .verify/ read through `window.__pdsTable` (localhost only). */
    get staged(): Staged | null {
        return this.activeEntry() ?? this.entries[this.entries.length - 1] ?? null;
    }

    private activeEntry(): Staged | null {
        return this.entries.find((e) => e.key === this.active) ?? null;
    }

    private urlOf(s: Staged): string {
        let url = this.urls.get(s.file.id);
        if (!url) {
            url = URL.createObjectURL(s.blob);
            this.urls.set(s.file.id, url);
        }
        return url;
    }

    /** The GM's own screen shows exactly the picture players get, and the
        panel lists every map held. */
    private showLocal(): void {
        const s = this.activeEntry();
        const entries: MapEntry[] = this.entries.map((e) => ({
            key: e.key, title: e.title, live: e.live, fromMaker: !!e.mapId, url: this.urlOf(e),
            w: e.w, h: e.h, active: e.key === this.active,
            objects: e.objects ?? [],
            hide: (e.mapId && this.hides[e.mapId]) || { kinds: [], ids: [] },
        }));
        /* Pictures no entry holds any more. */
        const held = new Set(this.entries.map((e) => e.file.id));
        for (const [id, url] of this.urls) {
            if (!held.has(id)) { URL.revokeObjectURL(url); this.urls.delete(id); }
        }
        this.set({
            ready: this.entries.length > 0,
            entries,
            show: !!s,
            title: s?.title ?? '',
            live: !!s?.live,
            url: s ? this.urlOf(s) : null,
            w: s?.w ?? 0,
            h: s?.h ?? 0,
        });
    }

    private save(): void {
        const saved: Saved = { entries: this.entries, active: this.active, hide: this.hides };
        void idbSet(SAVED_PREFIX + this.lobby, saved);
    }

    private body(): Body {
        const s = this.activeEntry();
        if (s) {
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

    /** Puts one map on show — the others stay with the GM — or, with null,
        takes the map off the players' screens. */
    activate(key: string | null): void {
        if (!this.host) return;
        if (key !== null && !this.entries.some((e) => e.key === key)) return;
        if (key === this.active) return;
        this.active = key;
        this.save();
        this.showLocal();
        this.announce();
    }

    /** Takes one map off the table and out of the relay. */
    remove(key: string): void {
        if (!this.host) return;
        if (key === this.uploadingKey) this.droppedWhileUploading = true;
        const old = this.entries.find((e) => e.key === key);
        if (!old) return;
        this.entries = this.entries.filter((e) => e.key !== key);
        if (old.mapId) delete this.hides[old.mapId];
        this.queued.get(key)?.skip();
        this.queued.delete(key);
        const wasActive = this.active === key;
        if (wasActive) this.active = null;
        this.save();
        this.showLocal();
        if (wasActive) this.announce();
        else this.beatNow();
        void this.files()?.remove(old.file.id);
    }

    /** Keeps a live map's landmark, token or label off the players' picture,
        or puts it back — one object by `id`, or with no id every object of
        `kind`, ones placed later included. The Map Maker redraws the picture
        players already have without it, and the table shows that. */
    setHidden(key: string, kind: HideKind, id: string | null, hidden: boolean): void {
        if (!this.host) return;
        const e = this.entries.find((x) => x.key === key);
        if (!e || !e.mapId) return;
        const was = this.hides[e.mapId] ?? { kinds: [], ids: [] };
        const next: PlayerHide = id === null
            ? { kinds: hidden ? [...new Set([...was.kinds, kind])] : was.kinds.filter((k) => k !== kind), ids: was.ids }
            : { kinds: was.kinds, ids: hidden ? [...new Set([...was.ids, id])] : was.ids.filter((x) => x !== id) };
        /* Ids of objects no longer on the map are dropped as they go. */
        const onMap = new Set((e.objects ?? []).map((o) => o.id));
        next.ids = next.ids.filter((x) => onMap.has(x) || x === id);
        if (next.kinds.length || next.ids.length) this.hides[e.mapId] = next;
        else delete this.hides[e.mapId];
        this.save();
        this.showLocal();
        this.beatNow();
    }

    /** Every map off the table. */
    clear(): void {
        for (const e of [...this.entries]) this.remove(e.key);
    }

    /** Image files the GM chose, each a map of its own. */
    async useImages(files: File[]): Promise<void> {
        for (const f of files) await this.useImage(f);
    }

    /** An image file the GM chose: a new map, not on show yet. */
    async useImage(file: File): Promise<void> {
        if (!this.host) return;
        try {
            if (this.entries.length >= MAX_TABLE_MAPS) throw new Error('The table holds ' + MAX_TABLE_MAPS + ' maps at most: remove one first.');
            const img = await prepareImage(file);
            const title = cleanText(file.name.replace(/\.[^.]+$/, ''), LIMITS.MAX_TITLE) || 'Map';
            await this.stage(randomKey(), img.blob, img.w, img.h, title, false, null);
        } catch (e) {
            this.set({ error: e instanceof Error ? e.message : 'Could not use that image.' });
        }
    }

    /** Uploads a picture and files it under `key`: a new map, or a new
        picture of one already held, which keeps its place and, if it is on
        show, goes straight to the players. Pictures that arrive while one is
        uploading wait their turn; a newer picture of the same map replaces
        one still waiting. */
    private stage(
        key: string, blob: Blob, w: number, h: number, title: string, live: boolean, mapId: string | null,
        objects: MapObjectInfo[] = [],
    ): Promise<void> {
        const run = async () => {
            const files = this.files();
            if (!files) throw new Error('Not connected to a table.');
            if (!this.entries.some((e) => e.key === key) && this.entries.length >= MAX_TABLE_MAPS) {
                throw new Error('The table holds ' + MAX_TABLE_MAPS + ' maps at most: remove one first.');
            }
            this.uploading = true;
            this.uploadingKey = key;
            this.droppedWhileUploading = false;
            this.set({ loading: 0, error: '' });
            try {
                const file = await files.upload(blob, (f) => this.set({ loading: f }));
                if (this.droppedWhileUploading) { void files.remove(file.id); return; }
                const old = this.entries.find((e) => e.key === key);
                const next: Staged = { key, file, w, h, title, live, mapId, blob, objects };
                this.entries = old ? this.entries.map((e) => (e.key === key ? next : e)) : [...this.entries, next];
                this.save();
                this.showLocal();
                if (this.active === key) this.announce();
                else this.beatNow();
                if (old && old.file.id !== file.id) {
                    window.setTimeout(() => { void files.remove(old.file.id); }, RETIRE_MS);
                }
            } finally {
                this.uploading = false;
                this.uploadingKey = '';
                this.set({ loading: null });
            }
        };
        if (this.uploading) {
            return new Promise<void>((resolve, reject) => {
                /* A picture of this map still waiting is overtaken: it never needs sending. */
                this.queued.get(key)?.skip();
                this.queued.delete(key);
                this.queued.set(key, { run: () => run().then(resolve, reject), skip: resolve });
            });
        }
        return run().finally(() => this.drain());
    }

    private drain(): void {
        const first = this.queued.entries().next();
        if (first.done) return;
        const [key, next] = first.value;
        this.queued.delete(key);
        void next.run().catch(() => { /* reported by its own caller */ }).finally(() => this.drain());
    }

    /** The relay may have dropped a picture — an idle wipe, or the room's
        space filling up. Puts each missing one back under a new id. */
    async verify(): Promise<void> {
        const files = this.files();
        if (!this.host || !files || this.uploading) return;
        for (const s of [...this.entries]) {
            if (await files.present(s.file)) continue;
            if (!this.entries.some((e) => e.key === s.key && e.file.id === s.file.id)) continue;
            try {
                await this.stage(s.key, s.blob, s.w, s.h, s.title, s.live, s.mapId, s.objects);
            } catch { /* tried again at the next check */ }
        }
    }

    /** A player could not fetch this file. */
    missing(fileId: string): boolean {
        return this.entries.some((e) => e.file.id === fileId);
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
        const s = this.activeEntry();
        this.post({
            t: 'host', table: formatLobbyId(this.lobby),
            live: this.entries.filter((e) => e.live && e.mapId).map((e) => e.mapId!),
            active: s?.mapId ?? null,
            shown: !!s,
            hide: this.hides,
        });
    }

    private async onLink(m: LinkMessage | null): Promise<void> {
        if (!m || !this.host) return;
        if (m.t === 'ping') { this.beatNow(); return; }
        if (m.t === 'unlive') {
            const key = 'mm:' + m.mapId;
            const s = this.entries.find((e) => e.key === key);
            if (s && s.live) {
                this.entries = this.entries.map((e) => (e.key === key ? { ...e, live: false } : e));
                this.save();
                this.showLocal();
                if (this.active === key) this.announce();
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
            await this.stage('mm:' + m.mapId, m.image, w, h, title, m.live, m.mapId, m.objects);
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
           at every edit would be worse than a second of the old one. It
           keeps its own title until the new picture lands, since the GM may
           have switched to another map altogether. */
        this.set(this.view.url ? { loading: 0, error: '' } : { loading: 0, error: '', title, live });
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
