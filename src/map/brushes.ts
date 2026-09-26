import { warp } from './noise';
import { ORGANIC_AMP, ORGANIC_SCALE, scanLoops } from './raster';
import type { Canvas } from './raster';
import { chaikinClosed, traceLevels } from './geometry';
import type { Pt } from './geometry';

/* The terrain brushes. Each one decides, for a sample centre (in cells)
   relative to the dab's centre, whether that sample is painted. The shape the
   picker shows is the shape that lands — except for the four whose point is
   that it is not quite a shape: Classic, Organic and Rugged wander, Spray
   scatters. */

export type BrushId = 'circle' | 'square' | 'diamond' | 'hexagon' | 'cells' | 'classic' | 'organic' | 'rugged' | 'spray';

export interface BrushDef {
    id: BrushId;
    name: string;
    hint: string;
    /** How the pointer preview is drawn. */
    outline: 'circle' | 'square' | 'diamond' | 'hexagon' | 'cells' | 'blob';
}

export const BRUSHES: BrushDef[] = [
    { id: 'circle', name: 'Circle', hint: 'A true circle, any size', outline: 'circle' },
    { id: 'square', name: 'Square', hint: 'A true square, any size', outline: 'square' },
    { id: 'diamond', name: 'Diamond', hint: 'A square on its point', outline: 'diamond' },
    { id: 'hexagon', name: 'Hexagon', hint: 'Flat-topped hexagon', outline: 'hexagon' },
    { id: 'cells', name: 'Grid cells', hint: 'Whole grid cells — for tile maps and battle maps', outline: 'cells' },
    { id: 'classic', name: 'Classic', hint: 'The first brush: whole cells rounded off into lumpy, hand-drawn blobs', outline: 'blob' },
    { id: 'organic', name: 'Organic', hint: 'Soft, wandering edges — coastlines and forests', outline: 'blob' },
    { id: 'rugged', name: 'Rugged', hint: 'Broken, jagged edges — cliffs, rock, badlands', outline: 'blob' },
    { id: 'spray', name: 'Spray', hint: 'Scattered specks — patches of grass, rocks, flowers', outline: 'circle' },
];

export const BRUSH_BY_ID = new Map(BRUSHES.map((b) => [b.id, b]));

export const MIN_BRUSH = 0.05;
export const MAX_BRUSH = 40;

/** Three decimals, clamped to the brush range. */
export function cleanSize(v: number): number {
    if (!isFinite(v)) return 1;
    return Math.round(Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, v)) * 1000) / 1000;
}

export type { Canvas } from './raster';

/** One stroke's memory. Only the Classic brush needs any: it rounds off the
    whole stroke's cells at once, not dab by dab. */
export interface Stroke {
    cols: number;
    rows: number;
    cells: Uint8Array;
}

export function newStroke(cols: number, rows: number): Stroke {
    return { cols, rows, cells: new Uint8Array(cols * rows) };
}

const SQRT3 = Math.sqrt(3);

/** Whether a point `dx, dy` cells from the dab's centre is inside a brush of
    radius `r`. Organic and Rugged take the point's absolute position too, so
    their edges are fixed in the world. */
function inside(id: BrushId, dx: number, dy: number, r: number, x: number, y: number): boolean {
    switch (id) {
        case 'circle': return dx * dx + dy * dy <= r * r;
        case 'square': return Math.abs(dx) <= r && Math.abs(dy) <= r;
        case 'diamond': return Math.abs(dx) + Math.abs(dy) <= r;
        case 'hexagon': {
            const ax = Math.abs(dx), ay = Math.abs(dy);
            return ay <= r * SQRT3 / 2 && SQRT3 * ax + ay <= SQRT3 * r;
        }
        case 'organic': {
            const amp = Math.min(ORGANIC_AMP, r * 0.6);
            const [wx, wy] = warp(x, y, amp, ORGANIC_SCALE);
            const ex = wx - (x - dx), ey = wy - (y - dy);
            return ex * ex + ey * ey <= r * r;
        }
        case 'rugged': {
            const amp = Math.min(0.32, r * 0.5);
            const [wx, wy] = warp(x, y, amp, 0.75, 0.8);
            const ex = wx - (x - dx), ey = wy - (y - dy);
            return ex * ex + ey * ey <= r * r;
        }
        default: return false;
    }
}

