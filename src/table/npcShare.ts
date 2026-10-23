/* The GM's trainers shared at the table, and wild Pokémon given to players.

   On the GM's table this reads two things the GM screen in the same browser
   keeps: which roster trainers are shared with whom (`npcShares` in its saved
   state), and the trainers themselves, in the working set the License writes.
   Nothing new links the two pages: the GM screen saves, this notices.

   What travels is the cost that matters (the relay bills frames, not bytes):

     - nothing at rest. A trainer goes out when it changed, after 1.5 s with
       no further change (QUIET_MS) — the License writes on every key — and
       only the pieces that changed: the trainer itself (`t`), or one Pokémon
       of the team by its key. Each piece is deflated (zpart.ts);
     - whole, to someone who arrives (the session's welcome, paced), and to a
       player whose copy missed a piece (`npcwant`);
     - pictures — the trainer's photo, a Pokémon's own art — never on the
       socket: the GM uploads each once to the room's file store and a piece
       names it; a player keeps it by its hash (fileCache.ts).

   On a player's table every shared trainer is a working set of its own
   (npcMode.ts), which the License and the card open with `?npc=`. When the GM
   lets this player edit one, their changes go back the same way, a piece at a
   time, and the GM's table writes them into the GM's working set — where the
   GM screen, the License and the cards see them.

   A piece edited here and not yet sent is never overwritten by one arriving:
   the last one sent wins, which for two people changing the same Pokémon in
   the same second is the GM's or the player's, whichever reached the GM last.

   Who may do what (session.ts checks the sender's key before any of this):
     - only the GM's key shares, gives and withdraws;
     - a player's changes are taken only for a trainer shared with them and
       marked editable for them, and never touch its pictures, its PC boxes
       or which Pokémon are on its team — only their order, and the sheets;
     - a gift's answer only from the player it was offered to.

   Privacy is the client's: the room has one key, so a player not chosen for a
   trainer still receives its frames. The GM's menu says so. */

import { GM_KEY } from '../gm/constants';
import { NPC_KEY_PREFIX, WORKING_KEY } from '../state/constants';
import { normalizeGifts, normalizeNpcShares } from '../gm/state';
import type { GmGift, GmNpcShare } from '../gm/types';
import { mutateWorkingTrainer, readWorking } from '../gm/workingSet';
import { addMonToTrainer } from '../state/boxes';
import { defaultState } from '../state/defaults';
import { normalizeState } from '../state/normalize';
import { npcKey, readNpcIndex, writeNpcIndex } from '../state/npcMode';
import type { NpcCopy } from '../state/npcMode';
import type { MonEntry, TrainerState } from '../state/types';
import { sha256Hex } from './crypto';
import { utf8 } from './encoding';
import type { TableApi } from './link';
import { LIMITS, randomId } from './protocol';
import type { Body, GiftWhere, WireFile } from './protocol';
import { DEX_ID_RE } from './slim';
import { parseFile } from './validate';
import { packPart, unpackPart } from './zpart';

/** No further change for this long, and the change goes. */
const QUIET_MS = 1500;
/** A trainer edited without a pause still goes this often. */
const MAX_HOLD_MS = 6000;
const PUMP_MS = 700;
/** Packed pieces per frame, in characters: the rest of the frame is the
    envelope, and the relay's ceiling is on the sealed frame (session.ts). */
const FRAME_BUDGET = 16_000;
/** A player asks for a whole trainer again at most this often, and the GM
    answers one at most this often. */
const WANT_GAP_MS = 8000;
/** A Pokémon's own art past this is re-encoded smaller before it is shared. */
const PICTURE_SHRINK_BYTES = 160 * 1024;

const FILES_KEY = 'pokerole_table_npc_files';
const GIFT_RESULTS_KEY = 'pokerole_table_gift_results';
const GIFT_ANSWERS_KEY = 'pokerole_table_gift_answers';

/** Fields of a trainer that stay where they are: the id is the share's, the
    team goes in pieces, the pictures by file, and the PC boxes and the
    rulebook bookmarks are the GM's own business. */
const KEEP_HOME = new Set(['id', 'team', 'boxes', 'activeBox', 'photo', 'photoFile', 'manualBookmarks', 'manualVersions']);
const TRAINER_FIELDS = new Set(Object.keys(defaultState()));

/* ============================================================== pieces */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A team slot's key on the wire. A slot normalizeState has been through
    always has a uid. */
const monKey = (slot: MonEntry, i: number): string => slot.uid || 's' + i;

function trainerPiece(t: TrainerState): Rec {
    const out: Rec = {};
    for (const [k, v] of Object.entries(t)) if (!KEEP_HOME.has(k)) out[k] = v;
    return out;
}

