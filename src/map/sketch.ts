import { simplify, smoothPathD } from './geometry';
import type { Pt } from './geometry';
import type { MapSketch, SketchBrush } from './types';

/* Freehand sketches: lines the GM draws over the map with a pen, not terrain.

   A sketch is a list of points in cells, like a path, and one look: a brush,
   a colour, a width and an opacity. The page draws it as SVG and the export
   (and so the picture the rolling table gets) on a canvas, both from the
   helpers here, so the two cannot drift apart.

   Each sketch is ONE stroke call — line and arrowhead together where the
   brush is solid — so a translucent marker does not darken where its own
   line crosses itself or meets its arrowhead. */

export const MIN_SKETCH_WIDTH = 0.02;
export const MAX_SKETCH_WIDTH = 4;

export interface SketchBrushDef {
    id: SketchBrush;
    name: string;
    /** The width a new line starts at, in cells. */
    width: number;
}

export const SKETCH_BRUSHES: SketchBrushDef[] = [
    { id: 'pen', name: 'Pen', width: 0.12 },
    { id: 'marker', name: 'Marker', width: 0.6 },
    { id: 'dashed', name: 'Dashed', width: 0.12 },
    { id: 'dotted', name: 'Dotted', width: 0.18 },
];

export const SKETCH_COLORS = ['#e0302c', '#f08c1a', '#f6d32d', '#2fa84f', '#1e88e5', '#7c4dff', '#ec4899', '#ffffff', '#6b4a2b', '#111111'];

export interface SketchSettings {
    brush: SketchBrush;
    color: string;
    width: number;
    opacity: number;
    arrow: boolean;
}

export const DEFAULT_SKETCH: SketchSettings = { brush: 'pen', color: '#e0302c', width: 0.12, opacity: 1, arrow: false };

export const cleanSketchWidth = (w: number): number =>
    Math.round(Math.max(MIN_SKETCH_WIDTH, Math.min(MAX_SKETCH_WIDTH, w)) * 1000) / 1000;

const isBrush = (v: unknown): v is SketchBrush => SKETCH_BRUSHES.some((b) => b.id === v);
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;

/** One sketch off disk, made safe to draw — or null. */
export function normalizeSketch(raw: unknown): MapSketch | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.points)) return null;
    const points = (r.points as unknown[])
        .filter((p): p is [number, number] => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
        .map(([x, y]) => [Number(x), Number(y)] as [number, number]);
    if (!points.length) return null;
    const width = typeof r.width === 'number' && isFinite(r.width) ? cleanSketchWidth(r.width) : DEFAULT_SKETCH.width;
    const opacity = typeof r.opacity === 'number' && isFinite(r.opacity) ? Math.max(0.05, Math.min(1, r.opacity)) : 1;
    return {
        id: typeof r.id === 'string' && r.id ? r.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        brush: isBrush(r.brush) ? r.brush : 'pen',
        points,
        color: typeof r.color === 'string' && COLOR_RE.test(r.color) ? r.color : DEFAULT_SKETCH.color,
        width,
        opacity,
        ...(r.arrow === true ? { arrow: true } : {}),
    };
}

/** The pointer's track as a sketch keeps it: thinned to what shows at the
    zoom it was drawn at, kept on the map, three decimals a coordinate. */
export function finishTrack(track: Pt[], zoomPxPerCell: number, cols: number, rows: number): [number, number][] {
    const tol = 0.6 / zoomPxPerCell;
    const pts = track.length > 2 ? simplify(track, tol) : track;
    return pts.map(([x, y]) => [
        Math.round(Math.max(0, Math.min(cols, x)) * 1000) / 1000,
        Math.round(Math.max(0, Math.min(rows, y)) * 1000) / 1000,
    ]);
}

/** How the line is stroked, in world px for a cell of `cell` px. */
export interface SketchLook {
    width: number;
    opacity: number;
    dash: number[] | null;
    cap: 'round' | 'butt';
}

export function sketchLook(s: Pick<MapSketch, 'brush' | 'width' | 'opacity'>, cell: number): SketchLook {
    const w = Math.max(0.5, s.width * cell);
    switch (s.brush) {
        case 'marker': return { width: w, opacity: s.opacity * 0.5, dash: null, cap: 'round' };
        case 'dashed': return { width: w, opacity: s.opacity, dash: [w * 3, w * 2.4], cap: 'round' };
        /* A zero-length dash with a round cap is a dot. */
        case 'dotted': return { width: w, opacity: s.opacity, dash: [0.001, w * 2.2], cap: 'round' };
        default: return { width: w, opacity: s.opacity, dash: null, cap: 'round' };
    }
}

/** The line, in world px. A single point is a dot. */
export function sketchLineD(points: Pt[], cell: number): string {
    if (points.length === 1) {
        const [x, y] = points[0];
        return `M${(x * cell).toFixed(1)} ${(y * cell).toFixed(1)}l0.01 0`;
    }
    return smoothPathD(points, cell);
}

/** An open arrowhead at the end of the line: two strokes back from the tip,
    pointing along the last stretch of the line. '' when the line is too
    short to have a direction. */
export function sketchArrowD(points: Pt[], width: number, cell: number): string {
    if (points.length < 2) return '';
    const tip = points[points.length - 1];
    const len = Math.max(0.3, width * 3.5);
    /* The direction over the last arm's length or so, not the last two
       points, which a shaky hand can leave pointing anywhere. */
    let back = points[points.length - 2];
    for (let i = points.length - 2, run = 0; i >= 0; i--) {
        run += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
        back = points[i];
        if (run >= len) break;
    }
    const dx = tip[0] - back[0], dy = tip[1] - back[1];
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return '';
    const ux = dx / d, uy = dy / d;
    const a = Math.PI / 7;
    const arm = (sign: number): Pt => {
        const c = Math.cos(a), s = Math.sin(a) * sign;
        return [tip[0] - len * (ux * c - uy * s), tip[1] - len * (uy * c + ux * s)];
    };
    const f = (v: number) => (v * cell).toFixed(1);
    const [l, r] = [arm(1), arm(-1)];
    return `M${f(l[0])} ${f(l[1])}L${f(tip[0])} ${f(tip[1])}L${f(r[0])} ${f(r[1])}`;
}

/** Whether the arrowhead goes in the line's own stroke (one paint, so no
    overlap shows) or in a solid stroke of its own (a dashed or dotted line
    would break the head up). */
export const arrowInLine = (brush: SketchBrush): boolean => brush === 'pen' || brush === 'marker';

/** Draws one sketch on a canvas whose units are world px for `cell`. */
export function drawSketch(ctx: CanvasRenderingContext2D, s: MapSketch, cell: number): void {
    const look = sketchLook(s, cell);
    const pts = s.points as Pt[];
    const line = sketchLineD(pts, cell);
    const head = s.arrow ? sketchArrowD(pts, s.width, cell) : '';
    ctx.save();
    ctx.globalAlpha = look.opacity;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = look.width;
    ctx.lineCap = look.cap;
    ctx.lineJoin = 'round';
    if (head && arrowInLine(s.brush)) {
        ctx.stroke(new Path2D(line + head));
    } else {
        ctx.setLineDash(look.dash ?? []);
        ctx.stroke(new Path2D(line));
        if (head) {
            ctx.setLineDash([]);
            ctx.stroke(new Path2D(head));
        }
    }
    ctx.restore();
}