/* ------------------------------------------------------------------ Classic

   The brush the Map Maker started with, when terrain was one value a cell:
   it took whole cells — a square of them up to size 2, the cells whose
   centres fall in the circle above that — and the smooth styles then traced
   those cells, bent the outline with noise and rounded it off twice. That
   drawing is what made its lumpy, never-quite-the-same blobs.

   It works the same way here, only into the samples: the stroke keeps the
   cells it has taken, and each dab re-traces that set round the cells it
   just added and fills the result in. The whole stroke is traced together,
   so a drag comes out as one blob, not a string of beads. */

/** How far the Classic outline wanders, in cells: the Hand-drawn style's
    bend when it did the bending. */
export const CLASSIC_AMP = 0.38;

/** Every cell the old round brush covered at (x, y), in cells. */
export function classicCells(x: number, y: number, size: number, cols: number, rows: number): number[] {
    const out: number[] = [];
    const r = size / 2;
    const x0 = Math.floor(x - r + 0.5), x1 = Math.floor(x + r - 0.5);
    const y0 = Math.floor(y - r + 0.5), y1 = Math.floor(y + r - 0.5);
    for (let cy = Math.max(0, y0); cy <= Math.min(rows - 1, y1); cy++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(cols - 1, x1); cx++) {
            if (size > 2) {
                const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
                if (dx * dx + dy * dy > r * r) continue;
            }
            out.push(cy * cols + cx);
        }
    }
    /* A dab exactly between cells can come out empty: take the one under it. */
    if (!out.length) {
        const cx = Math.floor(x), cy = Math.floor(y);
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) out.push(cy * cols + cx);
    }
    return out;
}

function classicDab(c: Canvas, stroke: Stroke, cx: number, cy: number, size: number, put: (i: number) => void): void {
    const { cols, rows, cells } = stroke;
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (const i of classicCells(cx, cy, size, cols, rows)) {
        if (cells[i]) continue;
        cells[i] = 1;
        const x = i % cols, y = (i - x) / cols;
        gx0 = Math.min(gx0, x); gx1 = Math.max(gx1, x);
        gy0 = Math.min(gy0, y); gy1 = Math.max(gy1, y);
    }
    /* Nothing new: the blob round these cells is already down. */
    if (gx0 > gx1) return;

    /* Trace a window round the new cells. The outline is only right away
       from the window's edge, where the tracing closes it off; bending and
       rounding move it well under a cell and a half, so the fill stays
       inside a margin of that. */
    const M = 3;
    const wx0 = Math.max(0, gx0 - M), wy0 = Math.max(0, gy0 - M);
    const wx1 = Math.min(cols - 1, gx1 + M), wy1 = Math.min(rows - 1, gy1 + M);
    const ww = wx1 - wx0 + 1, wh = wy1 - wy0 + 1;
    const local = new Uint8Array(ww * wh);
    for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) local[y * ww + x] = cells[(wy0 + y) * cols + wx0 + x];
    const loops = traceLevels(local, ww, wh, [1])[0].map((loop) => chaikinClosed(chaikinClosed(
        loop.map(([x, y]) => warp(x + wx0, y + wy0, CLASSIC_AMP, ORGANIC_SCALE) as Pt))));
    const { res, w } = c;
    const edge = 1.5;
    scanLoops(c.w, c.h, res, loops, (sy, s0, s1) => {
        for (let sx = s0; sx <= s1; sx++) put(sy * w + sx);
    }, {
        x0: Math.floor((gx0 - edge) * res), y0: Math.floor((gy0 - edge) * res),
        x1: Math.ceil((gx1 + 1 + edge) * res) - 1, y1: Math.ceil((gy1 + 1 + edge) * res) - 1,
    });
}

