import { depthOrder, segOutline, spriteBox } from './world/placed';
import { distToPolyline } from './geometry';
import type { Pt } from './geometry';
import type { MapDoc, Selection } from './types';

/* What a press at a point would take, under Select and Erase.

   The browser's own answer (the topmost element) made overlapping things a
   lottery: a big landmark placed after a small one covered it whole, and
   a landmark's transparent corners took presses meant for what lay beside
   it. So every thing under the point is a candidate, and the one with the
   SMALLEST hit area wins; equal areas go to the one drawn on top. A small
   thing on a big one is always reachable, and the big one still is
   everywhere the small one is not. Paths and sketches run across the map,
   so they come last: a town on a road is the town, the road is taken
   anywhere else along it.

   Buildings and props in a city or interior are the exception among
   themselves: they stand in depth, and a house in front hides what is
   behind it, so of those only the one in front is a candidate (a cottage
   hidden behind a house never takes the click meant for the house). It
   still competes by size with landmarks and tokens.

   Landmarks and tokens are tested by geometry, as circles (their art is
   round or square with empty corners); labels and buildings by the hit
   elements the browser already shapes for them (rotated text boxes, wall
   pieces clipped to the wall), handed in as `dom`. The same answer drives
   the press, the eraser and the hover highlight, so what lights up is what
   a click takes. */

export interface DomHit {
    sel: Selection;
    /** The hit element's area, in cells². */
    area: number;
}

/** Below this radius on screen (px), a landmark or token is hit as if it
    were this big: a speck at a far zoom still takes a click. */
const MIN_HIT_PX = 7;
/** How near a path or sketch's line a press counts as on it, on screen. */
const LINE_TOL_PX = 6;

interface Cand { sel: Selection; area: number; rank: number }

/* Draw order, back to front, as MapCanvas stacks the layers. */
const LAYER = { path: 0, stamp: 1, depth: 2, label: 3, sketch: 4, token: 5 } as const;
const rankOf = (layer: number, i: number) => layer * 1e6 + i;

function polyArea(pts: Pt[]): number {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    return Math.abs(a / 2);
}

/** Every thing under `at` (cells), best first. `pxPerCell` is the zoom
    times CELL; `dom` the labels and buildings the browser found there. */
export function candidatesAt(doc: MapDoc, at: Pt, pxPerCell: number, dom: DomHit[]): Selection[] {
    const [x, y] = at;
    const minR = MIN_HIT_PX / pxPerCell;
    const out: Cand[] = [];
    const round = (cx: number, cy: number, size: number) => Math.hypot(x - cx, y - cy) <= Math.max(size / 2, minR);

    doc.stamps.forEach((s, i) => {
        if (round(s.x, s.y, s.size)) out.push({ sel: { kind: 'stamp', id: s.id }, area: Math.PI * (s.size / 2) ** 2, rank: rankOf(LAYER.stamp, i) });
    });
    const city = doc.kind !== undefined && doc.kind !== 'world';
    const depth = city ? depthOrder(doc.placed, doc.tokens) : null;
    const tokenRank = new Map<string, number>();
    const placedRank = new Map<string, number>();
    if (depth) {
        depth.forEach((e, i) => (e.kind === 'token' ? tokenRank : placedRank).set(e.obj.id, rankOf(LAYER.depth, i)));
    }
    doc.tokens.forEach((t, i) => {
        if (round(t.x, t.y, t.size)) {
            out.push({ sel: { kind: 'token', id: t.id }, area: Math.PI * (t.size / 2) ** 2, rank: tokenRank.get(t.id) ?? rankOf(LAYER.token, i) });
        }
    });
    let front: Cand | null = null;
    for (const h of dom) {
        if (h.sel.kind === 'label') {
            const i = doc.labels.findIndex((l) => l.id === h.sel.id);
            if (i >= 0) out.push({ sel: h.sel, area: h.area, rank: rankOf(LAYER.label, i) });
        } else if (h.sel.kind === 'placed') {
            const p = doc.placed.find((o) => o.id === h.sel.id);
            if (!p) continue;
            const hull = segOutline(p);
            const b = spriteBox(p);
            const c = { sel: h.sel, area: hull ? polyArea(hull) : b.w * b.h, rank: placedRank.get(p.id) ?? rankOf(LAYER.depth, 0) };
            if (!front || c.rank > front.rank) front = c;
        }
    }
    if (front) out.push(front);
    const tol = LINE_TOL_PX / pxPerCell;
    doc.sketches.forEach((k, i) => {
        if (distToPolyline(at, k.points as Pt[]) < Math.max(tol, k.width / 2)) out.push({ sel: { kind: 'sketch', id: k.id }, area: Infinity, rank: rankOf(LAYER.sketch, i) });
    });
    doc.paths.forEach((p, i) => {
        if (distToPolyline(at, p.points as Pt[]) < Math.max(0.5, p.width / 2)) out.push({ sel: { kind: 'path', id: p.id }, area: Infinity, rank: rankOf(LAYER.path, i) });
    });

    /* Areas a hair apart are the same size: two landmarks of one size
       compare by what is on top, not by rounding. */
    out.sort((a, b) => {
        const same = a.area === b.area || Math.abs(a.area - b.area) <= 1e-6 * Math.max(a.area, b.area);
        return same ? b.rank - a.rank : a.area - b.area;
    });
    return out.map((c) => c.sel);
}

/** The thing a press at `at` takes, or null for bare ground. */
export function pickAt(doc: MapDoc, at: Pt, pxPerCell: number, dom: DomHit[]): Selection | null {
    return candidatesAt(doc, at, pxPerCell, dom)[0] ?? null;
}
