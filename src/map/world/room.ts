import { Pen, darken, lighten, lookOf } from './looks';
import type { FloorFinish, LookId, MapRoom, WallFinish } from '../types';

/* An interior's floor plan (owner's request, 2026-11-08): the room is any
   outline of corners on the grid, inside the rectangular map. Outside it is
   nothing (dark) or, when `outside` is set, a ground such as a lawn; inside
   is floor; and like Stardew Valley only the BACK walls are seen standing —
   every edge with the room below it rises as a face of wallpaper `wallH`
   cells tall, drawn over the top of the floor. The other edges show only as
   the thick top of the wall (the trim).

   Corners sit on whole cells, so the furniture's footprints line up with
   the walls. A room may have a notch, an L, a T or a U: any simple outline.

   Walls drawn inside (2026-11-10, the owner's request: rooms more complex
   than one outline) are unit edges of the grid (`walls`). A horizontal one
   is a back wall to the room below it: its top band sits just above the
   edge and its face hangs below, like the outline's. A vertical one shows
   its top band, centred on the edge, and its front end as a narrow face.

   The wallpaper can differ piece by piece (`wallPaints`, keyed like the
   walls: `h`/`v` for a unit edge, `d` for a column of a slanted back wall)
   and the floor cell by cell (`floorGrid` + `floorPaints`).

   Everything is drawn through the Pen, so the four looks apply. */

export type FloorKind =
    | 'planks' | 'parquet' | 'tiles' | 'checker' | 'stone' | 'carpet' | 'tatami' | 'dirt'
    | 'grass' | 'soil' | 'gravel' | 'sand' | 'cobbles' | 'water';
export type WallKind =
    | 'plain' | 'stripes' | 'dots' | 'flowers' | 'panels' | 'wainscot' | 'brick' | 'stone' | 'logs'
    | 'tiles' | 'shoji' | 'hedge' | 'fence';

/** `outdoor`: offered under "Outdoors" (gardens, yards, ponds). */
export const FLOORS: { id: FloorKind; name: string; color: string; outdoor?: boolean }[] = [
    { id: 'planks', name: 'Wooden planks', color: '#c08a58' },
    { id: 'parquet', name: 'Parquet', color: '#b07a48' },
    { id: 'tiles', name: 'Tiles', color: '#e4e0d8' },
    { id: 'checker', name: 'Checkerboard', color: '#e8e4dc' },
    { id: 'stone', name: 'Flagstones', color: '#a8a090' },
    { id: 'carpet', name: 'Carpet', color: '#7a8ab8' },
    { id: 'tatami', name: 'Tatami', color: '#d4c890' },
    { id: 'dirt', name: 'Earth and straw', color: '#a88a60' },
    { id: 'grass', name: 'Grass', color: '#6aa84a', outdoor: true },
    { id: 'soil', name: 'Tilled soil', color: '#7a5636', outdoor: true },
    { id: 'gravel', name: 'Gravel', color: '#b4ada0', outdoor: true },
    { id: 'sand', name: 'Sand', color: '#e2cf9c', outdoor: true },
    { id: 'cobbles', name: 'Cobblestones', color: '#9c968a', outdoor: true },
    { id: 'water', name: 'Water', color: '#4a98d0', outdoor: true },
];

export const WALLS: { id: WallKind; name: string; color: string; outdoor?: boolean }[] = [
    { id: 'plain', name: 'Plain', color: '#efe4cc' },
    { id: 'stripes', name: 'Stripes', color: '#e8d8b8' },
    { id: 'dots', name: 'Dots', color: '#dfe8f0' },
    { id: 'flowers', name: 'Flowers', color: '#f2e2e0' },
    { id: 'panels', name: 'Wood panels', color: '#a87a50' },
    { id: 'wainscot', name: 'Wainscot', color: '#d8e4d0' },
    { id: 'brick', name: 'Brick', color: '#b0644a' },
    { id: 'stone', name: 'Stone', color: '#b0a898' },
    { id: 'logs', name: 'Logs', color: '#9a6a40' },
    { id: 'tiles', name: 'Wall tiles', color: '#dcebee' },
    { id: 'shoji', name: 'Paper screens', color: '#f4ecd8' },
    { id: 'hedge', name: 'Hedge', color: '#3e8a44', outdoor: true },
    { id: 'fence', name: 'Wooden fence', color: '#c8a070', outdoor: true },
];

const FLOOR_IDS = new Set(FLOORS.map((f) => f.id));
const WALL_IDS = new Set(WALLS.map((f) => f.id));
export const isFloorKind = (v: unknown): v is FloorKind => typeof v === 'string' && FLOOR_IDS.has(v as FloorKind);
export const isWallKind = (v: unknown): v is WallKind => typeof v === 'string' && WALL_IDS.has(v as WallKind);

/** Most corners a room may have. */
export const MAX_CORNERS = 48;
/** Most inner wall pieces a map may have. */
export const MAX_WALLS = 6000;
/** The characters of `floorGrid`, one per entry of `floorPaints`. */
export const FINISH_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** How thick an inner wall's top band is, in cells (the outline's shows as wide). */
export const WALL_T = 0.35;

/* --------------------------------------------------------------- shapes */

export type Pt = [number, number];

/** The room presets, fitted to a map of `cols` x `rows` with a cell of margin. */
export function presetShape(kind: 'rect' | 'L' | 'T' | 'U' | 'plus', cols: number, rows: number): Pt[] {
    const x0 = 1, y0 = 1, x1 = Math.max(x0 + 3, cols - 1), y1 = Math.max(y0 + 3, rows - 1);
    const w = x1 - x0, h = y1 - y0;
    const mx = (t: number) => x0 + Math.round(w * t), my = (t: number) => y0 + Math.round(h * t);
    switch (kind) {
        case 'L': return [[x0, y0], [mx(0.55), y0], [mx(0.55), my(0.45)], [x1, my(0.45)], [x1, y1], [x0, y1]];
        case 'T': return [[x0, y0], [x1, y0], [x1, my(0.45)], [mx(0.68), my(0.45)], [mx(0.68), y1], [mx(0.32), y1], [mx(0.32), my(0.45)], [x0, my(0.45)]];
        case 'U': return [[x0, y0], [mx(0.35), y0], [mx(0.35), my(0.55)], [mx(0.65), my(0.55)], [mx(0.65), y0], [x1, y0], [x1, y1], [x0, y1]];
        case 'plus': return [[mx(0.33), y0], [mx(0.67), y0], [mx(0.67), my(0.33)], [x1, my(0.33)], [x1, my(0.67)], [mx(0.67), my(0.67)], [mx(0.67), y1], [mx(0.33), y1], [mx(0.33), my(0.67)], [x0, my(0.67)], [x0, my(0.33)], [mx(0.33), my(0.33)]];
        default: return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    }
}

/** A new interior's room: a rectangle a cell in from the edges. */
export function defaultRoom(cols: number, rows: number): MapRoom {
    return { pts: presetShape('rect', cols, rows), wallH: 2, floor: 'planks', floorColor: '#c08a58', wall: 'stripes', wallColor: '#e8d8b8', trim: '#6a4a34' };
}

/** Whether a point is inside the outline (even-odd). */
export function insidePoly(pts: Pt[], x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** How many times the outline crosses or folds onto itself (0 = a proper
    room). Two walls that are not neighbours may not touch at all; two
    neighbours may not double back along each other; no wall has length 0.
    The Room tool refuses any move that raises this (owner's report,
    2026-11-08: dragged corners made walls overlap). */
export function crossings(pts: Pt[]): number {
    const n = pts.length;
    if (n < 3) return 1;
    let bad = 0;
    const seg = (i: number): [Pt, Pt] => [pts[i], pts[(i + 1) % n]];
    const orient = (a: Pt, b: Pt, c: Pt) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const onSeg = (a: Pt, b: Pt, c: Pt) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
    const meet = ([a, b]: [Pt, Pt], [c, d]: [Pt, Pt]) => {
        const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
        if (o1 !== o2 && o3 !== o4 && o1 * o2 <= 0 && o3 * o4 <= 0) return true;
        return (o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b));
    };
    for (let i = 0; i < n; i++) {
        const [a, b] = seg(i);
        if (a[0] === b[0] && a[1] === b[1]) { bad++; continue; }
        /* A neighbour folding straight back along this wall. */
        const c = pts[(i + 2) % n];
        if (orient(a, b, c) === 0 && (c[0] - b[0]) * (a[0] - b[0]) + (c[1] - b[1]) * (a[1] - b[1]) > 0) bad++;
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            if (meet(seg(i), seg(j))) bad++;
        }
    }
    return bad;
}

