/* The sheet watch: what a player's own trainer did, for the GM's eyes only.

   A player's page sends the trainer it plays at the table (and the one in a
   fight, if that is another) as a `WatchSheet` (watchSheet.ts), deflated, in
   a frame or two — `wsh` — whenever it changed: after 3 s with no further
   change (QUIET_MS), at most every 10 s while it keeps changing, at once when
   the GM's page starts again, and one last time before a Leave, followed by
   `bye`. Nothing goes at rest, and nothing is shown to the player.

   The GM's table keeps the latest copy of each, in this browser
   (SHEETS_KEY), and for every new one:
     - writes what changed into the log (LOG_KEY), each line rated: a rise
       is a warning unless something explains it — the GM's own change from
       the GM screen (`pcop`), a potion spent in the same breath, a Pokémon the
       GM gave, a Mega Evolution;
     - says whether it happened in a fight (and which Round), out of one, or
       unwatched: the first copy after a player comes back is compared with
       the last one seen, so a change made between sessions shows too.

   And it sets a player's copy beside the GM's own trainer with the same id
   (or the same name, or the one the GM picked) — on the GM's Compare, when a
   player arrives, and when they leave, by Leave or by going quiet, from the
   last copy they sent. Nothing is written to either sheet, except when the
   GM asks for Sync (watchSync.ts): the copy into the GM's own trainer.

   The GM screen in the same browser reads the log from storage (WatchBell).
   What a player's browser sends is that browser's word: this sees changes made
   with the app, not a page altered in the developer tools. */

import { mutateWorkingTrainer, readWorking } from '../gm/workingSet';
import { WORKING_KEY } from '../state/constants';
import type { TrainerState } from '../state/types';
import type { PcOp } from '../lib/combatLink';
import { chosenTrainerId } from './character';
import type { TableApi } from './link';
import { randomId } from './protocol';
import type { Body, WireTurns } from './protocol';
import type { CharKey } from './slim';
import { ID_RE, diffSheets, parseWatchSheet, watchSheet } from './watchSheet';
import type { Change, WatchSheet } from './watchSheet';
import { packPart, unpackPart } from './zpart';
import { headline } from './watchText';
import { syncTrainer } from './watchSync';
import type { SyncResult } from './watchSync';

const QUIET_MS = 3000;
const MAX_HOLD_MS = 10_000;
const PUMP_MS = 1000;
/** Packed characters per frame, as npcShare's budget. */
const CHUNK = 14_000;
export const MAX_PARTS = 8;
/** How long the GM's own change, a potion or a gift explains a rise. */
const EXPLAINS_MS = 3 * 60_000;
const MAX_LOG = 600;
const MAX_CHANGES = 80;
const MAX_MEMBERS = 32;
const MAX_TIDS = 3;
const POTION_HP: Record<string, number> = { potion: 2, superPotion: 4, hyperPotion: 14 };
/** The GM's "none of mine" in Compare, kept apart from "not picked yet". */
const NO_MATCH = '-';

export const LOG_KEY = 'pokerole_table_watch';
export const SEEN_KEY = 'pokerole_table_watch_seen';
const SHEETS_KEY = 'pokerole_table_watch_sheets';

export type WatchCtx = 'fight' | 'free' | 'away';

export interface WatchEntry {
    id: string;
    at: number;
    member: string;
    player: string;
    color?: number;
    /** A change seen, a player arriving or leaving (with the comparison). */
    kind: 'change' | 'join' | 'left';
    ctx: WatchCtx;
    round?: number;
    fight?: string;
    trainer: string;
    /** The GM's trainer the copy was compared with ('join' / 'left'). */
    gm?: string;
    note?: string;
    changes: Change[];
    warn: boolean;
    /** The GM marked it as fine. */
    ok?: boolean;
}

export interface WatchLog { lobby: string; log: WatchEntry[] }

interface Kept { name: string; at: number; sheet: WatchSheet }
interface KeptMember { player: string; color?: number; at: number; t: Record<string, Kept> }
interface SheetStore {
    lobby: string;
    by: Record<string, KeptMember>;
    /** member:tid -> the GM's trainer id the GM picked for it. */
    match: Record<string, string>;
    /** member:tid -> the last comparison logged, so a GM reload logs none again. */
    cmp: Record<string, string>;
}

