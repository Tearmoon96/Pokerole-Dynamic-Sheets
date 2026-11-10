import type { Pen } from './looks';
import { darken, lighten, mix } from './looks';
import { courses } from './medieval';

/* Walls and fences DRAWN as runs (owner's ask, 2026-11-10: "walls drawn in a
   circle" in the city builder, and fences, palisades, town walls and their
   gates for both kinds of town).

   A run is a line, a rectangle, a circle or an ellipse dragged on the map. It
   is stored as many short PIECES, each an ordinary placed thing with a `seg`
   (MapPlaced): so depth (a ring's far side behind the houses inside it, its
   near side in front), the picture, the table, undo, colours and the eraser
   all work as for any building. Pieces of one drag share a `run` id.

   Each piece is drawn by its item's RUN painter from its two ground points,
   in px: a solid wall is a slab (front face, the cap at its lower end, a top)
   in the oblique view the buildings use — a point at height z on the ground
   at (x, y) is drawn at (x, y - z) — and a fence is posts, rails and mesh.
   A wall seen end-on (running up the map) is only its top and its cap, as
   the turned castle wall always was. Solid pieces are lengthened by half
   their thickness at both ends so the pieces of a curve close their joints. */

export type Pt = [number, number];
export type RunPainter = (p: Pen, a: Pt, b: Pt, colors: string[], variant: number) => void;
export type RunShape = 'line' | 'rect' | 'circle' | 'ellipse';

/* ------------------------------------------------------------ geometry */

interface Frame { a: Pt; b: Pt; d: Pt; n: Pt; L: number }

/** The run's direction and the side of it facing the viewer (down the map). */
function frameOf(a: Pt, b: Pt): Frame {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6;
    const d: Pt = [dx / L, dy / L];
    let n: Pt = [-d[1], d[0]];
    if (n[1] < 0 || (n[1] === 0 && n[0] < 0)) n = [-n[0], -n[1]];
    return { a, b, d, n, L };
}
const add = (p: Pt, v: Pt, k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];
const up = (p: Pt, z: number): Pt => [p[0], p[1] - z];

/** The points of a run dragged from `a` to `b`, in cells. */
export function runPath(shape: RunShape, a: Pt, b: Pt): { pts: Pt[]; closed: boolean } | null {
    if (shape === 'line') return Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.25 ? null : { pts: [a, b], closed: false };
    if (shape === 'rect') {
        if (Math.abs(b[0] - a[0]) < 0.5 || Math.abs(b[1] - a[1]) < 0.5) return null;
        return { pts: [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]], closed: true };
    }
    /* A circle from its centre; an ellipse in the box dragged. */
    const [cx, cy, rx, ry] = shape === 'circle'
        ? [a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(b[0] - a[0], b[1] - a[1])]
        : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2];
    if (rx < 0.75 || ry < 0.75) return null;
    /* About a cell a piece: Ramanujan's perimeter. */
    const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const n = Math.max(8, Math.min(360, Math.round(per)));
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const t = -Math.PI / 2 + i * 2 * Math.PI / n;
        pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    return { pts, closed: true };
}

/** A run cut into pieces about `step` cells long (at most 400 of them). */
export function splitRun(pts: Pt[], closed: boolean, step = 1): [Pt, Pt][] {
    const out: [Pt, Pt][] = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n && out.length < 400; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
        for (let j = 0; j < k; j++) {
            out.push([
                [a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k],
                [a[0] + (b[0] - a[0]) * (j + 1) / k, a[1] + (b[1] - a[1]) * (j + 1) / k],
            ]);
        }
    }
    return out;
}

/** The outline a piece is drawn inside, in cells: what a press must hit. */
export function pieceHull(a: Pt, b: Pt, thick: number, h: number): Pt[] {
    const F = frameOf(a, b), t = thick / 2 + 0.08;
    const ea = add(a, F.d, -t), eb = add(b, F.d, t);
    const g = [add(ea, F.n, t), add(eb, F.n, t), add(eb, F.n, -t), add(ea, F.n, -t)];
    return hull([...g, ...g.map((q) => up(q, h))]);
}

