import {
    COMBAT_KEY, DEFAULT_NAME_OPTS, GM_KEY, PANEL_MAX_W, PANEL_MIN_W,
    combatPanelKey, expandPanelKeys,
} from './constants';
import { normalizeFolders } from './folders';
import { DEFAULT_GEN_OPTS, RECENT_ROLLS } from './generator';
import type { GmGenOpts } from './generator';
import type { GmCombat, GmCombatant, GmLayout, GmState } from './types';

export function uid(): string {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** A fresh, empty fight. The name is what the panel's head is titled. */
export function newCombat(name: string): GmCombat {
    return { gid: uid(), name, round: 1, participants: [] };
}

export function defaultGmState(): GmState {
    const first = newCombat('Combat');
    return {
        trainerIds: [],
        wilds: [],
        combats: [first],
        combatFocus: first.gid,
        notes: '',
        noteSheets: [],
        noteFolders: [],
        rosterOrder: [],
        rosterFolders: [],
        rosterFolderOf: {},
        npcs: [],
        dice: { count: 2, sides: 6, history: [] },
        expanded: {},
        nameOpts: { ...DEFAULT_NAME_OPTS },
        genOpts: { ...DEFAULT_GEN_OPTS, moves: [], favour: [] },
        generated: [],
        genRecent: [],
        layout: { order: expandPanelKeys([combatPanelKey(first.gid)]), widths: {}, hidden: [] },
    };
}

/* A stored order must come back as a permutation of the board's real keys
   whatever it actually held: an older file predating a panel, a hand-edit that
   duplicated or misspelt one. Anything unrecognised is dropped and anything
   missing is appended, so a panel can never go missing from the board with no
   way to get it back.

   `combatKeys` is what the session's fights expand the 'combat' placeholder
   into. A file written before the board carried more than one fight names the
   panel plainly, `combat`, so that spelling is read as the FIRST of them —
   otherwise every such board would open with its tracker appended at the far
   right, past the notes. */
export function normalizeLayout(raw: unknown, combatKeys: string[]): GmLayout {
    const r = (raw && typeof raw === 'object') ? raw as Partial<GmLayout> : {};
    const all = expandPanelKeys(combatKeys);
    const legacy = (k: string) => (k === COMBAT_KEY && combatKeys.length ? combatKeys[0] : k);

    const order: string[] = [];
    (Array.isArray(r.order) ? r.order : []).forEach((raw0) => {
        const k = legacy(raw0);
        if (all.includes(k) && !order.includes(k)) order.push(k);
    });
    all.forEach((k) => { if (!order.includes(k)) order.push(k); });

    const widths: Record<string, number> = {};
    const w = (r.widths && typeof r.widths === 'object') ? r.widths as Record<string, unknown> : {};
    Object.keys(w).forEach((raw0) => {
        const k = legacy(raw0);
        if (!all.includes(k) || widths[k] != null) return;
        const n = Number(w[raw0]);
        if (isFinite(n) && n > 0) {
            widths[k] = Math.round(Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, n)));
        }
    });
    /* Same treatment as `order`: only real panel keys survive, so a stale or
       hand-edited file cannot hide something that no longer exists — or, worse,
       leave a key in here that no toggle can reach to switch back on. */
    const hidden = (Array.isArray(r.hidden) ? r.hidden : [])
        .map(legacy)
        .filter((k, i, a) => all.includes(k) && a.indexOf(k) === i);

    return { order, widths, hidden };
}

/* One fight, every field back to its own type. Same contract as the rest of
   this file: a hand-edited or older file arrives renderable rather than
   crashing a row. */
function normalizeCombat(raw: unknown, fallbackName: string): GmCombat {
    const r = (raw && typeof raw === 'object') ? raw as Partial<GmCombat> : {};
    const round = Number(r.round);
    return {
        gid: typeof r.gid === 'string' && r.gid ? r.gid : uid(),
        name: typeof r.name === 'string' && r.name.trim() ? r.name : fallbackName,
        round: round > 0 ? Math.floor(round) : 1,
        participants: (Array.isArray(r.participants) ? r.participants : []) as GmCombatant[],
    };
}

/* The fights a stored blob carries. `combats` is the current shape; `combat`,
   a single object, is what every file written before the board could hold two
   at once has, and it becomes the first of the list. */
function normalizeCombats(raw: Partial<GmState> & { combat?: unknown }): GmCombat[] {
    const list = Array.isArray(raw.combats) ? raw.combats
        : (raw.combat && typeof raw.combat === 'object') ? [raw.combat]
            : [];
    const seen = new Set<string>();
    const out = list.map((c, i) => normalizeCombat(c, i ? 'Combat ' + (i + 1) : 'Combat'))
        .map((c) => {
            /* Two fights sharing a gid would share a board panel and a set of
               layout entries, so the duplicate is given a new one. */
            if (seen.has(c.gid)) c.gid = uid();
            seen.add(c.gid);
            return c;
        });
    return out.length ? out : [newCombat('Combat')];
}

/* The generator's settings, each field back to its own type. The two lists
   are rebuilt rather than trusted so a hand-edited file cannot leave a number
   where a move name goes; the two sliders are clamped to their range. */
