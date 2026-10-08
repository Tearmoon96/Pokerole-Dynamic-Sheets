import { chaikinClosed, chaikinTagged, dropCollinearTagged, traceLevels, traceTagged } from '../geometry';
import type { Pt } from '../geometry';
import { TERRAINS } from '../terrain';
import type { TerrainDef } from '../terrain';
import type { MapStyle, TerrainLook } from '../styles';
import type { EdgeKind, MapDoc } from '../types';
import { resolvedOf } from '../raster';
import { edgeResolver, edgesOf } from '../edges';
import { probeImage, terrainTextureUrl } from '../sprites';
import { CELL, patternTile, tileScale } from './patterns';

/* The ground, drawn into a canvas.

   The shapes are built once per change of the terrain (buildGeometry) as
   Path2D objects in world px; every frame after that — a pan, a zoom — only
   fills and strokes them under the view transform, which is cheap. The canvas
   is the size of the VIEWPORT, not of the map: a 200x200 map at 32px a cell is
   6400px square, which at a 2x pixel ratio is a canvas no browser will give you.

   The shapes come from the terrain samples (raster.ts) as they look — a bare
   sample as the map's background. Nothing here bends an edge: a square
   brush's square stays square, and an Organic stroke wanders because the
   brush painted it wandering.

   Two ways to build:

   - smooth: one layer per terrain in z order, each covering every sample AT OR
     ABOVE its z. So a layer's outline is exactly where that terrain and
     everything stacked on it end, the next layer paints over its own part, and
     two neighbouring edges can never leave a sliver of nothing between them.
     The outlines are marching squares round the sample centres, with two
     passes of Chaikin to take the stair-steps off a diagonal;
   - blocky: one region per terrain, the union of its own samples.

   Every edge between two terrains is drawn ONCE, in the look edges.ts
   decides for it. A layer's outline runs along every edge between the
   terrains below it and those at or above it, so the same stretch of coast
   is on the outline of every layer in between; only the layer of the terrain
   actually on the upper side draws it. Before that, each of those layers
   inked it in its own colour and width, which is why whether an edge had a
   line depended on what else happened to be on the map. */

export interface TerrainLayer {
    terrain: TerrainDef;
    /** What to fill. */
    area: Path2D;
    /** The stretches of this terrain's edge drawn in its own style look. */
    outline: Path2D | null;
}

/** One pair of terrains' Soft edges. `a` and `b` are indices into TERRAINS;
    `box` is the stretch they cover, in world px. */
export interface SoftPair { a: number; b: number; path: Path2D; box: Box }

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The Soft edges: where they run, and which terrains meet across them. */
export interface SoftEdges {
    /** By pair, so a terrain blends only with what it has a Soft edge to. */
    pairs: SoftPair[];
    /** Indices into TERRAINS. */
    terrains: Set<number>;
    /** The stretch they cover, in world px. */
    box: { x0: number; y0: number; x1: number; y1: number };
    /** Built on first draw; see softLayer. */
    layer?: SoftLayer | null;
}

export interface TerrainGeometry {
    key: string;
    layers: TerrainLayer[];
    /** Smooth styles: the edge of all land, for the coastal wash. */
    coast: Path2D | null;
    /** How many water layers come before the land — the wash goes between. */
    waterLayers: number;
    /** Blocky styles: edges left to the style, drawn as its cell border. */
    styleBorders: Path2D | null;
    /** Edges asked to be a Line. */
    lines: Path2D | null;
    soft: SoftEdges | null;
    /** Each soft terrain's own region, to blend with. */
    regions: Map<number, { path: Path2D; rule: CanvasFillRule }>;
    blocky: boolean;
    /** How wide a Soft edge blends, in cells. */
    softWidth: number;
    /** How far each bit of water is from land, built on first draw. */
    depthField?: DepthField | null;
    /** The depth bands drawn from it, per style. */
    depth?: Map<string, DepthBands | null>;
}

/* A stretch's tag while building: which of the looks it is drawn in. 0 is
   not this layer's to draw. */
const TAG: Record<EdgeKind, number> = { plain: 1, line: 2, style: 3, soft: 4 };

/* A Soft stretch's tag also says which terrain lies on its other side, so a
   run stops where that changes: SOFT_BASE + the terrain's index. The layer's
   own terrain is the other side of the pair. */
const SOFT_BASE = 8;
const isSoft = (tag: number) => tag >= SOFT_BASE;

/** One pair's Soft edges, made on first use. */
function pairOf(pairs: Map<string, SoftPair>, a: number, b: number): SoftPair {
    const key = Math.min(a, b) + ':' + Math.max(a, b);
    let pair = pairs.get(key);
    if (!pair) pairs.set(key, pair = { a: Math.min(a, b), b: Math.max(a, b), path: new Path2D(), box: emptyBox() });
    return pair;
}

function growBox(box: Box, x0: number, y0: number, x1 = x0, y1 = y0): void {
    if (x0 < box.x0) box.x0 = x0; if (x1 > box.x1) box.x1 = x1;
    if (y0 < box.y0) box.y0 = y0; if (y1 > box.y1) box.y1 = y1;
}

/** The runs of one tag along a tagged loop, into whichever path `sink`
    names for that tag. A loop all of one tag is closed, so its line has no
    ends. */
function addRuns(loop: Pt[], tags: Uint8Array, scale: number, sink: (tag: number) => Path2D | null,
    grow: ((tag: number, x: number, y: number) => void) | null): void {
    const n = loop.length;
    let start = -1;
    for (let i = 0; i < n; i++) if (tags[i] !== tags[(i + n - 1) % n]) { start = i; break; }
    if (start < 0) {
        const path = sink(tags[0]);
        if (!path) return;
        path.moveTo(loop[0][0] * scale, loop[0][1] * scale);
        for (let i = 1; i < n; i++) path.lineTo(loop[i][0] * scale, loop[i][1] * scale);
        path.closePath();
        if (grow && isSoft(tags[0])) for (const p of loop) grow(tags[0], p[0] * scale, p[1] * scale);
        return;
    }
    let i = start;
    do {
        const tag = tags[i];
        const path = sink(tag);
        const soft = grow && isSoft(tag);
        if (path) path.moveTo(loop[i][0] * scale, loop[i][1] * scale);
        if (soft) grow!(tag, loop[i][0] * scale, loop[i][1] * scale);
        let j = i;
        do {
            j = (j + 1) % n;
            if (path) path.lineTo(loop[j][0] * scale, loop[j][1] * scale);
            if (soft) grow!(tag, loop[j][0] * scale, loop[j][1] * scale);
        } while (j !== start && tags[j] === tag);
        i = j;
    } while (i !== start);
}

