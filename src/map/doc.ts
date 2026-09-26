import { FALLBACK_TERRAIN, TERRAIN_BY_CODE, TERRAIN_BY_SLUG } from './terrain';
import { STYLE_BY_ID } from './styles';
import type { LabelRole, MapDoc, MapLabel, MapPath, MapStamp, MapToken, StyleId } from './types';

/* Pure operations on a MapDoc. Nothing here touches the DOM or storage, so the
   harness in .verify/ can drive all of it from Node. */

export const MIN_CELLS = 4;
export const MAX_CELLS = 200;

export function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampCells(n: number): number {
    return Math.max(MIN_CELLS, Math.min(MAX_CELLS, Math.round(Number(n) || MIN_CELLS)));
}

export function createDoc(opts: {
    name?: string; cols?: number; rows?: number; styleId?: StyleId; fill?: string; scaleLabel?: string;
} = {}): MapDoc {
    const cols = clampCells(opts.cols ?? 40);
    const rows = clampCells(opts.rows ?? 30);
    const code = (TERRAIN_BY_SLUG.get(opts.fill ?? 'sea') ?? FALLBACK_TERRAIN).code;
    return {
        id: uid(),
        name: opts.name?.trim() || 'New map',
        styleId: opts.styleId ?? 'handdrawn',
        cols,
        rows,
        scaleLabel: opts.scaleLabel ?? '',
        grid: { show: true, snap: true, opacity: 0.5 },
        terrain: code.repeat(cols * rows),
        paths: [],
        stamps: [],
        tokens: [],
        labels: [],
        updatedAt: new Date().toISOString(),
    };
}

const num = (v: unknown, dflt: number): number => (typeof v === 'number' && isFinite(v) ? v : dflt);
const str = (v: unknown, dflt: string): string => (typeof v === 'string' ? v : dflt);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** Whatever came off disk or out of localStorage, made safe to render. */
export function normalizeDoc(raw: unknown): MapDoc | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const cols = clampCells(num(r.cols, 40));
    const rows = clampCells(num(r.rows, 30));
    let terrain = str(r.terrain, '');
    const want = cols * rows;
    if (terrain.length < want) terrain += FALLBACK_TERRAIN.code.repeat(want - terrain.length);
    else if (terrain.length > want) terrain = terrain.slice(0, want);
    const grid = (r.grid && typeof r.grid === 'object' ? r.grid : {}) as Record<string, unknown>;
    const styleId = STYLE_BY_ID.has(r.styleId as StyleId) ? r.styleId as StyleId : 'handdrawn';

    return {
        id: str(r.id, '') || uid(),
        name: str(r.name, 'Untitled map'),
        styleId,
        cols,
        rows,
        scaleLabel: str(r.scaleLabel, ''),
        grid: {
            show: grid.show !== false,
            snap: grid.snap !== false,
            opacity: Math.max(0, Math.min(1, num(grid.opacity, 0.5))),
        },
        terrain,
        paths: arr<MapPath>(r.paths).filter((p) => p && Array.isArray(p.points) && p.points.length >= 2)
            .map((p) => ({ ...p, id: p.id || uid(), width: num(p.width, 0.6) })),
        stamps: arr<MapStamp>(r.stamps).filter((s) => s && typeof s.landmark === 'string')
            .map((s) => ({
                ...s, id: s.id || uid(), x: num(s.x, 0), y: num(s.y, 0),
                size: num(s.size, 2), rotation: num(s.rotation, 0), flip: !!s.flip,
            })),
        tokens: arr<MapToken>(r.tokens).filter((t) => t && typeof t.kind === 'string')
            .map((t) => ({
                ...t, id: t.id || uid(), name: str(t.name, ''), x: num(t.x, 0), y: num(t.y, 0),
                size: num(t.size, 1), color: str(t.color, '#e0645c'),
            })),
        labels: arr<MapLabel>(r.labels).filter((l) => l && typeof l.text === 'string')
            .map((l) => ({
                ...l, id: l.id || uid(), x: num(l.x, 0), y: num(l.y, 0),
                role: (['region', 'town', 'route', 'small'].includes(l.role) ? l.role : 'town') as LabelRole,
                scale: num(l.scale, 1), rotation: num(l.rotation, 0),
            })),
        updatedAt: str(r.updatedAt, new Date().toISOString()),
    };
}

