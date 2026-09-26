import { chaikinClosed, traceContours } from '../geometry';
import type { Pt } from '../geometry';
import { TERRAINS, terrainOf } from '../terrain';
import type { TerrainDef } from '../terrain';
import type { MapStyle, TerrainLook } from '../styles';
import type { MapDoc } from '../types';
import { probeImage, terrainTextureUrl } from '../sprites';
import { CELL, patternTile, tileScale } from './patterns';

/* The ground, drawn into a canvas.

   The shapes are built once per change of the terrain string (buildGeometry) as
   Path2D objects in world px; every frame after that — a pan, a zoom — only
   fills and strokes them under the view transform, which is cheap. The canvas
   is the size of the VIEWPORT, not of the map: a 200x200 map at 32px a cell is
   6400px square, which at a 2x pixel ratio is a canvas no browser will give you.

   Two ways to build:

   - smooth: one layer per terrain in z order, each covering every cell AT OR
     ABOVE its z. So a layer's outline is exactly where that terrain and
     everything stacked on it end, the next layer paints over its own part, and
     two neighbouring smooth edges can never leave a sliver of nothing between
     them. The outlines are marching squares round the cell centres, rounded off
     with two passes of Chaikin — and in a style with `wobble`, jittered first,
     at points keyed by position so the ink line does not crawl on redraw;
   - blocky: one region per terrain, the union of its own cells, and the
     optional 1px border wherever two different terrains meet. */

export interface TerrainLayer {
    terrain: TerrainDef;
    /** What to fill. */
    area: Path2D;
    /** The outline to ink, when the style gives this terrain an edge. */
    outline: Path2D | null;
}

export interface TerrainGeometry {
    key: string;
    layers: TerrainLayer[];
    /** Smooth styles: the edge of all land, for the coastal wash. */
    coast: Path2D | null;
    /** How many water layers come before the land — the wash goes between. */
    waterLayers: number;
    /** Blocky styles: the lines between different terrains. */
    borders: Path2D | null;
}

/* A stable pseudo-random value for a lattice point. */
function hash(x: number, y: number, k: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
    return s - Math.floor(s);
}

/* Smooth value noise, -1..1: hashed lattice values blended with smoothstep.
   Sampled at the outline's points it bends a coastline gently over a few
   cells instead of shaking it point by point, and — being a function of
   position alone — two terrains sharing an edge bend it identically. */
function noise(x: number, y: number, k: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, k), b = hash(x0 + 1, y0, k), c = hash(x0, y0 + 1, k), d = hash(x0 + 1, y0 + 1, k);
    return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

/** Wavelength of the wobble, in cells. */
const WOBBLE_SCALE = 2.3;

function loopsToPath(loops: Pt[][], wobble: number): Path2D {
    const path = new Path2D();
    for (let loop of loops) {
        if (wobble > 0) {
            loop = loop.map(([x, y]) => {
                const u = x / WOBBLE_SCALE, v = y / WOBBLE_SCALE;
                /* Two octaves: the broad bend, and a little grain on top. */
                const dx = noise(u, v, 1) + 0.35 * noise(u * 3.1, v * 3.1, 3);
                const dy = noise(u, v, 2) + 0.35 * noise(u * 3.1, v * 3.1, 4);
                return [x + dx * wobble, y + dy * wobble] as Pt;
            });
        }
        loop = chaikinClosed(chaikinClosed(loop));
        path.moveTo(loop[0][0] * CELL, loop[0][1] * CELL);
        for (let i = 1; i < loop.length; i++) path.lineTo(loop[i][0] * CELL, loop[i][1] * CELL);
        path.closePath();
    }
    return path;
}

export function geometryKey(doc: MapDoc, style: MapStyle): string {
    return doc.cols + 'x' + doc.rows + ':' + style.edgeMode + ':' + style.wobble + ':' + (style.cellBorder ? 1 : 0) + ':' + doc.terrain;
}

export function buildGeometry(doc: MapDoc, style: MapStyle): TerrainGeometry {
    const { cols, rows, terrain } = doc;
    const key = geometryKey(doc, style);
    const n = cols * rows;
    const present = new Set<string>();
    for (let i = 0; i < n; i++) present.add(terrain[i]);
    const order = TERRAINS.filter((t) => present.has(t.code));
    /* Unknown codes read as the fallback terrain, which may not be in `order`. */
    for (const code of present) {
        const t = terrainOf(code);
        if (!order.includes(t)) order.push(t);
    }
    order.sort((a, b) => a.z - b.z);

    if (style.edgeMode === 'blocky') return buildBlocky(doc, style, order, key);

    const z = new Int8Array(n);
    for (let i = 0; i < n; i++) z[i] = terrainOf(terrain[i]).z;
    const mask = new Uint8Array(n);
    const layers: TerrainLayer[] = [];
    const full = new Path2D();
    full.rect(0, 0, cols * CELL, rows * CELL);

    let coast: Path2D | null = null;
    let waterLayers = 0;
    order.forEach((t, idx) => {
        let area: Path2D;
        if (idx === 0) {
            area = full;
        } else {
            for (let i = 0; i < n; i++) mask[i] = z[i] >= t.z ? 1 : 0;
            area = loopsToPath(traceContours(mask, cols, rows), style.wobble);
        }
        if (t.water) waterLayers = idx + 1;
        else if (!coast && idx > 0 && order[idx - 1].water) coast = area;
        const look = style.terrain[t.slug];
        layers.push({ terrain: t, area, outline: look?.edge && idx > 0 ? area : null });
    });

    return { key, layers, coast, waterLayers, borders: null };
}