function hull(pts: Pt[]): Pt[] {
    const s = [...pts].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: Pt[] = [], hi: Pt[] = [];
    for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of s.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/** Whether a wall piece from `a` to `b` lies under a gate from `g0` to `g1`
    (cells): its middle within the gate's length and close to its line. */
export function underGate(a: Pt, b: Pt, g0: Pt, g1: Pt, reach: number): boolean {
    const F = frameOf(g0, g1);
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const rel: Pt = [m[0] - g0[0], m[1] - g0[1]];
    const along = rel[0] * F.d[0] + rel[1] * F.d[1];
    const across = Math.abs(rel[0] * F.n[0] + rel[1] * F.n[1]);
    return along > -0.25 && along < F.L + 0.25 && across < reach;
}

/* -------------------------------------------------------------- slabs */

interface SlabStyle {
    face: string;
    top?: string;
    /** Pattern on the front face, drawn in the face's own plane: x along
        the run from 0 to L, y up from 0 (ground) to -z1, in px. */
    tex?: (p: Pen, L: number, z0: number, z1: number) => void;
    noTop?: boolean;
}

/** How much a face turned this way is in shadow: the light comes from the left. */
const turnShade = (n: Pt) => 0.04 + 0.14 * n[0];

/** A box standing on the line a→b (px): `t` thick, from height z0 to z1. */
function slab(p: Pen, a: Pt, b: Pt, t: number, z0: number, z1: number, s: SlabStyle): void {
    const F = frameOf(a, b), h = t / 2, ctx = p.ctx;
    const Af = add(a, F.n, h), Bf = add(b, F.n, h), Ab = add(a, F.n, -h), Bb = add(b, F.n, -h);
    if (F.n[1] > 0.04) {
        const quad = [up(Af, z1), up(Bf, z1), up(Bf, z0), up(Af, z0)];
        p.poly(quad).shadeFill(s.face, 0, Math.min(Af[1], Bf[1]) - z1, 0, Math.max(Af[1], Bf[1]) - z0, 0.18);
        if (s.tex) {
            ctx.save();
            p.poly(quad);
            ctx.clip();
            ctx.transform(F.d[0], F.d[1], 0, 1, Af[0], Af[1]);
            s.tex(p, F.L, z0, z1);
            ctx.restore();
        }
        const k = turnShade(F.n);
        if (k > 0.09) p.poly(quad).shade(k);
        else if (k < 0.02) p.poly(quad).shine(0.08);
        p.line([up(Af, z0), up(Bf, z0)], null, 0.9);
        p.line([up(Af, z1), up(Af, z0)], null, 0.6, 0.35);
        p.line([up(Bf, z1), up(Bf, z0)], null, 0.6, 0.35);
    }
    if (Math.abs(F.d[1]) > 0.04) {
        /* The end facing the viewer. */
        const E = F.d[1] > 0 ? b : a;
        const quad = [up(add(E, F.n, -h), z1), up(add(E, F.n, h), z1), up(add(E, F.n, h), z0), up(add(E, F.n, -h), z0)];
        p.poly(quad).fill(darken(s.face, 0.08));
        if (s.tex && t > p.u * 0.3) {
            ctx.save();
            p.poly(quad);
            ctx.clip();
            ctx.transform(1, 0, 0, 1, quad[3][0], quad[3][1]);
            s.tex(p, t, z0, z1);
            ctx.restore();
        }
        p.poly(quad).shade(0.22);
        p.poly(quad).stroke(0.8);
    }
    if (!s.noTop) {
        p.poly([up(Ab, z1), up(Bb, z1), up(Bf, z1), up(Af, z1)]).fill(s.top ?? lighten(s.face, 0.1));
        p.line([up(Ab, z1), up(Bb, z1)], null, 0.9);
        p.line([up(Af, z1), up(Bf, z1)], null, 0.9);
    }
}

/** A solid run's piece, lengthened to close the joints of a curve. */
function long(a: Pt, b: Pt, t: number): [Pt, Pt, Frame] {
    const F = frameOf(a, b);
    const e = Math.min(t / 2, F.L * 0.5);
    return [add(a, F.d, -e), add(b, F.d, e), F];
}

/** Small boxes along both edges of a wall's top: battlements. */
function merlonRows(p: Pen, a: Pt, b: Pt, t: number, z: number, hex: string, F: Frame): void {
    const u = p.u, mw = 0.38 * u, gap = 0.3 * u, mt = Math.min(0.24 * u, t * 0.3), mh = 0.38 * u;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const side of [-1, 1]) {
        const off = side * (t / 2 - mt / 2);
        for (let s = 0.1 * u; s + mw <= L - 0.05 * u; s += mw + gap) {
            slab(p, add(add(a, F.d, s), F.n, off), add(add(a, F.d, s + mw), F.n, off), mt, z, z + mh, { face: hex, top: lighten(hex, 0.14) });
        }
    }
}

/* -------------------------------------------------------- face patterns */

const stoneTex = (hex: string) => (p: Pen, L: number, z0: number, z1: number) => courses(p, 0, -z1, L, z1 - z0, hex);

/** Big, even blocks: ashlar. */
const ashlarTex = (hex: string) => (p: Pen, L: number, z0: number, z1: number) => {
    const u = p.u, rh = 0.5 * u;
    for (let y = -z0, row = 0; y > -z1; y -= rh, row++) {
        p.line([[0, y], [L, y]], darken(hex, 0.3), 0.6, 0.6);
        for (let x = (row % 2 ? 0.45 : 0) * u; x < L; x += 0.9 * u) p.line([[x, y - rh], [x, y]], darken(hex, 0.3), 0.55, 0.55);
        p.rect(0, y - rh, L, 0.06 * u).shine(0.12);
    }
};

