import { depthOrder, segOutline, spriteBox } from './world/placed';
import type { Box } from './world/placed';
import type { MapDoc, MapNote, NoteTarget } from './types';

/* The GM's notes (owner's request, 2026-11-11): a description of a place
   prepared before the session, for the GM's eyes only.

   One list, `MapDoc.notes`, rather than a field on every object, so that:
   - an edit to a note replaces `notes` and nothing else, and the live link to
     the table can tell it changed nothing players see (`sameButNotes`);
   - a note on an object that is deleted is simply ignored (`targetOf` finds
     nothing), the way a link to a missing map is no link, and an Undo that
     brings the object back brings its note back with it. Loading a map drops
     such orphans for good (`normalizeNotes`).

   A note is NEVER drawn into a picture of the map: the editor shows it as a
   DOM marker (NotesLayer), and the PNG export and the players' view
   (render/playerView.ts) do not read `notes` at all. Keep it that way. */

export const NOTE_TITLE_MAX = 120;
export const NOTE_TEXT_MAX = 20_000;

/** Below this (cells), a drag with the Note tool is a click: a point note. */
export const NOTE_MIN_AREA_SIDE = 0.3;

const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);

/** The note for an object, if it has one. */
export function noteFor(doc: MapDoc, on: NoteTarget): MapNote | undefined {
    return doc.notes?.find((n) => n.on && n.on.kind === on.kind && n.on.id === on.id);
}

export function isEmptyNote(n: Pick<MapNote, 'title' | 'text'>): boolean {
    return !n.title.trim() && !n.text.trim();
}

/** Whether what a note is attached to is still on the map. */
export function targetExists(doc: MapDoc, on: NoteTarget): boolean {
    switch (on.kind) {
        case 'stamp': return doc.stamps.some((s) => s.id === on.id);
        case 'placed': return doc.placed.some((p) => p.id === on.id && !p.run);
        case 'run': return doc.placed.some((p) => p.run === on.id);
    }
}

/** The notes to show: free ones, and those whose object is still there. */
export function liveNotes(doc: MapDoc): MapNote[] {
    return (doc.notes ?? []).filter((n) => !n.on || targetExists(doc, n.on));
}

/** What a press or the pointer is over, as a note would be attached to it. */
export function targetOfPlaced(p: { id: string; run?: string }): NoteTarget {
    return p.run ? { kind: 'run', id: p.run } : { kind: 'placed', id: p.id };
}