export function geometryKey(doc: MapDoc, style: MapStyle): string {
    const b = doc.borders;
    return doc.cols + 'x' + doc.rows + '@' + doc.res + ':' + style.edgeMode + ':' + doc.background + ':'
        + b.kind + ':' + b.soft + ':' + JSON.stringify(b.terrain) + ':' + doc.edges + ':' + doc.terrain;
}

function emptyBox() {
    return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

export function buildGeometry(doc: MapDoc, style: MapStyle): TerrainGeometry {
    const key = geometryKey(doc, style);
    const r = resolvedOf(doc);
    const painted = edgesOf(doc);
    const resolve = edgeResolver(doc.borders);
    /* A raster holds indices into TERRAINS, which is in z order — so the
       index IS the level the contours are traced at. */
    const present = new Uint8Array(TERRAINS.length);
    for (let i = 0; i < r.data.length; i++) present[r.data[i]] = 1;
    const order = TERRAINS.map((t, i) => ({ t, i })).filter((x) => present[x.i]);

    if (style.edgeMode === 'blocky') return buildBlocky(doc, order, key, r, painted, resolve);

    const scale = CELL / r.res;
    const full = new Path2D();
    full.rect(0, 0, doc.cols * CELL, doc.rows * CELL);
    const levels = order.slice(1).map((x) => x.i);
    const softTerrains = new Set<number>();
    const traced = traceTagged(r.data, r.w, r.h, levels, (k, upper, lower, iu, il) => {
        /* Only the layer of the terrain on the upper side draws a stretch,
           and the map's own border is not an edge. */
        if (upper !== levels[k] || lower < 0) return 0;
        const tag = TAG[resolve(upper, lower, painted && iu >= 0 ? painted[iu] : 0, painted && il >= 0 ? painted[il] : 0)];
        if (tag !== TAG.soft) return tag;
        softTerrains.add(upper); softTerrains.add(lower);
        return SOFT_BASE + lower;
    });

    const lines = new Path2D();
    const pairs = new Map<string, SoftPair>();
    const box = emptyBox();
    let anyLine = false;

    const layers: TerrainLayer[] = [];
    let coast: Path2D | null = null;
    let waterLayers = 0;
    order.forEach(({ t, i: level }, idx) => {
        const grow = (tag: number, x: number, y: number) => {
            growBox(box, x, y);
            growBox(pairOf(pairs, level, tag - SOFT_BASE).box, x, y);
        };
        let area = full;
        let outline: Path2D | null = null;
        if (idx > 0) {
            area = new Path2D();
            const own = new Path2D();
            let anyOwn = false;
            const { loops, tags } = traced[idx - 1];
            loops.forEach((raw, li) => {
                /* Chaikin on the dense outline first, so it only rounds off a
                   sample's worth of corner; THEN drop the collinear points.
                   The other way round turns a square into an octagon. */
                let cur = chaikinTagged(raw, tags[li]);
                cur = chaikinTagged(cur.loop, cur.tags);
                cur = dropCollinearTagged(cur.loop, cur.tags);
                const loop = cur.loop;
                area.moveTo(loop[0][0] * scale, loop[0][1] * scale);
                for (let i = 1; i < loop.length; i++) area.lineTo(loop[i][0] * scale, loop[i][1] * scale);
                area.closePath();
                addRuns(loop, cur.tags, scale, (tag) => {
                    if (tag === TAG.style) { anyOwn = true; return own; }
                    if (tag === TAG.line) { anyLine = true; return lines; }
                    if (isSoft(tag)) return pairOf(pairs, level, tag - SOFT_BASE).path;
                    return null;
                }, grow);
            });
            if (anyOwn) outline = own;
        }
        /* The wash lies along land's edge on the water side — and on the
           cloud side of a sky isle, where it reads as the isle's shade. */
        if (t.water || t.sky) waterLayers = idx + 1;
        else if (!coast && idx > 0 && (order[idx - 1].t.water || order[idx - 1].t.sky)) coast = area;
        layers.push({ terrain: t, area, outline });
    });

    /* Each terrain's own region, for blending: its layer less the next one
       up, by the even-odd rule. */
    const regions = new Map<number, { path: Path2D; rule: CanvasFillRule }>();
    if (softTerrains.size) {
        order.forEach(({ i }, idx) => {
            if (!softTerrains.has(i)) return;
            const path = new Path2D();
            path.addPath(layers[idx].area);
            if (idx + 1 < layers.length) path.addPath(layers[idx + 1].area);
            regions.set(i, { path, rule: 'evenodd' });
        });
    }

    return {
        key, layers, coast, waterLayers, styleBorders: null,
        lines: anyLine ? lines : null,
        soft: softTerrains.size ? { pairs: [...pairs.values()], terrains: softTerrains, box } : null,
        regions, blocky: false, softWidth: doc.borders.soft,
    };
}

function buildBlocky(doc: MapDoc, order: { t: TerrainDef; i: number }[], key: string,
    r: { w: number; h: number; res: number; data: Uint8Array }, painted: Uint8Array | null,
    resolve: ReturnType<typeof edgeResolver>): TerrainGeometry {
    const { w, h, res, data } = r;
    const px = CELL / res;
    const paths = new Map<number, Path2D>();
    for (const { i } of order) paths.set(i, new Path2D());
    /* Horizontal runs of one terrain as one rect each — far fewer subpaths
       than a rect per sample on a map painted in broad strokes. */
    for (let y = 0; y < h; y++) {
        let x = 0;
        const row = y * w;
        while (x < w) {
            const v = data[row + x];
            let end = x + 1;
            while (end < w && data[row + end] === v) end++;
            paths.get(v)?.rect(x * px, y * px, (end - x) * px, px);
            x = end;
        }
    }

    /* Every sample edge between two different terrains, in the look decided
       for it. Neighbouring edges of one look along a row or column are
       joined into one line. */
    const styleBorders = new Path2D(), lines = new Path2D();
    const pairs = new Map<string, SoftPair>();
    const softTerrains = new Set<number>();
    const box = emptyBox();
    let anyStyle = false, anyLine = false;
    const kindAt = (a: number, b: number): number => {
        const va = data[a], vb = data[b];
        if (va === vb) return 0;
        const [iu, il] = va > vb ? [a, b] : [b, a];
        const kind = TAG[resolve(data[iu], data[il], painted ? painted[iu] : 0, painted ? painted[il] : 0)];
        if (kind !== TAG.soft) return kind;
        softTerrains.add(va); softTerrains.add(vb);
        /* Both sides in the tag: the lower and the upper terrain. */
        return SOFT_BASE + data[il] * 256 + data[iu];
    };
    const sinkOf = (tag: number): Path2D | null => {
        if (tag === TAG.style) { anyStyle = true; return styleBorders; }
        if (tag === TAG.line) { anyLine = true; return lines; }
        if (isSoft(tag)) return pairOf(pairs, (tag - SOFT_BASE) >> 8, (tag - SOFT_BASE) & 255).path;
        return null;
    };
    const grow = (tag: number, x0: number, y0: number, x1: number, y1: number) => {
        growBox(box, x0, y0, x1, y1);
        growBox(pairOf(pairs, (tag - SOFT_BASE) >> 8, (tag - SOFT_BASE) & 255).box, x0, y0, x1, y1);
    };
    /* Vertical edges, between sample x and x+1, run down each column. */
    for (let x = 0; x < w - 1; x++) {
        let y = 0;
        while (y < h) {
            const tag = kindAt(y * w + x, y * w + x + 1);
            let end = y + 1;
            while (end < h && kindAt(end * w + x, end * w + x + 1) === tag) end++;
            const path = sinkOf(tag);
            if (path) {
                path.moveTo((x + 1) * px, y * px); path.lineTo((x + 1) * px, end * px);
                if (isSoft(tag)) grow(tag, (x + 1) * px, y * px, (x + 1) * px, end * px);
            }
            y = end;
        }
    }
    /* Horizontal edges, between sample y and y+1, along each row. */
    for (let y = 0; y < h - 1; y++) {
        let x = 0;
        while (x < w) {
            const tag = kindAt(y * w + x, (y + 1) * w + x);
            let end = x + 1;
            while (end < w && kindAt(y * w + end, (y + 1) * w + end) === tag) end++;
            const path = sinkOf(tag);
            if (path) {
                path.moveTo(x * px, (y + 1) * px); path.lineTo(end * px, (y + 1) * px);
                if (isSoft(tag)) grow(tag, x * px, (y + 1) * px, end * px, (y + 1) * px);
            }
            x = end;
        }
    }

    const layers = order.map(({ t, i }) => ({ terrain: t, area: paths.get(i)!, outline: null }));
    const regions = new Map<number, { path: Path2D; rule: CanvasFillRule }>();
    for (const i of softTerrains) regions.set(i, { path: paths.get(i)!, rule: 'nonzero' });
    /* Sky and water come first in z order, so they are the leading layers;
       the depth shading goes on after them. */
    let waterLayers = 0;
    while (waterLayers < order.length && (order[waterLayers].t.water || order[waterLayers].t.sky)) waterLayers++;
    return {
        key, layers, coast: null, waterLayers,
        styleBorders: anyStyle ? styleBorders : null,
        lines: anyLine ? lines : null,
        soft: softTerrains.size ? { pairs: [...pairs.values()], terrains: softTerrains, box } : null,
        regions, blocky: true, softWidth: doc.borders.soft,
    };
}

/* ------------------------------------------------------------------ drawing */

/** Where a terrain's texture comes from: the page's own probe normally, a
    set loaded beforehand for a PNG export (see exportPng.ts). */
export type TextureSource = (style: MapStyle, slug: string) => { img: CanvasImageSource; w: number; h: number } | null;

const probeTexture: TextureSource = (style, slug) => {
    const img = probeImage(terrainTextureUrl(style, slug));
    return img && img.naturalWidth > 0 ? { img, w: img.naturalWidth, h: img.naturalHeight } : null;
};

/** The fills that make a terrain's ground, bottom first: its colour, then
    the owner's tile for it or the style's procedural pattern. */
function terrainPaints(ctx: CanvasRenderingContext2D, style: MapStyle, t: TerrainDef, textures: TextureSource): (string | CanvasPattern)[] {
    const look: TerrainLook | undefined = style.terrain[t.slug];
    /* The terrain's own colour first, always: a texture with transparent
       parts would otherwise show whatever lies underneath — the sea. */
    const out: (string | CanvasPattern)[] = [look?.fill ?? '#888'];
    /* The owner's own tile for this terrain, one cell per repeat, replaces
       the procedural pattern. */
    const tex = textures(style, t.slug);
    if (tex) {
        const pat = ctx.createPattern(tex.img, 'repeat');
        if (pat) {
            pat.setTransform(new DOMMatrix([CELL / tex.w, 0, 0, CELL / tex.h, 0, 0]));
            out.push(pat);
            return out;
        }
    }
    if (look?.pattern) {
        const tile = patternTile(look.pattern, look.ink ?? '#0003');
        const pat = tile && ctx.createPattern(tile, 'repeat');
        if (pat) {
            const s = tileScale(look.pattern);
            pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
            out.push(pat);
        }
    }
    return out;
}

function fillLayer(ctx: CanvasRenderingContext2D, style: MapStyle, t: TerrainDef, area: Path2D, textures: TextureSource): void {
    for (const paint of terrainPaints(ctx, style, t, textures)) {
        ctx.fillStyle = paint;
        ctx.fill(area, 'evenodd');
    }
}

/* ------------------------------------------------------------------ Soft edges

   A Soft edge is two terrains' ground COLOURS shading into each other across
   a band B cells wide, centred on the edge and no wider. The markers — trees,
   tufts, stones, the owner's tiles — are not part of it: each terrain's are
   drawn exactly as they would be with no soft edge at all, whole, opaque and
   only inside its own region. Fading them as well put half-transparent trees
   over half-transparent tufts, which read as a smudge.

   The colour proportions come from a mask per terrain, 1 inside its region
   and 0 outside, blurred: the masks add to 1 before blurring and still do
   after. Each spot's shares are then sharpened so they reach 0 and 1 exactly
   at the band's ends — a Gaussian's tails otherwise tinted the ground well
   past it. The pixel styles turn the shares into an ordered dither, since
   pixel art mixes whole pixels rather than fading.

   It all goes by PAIR of terrains. A terrain's ground is replaced only
   along its own Soft edges (a wide stroke of them, wider than the band), and
   a neighbour's colour counts only near a Soft edge between the two. A
   terrain that is Soft somewhere else on the map, or a third one beside the
   band, keeps its own colour: one shared set of soft terrains blurred a
   one-cell road with a Soft end into the grass it crossed, colour and all.

   The masks are small: world space at a few px a cell, over only the box
   the Soft edges cover, built once per change of the terrain. Every frame
   after that scales them up in tiles of the viewport, so a big export needs
   no canvas the size of it. */

interface SoftPart {
    terrain: TerrainDef;
    region: { path: Path2D; rule: CanvasFillRule };
    /** The mask px its zone covers, x1 and y1 past the end. */
    box: Box;
    /** Its own colour's share and its Soft neighbours', at each mask px of
        the box. They add up to its zone: 255 along its own Soft edges, 0
        away from them. */
    shares: { terrain: TerrainDef; share: Uint8ClampedArray }[];
}

/** One part in one style's colours: the land's colours baked into one
    image, and each water's share kept apart for its depth shading. */
interface PartLook {
    ground: HTMLCanvasElement | null;
    water: { terrain: TerrainDef; mask: HTMLCanvasElement }[];
    /** World px the two cover: the part's box. */
    rect: { x: number; y: number; w: number; h: number };
}

interface SoftLayer {
    /** World px the masks cover, and the masks' own size. */
    x: number; y: number; w: number; h: number; mw: number; mh: number;
    parts: SoftPart[];
    /** By style id, made on first draw in that style. */
    looks: Map<string, PartLook[]>;
}

const MASK_BUDGET = 2_500_000;
const TILE = 1024;

function scratch(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
}

/* The tile canvases drawSoft works in, kept between frames: a pan redraws
   every frame, and fresh ones each time are garbage for nothing. */
let trio: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement] | null = null;
/* Each water's look over the tile, by slug — see drawSoft. */
const wetTiles = new Map<string, HTMLCanvasElement>();