const brickTex = (hex: string) => (p: Pen, L: number, z0: number, z1: number) => {
    const u = p.u, rh = 0.18 * u;
    for (let y = -z0, row = 0; y > -z1; y -= rh, row++) {
        p.line([[0, y], [L, y]], lighten(hex, 0.35), 0.45, 0.55);
        for (let x = (row % 2 ? 0.2 : 0) * u; x < L; x += 0.4 * u) p.line([[x, y - rh], [x, y]], lighten(hex, 0.35), 0.4, 0.5);
    }
};

const panelTex = (hex: string) => (p: Pen, L: number, z0: number, z1: number) => {
    const u = p.u;
    for (let x = 1.0 * u; x < L; x += 1.0 * u) p.line([[x, -z1], [x, -z0]], darken(hex, 0.25), 0.6, 0.6);
    p.line([[0, -(z0 + z1) / 2], [L, -(z0 + z1) / 2]], darken(hex, 0.15), 0.4, 0.4);
};

const plankTex = (hex: string, across = false) => (p: Pen, L: number, z0: number, z1: number) => {
    const u = p.u;
    p.reseed(Math.round(L * 7 + z1));
    if (across) {
        for (let y = -z0 - 0.22 * u; y > -z1; y -= 0.22 * u) {
            p.line([[0, y], [L, y]], darken(hex, 0.3), 0.6, 0.7);
            p.rect(0, y, L, 0.05 * u).shine(0.1);
        }
        return;
    }
    for (let x = 0.24 * u; x < L; x += 0.24 * u) {
        p.line([[x, -z1], [x, -z0]], darken(hex, 0.3), 0.6, 0.7);
        if (p.rnd() < 0.3) p.line([[x - 0.12 * u, -z1 + (0.3 + p.rnd()) * u], [x - 0.08 * u, -z1 + (0.5 + p.rnd()) * u]], darken(hex, 0.2), 0.4, 0.6);
    }
};

/* --------------------------------------------------------- solid walls */

/** The castle wall drawn as a run: battlements (v0), torches (v1), ruined (v2). */
export const castleRun: RunPainter = (p, a0, b0, [stone], v) => {
    const u = p.u, t = 0.9 * u;
    const [a, b, F] = long(a0, b0, t);
    p.reseed(Math.round(a0[0] * 13 + a0[1] * 7));
    if (v === 2) {
        const z = (1.1 + p.rnd() * 1.1) * u;
        slab(p, a, b, t, 0, z, { face: stone, top: darken(stone, 0.05), tex: stoneTex(stone) });
        const m = add(a0, F.d, F.L * p.rnd());
        if (p.rnd() < 0.6) p.ell(m[0], m[1] - z + 0.15 * u, 0.32 * u, 0.2 * u).fill('#4a7a3a');
        const f = add(add(a0, F.d, F.L * p.rnd()), F.n, t / 2 + 0.15 * u);
        p.rr(f[0] - 0.18 * u, f[1] - 0.18 * u, 0.36 * u, 0.22 * u, 0.06 * u).paint(stone, 0.5);
        return;
    }
    slab(p, a, b, t, 0, 2.3 * u, { face: stone, top: darken(stone, 0.12), tex: stoneTex(stone) });
    merlonRows(p, a, b, t, 2.3 * u, stone, F);
    if (v === 1 && F.n[1] > 0.4 && p.rnd() < 0.45) {
        const m = add(add(a0, F.d, F.L / 2), F.n, t / 2);
        const ty = m[1] - 1.5 * u;
        p.line([[m[0], ty + 0.2 * u], [m[0], ty + 0.75 * u]], '#3a3430', 1.6);
        p.ell(m[0], ty + 0.05 * u, 0.12 * u, 0.2 * u).fill('#f0a030');
        p.ell(m[0], ty + 0.1 * u, 0.06 * u, 0.1 * u).fill('#fff0b0');
        p.glow(m[0], ty, 1.8 * u);
    }
};

/** A town wall without battlements: granite ashlar (v0), fieldstone (v1), old and mossy (v2). */
export const townRun: RunPainter = (p, a0, b0, [stone], v) => {
    const u = p.u, t = 0.8 * u, z = 2.1 * u;
    const [a, b, F] = long(a0, b0, t);
    slab(p, a, b, t, 0, z, { face: stone, top: lighten(stone, 0.12), tex: v === 0 ? ashlarTex(stone) : stoneTex(stone) });
    /* A coping of bigger stones along the top. */
    slab(p, a, b, t + 0.14 * u, z, z + 0.16 * u, { face: lighten(stone, 0.06), top: lighten(stone, 0.18) });
    if (v === 2) {
        p.reseed(Math.round(a0[0] * 17 + a0[1] * 3));
        for (let i = 0; i < 3; i++) {
            const m = add(add(a0, F.d, F.L * p.rnd()), F.n, t / 2);
            if (F.n[1] > 0.2) p.ell(m[0], m[1] - (0.3 + p.rnd() * 1.4) * u, (0.18 + p.rnd() * 0.2) * u, 0.16 * u).fill('#5a8a44');
            else p.ell(m[0], m[1] - z, 0.2 * u, 0.14 * u).fill('#5a8a44');
        }
    }
};

