import { FALLBACK_TERRAIN, TERRAINS, TERRAIN_BY_CODE, TERRAIN_BY_SLUG } from './terrain';
import { STYLE_BY_ID } from './styles';
import { codeIndex, decode, encode, filled, fromCells, isEncoded, pickRes, rasterOf, remember, resizeRaster } from './raster';
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
    const res = pickRes(cols, rows);
    const code = (TERRAIN_BY_SLUG.get(opts.fill ?? 'sea') ?? FALLBACK_TERRAIN).code;
    return {
        id: uid(),
        name: opts.name?.trim() || 'New map',
        styleId: opts.styleId ?? 'handdrawn',
        cols,
        rows,
        res,
        scaleLabel: opts.scaleLabel ?? '',
        grid: { show: true, snap: true, opacity: 0.5 },
        terrain: filled(cols * res, rows * res, code),
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
const optBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

/** How far each style bent a map's edges when terrain was one value a cell
    — what an old map is converted with, so it keeps its look. */
const LEGACY_WOBBLE: Partial<Record<StyleId, number>> = { handdrawn: 0.38, anime: 0.24 };

/** Whatever came off disk or out of localStorage, made safe to render. A map
    from before the terrain had samples is converted here — see raster.ts. */
export function normalizeDoc(raw: unknown): MapDoc | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const cols = clampCells(num(r.cols, 40));
    const rows = clampCells(num(r.rows, 30));
    const grid = (r.grid && typeof r.grid === 'object' ? r.grid : {}) as Record<string, unknown>;
    const styleId = STYLE_BY_ID.has(r.styleId as StyleId) ? r.styleId as StyleId : 'handdrawn';

    let terrain = str(r.terrain, '');
    let res = num(r.res, 0);
    if (!res || !isEncoded(terrain)) {
        /* One character a cell: bake it into samples. */
        res = pickRes(cols, rows);
        const data = fromCells(terrain, cols, rows, res, LEGACY_WOBBLE[styleId] ?? 0);
        terrain = encode(data);
        remember(terrain, data);
    } else {
        res = Math.max(1, Math.min(16, Math.round(res)));
        /* Round-trip only if the runs do not add up to the raster exactly. */
        const want = cols * res * rows * res;
        const total = (terrain.match(/\d+/g) ?? []).reduce((s, n) => s + Number(n), 0);
        if (total !== want) terrain = encode(decode(terrain, want));
    }

    return {
        id: str(r.id, '') || uid(),
        name: str(r.name, 'Untitled map'),
        styleId,
        cols,
        rows,
        res,
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
                size: num(s.size, 2), rotation: num(s.rotation, 0), flip: !!s.flip, snap: optBool(s.snap),
            })),
        tokens: arr<MapToken>(r.tokens).filter((t) => t && typeof t.kind === 'string')
            .map((t) => ({
                ...t, id: t.id || uid(), name: str(t.name, ''), x: num(t.x, 0), y: num(t.y, 0),
                size: num(t.size, 1), color: str(t.color, '#e0645c'), snap: optBool(t.snap),
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

/** The terrain code at a point, in cells. '' off the map. */
export function terrainAt(doc: MapDoc, x: number, y: number): string {
    const r = rasterOf(doc);
    const sx = Math.floor(x * r.res), sy = Math.floor(y * r.res);
    if (sx < 0 || sy < 0 || sx >= r.w || sy >= r.h) return '';
    return TERRAINS[r.data[sy * r.w + sx]]?.code ?? '';
}

/** A new size, anchored top-left: what was painted stays where it was, new
    cells take `fill`, and objects left outside are pulled back to the edge. */
export function resizeDoc(doc: MapDoc, cols: number, rows: number, fillCode: string): MapDoc {
    cols = clampCells(cols);
    rows = clampCells(rows);
    if (cols === doc.cols && rows === doc.rows) return doc;
    const code = TERRAIN_BY_CODE.has(fillCode) ? fillCode : FALLBACK_TERRAIN.code;
    const next = resizeRaster(rasterOf(doc), cols, rows, codeIndex(code));
    const terrain = encode(next.data);
    remember(terrain, next.data);
    const cx = (v: number) => Math.max(0, Math.min(cols, v));
    const cy = (v: number) => Math.max(0, Math.min(rows, v));
    return {
        ...doc,
        cols,
        rows,
        res: next.res,
        terrain,
        stamps: doc.stamps.map((s) => ({ ...s, x: cx(s.x), y: cy(s.y) })),
        tokens: doc.tokens.map((t) => ({ ...t, x: cx(t.x), y: cy(t.y) })),
        labels: doc.labels.map((l) => ({ ...l, x: cx(l.x), y: cy(l.y) })),
        paths: doc.paths.map((p) => ({ ...p, points: p.points.map(([x, y]) => [cx(x), cy(y)] as [number, number]) })),
    };
}

/** Whether an object snaps: its own setting if it has one, the map's if not. */
export function snapsFor(doc: MapDoc, obj: { snap?: boolean }): boolean {
    return obj.snap ?? doc.grid.snap;
}

/** Snap a point to the centre of its cell (an object sized in whole cells) or
    to the nearest cell corner (an object with an even size, whose centre sits
    on a line). */
export function snapPoint(x: number, y: number, size: number): [number, number] {
    const even = Math.round(size) % 2 === 0 && Math.abs(size - Math.round(size)) < 0.01;
    if (even) return [Math.round(x), Math.round(y)];
    return [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
}
