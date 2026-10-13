import { noise } from '../noise';
import { CELL } from './patterns';
import type { MapStyle } from '../styles';
import type { MapDoc } from '../types';

/* Aged paper over the ground, for a style that asks for it (`MapStyle.paper`).

   Two layers, both MULTIPLIED over what is drawn, so they only ever darken
   and the ink keeps its weight:

   - a picture of the whole sheet at a few pixels a cell: soft brown stains
     from layered noise, edges burnt darker the nearer the border, and the
     folds of a map that has been carried about. Seeded by the map's id, so
     every map has its own stains and they never move while it is edited;
   - a small repeating grain of fibres and specks, at world scale, so the
     paper still has a surface when the GM zooms in.

   It is drawn inside `drawTerrain`, so the editor, the PNG and the players'
   picture all show the same sheet. */

/** Pixels a cell of the sheet picture; its stains are broad, so few will do. */
const PX_PER_CELL = 8;
const MAX_SIDE = 1600;

const sheets = new Map<string, HTMLCanvasElement>();
let grainTile: HTMLCanvasElement | null = null;

function seedOf(text: string): number {
    let h = 17;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return (Math.abs(h) % 997) + 3;
}

function rgbOf(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** The whole sheet: stains, burnt edges, folds. Made once per map and size. */
function sheetOf(doc: MapDoc, paper: NonNullable<MapStyle['paper']>, styleId: string): HTMLCanvasElement {
    const key = styleId + ':' + doc.id + ':' + doc.cols + 'x' + doc.rows;
    const hit = sheets.get(key);
    if (hit) return hit;
    const k = Math.max(2, Math.min(PX_PER_CELL, MAX_SIDE / Math.max(doc.cols, doc.rows)));
    const W = Math.max(1, Math.round(doc.cols * k)), H = Math.max(1, Math.round(doc.rows * k));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const s = seedOf(doc.id);
    const stain = rgbOf(paper.stain), burn = rgbOf(paper.burn);
    const folds = paper.creases ? [doc.cols / 3, (doc.cols * 2) / 3] : [];
    const foldY = paper.creases ? doc.rows / 2 : -1;
    for (let y = 0; y < H; y++) {
        const v = y / k;
        for (let x = 0; x < W; x++) {
            const u = x / k;
            /* Stains: broad blotches with a little detail at their rims. */
            const n = noise(u / 7, v / 7, s) * 0.55 + noise(u / 2.6, v / 2.6, s + 1) * 0.3 + noise(u * 0.8, v * 0.8, s + 2) * 0.15;
            const aStain = 0.07 + n * 0.05 + smooth(0.2, 0.8, n) * 0.3;
            /* Burnt edges, ragged rather than a clean vignette. */
            const d = Math.min(u, v, doc.cols - u, doc.rows - v) + noise(u / 1.3, v / 1.3, s + 3) * 0.6;
            let aBurn = Math.exp(-Math.max(0, d) / 1.4) * 0.8;
            /* Folds: a thin darker crease with a soft shadow on one side. */
            for (const f of folds) {
                const t = u - f + noise(v / 3, f, s + 4) * 0.15;
                aBurn += 0.16 * Math.exp(-((t / 0.05) ** 2)) + 0.05 * Math.exp(-(((t - 0.3) / 0.3) ** 2));
            }
            if (foldY >= 0) {
                const t = v - foldY + noise(u / 3, foldY, s + 5) * 0.15;
                aBurn += 0.16 * Math.exp(-((t / 0.05) ** 2)) + 0.05 * Math.exp(-(((t - 0.3) / 0.3) ** 2));
            }
            const a1 = Math.max(0, Math.min(0.55, aStain)), a2 = Math.max(0, Math.min(0.85, aBurn));
            const i = (y * W + x) * 4;
            for (let c = 0; c < 3; c++) {
                const m = (1 - a1 + a1 * stain[c]) * (1 - a2 + a2 * burn[c]);
                img.data[i + c] = Math.round(m * 255);
            }
            img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    sheets.set(key, canvas);
    /* A handful of maps at most are ever drawn in one session. */
    if (sheets.size > 6) sheets.delete(sheets.keys().next().value!);
    return canvas;
}

/** The grain: near-white with fibres and specks, so multiplying it only
    roughens the surface. */
function grain(): HTMLCanvasElement {
    if (grainTile) return grainTile;
    const S = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    let seed = 12345;
    const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < S * S; i++) {
        const v = 255 - Math.round(r() ** 3 * 34);
        img.data[i * 4] = v; img.data[i * 4 + 1] = v - 2; img.data[i * 4 + 2] = v - 6; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.lineCap = 'round';
    for (let i = 0; i < 160; i++) {
        const x = r() * S, y = r() * S, a = r() * Math.PI, len = 4 + r() * 14;
        ctx.strokeStyle = `rgba(120, 90, 50, ${0.05 + r() * 0.08})`;
        ctx.lineWidth = 0.6 + r() * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * len / 2 + (r() - 0.5) * 4,
            y + Math.sin(a) * len / 2 + (r() - 0.5) * 4, x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
    }
    grainTile = canvas;
    return canvas;
}

/** Lays the paper over the map, under the transform already set (world px). */
export function drawPaper(ctx: CanvasRenderingContext2D, doc: MapDoc, style: MapStyle): void {
    const paper = style.paper;
    if (!paper) return;
    const W = doc.cols * CELL, H = doc.rows * CELL;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sheetOf(doc, paper, style.id), 0, 0, W, H);
    const pattern = ctx.createPattern(grain(), 'repeat');
    if (pattern) {
        /* One tile across two cells. */
        pattern.setTransform(new DOMMatrix().scale((CELL * 2) / 256));
        ctx.globalAlpha = paper.grain;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
}
