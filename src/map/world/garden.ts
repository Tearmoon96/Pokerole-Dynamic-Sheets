import type { Pen, Rect } from './looks';
import { darken, lighten } from './looks';
import { rock, tree } from './props';

/* Nature and garden things (2026-11-10, the owner's request: gardens and
   ponds inside an interior — grass, plants, trees, bushes, rocks, flowers,
   everything a pond needs). Same rules as props.ts: `r` is the sprite in
   px, its bottom edge the front of the footprint; colours only through the
   Pen, so the four looks apply. */

/** A curved stalk or blade, from its foot up to its tip. */
function stalk(p: Pen, x0: number, y0: number, x1: number, y1: number, bend: number, hex: string, width: number): void {
    const ctx = p.ctx;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
    ctx.strokeStyle = p.c(hex);
    ctx.lineWidth = Math.max(1, p.u * p.look.line * width);
    ctx.lineCap = 'round';
    ctx.stroke();
}

/** A ball of leaves, lit from the top left. */
function ball(p: Pen, cx: number, cy: number, rx: number, ry: number, hex: string): void {
    p.ell(cx, cy, rx, ry).shadeFill(hex, cx - rx, cy - ry, cx + rx * 0.6, cy + ry, 0.3).stroke();
    p.ell(cx - rx * 0.3, cy - ry * 0.35, rx * 0.35, ry * 0.25).shine(0.25);
}

/* ----------------------------------------------------------------- water */

/** A lily pad: a disc with its notch, and its veins. */
function pad(p: Pen, cx: number, cy: number, rx: number, a: number, hex: string): void {
    const ctx = p.ctx, ry = rx * 0.62;
    p.ell(cx, cy, rx, ry);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, a + 0.32, a + Math.PI * 2 - 0.32);
    ctx.closePath();
    p.shadeFill(hex, cx - rx, cy - ry, cx + rx, cy + ry, 0.25).stroke(0.7);
    for (let k = 1; k < 6; k++) {
        const t = a + k * Math.PI / 3;
        p.line([[cx, cy], [cx + Math.cos(t) * rx * 0.75, cy + Math.sin(t) * ry * 0.75]], darken(hex, 0.25), 0.4, 0.6);
    }
}

function waterFlower(p: Pen, cx: number, cy: number, s: number, hex: string): void {
    const ctx = p.ctx;
    for (let k = 0; k < 8; k++) {
        const t = k / 8 * Math.PI * 2;
        ctx.save();
        ctx.translate(cx + Math.cos(t) * s * 0.5, cy + Math.sin(t) * s * 0.3);
        ctx.rotate(t);
        p.ell(0, 0, s * 0.45, s * 0.18).fill(k % 2 ? hex : lighten(hex, 0.25)).stroke(0.4);
        ctx.restore();
    }
    p.ell(cx, cy - s * 0.1, s * 0.22, s * 0.16).fill('#f0d040').stroke(0.4);
}

export function lilyPads(p: Pen, r: Rect, [leaf, flower]: string[], _rot = false, v = 0): void {
    const u = p.u;
    const at = (fx: number, fy: number): [number, number] => [r.x + r.w * fx, r.y + r.h * fy];
    if (v === 2) {
        /* Lotus: two pads and one tall flower. */
        pad(p, ...at(0.3, 0.62), 0.3 * u, 0.4, leaf);
        pad(p, ...at(0.72, 0.4), 0.24 * u, 2.2, darken(leaf, 0.06));
        const [fx, fy] = at(0.55, 0.62);
        p.line([[fx, fy + 0.05 * u], [fx, fy - 0.2 * u]], darken(leaf, 0.2), 1.2);
        for (const [t, s] of [[-0.9, 1], [0, 1.1], [0.9, 1], [-0.45, 0.8], [0.45, 0.8]] as [number, number][]) {
            p.ctx.save();
            p.ctx.translate(fx, fy - 0.28 * u);
            p.ctx.rotate(t * 0.7);
            p.ell(0, -0.12 * u * s, 0.09 * u, 0.2 * u * s).shadeFill(flower, 0, -0.3 * u, 0, 0.1 * u, 0.25).stroke(0.5);
            p.ctx.restore();
        }
        return;
    }
    pad(p, ...at(0.3, 0.32), 0.24 * u, 0.3, darken(leaf, 0.05));
    pad(p, ...at(0.7, 0.45), 0.28 * u, 2.0, leaf);
    pad(p, ...at(0.38, 0.75), 0.22 * u, 4.2, lighten(leaf, 0.06));
    if (v === 1) pad(p, ...at(0.78, 0.82), 0.16 * u, 3.4, darken(leaf, 0.1));
    else waterFlower(p, ...at(0.68, 0.42), 0.22 * u, flower);
}