/** The edges that stand as back walls: the room lies just below them. */
export function backWalls(pts: Pt[]): [Pt, Pt][] {
    const out: [Pt, Pt][] = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if (Math.abs(a[0] - b[0]) < 1e-6) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (insidePoly(pts, mx, my + 0.02)) out.push(a[0] < b[0] ? [a, b] : [b, a]);
    }
    /* Back to front: a nearer wall covers the face of one behind it. */
    return out.sort((p, q) => Math.min(p[0][1], p[1][1]) - Math.min(q[0][1], q[1][1]));
}

/* ----------------------------------------------------------- wall pieces */

export type PieceKind = 'h' | 'v' | 'd';
export const pieceKey = (o: PieceKind, x: number, y: number) => `${o}${x},${y}`;
const KEY_RE = /^([hvd])(\d{1,4}),(\d{1,4})$/;
export function parseKey(k: string): { o: PieceKind; x: number; y: number } | null {
    const m = KEY_RE.exec(k);
    return m ? { o: m[1] as PieceKind, x: +m[2], y: +m[3] } : null;
}

/** One unit piece of the outline: which side of it the room is on. */
export interface OutlinePiece { key: string; o: PieceKind; x: number; y: number; side: 'below' | 'above' | 'right' | 'left' }

/** One column of a standing face: a back wall's, an inner wall's, or the
    front end of an inner wall running down the map (`cap`). In cells. */
export interface Face { key: string; x0: number; x1: number; ya: number; yb: number; h: number; inner: boolean; cap?: boolean }

interface Geo { inner: Set<string>; outline: OutlinePiece[]; faces: Face[] }
const GEO = new WeakMap<MapRoom, Geo>();

/** The look of a wall piece: its own, or the room's. */
export function wallLook(room: MapRoom, key: string): WallFinish {
    return room.wallPaints?.[key] ?? { kind: room.wall, color: room.wallColor };
}

/** How tall a piece's face stands: a fence is a cell at most. */
export function faceHeight(room: MapRoom, kind: WallKind): number {
    return kind === 'fence' ? Math.min(1, room.wallH) : room.wallH;
}

/** Whether a cell (by its top-left corner) is ground: in the room, or
    outside it when the outside is a ground of its own. */
function groundCell(room: MapRoom, cx: number, cy: number): boolean {
    return !!room.outside || insidePoly(room.pts, cx + 0.5, cy + 0.5);
}

/** The pieces and faces of a room, worked out once per room object. */
export function roomGeo(room: MapRoom): Geo {
    const hit = GEO.get(room);
    if (hit) return hit;
    const pts = room.pts;
    const inner = new Set(room.walls ?? []);
    const outline: OutlinePiece[] = [];
    const faces: Face[] = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if (a[0] === b[0]) {
            const x = a[0];
            for (let y = Math.min(a[1], b[1]); y < Math.max(a[1], b[1]); y++) {
                outline.push({ key: pieceKey('v', x, y), o: 'v', x, y, side: insidePoly(pts, x + 0.05, y + 0.5) ? 'right' : 'left' });
            }
            continue;
        }
        const [l, r] = a[0] < b[0] ? [a, b] : [b, a];
        const below = insidePoly(pts, (l[0] + r[0]) / 2, (l[1] + r[1]) / 2 + 0.02);
        const flat = l[1] === r[1];
        for (let x = l[0]; x < r[0]; x++) {
            const ya = l[1] + (r[1] - l[1]) * (x - l[0]) / (r[0] - l[0]);
            const yb = l[1] + (r[1] - l[1]) * (x + 1 - l[0]) / (r[0] - l[0]);
            const key = flat ? pieceKey('h', x, l[1]) : pieceKey('d', x, Math.floor(Math.min(ya, yb)));
            outline.push({ key, o: flat ? 'h' : 'd', x, y: flat ? l[1] : Math.floor(Math.min(ya, yb)), side: below ? 'below' : 'above' });
            if (below) faces.push({ key, x0: x, x1: x + 1, ya, yb, h: faceHeight(room, wallLook(room, key).kind), inner: false });
        }
    }
    for (const key of inner) {
        const k = parseKey(key);
        if (!k) continue;
        if (k.o === 'h' && groundCell(room, k.x, k.y)) {
            faces.push({ key, x0: k.x, x1: k.x + 1, ya: k.y, yb: k.y, h: faceHeight(room, wallLook(room, key).kind), inner: true });
        } else if (k.o === 'v' && !inner.has(pieceKey('v', k.x, k.y + 1)) && (groundCell(room, k.x - 1, k.y + 1) || groundCell(room, k.x, k.y + 1))) {
            faces.push({ key, x0: k.x - WALL_T / 2, x1: k.x + WALL_T / 2, ya: k.y + 1, yb: k.y + 1, h: faceHeight(room, wallLook(room, key).kind), inner: true, cap: true });
        }
    }
    /* Back to front; at one depth, left to right. */
    faces.sort((p, q) => Math.min(p.ya, p.yb) - Math.min(q.ya, q.yb) || (p.cap ? 1 : 0) - (q.cap ? 1 : 0) || p.x0 - q.x0);
    const geo = { inner, outline, faces };
    GEO.set(room, geo);
    return geo;
}

/** What is at a point of the map: outside the room, a wall's face, or floor. */
export function roomAt(room: MapRoom, x: number, y: number): 'out' | 'wall' | 'floor' {
    if (!room.outside && !insidePoly(room.pts, x, y)) return 'out';
    for (const f of roomGeo(room).faces) {
        if (f.cap || x < f.x0 || x > f.x1) continue;
        const ey = f.ya + (f.yb - f.ya) * (x - f.x0) / (f.x1 - f.x0);
        if (y >= ey && y < ey + f.h) return 'wall';
    }
    return 'floor';
}

/** Whether every cell of a footprint is floor, and no inner wall runs through it. */
export function onFloor(room: MapRoom, f: { x: number; y: number; w: number; h: number }): boolean {
    for (let y = f.y; y < f.y + f.h - 0.01; y++) {
        for (let x = f.x; x < f.x + f.w - 0.01; x++) {
            if (roomAt(room, x + 0.5, y + 0.5) !== 'floor') return false;
        }
    }
    const e = 0.01;
    for (const key of roomGeo(room).inner) {
        const k = parseKey(key);
        if (!k) continue;
        if (k.o === 'h' ? k.x < f.x + f.w - e && k.x + 1 > f.x + e && k.y > f.y + e && k.y < f.y + f.h - e
            : k.y < f.y + f.h - e && k.y + 1 > f.y + e && k.x > f.x + e && k.x < f.x + f.w - e) return false;
    }
    return true;
}

/** Whether an inner wall may go on this unit edge: within the map, with
    ground on both sides, and not along the outline (which is a wall already). */
export function canWall(room: MapRoom, cols: number, rows: number, o: 'h' | 'v', x: number, y: number): boolean {
    if (o === 'h' ? x < 0 || x >= cols || y <= 0 || y >= rows : y < 0 || y >= rows || x <= 0 || x >= cols) return false;
    const [ax, ay, bx, by] = o === 'h' ? [x, y - 1, x, y] : [x - 1, y, x, y];
    const ia = insidePoly(room.pts, ax + 0.5, ay + 0.5), ib = insidePoly(room.pts, bx + 0.5, by + 0.5);
    if (ia !== ib) return false;
    return ia || !!room.outside;
}

/** The room with these inner wall pieces added (`on`) or taken away; the
    same object when nothing changes. */
