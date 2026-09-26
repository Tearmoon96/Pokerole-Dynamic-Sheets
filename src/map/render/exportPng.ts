import { styleOf } from '../styles';
import type { MapStyle } from '../styles';
import { landmarkOf } from '../landmarks';
import { TERRAINS } from '../terrain';
import { landmarkChain, markerChain, pokemonTokenChain, terrainTextureUrl } from '../sprites';
import { midpoint, polygonD, sampleCurve, smoothPathD, taperOutline } from '../geometry';
import type { Pt } from '../geometry';
import { typeColors, TYPE_ICONS } from '../../lib/themeTables';
import { CELL } from './patterns';
import { buildGeometry, drawGrid, drawTerrain } from './terrain';
import type { TextureSource } from './terrain';
import type { MapDoc, MapLabel, MapPath, MapStamp, MapToken } from '../types';

/* The whole map as one PNG.

   The page draws the ground on a canvas and everything else as elements, so
   an export redraws the lot onto one canvas, in the page's own order and with
   its own measurements: terrain, grid, paths, landmarks, labels, tokens.

   Every picture goes through `load`, which the caller supplies, because where
   a picture may come from decides whether the canvas can be saved at all. A
   canvas that has drawn an image the page is not allowed to read is
   "tainted", and refuses to become a file. On the hosted site the pictures
   are same-origin and fine; opened from the disk they are not, and have to be
   read out of a folder the user chose (see exportImages.ts). */

export interface ExportOptions {
    pxPerCell: number;
    grid: boolean;
    tokens: boolean;
}

export interface LoadedImage {
    img: CanvasImageSource;
    w: number;
    h: number;
    /** Which candidate answered. */
    url: string;
}
export type ImageLoader = (candidates: string[]) => Promise<LoadedImage | null>;

/** Browsers cap a canvas; stay well inside every one of them. */
export const MAX_SIDE = 16384;
export const MAX_AREA = 120_000_000;

export function exportSize(doc: MapDoc, pxPerCell: number): { w: number; h: number; ok: boolean } {
    const style = styleOf(doc.styleId);
    const m = Math.ceil(style.frame.width * pxPerCell / CELL);
    const w = Math.round(doc.cols * pxPerCell) + 2 * m, h = Math.round(doc.rows * pxPerCell) + 2 * m;
    return { w, h, ok: w <= MAX_SIDE && h <= MAX_SIDE && w * h <= MAX_AREA };
}

/* ------------------------------------------------------------ glyphs */

const glyphs = new Map<string, string>();

/** The character a FontAwesome class draws, read off the stylesheet, so the
    canvas can draw the same glyph with the icon font. */
