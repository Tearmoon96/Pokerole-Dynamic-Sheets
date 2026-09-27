import { TERRAIN_BY_SLUG } from './terrain';
import { EMPTY, codeIndex, encode, fillLoops, floodFill, rasterOf, remember } from './raster';
import { strokeSegment } from './brushes';
import { chaikinClosed, sampleCurve } from './geometry';
import { warp } from './noise';
import { createDoc, normalizeDoc, uid } from './doc';
import type { Canvas } from './raster';
import type { Pt } from './geometry';
import type { MapDoc } from './types';
import type { Recipe, RecipeShape } from './recipe';

/* A parsed recipe, painted. Pure: no DOM, no store — the dialog hands the
   result to the store as one step, and the harness runs it in Node.

   Every area shape goes through one path. It is filled exactly into a
   scratch mask the size of the map (fillLoops for areas, the round brush for
   lines), then copied into the terrain. `natural` copies it through a domain
   warp instead: each sample looks the mask up at a point pushed about by
   noise, so the edge wanders — broad bends and fine crinkle, scaled to the
   shape — while the inside stays whole. Warping the lookup rather than the
   outline cannot tie a polygon in knots, which with the even-odd fill would
   punch holes in it. The noise is a function of position (plus the recipe's
   seed), so the same recipe always paints the same map. */

/** A new map from the recipe's `map` block, with the recipe on it. */
export function buildNewMap(recipe: Recipe): MapDoc {
    const m = recipe.map;
    const doc = createDoc({
        name: m.name, cols: m.cols, rows: m.rows, styleId: m.styleId, background: m.background, scaleLabel: m.scale,
    });
    return applyRecipe(doc, recipe);
}

/** The recipe drawn on top of an existing map. Keeps its id, so the store can
    take it as one undoable edit. */
export function applyRecipe(doc: MapDoc, recipe: Recipe): MapDoc {
    const { w, h, res } = rasterOf(doc);
    const data = rasterOf(doc).data.slice();
    const painter = new Painter(data, w, h, res, codeIndex(doc.background), recipe.seed);
    for (const shape of recipe.terrain) painter.paint(shape);
    const terrain = encode(data);
    remember(terrain, data);

    const next = {
        ...doc,
        terrain,
        paths: [...doc.paths, ...recipe.paths.map((p) => ({
            id: uid(), kind: p.kind, points: p.points.map(r2), width: p.width,
            ...(p.name ? { label: p.name } : {}), ...(p.route ? { routeNo: p.route } : {}),
        }))],
        stamps: [...doc.stamps, ...recipe.landmarks.map((l) => ({
            id: uid(), landmark: l.type, x: r2(l.at)[0], y: r2(l.at)[1], size: l.size, rotation: l.rotation, flip: l.flip,
            ...(l.name ? { label: l.name } : {}), ...(l.gymType ? { type: l.gymType } : {}),
        }))],
        labels: [...doc.labels, ...recipe.labels.map(({ at, ...l }) => ({ ...l, id: uid(), x: r2(at)[0], y: r2(at)[1] }))],
        tokens: [...doc.tokens, ...recipe.tokens.map((t) => ({
            id: uid(), kind: t.kind, name: t.name, x: r2(t.at)[0], y: r2(t.at)[1], size: t.size, color: t.color,
            ...(t.image ? { image: t.image } : {}),
        }))],
        updatedAt: new Date().toISOString(),
    };
    /* Through the same door as a file off disk: every label field clamped, every list defaulted. */
    return normalizeDoc(next) ?? next;
}

function r2(p: Pt): Pt {
    return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
}

/* --------------------------------------------------------------- painting */

class Painter {
    private mask: Uint8Array;
    private canvas: Canvas;

    constructor(private data: Uint8Array, private w: number, private h: number, private res: number,
        private bg: number, seed: number) {
        this.mask = new Uint8Array(w * h);
        this.canvas = { w, h, res, layers: [{ data: this.mask, value: 1 }] };
        /* The seed moves the whole noise field, so two recipes that differ
           only in it draw different coasts. */
        this.ox = ((seed * 131.71) % 997) + 0.5;
        this.oy = ((seed * 71.37) % 991) + 0.5;
    }

    private ox: number;
    private oy: number;

