import type { MapStyle } from './styles';
import type { LabelAlign, LabelCase, LabelWarp, MapLabel } from './types';

/* How a label is typeset: its role's look from the style, with whatever the
   label overrides laid on top, and — for warped or vertical text — where
   every letter goes.

   Both renderers read this: the page draws the result as SVG, the PNG export
   draws it on a canvas, so one layout keeps the two identical. Plain text
   (horizontal, no warp) is left to the browser as whole lines, which keeps its
   kerning; anything bent is set letter by letter, measured on a canvas. */

export interface LabelFont { id: string; name: string; css: string }

/** The fonts a label can pick. The id is what a saved map stores. */
export const LABEL_FONTS: LabelFont[] = [
    { id: 'fell', name: 'IM Fell English', css: "'IM Fell English', 'Palatino Linotype', Georgia, serif" },
    { id: 'fell-sc', name: 'IM Fell English SC', css: "'IM Fell English SC', 'Palatino Linotype', Georgia, serif" },
    { id: 'cinzel', name: 'Cinzel', css: "'Cinzel', Georgia, serif" },
    { id: 'uncial', name: 'Uncial Antiqua', css: "'Uncial Antiqua', Georgia, serif" },
    { id: 'medieval', name: 'MedievalSharp', css: "'MedievalSharp', Georgia, serif" },
    { id: 'pirata', name: 'Pirata One', css: "'Pirata One', Georgia, serif" },
    { id: 'playfair', name: 'Playfair Display', css: "'Playfair Display', Georgia, serif" },
    { id: 'georgia', name: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
    { id: 'baloo', name: 'Baloo 2', css: "'Baloo 2', 'Outfit', system-ui, sans-serif" },
    { id: 'outfit', name: 'Outfit', css: "'Outfit', system-ui, sans-serif" },
    { id: 'oswald', name: 'Oswald', css: "'Oswald', 'Arial Narrow', sans-serif" },
    { id: 'arial', name: 'Arial', css: 'Arial, Helvetica, sans-serif' },
    { id: 'impact', name: 'Impact', css: "Impact, 'Arial Black', sans-serif" },
    { id: 'bangers', name: 'Bangers', css: "'Bangers', Impact, sans-serif" },
    { id: 'lobster', name: 'Lobster', css: "'Lobster', cursive" },
    { id: 'marker', name: 'Permanent Marker', css: "'Permanent Marker', cursive" },
    { id: 'caveat', name: 'Caveat', css: "'Caveat', cursive" },
    { id: 'pixel', name: 'Pixelify Sans', css: "'Pixelify Sans', 'Fira Code', ui-monospace, monospace" },
    { id: 'press', name: 'Press Start 2P', css: "'Press Start 2P', ui-monospace, monospace" },
    { id: 'fira', name: 'Fira Code', css: "'Fira Code', ui-monospace, monospace" },
    { id: 'courier', name: 'Courier New', css: "'Courier New', Courier, monospace" },
];

const FONT_BY_ID = new Map(LABEL_FONTS.map((f) => [f.id, f]));

export const LABEL_WARPS: { warp: LabelWarp; name: string }[] = [
    { warp: 'none', name: 'None' },
    { warp: 'arc', name: 'Arc' },
    { warp: 'arch', name: 'Arch' },
    { warp: 'circle', name: 'Circle' },
    { warp: 'wave', name: 'Wave' },
    { warp: 'flag', name: 'Flag' },
    { warp: 'rise', name: 'Rise' },
    { warp: 'bulge', name: 'Bulge / squeeze' },
];

export const LABEL_WEIGHTS = [
    { weight: 300, name: 'Light' }, { weight: 400, name: 'Regular' }, { weight: 500, name: 'Medium' },
    { weight: 600, name: 'Semibold' }, { weight: 700, name: 'Bold' }, { weight: 800, name: 'Extra bold' },
    { weight: 900, name: 'Black' },
];

/** Everything about a label's type, resolved to numbers. Lengths in world px. */
export interface LabelType {
    family: string;
    size: number;
    weight: number;
    italic: boolean;
    color: string;
    halo: string;
    /** The halo's stroke width. 0 draws none. */
    haloWidth: number;
    opacity: number;
    /** Extra space after each letter. */
    spacing: number;
    /** Baseline to baseline, in multiples of the size. */
    lineHeight: number;
    align: LabelAlign;
    vertical: boolean;
    warp: LabelWarp;
    /** -1..1 */
    bend: number;
    /** Degrees the letters lean right. */
    slant: number;
    /** Horizontal scale. */
    stretch: number;
    shadow: boolean;
    lines: string[];
}

function applyCase(text: string, c: LabelCase | undefined, upper: boolean | undefined): string {
    const mode = c ?? (upper ? 'upper' : 'none');
    if (mode === 'upper') return text.toUpperCase();
    if (mode === 'lower') return text.toLowerCase();
    if (mode === 'title') return text.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    return text;
}

export function labelType(l: MapLabel, style: MapStyle, cell: number): LabelType {
    const look = style.label[l.role] ?? style.label.town;
    const size = look.size * cell * (l.scale || 1);
    const family = (l.font && FONT_BY_ID.get(l.font)?.css) || look.font;
    return {
        family,
        size,
        weight: l.weight ?? look.weight,
        italic: l.italic ?? !!look.italic,
        color: l.color ?? look.color,
        halo: l.halo ?? look.halo,
        haloWidth: size * (l.haloWidth ?? 0.2),
        opacity: l.opacity ?? 1,
        spacing: (l.spacing ?? look.spacing ?? 0) * size,
        lineHeight: l.lineHeight ?? 1.15,
        align: l.align ?? 'center',
        vertical: l.direction === 'vertical',
        warp: l.direction === 'vertical' ? 'none' : (l.warp ?? 'none'),
        bend: Math.max(-1, Math.min(1, (l.bend ?? 50) / 100)),
        slant: l.slant ?? 0,
        stretch: l.stretch ?? 1,
        shadow: !!l.shadow,
        lines: applyCase(l.text, l.caps, look.upper).split('\n'),
    };
}

/** The CSS / canvas font shorthand. */
export function fontOf(t: LabelType): string {
    return `${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px ${t.family}`;
}

/** Whether the browser can set it as whole lines. */
export function isPlain(t: LabelType): boolean {
    return !t.vertical && (t.warp === 'none' || (t.warp !== 'circle' && Math.abs(t.bend) < 0.005));
}

/** The label's own transform, around its anchor: turn, then lean, then
    stretch — the order Photoshop applies them in. As an SVG transform list. */
export function labelTransform(l: MapLabel, t: LabelType, cell: number): string {
    const parts = [`translate(${l.x * cell} ${l.y * cell})`];
    if (l.rotation) parts.push(`rotate(${l.rotation})`);
    if (t.slant) parts.push(`skewX(${-t.slant})`);
    if (t.stretch !== 1) parts.push(`scale(${t.stretch} 1)`);
    return parts.join(' ');
}

/** The same transform on a canvas. */
export function applyLabelTransform(ctx: CanvasRenderingContext2D, l: MapLabel, t: LabelType, cell: number): void {
    ctx.translate(l.x * cell, l.y * cell);
    if (l.rotation) ctx.rotate(l.rotation * Math.PI / 180);
    if (t.slant) ctx.transform(1, 0, Math.tan(-t.slant * Math.PI / 180), 1, 0, 0);
    if (t.stretch !== 1) ctx.scale(t.stretch, 1);
}

/** The baseline of each line of plain text, relative to the anchor. */
export function lineBaselines(t: LabelType): number[] {
    const n = t.lines.length;
    return t.lines.map((_, i) => (-(n - 1) / 2 * t.lineHeight + 0.35 + i * t.lineHeight) * t.size);
}

export const ANCHOR: Record<LabelAlign, 'start' | 'middle' | 'end'> = { left: 'start', center: 'middle', right: 'end' };

/* ------------------------------------------------------------ measuring */

let measurer: CanvasRenderingContext2D | null = null;

/** Width of a string in this label's font, letter spacing not included. */
export function measureWith(font: string): (s: string) => number {
    if (!measurer) measurer = document.createElement('canvas').getContext('2d');
    const c = measurer!;
    return (s: string) => {
        c.font = font;
        return c.measureText(s).width;
    };
}

/** Letters, keeping an accented letter or an emoji whole. */
export function graphemes(s: string): string[] {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
    if (Seg) return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
    return Array.from(s);
}

/* ------------------------------------------------------------ letter layout */

export interface Glyph {
    ch: string;
    /** The letter's baseline centre, relative to the anchor. */
    x: number;
    y: number;
    /** Degrees. */
    rot: number;
    sx: number;
    sy: number;
}

export interface LaidOut {
    glyphs: Glyph[];
    /** The box it covers, for picking it up and showing it selected. */
    box: { x: number; y: number; w: number; h: number };
}

/** Where every letter of a bent or vertical label goes. */
export function layoutGlyphs(t: LabelType, measure: (s: string) => number): LaidOut {
    const S = t.size;
    const glyphs: Glyph[] = [];

    if (t.vertical) {
        /* Letters stacked top to bottom, one column a line, the first line
           on the left. Align picks top, middle or bottom. */
        const step = S * 1.05 + t.spacing;
        const cols = t.lines.map((ln) => graphemes(ln));
        const tallest = Math.max(1, ...cols.map((c) => c.length)) * step;
        const colGap = S * t.lineHeight;
        cols.forEach((letters, ci) => {
            const cx = (ci - (cols.length - 1) / 2) * colGap;
            const h = letters.length * step;
            const top = t.align === 'left' ? -tallest / 2 : t.align === 'right' ? tallest / 2 - h : -h / 2;
            letters.forEach((ch, i) => glyphs.push({ ch, x: cx, y: top + (i + 0.5) * step + 0.35 * S, rot: 0, sx: 1, sy: 1 }));
        });
        return { glyphs, box: boxOf(glyphs, S) };
    }

    const baselines = lineBaselines(t);
    const rows = t.lines.map((ln) => {
        const letters = graphemes(ln);
        const widths = letters.map((ch) => measure(ch) + t.spacing);
        const w = widths.reduce((a, b) => a + b, 0) - (letters.length ? t.spacing : 0);
        return { letters, widths, w };
    });
    const maxW = Math.max(1, ...rows.map((r) => r.w));
    const half = maxW / 2;
    const b = t.bend;

    rows.forEach((row, li) => {
        const y0 = baselines[li];
        /* Line start within a block centred on 0. */
        let x = t.align === 'left' ? -half : t.align === 'right' ? half - row.w : -row.w / 2;
        row.letters.forEach((ch, i) => {
            const xc = x + (row.widths[i] - t.spacing) / 2;
            x += row.widths[i];
            const u = xc / half;
            let gx = xc, gy = y0, rot = 0, sx = 1, sy = 1;
            switch (t.warp) {
                case 'arc':
                case 'circle': {
                    /* Round a circle. Arc bends the longest line through up
                       to half a turn; Circle goes all the way round, the bend's
                       sign choosing outside or inside of the ring. */
                    const span = t.warp === 'circle' ? Math.PI * 2 * 0.97 : Math.abs(b) * Math.PI;
                    const up = t.warp === 'circle' ? b >= 0 : b > 0;
                    const R = maxW / span;
                    const phi = xc / R;
                    if (up) {
                        const r = R - y0;
                        gx = r * Math.sin(phi); gy = R - r * Math.cos(phi); rot = phi * 180 / Math.PI;
                    } else {
                        const r = R + y0;
                        gx = r * Math.sin(phi); gy = -R + r * Math.cos(phi); rot = -phi * 180 / Math.PI;
                    }
                    break;
                }
                case 'arch':
                    gy = y0 - b * (1 - u * u) * half * 0.5;
                    break;
                case 'wave': {
                    /* One whole wave across the longest line, never so steep
                       that neighbouring letters turn into each other. */
                    const A = b * Math.min(S * 0.5, half * 0.22), k = Math.PI;
                    gy = y0 + A * Math.sin(u * k);
                    rot = Math.atan(A * Math.cos(u * k) * k / half) * 180 / Math.PI;
                    break;
                }
                case 'flag':
                    gy = y0 + b * S * 0.5 * Math.sin(u * Math.PI);
                    sy = 1 + b * 0.25 * Math.cos(u * Math.PI);
                    break;
                case 'rise':
                    gy = y0 - b * u * half * 0.35;
                    break;
                case 'bulge': {
                    const f = Math.max(0.2, 1 + b * 0.7 * (1 - u * u));
                    sy = f; sx = 1 + (f - 1) * 0.5;
                    /* Grown about the letter's middle, not its baseline. */
                    gy = y0 + (f - 1) * 0.35 * S;
                    break;
                }
                default: break;
            }
            glyphs.push({ ch, x: gx, y: gy, rot, sx, sy });
        });
        /* A bulge widens the letters as well, so the line is spaced out
           again on their new widths, about the same centre. */
        if (t.warp === 'bulge' && row.letters.length) {
            const line = glyphs.slice(glyphs.length - row.letters.length);
            const widths = row.widths.map((w, i) => (w - t.spacing) * line[i].sx + t.spacing);
            const total = widths.reduce((a, c) => a + c, 0) - t.spacing;
            const mid = (line[0].x + line[line.length - 1].x) / 2;
            let xx = mid - total / 2;
            line.forEach((g, i) => { g.x = xx + (widths[i] - t.spacing) / 2; xx += widths[i]; });
        }
    });
    return { glyphs, box: boxOf(glyphs, S) };
}

function boxOf(glyphs: Glyph[], S: number): LaidOut['box'] {
    if (!glyphs.length) return { x: -S / 2, y: -S / 2, w: S, h: S };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of glyphs) {
        const cy = g.y - 0.35 * S * g.sy;
        const r = S * 0.55 * Math.max(g.sx, g.sy);
        x0 = Math.min(x0, g.x - r); x1 = Math.max(x1, g.x + r);
        y0 = Math.min(y0, cy - r); y1 = Math.max(y1, cy + r);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function plainWidth(t: LabelType, measure: (s: string) => number): number {
    const widths = t.lines.map((ln) => measure(ln) + Math.max(0, graphemes(ln).length - 1) * t.spacing);
    return Math.max(t.size * 0.5, ...widths);
}

/** Where plain lines are anchored: the block is centred on the label's
    point, and its lines are aligned inside it — the same as bent text. */
export function plainLineX(t: LabelType, measure: (s: string) => number): number {
    if (t.align === 'center') return 0;
    const w = plainWidth(t, measure);
    return t.align === 'left' ? -w / 2 : w / 2;
}

/** The box plain text covers, for the same purposes. */
export function plainBox(t: LabelType, measure: (s: string) => number): LaidOut['box'] {
    const w = plainWidth(t, measure);
    const base = lineBaselines(t);
    const y = base[0] - t.size * 0.9;
    const h = base[base.length - 1] + t.size * 0.3 - y;
    const pad = t.size * 0.12;
    return { x: -w / 2 - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
}

/** The drop shadow's offset and blur, in world px. */
export function shadowOf(t: LabelType): { dx: number; dy: number; blur: number; color: string } {
    return { dx: t.size * 0.06, dy: t.size * 0.08, blur: t.size * 0.1, color: '#000000a0' };
}
