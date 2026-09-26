import { createDoc, normalizeDoc } from './doc';
import type { BrushId } from './brushes';
import type { LabelRole, MapDoc, PathKind, Selection, Tool } from './types';

/* One mutable store behind the Map Maker, in the same shape as the GM screen's
   (src/gm/store.ts): components read through useSyncExternalStore and every
   change goes through a method here.

   It holds every map the browser has, the one being edited, that map's undo
   history, and the editor's tool state. Only the maps are persisted, and each
   under its OWN key (`pokerole_map_<id>`, with the list in `pokerole_maps`):
   a save writes only the maps that changed, so an edit to a small town map
   does not re-serialise a 200x200 region, and two tabs working on two
   different maps cannot write each other's work away — which one shared key
   for the whole list did, on every save.

   History is snapshots of the whole MapDoc. That sounds heavy and is not: the
   terrain — the only big part — is one immutable string, shared between
   snapshots until a stroke replaces it. A drag or a brush stroke is ONE step:
   `checkpoint()` records the state before it, the live updates during it are
   not recorded, and `settle()` at the end drops the step again if nothing
   actually changed. */

export const MAPS_KEY = 'pokerole_maps';
export const MAP_PREFIX = 'pokerole_map_';
const HISTORY_MAX = 100;
const COALESCE_MS = 1500;

export interface PendingToken {
    kind: 'pokemon' | 'trainer' | 'wild';
    image?: string;
    name: string;
    color: string;
}

export interface MapUi {
    tool: Tool;
    /** Terrain code the brush and the bucket lay down. */
    terrain: string;
    /** Brush size in cells, to three decimals. */
    brush: number;
    brushShape: BrushId;
    landmark: string;
    pathKind: PathKind;
    /** The role a newly placed label takes. */
    labelRole: LabelRole;
    token: PendingToken | null;
    /** Everything selected, in the order it was picked. Several only with
        Ctrl/Cmd-click or a drag box; the inspector edits one at a time and
        offers the group actions for more. */
    selection: Selection[];
    /** A label just placed from the map, whose text field should take the
        caret as soon as its inspector mounts. */
    focusLabel?: string;
}

interface SavedIndex { activeId: string; ids: string[] }

export class MapQuotaError extends Error {}

type Listener = () => void;

export class MapStore {
    private listeners = new Set<Listener>();
    private version = 0;
    private quotaWarned = false;
    private saveTimer: number | null = null;
    /** Maps changed since the last write — deleted ones included, to be removed. */
    private dirty = new Set<string>();
    private indexDirty = false;

    maps: MapDoc[];
    activeId: string;
    undoStack: MapDoc[] = [];
    redoStack: MapDoc[] = [];
    private lastEdit: { key: string; at: number } | null = null;
    /** The state a drag started from, while one is in progress. */
    private pending: MapDoc | null = null;

    ui: MapUi = {
        tool: 'paint', terrain: 'g', brush: 2, brushShape: 'circle',
        landmark: 'mountain', pathKind: 'road', labelRole: 'town', token: null, selection: [],
    };

    onToast: ((html: string) => void) | null = null;

    constructor() {
        const saved = loadSaved();
        this.maps = saved.maps;
        this.activeId = saved.activeId;
        /* A first visit (or a list that no longer names every map) writes the
           list back on the first save, or the starting map would never be in it. */
        if (saved.fresh) {
            this.indexDirty = true;
            this.maps.forEach((m) => this.dirty.add(m.id));
            this.save();
        }
    }

    subscribe = (cb: Listener): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    getSnapshot = (): number => this.version;

    notify(): void {
        this.version++;
        this.listeners.forEach((l) => l());
    }

    get doc(): MapDoc {
        return this.maps.find((m) => m.id === this.activeId) ?? this.maps[0];
    }

    private replaceActive(next: MapDoc): void {
        this.maps = this.maps.map((m) => (m.id === this.activeId ? next : m));
        this.dirty.add(this.activeId);
    }

    /** One undoable change to the active map.

        `coalesce` names a run of edits that should undo together — typing a
        label is one step, not one per letter. Edits with the same key less
        than a moment apart share the step the first one recorded. */
    edit(mutate: (d: MapDoc) => MapDoc | void, coalesce?: string): void {
        const before = this.doc;
        const draft = { ...before };
        const next = (mutate(draft) || draft) as MapDoc;
        next.updatedAt = new Date().toISOString();
        const now = Date.now();
        const joined = !!coalesce && this.lastEdit?.key === coalesce && now - this.lastEdit.at < COALESCE_MS;
        this.lastEdit = coalesce ? { key: coalesce, at: now } : null;
        if (joined) this.redoStack = [];
        else this.pushUndo(before);
        this.replaceActive(next);
        this.save();
        this.notify();
    }