function monPiece(slot: MonEntry): Rec {
    const sheet = isRec(slot.sheet) ? { ...slot.sheet } : null;
    if (sheet) { delete sheet.customImage; delete sheet.customImageFile; }
    const preview = isRec(slot.preview) ? { ...slot.preview } : null;
    if (preview) delete preview.custom;
    return { dexId: slot.dexId, sheet, preview };
}

/** The team's six slots, by key, '' for an empty one. */
function orderOf(t: TrainerState): string[] {
    const team = Array.isArray(t.team) ? t.team : [];
    return team.slice(0, LIMITS.TEAM_SLOTS).map((s, i) => (s && s.dexId ? monKey(s, i) : ''));
}

/** A trainer as pieces of text, pictures left out: what tells a change. */
interface Pieces { t: string; order: string; m: Map<string, string> }

function piecesOf(t: TrainerState): Pieces {
    const m = new Map<string, string>();
    const team = Array.isArray(t.team) ? t.team : [];
    team.slice(0, LIMITS.TEAM_SLOTS).forEach((s, i) => {
        if (s && s.dexId) m.set(monKey(s, i), JSON.stringify(monPiece(s)));
    });
    return { t: JSON.stringify(trainerPiece(t)), order: JSON.stringify(orderOf(t)), m };
}

/** A Pokémon piece as it arrives, checked. */
function parseMonPiece(v: unknown): { dexId: string; sheet: Rec | null; preview: Rec | null } | null {
    if (!isRec(v) || typeof v.dexId !== 'string' || !DEX_ID_RE.test(v.dexId)) return null;
    if (v.sheet !== null && !isRec(v.sheet)) return null;
    if (v.preview !== null && v.preview !== undefined && !isRec(v.preview)) return null;
    return { dexId: v.dexId, sheet: v.sheet as Rec | null, preview: (v.preview as Rec | null) ?? null };
}

/* ============================================================ pictures */

function dataUrlBlob(url: string): Blob | null {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(url);
    if (!m) return null;
    try {
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: m[1] });
    } catch { return null; }
}

/** A 512px PNG is ~700 KB, and a player keeps every shared one in
    localStorage: shared as WebP, it is a tenth of that. */
async function shrink(blob: Blob): Promise<Blob> {
    if (blob.size <= PICTURE_SHRINK_BYTES || typeof OffscreenCanvas === 'undefined') return blob;
    try {
        const bmp = await createImageBitmap(blob);
        const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
        const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
        canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
        return out.size < blob.size ? out : blob;
    } catch { return blob; }
}

function blobDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

/** The GM's side: each picture uploaded once, by what it is. Kept per table
    across reloads, so a GM who reloads uploads nothing again. */
class Pictures {
    private refs = new Map<string, WireFile>();
    private busy = new Map<string, Promise<WireFile | null>>();
    private checked = false;

    constructor(private api: TableApi, private lobby: string) {
        try {
            const raw = JSON.parse(localStorage.getItem(FILES_KEY) || 'null');
            if (raw && raw.lobby === lobby && isRec(raw.refs)) {
                for (const [k, v] of Object.entries(raw.refs)) {
                    const ref = parseFile(v);
                    if (ref) this.refs.set(k, ref);
                }
            }
        } catch { /* nothing kept */ }
    }

    private keep(): void {
        try {
            localStorage.setItem(FILES_KEY, JSON.stringify({ lobby: this.lobby, refs: Object.fromEntries(this.refs) }));
        } catch { /* quota: uploaded again after a reload */ }
    }

    /** The file a data URL is shared as; null for none, or one that could
        not be shared. */
    async ref(url: unknown): Promise<WireFile | null> {
        if (typeof url !== 'string' || !url.startsWith('data:image/')) return null;
        const files = this.api.files();
        if (!files) return null;
        const key = await sha256Hex(utf8(url));
        /* A relay idle for six hours forgot its files: one look, the first
           time a picture is wanted, for the whole set. */
        if (!this.checked) {
            this.checked = true;
            const inv = await files.inventory();
            if (inv) for (const [k, r] of [...this.refs]) if (!inv.has(r)) this.refs.delete(k);
        }
        const known = this.refs.get(key);
        if (known) return known;
        let job = this.busy.get(key);
        if (!job) {
            job = (async () => {
                const blob = dataUrlBlob(url);
                if (!blob) return null;
                try {
                    const ref = await files.upload(await shrink(blob));
                    this.refs.set(key, ref);
                    this.keep();
                    return ref;
                } catch { return null; } finally { this.busy.delete(key); }
            })();
            this.busy.set(key, job);
        }
        return job;
    }
}

/* ================================================== stored bookkeeping */

