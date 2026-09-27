import { TERRAINS, TERRAIN_BY_CODE, TERRAIN_BY_SLUG } from './terrain';
import { STYLE_BY_ID } from './styles';
import {
    EMPTY, blank, decode, encode, fromCells, isEncoded, pickRes, rasterOf, remember, resizeRaster, runTotal,
} from './raster';
import type { Raster } from './raster';
import { DEFAULT_BORDERS, MAX_SOFT, MIN_SOFT, decodeEdges, edgesOf, encodeEdges, isEdgeKind, rememberEdges } from './edges';
import type { EdgeKind, LabelRole, MapBorders, MapDoc, MapLabel, MapPath, MapStamp, MapToken, StyleId } from './types';

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

/** A new map: nothing painted yet, so all of it is the background. */
export function createDoc(opts: {
    name?: string; cols?: number; rows?: number; styleId?: StyleId; background?: string; scaleLabel?: string;
} = {}): MapDoc {
    const cols = clampCells(opts.cols ?? 40);
    const rows = clampCells(opts.rows ?? 30);
    const res = pickRes(cols, rows);
    const background = (TERRAIN_BY_SLUG.get(opts.background ?? 'sea') ?? TERRAIN_BY_SLUG.get('sea')!).code;
    return {
        id: uid(),
        name: opts.name?.trim() || 'New map',
        styleId: opts.styleId ?? 'handdrawn',
        cols,
        rows,
        res,
        scaleLabel: opts.scaleLabel ?? '',
        grid: { show: true, snap: true, opacity: 0.5 },
        terrain: blank(cols * res * rows * res),
        background,
        edges: '',
        borders: { ...DEFAULT_BORDERS, terrain: {} },
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
    let data: Uint8Array | null = null;
    if (!res || !isEncoded(terrain)) {
        /* One character a cell: bake it into samples. */
        res = pickRes(cols, rows);
        data = fromCells(terrain, cols, rows, res, LEGACY_WOBBLE[styleId] ?? 0);
    } else {
        res = Math.max(1, Math.min(16, Math.round(res)));
        /* Round-trip only if the runs do not add up to the raster exactly. */
        if (runTotal(terrain) !== cols * res * rows * res) data = decode(terrain, cols * res * rows * res);
    }

    let background = str(r.background, '');
    if (!TERRAIN_BY_CODE.has(background)) {
        /* From before maps had a background: every sample was painted. The
           ground the map is set in becomes the background — so the sea round
           a region is a layer that can be swapped for clouds, and rubbing
           out a patch uncovers what it looks like it should. */
        data ??= decode(terrain, cols * res * rows * res).slice();
        background = TERRAINS[baseOf(data, cols * res, rows * res)].code;
        const bg = TERRAINS.findIndex((t) => t.code === background);
        for (let i = 0; i < data.length; i++) if (data[i] === bg) data[i] = EMPTY;
    }
    if (data) {
        terrain = encode(data);
        remember(terrain, data);
    }

    let edges = str(r.edges, '');
    if (edges && runTotal(edges) !== cols * res * rows * res) edges = encodeEdges(decodeEdges(edges, cols * res * rows * res));

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
        background,
        edges,
        borders: normalizeBorders(r.borders),
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
                id: l.id || uid(), text: l.text, x: num(l.x, 0), y: num(l.y, 0),
                role: (['region', 'town', 'route', 'small'].includes(l.role) ? l.role : 'town') as LabelRole,
                scale: num(l.scale, 1), rotation: num(l.rotation, 0),
                ...labelTypeFields(l),
            })),
        updatedAt: str(r.updatedAt, new Date().toISOString()),
    };
}

/** A label's optional type settings, each kept only when it is the right
    kind of value — a hand-edited file cannot hand the renderer a string for
    a number. */