function tiles(w: number, h: number): [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement] {
    if (!trio) trio = [scratch(w, h), scratch(w, h), scratch(w, h)];
    for (const c of trio) {
        if (c.width < w) c.width = w;
        if (c.height < h) c.height = h;
    }
    return trio;
}

let filterWorks: boolean | null = null;

/** Whether this browser blurs through ctx.filter (Chrome and Firefox do). */
function canFilter(): boolean {
    if (filterWorks == null) {
        const c = scratch(1, 1).getContext('2d')!;
        c.filter = 'blur(2px)';
        filterWorks = c.filter === 'blur(2px)';
    }
    return filterWorks;
}

/** A blurred copy of `src` into `dst`, standard deviation `sigma` px. Three
    box blurs where ctx.filter is missing, which is as good as a Gaussian to
    the eye. */
function blurInto(dst: HTMLCanvasElement, src: HTMLCanvasElement, sigma: number): void {
    const c = dst.getContext('2d')!;
    c.clearRect(0, 0, dst.width, dst.height);
    if (canFilter()) {
        c.filter = 'blur(' + sigma.toFixed(2) + 'px)';
        c.drawImage(src, 0, 0);
        c.filter = 'none';
        return;
    }
    c.drawImage(src, 0, 0);
    const img = c.getImageData(0, 0, dst.width, dst.height);
    const { width: w, height: h, data } = img;
    const a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3];
    const r = Math.max(1, Math.round(sigma * Math.sqrt(12 / 3 + 1) / 2));
    const tmp = new Float32Array(w * h);
    const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
        const n = horizontal ? w : h, lines = horizontal ? h : w;
        for (let l = 0; l < lines; l++) {
            let sum = 0;
            const at = (k: number) => (horizontal ? l * w + k : k * w + l);
            for (let k = -r; k <= r; k++) sum += from[at(Math.max(0, Math.min(n - 1, k)))];
            for (let k = 0; k < n; k++) {
                to[at(k)] = sum / (2 * r + 1);
                sum += from[at(Math.min(n - 1, k + r + 1))] - from[at(Math.max(0, k - r))];
            }
        }
    };
    for (let k = 0; k < 3; k++) { pass(a, tmp, true); pass(tmp, a, false); }
    for (let i = 0; i < w * h; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255; data[i * 4 + 3] = a[i]; }
    c.putImageData(img, 0, 0);
}