/** The low fieldstone wall drawn as a run; v1 a row of stakes. */
export const lowRun: RunPainter = (p, a0, b0, c, v) => {
    const u = p.u;
    if (v === 1) { stakes(p, a0, b0, c[0], 1.3 * u, 0.24 * u, 0.26 * u, false); return; }
    const t = 0.5 * u, z = 0.75 * u;
    const [a, b] = long(a0, b0, t);
    slab(p, a, b, t, 0, z, { face: c[0], top: lighten(c[0], 0.12), tex: stoneTex(c[0]) });
};

/** A hedge drawn as a run. */
export const hedgeRun: RunPainter = (p, a0, b0, [leaf]) => {
    const u = p.u, t = 0.75 * u, z = 0.95 * u;
    const [a, b, F] = long(a0, b0, t);
    slab(p, a, b, t, 0, z, { face: darken(leaf, 0.1), top: leaf });
    p.reseed(Math.round(a0[0] * 11 + a0[1] * 5));
    for (let s = 0.15 * u; s < F.L; s += 0.3 * u) {
        const m = up(add(add(a0, F.d, s), F.n, (p.rnd() - 0.5) * t * 0.6), z);
        p.ell(m[0], m[1], 0.2 * u, 0.15 * u).fill(p.rnd() < 0.5 ? lighten(leaf, 0.12) : leaf);
    }
};

/** A garden wall: brick (v0), concrete panels (v1), rendered (v2), each with a coping. */
export const gardenRun: RunPainter = (p, a0, b0, [wall, coping], v) => {
    const u = p.u, t = 0.32 * u, z = 1.15 * u;
    const [a, b] = long(a0, b0, t);
    slab(p, a, b, t, 0, z, { face: wall, tex: v === 0 ? brickTex(wall) : v === 1 ? panelTex(wall) : undefined });
    slab(p, a, b, t + 0.12 * u, z, z + 0.12 * u, { face: coping, top: lighten(coping, 0.12) });
};

/** Boards: tall privacy boards (v0), horizontal slats (v1), weathered (v2). */
export const boardRun: RunPainter = (p, a0, b0, [wood], v) => {
    const u = p.u, t = 0.12 * u, z = 1.65 * u;
    const [a, b, F] = long(a0, b0, t);
    const hex = v === 2 ? mix(wood, '#8a8478', 0.5) : wood;
    slab(p, a, b, t, 0.05 * u, z, { face: hex, tex: plankTex(hex, v === 1) });
    for (const s of [0, F.L]) post(p, add(a0, F.d, s), z + 0.08 * u, 0.16 * u, darken(hex, 0.15));
};

/* ---------------------------------------------------- posts and stakes */

/** An upright seen from the slant: a box `w` wide and `h` tall on a ground point. */
function post(p: Pen, g: Pt, h: number, w: number, hex: string, cap = false): void {
    const u = p.u;
    p.rect(g[0] - w / 2, g[1] - h, w, h).shadeFill(hex, g[0] - w / 2, 0, g[0] + w / 2, 0, 0.3).stroke(0.7);
    p.rect(g[0] - w / 2, g[1] - h, w, Math.min(w * 0.5, 0.08 * u)).fill(lighten(hex, 0.15));
    if (cap) p.rr(g[0] - w * 0.7, g[1] - h - 0.06 * u, w * 1.4, 0.1 * u, 0.04 * u).paint(darken(hex, 0.1), 0.6);
}

/** Uprights along the run, back to front: logs, stakes, pickets. */
function stakes(p: Pen, a: Pt, b: Pt, hex: string, h: number, w: number, step: number, round: boolean): void {
    const u = p.u, F = frameOf(a, b);
    const n = Math.max(1, Math.round(F.L / step));
    const xs = Array.from({ length: n }, (_, i) => (i + 0.5) * F.L / n);
    if (F.d[1] < 0) xs.reverse();
    p.reseed(Math.round(a[0] * 3 + a[1] * 19));
    for (const s of xs) {
        const g = add(a, F.d, s);
        const hh = h * (0.92 + p.rnd() * 0.12);
        const x = g[0] - w / 2, top = g[1] - hh;
        if (round) p.rr(x, top + w * 0.4, w, hh - w * 0.4, [0, 0, w / 2, w / 2]);
        else p.rect(x, top + w * 0.4, w, hh - w * 0.4);
        p.shadeFill(hex, x, 0, x + w, 0, round ? 0.4 : 0.25).stroke(0.7);
        p.poly([[x, top + w * 0.42], [g[0], top - 0.06 * u], [x + w, top + w * 0.42]]).paint(lighten(hex, round ? 0.18 : 0.06), 0.6);
        if (round) p.line([[x + w * 0.3, top + w * 0.6], [x + w * 0.3, g[1] - 0.1 * u]], '#ffffff', 0.6, p.look.shading === 'hatch' ? 0 : 0.25);
    }
}