export function withWalls(room: MapRoom, cols: number, rows: number, pieces: ['h' | 'v', number, number][], on: boolean): MapRoom {
    const set = new Set(room.walls ?? []);
    let changed = false;
    for (const [o, x, y] of pieces) {
        const key = pieceKey(o, x, y);
        if (on) {
            if (set.has(key) || set.size >= MAX_WALLS || !canWall(room, cols, rows, o, x, y)) continue;
            set.add(key);
        } else if (!set.delete(key)) continue;
        changed = true;
    }
    if (!changed) return room;
    const next: MapRoom = { ...room, walls: [...set].sort() };
    if (!next.walls!.length) delete next.walls;
    /* A removed piece's own wallpaper goes with it. */
    if (!on && next.wallPaints) {
        const own = new Set(roomGeo(next).outline.map((p) => p.key));
        const paints = Object.fromEntries(Object.entries(next.wallPaints).filter(([k]) => set.has(k) || own.has(k)));
        if (Object.keys(paints).length) next.wallPaints = paints; else delete next.wallPaints;
    }
    return next;
}

/** The unit edges walked from vertex `a` to vertex `b`, the longer way
    first: a drag's track as walls. */
export function edgesBetween(a: Pt, b: Pt): ['h' | 'v', number, number][] {
    const out: ['h' | 'v', number, number][] = [];
    let [x, y] = a;
    let guard = 0;
    while ((x !== b[0] || y !== b[1]) && guard++ < 400) {
        const dx = b[0] - x, dy = b[1] - y;
        if (Math.abs(dx) >= Math.abs(dy)) {
            const s = Math.sign(dx);
            out.push(['h', s > 0 ? x : x - 1, y]);
            x += s;
        } else {
            const s = Math.sign(dy);
            out.push(['v', x, s > 0 ? y : y - 1]);
            y += s;
        }
    }
    return out;
}

/** The unit edge nearest a point: a click's wall. */
export function nearestEdge(x: number, y: number): ['h' | 'v', number, number] {
    const dh = Math.abs(y - Math.round(y)), dv = Math.abs(x - Math.round(x));
    return dh <= dv ? ['h', Math.floor(x), Math.round(y)] : ['v', Math.round(x), Math.floor(y)];
}

/** The wall piece under a point, front-most first: a face, then a top band. */
export function pieceAt(room: MapRoom, x: number, y: number): string | null {
    const g = roomGeo(room);
    for (let i = g.faces.length - 1; i >= 0; i--) {
        const f = g.faces[i];
        if (x < f.x0 || x > f.x1) continue;
        const ey = f.ya + (f.yb - f.ya) * (x - f.x0) / (f.x1 - f.x0);
        if (y >= ey - 0.02 && y < ey + Math.max(f.h, 0.3)) return f.key;
    }
    const T = WALL_T;
    for (const key of g.inner) {
        const k = parseKey(key);
        if (!k) continue;
        if (k.o === 'h' ? x >= k.x && x <= k.x + 1 && y >= k.y - T && y <= k.y + 0.05 : y >= k.y && y <= k.y + 1 && Math.abs(x - k.x) <= T / 2 + 0.05) return key;
    }
    for (const p of g.outline) {
        const r = bandRect(p, 0);
        if (x >= r[0] - 0.05 && x <= r[0] + r[2] + 0.05 && y >= r[1] - 0.05 && y <= r[1] + r[3] + 0.05) return p.key;
    }
    return null;
}

/** The shape of a wall piece on the map, in cells: its face, or its top. */
export function pieceOutline(room: MapRoom, key: string): Pt[] | null {
    const g = roomGeo(room);
    const f = g.faces.find((x) => x.key === key && !x.cap) ?? g.faces.find((x) => x.key === key);
    const rect = ([x, y, w, h]: [number, number, number, number]): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    if (f) {
        const h = Math.max(f.h, 0.3);
        return [[f.x0, f.ya], [f.x1, f.yb], [f.x1, f.yb + h], [f.x0, f.ya + h]];
    }
    if (g.inner.has(key)) {
        const k = parseKey(key)!;
        return rect(k.o === 'h' ? [k.x, k.y - WALL_T, 1, WALL_T] : [k.x - WALL_T / 2, k.y, WALL_T, 1]);
    }
    const o = g.outline.find((x) => x.key === key);
    return o ? rect(bandRect(o, 0)) : null;
}

/** The outline piece's top band, outside the room, in cells: [x, y, w, h]. */
function bandRect(p: OutlinePiece, grow: number): [number, number, number, number] {
    const T = WALL_T + grow;
    switch (p.side) {
        case 'below': return [p.x, p.y - T, 1, T];
        case 'above': return [p.x, p.y, 1, T];
        case 'right': return [p.x - T, p.y, T, 1];
        default: return [p.x, p.y, T, 1];
    }
}

/* ------------------------------------------------------------- floor grid */

/** The cells of a map that are one region: reached from (cx, cy) without
    crossing an inner wall or the outline. Cell indices, row by row. */
export function regionOf(room: MapRoom, cols: number, rows: number, cx: number, cy: number): number[] {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows || !groundCell(room, cx, cy)) return [];
    const inner = roomGeo(room).inner;
    const inRoom = (x: number, y: number) => insidePoly(room.pts, x + 0.5, y + 0.5);
    const startIn = inRoom(cx, cy);
    const seen = new Uint8Array(cols * rows);
    const out: number[] = [];
    const stack = [cy * cols + cx];
    seen[stack[0]] = 1;
    while (stack.length) {
        const i = stack.pop()!;
        out.push(i);
        const x = i % cols, y = (i - x) / cols;
        const step = (nx: number, ny: number, wall: string) => {
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
            const j = ny * cols + nx;
            if (seen[j] || inner.has(wall) || inRoom(nx, ny) !== startIn) return;
            seen[j] = 1;
            stack.push(j);
        };
        step(x - 1, y, pieceKey('v', x, y));
        step(x + 1, y, pieceKey('v', x + 1, y));
        step(x, y - 1, pieceKey('h', x, y));
        step(x, y + 1, pieceKey('h', x, y + 1));
    }
    return out;
}

/** The wall pieces seen from a region: its side walls, and every face
    hanging into it. A wall at its bottom edge faces the next room down. */
export function wallsOfRegion(room: MapRoom, cols: number, cells: number[]): string[] {
    const g = roomGeo(room);
    const set = new Set(cells);
    const out = new Set<string>();
    const has = (x: number, y: number) => x >= 0 && x < cols && set.has(y * cols + x);
    for (const f of g.faces) {
        const mx = f.cap ? f.x0 + (f.x1 - f.x0) / 2 : (f.x0 + f.x1) / 2;
        const my = (f.ya + f.yb) / 2 + 0.5;
        const cx = f.cap ? Math.floor(mx - 0.01) : Math.floor(mx);
        if (has(cx, Math.floor(my)) || (f.cap && has(cx + 1, Math.floor(my)))) out.add(f.key);
    }
    const sides = new Set([...g.inner].filter((k) => k[0] === 'v'));
    for (const p of g.outline) if (p.o === 'v') sides.add(p.key);
    for (const key of sides) {
        const k = parseKey(key)!;
        if (has(k.x - 1, k.y) || has(k.x, k.y)) out.add(key);
    }
    return [...out];
}

/** The room with `cells` painted with a floor (null: back to the room's own). */
export function withFloor(room: MapRoom, cols: number, rows: number, cells: number[], finish: FloorFinish | null): MapRoom {
    const n = cols * rows;
    let grid = room.floorGrid && room.floorGrid.length === n ? room.floorGrid : '.'.repeat(n);
    let paints = room.floorPaints ? room.floorPaints.slice() : [];
    let ch = '.';
    if (finish) {
        let i = paints.findIndex((f) => f.kind === finish.kind && f.color.toLowerCase() === finish.color.toLowerCase());
        if (i < 0) {
            if (paints.length >= FINISH_CHARS.length) {
                ({ grid, paints } = compactFloors(grid, paints));
                if (paints.length >= FINISH_CHARS.length) return room;
            }
            paints.push({ kind: finish.kind, color: finish.color });
            i = paints.length - 1;
        }
        ch = FINISH_CHARS[i];
    }
    const arr = grid.split('');
    let changed = false;
    for (const c of cells) {
        if (c < 0 || c >= n || arr[c] === ch) continue;
        if (!room.outside && finish && !insidePoly(room.pts, (c % cols) + 0.5, Math.floor(c / cols) + 0.5)) continue;
        arr[c] = ch;
        changed = true;
    }
    if (!changed) return room;
    const compact = compactFloors(arr.join(''), paints);
    const next: MapRoom = { ...room, floorGrid: compact.grid, floorPaints: compact.paints };
    if (!compact.paints.length) { delete next.floorGrid; delete next.floorPaints; }
    return next;
}