/** 0 below 0.1, 1 above 0.9, smooth between: a blurred edge's 10%-90%
    stretch is the band, and the tails past it go. */
function sharpen(s: number): number {
    const t = Math.min(1, Math.max(0, (s - 0.1) / 0.8));
    return t * t * (3 - 2 * t);
}

function alphaOf(c: HTMLCanvasElement): Uint8ClampedArray {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const a = new Uint8ClampedArray(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
}

function maskCanvas(a: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
    const c = scratch(w, h);
    const cx = c.getContext('2d')!;
    const img = cx.createImageData(w, h);
    for (let i = 0; i < a.length; i++) {
        const o = i * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = a[i];
    }
    cx.putImageData(img, 0, 0);
    return c;
}

function softLayer(geo: TerrainGeometry, doc: MapDoc): SoftLayer | null {
    const soft = geo.soft;
    if (!soft) return null;
    if (soft.layer !== undefined) return soft.layer;
    const B = geo.softWidth;
    /* The blur's standard deviation: 10% to 90% across B cells, which the
       sharpening then turns into 0 to 1. */
    const sigma = B / 2.56;
    const reach = (B * 1.6 + 0.5) * CELL;
    const W = doc.cols * CELL, H = doc.rows * CELL;
    /* Blocky styles dither in quarter cells, lined up with the grid. */
    const q = geo.blocky ? CELL / DITHER : 1;
    const x = Math.max(0, Math.floor((soft.box.x0 - reach) / q) * q), y = Math.max(0, Math.floor((soft.box.y0 - reach) / q) * q);
    const x1 = Math.min(W, Math.ceil((soft.box.x1 + reach) / q) * q), y1 = Math.min(H, Math.ceil((soft.box.y1 + reach) / q) * q);
    if (x1 <= x || y1 <= y) { soft.layer = null; return null; }
    const w = x1 - x, h = y1 - y;
    /* Mask px per world px: enough for the blur to be smooth, within a
       budget. Blocky styles work in quarter cells, one mask px each. */
    let k = geo.blocky ? DITHER / CELL : Math.min(16, Math.max(2, 6 / B)) / CELL;
    if (!geo.blocky) k = Math.min(k, Math.sqrt(MASK_BUDGET / (w * h)), 4096 / w, 4096 / h);
    const mw = Math.max(1, Math.round(w * k)), mh = Math.max(1, Math.round(h * k));
    const sx = mw / w, sy = mh / h;
    const hard = scratch(mw, mh);
    const hc = hard.getContext('2d', { willReadFrequently: true })!;
    const clip = new Path2D();
    clip.rect(0, 0, W, H);
    const reset = () => {
        hc.setTransform(1, 0, 0, 1, 0, 0);
        hc.clearRect(0, 0, mw, mh);
        hc.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
    };
    const blurPx = sigma * CELL * sx;

    /* Each soft terrain's region, blurred: its share of the colour. */
    const shares = new Map<number, Uint8ClampedArray>();
    for (const i of soft.terrains) {
        const region = geo.regions.get(i);
        if (!region) continue;
        reset();
        hc.save();
        hc.clip(clip);
        hc.fillStyle = '#fff';
        hc.fill(region.path, region.rule);
        hc.restore();
        const canvas = scratch(mw, mh);
        blurInto(canvas, hard, blurPx);
        shares.set(i, alphaOf(canvas));
    }

    /* Each pair's zone: a stroke of its Soft edges wider than the band, so
       the band never meets its side. Not blurred — the blend replaces the
       drawing outright inside it, markers and all, so a half-way margin
       would show both. */
    type Zone = { x0: number; y0: number; w: number; h: number; a: Uint8ClampedArray };
    const partners = new Map<number, { other: number; zone: Zone }[]>();
    hc.strokeStyle = '#fff';
    hc.lineCap = 'round';
    hc.lineJoin = 'round';
    hc.lineWidth = B * 2.2 * CELL;
    for (const pair of soft.pairs) {
        if (!shares.has(pair.a) || !shares.has(pair.b)) continue;
        /* Only the pair's own stretch is read back: a map with one small
           Soft patch pays for that patch, not for the whole map. */
        const zx0 = Math.max(0, Math.floor((pair.box.x0 - reach - x) * sx));
        const zy0 = Math.max(0, Math.floor((pair.box.y0 - reach - y) * sy));
        const zx1 = Math.min(mw, Math.ceil((pair.box.x1 + reach - x) * sx));
        const zy1 = Math.min(mh, Math.ceil((pair.box.y1 + reach - y) * sy));
        if (zx1 <= zx0 || zy1 <= zy0) continue;
        reset();
        hc.stroke(pair.path);
        const d = hc.getImageData(zx0, zy0, zx1 - zx0, zy1 - zy0).data;
        const a = new Uint8ClampedArray((zx1 - zx0) * (zy1 - zy0));
        for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
        const zone = { x0: zx0, y0: zy0, w: zx1 - zx0, h: zy1 - zy0, a };
        for (const [t, other] of [[pair.a, pair.b], [pair.b, pair.a]]) {
            if (!partners.has(t)) partners.set(t, []);
            partners.get(t)!.push({ other, zone });
        }
    }

    /* For each soft terrain, the shares of its own colour and its partners'
       at each mask px of its box, sharpened. A partner counts only inside
       its pair's zone. The pixel styles give each px wholly to one terrain
       instead, by where a fixed 4x4 threshold pattern falls among the
       shares. */
    const parts: SoftLayer['parts'] = [];
    for (const [t, list] of partners) {
        const box = { x0: mw, y0: mh, x1: 0, y1: 0 };
        for (const { zone: z } of list) growBox(box, z.x0, z.y0, z.x0 + z.w, z.y0 + z.h);
        const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
        const sources = [shares.get(t)!, ...list.map((l) => shares.get(l.other)!)];
        const zones = list.map((l) => l.zone);
        const n = sources.length;
        const colour = sources.map(() => new Uint8ClampedArray(bw * bh));
        const s = new Float32Array(n);
        let any = false;
        for (let py = box.y0; py < box.y1; py++) {
            for (let px = box.x0; px < box.x1; px++) {
                const p = py * mw + px;
                /* Nowhere near its own region: nothing of it is drawn here. */
                if (!sources[0][p]) continue;
                const o = (py - box.y0) * bw + (px - box.x0);
                let total = s[0] = sources[0][p], zone = 0;
                for (let i = 1; i < n; i++) {
                    const z = zones[i - 1];
                    const zx = px - z.x0, zy = py - z.y0;
                    const v = zx >= 0 && zy >= 0 && zx < z.w && zy < z.h ? z.a[zy * z.w + zx] : 0;
                    if (v > zone) zone = v;
                    s[i] = sources[i][p] * v / 255;
                    total += s[i];
                }
                if (!zone || !total) continue;
                let sum = 0, top = 0;
                for (let i = 0; i < n; i++) {
                    s[i] = sharpen(s[i] / total);
                    sum += s[i];
                    if (s[i] > s[top]) top = i;
                }
                if (!sum) continue;
                any = true;
                if (geo.blocky) {
                    const pick = BAYER[(py % 4) * 4 + (px % 4)] * sum;
                    let run = 0, chosen = top;
                    for (let i = 0; i < n; i++) {
                        run += s[i];
                        if (run >= pick) { chosen = i; break; }
                    }
                    colour[chosen][o] = zone;
                    continue;
                }
                /* Rounded so they still add up to exactly the zone. */
                let left = zone;
                for (let i = 0; i < n; i++) {
                    const a = Math.round(zone * s[i] / sum);
                    colour[i][o] = a;
                    left -= a;
                }
                colour[top][o] = Math.max(0, colour[top][o] + left);
            }
        }
        if (!any) continue;
        const terrains = [t, ...list.map((l) => l.other)];
        parts.push({
            terrain: TERRAINS[t], region: geo.regions.get(t)!, box,
            shares: terrains.map((i, k) => ({ terrain: TERRAINS[i], share: colour[k] })),
        });
    }
    soft.layer = parts.length ? { x, y, w, h, mw, mh, parts, looks: new Map() } : null;
    return soft.layer;
}

/** A CSS colour as RGB. */
function rgbOf(css: string): [number, number, number] {
    const c = scratch(1, 1).getContext('2d', { willReadFrequently: true })!;
    c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
}

/** The parts in one style's colours. The land's shares are mixed into one
    image here, once, so a frame draws one image per terrain however many
    neighbours it blends with. Water stays a mask of its own: its depth
    shading is drawn over it, and that is no single colour. */
function partLooks(layer: SoftLayer, style: MapStyle): PartLook[] {
    const had = layer.looks.get(style.id);
    if (had) return had;
    const looks = layer.parts.map((part): PartLook => {
        const { x0, y0, x1, y1 } = part.box;
        const bw = x1 - x0, bh = y1 - y0;
        const rect = {
            x: layer.x + x0 * layer.w / layer.mw, y: layer.y + y0 * layer.h / layer.mh,
            w: bw * layer.w / layer.mw, h: bh * layer.h / layer.mh,
        };
        const land = part.shares.filter((x) => !x.terrain.water);
        const water = part.shares.filter((x) => x.terrain.water)
            .map((x) => ({ terrain: x.terrain, mask: maskCanvas(x.share, bw, bh) }));
        if (!land.length) return { ground: null, water, rect };
        const rgb = land.map((x) => rgbOf(style.terrain[x.terrain.slug]?.fill ?? '#888'));
        const c = scratch(bw, bh);
        const cx = c.getContext('2d')!;
        const img = cx.createImageData(bw, bh);
        const d = img.data;
        for (let p = 0; p < bw * bh; p++) {
            let a = 0, r = 0, g = 0, b = 0;
            for (let i = 0; i < land.length; i++) {
                const v = land[i].share[p];
                if (!v) continue;
                a += v; r += v * rgb[i][0]; g += v * rgb[i][1]; b += v * rgb[i][2];
            }
            if (!a) continue;
            const o = p * 4;
            d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; d[o + 3] = a;
        }
        cx.putImageData(img, 0, 0);
        return { ground: c, water, rect };
    });
    layer.looks.set(style.id, looks);
    return looks;
}

const DITHER = 4;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Lay the blend over what is already drawn, along the Soft edges only. */
function drawSoft(ctx: CanvasRenderingContext2D, geo: TerrainGeometry, doc: MapDoc, style: MapStyle, textures: TextureSource): void {
    const layer = softLayer(geo, doc);
    if (!layer) return;
    const depth = depthBands(geo, doc, style);
    const T = ctx.getTransform();
    const corners = [[layer.x, layer.y], [layer.x + layer.w, layer.y], [layer.x, layer.y + layer.h], [layer.x + layer.w, layer.y + layer.h]]
        .map(([px, py]) => T.transformPoint(new DOMPoint(px, py)));
    const dx0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
    const dy0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
    const dx1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))));
    const dy1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))));
    if (dx1 <= dx0 || dy1 <= dy0) return;

    const tw = Math.min(TILE, dx1 - dx0), th = Math.min(TILE, dy1 - dy0);
    const [acc, tmp, wet] = tiles(tw, th);
    const ac = acc.getContext('2d')!, tc = tmp.getContext('2d')!, wc = wet.getContext('2d')!;
    const smooth = !style.pixelated;
    const looks = partLooks(layer, style);
    const markers = layer.parts.map((part) => terrainPaints(tc, style, part.terrain, textures).slice(1));
    for (let ty = dy0; ty < dy1; ty += th) {
        for (let tx = dx0; tx < dx1; tx += tw) {
            const cw = Math.min(tw, dx1 - tx), ch = Math.min(th, dy1 - ty);
            const start = (c: CanvasRenderingContext2D) => {
                c.setTransform(1, 0, 0, 1, 0, 0);
                c.globalCompositeOperation = 'source-over';
                c.clearRect(0, 0, tw, th);
                c.setTransform(T.a, T.b, T.c, T.d, T.e - tx, T.f - ty);
            };
            const world = (c: CanvasRenderingContext2D) => c.setTransform(T.a, T.b, T.c, T.d, T.e - tx, T.f - ty);
            /* A water's whole look over this tile, its colour and depth
               shading, drawn once however many terrains blend into it. */
            const wetDone = new Set<TerrainDef>();
            const waterLook = (t: TerrainDef) => {
                let c = wetTiles.get(t.slug);
                if (!c) wetTiles.set(t.slug, c = scratch(tw, th));
                if (c.width < tw) c.width = tw;
                if (c.height < th) c.height = th;
                if (!wetDone.has(t)) {
                    wetDone.add(t);
                    const x = c.getContext('2d')!;
                    start(x);
                    x.fillStyle = style.terrain[t.slug]?.fill ?? '#888';
                    x.fillRect(layer.x, layer.y, layer.w, layer.h);
                    if (depth) paintDepth(x, depth, doc, style, false);
                }
                return c;
            };
            /* The colours, each terrain's inside its own region. Its shares
               add up to its zone, so what is drawn covers exactly the
               stretch the blend replaces; the regions do not overlap. */
            start(ac);
            layer.parts.forEach((part, k) => {
                const { ground, water, rect } = looks[k];
                const a = T.transformPoint(new DOMPoint(rect.x, rect.y));
                const b = T.transformPoint(new DOMPoint(rect.x + rect.w, rect.y + rect.h));
                if (Math.max(a.x, b.x) < tx || Math.min(a.x, b.x) > tx + cw
                    || Math.max(a.y, b.y) < ty || Math.min(a.y, b.y) > ty + ch) return;
                start(tc);
                tc.imageSmoothingEnabled = smooth;
                if (ground) tc.drawImage(ground, rect.x, rect.y, rect.w, rect.h);
                /* Water takes its depth shading with it, or a soft coast
                   would show a strip of unshaded sea along it. */
                for (const { terrain, mask } of water) {
                    start(wc);
                    wc.imageSmoothingEnabled = smooth;
                    wc.drawImage(mask, rect.x, rect.y, rect.w, rect.h);
                    wc.setTransform(1, 0, 0, 1, 0, 0);
                    wc.globalCompositeOperation = 'source-in';
                    wc.drawImage(waterLook(terrain), 0, 0);
                    tc.setTransform(1, 0, 0, 1, 0, 0);
                    tc.globalCompositeOperation = 'lighter';
                    tc.drawImage(wet, 0, 0, cw, ch, 0, 0, cw, ch);
                    world(tc);
                }
                /* Cut to the terrain's own region, water and all. */
                tc.globalCompositeOperation = 'destination-in';
                tc.fillStyle = '#fff';
                tc.fill(part.region.path, part.region.rule);
                ac.setTransform(1, 0, 0, 1, 0, 0);
                ac.globalCompositeOperation = 'source-over';
                ac.drawImage(tmp, 0, 0, cw, ch, 0, 0, cw, ch);
            });
            /* Each terrain's markers over them, exactly as the ordinary
               drawing has them, cut to where the colour went. */
            if (markers.some((m) => m.length)) {
                start(tc);
                tc.imageSmoothingEnabled = smooth;
                layer.parts.forEach((part, k) => {
                    for (const paint of markers[k]) {
                        tc.fillStyle = paint;
                        tc.fill(part.region.path, part.region.rule);
                    }
                    if (part.terrain.water && depth && markers[k].length) {
                        tc.save();
                        tc.clip(part.region.path, part.region.rule);
                        tc.globalCompositeOperation = 'source-atop';
                        paintDepth(tc, depth, doc, style, false);
                        tc.restore();
                    }
                });
                tc.setTransform(1, 0, 0, 1, 0, 0);
                tc.globalCompositeOperation = 'destination-in';
                tc.drawImage(acc, 0, 0);
                ac.setTransform(1, 0, 0, 1, 0, 0);
                ac.globalCompositeOperation = 'source-over';
                ac.drawImage(tmp, 0, 0, cw, ch, 0, 0, cw, ch);
            }
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(acc, 0, 0, cw, ch, tx, ty, cw, ch);
            ctx.restore();
        }
    }
}

