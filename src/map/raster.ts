import { FALLBACK_TERRAIN, TERRAINS, TERRAIN_BY_CODE } from './terrain';
import { warp } from './noise';
import { chaikinClosed, traceLevels } from './geometry';
import type { Pt } from './geometry';

/* The ground, at finer than one value per cell.

   A map's terrain is a grid of SAMPLES, `res` to a cell on each side. Brushes
   paint their exact shape into it — a circle is a circle, a square a square —
   and a size of 1.375 cells means something. It used to be one value per
   cell, which could only ever paint whole cells; the smooth styles then bent
   every edge with noise at draw time, so no brush could make a square.

   `res` is chosen per map to keep the sample count within a budget: 16 on
   anything up to 100x100 cells, 8 on the largest. It is fixed for the map's
   life except when a resize would break the budget.

   Stored as runs, `<code><count>` repeated, row by row: the codes are letters
   and never digits, so no separator is needed. A painted map is a few thousand
   runs where the raw samples would be millions. */

export const MAX_SAMPLES = 2_600_000;
const RES_STEPS = [16, 8, 4, 2, 1];

export function pickRes(cols: number, rows: number): number {
    return RES_STEPS.find((r) => cols * rows * r * r <= MAX_SAMPLES) ?? 1;
}

/** Terrain code -> its index in TERRAINS, the byte a raster holds. */
const INDEX = new Map(TERRAINS.map((t, i) => [t.code, i]));
const FALLBACK_INDEX = INDEX.get(FALLBACK_TERRAIN.code)!;

export function codeIndex(code: string): number {
    return INDEX.get(code) ?? FALLBACK_INDEX;
}

export interface Raster {
    w: number;
    h: number;
    res: number;
    data: Uint8Array;
}

export function isEncoded(terrain: string): boolean {
    return /\d/.test(terrain.slice(0, 12));
}

export function encode(data: Uint8Array): string {
    const parts: string[] = [];
    let i = 0;
    const n = data.length;
    while (i < n) {
        const v = data[i];
        let j = i + 1;
        while (j < n && data[j] === v) j++;
        parts.push(TERRAINS[v].code + (j - i));
        i = j;
    }
    return parts.join('');
}

/** Runs back to samples. A short string is padded with the fallback terrain,
    a long one cut: whatever came off disk, the raster is the right size. */
export function decode(terrain: string, length: number): Uint8Array {
    const data = new Uint8Array(length).fill(FALLBACK_INDEX);
    let at = 0;
    const re = /([A-Za-z])(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(terrain)) && at < length) {
        const v = codeIndex(m[1]);
        const end = Math.min(length, at + Number(m[2]));
        data.fill(v, at, end);
        at = end;
    }
    return data;
}

export function filled(w: number, h: number, code: string): string {
    return (TERRAIN_BY_CODE.has(code) ? code : FALLBACK_TERRAIN.code) + w * h;
}

/* Decoding a big map is a few milliseconds; the renderer and the brush both
   want the samples of the same string many times over. Keyed by the string
   itself — V8 keeps a string's hash once computed, so the lookup is cheap. */
const cache = new Map<string, Uint8Array>();

export function rasterOf(doc: { cols: number; rows: number; res: number; terrain: string }): Raster {
    const w = doc.cols * doc.res, h = doc.rows * doc.res;
    let data = cache.get(doc.terrain);
    if (!data || data.length !== w * h) {
        data = decode(doc.terrain, w * h);
        cache.set(doc.terrain, data);
        if (cache.size > 6) cache.delete(cache.keys().next().value as string);
    }
    return { w, h, res: doc.res, data };
}

/** Remember a freshly painted raster under its new string, so the next read
    of it does not decode what was just encoded. */
export function remember(terrain: string, data: Uint8Array): void {
    cache.set(terrain, data);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
}

/* ------------------------------------------------------------ old maps

   Before samples, a map was one character a cell, and the smooth styles drew
   it by tracing each terrain's cells with marching squares, bending the
   outline with noise and rounding it with Chaikin — at draw time, every
   time. Converting one runs that same drawing once more and FILLS the shapes
   it made into the samples, so an old map looks exactly as it did; only now
   the look is in the data, and a new brush stroke can sit beside it with
   edges of its own.

   `wobble` is how far the old style bent its edges: 0.38 cells for
   Hand-drawn, 0.24 for Anime. A map last drawn in a blocky style is copied
   cell for cell instead — its squares were meant. */