/** Drops the floors no cell uses and renumbers the rest. */
function compactFloors(grid: string, paints: FloorFinish[]): { grid: string; paints: FloorFinish[] } {
    const used = new Set(grid);
    const map = new Map<string, string>([['.', '.']]);
    const out: FloorFinish[] = [];
    paints.forEach((f, i) => {
        if (!used.has(FINISH_CHARS[i])) return;
        map.set(FINISH_CHARS[i], FINISH_CHARS[out.length]);
        out.push(f);
    });
    let g = '';
    for (const c of grid) g += map.get(c) ?? '.';
    return { grid: g, paints: out };
}

/** The room with these wall pieces papered (null: back to the room's own). */
export function withWallpaper(room: MapRoom, keys: string[], finish: WallFinish | null): MapRoom {
    const paints = { ...(room.wallPaints ?? {}) };
    let changed = false;
    for (const k of keys) {
        const cur = paints[k];
        if (finish) {
            if (cur && cur.kind === finish.kind && cur.color.toLowerCase() === finish.color.toLowerCase()) continue;
            paints[k] = { kind: finish.kind, color: finish.color };
        } else {
            if (!cur) continue;
            delete paints[k];
        }
        changed = true;
    }
    if (!changed) return room;
    const next: MapRoom = { ...room, wallPaints: paints };
    if (!Object.keys(paints).length) delete next.wallPaints;
    return next;
}

/* -------------------------------------------------------------- loading */

const hexOk = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const floorFinish = (v: unknown): FloorFinish | undefined => {
    const o = v as Record<string, unknown> | null;
    return o && typeof o === 'object' && isFloorKind(o.kind) && hexOk(o.color) ? { kind: o.kind, color: o.color } : undefined;
};
const wallFinish = (v: unknown): WallFinish | undefined => {
    const o = v as Record<string, unknown> | null;
    return o && typeof o === 'object' && isWallKind(o.kind) && hexOk(o.color) ? { kind: o.kind, color: o.color } : undefined;
};

/** Saved data made safe; null when there is no usable room. */
export function normalizeRoom(raw: unknown, cols: number, rows: number): MapRoom | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.pts)) return undefined;
    const pts: Pt[] = [];
    for (const p of r.pts.slice(0, MAX_CORNERS)) {
        if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isFinite(p[0]) || !isFinite(p[1])) continue;
        pts.push([Math.max(0, Math.min(cols, Math.round(p[0]))), Math.max(0, Math.min(rows, Math.round(p[1])))]);
    }
    if (pts.length < 3) return undefined;
    const hex = (v: unknown, d: string) => (hexOk(v) ? v : d);
    const def = defaultRoom(cols, rows);
    const out: MapRoom = {
        pts,
        wallH: typeof r.wallH === 'number' && isFinite(r.wallH) ? Math.max(0, Math.min(4, Math.round(r.wallH))) : 2,
        floor: isFloorKind(r.floor) ? r.floor : def.floor,
        floorColor: hex(r.floorColor, def.floorColor),
        wall: isWallKind(r.wall) ? r.wall : def.wall,
        wallColor: hex(r.wallColor, def.wallColor),
        trim: hex(r.trim, def.trim),
    };
    const outside = floorFinish(r.outside);
    if (outside) out.outside = outside;
    if (Array.isArray(r.walls)) {
        const walls = new Set<string>();
        for (const k of r.walls.slice(0, MAX_WALLS)) {
            const p = typeof k === 'string' ? parseKey(k) : null;
            if (p && p.o !== 'd' && p.x <= cols && p.y <= rows) walls.add(pieceKey(p.o, p.x, p.y));
        }
        if (walls.size) out.walls = [...walls].sort();
    }
    if (Array.isArray(r.floorPaints) && typeof r.floorGrid === 'string' && r.floorGrid.length === cols * rows) {
        const paints = r.floorPaints.slice(0, FINISH_CHARS.length).map(floorFinish);
        if (paints.every(Boolean)) {
            let grid = '';
            for (const c of r.floorGrid) { const i = FINISH_CHARS.indexOf(c); grid += i >= 0 && i < paints.length ? c : '.'; }
            const compact = compactFloors(grid, paints as FloorFinish[]);
            if (compact.paints.length) { out.floorGrid = compact.grid; out.floorPaints = compact.paints; }
        }
    }
    if (r.wallPaints && typeof r.wallPaints === 'object') {
        const paints: Record<string, WallFinish> = {};
        for (const [k, v] of Object.entries(r.wallPaints as Record<string, unknown>)) {
            const f = wallFinish(v);
            if (f && parseKey(k)) paints[k] = f;
        }
        if (Object.keys(paints).length) out.wallPaints = paints;
    }
    return out;
}

/** The room on a map resized to `cols` x `rows`: corners kept on it, the
    painted floors kept where they were (from the top left). */
export function resizeRoom(room: MapRoom | undefined, cols: number, rows: number, oldCols?: number, oldRows?: number): MapRoom | undefined {
    if (!room) return undefined;
    const next: MapRoom = { ...room, pts: room.pts.map(([x, y]) => [Math.min(x, cols), Math.min(y, rows)] as Pt) };
    if (room.walls) {
        next.walls = room.walls.filter((k) => { const p = parseKey(k); return !!p && (p.o === 'h' ? p.x < cols && p.y < rows : p.x < cols && p.y < rows); });
        if (!next.walls.length) delete next.walls;
    }
    if (room.floorGrid && oldCols && oldRows && room.floorGrid.length === oldCols * oldRows) {
        let g = '';
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g += x < oldCols && y < oldRows ? room.floorGrid[y * oldCols + x] : '.';
        const compact = compactFloors(g, room.floorPaints ?? []);
        if (compact.paints.length) { next.floorGrid = compact.grid; next.floorPaints = compact.paints; } else { delete next.floorGrid; delete next.floorPaints; }
    } else {
        delete next.floorGrid;
        delete next.floorPaints;
    }
    return next;
}

/* --------------------------------------------------------------- drawing */