export interface WatchPlayer { member: string; player: string; color?: number; at: number; trainers: { id: string; name: string; at: number }[] }
export interface WatchView { log: WatchEntry[]; unseen: number; players: WatchPlayer[]; flash: { text: string; at: number } | null }

export interface Comparison {
    player: string;
    trainer: string;
    tid: string;
    at: number;
    gm: { id: string; name: string } | null;
    /** How the GM's trainer was found. */
    by: 'picked' | 'id' | 'name' | null;
    changes: Change[];
}

export interface WatchHooks {
    strip(): WireTurns | null;
    /** Player: the trainer whose characters are in the fight. */
    boundTrainer(): string | null;
    /** GM: the GM's changes to this member's characters, newest last. */
    recentOps(member: string): { key: CharKey; op: PcOp; at: number }[];
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function readJson(key: string): unknown {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJson(key: string, v: unknown): boolean {
    try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

export function readWatchLog(): WatchLog | null {
    const raw = readJson(LOG_KEY);
    return isRec(raw) && typeof raw.lobby === 'string' && Array.isArray(raw.log) ? raw as unknown as WatchLog : null;
}
export function readSeen(): number {
    try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
}
export function markSeen(at = Date.now()): void {
    try { localStorage.setItem(SEEN_KEY, String(at)); } catch { /* private mode */ }
}
export const unseenCount = (log: WatchEntry[], seen: number): number =>
    log.filter((e) => e.warn && !e.ok && e.at > seen).length;

/** Forgotten with the table (Close table). */
export function forgetWatch(): void {
    try { for (const k of [LOG_KEY, SEEN_KEY, SHEETS_KEY]) localStorage.removeItem(k); } catch { /* private mode */ }
}

function trainerData(id: string): TrainerState | null {
    const w = readWorking();
    const t = w && Array.isArray(w.trainers) ? w.trainers.find((x) => x.id === id) : null;
    return t && t.data ? t.data : null;
}

/** The GM's roster trainers, for matching and the Compare picker. */
export function gmTrainers(): { id: string; name: string }[] {
    const w = readWorking();
    return (w && Array.isArray(w.trainers) ? w.trainers : [])
        .filter((t) => t && t.id && t.data)
        .map((t) => ({ id: t.id, name: t.data.name || t.name || 'Unnamed' }));
}

const nameKey = (s: string): string => s.trim().toLocaleLowerCase();

export class SheetWatch {
    view: WatchView = { log: [], unseen: 0, players: [], flash: null };

    private host = false;
    private lobby = '';
    private pump: number | null = null;
    private later: number | null = null;

    /* player */
    private mine = new Map<string, { text: string; changedAt: number; firstAt: number; sent: string }>();
    private urgent = false;
    private busy = false;
    private again = false;

    /* GM */
    private store: SheetStore = { lobby: '', by: {}, match: {}, cmp: {} };
    private log: WatchEntry[] = [];
    private parts = new Map<string, { set: string; n: number; got: (string | undefined)[] }>();
    /** member:tid seen since this page started: the next copy is live. */
    private live = new Set<string>();
    private online = new Set<string>();
    /** member -> HP that potions just spent may still account for. */
    private potionHp = new Map<string, { hp: number; at: number }>();
    /** member -> their copies being taken in, one after another, so a
        goodbye is never handled before the copy that came before it. */
    private chain = new Map<string, Promise<void>>();
    private giftAt = new Map<string, number>();
    private leftLogged = new Set<string>();

    constructor(private api: TableApi, private hooks: WatchHooks) {}

    begin(isHost: boolean, lobby: string): void {
        this.end();
        this.host = isHost;
        this.lobby = lobby;
        if (isHost) {
            this.loadStore();
            this.refresh();
            window.addEventListener('storage', this.onGmStorage);
        } else {
            this.pump = window.setInterval(() => { void this.tick(); }, PUMP_MS);
            window.addEventListener('storage', this.onStorage);
            this.urgent = true;
        }
    }

    end(): void {
        if (this.pump !== null) clearInterval(this.pump);
        if (this.later !== null) clearTimeout(this.later);
        this.pump = this.later = null;
        window.removeEventListener('storage', this.onStorage);
        window.removeEventListener('storage', this.onGmStorage);
        this.mine.clear();
        this.parts.clear();
        this.live.clear();
        this.online.clear();
        this.leftLogged.clear();
        this.potionHp.clear();
        this.chain.clear();
        this.view = { log: [], unseen: 0, players: [], flash: null };
    }

    /* ==================================================== player's table */

    /** A License or card in another tab wrote the sheet: look now, and once
        more when the quiet wait is over (a hidden tab's timers are slow). */
    private onStorage = (e: StorageEvent): void => {
        if (e.key !== null && e.key !== WORKING_KEY && e.key !== 'pokerole_table_trainer') return;
        void this.tick();
        if (this.later !== null) clearTimeout(this.later);
        this.later = window.setTimeout(() => { this.later = null; void this.tick(); }, QUIET_MS + 100);
    };

    /** The GM's page started again: it has nothing to compare with yet. */
    resend(): void {
        if (this.host) return;
        for (const s of this.mine.values()) s.sent = '';
        this.urgent = true;
        void this.tick();
    }

    private watched(): string[] {
        const ids = [chosenTrainerId(), this.hooks.boundTrainer()].filter((x): x is string => !!x);
        return [...new Set(ids)];
    }

    private async tick(force = false): Promise<void> {
        if (this.host) return;
        if (this.busy) { this.again = true; return; }
        this.busy = true;
        try {
            do {
                this.again = false;
                const now = Date.now();
                const urgent = this.urgent || force;
                this.urgent = false;
                for (const id of this.watched()) {
                    const data = trainerData(id);
                    if (!data) continue;
                    const sheet = watchSheet(data);
                    if (!ID_RE.test(sheet.id)) continue;
                    const text = JSON.stringify(sheet);
                    let s = this.mine.get(sheet.id);
                    if (!s) this.mine.set(sheet.id, s = { text: '', changedAt: 0, firstAt: 0, sent: '' });
                    if (text !== s.text) { s.text = text; s.changedAt = now; if (!s.firstAt) s.firstAt = now; }
                    if (text === s.sent) { s.firstAt = 0; continue; }
                    const due = urgent || now - s.changedAt >= QUIET_MS || (s.firstAt > 0 && now - s.firstAt >= MAX_HOLD_MS);
                    if (!due) continue;
                    if (await this.send(sheet.id, text)) { s.sent = text; s.firstAt = 0; }
                }
            } while (this.again);
        } finally { this.busy = false; }
    }

    private async send(tid: string, text: string): Promise<boolean> {
        const z = await packPart(text);
        const n = Math.ceil(z.length / CHUNK);
        if (n > MAX_PARTS) return true;   /* far past any real trainer: never sent */
        const set = randomId(4);
        let ok = true;
        for (let i = 0; i < n; i++) {
            ok = await this.api.publish({ k: 'wsh', tid, set, i, n, z: z.slice(i * CHUNK, (i + 1) * CHUNK) }) && ok;
        }
        return ok;
    }

    /** Leaving: whatever changed goes now, then the goodbye. */
    async leaving(): Promise<void> {
        if (this.host) return;
        /* A look already under way may have read the sheet before the last
           edit: let it finish, then look again and send. */
        while (this.busy) await new Promise((r) => window.setTimeout(r, 30));
        this.urgent = true;
        await this.tick(true);
        await this.api.publish({ k: 'bye' });
    }

    /* ======================================================== GM's table */

    private loadStore(): void {
        const raw = readJson(SHEETS_KEY);
        const ok = isRec(raw) && raw.lobby === this.lobby && isRec(raw.by);
        this.store = ok
            ? { lobby: this.lobby, by: raw.by as SheetStore['by'], match: isRec(raw.match) ? raw.match as SheetStore['match'] : {}, cmp: isRec(raw.cmp) ? raw.cmp as SheetStore['cmp'] : {} }
            : { lobby: this.lobby, by: {}, match: {}, cmp: {} };
        const log = readWatchLog();
        this.log = log && log.lobby === this.lobby ? log.log.slice(0, MAX_LOG) : [];
    }

    private saveStore(): void {
        const ids = Object.keys(this.store.by);
        if (ids.length > MAX_MEMBERS) {
            ids.sort((a, b) => this.store.by[a].at - this.store.by[b].at);
            for (const id of ids.slice(0, ids.length - MAX_MEMBERS)) delete this.store.by[id];
        }
        writeJson(SHEETS_KEY, this.store);
    }

    private saveLog(): void {
        let log = this.log;
        /* Storage full: the oldest half goes before the log is lost. */
        while (!writeJson(LOG_KEY, { lobby: this.lobby, log }) && log.length > 20) log = log.slice(0, Math.floor(log.length / 2));
        this.log = log;
    }

    private onGmStorage = (e: StorageEvent): void => {
        if (e.key === SEEN_KEY || e.key === null) this.refresh();
    };

    private refresh(flash?: string): void {
        const seen = readSeen();
        const players: WatchPlayer[] = Object.entries(this.store.by).map(([member, k]) => ({
            member, player: k.player, color: k.color, at: k.at,
            trainers: Object.entries(k.t).map(([id, t]) => ({ id, name: t.name, at: t.at })),
        })).sort((a, b) => b.at - a.at);
        this.view = {
            log: this.log, unseen: unseenCount(this.log, seen), players,
            flash: flash ? { text: flash, at: Date.now() } : this.view.flash,
        };
        this.api.changed();
    }

    /** A piece of a copy. The copy is taken once every piece of it is in. */
    onPart(member: string, player: string, body: Extract<Body, { k: 'wsh' }>): Promise<void> {
        return this.inTurn(member, () => this.takePart(member, player, body));
    }

    private inTurn(member: string, job: () => Promise<void> | void): Promise<void> {
        const run = (this.chain.get(member) ?? Promise.resolve()).then(job).catch(() => undefined);
        this.chain.set(member, run);
        void run.then(() => { if (this.chain.get(member) === run) this.chain.delete(member); });
        return run;
    }

    private async takePart(member: string, player: string, body: Extract<Body, { k: 'wsh' }>): Promise<void> {
        if (!this.host) return;
        const key = member + ':' + body.tid;
        let p = this.parts.get(key);
        if (!p || p.set !== body.set || p.n !== body.n) {
            /* A member has at most a few trainers on the way at once. */
            if (!p && [...this.parts.keys()].filter((k) => k.startsWith(member + ':')).length >= MAX_TIDS) return;
            this.parts.set(key, p = { set: body.set, n: body.n, got: new Array(body.n) });
        }
        p.got[body.i] = body.z;
        if (p.got.some((x) => x === undefined)) return;
        this.parts.delete(key);
        const sheet = parseWatchSheet(await unpackPart(p.got.join('')));
        if (!sheet || sheet.id !== body.tid) return;
        this.onSheet(member, player, sheet);
    }

    private context(member: string): { ctx: WatchCtx; round?: number; fight?: string } {
        const t = this.hooks.strip();
        if (t && t.order.some((e) => e.own === member)) return { ctx: 'fight', round: t.round, fight: t.name };
        return { ctx: 'free' };
    }

    private colorOf(member: string): number | undefined {
        return this.api.members().find((m) => m.id === member)?.color;
    }

    private onSheet(member: string, player: string, sheet: WatchSheet): void {
        const now = Date.now();
        const key = member + ':' + sheet.id;
        let kept = this.store.by[member];
        if (!kept) kept = this.store.by[member] = { player, at: now, t: {} };
        kept.player = player;
        kept.at = now;
        const color = this.colorOf(member);
        if (color !== undefined) kept.color = color;
        const prev = kept.t[sheet.id];
        const wasLive = this.live.has(key);
        const arriving = !this.online.has(member);
        this.live.add(key);
        this.online.add(member);
        this.leftLogged.delete(member);

        if (prev) {
            const changes = this.explain(member, diffSheets(prev.sheet, sheet));
            if (changes.length) {
                const c = wasLive ? this.context(member) : { ctx: 'away' as const };
                this.add({
                    kind: 'change', member, player, ...c, trainer: sheet.name, changes,
                    ...(wasLive ? {} : { note: 'Changed while not at the table' }),
                });
            }
        }
        kept.t[sheet.id] = { name: sheet.name, at: now, sheet };
        const tids = Object.keys(kept.t);
        if (tids.length > MAX_TIDS) {
            tids.sort((a, b) => kept!.t[a].at - kept!.t[b].at);
            for (const id of tids.slice(0, tids.length - MAX_TIDS)) delete kept.t[id];
        }
        this.saveStore();

        /* Arriving: the copy beside the GM's, once per difference. */
        if (!wasLive && arriving) this.logComparison(member, sheet.id, 'join');
        this.refresh();
    }

    /** What explains a rise: the GM's own change, a potion, a gift. */
    private explain(member: string, changes: Change[]): Change[] {
        const now = Date.now();
        const ops = this.hooks.recentOps(member).filter((o) => now - o.at < EXPLAINS_MS);
        /* A potion spent pays for that much HP, on whichever character: a
           Potion 2, a Super Potion 4, a Hyper Potion 14, a charge 1. */
        let pot = this.potionHp.get(member);
        if (!pot || now - pot.at > EXPLAINS_MS) pot = { hp: 0, at: now };
        for (const c of changes) {
            if (c.ct !== 't' || (c.delta ?? 0) >= 0) continue;
            if (c.key === 'potionQty') { pot.hp += -c.delta! * (POTION_HP[c.sub ?? ''] ?? 0); pot.at = now; }
            if (c.key === 'potionCharges') { pot.hp += -c.delta!; pot.at = now; }
        }
        this.potionHp.set(member, pot);
        const gift = now - (this.giftAt.get(member) ?? 0) < EXPLAINS_MS;
        const out = changes.slice(0, MAX_CHANGES).map((c) => {
            if (c.sev !== 'warn') return c;
            const mine = (o: { key: CharKey }) => (c.ct === 't') === (o.key === 't');
            const num = Number(c.to);
            if ((c.key === 'hp' || c.key === 'will') && ops.some((o) => mine(o) && o.op[c.key as 'hp' | 'will'] === num)) {
                return { ...c, sev: 'info' as const, why: 'your change from the GM screen' };
            }
            if ((c.key === 'combatMods' || c.key === 'defBonus' || c.key === 'spDefBonus') && ops.some((o) => mine(o) && o.op.mods)) {
                return { ...c, sev: 'info' as const, why: 'your change from the GM screen' };
            }
            if (c.key === 'hp' && (c.delta ?? 0) > 0 && pot!.hp >= c.delta!) {
                pot!.hp -= c.delta!;
                return { ...c, sev: 'info' as const, why: 'a potion was used' };
            }
            if (gift && c.key === 'dexId' && /^New Pokémon/.test(c.field)) return { ...c, sev: 'info' as const, why: 'your gift' };
            return c;
        });
        if (changes.length > MAX_CHANGES) {
            out.push({ who: '', ct: 't', field: (changes.length - MAX_CHANGES) + ' more changes', key: '', from: '', to: '', sev: 'info' });
        }
        return out;
    }

    private add(e: Omit<WatchEntry, 'id' | 'at' | 'warn' | 'color'>): void {
        const warn = e.changes.some((c) => c.sev === 'warn');
        const color = this.colorOf(e.member) ?? this.store.by[e.member]?.color;
        const entry: WatchEntry = { id: randomId(6), at: Date.now(), ...e, warn, ...(color !== undefined ? { color } : {}) };
        this.log = [entry, ...this.log].slice(0, MAX_LOG);
        this.saveLog();
        this.refresh(warn ? headline(entry) : undefined);
    }

    /** The GM gave this member a Pokémon and they took it. */
    giftTaken(member: string): void {
        if (this.host) this.giftAt.set(member, Date.now());
    }

    /** A member said goodbye, went quiet, or was removed: the last copy they
        sent beside the GM's sheet, logged. */
    left(member: string, why: 'bye' | 'gone' | 'removed'): void {
        if (!this.host) return;
        void this.inTurn(member, () => this.leftNow(member, why));
    }

    private leftNow(member: string, why: 'bye' | 'gone' | 'removed'): void {
        if (this.leftLogged.has(member)) return;
        this.online.delete(member);
        for (const k of [...this.live]) if (k.startsWith(member + ':')) this.live.delete(k);
        const kept = this.store.by[member];
        if (!kept) return;
        this.leftLogged.add(member);
        const note = why === 'bye' ? 'Left the table' : why === 'removed' ? 'Removed from the table' : 'Went quiet (closed the page or lost the connection)';
        for (const tid of Object.keys(kept.t)) this.logComparison(member, tid, 'left', note);
        this.refresh();
    }

    private logComparison(member: string, tid: string, kind: 'join' | 'left', note?: string): void {
        const c = this.compare(member, tid);
        if (!c) return;
        const key = member + ':' + tid;
        const sig = c.gm ? c.gm.id + JSON.stringify(c.changes) : 'none';
        /* Arriving with the same differences as last time says nothing new. */
        if (kind === 'join' && this.store.cmp[key] === sig) return;
        this.store.cmp[key] = sig;
        this.saveStore();
        this.add({
            kind, member, player: c.player, ...this.context(member), trainer: c.trainer,
            ...(c.gm ? { gm: c.gm.name } : {}),
            note: (note ? note + '. ' : '') + (c.gm
                ? (c.changes.length ? 'Differs from your sheet "' + c.gm.name + '".' : 'Matches your sheet "' + c.gm.name + '".')
                : 'No trainer of yours matches it: pick one in Compare.'),
            changes: c.changes.slice(0, MAX_CHANGES),
        });
    }

    /** The player's latest copy beside the GM's own trainer. */
    compare(member: string, tid?: string): Comparison | null {
        const kept = this.store.by[member];
        if (!kept) return null;
        const id = tid && kept.t[tid] ? tid : Object.keys(kept.t).sort((a, b) => kept.t[b].at - kept.t[a].at)[0];
        const mine = id ? kept.t[id] : null;
        if (!mine) return null;
        const list = gmTrainers();
        const picked = this.store.match[member + ':' + id];
        let gm: { id: string; name: string } | null = null;
        let by: Comparison['by'] = null;
        if (picked === NO_MATCH) by = 'picked';
        else if (picked && list.some((t) => t.id === picked)) { gm = list.find((t) => t.id === picked)!; by = 'picked'; }
        else if (list.some((t) => t.id === id)) { gm = list.find((t) => t.id === id)!; by = 'id'; }
        else {
            const same = list.filter((t) => nameKey(t.name) === nameKey(mine.name));
            if (same.length === 1) { gm = same[0]; by = 'name'; }
        }
        const data = gm ? trainerData(gm.id) : null;
        return {
            player: kept.player, trainer: mine.name, tid: id, at: mine.at, gm: data ? gm : null, by: data ? by : null,
            changes: data ? diffSheets(watchSheet(data), mine.sheet) : [],
        };
    }

    /** The player's latest copy written into the GM's trainer it is matched
        with; null when there is none, or the GM's storage is full. */
    sync(member: string, tid?: string): SyncResult | null {
        const c = this.compare(member, tid);
        const mine = this.store.by[member]?.t[c?.tid ?? ''];
        if (!c || !c.gm || !mine) return null;
        let res: SyncResult = { changed: 0, skipped: [] };
        if (!mutateWorkingTrainer(c.gm.id, (d) => { res = syncTrainer(d, mine.sheet); })) return null;
        if (res.changed) {
            this.add({
                kind: 'change', member, player: c.player, ...this.context(member), trainer: c.trainer,
                gm: c.gm.name, note: 'Synced into your sheet "' + c.gm.name + '".', changes: [],
            });
        }
        this.api.changed();
        return res;
    }

    /** The GM picked which trainer of theirs a player's copy is. */
    pick(member: string, tid: string, gmId: string | null): void {
        const key = member + ':' + tid;
        this.store.match[key] = gmId || NO_MATCH;
        this.saveStore();
        this.api.changed();
    }

    setOk(id: string, ok: boolean): void {
        this.log = this.log.map((e) => (e.id === id ? { ...e, ok } : e));
        this.saveLog();
        this.refresh();
    }

    seeAll(): void {
        markSeen();
        this.refresh();
    }

    clear(): void {
        this.log = [];
        this.saveLog();
        this.refresh();
    }

    /** The table's own flash went: forget it. */
    flashDone(at: number): void {
        if (this.view.flash && this.view.flash.at === at) {
            this.view = { ...this.view, flash: null };
            this.api.changed();
        }
    }
}