function readJson<T>(key: string): T | null {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJson(key: string, v: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
}

interface GiftResult { ok: boolean; where: GiftWhere; at: number }

/** What players answered, for the GM screen to apply (useGiftResults). */
export function readGiftResults(): Record<string, GiftResult> {
    const raw = readJson<Record<string, GiftResult>>(GIFT_RESULTS_KEY);
    return isRec(raw) ? raw as Record<string, GiftResult> : {};
}
export { GIFT_RESULTS_KEY };

function readStoredSet(id: string): TrainerState | null {
    const w = readJson<{ trainers?: { data?: unknown }[] }>(npcKey(id));
    const data = w && Array.isArray(w.trainers) && w.trainers[0] ? w.trainers[0].data : null;
    return data ? normalizeState(data) : null;
}

function writeStoredSet(t: TrainerState): void {
    writeJson(npcKey(t.id), { trainers: [{ id: t.id, name: t.name, fileName: null, data: t }], active: 0 });
}

/* ================================================================ view */

export interface NpcSheetView { id: string; name: string; edit: boolean; data: TrainerState | null }
export interface GiftOffer { oid: string; name: string; dexId: string; sheet: Rec | null }
export interface NpcView { sheets: NpcSheetView[]; gifts: GiftOffer[] }

interface Published {
    rev: number; to: string; edit: string; name: string; order: string;
    t: string; m: Map<string, string>;
}

/** A player's copy of one shared trainer. */
interface Copy {
    rev: number;
    name: string;
    edit: boolean;
    /** The pieces as last agreed with the GM — received or sent. */
    synced: Pieces;
    /** Which picture each piece has, by hash ('' for none). */
    pics: Map<string, string>;
    /** The stored text last seen, and when it last changed. */
    raw: string | null;
    changedAt: number;
    check: boolean;
    wantAt: number;
}

export class NpcShare {
    view: NpcView = { sheets: [], gifts: [] };

    private host = false;
    private lobby = '';
    private pump: number | null = null;
    private busy = false;

    /* GM's table */
    private pictures: Pictures | null = null;
    private rev = 0;
    private published = new Map<string, Published>();
    private publishedIds = '';
    private watch = new Map<string, { sig: string; at: number; first: number }>();
    private sentSig = new Map<string, string>();
    private sigCache = new WeakMap<object, string>();
    private urgent = new Set<string>();
    private oids = new Set<string>();
    private wantAnswered = new Map<string, number>();
    private gmRaw: string | null = null;
    private shares: Record<string, GmNpcShare> = {};
    private gifts: GmGift[] = [];
    private giftsSent = new Set<string>();

    /** One trainer goes out at a time, in order, whatever asked for it. */
    private sending: Promise<void> = Promise.resolve();

    /* player's table */
    private copies = new Map<string, Copy>();
    private firstWantAt = new Map<string, number>();

    constructor(private api: TableApi) {}

    begin(isHost: boolean, lobby: string): void {
        this.end();
        this.host = isHost;
        this.lobby = lobby;
        if (isHost) {
            this.pictures = new Pictures(this.api, lobby);
            /* Above anything a page of the GM's sent before a reload, so a
               player's copy never mistakes the new numbers for old ones. */
            this.rev = Date.now();
        } else {
            this.loadCopies();
        }
        this.pump = window.setInterval(() => { void this.tick(); }, PUMP_MS);
        window.addEventListener('storage', this.onStorage);
    }

    end(): void {
        if (this.pump !== null) clearInterval(this.pump);
        if (this.later !== null) clearTimeout(this.later);
        this.pump = this.later = null;
        window.removeEventListener('storage', this.onStorage);
        this.published.clear();
        this.publishedIds = '';
        this.watch.clear();
        this.sentSig.clear();
        this.urgent.clear();
        this.giftsSent.clear();
        this.gmRaw = null;
        this.copies.clear();
        this.firstWantAt.clear();
        this.view = { sheets: [], gifts: [] };
    }

    /* The pump alone is not enough. The GM's table is usually a tab in the
       background while the GM works in the GM screen, and the player's while
       they edit in the License — and Chrome runs a hidden tab's timers once
       a minute after five minutes. A share, a right to edit or an edit then
       took up to a minute, and looked like it needed a reload. Another tab's
       write raises `storage` here at once, hidden or not: that runs a look
       now, and one more when the quiet wait is over. */
    private later: number | null = null;
    private again = false;

    private onStorage = (e: StorageEvent): void => {
        const k = e.key;
        const ours = k === null || (this.host ? k === GM_KEY || k === WORKING_KEY : k.startsWith(NPC_KEY_PREFIX));
        if (!ours) return;
        void this.tick();
        if (this.later !== null) clearTimeout(this.later);
        this.later = window.setTimeout(() => { this.later = null; void this.tick(); }, QUIET_MS + 100);
    };

    private async tick(): Promise<void> {
        if (this.busy) { this.again = true; return; }
        this.busy = true;
        try {
            do {
                this.again = false;
                if (this.host) await this.hostTick();
                else await this.playerTick();
            } while (this.again);
        } finally { this.busy = false; }
    }

    /* ======================================================== GM's table */

    /** The GM screen's shares and gifts, re-read only when it saved. */
    private readGm(): void {
        let raw: string | null = null;
        try { raw = localStorage.getItem(GM_KEY); } catch { /* private mode */ }
        if (raw === this.gmRaw) return;
        this.gmRaw = raw;
        let r: Rec = {};
        try { const p = raw ? JSON.parse(raw) : null; if (isRec(p)) r = p; } catch { /* corrupt */ }
        const ids = Array.isArray(r.trainerIds) ? r.trainerIds.filter((x): x is string => typeof x === 'string') : [];
        this.shares = normalizeNpcShares(r.npcShares, ids);
        this.gifts = normalizeGifts(r.gifts).slice(0, LIMITS.MAX_GIFTS);
    }

    private trainer(id: string): TrainerState | null {
        const w = readWorking();
        const t = w && Array.isArray(w.trainers) ? w.trainers.find((x) => x.id === id) : null;
        return t && t.data ? t.data : null;
    }

    /** What would change on the wire: the stored trainer, and its share. */
    private signature(data: TrainerState, share: GmNpcShare): string {
        let s = this.sigCache.get(data);
        if (s === undefined) { s = JSON.stringify(data); this.sigCache.set(data, s); }
        return s + JSON.stringify(share);
    }

    private async hostTick(): Promise<void> {
        this.readGm();
        const ids = Object.keys(this.shares).filter((id) => this.trainer(id));
        const idsText = JSON.stringify(ids);
        if (idsText !== this.publishedIds) {
            this.publishedIds = idsText;
            for (const id of [...this.published.keys()]) if (!ids.includes(id)) {
                this.published.delete(id);
                this.sentSig.delete(id);
            }
            void this.api.publish({ k: 'npcs', ids });
        }
        const now = Date.now();
        for (const id of ids) {
            const data = this.trainer(id)!;
            const sig = this.signature(data, this.shares[id]);
            const w = this.watch.get(id) ?? { sig: '', at: 0, first: 0 };
            this.watch.set(id, w);
            if (sig !== w.sig) { w.sig = sig; w.at = now; if (!w.first) w.first = now; }
            if (sig === this.sentSig.get(id)) { w.first = 0; continue; }
            const due = this.urgent.has(id) || now - w.at >= QUIET_MS || (w.first > 0 && now - w.first >= MAX_HOLD_MS);
            if (!due) continue;
            this.urgent.delete(id);
            await this.send(id, false);
            this.sentSig.set(id, sig);
            w.first = 0;
        }
        this.hostGifts();
    }

    private send(id: string, whole: boolean): Promise<void> {
        const run = this.sending.then(() => this.sendNow(id, whole));
        this.sending = run.catch(() => undefined);
        return run;
    }

    /** One trainer to the table: whole, or what changed since it last went. */
    private async sendNow(id: string, whole: boolean): Promise<void> {
        const raw = this.trainer(id);
        const share = this.shares[id];
        if (!raw || !share) return;
        const data = normalizeState(raw);
        const prev = this.published.get(id);
        const to = JSON.stringify(share.to);
        const edit = JSON.stringify(share.edit);
        /* Someone newly let in has no copy to add to. */
        const full = whole || !prev || prev.to !== to;

        const order = orderOf(data);
        const t = JSON.stringify({ ...trainerPiece(data), _img: await this.pictures!.ref(data.photo) });
        const m = new Map<string, string>();
        for (const [i, slot] of (data.team || []).slice(0, LIMITS.TEAM_SLOTS).entries()) {
            if (!slot || !slot.dexId) continue;
            const sheet = isRec(slot.sheet) ? slot.sheet : null;
            m.set(monKey(slot, i), JSON.stringify({ ...monPiece(slot), _img: await this.pictures!.ref(sheet?.customImage) }));
        }

        const pieces: [string, string][] = [];
        if (full || t !== prev!.t) pieces.push(['', t]);
        for (const [k, text] of m) if (full || text !== prev!.m.get(k)) pieces.push([k, text]);
        const orderText = JSON.stringify(order);
        const name = data.name || 'Trainer';
        if (!full && !pieces.length && orderText === prev!.order && edit === prev!.edit && name === prev!.name) return;

        /* Packed, then as many to a frame as fit. */
        const packed: [string, string][] = [];
        for (const [k, text] of pieces) {
            const z = await packPart(text);
            if (z.length > FRAME_BUDGET) {
                this.api.notify((name) + '’s sheet is too long to share whole: shorten its notes.');
                continue;
            }
            packed.push([k, z]);
        }
        const frames: [string, string][][] = [[]];
        let size = 0;
        for (const p of packed) {
            if (size + p[1].length > FRAME_BUDGET && frames[frames.length - 1].length) { frames.push([]); size = 0; }
            frames[frames.length - 1].push(p);
            size += p[1].length;
        }
        /* A whole one starts with the trainer: the frame that says "whole"
           must carry it. */
        if (full) frames.sort((a, b) => Number(b.some((p) => p[0] === '')) - Number(a.some((p) => p[0] === '')));
        if (full && !frames[0].some((p) => p[0] === '')) return;

        let base = full ? 0 : prev!.rev;
        frames.forEach((frame, i) => {
            const rev = ++this.rev;
            const tz = frame.find((p) => p[0] === '');
            const mz = frame.filter((p) => p[0] !== '');
            void this.api.publish({
                k: 'npc', id, rev, base, full: full && i === 0, name, to: share.to, edit: share.edit, order,
                ...(tz ? { t: tz[1] } : {}),
                ...(mz.length ? { m: Object.fromEntries(mz) } : {}),
            });
            base = rev;
        });
        this.published.set(id, { rev: base, to, edit, name, order: orderText, t, m });
    }

    /** A player's changes to a trainer they may edit, into the GM's set. */
    async onSet(member: string, body: Extract<Body, { k: 'npcset' }>): Promise<void> {
        if (!this.host) return;
        this.readGm();
        const share = this.shares[body.id];
        if (!share || (share.to && !share.to.includes(member)) || !share.edit.includes(member)) return;
        if (this.oids.has(body.oid)) return;
        this.oids.add(body.oid);
        if (this.oids.size > 256) this.oids.delete(this.oids.values().next().value!);

        const t = body.t === undefined ? null : await unpackPart(body.t);
        if (body.t !== undefined && !isRec(t)) return;
        const mons = new Map<string, NonNullable<ReturnType<typeof parseMonPiece>>>();
        for (const [k, z] of Object.entries(body.m ?? {})) {
            const piece = parseMonPiece(await unpackPart(z));
            if (!piece) return;
            mons.set(k, piece);
        }

        mutateWorkingTrainer(body.id, (stored) => {
            let data = normalizeState(stored);
            if (t) {
                const next: Rec = { ...data };
                for (const [k, v] of Object.entries(t)) if (TRAINER_FIELDS.has(k) && !KEEP_HOME.has(k)) next[k] = v;
                data = normalizeState(next);
            }
            const team = data.team.slice();
            const keys = team.map(monKey);
            for (const [k, piece] of mons) {
                const at = keys.indexOf(k);
                const slot = team[at];
                if (at < 0 || !slot || !slot.dexId) continue;
                const old = isRec(slot.sheet) ? slot.sheet : {};
                const oldPreview = isRec(slot.preview) ? slot.preview : {};
                team[at] = {
                    ...slot,
                    dexId: piece.dexId,
                    sheet: piece.sheet && {
                        ...piece.sheet,
                        ...(old.customImage !== undefined ? { customImage: old.customImage } : {}),
                        ...(old.customImageFile !== undefined ? { customImageFile: old.customImageFile } : {}),
                    },
                    preview: piece.preview && {
                        ...piece.preview,
                        ...(oldPreview.custom !== undefined ? { custom: oldPreview.custom } : {}),
                    },
                } as MonEntry;
            }
            /* A new order of the same Pokémon, and nothing else. */
            if (body.order) {
                const mine = team.slice(0, LIMITS.TEAM_SLOTS).map((s, i) => (s && s.dexId ? keys[i] : '')).filter(Boolean).sort();
                const theirs = body.order.filter(Boolean).sort();
                if (JSON.stringify(mine) === JSON.stringify(theirs)) {
                    const empty = (): MonEntry => ({ dexId: '', sheet: null, preview: null });
                    const moved = body.order.map((k) => (k ? team[keys.indexOf(k)] : empty()));
                    while (moved.length < LIMITS.TEAM_SLOTS) moved.push(empty());
                    team.splice(0, LIMITS.TEAM_SLOTS, ...moved.slice(0, LIMITS.TEAM_SLOTS));
                }
            }
            data.team = team;
            for (const k of Object.keys(stored)) delete (stored as unknown as Rec)[k];
            Object.assign(stored, data);
        });
        this.urgent.add(body.id);
        void this.tick();
    }

    /** A player's copy missed a piece: the whole trainer again. */
    onWant(member: string, id: string): void {
        if (!this.host) return;
        this.readGm();
        const share = this.shares[id];
        if (!share || (share.to && !share.to.includes(member))) return;
        const now = Date.now();
        if (now - (this.wantAnswered.get(id) ?? 0) < WANT_GAP_MS) return;
        this.wantAnswered.set(id, now);
        void this.send(id, true);
    }

    /** The welcome (`all`): every shared trainer whole, and every gift still
        waiting. Each heartbeat: the gifts alone, for a player who was away. */
    greet(all: boolean): void {
        if (!this.host) return;
        this.readGm();
        if (all) {
            const ids = Object.keys(this.shares).filter((id) => this.trainer(id));
            this.publishedIds = JSON.stringify(ids);
            void this.api.publish({ k: 'npcs', ids });
            for (const id of ids) void this.send(id, true);
        }
        for (const g of this.pendingGifts()) void this.sendGift(g);
    }

    /* ------------------------------------------------------------- gifts */

    private pendingGifts(): GmGift[] {
        const done = readGiftResults();
        return this.gifts.filter((g) => !done[g.oid]);
    }

    private hostGifts(): void {
        const pending = this.pendingGifts();
        for (const g of pending) if (!this.giftsSent.has(g.oid)) { this.giftsSent.add(g.oid); void this.sendGift(g); }
        /* Taken back by the GM before an answer came. */
        for (const oid of [...this.giftsSent]) {
            if (pending.some((g) => g.oid === oid)) continue;
            this.giftsSent.delete(oid);
            if (!readGiftResults()[oid]) void this.api.publish({ k: 'giftoff', oid });
        }
    }

    private async sendGift(g: GmGift): Promise<void> {
        const sheet: Rec = { ...g.sheet };
        const img = await this.pictures!.ref(sheet.customImage);
        delete sheet.customImage;
        delete sheet.customImageFile;
        const z = await packPart(JSON.stringify({ dexId: g.dexId, sheet, _img: img }));
        if (z.length > FRAME_BUDGET) return;
        const name = String(sheet.nickname || '') || g.dexId.charAt(0).toUpperCase() + g.dexId.slice(1);
        void this.api.publish({ k: 'gift', to: g.to, oid: g.oid, name, z });
    }

    onGiftReply(member: string, body: Extract<Body, { k: 'giftr' }>, who: string): void {
        if (!this.host) return;
        this.readGm();
        const g = this.gifts.find((x) => x.oid === body.oid);
        const done = readGiftResults();
        if (!g || g.to !== member || done[body.oid]) return;
        /* A week of answers is plenty for the GM screen to have read them. */
        const cutoff = Date.now() - 7 * 86_400_000;
        const kept = Object.fromEntries(Object.entries(done).filter(([, r]) => r.at > cutoff));
        writeJson(GIFT_RESULTS_KEY, { ...kept, [body.oid]: { ok: body.ok, where: body.where, at: Date.now() } });
        this.api.notify(body.ok
            ? who + ' took the Pokémon you gave' + (body.where === 'box' ? ' (team full: it went to a PC box).' : '.')
            : who + ' turned down the Pokémon you offered.');
    }

    /* ==================================================== player's table */

    private loadCopies(): void {
        const index = readNpcIndex();
        if (!index) return;
        if (index.lobby !== this.lobby) { this.forgetAll(); return; }
        for (const c of index.list) {
            const data = readStoredSet(c.id);
            if (!data) continue;
            this.copies.set(c.id, {
                rev: c.rev, name: c.name, edit: c.edit, synced: piecesOf(data), pics: new Map(),
                raw: localStorage.getItem(npcKey(c.id)), changedAt: 0, check: false, wantAt: 0,
            });
        }
        this.refreshView();
    }

    private saveIndex(): void {
        const list: NpcCopy[] = [...this.copies].map(([id, c]) => ({ id, name: c.name, edit: c.edit, rev: c.rev }));
        writeNpcIndex(list.length ? { lobby: this.lobby, list } : null);
    }

    private refreshView(): void {
        this.view = {
            ...this.view,
            sheets: [...this.copies].map(([id, c]) => ({ id, name: c.name, edit: c.edit, data: readStoredSet(id) })),
        };
        this.api.changed();
    }

    private drop(id: string): void {
        if (!this.copies.delete(id)) return;
        try { localStorage.removeItem(npcKey(id)); } catch { /* gone anyway */ }
        this.saveIndex();
        this.refreshView();
    }

    /** Leaving the table: every copy goes with it. */
    forgetAll(): void {
        const index = readNpcIndex();
        for (const c of index?.list ?? []) {
            try { localStorage.removeItem(npcKey(c.id)); } catch { /* gone anyway */ }
        }
        writeNpcIndex(null);
        this.copies.clear();
        this.view = { sheets: [], gifts: [] };
    }

    onList(ids: string[]): void {
        if (this.host) return;
        for (const id of [...this.copies.keys()]) if (!ids.includes(id)) this.drop(id);
    }

    private want(id: string): void {
        const c = this.copies.get(id);
        const now = Date.now();
        if (c && now - c.wantAt < WANT_GAP_MS) return;
        if (c) c.wantAt = now;
        void this.api.publish({ k: 'npcwant', id });
    }

    async onNpc(body: Extract<Body, { k: 'npc' }>): Promise<void> {
        if (this.host) return;
        const me = this.api.myId();
        if (body.to && !body.to.includes(me)) { this.drop(body.id); return; }
        let c = this.copies.get(body.id);
        /* A piece of a version this copy is not at: missed one on the way,
           or never had the start. */
        if (!body.full && (!c || c.rev !== body.base)) {
            if (c) this.want(body.id);
            else if (Date.now() - (this.firstWantAt.get(body.id) ?? 0) >= WANT_GAP_MS) {
                this.firstWantAt.set(body.id, Date.now());
                void this.api.publish({ k: 'npcwant', id: body.id });
            }
            return;
        }
        const fresh = !c;
        if (!c) {
            c = {
                rev: 0, name: body.name, edit: false, synced: { t: '', order: '', m: new Map() }, pics: new Map(),
                raw: null, changedAt: 0, check: false, wantAt: 0,
            };
            this.copies.set(body.id, c);
        }

        const stored = readStoredSet(body.id);
        let data: TrainerState = stored ?? normalizeState({ ...defaultState(), id: body.id, team: [] });
        data.id = body.id;
        const local = stored ? piecesOf(stored) : null;
        /* Edited here and not sent yet: this browser's stays. A copy this
           player may not edit has nothing of theirs to keep. */
        const mine = (k: 't' | 'order' | string): boolean => {
            if (!local || !c!.edit) return false;
            if (k === 't') return local.t !== c!.synced.t;
            if (k === 'order') return local.order !== c!.synced.order;
            return (local.m.get(k) ?? '') !== (c!.synced.m.get(k) ?? '');
        };
        const pictures: { part: string; ref: WireFile | null }[] = [];

        if (body.t !== undefined) {
            const piece = await unpackPart(body.t);
            if (isRec(piece)) {
                const img = piece._img === null ? null : parseFile(piece._img);
                delete piece._img;
                if (fresh || body.full || !mine('t')) {
                    const next: Rec = { ...data };
                    for (const [k, v] of Object.entries(piece)) if (TRAINER_FIELDS.has(k) && !KEEP_HOME.has(k)) next[k] = v;
                    data = normalizeState(next);
                    data.id = body.id;
                }
                pictures.push({ part: '', ref: img });
            }
        }

        const byKey = new Map<string, MonEntry>();
        (data.team || []).forEach((s, i) => { if (s && s.dexId) byKey.set(monKey(s, i), s); });
        if (fresh || !mine('order')) {
            const empty = (): MonEntry => ({ dexId: '', sheet: null, preview: null });
            const team = body.order.map((k) => (k ? byKey.get(k) ?? { uid: k, dexId: '', sheet: null, preview: null } : empty()));
            while (team.length < LIMITS.TEAM_SLOTS) team.push(empty());
            data.team = team;
        }
        for (const [k, z] of Object.entries(body.m ?? {})) {
            const raw = await unpackPart(z);
            const img = isRec(raw) ? (raw._img === null ? null : parseFile(raw._img)) : null;
            const piece = parseMonPiece(raw);
            if (!piece) continue;
            const at = data.team.findIndex((s, i) => monKey(s, i) === k || s.uid === k);
            if (at < 0) continue;
            if (!fresh && !body.full && mine(k)) continue;
            const old = data.team[at];
            const keep = isRec(old.sheet) && typeof old.sheet.customImage === 'string' ? { customImage: old.sheet.customImage } : {};
            data.team[at] = { uid: k, dexId: piece.dexId, sheet: piece.sheet && { ...piece.sheet, ...keep }, preview: piece.preview };
            pictures.push({ part: k, ref: img });
        }

        data = normalizeState(data);
        data.id = body.id;
        writeStoredSet(data);
        const now = piecesOf(data);
        /* Agreed: what was taken from the GM. What was kept back stays as it
           was agreed before, so it still reads as edited and goes out. */
        c.synced = {
            t: fresh || body.full || !mine('t') ? now.t : c.synced.t,
            order: fresh || !mine('order') ? now.order : c.synced.order,
            m: new Map([...now.m].map(([k, text]) => [k, (fresh || body.full || !mine(k)) ? text : (c!.synced.m.get(k) ?? text)])),
        };
        c.raw = localStorage.getItem(npcKey(body.id));
        c.rev = body.rev;
        c.name = body.name;
        c.edit = body.edit.includes(me);
        this.saveIndex();
        this.refreshView();
        for (const p of pictures) void this.picture(body.id, p.part, p.ref);
    }

    /** A piece's picture, fetched (or from this browser's cache) and put on
        the stored copy, where it changes nothing that tells an edit. */
    private async picture(id: string, part: string, ref: WireFile | null): Promise<void> {
        const c = this.copies.get(id);
        if (!c || (c.pics.get(part) ?? '') === (ref ? ref.sha : '')) return;
        let url = '';
        if (ref) {
            const files = this.api.files();
            if (!files) return;
            try { url = await blobDataUrl(await files.download(ref)); } catch { return; }
        }
        const data = readStoredSet(id);
        if (!data || !this.copies.has(id)) return;
        if (part === '') data.photo = url;
        else {
            const slot = data.team.find((s, i) => monKey(s, i) === part);
            if (!slot) return;
            slot.sheet = { ...(slot.sheet || {}), customImage: url };
        }
        writeStoredSet(data);
        c.pics.set(part, ref ? ref.sha : '');
        c.raw = localStorage.getItem(npcKey(id));
        this.refreshView();
    }

    /** Changes made in this browser — the License or a card opened on a copy
        this player may edit — go back after a quiet moment. */
    private async playerTick(): Promise<void> {
        const now = Date.now();
        for (const [id, c] of this.copies) {
            let raw: string | null = null;
            try { raw = localStorage.getItem(npcKey(id)); } catch { /* private mode */ }
            if (raw !== c.raw) {
                c.raw = raw;
                c.changedAt = now;
                c.check = true;
                this.refreshView();
            }
            if (!c.check || !c.edit || now - c.changedAt < QUIET_MS) continue;
            c.check = false;
            const data = readStoredSet(id);
            if (!data) continue;
            const local = piecesOf(data);
            const body: Extract<Body, { k: 'npcset' }> = { k: 'npcset', id, oid: randomId(6) };
            if (local.t !== c.synced.t) body.t = await packPart(local.t);
            const m: Record<string, string> = {};
            for (const [k, text] of local.m) if (text !== c.synced.m.get(k)) m[k] = await packPart(text);
            if (Object.keys(m).length) body.m = m;
            if (local.order !== c.synced.order) body.order = JSON.parse(local.order);
            if (body.t === undefined && body.m === undefined && body.order === undefined) continue;
            c.synced = local;
            void this.api.publish(body);
        }
    }

    /* ------------------------------------------------------- gifts, here */

    private answers(): Record<string, { ok: boolean; where: GiftWhere }> {
        const raw = readJson<Record<string, { ok: boolean; where: GiftWhere }>>(GIFT_ANSWERS_KEY);
        return isRec(raw) ? raw as Record<string, { ok: boolean; where: GiftWhere }> : {};
    }

    async onGift(body: Extract<Body, { k: 'gift' }>): Promise<void> {
        if (this.host || body.to !== this.api.myId()) return;
        /* Answered already, and the answer lost on the way: again. */
        const done = this.answers()[body.oid];
        if (done) { void this.api.publish({ k: 'giftr', oid: body.oid, ok: done.ok, where: done.where }); return; }
        if (this.view.gifts.some((g) => g.oid === body.oid)) return;
        const raw = await unpackPart(body.z);
        if (!isRec(raw) || typeof raw.dexId !== 'string' || !DEX_ID_RE.test(raw.dexId)) return;
        const sheet = isRec(raw.sheet) ? { ...raw.sheet } : null;
        const img = raw._img === null ? null : parseFile(raw._img);
        if (img && sheet) {
            const files = this.api.files();
            try { if (files) sheet.customImage = await blobDataUrl(await files.download(img)); } catch { /* the species' own art */ }
        }
        if (this.view.gifts.some((g) => g.oid === body.oid)) return;
        this.view = { ...this.view, gifts: [...this.view.gifts, { oid: body.oid, name: body.name, dexId: raw.dexId, sheet }] };
        this.api.changed();
    }

    onGiftOff(oid: string): void {
        if (this.host || !this.view.gifts.some((g) => g.oid === oid)) return;
        this.view = { ...this.view, gifts: this.view.gifts.filter((g) => g.oid !== oid) };
        this.api.changed();
    }

    /** Takes a gift onto `trainerId`, or turns it down (null). False when the
        trainer has no room anywhere: the offer stays open. */
    answer(oid: string, trainerId: string | null): boolean {
        const g = this.view.gifts.find((x) => x.oid === oid);
        if (!g) return true;
        let where: GiftWhere = '';
        if (trainerId) {
            mutateWorkingTrainer(trainerId, (t) => {
                const put = addMonToTrainer(t, { dexId: g.dexId, sheet: g.sheet as MonEntry['sheet'], preview: null });
                if (put) where = put.where;
            });
            if (!where) return false;
        }
        const ok = where !== '';
        const all = this.answers();
        const kept = Object.entries(all).slice(-49);
        writeJson(GIFT_ANSWERS_KEY, { ...Object.fromEntries(kept), [oid]: { ok, where } });
        void this.api.publish({ k: 'giftr', oid, ok, where });
        this.view = { ...this.view, gifts: this.view.gifts.filter((x) => x.oid !== oid) };
        this.api.changed();
        return true;
    }
}