/* ------------------------------------------------------------------ depth

   Water near land is banded by how far it lies from the shore: three steps of
   shallows, palest at the coast, and then the water as painted — so a sea
   painted in one terrain still reads as shelving off. The bands are steps,
   not a ramp: a smooth fade round every island
   read as the land GLOWING rather than as water getting shallow. The painted
   Deep sea / Sea / Shallows keep their own colours underneath.

   The distance comes from a chamfer transform of the samples at a few pixels
   a cell: land is distance 0, and sky (clouds) is neither and stays
   unshaded. The smooth styles trace each band's edge as a contour, rounded
   like the terrain's own, and fill between them; the pixel styles keep a
   pixel grid of bands, drawn sharp. Land counts as the nearest band, so
   nothing is traced along the coast itself — the land is painted over it. */

interface DepthField { w: number; h: number; g: number; kind: Uint8Array; dist: Float32Array }

interface DepthBands {
    /** Smooth styles: each band's own region, even-odd, nearest first. */
    regions?: { path: Path2D; color: string }[];
    /** Where one band meets the next. */
    edges?: Path2D;
    /** Pixel styles. */
    canvas?: HTMLCanvasElement;
}

const DEPTH_BUDGET = 1_200_000;

function depthField(geo: TerrainGeometry, doc: MapDoc): DepthField | null {
    if (geo.depthField !== undefined) return geo.depthField;
    const r = resolvedOf(doc);
    /* Pixels per cell: a divisor of `res`, so each pixel sits on a whole
       block of samples; fewer on a big map to keep within the budget. */
    let g = Math.min(r.res, geo.blocky ? 4 : 8);
    while (g > 1 && doc.cols * doc.rows * g * g > DEPTH_BUDGET) g /= 2;
    const step = r.res / g;
    const w = doc.cols * g, h = doc.rows * g;
    const kind = new Uint8Array(w * h);   // 0 sky, 1 water, 2 land
    const half = Math.floor(step / 2);
    let anyWater = false;
    for (let y = 0; y < h; y++) {
        const row = (y * step + half) * r.w;
        for (let x = 0; x < w; x++) {
            const t = TERRAINS[r.data[row + x * step + half]];
            const k = !t ? 2 : t.sky ? 0 : t.water ? 1 : 2;
            kind[y * w + x] = k;
            if (k === 1) anyWater = true;
        }
    }
    if (!anyWater) { geo.depthField = null; return null; }
    /* Two-pass 3-4 chamfer, in thirds of a pixel. */
    const INF = 1 << 29;
    const d = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = kind[i] === 2 ? 0 : INF;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            let v = d[i];
            if (x > 0) v = Math.min(v, d[i - 1] + 3);
            if (y > 0) {
                v = Math.min(v, d[i - w] + 3);
                if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
                if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
            }
            d[i] = v;
        }
    }
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            let v = d[i];
            if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
            if (y < h - 1) {
                v = Math.min(v, d[i + w] + 3);
                if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
                if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
            }
            d[i] = v;
        }
    }
    const dist = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dist[i] = d[i] >= INF ? Infinity : d[i] / 3 / g;
    geo.depthField = { w, h, g, kind, dist };
    return geo.depthField;
}