export function koi(p: Pen, r: Rect, [body, spots]: string[]): void {
    const u = p.u, ctx = p.ctx;
    const fish = (cx: number, cy: number, a: number, s: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        p.poly([[-0.3 * u * s, 0], [-0.46 * u * s, -0.1 * u * s], [-0.46 * u * s, 0.1 * u * s]]).fill(darken(body, 0.1)).stroke(0.5);
        p.ell(0, 0, 0.3 * u * s, 0.1 * u * s).shadeFill(body, 0, -0.1 * u * s, 0, 0.1 * u * s, 0.2).stroke(0.6);
        p.ell(0.02 * u * s, -0.02 * u * s, 0.09 * u * s, 0.05 * u * s).fill(spots);
        p.ell(-0.14 * u * s, 0.02 * u * s, 0.06 * u * s, 0.04 * u * s).fill(spots);
        p.ell(0.2 * u * s, -0.03 * u * s, 0.02 * u * s, 0.02 * u * s).fill('#202020');
        ctx.restore();
    };
    fish(r.x + r.w * 0.38, r.y + r.h * 0.35, 0.5, 1);
    fish(r.x + r.w * 0.62, r.y + r.h * 0.7, -2.6, 0.85);
    /* Rings in the water where they swim. */
    p.ell(r.x + r.w * 0.55, r.y + r.h * 0.2, 0.14 * u, 0.06 * u).stroke(0.4);
}

export function reeds(p: Pen, r: Rect, [green, top]: string[], _rot = false, v = 0): void {
    const u = p.u, ground = r.y + r.h - 0.1 * u;
    p.groundShadow(r.x + r.w / 2, ground, r.w * 0.42, 0.12 * u);
    p.reseed(Math.round(r.x * 3 + r.y + v));
    const n = v === 1 ? 14 : 9;
    const tips: [number, number][] = [];
    for (let i = 0; i < n; i++) {
        const x = r.x + r.w * (0.18 + 0.64 * (i + p.rnd() * 0.6) / n);
        const h = (0.55 + p.rnd() * 0.45) * (r.h - 0.2 * u);
        const tx = x + (p.rnd() - 0.5) * 0.35 * u, ty = ground - h;
        stalk(p, x, ground, tx, ty, (p.rnd() - 0.5) * 0.2 * u, i % 3 ? green : darken(green, 0.2), v === 1 ? 0.9 : 1.2);
        if (i % 2 === 0) tips.push([tx, ty]);
    }
    if (v === 0) {
        for (const [x, y] of tips.slice(0, 4)) p.rr(x - 0.06 * u, y + 0.04 * u, 0.12 * u, 0.3 * u, 0.06 * u).shadeFill(top, x - 0.06 * u, 0, x + 0.06 * u, 0, 0.3).stroke(0.6);
    } else if (v === 2) {
        for (const [x, y] of tips.slice(0, 3)) {
            for (let k = 0; k < 9; k++) {
                const t = -Math.PI + k / 8 * Math.PI;
                p.line([[x, y], [x + Math.cos(t) * 0.25 * u, y + Math.sin(t) * 0.18 * u + 0.08 * u]], lighten(green, 0.15), 0.6);
            }
        }
    }
}