function buildBlocky(doc: MapDoc, style: MapStyle, order: TerrainDef[], key: string): TerrainGeometry {
    const { cols, rows, terrain } = doc;
    const paths = new Map<string, Path2D>();
    for (const t of order) paths.set(t.code, new Path2D());
    /* Horizontal runs of one terrain as one rect each — far fewer subpaths
       than a rect per cell on a map painted in broad strokes. */
    for (let y = 0; y < rows; y++) {
        let x = 0;
        while (x < cols) {
            const code = terrain[y * cols + x];
            let end = x + 1;
            while (end < cols && terrain[y * cols + end] === code) end++;
            const p = paths.get(terrainOf(code).code) ?? paths.get(code);
            p?.rect(x * CELL, y * CELL, (end - x) * CELL, CELL);
            x = end;
        }
    }
    let borders: Path2D | null = null;
    if (style.cellBorder) {
        borders = new Path2D();
        const at = (x: number, y: number) => terrain[y * cols + x];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (x < cols - 1 && at(x, y) !== at(x + 1, y)) {
                    borders.moveTo((x + 1) * CELL, y * CELL); borders.lineTo((x + 1) * CELL, (y + 1) * CELL);
                }
                if (y < rows - 1 && at(x, y) !== at(x, y + 1)) {
                    borders.moveTo(x * CELL, (y + 1) * CELL); borders.lineTo((x + 1) * CELL, (y + 1) * CELL);
                }
            }
        }
    }
    const layers = order.map((t) => ({ terrain: t, area: paths.get(t.code)!, outline: null }));
    return { key, layers, coast: null, waterLayers: 0, borders };
}

/* ------------------------------------------------------------------ drawing */

function fillLayer(ctx: CanvasRenderingContext2D, style: MapStyle, t: TerrainDef, area: Path2D): void {
    const look: TerrainLook | undefined = style.terrain[t.slug];
    /* The terrain's own colour first, always: a texture with transparent
       parts would otherwise show whatever lies underneath — the sea. */
    ctx.fillStyle = look?.fill ?? '#888';
    ctx.fill(area, 'evenodd');
    /* The owner's own tile for this terrain, one cell per repeat, replaces
       the procedural pattern. */
    const tex = probeImage(terrainTextureUrl(style, t.slug));
    if (tex && tex.naturalWidth > 0) {
        const pat = ctx.createPattern(tex, 'repeat');
        if (pat) {
            pat.setTransform(new DOMMatrix([CELL / tex.naturalWidth, 0, 0, CELL / tex.naturalHeight, 0, 0]));
            ctx.fillStyle = pat;
            ctx.fill(area, 'evenodd');
            return;
        }
    }
    if (look?.pattern) {
        const tile = patternTile(look.pattern, look.ink ?? '#0003');
        const pat = tile && ctx.createPattern(tile, 'repeat');
        if (pat) {
            const s = tileScale(look.pattern);
            pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
            ctx.fillStyle = pat;
            ctx.fill(area, 'evenodd');
        }
    }
}

/** Draw the map's ground under the transform already set on `ctx` (world px). */
export function drawTerrain(ctx: CanvasRenderingContext2D, geo: TerrainGeometry, doc: MapDoc, style: MapStyle): void {
    const W = doc.cols * CELL, H = doc.rows * CELL;
    ctx.save();
    const clip = new Path2D();
    clip.rect(0, 0, W, H);
    ctx.clip(clip);
    ctx.imageSmoothingEnabled = !style.pixelated;

    geo.layers.forEach((layer, idx) => {
        if (idx === geo.waterLayers && geo.coast && style.coast) {
            ctx.strokeStyle = style.coast.color;
            ctx.lineJoin = 'round';
            for (const w of style.coast.widths) {
                ctx.lineWidth = w * 2 * CELL;
                ctx.stroke(geo.coast);
            }
        }
        fillLayer(ctx, style, layer.terrain, layer.area);
    });

    for (const layer of geo.layers) {
        const edge = style.terrain[layer.terrain.slug]?.edge;
        if (!layer.outline || !edge) continue;
        ctx.strokeStyle = edge.color;
        ctx.lineWidth = edge.width;
        ctx.lineJoin = 'round';
        ctx.stroke(layer.outline);
    }

    if (geo.borders && style.cellBorder) {
        ctx.strokeStyle = style.cellBorder;
        ctx.lineWidth = 2;
        ctx.stroke(geo.borders);
    }
    ctx.restore();

    ctx.strokeStyle = style.frame.color;
    ctx.lineWidth = style.frame.width;
    ctx.strokeRect(-style.frame.width / 2, -style.frame.width / 2, W + style.frame.width, H + style.frame.width);
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