function hexRgba(hex: string): [number, number, number, number] {
    let h = hex.replace('#', '');
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return [v[0], v[1], v[2], h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255];
}

function depthBands(geo: TerrainGeometry, doc: MapDoc, style: MapStyle): DepthBands | null {
    const d = style.depth;
    if (!d || !geo.waterLayers) return null;
    geo.depth ??= new Map();
    if (geo.depth.has(style.id)) return geo.depth.get(style.id)!;
    const f = depthField(geo, doc);
    if (!f) { geo.depth.set(style.id, null); return null; }
    const { w, h, g, kind, dist } = f;
    /* Band per pixel: 0 sky, 1 the band nearest the coast (land too), and
       one more for every step passed. */
    const band = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        if (kind[i] === 0) continue;
        let b = 1;
        if (kind[i] === 1) for (const s of d.steps) if (dist[i] >= s) b++;
        band[i] = b;
    }
    let out: DepthBands;
    if (geo.blocky) {
        const canvas = scratch(w, h);
        const c = canvas.getContext('2d')!;
        const img = c.createImageData(w, h);
        const cols = d.colors.map(hexRgba);
        for (let i = 0; i < w * h; i++) {
            if (!band[i]) continue;
            const col = cols[Math.min(cols.length - 1, band[i] - 1)];
            img.data.set(col, i * 4);
        }
        c.putImageData(img, 0, 0);
        out = { canvas };
    } else {
        const levels = d.steps.map((_, k) => k + 2);
        const traced = traceLevels(band, w, h, [1, ...levels]);
        const scale = CELL / g;
        const layers = traced.map((loops) => {
            const path = new Path2D();
            for (const raw of loops) {
                const loop = chaikinClosed(chaikinClosed(raw));
                path.moveTo(loop[0][0] * scale, loop[0][1] * scale);
                for (let i = 1; i < loop.length; i++) path.lineTo(loop[i][0] * scale, loop[i][1] * scale);
                path.closePath();
            }
            return path;
        });
        const regions: { path: Path2D; color: string }[] = [];
        layers.forEach((layer, k) => {
            const color = d.colors[Math.min(d.colors.length - 1, k)];
            if (hexRgba(color)[3] === 0) return;
            const path = new Path2D();
            path.addPath(layer);
            if (k + 1 < layers.length) path.addPath(layers[k + 1]);
            regions.push({ path, color });
        });
        const edges = new Path2D();
        for (const layer of layers.slice(1)) edges.addPath(layer);
        out = { regions, edges };
    }
    geo.depth.set(style.id, out);
    return out;
}