export const ORGANIC_AMP = 0.36;
export const ORGANIC_SCALE = 2.3;

export function fromCells(cells: string, cols: number, rows: number, res: number, wobble: number): Uint8Array {
    const w = cols * res, h = rows * res;
    const z = new Uint8Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) z[i] = codeIndex(cells[i] ?? FALLBACK_TERRAIN.code);
    const data = new Uint8Array(w * h);

    if (wobble <= 0) {
        for (let sy = 0; sy < h; sy++) {
            const row = Math.floor(sy / res) * cols;
            for (let sx = 0; sx < w; sx++) data[sy * w + sx] = z[row + Math.floor(sx / res)];
        }
        return data;
    }

    const present = [...new Set(z)].sort((a, b) => a - b);
    data.fill(present[0]);
    const levels = present.slice(1);
    const traced = traceLevels(z, cols, rows, levels);
    levels.forEach((level, k) => {
        const loops = traced[k].map((loop) => chaikinClosed(chaikinClosed(
            loop.map(([x, y]) => warp(x, y, wobble, ORGANIC_SCALE) as Pt))));
        fillLoops(data, w, h, res, loops, level);
    });
    return data;
}

/** Fill closed loops (in cells) into a raster with the even-odd rule, a
    sample being inside when its centre is. A scanline fill: each row
    collects where the loops' edges cross it, and fills between pairs. */
export function fillLoops(data: Uint8Array, w: number, h: number, res: number, loops: Pt[][], value: number): void {
    const rowsX: number[][] = Array.from({ length: h }, () => []);
    for (const loop of loops) {
        const n = loop.length;
        for (let i = 0; i < n; i++) {
            const x0 = loop[i][0] * res, y0 = loop[i][1] * res;
            const x1 = loop[(i + 1) % n][0] * res, y1 = loop[(i + 1) % n][1] * res;
            if (y0 === y1) continue;
            const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
            /* Half-open [ya, yb): a vertex shared by two edges counts once. */
            const r0 = Math.max(0, Math.ceil(ya - 0.5)), r1 = Math.min(h - 1, Math.ceil(yb - 0.5) - 1);
            for (let sy = r0; sy <= r1; sy++) {
                const yc = sy + 0.5;
                rowsX[sy].push(x0 + (yc - y0) * (x1 - x0) / (y1 - y0));
            }
        }
    }
    for (let sy = 0; sy < h; sy++) {
        const xs = rowsX[sy];
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const s0 = Math.max(0, Math.ceil(xs[i] - 0.5)), s1 = Math.min(w - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
            if (s1 >= s0) data.fill(value, sy * w + s0, sy * w + s1 + 1);
        }
    }
}

/* ------------------------------------------------------------ editing */

/** Four-way flood fill from one sample. Returns whether anything changed. */
export function floodFill(r: Raster, sx: number, sy: number, value: number): boolean {
    const { w, h, data } = r;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
    const from = data[sy * w + sx];
    if (from === value) return false;
    const stack = new Int32Array(w * h);
    let top = 0;
    stack[top++] = sy * w + sx;
    data[sy * w + sx] = value;
    while (top) {
        const i = stack[--top];
        const x = i % w;
        if (x > 0 && data[i - 1] === from) { data[i - 1] = value; stack[top++] = i - 1; }
        if (x < w - 1 && data[i + 1] === from) { data[i + 1] = value; stack[top++] = i + 1; }
        if (i >= w && data[i - w] === from) { data[i - w] = value; stack[top++] = i - w; }
        if (i + w < w * h && data[i + w] === from) { data[i + w] = value; stack[top++] = i + w; }
    }
    return true;
}

/** A new size, anchored top-left, at whatever resolution the new size allows. */
export function resizeRaster(r: Raster, cols: number, rows: number, fill: number): Raster {
    const res = Math.min(r.res, pickRes(cols, rows));
    const w = cols * res, h = rows * res;
    const data = new Uint8Array(w * h).fill(fill);
    const k = r.res / res;
    for (let y = 0; y < h; y++) {
        const oy = Math.floor((y + 0.5) * k);
        if (oy >= r.h) continue;
        for (let x = 0; x < w; x++) {
            const ox = Math.floor((x + 0.5) * k);
            if (ox < r.w) data[y * w + x] = r.data[oy * r.w + ox];
        }
    }
    return { w, h, res, data };
}
