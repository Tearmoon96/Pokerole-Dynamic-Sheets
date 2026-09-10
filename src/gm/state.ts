import { DEFAULT_NAME_OPTS, GM_KEY, PANEL_KEYS, PANEL_MAX_W, PANEL_MIN_W } from './constants';
import { normalizeFolders } from './folders';
import type { GmLayout, GmState } from './types';

export function uid(): string {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function defaultGmState(): GmState {
    return {
        trainerIds: [],
        wilds: [],
        combat: { round: 1, participants: [] },
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
        layout: { order: PANEL_KEYS.slice(), widths: {}, hidden: [] },
    };
}

/* A stored order must come back as a permutation of PANEL_KEYS whatever it
   actually held: an older file predating a panel, a hand-edit that duplicated or
   misspelt one. Anything unrecognised is dropped and anything missing is
   appended, so a panel can never go missing from the board with no way to get it
   back. */
export function normalizeLayout(raw: unknown): GmLayout {
    const r = (raw && typeof raw === 'object') ? raw as Partial<GmLayout> : {};
    const order: string[] = [];
    (Array.isArray(r.order) ? r.order : []).forEach((k) => {
        if (PANEL_KEYS.includes(k) && !order.includes(k)) order.push(k);
    });
    PANEL_KEYS.forEach((k) => { if (!order.includes(k)) order.push(k); });

    const widths: Record<string, number> = {};
    const w = (r.widths && typeof r.widths === 'object') ? r.widths : {};
    PANEL_KEYS.forEach((k) => {
        const n = Number((w as Record<string, unknown>)[k]);
        if (isFinite(n) && n > 0) {
            widths[k] = Math.round(Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, n)));
        }
    });
    /* Same treatment as `order`: only real panel keys survive, so a stale or
       hand-edited file cannot hide something that no longer exists — or, worse,
       leave a key in here that no toggle can reach to switch back on. */
    const hidden = (Array.isArray(r.hidden) ? r.hidden : [])
        .filter((k, i, a) => PANEL_KEYS.includes(k) && a.indexOf(k) === i);

    return { order, widths, hidden };
}

/* Fold a stored blob onto the defaults. Both routes in — localStorage and a
   session file — go through here, so a file written by an older version, or one
   somebody hand-edited, still arrives with every field present and of the right
   type instead of crashing a renderer. */
export function normalizeGmState(raw: unknown): GmState {
    const r = (raw && typeof raw === 'object') ? raw as Partial<GmState> : {};
    const s: GmState = Object.assign(defaultGmState(), r);
    s.combat = Object.assign({ round: 1, participants: [] }, r.combat);
    s.dice = Object.assign({ count: 2, sides: 6, history: [] }, r.dice);
    s.nameOpts = Object.assign({}, DEFAULT_NAME_OPTS, r.nameOpts);
    /* Notes used to be one textarea in gmState.notes. The first load after that
       became a stack of sheets carries the old text into sheet one; `notes` is
       emptied so it cannot migrate twice into a duplicate. */
    if (!Array.isArray(r.noteSheets)) {
        s.noteSheets = (s.notes || '').trim()
            ? [{ gid: uid(), title: 'Session notes', body: s.notes, open: true }]
            : [];
        s.notes = '';
    }
    (['trainerIds', 'wilds', 'npcs', 'noteSheets'] as const).forEach((k) => {
        if (!Array.isArray(s[k])) (s as unknown as Record<string, unknown>)[k] = [];
    });
    if (!Array.isArray(s.combat.participants)) s.combat.participants = [];
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
    if (!(s.combat.round > 0)) s.combat.round = 1;
    s.layout = normalizeLayout(r.layout);
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