/** Lay the depth bands on in whatever compositing the caller has set. */
function paintDepth(ctx: CanvasRenderingContext2D, bands: DepthBands, doc: MapDoc, style: MapStyle, withEdges: boolean): void {
    if (bands.canvas) {
        const smooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bands.canvas, 0, 0, doc.cols * CELL, doc.rows * CELL);
        ctx.imageSmoothingEnabled = smooth;
        return;
    }
    for (const r of bands.regions!) {
        ctx.fillStyle = r.color;
        ctx.fill(r.path, 'evenodd');
    }
    const line = style.depth?.line;
    if (withEdges && line && bands.edges) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width;
        ctx.lineJoin = 'round';
        ctx.stroke(bands.edges);
    }
}

function drawDepth(ctx: CanvasRenderingContext2D, geo: TerrainGeometry, doc: MapDoc, style: MapStyle): void {
    const bands = depthBands(geo, doc, style);
    if (!bands) return;
    ctx.save();
    paintDepth(ctx, bands, doc, style, true);
    ctx.restore();
}

/** Draw the map's ground under the transform already set on `ctx` (world px). */
export function drawTerrain(ctx: CanvasRenderingContext2D, geo: TerrainGeometry, doc: MapDoc, style: MapStyle,
    textures: TextureSource = probeTexture): void {
    const W = doc.cols * CELL, H = doc.rows * CELL;
    ctx.save();
    const clip = new Path2D();
    clip.rect(0, 0, W, H);
    ctx.clip(clip);
    ctx.imageSmoothingEnabled = !style.pixelated;

    geo.layers.forEach((layer, idx) => {
        if (idx === geo.waterLayers) drawDepth(ctx, geo, doc, style);
        if (idx === geo.waterLayers && geo.coast && style.coast) {
            const first = geo.layers[0];
            const skyOnly = !!style.coast.skyOnly;
            if (!skyOnly || first.terrain.sky) {
                ctx.save();
                if (skyOnly && geo.layers.length > 1 && geo.layers[1].terrain.water) {
                    /* The cloud alone: everything less the water above it. */
                    const sky = new Path2D();
                    sky.addPath(first.area);
                    sky.addPath(geo.layers[1].area);
                    ctx.clip(sky, 'evenodd');
                }
                ctx.strokeStyle = style.coast.color;
                ctx.lineJoin = 'round';
                for (const w of style.coast.widths) {
                    ctx.lineWidth = w * 2 * CELL;
                    ctx.stroke(geo.coast);
                }
                ctx.restore();
            }
        }
        fillLayer(ctx, style, layer.terrain, layer.area, textures);
    });
    /* A map that is all water has no land layer to come after it. */
    if (geo.waterLayers >= geo.layers.length) drawDepth(ctx, geo, doc, style);

    drawSoft(ctx, geo, doc, style, textures);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const layer of geo.layers) {
        const edge = style.terrain[layer.terrain.slug]?.edge;
        if (!layer.outline || !edge) continue;
        ctx.strokeStyle = edge.color;
        ctx.lineWidth = edge.width;
        ctx.stroke(layer.outline);
    }
    if (geo.styleBorders && style.cellBorder) {
        ctx.lineCap = 'butt';
        ctx.strokeStyle = style.cellBorder;
        ctx.lineWidth = Math.min(2, CELL / doc.res);
        ctx.stroke(geo.styleBorders);
    }
    if (geo.lines) {
        ctx.lineCap = geo.blocky ? 'square' : 'round';
        ctx.strokeStyle = style.line.color;
        ctx.lineWidth = geo.blocky ? Math.min(style.line.width, CELL / doc.res) : style.line.width;
        ctx.stroke(geo.lines);
    }
    ctx.restore();

    ctx.strokeStyle = style.frame.color;
    ctx.lineWidth = style.frame.width;
    ctx.strokeRect(-style.frame.width / 2, -style.frame.width / 2, W + style.frame.width, H + style.frame.width);
}