    paint(s: RecipeShape): void {
        const value = s.terrain === 'background' ? EMPTY : codeIndex(TERRAIN_BY_SLUG.get(s.terrain)!.code);
        if (s.shape === 'fill') { this.fill(s.at, value); return; }

        /* Into the mask, exactly; `box` is where, in cells. */
        let box: [number, number, number, number];
        if (s.shape === 'line') {
            const pts = s.outline === 'sharp' ? s.points : sampleCurve(s.points, 10);
            for (let i = 1; i < pts.length; i++) strokeSegment(this.canvas, 'circle', pts[i - 1], pts[i], s.width);
            if (pts.length === 1) strokeSegment(this.canvas, 'circle', pts[0], pts[0], s.width);
            box = bounds(pts, s.width / 2 + 0.5);
        } else {
            let loop = outlineOf(s);
            if (s.outline !== 'sharp' && s.shape === 'polygon') loop = chaikinClosed(chaikinClosed(chaikinClosed(loop)));
            fillLoops(this.mask, this.w, this.h, this.res, [loop], 1);
            box = bounds(loop, 0.5);
        }

        const size = s.shape === 'line' ? Math.max(s.width * 2, 1) : Math.sqrt(Math.max(1, (box[2] - box[0]) * (box[3] - box[1])));
        const natural = s.outline === 'natural' && s.roughness > 0;
        /* Bends a few percent of the shape's size, never less than a third of
           a cell (a small pond still wobbles) or more than a few cells. */
        const amp = natural ? s.roughness * clamp(size * 0.07, 0.35, 3.5) : 0;
        const scale = clamp(size / 3.2, 1.4, 14);
        const fineAmp = natural ? s.roughness * clamp(size * 0.012, 0.12, 0.45) : 0;
        const reach = amp * 1.4 + fineAmp * 1.4 + 1 / this.res;

        const { w, h, res, mask, data } = this;
        const x0 = Math.max(0, Math.floor((box[0] - reach) * res)), x1 = Math.min(w - 1, Math.ceil((box[2] + reach) * res));
        const y0 = Math.max(0, Math.floor((box[1] - reach) * res)), y1 = Math.min(h - 1, Math.ceil((box[3] + reach) * res));
        const at = (sx: number, sy: number) => (sx < 0 || sy < 0 || sx >= w || sy >= h ? 0 : mask[sy * w + sx]);
        const r = Math.ceil(reach * res);

        for (let sy = y0; sy <= y1; sy++) {
            for (let sx = x0; sx <= x1; sx++) {
                let inside: number;
                if (!natural) inside = mask[sy * w + sx];
                else {
                    /* Only near an edge can the warp change anything: where the
                       mask agrees all round at the warp's reach, skip it. */
                    const c = at(sx, sy);
                    if (c === at(sx - r, sy) && c === at(sx + r, sy) && c === at(sx, sy - r) && c === at(sx, sy + r)
                        && c === at(sx - r, sy - r) && c === at(sx + r, sy + r) && c === at(sx - r, sy + r) && c === at(sx + r, sy - r)) {
                        inside = c;
                    } else {
                        const px = (sx + 0.5) / res + this.ox, py = (sy + 0.5) / res + this.oy;
                        const [ax, ay] = warp(px, py, amp, scale, 0.45);
                        const [bx, by] = warp(ax, ay, fineAmp, 1.1, 0.3);
                        inside = at(Math.floor((bx - this.ox) * res), Math.floor((by - this.oy) * res));
                    }
                }
                if (inside) data[sy * w + sx] = value;
            }
        }
        /* Clear the scratch mask for the next shape (what was filled lies in the box). */
        const mx0 = Math.max(0, Math.floor((box[0] - 1) * res)), mx1 = Math.min(w - 1, Math.ceil((box[2] + 1) * res));
        const my0 = Math.max(0, Math.floor((box[1] - 1) * res)), my1 = Math.min(h - 1, Math.ceil((box[3] + 1) * res));
        for (let sy = my0; sy <= my1; sy++) mask.fill(0, sy * w + mx0, sy * w + mx1 + 1);
    }

    /** The bucket: everything that LOOKS like the ground under the point, as
        painted so far. */
    private fill(at: Pt, value: number): void {
        const { w, h, res, data, bg } = this;
        const looks = data.slice();
        for (let i = 0; i < looks.length; i++) if (looks[i] === EMPTY) looks[i] = bg;
        const sx = Math.min(w - 1, Math.floor(at[0] * res)), sy = Math.min(h - 1, Math.floor(at[1] * res));
        floodFill({ w, h, res, layers: [{ data, value }] }, looks, sx, sy);
    }
}

/** A closed outline, in cells, for every area shape. */
function outlineOf(s: Exclude<RecipeShape, { shape: 'fill' } | { shape: 'line' }>): Pt[] {
    switch (s.shape) {
        case 'polygon': return s.points;
        case 'rect': return [s.from, [s.to[0], s.from[1]], s.to, [s.from[0], s.to[1]]];
        case 'circle': return ellipse(s.center, s.radius, s.radius, 0);
        case 'ellipse': return ellipse(s.center, s.radiusX, s.radiusY, s.rotation);
    }
}

function ellipse(c: Pt, rx: number, ry: number, deg: number): Pt[] {
    const n = clamp(Math.round(Math.max(rx, ry) * 8), 24, 256);
    const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
        out.push([c[0] + x * ca - y * sa, c[1] + x * sa + y * ca]);
    }
    return out;
}

function bounds(pts: Pt[], pad: number): [number, number, number, number] {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
    }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}