/** A pond in any of its shapes; the original oval first. */
export function pondShape(p: Pen, r: Rect, [water, edge]: string[], v: number): void {
    const u = p.u, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const ctx = p.ctx;
    /* The bank's radius at angle t, as a share of the oval's: a kidney has
       a notch in its near side. */
    const rad = (t: number) => (v === 2 ? 1 - 0.38 * Math.max(0, Math.cos(t - Math.PI / 2)) ** 6 + 0.05 * Math.sin(t * 2) : 1);
    const shape = (grow: number) => {
        const rx = r.w / 2 - grow, ry = r.h / 2 - grow;
        if (v !== 2) { p.ell(cx, cy, rx, ry); return; }
        /* A smooth curve through points round the middle. */
        const pts: [number, number][] = [];
        for (let k = 0; k < 24; k++) {
            const t = k / 24 * Math.PI * 2;
            pts.push([cx + Math.cos(t) * rx * rad(t), cy + Math.sin(t) * ry * rad(t)]);
        }
        p.poly(pts);
        ctx.beginPath();
        const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const m0 = mid(pts[pts.length - 1], pts[0]);
        ctx.moveTo(m0[0], m0[1]);
        for (let k = 0; k < pts.length; k++) {
            const m = mid(pts[k], pts[(k + 1) % pts.length]);
            ctx.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]);
        }
        ctx.closePath();
    };
    shape(0.05 * u);
    p.fill(edge).stroke();
    /* Stones along the bank. */
    p.reseed(Math.round(r.w + r.h * 3 + v));
    const stones = Math.round((r.w + r.h) / u * 3);
    for (let i = 0; i < stones; i++) {
        const t = i / stones * Math.PI * 2;
        const sx = cx + Math.cos(t) * (r.w / 2 - 0.16 * u) * rad(t), sy = cy + Math.sin(t) * (r.h / 2 - 0.14 * u) * rad(t);
        p.ell(sx, sy, (0.08 + p.rnd() * 0.06) * u, 0.07 * u).fill(p.rnd() < 0.5 ? lighten(edge, 0.12) : darken(edge, 0.1)).stroke(0.4);
    }
    shape(0.25 * u);
    p.shadeFill(water, cx - r.w / 2, cy - r.h / 2, cx + r.w / 2, cy + r.h / 2, 0.3).stroke(0.6);
    p.ell(cx - r.w * 0.15, cy - r.h * 0.12, r.w * 0.12, r.h * 0.05).shine(0.35);
    if (v === 3) {
        pad(p, cx - r.w * 0.2, cy + r.h * 0.08, 0.22 * u, 0.5, '#5aa04a');
        pad(p, cx + r.w * 0.18, cy - r.h * 0.05, 0.26 * u, 2.4, '#4a9442');
        waterFlower(p, cx + r.w * 0.16, cy - r.h * 0.07, 0.2 * u, '#f4a8c8');
        pad(p, cx + r.w * 0.05, cy + r.h * 0.22, 0.18 * u, 4, '#62a852');
        for (const fx of [-0.38, -0.3]) stalk(p, cx + r.w * fx, cy - r.h * 0.18, cx + r.w * fx - 0.05 * u, cy - r.h * 0.18 - 0.7 * u, 0.1 * u, '#5a8a3a', 1.2);
        p.rr(cx - r.w * 0.35 - 0.1 * u, cy - r.h * 0.18 - 0.7 * u, 0.1 * u, 0.26 * u, 0.05 * u).fill('#7a5030').stroke(0.6);
    } else if (v !== 2) {
        p.ell(cx + r.w * 0.2, cy + r.h * 0.1, 0.25 * u, 0.12 * u).fill('#5aa04a');
    }
}

/* ---------------------------------------------------------------- ground */

export function steppingStones(p: Pen, r: Rect, [stone]: string[], _rot = false, v = 0): void {
    const u = p.u;
    const slab = (cx: number, cy: number, w: number, h: number, round: number) => {
        p.rr(cx - w / 2 + 0.02 * u, cy - h / 2 + 0.05 * u, w, h, round).shade(0.18);
        p.rr(cx - w / 2, cy - h / 2, w, h, round).shadeFill(stone, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, 0.22).stroke(0.7);
        p.rr(cx - w / 2 + w * 0.15, cy - h / 2 + h * 0.15, w * 0.3, h * 0.18, round * 0.5).shine(0.2);
    };
    if (v === 1) {
        slab(r.x + r.w * 0.3, r.y + r.h * 0.3, 0.42 * u, 0.32 * u, 0.05 * u);
        slab(r.x + r.w * 0.68, r.y + r.h * 0.72, 0.42 * u, 0.32 * u, 0.05 * u);
    } else if (v === 2) {
        p.reseed(Math.round(r.x + r.y * 5));
        for (let i = 0; i < 16; i++) {
            const s = (0.07 + p.rnd() * 0.07) * u;
            slab(r.x + (0.1 + p.rnd() * 0.8) * r.w, r.y + (0.1 + p.rnd() * 0.8) * r.h, s * 1.3, s, s * 0.5);
        }
    } else {
        slab(r.x + r.w * 0.32, r.y + r.h * 0.3, 0.38 * u, 0.3 * u, 0.15 * u);
        slab(r.x + r.w * 0.68, r.y + r.h * 0.7, 0.4 * u, 0.32 * u, 0.16 * u);
    }
}

export function pebbles(p: Pen, r: Rect, [stone]: string[]): void {
    const u = p.u;
    p.reseed(Math.round(r.x * 7 + r.y));
    for (let i = 0; i < 8; i++) {
        const x = r.x + (0.15 + p.rnd() * 0.7) * r.w, y = r.y + (0.2 + p.rnd() * 0.65) * r.h, s = (0.06 + p.rnd() * 0.07) * u;
        p.ell(x, y + s * 0.4, s * 1.2, s * 0.6).shade(0.15);
        p.ell(x, y, s * 1.2, s * 0.85).shadeFill(p.rnd() < 0.5 ? stone : lighten(stone, 0.12), x - s, y - s, x + s, y + s, 0.25).stroke(0.5);
    }
}