/* ------------------------------------------------------------ painted borders

   While the Borders brush is out, what it has painted is tinted over the map
   — one colour a look — so you can see where you have been, which the edges
   alone cannot show away from any edge. */

export const EDGE_TINT: Record<number, string> = { 1: '#f5c542', 2: '#1b1b1b', 3: '#e05555', 4: '#4aa3f0' };

let tint: { key: string; canvas: HTMLCanvasElement } | null = null;

export function drawEdgeTint(ctx: CanvasRenderingContext2D, doc: MapDoc): void {
    const painted = edgesOf(doc);
    if (!painted) return;
    const w = doc.cols * doc.res, h = doc.rows * doc.res;
    const key = w + 'x' + h + ':' + doc.edges;
    if (!tint || tint.key !== key) {
        const canvas = scratch(w, h);
        const c = canvas.getContext('2d')!;
        const img = c.createImageData(w, h);
        const rgb = Object.fromEntries(Object.entries(EDGE_TINT).map(([k, hex]) => [k, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]));
        for (let i = 0; i < painted.length; i++) {
            const col = rgb[painted[i]];
            if (!col) continue;
            img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 110;
        }
        c.putImageData(img, 0, 0);
        tint = { key, canvas };
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tint.canvas, 0, 0, doc.cols * CELL, doc.rows * CELL);
    ctx.restore();
}

/** The grid, over the ground and under everything placed on it. */
export function drawGrid(ctx: CanvasRenderingContext2D, doc: MapDoc, style: MapStyle, zoom: number,
    visible: { x0: number; y0: number; x1: number; y1: number }): void {
    if (!doc.grid.show || doc.grid.opacity <= 0) return;
    const x0 = Math.max(0, Math.floor(visible.x0)), x1 = Math.min(doc.cols, Math.ceil(visible.x1));
    const y0 = Math.max(0, Math.floor(visible.y0)), y1 = Math.min(doc.rows, Math.ceil(visible.y1));
    ctx.save();
    ctx.globalAlpha = doc.grid.opacity;
    ctx.strokeStyle = style.grid;
    /* One device pixel wide whatever the zoom: a grid that thickens as you zoom
       in reads as part of the art. */
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) { ctx.moveTo(x * CELL, y0 * CELL); ctx.lineTo(x * CELL, y1 * CELL); }
    for (let y = y0; y <= y1; y++) { ctx.moveTo(x0 * CELL, y * CELL); ctx.lineTo(x1 * CELL, y * CELL); }
    ctx.stroke();
    ctx.restore();
}
