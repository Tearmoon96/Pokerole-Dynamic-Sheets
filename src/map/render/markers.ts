/* Markers drawn whole or not at all.

   A terrain's trees, tufts, peaks and stones come from a repeating tile
   (patterns.ts). Filled through the terrain's outline, the tile slices every
   marker the outline crosses: half a tree beside the road, a third of a
   peak at the forest's edge. Here a marker is drawn only if every texel of
   its ink lands on its own terrain; one that another terrain would cut is
   left out whole. A marker cut only by the map's own edge stays, as does
   the ground texture (sand, waves, snow), which has no markers to cut.

   Drawing the markers one by one everywhere would be slow on a big map, so
   the tile is still used wherever it is safe: over the INNER tiles — every
   repeat of the tile all of whose markers, its own and its neighbours'
   overhangs, are kept. The markers outside those are drawn one by one,
   clipped to stay out of the inner tiles, so each texel is drawn once. */

import type { MapDoc } from '../types';
import { resolvedOf } from '../raster';
import { CELL, type PatternParts } from './patterns';

export interface MarkerPlan {
    /** Union of the inner tiles, world px; null if there are none. */
    inner: Path2D | null;
    /** Everything but the inner tiles, even-odd; the edge markers' clip. */
    outer: Path2D | null;
    /** The kept markers outside the inner tiles, in the tile's own order. */
    edge: { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }[];
}

/** Which markers of terrain `t` stay, for a tile drawn at `scale` world px
    a texel. `margin` samples of the terrain are asked for round each inked
    sample, for the smooth styles: their outlines are rounded off the
    samples and can shave a corner by a fraction of one. */