/** Draws the room on `ctx`, whose origin is the map's (0,0) and scale `u` px a cell. */
export function drawRoom(ctx: CanvasRenderingContext2D, room: MapRoom, u: number, look: LookId | undefined, cols: number, rows: number): void {
    const p = new Pen(ctx, u, lookOf(look));
    const geo = roomGeo(room);
    const pts = room.pts.map(([x, y]) => [x * u, y * u] as Pt);
    const outline = () => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
    };
    /* The map with the room cut out of it: what lies outside. */
    const outsidePath = () => {
        ctx.beginPath();
        ctx.rect(-u, -u, W + 2 * u, H + 2 * u);
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
    };
    const W = cols * u, H = rows * u;
    const ground = !!room.outside;

    /* The ground outside, when there is one. */
    if (room.outside) {
        ctx.save();
        outsidePath();
        ctx.clip('evenodd');
        floorPattern(p, room.outside.kind, room.outside.color, W, H);
        ctx.restore();
    }

    /* The floor, clipped to the room. */
    ctx.save();
    outline();
    ctx.clip('evenodd');
    floorPattern(p, room.floor, room.floorColor, W, H);
    ctx.restore();

    /* Floors painted over parts of it. */
    const grid = room.floorGrid && room.floorGrid.length === cols * rows ? room.floorGrid : null;
    if (grid && room.floorPaints) drawPaintedFloors(p, room, grid, cols, rows, outline);

    /* The standing faces, back to front: the outline's back walls (inside
       the room), the inner walls' (on the ground) and their front ends. */
    for (const f of mergeFaces(geo.faces, room, geo.inner)) {
        ctx.save();
        if (!f.inner || !ground) { outline(); ctx.clip('evenodd'); }
        drawFace(p, room, f, f.look);
        ctx.restore();
    }

    /* A soft shade down the left and right walls too, where they meet the floor. */
    ctx.save();
    outline();
    ctx.clip('evenodd');
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if (Math.abs(a[0] - b[0]) > 0.5) continue;
        const inRight = insidePoly(room.pts, a[0] / u + 0.05, (a[1] + b[1]) / 2 / u);
        const x = inRight ? a[0] : a[0] - 0.22 * u;
        p.rect(x, Math.min(a[1], b[1]), 0.22 * u, Math.abs(b[1] - a[1])).shade(0.14);
    }
    ctx.restore();

    /* Outside the room: nothing, dark — unless it is a ground. */
    if (!ground) {
        ctx.save();
        outsidePath();
        ctx.fillStyle = p.c(p.look.night ? '#06080f' : '#1e1a1c');
        ctx.fill('evenodd');
        ctx.restore();
    }

    /* The top of the walls all round: a thick band just outside the outline.
       Pieces of hedge or fence leave it out and draw their own. */
    const special = geo.outline.filter((o) => { const k = wallLook(room, o.key).kind; return (k === 'hedge' || k === 'fence') && o.o !== 'd'; });
    ctx.save();
    outsidePath();
    ctx.clip('evenodd');
    if (special.length) {
        ctx.beginPath();
        ctx.rect(-2 * u, -2 * u, W + 4 * u, H + 4 * u);
        for (const o of special) { const [x, y, w, h] = bandRect(o, 0.08); ctx.rect(x * u, y * u, w * u, h * u); }
        ctx.clip('evenodd');
    }
    outline();
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 0.7 * u;
    ctx.strokeStyle = p.c(room.trim);
    ctx.stroke();
    ctx.lineWidth = 0.18 * u;
    ctx.strokeStyle = p.c(lighten(room.trim, 0.25));
    ctx.stroke();
    ctx.restore();
    ctx.save();
    if (special.length) {
        ctx.beginPath();
        ctx.rect(-2 * u, -2 * u, W + 4 * u, H + 4 * u);
        for (const o of special) { const [x, y, w, h] = bandRect(o, 0.08); ctx.rect(x * u, y * u, w * u, h * u); }
        ctx.clip('evenodd');
    }
    outline();
    p.stroke(1.2);
    ctx.restore();
    for (const o of special) {
        const lk = wallLook(room, o.key);
        const [x, y, w, h] = bandRect(o, 0);
        if (lk.kind === 'hedge') hedgeBand(p, x * u, y * u, w * u, h * u, lk.color);
        else fenceRail(p, o.o === 'v' ? 'v' : 'h', o.x * u, o.y * u, lk.color);
    }

    /* The inner walls' top bands: those in the room clipped to it, so a
       wall meeting the outline joins its band instead of poking through;
       those out in the garden clipped to the outside. */
    const inside = new Set<string>(), out = new Set<string>();
    for (const key of geo.inner) {
        const k = parseKey(key);
        if (k) (insidePoly(room.pts, k.x + 0.5, k.y + 0.5) ? inside : out).add(key);
    }
    ctx.save();
    outline();
    ctx.clip('evenodd');
    drawInnerBands(p, room, inside);
    ctx.restore();
    if (out.size) {
        ctx.save();
        outsidePath();
        ctx.clip('evenodd');
        drawInnerBands(p, room, out);
        ctx.restore();
    }
}

/** Runs of face columns that look alike, merged so patterns run on; an
    inner wall's run reaches half a wall's width past a free end. */
function mergeFaces(faces: Face[], room: MapRoom, inner: Set<string>): (Face & { look: WallFinish })[] {
    const out: (Face & { look: WallFinish })[] = [];
    for (const f of faces) {
        const look = wallLook(room, f.key);
        const last = out[out.length - 1];
        if (last && !f.cap && !last.cap && last.inner === f.inner && Math.abs(last.x1 - f.x0) < 1e-6 && Math.abs(last.yb - f.ya) < 1e-6
            && last.h === f.h && last.look.kind === look.kind && last.look.color.toLowerCase() === look.color.toLowerCase()) {
            last.x1 = f.x1;
            last.yb = f.yb;
            continue;
        }
        out.push({ ...f, look });
    }
    for (const f of out) {
        if (!f.inner || f.cap) continue;
        if (!inner.has(pieceKey('h', f.x0 - 1, f.ya))) f.x0 -= WALL_T / 2;
        if (!inner.has(pieceKey('h', f.x1, f.ya))) f.x1 += WALL_T / 2;
    }
    return out;
}

/** One face of wall, from (x0, ya) to (x1, yb) along its top, `h` cells tall. */
function drawFace(p: Pen, room: MapRoom, f: Face, look: WallFinish): void {
    const u = p.u;
    const ax = f.x0 * u, ay = f.ya * u, bx = f.x1 * u, by = f.yb * u, h = f.h * u;
    if (h <= 0) return;
    const ctx = p.ctx;
    if (look.kind === 'fence') {
        if (f.cap) { fencePost(p, (ax + bx) / 2, ay, h, look.color); return; }
        p.poly([[ax, ay + h], [bx, by + h], [bx, by + h + 0.25 * u], [ax, ay + h + 0.25 * u]]).shade(0.1);
        fencePickets(p, ax, ay, bx, by, h, look.color);
        return;
    }
    const face: Pt[] = [[ax, ay], [bx, by], [bx, by + h], [ax, ay + h]];
    ctx.save();
    p.poly(face);
    ctx.clip();
    wallPattern(p, look.kind, look.color, room.trim, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), h + Math.abs(by - ay));
    if (look.kind !== 'hedge') {
        /* The skirting board, and the shadow the wall throws on the floor. */
        p.poly([[ax, ay + h - 0.18 * u], [bx, by + h - 0.18 * u], [bx, by + h], [ax, ay + h]]).fill(darken(room.trim, 0.05));
        p.line([[ax, ay + h - 0.18 * u], [bx, by + h - 0.18 * u]], null, 0.5, 0.6);
    }
    p.poly([[ax, ay], [bx, by], [bx, by + 0.18 * u], [ax, ay + 0.18 * u]]).shade(look.kind === 'hedge' ? 0.12 : 0.25);
    if (f.cap) {
        /* The end of a wall: its corners. */
        p.line([[ax, ay], [ax, ay + h]], null, 0.6, 0.7);
        p.line([[bx, by], [bx, by + h]], null, 0.6, 0.7);
        p.rect(bx - 0.08 * u, by, 0.08 * u, h).shade(0.18);
    }
    ctx.restore();
    p.poly([[ax, ay + h], [bx, by + h], [bx, by + h + 0.35 * u], [ax, ay + h + 0.35 * u]]).shade(0.16);
}

/** The inner walls' top bands: each piece and each corner where pieces
    meet, drawn as one shape (all the outlines first, then all the fills,
    so the joins between pieces leave no line). */