/** A wire or rail from one raised end of the piece to the other. */
function rail(p: Pen, a: Pt, b: Pt, z: number, hex: string, width: number, off: Pt = [0, 0]): void {
    p.line([[a[0] + off[0], a[1] + off[1] - z], [b[0] + off[0], b[1] + off[1] - z]], hex, width);
}

/** A panel in the run's own plane, from height z0 to z1: mesh, bars. */
function inPlane(p: Pen, a: Pt, b: Pt, z0: number, z1: number, draw: (L: number) => void): void {
    const F = frameOf(a, b), ctx = p.ctx;
    if (Math.abs(F.d[0]) < 0.12) return;
    ctx.save();
    p.poly([up(a, z1), up(b, z1), up(b, z0), up(a, z0)]);
    ctx.clip();
    ctx.transform(F.d[0], F.d[1], 0, 1, a[0], a[1]);
    draw(F.L);
    ctx.restore();
}

/* --------------------------------------------------------------- fences */

/** The picket fence drawn as a run. */
export const picketRun: RunPainter = (p, a, b, [wood]) => {
    const u = p.u, F = frameOf(a, b);
    for (const z of [0.42, 0.74]) rail(p, a, b, z * u, darken(wood, 0.12), 2.6);
    stakes(p, a, b, wood, 1.02 * u, 0.18 * u, 0.42 * u, false);
    for (const s of [0, F.L]) post(p, add(a, F.d, s), 1.1 * u, 0.16 * u, darken(wood, 0.06));
};

/** A wooden rail fence (a staccionata): two rails (v0), three (v1), crossed (v2). */
export const railRun: RunPainter = (p, a, b, [wood, posts], v) => {
    const u = p.u, F = frameOf(a, b), h = 1.1 * u;
    const zs = v === 1 ? [0.3, 0.62, 0.94] : [0.42, 0.88];
    if (v === 2) {
        p.line([up(a, 0.15 * u), up(b, 0.95 * u)], wood, 3);
        p.line([up(a, 0.95 * u), up(b, 0.15 * u)], wood, 3);
        rail(p, a, b, 0.98 * u, wood, 3.2);
    } else {
        for (const z of zs) { rail(p, a, b, z * u, darken(wood, 0.35), 4.2); rail(p, a, b, z * u, wood, 2.8); }
    }
    for (const s of [0, F.L]) post(p, add(a, F.d, s), h, 0.2 * u, posts);
};

/** Chain-link: plain (v0), barbed wire along the top (v1), green coated (v2). */
export const chainRun: RunPainter = (p, a, b, [mesh, posts], v) => {
    const u = p.u, F = frameOf(a, b), h = 1.6 * u;
    const ctx = p.ctx;
    ctx.save();
    ctx.globalAlpha *= 0.14;
    p.poly([up(a, h), up(b, h), up(b, 0.04 * u), up(a, 0.04 * u)]).fill(mesh);
    ctx.restore();
    inPlane(p, a, b, 0.04 * u, h, (L) => {
        for (let x = -h; x < L + h; x += 0.17 * u) {
            p.line([[x, 0], [x + h, -h]], mesh, 0.5, 0.75);
            p.line([[x, -h], [x + h, 0]], mesh, 0.5, 0.75);
        }
    });
    rail(p, a, b, h, posts, 1.8);
    rail(p, a, b, 0.05 * u, posts, 0.9);
    if (v === 1) {
        for (const z of [0.15, 0.32]) wire(p, a, b, h + z * u, '#6a6a6a');
    }
    for (const s of [0, F.L]) post(p, add(a, F.d, s), h + (v === 1 ? 0.4 * u : 0.05 * u), 0.1 * u, posts, true);
};

/** One strand of barbed wire with its barbs. */
function wire(p: Pen, a: Pt, b: Pt, z: number, hex: string): void {
    const u = p.u, F = frameOf(a, b);
    rail(p, a, b, z, hex, 0.9);
    for (let s = 0.12 * u; s < F.L; s += 0.28 * u) {
        const g = up(add(a, F.d, s), z);
        p.line([[g[0] - 0.05 * u, g[1] - 0.06 * u], [g[0] + 0.05 * u, g[1] + 0.06 * u]], hex, 0.7);
        p.line([[g[0] + 0.05 * u, g[1] - 0.06 * u], [g[0] - 0.05 * u, g[1] + 0.06 * u]], hex, 0.7);
    }
}