export function mossyRock(p: Pen, r: Rect, [stone, moss]: string[], _rot = false, v = 0): void {
    const u = p.u;
    if (v === 1) {
        /* Three smaller rocks: a pond's edge. */
        const small = (x: number, y: number, w: number, h: number, hex: string) => {
            p.groundShadow(x, y, w * 0.9, 0.08 * u);
            p.rr(x - w / 2, y - h, w, h, [h * 0.6, h * 0.5, h * 0.15, h * 0.15]).shadeFill(hex, x - w / 2, y - h, x + w / 2, y, 0.32).stroke(0.8);
            p.rr(x - w * 0.3, y - h * 0.9, w * 0.35, h * 0.25, h * 0.12).shine(0.2);
        };
        small(r.x + r.w * 0.32, r.y + r.h * 0.72, 0.42 * u, 0.4 * u, stone);
        small(r.x + r.w * 0.7, r.y + r.h * 0.8, 0.46 * u, 0.48 * u, darken(stone, 0.06));
        small(r.x + r.w * 0.48, r.y + r.h - 0.04 * u, 0.36 * u, 0.3 * u, lighten(stone, 0.06));
        p.ell(r.x + r.w * 0.66, r.y + r.h * 0.8 - 0.42 * u, 0.13 * u, 0.05 * u).fill(moss);
        return;
    }
    if (v === 2) {
        /* A flat stone to sit on. */
        const ground = r.y + r.h;
        p.groundShadow(r.x + r.w / 2, ground - 0.1 * u, r.w * 0.48, 0.14 * u);
        p.rr(r.x + 0.08 * u, ground - 0.5 * u, r.w - 0.16 * u, 0.42 * u, 0.16 * u).shadeFill(darken(stone, 0.1), 0, ground - 0.5 * u, 0, ground, 0.3).stroke();
        p.ell(r.x + r.w / 2, ground - 0.5 * u, r.w / 2 - 0.1 * u, 0.2 * u).shadeFill(lighten(stone, 0.1), r.x, ground - 0.7 * u, r.x + r.w, ground - 0.3 * u, 0.2).stroke();
        p.ell(r.x + r.w * 0.36, ground - 0.42 * u, 0.16 * u, 0.06 * u).fill(moss);
        return;
    }
    rock(p, r, [stone]);
    p.ell(r.x + r.w * 0.38, r.y + r.h * 0.32, 0.2 * u, 0.09 * u).fill(moss);
    p.ell(r.x + r.w * 0.55, r.y + r.h * 0.26, 0.14 * u, 0.07 * u).fill(lighten(moss, 0.12));
    p.ell(r.x + r.w * 0.24, r.y + r.h * 0.55, 0.08 * u, 0.12 * u).fill(darken(moss, 0.1));
}

/* ---------------------------------------------------------------- plants */

export function flowerClump(p: Pen, r: Rect, [petals, leaves]: string[], _rot = false, v = 0): void {
    const u = p.u, ground = r.y + r.h - 0.1 * u, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground, r.w * 0.4, 0.12 * u);
    p.reseed(Math.round(r.x + r.y * 3 + v));
    if (v === 2) {
        /* Roses: a low bush, round blooms. */
        ball(p, cx - 0.18 * u, ground - 0.32 * u, 0.24 * u, 0.22 * u, darken(leaves, 0.08));
        ball(p, cx + 0.18 * u, ground - 0.32 * u, 0.24 * u, 0.22 * u, darken(leaves, 0.12));
        ball(p, cx, ground - 0.48 * u, 0.28 * u, 0.24 * u, leaves);
        for (const [fx, fy] of [[-0.22, 0.42], [0.05, 0.62], [0.24, 0.38], [-0.05, 0.3], [0.2, 0.58]]) {
            const x = cx + fx * u, y = ground - fy * u;
            p.ell(x, y, 0.08 * u, 0.07 * u).shadeFill(petals, x - 0.08 * u, y - 0.07 * u, x + 0.08 * u, y + 0.07 * u, 0.3).stroke(0.5);
            p.ell(x - 0.01 * u, y - 0.01 * u, 0.035 * u, 0.03 * u).fill(darken(petals, 0.25));
        }
        return;
    }
    const n = v === 1 ? 9 : v === 3 ? 7 : 5;
    for (let i = 0; i < n; i++) {
        const x = r.x + r.w * (0.2 + 0.6 * (i + p.rnd() * 0.5) / n);
        const h = (0.45 + p.rnd() * 0.3) * u * (v === 1 ? 0.8 : 1);
        const tx = x + (p.rnd() - 0.5) * 0.15 * u, ty = ground - h;
        stalk(p, x, ground, tx, ty, (p.rnd() - 0.5) * 0.1 * u, leaves, 0.9);
        if (v === 0) {
            /* Tulips: a cup with three petals. */
            p.ell(x - 0.03 * u, ground - 0.15 * u, 0.04 * u, 0.13 * u).fill(lighten(leaves, 0.05));
            p.ell(tx, ty, 0.09 * u, 0.1 * u);
            p.ctx.beginPath();
            p.ctx.moveTo(tx - 0.08 * u, ty - 0.1 * u);
            p.ctx.lineTo(tx - 0.03 * u, ty - 0.02 * u);
            p.ctx.lineTo(tx, ty - 0.12 * u);
            p.ctx.lineTo(tx + 0.03 * u, ty - 0.02 * u);
            p.ctx.lineTo(tx + 0.08 * u, ty - 0.1 * u);
            p.ctx.quadraticCurveTo(tx + 0.09 * u, ty + 0.06 * u, tx, ty + 0.06 * u);
            p.ctx.quadraticCurveTo(tx - 0.09 * u, ty + 0.06 * u, tx - 0.08 * u, ty - 0.1 * u);
            p.shadeFill(petals, tx - 0.09 * u, ty - 0.1 * u, tx + 0.09 * u, ty + 0.06 * u, 0.3).stroke(0.5);
        } else if (v === 1) {
            /* Daisies. */
            for (let k = 0; k < 8; k++) {
                const t = k / 8 * Math.PI * 2;
                p.ell(tx + Math.cos(t) * 0.06 * u, ty + Math.sin(t) * 0.045 * u, 0.04 * u, 0.025 * u).fill(petals);
            }
            p.ell(tx, ty, 0.035 * u, 0.03 * u).fill('#f0c030');
        } else {
            /* Lavender: spikes of little buds. */
            for (let k = 0; k < 6; k++) p.ell(tx + (k % 2 ? 0.025 : -0.025) * u, ty + k * 0.04 * u, 0.03 * u, 0.025 * u).fill(k % 2 ? petals : lighten(petals, 0.15));
        }
    }
}