    /** Record the state a drag starts from. */
    checkpoint(): void {
        this.pending = this.doc;
    }

    /** A live change inside a drag: shown at once, recorded as one step when the drag ends. */
    live(mutate: (d: MapDoc) => MapDoc | void): void {
        const draft = { ...this.doc };
        const next = (mutate(draft) || draft) as MapDoc;
        this.replaceActive(next);
        this.notify();
    }

    /** The drag was not meant: put back what it started from. */
    cancel(): void {
        const before = this.pending;
        this.pending = null;
        if (!before || before === this.doc) return;
        this.replaceActive(before);
        this.notify();
    }

    /** The drag is over: keep it as one step if it changed anything. */
    settle(): void {
        this.lastEdit = null;
        const before = this.pending;
        this.pending = null;
        if (!before || before === this.doc) return;
        if (sameDoc(before, this.doc)) { this.replaceActive(before); this.notify(); return; }
        this.pushUndo(before);
        this.replaceActive({ ...this.doc, updatedAt: new Date().toISOString() });
        this.save();
        this.notify();
    }

    private pushUndo(before: MapDoc): void {
        this.undoStack.push(before);
        if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift();
        this.redoStack = [];
    }

    undo(): void {
        this.lastEdit = null;
        const prev = this.undoStack.pop();
        if (!prev) return;
        this.redoStack.push(this.doc);
        this.replaceActive(prev);
        this.dropStaleSelection();
        this.save();
        this.notify();
    }

    redo(): void {
        this.lastEdit = null;
        const next = this.redoStack.pop();
        if (!next) return;
        this.undoStack.push(this.doc);
        this.replaceActive(next);
        this.dropStaleSelection();
        this.save();
        this.notify();
    }

    private dropStaleSelection(): void {
        const kept = this.ui.selection.filter((sel) => findObject(this.doc, sel));
        if (kept.length !== this.ui.selection.length) this.ui = { ...this.ui, selection: kept };
    }

    setUi(patch: Partial<MapUi>): void {
        this.ui = { ...this.ui, ...patch };
        this.notify();
    }

    /* ---------------------------------------------------------------- maps */

    switchTo(id: string): void {
        if (!this.maps.some((m) => m.id === id) || id === this.activeId) return;
        this.activeId = id;
        this.undoStack = [];
        this.redoStack = [];
        this.ui = { ...this.ui, selection: [] };
        this.indexDirty = true;
        this.save();
        this.notify();
    }

    addMap(doc: MapDoc): void {
        this.maps = [...this.maps, doc];
        this.dirty.add(doc.id);
        this.indexDirty = true;
        this.switchTo(doc.id);
        this.save();
        this.notify();
    }

    /** A map loaded from a file with the id of one already here replaces it. */
    importMap(doc: MapDoc): void {
        if (this.maps.some((m) => m.id === doc.id)) {
            this.maps = this.maps.map((m) => (m.id === doc.id ? doc : m));
            if (doc.id === this.activeId) { this.undoStack = []; this.redoStack = []; }
            this.activeId = doc.id;
            this.dirty.add(doc.id);
            this.indexDirty = true;
            this.ui = { ...this.ui, selection: [] };
            this.save();
            this.notify();
            return;
        }
        this.addMap(doc);
    }

    deleteMap(id: string): void {
        const rest = this.maps.filter((m) => m.id !== id);
        this.maps = rest.length ? rest : [createDoc({ name: 'New map' })];
        this.dirty.add(id);
        if (!rest.length) this.dirty.add(this.maps[0].id);
        this.indexDirty = true;
        if (id === this.activeId || !this.maps.some((m) => m.id === this.activeId)) {
            this.activeId = this.maps[0].id;
            this.undoStack = [];
            this.redoStack = [];
            this.ui = { ...this.ui, selection: [] };
        }
        this.save();
        this.notify();
    }

    renameMap(id: string, name: string): void {
        this.maps = this.maps.map((m) => (m.id === id ? { ...m, name } : m));
        this.dirty.add(id);
        this.save();
        this.notify();
    }

    /* ----------------------------------------------------------- persistence */