/** Paint one dab. Returns whether any sample of any layer changed. */
export function dab(c: Canvas, id: BrushId, cx: number, cy: number, size: number, stroke?: Stroke): boolean {
    const { w, h, res, layers } = c;
    let changed = false;
    const put = (i: number) => {
        for (const l of layers) if (l.data[i] !== l.value) { l.data[i] = l.value; changed = true; }
    };
    const set = (sx: number, sy: number) => {
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
        put(sy * w + sx);
    };

    if (id === 'classic') {
        classicDab(c, stroke ?? newStroke(Math.round(w / res), Math.round(h / res)), cx, cy, size, put);
        return changed;
    }

    if (id === 'cells') {
        /* Whole cells under a square of `size` cells, at least the one under
           the pointer — for a grid. */
        const n = Math.max(1, Math.round(size));
        const x0 = Math.floor(cx - n / 2 + 0.5), y0 = Math.floor(cy - n / 2 + 0.5);
        for (let gy = y0; gy < y0 + n; gy++) {
            for (let gx = x0; gx < x0 + n; gx++) {
                for (let sy = gy * res; sy < (gy + 1) * res; sy++) for (let sx = gx * res; sx < (gx + 1) * res; sx++) set(sx, sy);
            }
        }
        return changed;
    }

    if (id === 'spray') {
        /* Specks at random inside the circle, a sample or so wide each: the
           number grows with the area, so a big spray is as dense as a small. */
        const rad = size / 2;
        const speck = Math.max(1 / res, size * 0.035);
        const count = Math.max(2, Math.round((rad * rad) / (speck * speck) * 0.06));
        for (let k = 0; k < count; k++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rad;
            const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
            const s0x = Math.floor((px - speck) * res), s1x = Math.floor((px + speck) * res);
            const s0y = Math.floor((py - speck) * res), s1y = Math.floor((py + speck) * res);
            for (let sy = s0y; sy <= s1y; sy++) {
                for (let sx = s0x; sx <= s1x; sx++) {
                    const ddx = (sx + 0.5) / res - px, ddy = (sy + 0.5) / res - py;
                    if (ddx * ddx + ddy * ddy <= speck * speck) set(sx, sy);
                }
            }
        }
        return changed;
    }

    const rad = size / 2;
    /* The noisy brushes reach a little past their radius. */
    const reach = rad + (id === 'organic' ? ORGANIC_AMP * 1.4 : id === 'rugged' ? 0.6 : 0) + 1 / res;
    const s0x = Math.floor((cx - reach) * res), s1x = Math.ceil((cx + reach) * res);
    const s0y = Math.floor((cy - reach) * res), s1y = Math.ceil((cy + reach) * res);
    let any = false;
    for (let sy = Math.max(0, s0y); sy <= Math.min(h - 1, s1y); sy++) {
        const y = (sy + 0.5) / res;
        for (let sx = Math.max(0, s0x); sx <= Math.min(w - 1, s1x); sx++) {
            const x = (sx + 0.5) / res;
            if (inside(id, x - cx, y - cy, rad, x, y)) { set(sx, sy); any = true; }
        }
    }
    /* A brush smaller than a sample still paints the sample under it. */
    if (!any) set(Math.floor(cx * res), Math.floor(cy * res));
    return changed;
}

/** How far apart a stroke's dabs land, in cells. A round brush can space
    them a quarter of its size apart and nobody sees the joins. A square,
    diamond or hexagon cannot: dragged at an angle, every dab leaves a step
    the size of the spacing, so those land a sample apart (or a fortieth of
    the brush, on a big one, to bound the work). Classic takes whole cells,
    so half a cell apart catches every one it passes over. */
function spacing(id: BrushId, size: number, res: number): number {
    switch (id) {
        case 'cells': return 1;
        case 'classic': return 0.5;
        case 'spray': return Math.max(1 / res, size * 0.6);
        case 'square': case 'diamond': case 'hexagon': return Math.max(1 / res, size / 40);
        default: return Math.max(1 / res, size * 0.25);
    }
}

/** A dab at every step along a segment, close enough that the stroke has no
    gaps and no steps. */
export function strokeSegment(c: Canvas, id: BrushId, from: [number, number], to: [number, number], size: number, stroke?: Stroke): boolean {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const step = spacing(id, size, c.res);
    const n = Math.max(1, Math.ceil(len / step));
    let changed = false;
    /* The first point of a segment is the last of the one before; skip it
       except on the very first dab, or Spray doubles up at every joint. */
    for (let i = from === to ? 0 : 1; i <= n; i++) {
        const t = i / n;
        if (dab(c, id, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, size, stroke)) changed = true;
    }
    return changed;
}