function drawInnerBands(p: Pen, room: MapRoom, inner: Set<string>): void {
    if (!inner.size) return;
    const u = p.u, T = WALL_T;
    type Band = { x: number; y: number; w: number; h: number; look: WallFinish; o: 'h' | 'v' | 'j'; key: string };
    const bands: Band[] = [];
    const joints = new Map<string, WallFinish>();
    /* A corner takes a solid wall's look over a hedge's or a fence's. */
    const joint = (at: string, look: WallFinish) => {
        const cur = joints.get(at);
        if (!cur || ((cur.kind === 'hedge' || cur.kind === 'fence') && look.kind !== 'hedge' && look.kind !== 'fence')) joints.set(at, look);
    };
    for (const key of inner) {
        const k = parseKey(key);
        if (!k || k.o === 'd') continue;
        const look = wallLook(room, key);
        if (k.o === 'h') {
            bands.push({ x: k.x, y: k.y - T, w: 1, h: T, look, o: 'h', key });
            for (const vx of [k.x, k.x + 1]) joint(vx + ',' + k.y, look);
        } else {
            bands.push({ x: k.x - T / 2, y: k.y, w: T, h: 1, look, o: 'v', key });
            for (const vy of [k.y, k.y + 1]) joint(k.x + ',' + vy, look);
        }
    }
    for (const [at, look] of joints) {
        const [vx, vy] = at.split(',').map(Number);
        bands.push({ x: vx - T / 2, y: vy - T, w: T, h: T, look, o: 'j', key: at });
    }
    const solid = bands.filter((b) => b.look.kind !== 'hedge' && b.look.kind !== 'fence');
    const ctx = p.ctx;
    if (solid.length) {
        ctx.save();
        ctx.beginPath();
        for (const b of solid) ctx.rect(b.x * u, b.y * u, b.w * u, b.h * u);
        ctx.lineJoin = 'miter';
        ctx.lineWidth = Math.max(1.5, u * p.look.line * 2.4);
        ctx.strokeStyle = p.look.ink ?? darken(p.c(room.trim), 0.5);
        ctx.stroke();
        ctx.fillStyle = p.c(room.trim);
        ctx.fill();
        ctx.beginPath();
        for (const b of solid) if (b.o === 'h') ctx.rect(b.x * u, b.y * u + 0.06 * u, b.w * u, 0.08 * u);
        ctx.fillStyle = p.c(lighten(room.trim, 0.22));
        ctx.fill();
        ctx.restore();
    }
    for (const b of bands) {
        if (b.look.kind === 'hedge') hedgeBand(p, b.x * u, b.y * u, b.w * u, b.h * u, b.look.color);
    }
    for (const b of bands) {
        if (b.look.kind !== 'fence' || b.o === 'j') continue;
        const k = parseKey(b.key)!;
        fenceRail(p, b.o === 'v' ? 'v' : 'h', k.x * u, k.y * u, b.look.color);
    }
}

/** A hedge's top, seen from above: a leafy band. */
function hedgeBand(p: Pen, x: number, y: number, w: number, h: number, leaves: string): void {
    const u = p.u;
    p.rr(x - 0.04 * u, y - 0.04 * u, w + 0.08 * u, h + 0.08 * u, 0.12 * u).fill(darken(leaves, 0.05)).stroke(0.8);
    p.reseed(Math.round(x * 3 + y * 7));
    const n = Math.max(2, Math.round((w * h) / (u * u) * 40));
    for (let i = 0; i < n; i++) {
        const lx = x + p.rnd() * w, ly = y + p.rnd() * h;
        p.ell(lx, ly, 0.07 * u, 0.055 * u).fill(p.rnd() < 0.5 ? lighten(leaves, 0.18) : darken(leaves, 0.22));
    }
}

/** A fence's top rail along one unit edge, with its posts. */
function fenceRail(p: Pen, o: 'h' | 'v', x: number, y: number, wood: string): void {
    const u = p.u, t = 0.1 * u;
    if (o === 'h') p.rect(x, y - t / 2, u, t).paint(wood, 0.6);
    else p.rect(x - t / 2, y, t, u).paint(wood, 0.6);
    const ends: Pt[] = o === 'h' ? [[x, y], [x + u, y]] : [[x, y], [x, y + u]];
    for (const [px, py] of ends) p.rect(px - 0.09 * u, py - 0.09 * u, 0.18 * u, 0.18 * u).paint(lighten(wood, 0.1), 0.6);
}

/** A fence's face: pickets from its top rail down to the ground. */
function fencePickets(p: Pen, ax: number, ay: number, bx: number, by: number, h: number, wood: string): void {
    const u = p.u;
    const at = (x: number) => ay + (by - ay) * (x - ax) / Math.max(1e-6, bx - ax);
    const pw = 0.14 * u;
    for (let x = Math.ceil(ax / (0.25 * u)) * 0.25 * u + 0.04 * u; x < bx - pw * 0.5; x += 0.25 * u) {
        const top = at(x) + 0.04 * u, bot = at(x) + h;
        p.poly([[x, top + 0.06 * u], [x + pw / 2, top], [x + pw, top + 0.06 * u], [x + pw, bot], [x, bot]]).shadeFill(wood, 0, top, 0, bot, 0.25).stroke(0.6);
    }
    for (const k of [0.3, 0.72]) {
        p.poly([[ax, ay + h * k], [bx, by + h * k], [bx, by + h * k + 0.09 * u], [ax, ay + h * k + 0.09 * u]]).paint(darken(wood, 0.12), 0.6);
    }
}

/** The front end of a fence running down the map: one post. */
function fencePost(p: Pen, cx: number, top: number, h: number, wood: string): void {
    const u = p.u;
    p.groundShadow(cx, top + h, 0.16 * u, 0.06 * u);
    p.rect(cx - 0.08 * u, top, 0.16 * u, h).shadeFill(wood, cx - 0.08 * u, 0, cx + 0.08 * u, 0, 0.3).stroke(0.6);
}

/** Each painted floor, through the cells that have it; then a line where two floors meet. */
function drawPaintedFloors(p: Pen, room: MapRoom, grid: string, cols: number, rows: number, outline: () => void): void {
    const u = p.u, ctx = p.ctx, paints = room.floorPaints!;
    const W = cols * u, H = rows * u;
    const used = new Set(grid);
    paints.forEach((f, i) => {
        const ch = FINISH_CHARS[i];
        if (!used.has(ch)) return;
        ctx.save();
        if (!room.outside) { outline(); ctx.clip('evenodd'); }
        ctx.beginPath();
        for (let y = 0; y < rows; y++) {
            let x = 0;
            while (x < cols) {
                if (grid[y * cols + x] !== ch) { x++; continue; }
                const x0 = x;
                while (x < cols && grid[y * cols + x] === ch) x++;
                ctx.rect(x0 * u, y * u, (x - x0) * u, u);
            }
        }
        ctx.clip();
        floorPattern(p, f.kind, f.color, W, H);
        ctx.restore();
    });
    /* Where two floors meet: a threshold line; a bank round water. */
    const inRoom = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) inRoom[y * cols + x] = insidePoly(room.pts, x + 0.5, y + 0.5) ? 1 : 0;
    const finishAt = (i: number): FloorFinish | null => {
        const c = grid[i];
        if (c !== '.') return paints[FINISH_CHARS.indexOf(c)] ?? null;
        if (inRoom[i]) return { kind: room.floor, color: room.floorColor };
        return room.outside ?? null;
    };
    const same = (a: FloorFinish | null, b: FloorFinish | null) => !a || !b || (a.kind === b.kind && a.color === b.color);
    const plain: Pt[][] = [], banks: Pt[][] = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x, a = finishAt(i);
            if (!a) continue;
            const pairs: [number, Pt[]][] = [];
            if (x + 1 < cols) pairs.push([i + 1, [[(x + 1) * u, y * u], [(x + 1) * u, (y + 1) * u]]]);
            if (y + 1 < rows) pairs.push([i + cols, [[x * u, (y + 1) * u], [(x + 1) * u, (y + 1) * u]]]);
            for (const [j, seg] of pairs) {
                if (inRoom[i] !== inRoom[j]) continue;
                const b = finishAt(j);
                if (same(a, b)) continue;
                (a.kind === 'water' || b!.kind === 'water' ? banks : plain).push(seg);
            }
        }
    }
    const stroke = (segs: Pt[][], hex: string, width: number, alpha = 1) => {
        if (!segs.length) return;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.beginPath();
        for (const [[x0, y0], [x1, y1]] of segs) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
        ctx.strokeStyle = hex;
        ctx.lineWidth = width;
        ctx.lineCap = 'square';
        ctx.stroke();
        ctx.restore();
    };
    stroke(plain, p.look.ink ?? 'rgba(40,24,10,0.55)', Math.max(1, u * p.look.line * 0.7));
    stroke(banks, p.c('#cbbd98'), Math.max(2, 0.16 * u));
    stroke(banks, p.look.ink ?? 'rgba(30,40,50,0.6)', Math.max(1, u * p.look.line * 0.6));
}

/* A path of many small marks, filled or stroked at once: grass and gravel
   draw thousands, and one fill each would be slow on a big map. */
function batchStroke(p: Pen, hex: string, width: number, draw: (ctx: CanvasRenderingContext2D) => void, alpha = 1): void {
    const ctx = p.ctx;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath();
    draw(ctx);
    ctx.strokeStyle = p.c(hex);
    ctx.lineWidth = Math.max(1, p.u * p.look.line * width);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
}
function batchFill(p: Pen, hex: string, draw: (ctx: CanvasRenderingContext2D) => void, alpha = 1): void {
    const ctx = p.ctx;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath();
    draw(ctx);
    ctx.fillStyle = p.c(hex);
    ctx.fill();
    ctx.restore();
}