const inBox = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function inPoly(pts: [number, number][], x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function boxOfPoints(pts: [number, number][]): Box {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The objects under a point, topmost first, each with the box a marker for
    it would sit in: buildings and props by depth, then landmarks. */
export function objectsAt(doc: MapDoc, x: number, y: number): { on: NoteTarget; box: Box }[] {
    const out: { on: NoteTarget; box: Box }[] = [];
    const order = depthOrder(doc.placed, []);
    for (let i = order.length - 1; i >= 0; i--) {
        const p = order[i].obj as MapDoc['placed'][number];
        const hull = segOutline(p);
        if (hull) {
            if (inPoly(hull, x, y)) out.push({ on: targetOfPlaced(p), box: boxOfPoints(hull) });
        } else {
            const b = spriteBox(p);
            if (inBox(b, x, y)) out.push({ on: targetOfPlaced(p), box: b });
        }
    }
    for (let i = doc.stamps.length - 1; i >= 0; i--) {
        const s = doc.stamps[i];
        const b = { x: s.x - s.size / 2, y: s.y - s.size / 2, w: s.size, h: s.size };
        if (inBox(b, x, y)) out.push({ on: { kind: 'stamp', id: s.id }, box: b });
    }
    return out;
}

/** A free note's area (a point is a box of no size). */
export function freeBox(n: MapNote): Box {
    return { x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 0, h: n.h ?? 0 };
}

/** Where a note's marker sits when it shows by itself (always on): the box
    of its object (for a wall run, its topmost piece) or its own area. */
export function noteBox(doc: MapDoc, n: MapNote): Box | null {
    if (!n.on) return freeBox(n);
    const on = n.on;
    if (on.kind === 'stamp') {
        const s = doc.stamps.find((o) => o.id === on.id);
        return s ? { x: s.x - s.size / 2, y: s.y - s.size / 2, w: s.size, h: s.size } : null;
    }
    const pieces = doc.placed.filter((p) => (on.kind === 'run' ? p.run === on.id : p.id === on.id && !p.run));
    if (!pieces.length) return null;
    const top = pieces.reduce((a, b) => (spriteBox(b).y < spriteBox(a).y ? b : a));
    const hull = segOutline(top);
    return hull ? boxOfPoints(hull) : spriteBox(top);
}

/** The middle of the marker in a box, in cells: its top-right corner, kept
    inside it so the pointer can go from the thing to the marker without
    leaving the thing. `r` is the marker's radius in cells. */
export function markerAt(box: Box, r: number): [number, number] {
    const x = box.w >= 2 * r ? box.x + box.w - r : box.x + box.w / 2;
    const y = box.h >= 2 * r ? box.y + r : box.y + box.h / 2;
    return [x, y];
}

export interface NoteHit { id: string; box: Box }

/** The note under the pointer: the topmost object there that has one, then
    the free notes (the smallest area first; a point within `r`). `keep` is
    the note already hovered: while the pointer is on its marker it stays
    hovered, even past the edge of a thing smaller than the marker. */
export function noteAt(doc: MapDoc, at: [number, number], r: number, keep?: NoteHit | null): NoteHit | null {
    const [x, y] = at;
    const notes = liveNotes(doc);
    if (!notes.length) return null;
    if (keep && notes.some((n) => n.id === keep.id)) {
        const [mx, my] = markerAt(keep.box, r);
        if (Math.hypot(x - mx, y - my) <= r * 1.15) return keep;
    }
    for (const hit of objectsAt(doc, x, y)) {
        const n = notes.find((o) => o.on && o.on.kind === hit.on.kind && o.on.id === hit.on.id);
        if (n) return { id: n.id, box: hit.box };
    }
    let best: NoteHit | null = null, bestArea = Infinity;
    for (const n of notes) {
        if (n.on) continue;
        const b = freeBox(n);
        const area = b.w * b.h;
        const hit = area > 0 ? inBox(b, x, y) : Math.hypot(x - b.x, y - b.y) <= r * 1.15;
        if (hit && area < bestArea) { best = { id: n.id, box: b }; bestArea = area; }
    }
    return best;
}

/** True when two versions of a map differ in nothing but their notes (and
    the time of the last change): a picture of the one is a picture of the
    other. */
export function sameButNotes(a: MapDoc, b: MapDoc): boolean {
    if (a === b) return true;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if (k === 'notes' || k === 'updatedAt') continue;
        if ((a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return false;
    }
    return true;
}

/** A note as stored, made safe; null if it is not one. */
export function normalizeNote(raw: unknown, cols: number, rows: number): MapNote | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!idOk(r.id)) return null;
    const title = (typeof r.title === 'string' ? r.title : '').replace(/[\r\n]+/g, ' ').slice(0, NOTE_TITLE_MAX);
    const text = (typeof r.text === 'string' ? r.text : '').replace(/\r\n?/g, '\n').slice(0, NOTE_TEXT_MAX);
    const on = r.on && typeof r.on === 'object' ? r.on as Record<string, unknown> : null;
    if (on) {
        const kind = on.kind;
        if ((kind !== 'stamp' && kind !== 'placed' && kind !== 'run') || !idOk(on.id)) return null;
        return { id: r.id, title, text, on: { kind, id: on.id } };
    }
    const x = num(r.x), y = num(r.y);
    if (x === undefined || y === undefined) return null;
    return clampFree({ id: r.id, title, text, x, y, w: Math.max(0, num(r.w) ?? 0), h: Math.max(0, num(r.h) ?? 0) }, cols, rows);
}

/** A free note held inside the map; null if none of it is left on it. */
export function clampFree(n: MapNote, cols: number, rows: number): MapNote | null {
    if (n.on) return n;
    const x0 = n.x ?? 0, y0 = n.y ?? 0, x1 = x0 + (n.w ?? 0), y1 = y0 + (n.h ?? 0);
    if (x0 > cols || y0 > rows || x1 < 0 || y1 < 0) return null;
    const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0);
    return { ...n, x: cx0, y: cy0, w: Math.min(cols, x1) - cx0, h: Math.min(rows, y1) - cy0 };
}

/** The notes of a map just loaded: whole, inside it, and none on an object
    that is not there. */
export function normalizeNotes(raw: unknown, doc: MapDoc): MapNote[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: MapNote[] = [];
    for (const r of raw) {
        const n = normalizeNote(r, doc.cols, doc.rows);
        if (!n || seen.has(n.id) || (n.on && !targetExists(doc, n.on))) continue;
        /* One note per object. */
        if (n.on && out.some((o) => o.on && o.on.kind === n.on!.kind && o.on.id === n.on!.id)) continue;
        seen.add(n.id);
        out.push(n);
    }
    return out;
}