export function cellAt(doc: Pick<MapDoc, 'cols' | 'rows' | 'terrain'>, cx: number, cy: number): string {
    if (cx < 0 || cy < 0 || cx >= doc.cols || cy >= doc.rows) return '';
    return doc.terrain[cy * doc.cols + cx];
}

/** Every cell a round or square brush of `size` cells covers, centred on (x, y)
    in cell units. Size 1 is exactly the cell under the pointer. */
export function brushCells(x: number, y: number, size: number, square: boolean, cols: number, rows: number): number[] {
    const out: number[] = [];
    const r = size / 2;
    const x0 = Math.floor(x - r + 0.5), x1 = Math.floor(x + r - 0.5);
    const y0 = Math.floor(y - r + 0.5), y1 = Math.floor(y + r - 0.5);
    for (let cy = Math.max(0, y0); cy <= Math.min(rows - 1, y1); cy++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(cols - 1, x1); cx++) {
            if (!square && size > 2) {
                const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
                if (dx * dx + dy * dy > r * r) continue;
            }
            out.push(cy * cols + cx);
        }
    }
    /* A brush dabbed exactly between cells can come out empty: always take
       the cell under the pointer itself. */
    if (!out.length) {
        const cx = Math.floor(x), cy = Math.floor(y);
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) out.push(cy * cols + cx);
    }
    return out;
}

export function paintCells(terrain: string, cells: number[], code: string): string {
    if (!cells.length || !TERRAIN_BY_CODE.has(code)) return terrain;
    const chars = terrain.split('');
    let changed = false;
    for (const i of cells) {
        if (chars[i] !== code) { chars[i] = code; changed = true; }
    }
    return changed ? chars.join('') : terrain;
}

/** Four-way flood fill from one cell. */
export function floodFill(doc: Pick<MapDoc, 'cols' | 'rows' | 'terrain'>, cx: number, cy: number, code: string): string {
    const from = cellAt(doc, cx, cy);
    if (!from || from === code || !TERRAIN_BY_CODE.has(code)) return doc.terrain;
    const { cols, rows } = doc;
    const chars = doc.terrain.split('');
    const stack = [cy * cols + cx];
    while (stack.length) {
        const i = stack.pop()!;
        if (chars[i] !== from) continue;
        chars[i] = code;
        const x = i % cols, y = (i - x) / cols;
        if (x > 0) stack.push(i - 1);
        if (x < cols - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - cols);
        if (y < rows - 1) stack.push(i + cols);
    }
    return chars.join('');
}

/** A new size, anchored top-left: what was painted stays where it was, new
    cells take `fill`, and objects left outside are pulled back to the edge. */
export function resizeDoc(doc: MapDoc, cols: number, rows: number, fillCode: string): MapDoc {
    cols = clampCells(cols);
    rows = clampCells(rows);
    if (cols === doc.cols && rows === doc.rows) return doc;
    const code = TERRAIN_BY_CODE.has(fillCode) ? fillCode : FALLBACK_TERRAIN.code;
    let terrain = '';
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            terrain += (x < doc.cols && y < doc.rows) ? doc.terrain[y * doc.cols + x] : code;
        }
    }
    const cx = (v: number) => Math.max(0, Math.min(cols, v));
    const cy = (v: number) => Math.max(0, Math.min(rows, v));
    return {
        ...doc,
        cols,
        rows,
        terrain,
        stamps: doc.stamps.map((s) => ({ ...s, x: cx(s.x), y: cy(s.y) })),
        tokens: doc.tokens.map((t) => ({ ...t, x: cx(t.x), y: cy(t.y) })),
        labels: doc.labels.map((l) => ({ ...l, x: cx(l.x), y: cy(l.y) })),
        paths: doc.paths.map((p) => ({ ...p, points: p.points.map(([x, y]) => [cx(x), cy(y)] as [number, number]) })),
    };
}

/** Snap a point to the centre of its cell (an object sized in whole cells) or
    to the nearest cell corner (an object with an even size, whose centre sits
    on a line). */
export function snapPoint(x: number, y: number, size: number): [number, number] {
    const even = Math.round(size) % 2 === 0 && Math.abs(size - Math.round(size)) < 0.01;
    if (even) return [Math.round(x), Math.round(y)];
    return [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
}