/** Barbed wire: on wooden posts (v0), on metal posts (v1), a concertina coil (v2). */
export const barbedRun: RunPainter = (p, a, b, [wireC, posts], v) => {
    const u = p.u, F = frameOf(a, b);
    if (v === 2) {
        /* Loops of razor wire on the ground, seen from the slant. */
        const n = Math.max(2, Math.round(F.L / (0.32 * u)));
        for (let i = 0; i <= n; i++) {
            const g = add(a, F.d, F.L * i / n);
            p.ell(g[0], g[1] - 0.42 * u, 0.4 * u * Math.max(0.35, Math.abs(F.d[0])) + 0.1 * u, 0.42 * u).stroke(0.4);
            p.ctx.save();
            p.ctx.strokeStyle = p.c(wireC);
            p.ctx.lineWidth = Math.max(1, u * 0.025);
            p.ctx.stroke();
            p.ctx.restore();
        }
        for (const s of [0, F.L]) post(p, add(a, F.d, s), 0.5 * u, 0.08 * u, posts);
        return;
    }
    for (const z of [0.35, 0.65, 0.95, 1.22]) wire(p, a, b, z * u, wireC);
    for (const s of [0, F.L]) post(p, add(a, F.d, s), 1.3 * u, v === 1 ? 0.09 * u : 0.15 * u, posts, v === 1);
};

/** Iron railings: spear tops (v0), on a low wall (v1), with scrolls (v2). */
export const railingsRun: RunPainter = (p, a, b, [iron, base], v) => {
    const u = p.u, F = frameOf(a, b);
    let z0 = 0;
    if (v === 1) {
        const t = 0.34 * u;
        const [ea, eb] = long(a, b, t);
        slab(p, ea, eb, t, 0, 0.5 * u, { face: base, top: lighten(base, 0.12), tex: brickTex(base) });
        z0 = 0.5 * u;
    }
    const h = (v === 1 ? 1.0 : 1.5) * u;
    rail(p, a, b, z0 + 0.12 * u, iron, 1.5);
    rail(p, a, b, z0 + h - 0.15 * u, iron, 1.5);
    const n = Math.max(1, Math.round(F.L / (0.17 * u)));
    for (let i = 0; i < n; i++) {
        const g = add(a, F.d, (i + 0.5) * F.L / n);
        p.line([up(g, z0 + 0.04 * u), up(g, z0 + h)], iron, 1.3);
        const tip = up(g, z0 + h);
        p.poly([[tip[0], tip[1] - 0.14 * u], [tip[0] + 0.05 * u, tip[1] - 0.02 * u], [tip[0], tip[1] + 0.03 * u], [tip[0] - 0.05 * u, tip[1] - 0.02 * u]]).fill(v === 2 ? '#c8a040' : iron);
        if (v === 2 && i % 2 === 0) {
            const c = up(g, z0 + h - 0.36 * u);
            p.ell(c[0], c[1], 0.07 * u, 0.09 * u).stroke(0.6);
        }
    }
    for (const s of [0, F.L]) post(p, add(a, F.d, s), z0 + h + 0.05 * u, 0.12 * u, iron, true);
};

/** A palisade: sharpened logs (v0), bound with beams (v1), a plank wall (v2). */
export const palisadeRun: RunPainter = (p, a, b, [logs], v) => {
    const u = p.u, F = frameOf(a, b);
    if (v === 2) {
        const t = 0.3 * u, z = 2.1 * u;
        const [ea, eb] = long(a, b, t);
        slab(p, ea, eb, t, 0, z, { face: logs, tex: plankTex(logs) });
        for (const s of [0, F.L]) post(p, add(a, F.d, s), z + 0.15 * u, 0.24 * u, darken(logs, 0.15));
        return;
    }
    stakes(p, a, b, logs, 2.3 * u, 0.32 * u, 0.29 * u, true);
    if (v === 1) {
        const off: Pt = [F.n[0] * 0.17 * u, F.n[1] * 0.17 * u];
        for (const z of [0.55, 1.75]) { rail(p, a, b, z * u, darken(logs, 0.4), 4, off); rail(p, a, b, z * u, darken(logs, 0.12), 2.6, off); }
    }
};

/* ---------------------------------------------------------------- gates */

/** A wooden gate: double plank doors (v0), a palisade gate under a lintel (v1), a farm gate (v2). */
export const woodGateRun: RunPainter = (p, a, b, [wood, iron], v) => {
    const u = p.u, F = frameOf(a, b);
    if (v === 2) {
        const h = 1.1 * u;
        for (const z of [0.2, 0.55, 0.9]) rail(p, a, b, z * u, wood, 2.8);
        p.line([up(add(a, F.d, 0.1 * u), 0.2 * u), up(add(b, F.d, -0.1 * u), 0.9 * u)], wood, 2.6);
        for (const s of [0, F.L]) post(p, add(a, F.d, s), h + 0.1 * u, 0.24 * u, darken(wood, 0.1), true);
        return;
    }
    const h = (v === 1 ? 2.2 : 1.8) * u, pw = 0.36 * u;
    const ia = add(a, F.d, pw * 0.6), ib = add(b, F.d, -pw * 0.6);
    const mid = add(a, F.d, F.L / 2);
    const leaf = (x0: Pt, x1: Pt) => slab(p, x0, x1, 0.1 * u, 0.05 * u, h, {
        face: wood,
        tex: (q, L) => {
            plankTex(wood)(q, L, 0.05 * u, h);
            q.line([[0.08 * u, -0.35 * u], [L - 0.08 * u, -0.35 * u]], darken(wood, 0.35), 2.2);
            q.line([[0.08 * u, -h + 0.35 * u], [L - 0.08 * u, -h + 0.35 * u]], darken(wood, 0.35), 2.2);
            q.line([[0.12 * u, -0.4 * u], [L - 0.12 * u, -h + 0.4 * u]], darken(wood, 0.35), 2);
            for (const x of [0.15 * u, L - 0.15 * u]) q.line([[x, -0.35 * u], [x, -h + 0.35 * u]], iron, 0.8);
        },
    });
    leaf(ia, mid);
    leaf(mid, ib);
    if (v === 1) {
        /* Pointed tops over the doors, and a lintel between tall posts. */
        stakes(p, ia, ib, wood, h + 0.3 * u, 0.2 * u, 0.22 * u, true);
        for (const z of [0.45 * u, h - 0.35 * u]) rail(p, ia, ib, z, iron, 2.2);
        for (const s of [0, F.L]) post(p, add(a, F.d, s), 3.0 * u, pw, darken(wood, 0.12));
        const t = 0.4 * u;
        const [ea, eb] = long(a, b, t);
        slab(p, ea, eb, t, 2.65 * u, 2.95 * u, { face: darken(wood, 0.1), top: wood });
        return;
    }
    for (const s of [0, F.L]) post(p, add(a, F.d, s), h + 0.3 * u, pw, darken(wood, 0.12), true);
};