export function markerPlan(doc: MapDoc, t: number, parts: PatternParts, scale: number, margin: number): MarkerPlan {
    const { w, h, res, data } = resolvedOf(doc);
    const sp = CELL / res;                       // world px a sample
    /* Summed-area table of the terrain's samples. */
    const sat = new Int32Array((w + 1) * (h + 1));
    let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            if (data[y * w + x] === t) {
                row++;
                if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
                if (y < by0) by0 = y; if (y > by1) by1 = y;
            }
            sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
        }
    }
    const none: MarkerPlan = { inner: null, outer: null, edge: [] };
    if (bx1 < 0 || !parts.sprites.length) return none;
    const count = (x0: number, y0: number, x1: number, y1: number) =>
        sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
    /** Every sample of the rect is the terrain; past the map's edge counts. */
    const allT = (x0: number, y0: number, x1: number, y1: number) => {
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
        return x1 <= x0 || y1 <= y0 || count(x0, y0, x1, y1) === (x1 - x0) * (y1 - y0);
    };
    const anyT = (x0: number, y0: number, x1: number, y1: number) => {
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
        return x1 > x0 && y1 > y0 && count(x0, y0, x1, y1) > 0;
    };

    const { S, sprites } = parts;
    const K = sprites.length;
    const tw = S * scale;                        // world px a tile
    /* The tiles that can hold a kept marker: round the terrain, one more
       each way for overhangs. */
    const i0 = Math.floor(bx0 * sp / tw) - 1, i1 = Math.floor((bx1 + 1) * sp / tw) + 1;
    const j0 = Math.floor(by0 * sp / tw) - 1, j1 = Math.floor((by1 + 1) * sp / tw) + 1;
    const ni = i1 - i0 + 1, nj = j1 - j0 + 1;

    const keeps = (i: number, j: number, s: (typeof sprites)[number]): boolean => {
        const wx = (i * S + s.x) * scale, wy = (j * S + s.y) * scale;
        const sx0 = Math.floor(wx / sp), sy0 = Math.floor(wy / sp);
        const sx1 = Math.ceil((wx + s.w * scale) / sp), sy1 = Math.ceil((wy + s.h * scale) / sp);
        if (allT(sx0 - margin, sy0 - margin, sx1 + margin, sy1 + margin)) return true;
        if (!anyT(sx0, sy0, sx1, sy1)) return false;
        /* Sample by sample, only where the marker has ink. */
        const W1 = s.w + 1;
        for (let y = sy0; y < sy1; y++) {
            const ty0 = Math.max(0, Math.floor((y * sp - wy) / scale)), ty1 = Math.min(s.h, Math.ceil(((y + 1) * sp - wy) / scale));
            if (ty1 <= ty0) continue;
            for (let x = sx0; x < sx1; x++) {
                const tx0 = Math.max(0, Math.floor((x * sp - wx) / scale)), tx1 = Math.min(s.w, Math.ceil(((x + 1) * sp - wx) / scale));
                if (tx1 <= tx0) continue;
                const inked = s.ink[ty1 * W1 + tx1] - s.ink[ty0 * W1 + tx1] - s.ink[ty1 * W1 + tx0] + s.ink[ty0 * W1 + tx0];
                if (inked && !allT(x - margin, y - margin, x + 1 + margin, y + 1 + margin)) return false;
            }
        }
        return true;
    };
    const kept = new Uint8Array(ni * nj * K);
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            const base = ((j - j0) * ni + (i - i0)) * K;
            for (let k = 0; k < K; k++) kept[base + k] = keeps(i, j, sprites[k]) ? 1 : 0;
        }
    }
    const isKept = (i: number, j: number, k: number) =>
        i >= i0 && i <= i1 && j >= j0 && j <= j1 && kept[((j - j0) * ni + (i - i0)) * K + k] === 1;

    /* Which tiles round its own each sprite reaches, as offsets. */
    const reach = sprites.map((s) => {
        const out: [number, number][] = [];
        for (let dy = Math.floor(s.y / S); dy <= Math.floor((s.y + s.h - 1) / S); dy++) {
            for (let dx = Math.floor(s.x / S); dx <= Math.floor((s.x + s.w - 1) / S); dx++) out.push([dx, dy]);
        }
        return out;
    });
    /* A tile is inner when every marker that reaches into it is kept. */
    const inner = new Uint8Array(ni * nj);
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            let ok = true;
            for (let k = 0; k < K && ok; k++) {
                for (const [dx, dy] of reach[k]) if (!isKept(i - dx, j - dy, k)) { ok = false; break; }
            }
            inner[(j - j0) * ni + (i - i0)] = ok ? 1 : 0;
        }
    }
    const isInner = (i: number, j: number) => i >= i0 && i <= i1 && j >= j0 && j <= j1 && inner[(j - j0) * ni + (i - i0)] === 1;

    let innerPath: Path2D | null = null, outer: Path2D | null = null;
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1;) {
            if (!isInner(i, j)) { i++; continue; }
            let end = i;
            while (end + 1 <= i1 && isInner(end + 1, j)) end++;
            if (!innerPath) {
                innerPath = new Path2D();
                outer = new Path2D();
                outer.rect(-1e6, -1e6, 2e6, 2e6);
            }
            innerPath.rect(i * tw, j * tw, (end - i + 1) * tw, tw);
            outer!.rect(i * tw, j * tw, (end - i + 1) * tw, tw);
            i = end + 1;
        }
    }

    const edge: MarkerPlan['edge'] = [];
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            for (let k = 0; k < K; k++) {
                if (!isKept(i, j, k)) continue;
                if (reach[k].every(([dx, dy]) => isInner(i + dx, j + dy))) continue;
                const s = sprites[k];
                edge.push({ canvas: s.canvas, x: (i * S + s.x) * scale, y: (j * S + s.y) * scale, w: s.w * scale, h: s.h * scale });
            }
        }
    }
    /* The order the tile itself draws in: the row of tiles above first,
       then left to right, then each tile's markers in turn. */
    return { inner: innerPath, outer, edge };
}

/** The plan's markers over `area` (world px, under the transform already
    on `ctx`): the marker tile through the inner tiles, the rest one by one. */
export function drawMarkers(ctx: CanvasRenderingContext2D, plan: MarkerPlan, markers: CanvasPattern | null,
    area: Path2D, rule: CanvasFillRule): void {
    if (plan.inner && markers) {
        ctx.save();
        ctx.clip(plan.inner);
        ctx.fillStyle = markers;
        ctx.fill(area, rule);
        ctx.restore();
    }
    if (!plan.edge.length) return;
    /* Only what can show on this canvas. */
    const inv = ctx.getTransform().inverse();
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const pts = [[0, 0], [cw, 0], [0, ch], [cw, ch]].map(([x, y]) => inv.transformPoint(new DOMPoint(x, y)));
    const vx0 = Math.min(...pts.map((p) => p.x)), vx1 = Math.max(...pts.map((p) => p.x));
    const vy0 = Math.min(...pts.map((p) => p.y)), vy1 = Math.max(...pts.map((p) => p.y));
    ctx.save();
    if (plan.outer) ctx.clip(plan.outer, 'evenodd');
    for (const e of plan.edge) {
        if (e.x > vx1 || e.y > vy1 || e.x + e.w < vx0 || e.y + e.h < vy0) continue;
        ctx.drawImage(e.canvas, e.x, e.y, e.w, e.h);
    }
    ctx.restore();
}