function labelTypeFields(l: MapLabel): Partial<MapLabel> {
    const out: Partial<MapLabel> = {};
    const n = (k: 'weight' | 'haloWidth' | 'opacity' | 'spacing' | 'lineHeight' | 'bend' | 'slant' | 'stretch', lo: number, hi: number) => {
        const v = l[k];
        if (typeof v === 'number' && isFinite(v)) out[k] = Math.max(lo, Math.min(hi, v));
    };
    const s = (k: 'font' | 'color' | 'halo') => { if (typeof l[k] === 'string' && l[k]) out[k] = l[k]; };
    const one = <K extends 'caps' | 'align' | 'direction' | 'warp'>(k: K, allowed: string[]) => {
        if (allowed.includes(l[k] as string)) out[k] = l[k];
    };
    s('font'); s('color'); s('halo');
    n('weight', 100, 900); n('haloWidth', 0, 1); n('opacity', 0, 1); n('spacing', -0.5, 2);
    n('lineHeight', 0.5, 4); n('bend', -100, 100); n('slant', -60, 60); n('stretch', 0.2, 4);
    one('caps', ['none', 'upper', 'lower', 'title']);
    one('align', ['left', 'center', 'right']);
    one('direction', ['horizontal', 'vertical']);
    one('warp', ['none', 'arc', 'arch', 'circle', 'wave', 'flag', 'rise', 'bulge']);
    if (typeof l.italic === 'boolean') out.italic = l.italic;
    if (typeof l.shadow === 'boolean') out.shadow = l.shadow;
    return out;
}

/** The terrain most of the map's outer edge is painted in: the sea round a
    region, the grass round a town. */
function baseOf(data: Uint8Array, w: number, h: number): number {
    const count = new Map<number, number>();
    const add = (i: number) => count.set(data[i], (count.get(data[i]) ?? 0) + 1);
    for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
    for (let y = 1; y < h - 1; y++) { add(y * w); add(y * w + w - 1); }
    let best = data[0], most = -1;
    for (const [v, n] of count) if (v !== EMPTY && (n > most || (n === most && v < best))) { best = v; most = n; }
    return best === EMPTY ? TERRAINS.findIndex((t) => t.slug === 'sea') : best;
}

function normalizeBorders(raw: unknown): MapBorders {
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const terrain: Partial<Record<string, EdgeKind>> = {};
    const t = (b.terrain && typeof b.terrain === 'object' ? b.terrain : {}) as Record<string, unknown>;
    for (const [slug, kind] of Object.entries(t)) if (TERRAIN_BY_SLUG.has(slug) && isEdgeKind(kind)) terrain[slug] = kind;
    return {
        kind: isEdgeKind(b.kind) ? b.kind : DEFAULT_BORDERS.kind,
        soft: Math.max(MIN_SOFT, Math.min(MAX_SOFT, num(b.soft, DEFAULT_BORDERS.soft))),
        terrain,
    };
}

/** The terrain code at a point, in cells — as it looks, so a bare sample
    reads as the background. '' off the map. */
export function terrainAt(doc: MapDoc, x: number, y: number): string {
    const r = rasterOf(doc);
    const sx = Math.floor(x * r.res), sy = Math.floor(y * r.res);
    if (sx < 0 || sy < 0 || sx >= r.w || sy >= r.h) return '';
    const v = r.data[sy * r.w + sx];
    return v === EMPTY ? doc.background : TERRAINS[v]?.code ?? '';
}

/** A new size, anchored top-left: what was painted stays where it was, new
    cells are bare background, and objects left outside are pulled back to
    the edge. */
export function resizeDoc(doc: MapDoc, cols: number, rows: number): MapDoc {
    cols = clampCells(cols);
    rows = clampCells(rows);
    if (cols === doc.cols && rows === doc.rows) return doc;
    const next = resizeRaster(rasterOf(doc), cols, rows, EMPTY);
    const terrain = encode(next.data);
    remember(terrain, next.data);
    let edges = '';
    const painted = edgesOf(doc);
    if (painted) {
        const was: Raster = { w: doc.cols * doc.res, h: doc.rows * doc.res, res: doc.res, data: painted };
        const moved = resizeRaster(was, cols, rows, 0);
        edges = encodeEdges(moved.data);
        rememberEdges(edges, moved.data);
    }
    const cx = (v: number) => Math.max(0, Math.min(cols, v));
    const cy = (v: number) => Math.max(0, Math.min(rows, v));
    return {
        ...doc,
        cols,
        rows,
        res: next.res,
        terrain,
        edges,
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