function faGlyph(icon: string): string {
    const hit = glyphs.get(icon);
    if (hit !== undefined) return hit;
    const el = document.createElement('i');
    el.className = 'fa-solid ' + icon;
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    const content = getComputedStyle(el, '::before').content;
    el.remove();
    const ch = content && content !== 'none' ? content.replace(/^["']|["']$/g, '') : '?';
    glyphs.set(icon, ch);
    return ch;
}

const FA_FONT = '"Font Awesome 6 Free"';

function glyph(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, size: number, color: string): void {
    ctx.save();
    ctx.font = `900 ${size}px ${FA_FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(faGlyph(icon), x, y);
    ctx.restore();
}

/* ------------------------------------------------------------ paths */

function drawPath(ctx: CanvasRenderingContext2D, p: MapPath, style: MapStyle): void {
    const look = style.paths[p.kind];
    const w = Math.max(0.05, p.width * look.widthScale) * CELL;
    const casing = Math.max(2, w * 0.3);
    if (look.taper) {
        const body = new Path2D(polygonD(taperOutline(sampleCurve(p.points as Pt[]), p.width * 0.25, p.width), CELL));
        if (look.casing) {
            ctx.fillStyle = look.casing;
            ctx.strokeStyle = look.casing;
            ctx.lineWidth = casing;
            ctx.lineJoin = 'round';
            ctx.fill(body);
            ctx.stroke(body);
        }
        ctx.fillStyle = look.color;
        ctx.fill(body);
    } else {
        const d = new Path2D(smoothPathD(p.points as Pt[], CELL));
        ctx.lineJoin = 'round';
        ctx.lineCap = look.cap;
        if (look.casing) {
            ctx.setLineDash([]);
            ctx.strokeStyle = look.casing;
            ctx.lineWidth = w + casing * 2;
            ctx.stroke(d);
        }
        ctx.setLineDash(look.dash ? look.dash.map((x) => x * w) : []);
        ctx.strokeStyle = look.color;
        ctx.lineWidth = w;
        ctx.stroke(d);
        ctx.setLineDash([]);
    }

    const lab = style.label.route;
    if (p.label) {
        const size = lab.size * CELL * 0.8;
        ctx.font = `${lab.italic ? 'italic ' : ''}${lab.weight} ${size}px ${lab.font}`;
        textAlongPath(ctx, sampleCurve(p.points as Pt[]).map(([x, y]) => [x * CELL, y * CELL] as Pt),
            p.label, -(p.width * CELL) / 2 - size * 0.3, lab.color, lab.halo, size * 0.22);
    }
    if (p.kind === 'route' && p.routeNo) {
        const [mx, my] = midpoint(p.points as Pt[]);
        ctx.save();
        ctx.translate(mx * CELL, my * CELL);
        ctx.beginPath();
        ctx.roundRect(-CELL * 0.55, -CELL * 0.38, CELL * 1.1, CELL * 0.76, CELL * 0.16);
        ctx.fillStyle = style.badge.fill;
        ctx.fill();
        ctx.strokeStyle = style.badge.border;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `700 ${CELL * 0.46}px ${lab.font}`;
        ctx.fillStyle = style.badge.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.routeNo, 0, 0);
        ctx.restore();
    }
}

/** Text laid along a polyline, centred on it, each letter turned to the line
    — what the page does with an SVG <textPath>. `dy` lifts it off the line. */
function textAlongPath(ctx: CanvasRenderingContext2D, pts: Pt[], text: string, dy: number,
    fill: string, halo: string, haloWidth: number): void {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const width = ctx.measureText(text).width;
    let s = total / 2 - width / 2;
    const at = (d: number): { x: number; y: number; a: number } => {
        d = Math.max(0, Math.min(total, d));
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const seg = cum[i] - cum[i - 1] || 1;
        const t = (d - cum[i - 1]) / seg;
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) };
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    for (const ch of text) {
        const cw = ctx.measureText(ch).width;
        const p = at(s + cw / 2);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.translate(0, dy);
        ctx.strokeStyle = halo;
        ctx.lineWidth = haloWidth;
        ctx.strokeText(ch, 0, 0);
        ctx.fillStyle = fill;
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        s += cw;
    }
}

/* ------------------------------------------------------------ stamps */

async function drawStamp(ctx: CanvasRenderingContext2D, s: MapStamp, style: MapStyle, load: ImageLoader): Promise<boolean> {
    const def = landmarkOf(s.landmark);
    const px = s.size * CELL;
    const art = await load(landmarkChain(style, s.landmark));
    ctx.save();
    ctx.translate(s.x * CELL, s.y * CELL);
    ctx.rotate(s.rotation * Math.PI / 180);
    if (art) {
        const k = Math.min(px / art.w, px / art.h);
        const w = art.w * k, h = art.h * k;
        ctx.save();
        if (s.flip) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = !style.pixelated;
        ctx.drawImage(art.img, -w / 2, -h / 2, w, h);
        ctx.restore();
    } else {
        const r = px * 0.39;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = def.color;
        ctx.fill();
        ctx.strokeStyle = '#0006';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.save();
        if (s.flip) ctx.scale(-1, 1);
        glyph(ctx, def.icon, 0, 0, px * 0.45, '#fff');
        ctx.restore();
    }
    if (s.type && typeColors[s.type]) {
        const d = px * 0.3, cx = px / 2 - px * 0.04 - d / 2, cy = -px / 2 + px * 0.04 + d / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
        ctx.fillStyle = typeColors[s.type];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        glyph(ctx, TYPE_ICONS[s.type] || 'fa-circle', cx, cy, px * 0.16, '#fff');
    }
    if (s.label) {
        const lab = style.label.small;
        const size = Math.max(10, lab.size * CELL * 1.1);
        ctx.font = `${lab.italic ? 'italic ' : ''}${lab.weight} ${size}px ${lab.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = lab.halo;
        ctx.lineWidth = size * 0.3;
        ctx.strokeText(s.label, 0, px / 2);
        ctx.fillStyle = lab.color;
        ctx.fillText(s.label, 0, px / 2);
    }
    ctx.restore();
    return !!art;
}

/* ------------------------------------------------------------ labels */

function drawLabel(ctx: CanvasRenderingContext2D, l: MapLabel, style: MapStyle): void {
    const look = style.label[l.role];
    const size = look.size * CELL * l.scale;
    const text = look.upper ? l.text.toUpperCase() : l.text;
    const lines = text.split('\n');
    ctx.save();
    ctx.translate(l.x * CELL, l.y * CELL);
    if (l.rotation) ctx.rotate(l.rotation * Math.PI / 180);
    ctx.font = `${look.italic ? 'italic ' : ''}${look.weight} ${size}px ${look.font}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = (look.spacing ? look.spacing * size : 0) + 'px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    lines.forEach((ln, i) => {
        /* The same baselines as the page's <tspan>s. */
        const y = (-(lines.length - 1) / 2 * 1.15 + 0.35 + i * 1.15) * size;
        ctx.strokeStyle = look.halo;
        ctx.lineWidth = size * 0.2;
        ctx.strokeText(ln, 0, y);
        ctx.fillStyle = look.color;
        ctx.fillText(ln, 0, y);
    });
    ctx.restore();
}

/* ------------------------------------------------------------ tokens */

async function drawToken(ctx: CanvasRenderingContext2D, t: MapToken, style: MapStyle, load: ImageLoader): Promise<boolean> {
    const px = t.size * CELL;
    const ring = Math.max(2, px * 0.07);
    const x = t.x * CELL, y = t.y * CELL;
    const chain = t.kind === 'pokemon' && t.image
        ? pokemonTokenChain(t.image).map((c) => c.url)
        : markerChain(style, t.kind === 'trainer' ? 'trainer' : 'wild');
    const art = await load(chain);
    const inner = px / 2 - ring;

    ctx.save();
    ctx.shadowColor = '#0007';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(x, y, px / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffffd9';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, inner, 0, Math.PI * 2);
    ctx.clip();
    if (art) {
        ctx.imageSmoothingEnabled = !style.pixelated;
        const d = inner * 2;
        if (/BoxSprites/.test(art.url)) {
            /* A Box sprite is a whole body in a square. The page frames it
               `object-fit: cover; object-position: 50% 30%` and scales it by
               1.25, so it reads as a head in a circle like the rest. */
            const k0 = Math.max(d / art.w, d / art.h);
            const iw = art.w * k0, ih = art.h * k0;
            const cx = -d / 2 + (d - iw) * 0.5 + iw / 2, cy = -d / 2 + (d - ih) * 0.3 + ih / 2;
            const w = iw * 1.25, h = ih * 1.25;
            ctx.drawImage(art.img, x + cx * 1.25 - w / 2, y + cy * 1.25 - h / 2, w, h);
        } else {
            const k = Math.min(d / art.w, d / art.h);
            const w = art.w * k, h = art.h * k;
            ctx.drawImage(art.img, x - w / 2, y - h / 2, w, h);
        }
    } else {
        ctx.fillStyle = t.color;
        ctx.fillRect(x - inner, y - inner, inner * 2, inner * 2);
        glyph(ctx, t.kind === 'trainer' ? 'fa-user' : 'fa-question', x, y, px * 0.45, '#fff');
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, px / 2 - ring / 2, 0, Math.PI * 2);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = ring;
    ctx.stroke();

    if (t.name) {
        const size = Math.max(9, px * 0.26);
        ctx.font = `600 ${size}px Outfit, sans-serif`;
        const w = ctx.measureText(t.name).width + size * 0.7;
        const h = size * 1.35;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y + px / 2 + 2, w, h, size * 0.5);
        ctx.fillStyle = t.color;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.name, x, y + px / 2 + 2 + h / 2);
    }
    return !!art;
}

/* ------------------------------------------------------------ the export */

export interface ExportResult {
    blob: Blob;
    width: number;
    height: number;
    /** Pictures that fell back to their placeholder. */
    missing: number;
}

export async function renderMapPng(doc: MapDoc, opts: ExportOptions, load: ImageLoader): Promise<ExportResult> {
    const style = styleOf(doc.styleId);
    const { w, h, ok } = exportSize(doc, opts.pxPerCell);
    if (!ok) throw new Error('That is too big for one image — choose fewer pixels per cell.');
    const k = opts.pxPerCell / CELL;
    const m = Math.ceil(style.frame.width * k);

    /* Fonts first: a canvas draws with whatever is loaded NOW, and an icon
       font that has not arrived draws its glyphs as empty boxes. */
    const fonts = new Set<string>([`900 20px ${FA_FONT}`, '600 20px Outfit']);
    for (const l of Object.values(style.label)) fonts.add(`${l.italic ? 'italic ' : ''}${l.weight} 20px ${l.font}`);
    await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => [])));

    const textures = new Map<string, LoadedImage | null>();
    await Promise.all(TERRAINS.map(async (t) => { textures.set(t.slug, await load([terrainTextureUrl(style, t.slug)])); }));
    const textureSource: TextureSource = (_s, slug) => textures.get(slug) ?? null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = style.backdrop;
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(k, 0, 0, k, m, m);

    drawTerrain(ctx, buildGeometry(doc, style), doc, style, textureSource);
    if (opts.grid) {
        drawGrid(ctx, { ...doc, grid: { ...doc.grid, show: true, opacity: doc.grid.opacity || 0.5 } }, style, k,
            { x0: 0, y0: 0, x1: doc.cols, y1: doc.rows });
    }

    let missing = 0;
    for (const p of doc.paths) drawPath(ctx, p, style);
    for (const s of doc.stamps) if (!(await drawStamp(ctx, s, style, load))) missing++;
    for (const l of doc.labels) drawLabel(ctx, l, style);
    if (opts.tokens) for (const t of doc.tokens) if (!(await drawToken(ctx, t, style, load))) missing++;

    const blob = await new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode the image.'))), 'image/png');
        } catch (e) {
            reject(e);
        }
    });
    return { blob, width: w, height: h, missing };
}