export function sunflowers(p: Pen, r: Rect, [petals, leaves]: string[]): void {
    const u = p.u, ground = r.y + r.h - 0.1 * u, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground, r.w * 0.4, 0.12 * u);
    for (const [fx, fh, s] of [[-0.22, 0.8, 0.8], [0.22, 0.7, 0.85], [0, 0.95, 1]] as [number, number, number][]) {
        const x = cx + fx * u, top = ground - fh * (r.h - 0.3 * u);
        stalk(p, x, ground, x + fx * 0.2 * u, top, 0.05 * u, leaves, 1.6);
        p.ell(x - 0.12 * u, (ground + top) / 2, 0.12 * u, 0.05 * u).fill(leaves).stroke(0.4);
        p.ell(x + 0.12 * u, (ground + top) / 2 + 0.15 * u, 0.12 * u, 0.05 * u).fill(darken(leaves, 0.1)).stroke(0.4);
        const hx = x + fx * 0.2 * u, hy = top;
        for (let k = 0; k < 12; k++) {
            const t = k / 12 * Math.PI * 2;
            p.ell(hx + Math.cos(t) * 0.16 * u * s, hy + Math.sin(t) * 0.14 * u * s, 0.08 * u * s, 0.08 * u * s).fill(k % 2 ? petals : lighten(petals, 0.15));
        }
        p.ell(hx, hy, 0.12 * u * s, 0.11 * u * s).fill('#6a4020').stroke(0.5);
        p.ell(hx - 0.03 * u, hy - 0.03 * u, 0.04 * u * s, 0.03 * u * s).fill('#8a5a30');
    }
}

export function fern(p: Pen, r: Rect, [green]: string[]): void {
    const u = p.u, ground = r.y + r.h - 0.12 * u, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground, r.w * 0.44, 0.13 * u);
    for (const [a, l, shade] of [[-2.6, 0.55, 0.12], [-0.55, 0.55, 0.12], [-2.1, 0.7, 0], [-1.05, 0.7, 0], [-1.57, 0.75, -0.08]] as [number, number, number][]) {
        const ex = cx + Math.cos(a) * l * u, ey = ground + Math.sin(a) * l * u * 0.85;
        const col = shade > 0 ? darken(green, shade) : lighten(green, -shade);
        stalk(p, cx, ground, ex, ey, Math.cos(a) * 0.12 * u, darken(col, 0.2), 0.7);
        for (let k = 1; k <= 6; k++) {
            const t = k / 7, x = cx + (ex - cx) * t, y = ground + (ey - ground) * t - Math.sin(t * Math.PI) * 0.05 * u;
            const len = (1 - t) * 0.16 * u + 0.04 * u;
            const n = a + Math.PI / 2;
            p.ell(x + Math.cos(n) * len * 0.5, y + Math.sin(n) * len * 0.5, len * 0.55, 0.035 * u).fill(col);
            p.ell(x - Math.cos(n) * len * 0.5, y - Math.sin(n) * len * 0.5, len * 0.55, 0.035 * u).fill(col);
        }
    }
}