/** A floor's pattern over the whole map; the caller clips it. */
function floorPattern(p: Pen, kind: FloorKind, c: string, W: number, H: number): void {
    const u = p.u;
    p.rect(0, 0, W, H).fill(c);
    p.reseed(7);
    const cells = W * H / (u * u);
    switch (kind) {
        case 'planks':
            for (let y = 0, row = 0; y < H; y += 0.5 * u, row++) {
                p.line([[0, y], [W, y]], darken(c, 0.3), 0.6, 0.7);
                for (let x = ((row * 1.7) % 3) * u; x < W; x += 3 * u) p.line([[x, y], [x, y + 0.5 * u]], darken(c, 0.3), 0.6, 0.7);
                if (row % 3 === 1) p.rect(0, y, W, 0.5 * u).shade(0.05);
            }
            break;
        case 'parquet':
            for (let y = 0; y < H; y += u) {
                for (let x = 0; x < W; x += u) {
                    const flip = (Math.round(x / u) + Math.round(y / u)) % 2 === 0;
                    for (let k = 0; k < 3; k++) {
                        if (flip) p.line([[x, y + k * u / 3], [x + u, y + k * u / 3]], darken(c, 0.3), 0.5, 0.7);
                        else p.line([[x + k * u / 3, y], [x + k * u / 3, y + u]], darken(c, 0.3), 0.5, 0.7);
                    }
                    if (flip) p.rect(x, y, u, u).shade(0.06);
                }
            }
            break;
        case 'tiles':
            for (let y = 0; y < H; y += u) p.line([[0, y], [W, y]], darken(c, 0.2), 0.6, 0.8);
            for (let x = 0; x < W; x += u) p.line([[x, 0], [x, H]], darken(c, 0.2), 0.6, 0.8);
            for (let y = 0; y < H; y += u) for (let x = 0; x < W; x += u) p.rect(x + 0.08 * u, y + 0.08 * u, 0.3 * u, 0.12 * u).shine(0.18);
            break;
        case 'checker':
            for (let y = 0; y < H; y += u) for (let x = 0; x < W; x += u) {
                if ((Math.round(x / u) + Math.round(y / u)) % 2) p.rect(x, y, u, u).fill(darken(c, 0.55));
            }
            break;
        case 'stone':
            for (let y = 0, row = 0; y < H; y += 0.9 * u, row++) {
                let x = -p.rnd() * u;
                while (x < W) {
                    const w = (0.8 + p.rnd() * 0.7) * u;
                    p.rr(x + 0.05 * u, y + 0.05 * u, w - 0.1 * u, 0.8 * u, 0.12 * u).fill(p.rnd() < 0.5 ? lighten(c, 0.06) : darken(c, 0.07));
                    p.rr(x + 0.05 * u, y + 0.05 * u, w - 0.1 * u, 0.8 * u, 0.12 * u).stroke(0.4);
                    x += w;
                }
            }
            break;
        case 'carpet':
            for (let i = 0; i < cells * 3; i++) p.ell(p.rnd() * W, p.rnd() * H, 0.05 * u, 0.05 * u).fill(lighten(c, 0.12));
            break;
        case 'tatami':
            for (let y = 0, row = 0; y < H; y += 2 * u, row++) {
                for (let x = (row % 2) * u - u; x < W; x += 2 * u) {
                    p.rect(x + 0.04 * u, y + 0.04 * u, 1.92 * u, 1.92 * u).stroke(0.5);
                    p.rect(x + 0.04 * u, y + 0.04 * u, 1.92 * u, 0.12 * u).fill(darken(c, 0.45));
                    for (let k = 0.3; k < 1.9; k += 0.18) p.line([[x + 0.1 * u, y + k * u], [x + 1.9 * u, y + k * u]], darken(c, 0.15), 0.35, 0.6);
                }
            }
            break;
        case 'dirt':
            for (let i = 0; i < cells * 2; i++) {
                const x = p.rnd() * W, y = p.rnd() * H;
                if (p.rnd() < 0.5) p.line([[x, y], [x + 0.25 * u, y + (p.rnd() - 0.5) * 0.15 * u]], '#e0c060', 0.6, 0.8);
                else p.ell(x, y, 0.05 * u, 0.04 * u).fill(darken(c, 0.2));
            }
            break;
        case 'grass': {
            /* Light and dark blades, a few clover leaves. */
            const blades = (hex: string, n: number) => batchStroke(p, hex, 0.55, (ctx) => {
                for (let i = 0; i < n; i++) {
                    const x = p.rnd() * W, y = p.rnd() * H;
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + (p.rnd() - 0.5) * 0.1 * u, y - (0.1 + p.rnd() * 0.1) * u);
                }
            }, 0.8);
            blades(darken(c, 0.25), cells * 7);
            blades(lighten(c, 0.2), cells * 5);
            batchFill(p, lighten(c, 0.12), (ctx) => {
                for (let i = 0; i < cells * 0.6; i++) {
                    const x = p.rnd() * W, y = p.rnd() * H;
                    ctx.moveTo(x + 0.06 * u, y);
                    ctx.ellipse(x, y, 0.06 * u, 0.045 * u, 0, 0, Math.PI * 2);
                }
            }, 0.7);
            break;
        }
        case 'soil': {
            /* Furrows across, clods along them. */
            for (let y = 0.25 * u; y < H; y += 0.5 * u) {
                p.rect(0, y - 0.1 * u, W, 0.2 * u).shade(0.12);
                p.line([[0, y + 0.1 * u], [W, y + 0.1 * u]], lighten(c, 0.18), 0.5, 0.6);
            }
            batchFill(p, darken(c, 0.25), (ctx) => {
                for (let i = 0; i < cells * 5; i++) {
                    const x = p.rnd() * W, y = p.rnd() * H, r = (0.03 + p.rnd() * 0.04) * u;
                    ctx.moveTo(x + r, y);
                    ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
                }
            });
            break;
        }
        case 'gravel': {
            for (const [hex, n] of [[lighten(c, 0.22), 9], [darken(c, 0.2), 9], [darken(c, 0.38), 4]] as [string, number][]) {
                batchFill(p, hex, (ctx) => {
                    for (let i = 0; i < cells * n; i++) {
                        const x = p.rnd() * W, y = p.rnd() * H, r = (0.025 + p.rnd() * 0.04) * u;
                        ctx.moveTo(x + r, y);
                        ctx.ellipse(x, y, r, r * 0.8, p.rnd() * 3, 0, Math.PI * 2);
                    }
                });
            }
            break;
        }
        case 'sand': {
            batchStroke(p, lighten(c, 0.25), 0.5, (ctx) => {
                for (let i = 0; i < cells * 0.8; i++) {
                    const x = p.rnd() * W, y = p.rnd() * H;
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(x + 0.2 * u, y - 0.08 * u, x + 0.4 * u, y);
                }
            }, 0.8);
            batchFill(p, darken(c, 0.2), (ctx) => {
                for (let i = 0; i < cells * 4; i++) {
                    const x = p.rnd() * W, y = p.rnd() * H;
                    ctx.moveTo(x + 0.025 * u, y);
                    ctx.arc(x, y, 0.025 * u, 0, Math.PI * 2);
                }
            }, 0.7);
            break;
        }
        case 'cobbles': {
            const ctx = p.ctx;
            const stones = (pick: number) => (c2: CanvasRenderingContext2D) => {
                p.reseed(11);
                for (let y = 0, row = 0; y < H; y += 0.5 * u, row++) {
                    for (let x = (row % 2) * -0.25 * u; x < W; x += 0.5 * u) {
                        const k = p.rnd();
                        if ((k < 0.5 ? 0 : 1) !== pick) continue;
                        c2.roundRect(x + 0.04 * u, y + 0.04 * u, 0.42 * u, 0.42 * u, 0.14 * u);
                    }
                }
            };
            batchFill(p, darken(c, 0.35), (c2) => c2.rect(0, 0, W, H));
            batchFill(p, c, stones(0));
            batchFill(p, lighten(c, 0.12), stones(1));
            ctx.save();
            ctx.beginPath();
            stones(0)(ctx);
            stones(1)(ctx);
            ctx.strokeStyle = p.look.ink ?? p.c(darken(c, 0.45));
            ctx.lineWidth = Math.max(1, u * p.look.line * 0.4);
            ctx.stroke();
            ctx.restore();
            break;
        }
        case 'water': {
            /* Ripples and glints; a darker deep wash across. */
            for (let y = 0; y < H; y += 2 * u) p.rect(0, y + u, W, u).fill(darken(c, 0.06));
            batchStroke(p, lighten(c, 0.35), 0.6, (ctx) => {
                for (let i = 0; i < cells * 0.9; i++) {
                    const x = p.rnd() * W, y = p.rnd() * H, w = (0.2 + p.rnd() * 0.25) * u;
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(x + w / 2, y - 0.06 * u, x + w, y);
                }
            }, 0.8);
            batchFill(p, '#ffffff', (ctx) => {
                for (let i = 0; i < cells * 0.4; i++) {
                    const x = p.rnd() * W, y = p.rnd() * H;
                    ctx.moveTo(x + 0.05 * u, y);
                    ctx.ellipse(x, y, 0.05 * u, 0.02 * u, 0, 0, Math.PI * 2);
                }
            }, p.look.night ? 0.2 : 0.55);
            break;
        }
    }
}