/** A stone gate in a wall: arched with wooden doors (v0), a portcullis (v1), an open arch (v2). */
export const stoneGateRun: RunPainter = (p, a, b, [stone, doors, banner], v) => {
    const u = p.u, F = frameOf(a, b), t = 0.9 * u, H = 2.9 * u, pier = Math.min(0.9 * u, F.L * 0.25);
    const ea = add(a, F.d, -t / 2), eb = add(b, F.d, t / 2);
    slab(p, add(a, F.d, pier), add(b, F.d, -pier), t * 0.92, 0, H - 0.2 * u, {
        face: stone, top: darken(stone, 0.12),
        tex: (q, L, z0, z1) => {
            courses(q, 0, -z1, L, z1 - z0, stone);
            /* The arch and what fills it. */
            const aw = Math.min(L - 0.2 * u, 1.9 * u), ax = (L - aw) / 2, ah = Math.min(z1 - 0.35 * u, 2.2 * u);
            q.rr(ax - 0.12 * u, -ah - 0.12 * u, aw + 0.24 * u, ah + 0.12 * u, [aw / 2 + 0.12 * u, aw / 2 + 0.12 * u, 0, 0]).fill(lighten(stone, 0.1)).stroke(0.8);
            q.rr(ax, -ah, aw, ah, [aw / 2, aw / 2, 0, 0]).fill('#2a2420').stroke(0.8);
            if (v === 0) {
                q.rr(ax + 0.06 * u, -ah + 0.06 * u, aw - 0.12 * u, ah - 0.06 * u, [aw / 2, aw / 2, 0, 0]).shadeFill(doors, ax, 0, ax + aw, 0, 0.3).stroke(0.7);
                for (let x = ax + 0.22 * u; x < ax + aw - 0.1 * u; x += 0.22 * u) q.line([[x, -ah + 0.1 * u], [x, 0]], null, 0.4, 0.5);
                q.line([[ax + aw / 2, -ah + 0.06 * u], [ax + aw / 2, 0]], null, 1);
                for (const y of [-0.45 * u, -ah + 0.6 * u]) q.line([[ax + 0.06 * u, y], [ax + aw - 0.06 * u, y]], '#3a3430', 1.2);
            } else if (v === 1) {
                for (let x = ax + 0.15 * u; x < ax + aw; x += 0.26 * u) q.line([[x, -ah], [x, -ah * 0.4]], doors, 1.4);
                for (let y = -ah + 0.2 * u; y < -ah * 0.4; y += 0.26 * u) q.line([[ax, y], [ax + aw, y]], doors, 1.4);
                for (let x = ax + 0.15 * u; x < ax + aw; x += 0.26 * u) q.poly([[x - 0.05 * u, -ah * 0.4], [x, -ah * 0.4 + 0.12 * u], [x + 0.05 * u, -ah * 0.4]]).fill(doors);
            } else {
                q.rr(ax + 0.1 * u, -0.5 * u, aw - 0.2 * u, 0.5 * u, 0).fill('#6a6050');
            }
        },
    });
    /* A pier at each end, taller, with battlements and a banner. */
    for (const [x0, x1] of [[ea, add(a, F.d, pier)], [add(b, F.d, -pier), eb]] as [Pt, Pt][]) {
        slab(p, x0, x1, t * 1.15, 0, H + 0.3 * u, { face: stone, top: darken(stone, 0.12), tex: stoneTex(stone) });
        const G = frameOf(x0, x1);
        merlonRows(p, x0, x1, t * 1.15, H + 0.3 * u, stone, G);
        if (F.n[1] > 0.4) {
            const m = add(add(x0, G.d, G.L / 2), F.n, t * 0.6);
            const y = m[1] - H + 0.2 * u;
            p.rect(m[0] - 0.22 * u, y, 0.44 * u, 0.06 * u).fill('#5a3a24');
            p.poly([[m[0] - 0.2 * u, y], [m[0] + 0.2 * u, y], [m[0] + 0.2 * u, y + 0.9 * u], [m[0], y + 0.72 * u], [m[0] - 0.2 * u, y + 0.9 * u]])
                .shadeFill(banner, m[0] - 0.2 * u, 0, m[0] + 0.2 * u, 0, 0.3).stroke(0.6);
        }
    }
};