export function fruitTree(p: Pen, r: Rect, [leaves, trunk, fruit]: string[]): void {
    tree(p, r, [leaves, trunk]);
    const u = p.u * (r.w / (2 * p.u)), cx = r.x + r.w / 2;
    p.reseed(Math.round(r.x + r.y * 11));
    for (let i = 0; i < 10; i++) {
        const t = p.rnd() * Math.PI * 2, d = Math.sqrt(p.rnd()) * 0.75;
        const x = cx + Math.cos(t) * d * 0.85 * u, y = r.y + r.h * 0.32 + Math.sin(t) * d * 0.45 * u;
        p.ell(x, y, 0.09 * u, 0.09 * u).shadeFill(fruit, x - 0.09 * u, y - 0.09 * u, x + 0.09 * u, y + 0.09 * u, 0.3).stroke(0.5);
        p.ell(x - 0.03 * u, y - 0.03 * u, 0.025 * u, 0.025 * u).shine(0.6);
    }
}

export function sapling(p: Pen, r: Rect, [leaves, trunk]: string[]): void {
    const u = p.u, ground = r.y + r.h - 0.1 * u, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground, 0.4 * u, 0.12 * u);
    p.rr(cx - 0.06 * u, r.y + r.h * 0.45, 0.12 * u, ground - r.y - r.h * 0.45, 0.04 * u).fill(trunk).stroke(0.6);
    p.line([[cx, r.y + r.h * 0.6], [cx + 0.2 * u, r.y + r.h * 0.5]], trunk, 1);
    ball(p, cx - 0.2 * u, r.y + r.h * 0.38, 0.28 * u, 0.26 * u, darken(leaves, 0.08));
    ball(p, cx + 0.22 * u, r.y + r.h * 0.4, 0.26 * u, 0.24 * u, darken(leaves, 0.12));
    ball(p, cx, r.y + r.h * 0.25, 0.34 * u, 0.3 * u, leaves);
}

/* ---------------------------------------------------------------- garden */

export function birdBath(p: Pen, r: Rect, [stone, water]: string[]): void {
    const u = p.u, ground = r.y + r.h - 0.1 * u, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground, 0.34 * u, 0.11 * u);
    p.ell(cx, ground - 0.02 * u, 0.22 * u, 0.08 * u).fill(darken(stone, 0.1)).stroke(0.6);
    p.poly([[cx - 0.1 * u, ground], [cx - 0.06 * u, ground - 0.55 * u], [cx + 0.06 * u, ground - 0.55 * u], [cx + 0.1 * u, ground]])
        .shadeFill(stone, cx - 0.1 * u, 0, cx + 0.1 * u, 0, 0.3).stroke(0.7);
    const top = ground - 0.7 * u;
    p.poly([[cx - 0.4 * u, top], [cx + 0.4 * u, top], [cx + 0.22 * u, top + 0.2 * u], [cx - 0.22 * u, top + 0.2 * u]])
        .shadeFill(darken(stone, 0.05), 0, top, 0, top + 0.2 * u, 0.3).stroke(0.7);
    p.ell(cx, top, 0.4 * u, 0.14 * u).fill(lighten(stone, 0.1)).stroke(0.7);
    p.ell(cx, top + 0.01 * u, 0.32 * u, 0.1 * u).shadeFill(water, cx - 0.3 * u, top - 0.1 * u, cx + 0.3 * u, top + 0.1 * u, 0.25);
    p.ell(cx - 0.1 * u, top - 0.02 * u, 0.1 * u, 0.025 * u).shine(0.5);
    /* A little bird on the rim. */
    const bx = cx + 0.3 * u, by = top - 0.08 * u;
    p.ell(bx, by, 0.09 * u, 0.06 * u).fill('#8a6a50').stroke(0.5);
    p.ell(bx + 0.07 * u, by - 0.05 * u, 0.045 * u, 0.04 * u).fill('#8a6a50').stroke(0.5);
    p.poly([[bx + 0.11 * u, by - 0.05 * u], [bx + 0.16 * u, by - 0.04 * u], [bx + 0.11 * u, by - 0.03 * u]]).fill('#e0a030');
}