    /** Written a moment later rather than on the spot, so a burst of edits is
        one write rather than one each. */
    save(): void {
        if (this.saveTimer != null) return;
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            this.flush();
        }, 250);
    }

    flush(): void {
        if (this.saveTimer != null) { clearTimeout(this.saveTimer); this.saveTimer = null; }
        if (!this.dirty.size && !this.indexDirty) return;
        try {
            for (const id of this.dirty) {
                const doc = this.maps.find((m) => m.id === id);
                if (doc) writeKey(MAP_PREFIX + id, JSON.stringify(doc));
                else localStorage.removeItem(MAP_PREFIX + id);
            }
            this.dirty.clear();
            if (this.indexDirty) {
                const index: SavedIndex = { activeId: this.activeId, ids: this.maps.map((m) => m.id) };
                writeKey(MAPS_KEY, JSON.stringify(index));
                this.indexDirty = false;
            }
            this.quotaWarned = false;
        } catch (e) {
            if (!(e instanceof MapQuotaError)) throw e;
            if (!this.quotaWarned) {
                this.quotaWarned = true;
                this.onToast?.('<i class="fa-solid fa-triangle-exclamation"></i> Browser storage is full '
                    + '&mdash; map changes are NOT being kept. Save the map to a file.');
            }
        }
    }

    /** Another tab changed the stored maps. Take its changes to every map but
        the one being edited here — that one is ours until we switch away, and
        taking theirs under the pointer would be worse than either copy. */
    syncFromStorage(key: string | null): void {
        if (key === null || key === MAPS_KEY) {
            const index = readIndex();
            if (!index) return;
            const have = new Map(this.maps.map((m) => [m.id, m]));
            const next: MapDoc[] = [];
            for (const id of index.ids) {
                const doc = id === this.activeId ? have.get(id) : (readMap(id) ?? have.get(id));
                if (doc) next.push(doc);
            }
            const active = have.get(this.activeId);
            if (active && !next.some((m) => m.id === active.id)) next.push(active);
            this.maps = next;
            this.notify();
            return;
        }
        if (!key.startsWith(MAP_PREFIX)) return;
        const id = key.slice(MAP_PREFIX.length);
        if (id === this.activeId || !this.maps.some((m) => m.id === id)) return;
        const doc = readMap(id);
        if (doc) { this.maps = this.maps.map((m) => (m.id === id ? doc : m)); this.notify(); }
    }
}

export const sameSel = (a: Selection, b: Selection): boolean => a.kind === b.kind && a.id === b.id;

export function findObject(doc: MapDoc, sel: Selection): { id: string } | undefined {
    switch (sel.kind) {
        case 'stamp': return doc.stamps.find((o) => o.id === sel.id);
        case 'token': return doc.tokens.find((o) => o.id === sel.id);
        case 'label': return doc.labels.find((o) => o.id === sel.id);
        case 'path': return doc.paths.find((o) => o.id === sel.id);
    }
}

/* Cheap equality for the fields a drag can touch: every array and the terrain
   are replaced, never mutated, so identity is enough. */
function sameDoc(a: MapDoc, b: MapDoc): boolean {
    return a.terrain === b.terrain && a.stamps === b.stamps && a.tokens === b.tokens
        && a.labels === b.labels && a.paths === b.paths;
}

function readIndex(): SavedIndex | null {
    try {
        const raw = JSON.parse(localStorage.getItem(MAPS_KEY) || 'null') as SavedIndex | null;
        if (raw && Array.isArray(raw.ids)) return { activeId: String(raw.activeId || ''), ids: raw.ids.map(String) };
    } catch { /* corrupt or private mode */ }
    return null;
}

function readMap(id: string): MapDoc | null {
    try {
        return normalizeDoc(JSON.parse(localStorage.getItem(MAP_PREFIX + id) || 'null'));
    } catch {
        return null;
    }
}

function loadSaved(): { activeId: string; maps: MapDoc[]; fresh: boolean } {
    const index = readIndex();
    const maps = (index?.ids ?? []).map(readMap).filter((m): m is MapDoc => !!m);
    let activeId = index?.activeId ?? '';
    const fresh = !index || !maps.length || maps.length !== index.ids.length;
    if (!maps.length) maps.push(createDoc({ name: 'My first map' }));
    if (!maps.some((m) => m.id === activeId)) activeId = maps[0].id;
    return { activeId, maps, fresh };
}

function writeKey(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        throw new MapQuotaError('Browser storage is full');
    }
}