/** A metal gate: an iron double gate (v0), a chain-link gate (v1), a barrier arm (v2). */
export const metalGateRun: RunPainter = (p, a, b, [metal, pillars], v) => {
    const u = p.u, F = frameOf(a, b);
    if (v === 2) {
        const g = add(a, F.d, 0.25 * u);
        slab(p, add(g, F.d, -0.2 * u), add(g, F.d, 0.2 * u), 0.4 * u, 0, 1.0 * u, { face: pillars, top: lighten(pillars, 0.15) });
        const n = Math.max(2, Math.round(F.L / (0.35 * u)));
        for (let i = 0; i < n; i++) {
            const s0 = 0.25 * u + (F.L - 0.25 * u) * i / n, s1 = 0.25 * u + (F.L - 0.25 * u) * (i + 1) / n;
            p.line([up(add(a, F.d, s0), 0.85 * u), up(add(a, F.d, s1), 0.85 * u)], i % 2 ? '#f4f0e6' : metal, 3.2);
        }
        post(p, add(b, F.d, -0.05 * u), 0.8 * u, 0.08 * u, pillars);
        return;
    }
    const h = 1.7 * u;
    if (v === 1) {
        inPlane(p, add(a, F.d, 0.1 * u), add(b, F.d, -0.1 * u), 0.08 * u, h - 0.05 * u, (L) => {
            for (let x = -h; x < L + h; x += 0.17 * u) {
                p.line([[x, 0], [x + h, -h]], metal, 0.5, 0.7);
                p.line([[x, -h], [x + h, 0]], metal, 0.5, 0.7);
            }
        });
        const m = add(a, F.d, F.L / 2);
        for (const [x0, x1] of [[a, m], [m, b]] as [Pt, Pt][]) {
            for (const z of [0.08 * u, h - 0.05 * u]) rail(p, x0, x1, z, pillars, 1.6);
            p.line([up(x0, 0.08 * u), up(x1, h - 0.05 * u)], pillars, 1.2);
        }
        for (const s of [0, F.L / 2, F.L]) post(p, add(a, F.d, s), h + 0.1 * u, 0.1 * u, pillars, true);
        return;
    }
    /* Iron bars rising to a curve in the middle, between brick pillars. */
    const n = Math.max(2, Math.round(F.L / (0.16 * u)));
    rail(p, a, b, 0.15 * u, metal, 1.6);
    for (let i = 0; i < n; i++) {
        const s = (i + 0.5) * F.L / n, k = Math.sin(Math.PI * s / F.L);
        const g = add(a, F.d, s), top = h - 0.3 * u + k * 0.45 * u;
        p.line([up(g, 0.1 * u), up(g, top)], metal, 1.3);
        const tip = up(g, top);
        p.poly([[tip[0], tip[1] - 0.12 * u], [tip[0] + 0.04 * u, tip[1]], [tip[0] - 0.04 * u, tip[1]]]).fill(metal);
    }
    const arch: Pt[] = [];
    for (let i = 0; i <= 12; i++) { const s = F.L * i / 12; arch.push(up(add(a, F.d, s), h - 0.45 * u + Math.sin(Math.PI * i / 12) * 0.45 * u)); }
    p.line(arch, metal, 1.6);
    p.line([up(add(a, F.d, F.L / 2), 0.1 * u), up(add(a, F.d, F.L / 2), h + 0.1 * u)], metal, 1.6);
    for (const s of [0, F.L]) {
        const g = add(a, F.d, s);
        slab(p, add(g, F.d, -0.22 * u), add(g, F.d, 0.22 * u), 0.44 * u, 0, h + 0.25 * u, { face: pillars, top: lighten(pillars, 0.2), tex: brickTex(pillars) });
        const c = up(g, h + 0.25 * u);
        p.ell(c[0], c[1] - 0.12 * u, 0.13 * u, 0.13 * u).paint(lighten(pillars, 0.25), 0.6);
    }
};

/** A run drawn straight across an item's sprite: the palette's picture. */
export function sampleRun(run: RunPainter, thick: number) {
    return (p: Pen, r: { x: number; y: number; w: number; h: number }, c: string[], _rot: boolean, v: number) => {
        const u = p.u, y = r.y + r.h - Math.max(0.5, thick / 2 + 0.1) * u;
        run(p, [r.x + (thick / 2 + 0.2) * u, y], [r.x + r.w - (thick / 2 + 0.2) * u, y], c, v);
    };
}