export function stoneLantern(p: Pen, r: Rect, [stone, light]: string[]): void {
    const u = p.u, ground = r.y + r.h - 0.1 * u, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground, 0.36 * u, 0.12 * u);
    const block = (y: number, h: number, w: number, hex = stone) =>
        p.rect(cx - w / 2, y, w, h).shadeFill(hex, cx - w / 2, 0, cx + w / 2, 0, 0.3).stroke(0.7);
    block(ground - 0.16 * u, 0.16 * u, 0.56 * u, darken(stone, 0.08));
    block(ground - 0.62 * u, 0.46 * u, 0.18 * u);
    block(ground - 0.72 * u, 0.1 * u, 0.42 * u, darken(stone, 0.05));
    /* The light box, lit. */
    const by = ground - 1.08 * u;
    block(by, 0.36 * u, 0.36 * u);
    p.rect(cx - 0.1 * u, by + 0.08 * u, 0.2 * u, 0.2 * u).fill(light).stroke(0.5);
    p.glow(cx, by + 0.18 * u, 0.3 * u);
    /* The roof: wide, curling up at the ends. */
    const ry = by - 0.06 * u;
    p.rect(cx - 0.5 * u, ry - 0.26 * u, u, 0.34 * u);
    p.ctx.beginPath();
    p.ctx.moveTo(cx - 0.5 * u, ry - 0.06 * u);
    p.ctx.quadraticCurveTo(cx - 0.3 * u, ry + 0.06 * u, cx - 0.36 * u, ry + 0.08 * u);
    p.ctx.lineTo(cx + 0.36 * u, ry + 0.08 * u);
    p.ctx.quadraticCurveTo(cx + 0.3 * u, ry + 0.06 * u, cx + 0.5 * u, ry - 0.06 * u);
    p.ctx.lineTo(cx + 0.1 * u, ry - 0.26 * u);
    p.ctx.lineTo(cx - 0.1 * u, ry - 0.26 * u);
    p.ctx.closePath();
    p.shadeFill(darken(stone, 0.06), 0, ry - 0.26 * u, 0, ry + 0.08 * u, 0.3).stroke(0.7);
    p.ell(cx, ry - 0.32 * u, 0.07 * u, 0.08 * u).fill(stone).stroke(0.6);
}

export function topiary(p: Pen, r: Rect, [leaves, pot]: string[], _rot = false, v = 0): void {
    const u = p.u, ground = r.y + r.h - 0.08 * u, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground, 0.34 * u, 0.11 * u);
    /* The pot. */
    const pt = ground - 0.38 * u;
    p.poly([[cx - 0.26 * u, pt], [cx + 0.26 * u, pt], [cx + 0.19 * u, ground], [cx - 0.19 * u, ground]])
        .shadeFill(pot, cx - 0.26 * u, 0, cx + 0.26 * u, 0, 0.3).stroke(0.7);
    p.rect(cx - 0.29 * u, pt - 0.07 * u, 0.58 * u, 0.09 * u).paint(lighten(pot, 0.1), 0.6);
    if (v === 1) {
        /* A cone. */
        const top = r.y + 0.08 * u;
        p.poly([[cx, top], [cx + 0.32 * u, pt - 0.1 * u], [cx - 0.32 * u, pt - 0.1 * u]]).shadeFill(leaves, cx - 0.3 * u, 0, cx + 0.3 * u, 0, 0.3).stroke();
        p.poly([[cx, top], [cx + 0.32 * u, pt - 0.1 * u], [cx + 0.08 * u, pt - 0.1 * u]]).shade(0.15);
        p.reseed(5);
        for (let i = 0; i < 12; i++) {
            const t = p.rnd(), y = top + (pt - 0.1 * u - top) * (0.2 + t * 0.75), half = 0.32 * u * (y - top) / (pt - 0.1 * u - top);
            p.ell(cx + (p.rnd() - 0.5) * half * 1.5, y, 0.04 * u, 0.03 * u).fill(darken(leaves, 0.22));
        }
        return;
    }
    p.rect(cx - 0.04 * u, pt - 0.5 * u, 0.08 * u, 0.45 * u).fill('#6a4a30').stroke(0.5);
    if (v === 2) {
        ball(p, cx, pt - 0.4 * u, 0.24 * u, 0.22 * u, darken(leaves, 0.05));
        p.rect(cx - 0.04 * u, pt - 0.9 * u, 0.08 * u, 0.3 * u).fill('#6a4a30').stroke(0.5);
        ball(p, cx, r.y + 0.3 * u, 0.2 * u, 0.19 * u, leaves);
        return;
    }
    ball(p, cx, pt - 0.6 * u, 0.36 * u, 0.34 * u, leaves);
}