function wallPattern(p: Pen, kind: WallKind, c: string, trim: string, x: number, y: number, w: number, h: number): void {
    const u = p.u;
    p.rect(x, y, w, h).shadeFill(c, 0, y, 0, y + h, kind === 'hedge' ? 0.3 : 0.12);
    p.reseed(3);
    const x0 = Math.floor(x / u) * u;
    switch (kind) {
        case 'stripes':
            for (let sx = x0; sx < x + w; sx += 0.5 * u) p.rect(sx, y, 0.22 * u, h).fill(darken(c, 0.1));
            break;
        case 'dots':
            for (let sy = y + 0.25 * u, r = 0; sy < y + h; sy += 0.4 * u, r++) for (let sx = x0 + (r % 2) * 0.25 * u; sx < x + w; sx += 0.5 * u) p.ell(sx, sy, 0.06 * u, 0.06 * u).fill(darken(c, 0.2));
            break;
        case 'flowers':
            for (let sy = y + 0.35 * u, r = 0; sy < y + h; sy += 0.7 * u, r++) for (let sx = x0 + (r % 2) * 0.4 * u; sx < x + w; sx += 0.8 * u) {
                for (let k = 0; k < 4; k++) p.ell(sx + Math.cos(k * Math.PI / 2) * 0.08 * u, sy + Math.sin(k * Math.PI / 2) * 0.08 * u, 0.06 * u, 0.06 * u).fill(darken(c, 0.25));
                p.ell(sx, sy, 0.04 * u, 0.04 * u).fill(lighten(c, 0.4));
            }
            break;
        case 'panels':
            for (let sx = x0; sx < x + w; sx += 0.4 * u) p.line([[sx, y], [sx, y + h]], darken(c, 0.3), 0.6, 0.8);
            p.rect(x, y + h * 0.15, w, 0.06 * u).fill(darken(c, 0.2));
            break;
        case 'wainscot': {
            const mid = y + h * 0.55;
            p.rect(x, mid, w, y + h - mid).fill(trim);
            for (let sx = x0 + 0.1 * u; sx < x + w; sx += u) p.rect(sx, mid + 0.15 * u, 0.8 * u, y + h - mid - 0.4 * u).stroke(0.5);
            p.rect(x, mid - 0.06 * u, w, 0.12 * u).fill(lighten(trim, 0.2));
            break;
        }
        case 'brick':
            for (let sy = y + h, r = 0; sy > y; sy -= 0.25 * u, r++) {
                p.line([[x, sy], [x + w, sy]], lighten(c, 0.35), 0.5, 0.6);
                for (let sx = x0 + (r % 2 ? 0.25 * u : 0); sx < x + w; sx += 0.5 * u) p.line([[sx, sy - 0.25 * u], [sx, sy]], lighten(c, 0.35), 0.45, 0.55);
            }
            break;
        case 'stone':
            for (let sy = y + h, r = 0; sy > y - 0.4 * u; sy -= 0.4 * u, r++) {
                let sx = x0 - p.rnd() * 0.5 * u;
                while (sx < x + w) {
                    const bw = (0.5 + p.rnd() * 0.5) * u;
                    p.rr(sx + 0.03 * u, sy - 0.37 * u, bw - 0.06 * u, 0.34 * u, 0.06 * u).fill(p.rnd() < 0.5 ? lighten(c, 0.06) : darken(c, 0.06));
                    p.rr(sx + 0.03 * u, sy - 0.37 * u, bw - 0.06 * u, 0.34 * u, 0.06 * u).stroke(0.4);
                    sx += bw;
                }
            }
            break;
        case 'logs':
            for (let sy = y + h - 0.35 * u; sy > y - 0.35 * u; sy -= 0.35 * u) {
                p.rr(x - 0.1 * u, sy, w + 0.2 * u, 0.35 * u, 0.17 * u).fill(p.rnd() < 0.5 ? c : darken(c, 0.07));
                p.rr(x - 0.1 * u, sy, w + 0.2 * u, 0.35 * u, 0.17 * u).stroke(0.45);
            }
            break;
        case 'tiles':
            for (let sy = y + h; sy > y; sy -= 0.33 * u) p.line([[x, sy], [x + w, sy]], darken(c, 0.18), 0.5, 0.7);
            for (let sx = x0; sx < x + w; sx += 0.33 * u) p.line([[sx, y], [sx, y + h]], darken(c, 0.18), 0.5, 0.7);
            for (let sy = y + h - 0.3 * u; sy > y; sy -= 0.66 * u) for (let sx = x0 + 0.04 * u; sx < x + w; sx += 0.66 * u) p.rect(sx, sy, 0.12 * u, 0.05 * u).shine(0.4);
            break;
        case 'shoji': {
            /* Paper panes in a dark wooden lattice. */
            const wood = darken(c, 0.62);
            for (let sx = x0; sx < x + w; sx += 0.25 * u) p.line([[sx, y], [sx, y + h]], wood, Math.round((sx - x0) / u * 4) % 4 === 0 ? 1.6 : 0.6, 0.9);
            for (let sy = y + 0.3 * u; sy < y + h - 0.2 * u; sy += 0.3 * u) p.line([[x, sy], [x + w, sy]], wood, 0.6, 0.9);
            p.rect(x, y + h - 0.3 * u, w, 0.3 * u).fill(wood);
            break;
        }
        case 'hedge': {
            const n = Math.round(w * h / (u * u) * 30);
            for (let i = 0; i < n; i++) {
                const lx = x + p.rnd() * w, ly = y + p.rnd() * h;
                p.ell(lx, ly, 0.08 * u, 0.06 * u).fill(p.rnd() < 0.45 ? lighten(c, 0.16) : darken(c, 0.2));
            }
            return;
        }
        case 'fence':
            return;
    }
    /* A picture rail along the top. */
    p.rect(x, y + 0.12 * u, w, 0.07 * u).fill(darken(c, 0.25));
}

/* ------------------------------------------------------------ swatches */

const THUMBS = new Map<string, string>();

/** A small picture of a floor or a wallpaper, for the side panel. */
export function finishThumb(what: 'floor' | 'wall', kind: string, color: string, look: LookId | undefined, size = 44): string {
    const key = [what, kind, color, look ?? '', size].join('|');
    const hit = THUMBS.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const p = new Pen(ctx, size / 1.5, lookOf(look));
    if (what === 'floor') floorPattern(p, kind as FloorKind, color, size, size);
    else if (kind === 'fence') {
        floorPattern(p, 'grass', '#6aa84a', size, size);
        fencePickets(p, 0, size * 0.15, size, size * 0.15, size * 0.7, color);
    } else wallPattern(p, kind as WallKind, color, '#6a4a34', 0, 0, size, size);
    const url = c.toDataURL();
    THUMBS.set(key, url);
    return url;
}
