import { chaikinClosed, dropCollinear, traceLevels } from '../geometry';
import type { Pt } from '../geometry';
import { TERRAINS } from '../terrain';
import type { TerrainDef } from '../terrain';
import type { MapStyle, TerrainLook } from '../styles';
import type { MapDoc } from '../types';
import { rasterOf } from '../raster';
import { probeImage, terrainTextureUrl } from '../sprites';
import { CELL, patternTile, tileScale } from './patterns';

/* The ground, drawn into a canvas.

   The shapes are built once per change of the terrain (buildGeometry) as
   Path2D objects in world px; every frame after that — a pan, a zoom — only
   fills and strokes them under the view transform, which is cheap. The canvas
   is the size of the VIEWPORT, not of the map: a 200x200 map at 32px a cell is
   6400px square, which at a 2x pixel ratio is a canvas no browser will give you.

   The shapes come from the terrain samples (raster.ts) as they are. Nothing
   here bends an edge: a square brush's square stays square, and an Organic
   stroke wanders because the brush painted it wandering.

   Two ways to build:

   - smooth: one layer per terrain in z order, each covering every sample AT OR
     ABOVE its z. So a layer's outline is exactly where that terrain and
     everything stacked on it end, the next layer paints over its own part, and
     two neighbouring edges can never leave a sliver of nothing between them.
     The outlines are marching squares round the sample centres, with two
     passes of Chaikin to take the stair-steps off a diagonal;
   - blocky: one region per terrain, the union of its own samples, and the
     optional border wherever two different terrains meet. */

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

function loopsToPath(loops: Pt[][], scale: number): Path2D {
    const path = new Path2D();
    for (let loop of loops) {
        /* Chaikin on the dense outline first, so it only rounds off a
           sample's worth of corner; THEN drop the collinear points. The other
           way round turns a square into an octagon. */
        loop = dropCollinear(chaikinClosed(chaikinClosed(loop)));
        path.moveTo(loop[0][0] * scale, loop[0][1] * scale);
        for (let i = 1; i < loop.length; i++) path.lineTo(loop[i][0] * scale, loop[i][1] * scale);
        path.closePath();
    }
    return path;
}

export function geometryKey(doc: MapDoc, style: MapStyle): string {
    return doc.cols + 'x' + doc.rows + '@' + doc.res + ':' + style.edgeMode + ':' + (style.cellBorder ? 1 : 0) + ':' + doc.terrain;
}

export function buildGeometry(doc: MapDoc, style: MapStyle): TerrainGeometry {
    const key = geometryKey(doc, style);
    const r = rasterOf(doc);
    /* A raster holds indices into TERRAINS, which is in z order — so the
       index IS the level the contours are traced at. */
    const present = new Uint8Array(TERRAINS.length);
    for (let i = 0; i < r.data.length; i++) present[r.data[i]] = 1;
    const order = TERRAINS.map((t, i) => ({ t, i })).filter((x) => present[x.i]);

    if (style.edgeMode === 'blocky') return buildBlocky(doc, style, order, key);

    const scale = CELL / r.res;
    const full = new Path2D();
    full.rect(0, 0, doc.cols * CELL, doc.rows * CELL);
    const traced = traceLevels(r.data, r.w, r.h, order.slice(1).map((x) => x.i));

    const layers: TerrainLayer[] = [];
    let coast: Path2D | null = null;
    let waterLayers = 0;
    order.forEach(({ t }, idx) => {
        const area = idx === 0 ? full : loopsToPath(traced[idx - 1], scale);
        if (t.water) waterLayers = idx + 1;
        else if (!coast && idx > 0 && order[idx - 1].t.water) coast = area;
        const look = style.terrain[t.slug];
        layers.push({ terrain: t, area, outline: look?.edge && idx > 0 ? area : null });
    });

    return { key, layers, coast, waterLayers, borders: null };
}

function buildBlocky(doc: MapDoc, style: MapStyle, order: { t: TerrainDef; i: number }[], key: string): TerrainGeometry {
    const { w, h, res, data } = rasterOf(doc);
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
    let borders: Path2D | null = null;
    if (style.cellBorder) {
        borders = new Path2D();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const v = data[y * w + x];
                if (x < w - 1 && v !== data[y * w + x + 1]) {
                    borders.moveTo((x + 1) * px, y * px); borders.lineTo((x + 1) * px, (y + 1) * px);
                }
                if (y < h - 1 && v !== data[(y + 1) * w + x]) {
                    borders.moveTo(x * px, (y + 1) * px); borders.lineTo((x + 1) * px, (y + 1) * px);
                }
            }
        }
    }
    const layers = order.map(({ t, i }) => ({ terrain: t, area: paths.get(i)!, outline: null }));
    return { key, layers, coast: null, waterLayers: 0, borders };
}

/* ------------------------------------------------------------------ drawing */

/** Where a terrain's texture comes from: the page's own probe normally, a
    set loaded beforehand for a PNG export (see exportPng.ts). */
export type TextureSource = (style: MapStyle, slug: string) => { img: CanvasImageSource; w: number; h: number } | null;

const probeTexture: TextureSource = (style, slug) => {
    const img = probeImage(terrainTextureUrl(style, slug));
    return img && img.naturalWidth > 0 ? { img, w: img.naturalWidth, h: img.naturalHeight } : null;
};

function fillLayer(ctx: CanvasRenderingContext2D, style: MapStyle, t: TerrainDef, area: Path2D, textures: TextureSource): void {
    const look: TerrainLook | undefined = style.terrain[t.slug];
    /* The terrain's own colour first, always: a texture with transparent
       parts would otherwise show whatever lies underneath — the sea. */
    ctx.fillStyle = look?.fill ?? '#888';
    ctx.fill(area, 'evenodd');
    /* The owner's own tile for this terrain, one cell per repeat, replaces
       the procedural pattern. */
    const tex = textures(style, t.slug);
    if (tex) {
        const pat = ctx.createPattern(tex.img, 'repeat');
        if (pat) {
            pat.setTransform(new DOMMatrix([CELL / tex.w, 0, 0, CELL / tex.h, 0, 0]));
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
export function drawTerrain(ctx: CanvasRenderingContext2D, geo: TerrainGeometry, doc: MapDoc, style: MapStyle,
    textures: TextureSource = probeTexture): void {
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
        fillLayer(ctx, style, layer.terrain, layer.area, textures);
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
        ctx.lineWidth = Math.min(2, CELL / doc.res);
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