function normalizeGenOpts(raw: unknown): GmGenOpts {
    const r = (raw && typeof raw === 'object') ? raw as Partial<GmGenOpts> : {};
    const o: GmGenOpts = { ...DEFAULT_GEN_OPTS, ...r };
    const strings = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string');
    o.moves = strings(r.moves);
    o.favour = strings(r.favour);
    const pct = (v: unknown, dflt: number) => {
        const n = Number(v);
        return isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : dflt;
    };
    o.itemChance = pct(r.itemChance, DEFAULT_GEN_OPTS.itemChance);
    o.bias = pct(r.bias, DEFAULT_GEN_OPTS.bias);
    o.attackShare = pct(r.attackShare, DEFAULT_GEN_OPTS.attackShare);
    (['species', 'rank', 'rankFrom', 'rankTo', 'habitat', 'type', 'type2', 'typeMode', 'ability', 'gender', 'nature',
        'item', 'moveMix'] as const)
        .forEach((k) => { if (typeof o[k] !== 'string') o[k] = DEFAULT_GEN_OPTS[k]; });
    /* `stages` was a single `stage` string for a while. */
    const legacyStage = (r as { stage?: unknown }).stage;
    o.stages = strings(r.stages).length ? strings(r.stages)
        : (typeof legacyStage === 'string' && legacyStage) ? [legacyStage] : [];
    delete (o as { stage?: unknown }).stage;
    o.generations = (Array.isArray(r.generations) ? r.generations : []).map(Number)
        .filter((g, i, a) => g >= 1 && g <= 9 && Number.isInteger(g) && a.indexOf(g) === i);
    o.legendaries = !!o.legendaries;
    o.ultraBeasts = !!o.ultraBeasts;
    o.mythicals = !!o.mythicals;
    o.paradox = !!o.paradox;
    o.biasMoves = !!o.biasMoves;
    return o;
}

/* Fold a stored blob onto the defaults. Both routes in — localStorage and a
   session file — go through here, so a file written by an older version, or one
   somebody hand-edited, still arrives with every field present and of the right
   type instead of crashing a renderer. */
export function normalizeGmState(raw: unknown): GmState {
    const r = (raw && typeof raw === 'object') ? raw as Partial<GmState> : {};
    const s: GmState = Object.assign(defaultGmState(), r);
    s.combats = normalizeCombats(r);
    delete (s as unknown as Record<string, unknown>).combat;
    s.combatFocus = s.combats.some((c) => c.gid === r.combatFocus)
        ? r.combatFocus! : s.combats[0].gid;
    s.dice = Object.assign({ count: 2, sides: 6, history: [] }, r.dice);
    s.nameOpts = Object.assign({}, DEFAULT_NAME_OPTS, r.nameOpts);
    s.genOpts = normalizeGenOpts(r.genOpts);
    s.genRecent = (Array.isArray(r.genRecent) ? r.genRecent : [])
        .map(Number).filter((n) => isFinite(n) && n > 0).slice(0, RECENT_ROLLS);
    /* Notes used to be one textarea in gmState.notes. The first load after that
       became a stack of sheets carries the old text into sheet one; `notes` is
       emptied so it cannot migrate twice into a duplicate. */
    if (!Array.isArray(r.noteSheets)) {
        s.noteSheets = (s.notes || '').trim()
            ? [{ gid: uid(), title: 'Session notes', body: s.notes, open: true }]
            : [];
        s.notes = '';
    }
    (['trainerIds', 'wilds', 'npcs', 'noteSheets', 'generated'] as const).forEach((k) => {
        if (!Array.isArray(s[k])) (s as unknown as Record<string, unknown>)[k] = [];
    });
    if (!Array.isArray(s.dice.history)) s.dice.history = [];
    if (!s.expanded || typeof s.expanded !== 'object') s.expanded = {};

    s.noteFolders = normalizeFolders(r.noteFolders);
    s.rosterFolders = normalizeFolders(r.rosterFolders);

    /* rosterOrder is rebuilt against what is actually loaded rather than
       trusted: it names entries by key, and a session file can easily hold a
       key for a trainer that is no longer in the working set, or be missing one
       that is. Anything unknown is dropped and anything new is appended, the
       same contract normalizeLayout keeps for the panels — a roster entry can
       never end up loaded but unrenderable. */
    const keys = [
        ...s.trainerIds.map((id) => 't:' + id),
        ...s.wilds.map((w) => 'w:' + w.gid),
    ];
    const known = new Set(keys);
    const order: string[] = [];
    (Array.isArray(r.rosterOrder) ? r.rosterOrder : []).forEach((k) => {
        if (known.has(k) && !order.includes(k)) order.push(k);
    });
    keys.forEach((k) => { if (!order.includes(k)) order.push(k); });
    s.rosterOrder = order;

    const folderIds = new Set(s.rosterFolders.map((f) => f.gid));
    const filed: Record<string, string> = {};
    const rawFiled = (r.rosterFolderOf && typeof r.rosterFolderOf === 'object')
        ? r.rosterFolderOf as Record<string, unknown> : {};
    Object.keys(rawFiled).forEach((k) => {
        const v = String(rawFiled[k] || '');
        if (known.has(k) && folderIds.has(v)) filed[k] = v;
    });
    s.rosterFolderOf = filed;
    s.layout = normalizeLayout(r.layout, s.combats.map((c) => combatPanelKey(c.gid)));
    return s;
}

export function loadGmState(): GmState {
    try {
        const saved = JSON.parse(localStorage.getItem(GM_KEY) || 'null');
        if (saved && typeof saved === 'object') return normalizeGmState(saved);
    } catch { /* corrupt or private mode: start fresh */ }
    return defaultGmState();
}

/** Thrown when localStorage refuses the write, so the caller can say so once. */
export class GmQuotaError extends Error {}

export function writeGmState(state: GmState): void {
    try {
        localStorage.setItem(GM_KEY, JSON.stringify(state));
    } catch {
        throw new GmQuotaError('Browser storage is full');
    }
}