export function gardenBridge(p: Pen, r: Rect, [wood, rail]: string[]): void {
    const u = p.u, ctx = p.ctx;
    const x0 = r.x + 0.05 * u, x1 = r.x + r.w - 0.05 * u, cx = (x0 + x1) / 2;
    const ground = r.y + r.h - 0.08 * u;
    const end = ground - 0.5 * u, rise = 0.55 * u, d = 0.55 * u;
    /* A point on the arch's back edge, t from 0 to 1. */
    const arch = (t: number, dy = 0): [number, number] => {
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        return [a * x0 + b * cx + c * x1, a * (end + dy) + b * (end - rise * 2 + dy) + c * (end + dy)];
    };
    const curve = (dy: number, back = false) => {
        if (!back) { ctx.moveTo(x0, end + dy); ctx.quadraticCurveTo(cx, end - rise * 2 + dy, x1, end + dy); } else { ctx.lineTo(x1, end + dy); ctx.quadraticCurveTo(cx, end - rise * 2 + dy, x0, end + dy); }
    };
    p.groundShadow(cx, ground, r.w * 0.45, 0.14 * u);
    /* The side under the front edge, down to the arch beneath. */
    p.rect(x0, end - rise, x1 - x0, ground - end + rise);
    ctx.beginPath();
    curve(d);
    ctx.lineTo(x1, ground);
    ctx.quadraticCurveTo(cx, ground - rise * 1.6, x0, ground);
    ctx.closePath();
    p.shadeFill(darken(wood, 0.2), 0, end - rise, 0, ground, 0.3).stroke();
    /* The deck. */
    p.rect(x0, end - rise, x1 - x0, d + rise);
    ctx.beginPath();
    curve(0);
    curve(d, true);
    ctx.closePath();
    p.shadeFill(lighten(wood, 0.08), 0, end - rise, 0, end + d, 0.15).stroke();
    for (let k = 1; k < 12; k++) {
        const [ax, ay] = arch(k / 12), [bx, by] = arch(k / 12, d);
        p.line([[ax, ay], [bx, by]], darken(wood, 0.3), 0.5, 0.7);
    }
    /* The rails, back then front: posts and a handrail. */
    for (const dy of [0, d]) {
        const tops: [number, number][] = [];
        for (let k = 0; k <= 4; k++) {
            const [px, py] = arch(k / 4, dy);
            p.rect(px - 0.05 * u, py - 0.4 * u, 0.1 * u, 0.4 * u).paint(rail, 0.6);
            tops.push([px, py - 0.38 * u]);
        }
        ctx.beginPath();
        ctx.moveTo(tops[0][0], tops[0][1]);
        /* Through the middle post's top: the control point that puts it there. */
        ctx.quadraticCurveTo(2 * tops[2][0] - (tops[0][0] + tops[4][0]) / 2, 2 * tops[2][1] - (tops[0][1] + tops[4][1]) / 2, tops[4][0], tops[4][1]);
        ctx.strokeStyle = p.c(rail);
        ctx.lineWidth = Math.max(2, 0.08 * u);
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}

export function roseArch(p: Pen, r: Rect, [frame, roses]: string[]): void {
    const u = p.u, ground = r.y + r.h - 0.1 * u, ctx = p.ctx;
    const x0 = r.x + 0.18 * u, x1 = r.x + r.w - 0.18 * u, cx = (x0 + x1) / 2;
    const top = r.y + 0.35 * u, spring = r.y + r.h * 0.42;
    p.groundShadow(cx, ground, r.w * 0.45, 0.12 * u);
    /* Two posts and the arch between them. */
    for (const x of [x0, x1]) p.rect(x - 0.07 * u, spring, 0.14 * u, ground - spring).shadeFill(frame, x - 0.07 * u, 0, x + 0.07 * u, 0, 0.3).stroke(0.7);
    ctx.beginPath();
    ctx.moveTo(x0, spring);
    ctx.bezierCurveTo(x0, top - 0.2 * u, x1, top - 0.2 * u, x1, spring);
    ctx.strokeStyle = p.look.ink ?? p.c(darken(frame, 0.4));
    ctx.lineWidth = Math.max(3, 0.18 * u);
    ctx.stroke();
    ctx.strokeStyle = p.c(frame);
    ctx.lineWidth = Math.max(2, 0.12 * u);
    ctx.stroke();
    /* Leaves and roses climbing it. */
    p.reseed(Math.round(r.x + r.y));
    const along = (t: number): [number, number] => {
        if (t < 0.3) return [t < 0.15 ? x0 : x1, ground - (t % 0.15) / 0.15 * (ground - spring)];
        const s = (t - 0.3) / 0.7;
        const a = (1 - s) ** 3, b = 3 * (1 - s) ** 2 * s, c = 3 * (1 - s) * s * s, e = s ** 3;
        return [a * x0 + b * x0 + c * x1 + e * x1, a * spring + (b + c) * (top - 0.2 * u) + e * spring];
    };
    for (let i = 0; i < 30; i++) {
        const [x, y] = along(p.rnd());
        p.ell(x + (p.rnd() - 0.5) * 0.2 * u, y + (p.rnd() - 0.5) * 0.15 * u, 0.09 * u, 0.06 * u).fill(p.rnd() < 0.5 ? '#3e8a44' : '#2e7038');
    }
    for (let i = 0; i < 12; i++) {
        const [x, y] = along(p.rnd());
        const fx = x + (p.rnd() - 0.5) * 0.18 * u, fy = y + (p.rnd() - 0.5) * 0.12 * u;
        p.ell(fx, fy, 0.065 * u, 0.06 * u).fill(roses).stroke(0.4);
        p.ell(fx, fy, 0.025 * u, 0.025 * u).fill(darken(roses, 0.25));
    }
}
