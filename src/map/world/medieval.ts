import type { Pen, Rect } from './looks';
import { darken, lighten } from './looks';
import { building } from './buildings';
import type { BuildingSpec } from './buildings';

/* The medieval set (owner's request, 2026-11-08): castles, churches, mills,
   a smithy, and the clutter of a medieval street. Same conventions as
   props.ts — `r` is the sprite in px, its bottom edge the front of the
   footprint — and `v` is the variant the catalogue offers. */

/* ------------------------------------------------------------- helpers */

/** Rough stone courses over a rectangle already filled. */
export function courses(p: Pen, x: number, y: number, w: number, h: number, hex: string): void {
    const u = p.u, ctx = p.ctx;
    ctx.save();
    p.rect(x, y, w, h);
    ctx.clip();
    p.reseed(Math.round(w * 3 + h * 5 + x));
    const rh = 0.36 * u;
    for (let yy = y + h, row = 0; yy > y - rh; yy -= rh, row++) {
        let xx = x - p.rnd() * 0.4 * u;
        while (xx < x + w) {
            const bw = (0.45 + p.rnd() * 0.45) * u;
            p.rr(xx + 0.03 * u, yy - rh + 0.03 * u, bw - 0.06 * u, rh - 0.06 * u, 0.06 * u).fill(p.rnd() < 0.5 ? lighten(hex, 0.06) : darken(hex, 0.06));
            p.rr(xx + 0.03 * u, yy - rh + 0.03 * u, bw - 0.06 * u, rh - 0.06 * u, 0.06 * u).stroke(0.4);
            xx += bw;
        }
    }
    ctx.restore();
}

export function battlements(p: Pen, x: number, w: number, y: number, hex: string): void {
    const u = p.u, mw = 0.4 * u, gap = 0.28 * u, mh = 0.4 * u;
    const n = Math.max(2, Math.floor((w + gap) / (mw + gap)));
    const step = (w - mw) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
        p.rect(x + i * step, y, mw, mh).shadeFill(hex, 0, y, 0, y + mh, 0.2).stroke(0.8);
        p.rect(x + i * step, y, mw, 0.09 * u).shine(0.25);
    }
}

export function slitWindow(p: Pen, cx: number, y: number, h = 0.7): void {
    const u = p.u;
    p.rr(cx - 0.09 * u, y, 0.18 * u, h * u, [0.09 * u, 0.09 * u, 0, 0]).fill('#2a2420').stroke(0.5);
    if (p.look.night) p.rr(cx - 0.05 * u, y + 0.1 * u, 0.1 * u, (h - 0.2) * u, 0.04 * u).fill('#ffc870');
}

export function banner(p: Pen, cx: number, y: number, hex: string, h = 1.1): void {
    const u = p.u;
    p.rect(cx - 0.3 * u, y - 0.05 * u, 0.6 * u, 0.08 * u).fill('#5a3a24');
    p.poly([[cx - 0.26 * u, y], [cx + 0.26 * u, y], [cx + 0.26 * u, y + h * u], [cx, y + (h - 0.25) * u], [cx - 0.26 * u, y + h * u]])
        .shadeFill(hex, cx - 0.26 * u, 0, cx + 0.26 * u, 0, 0.3).stroke(0.7);
    p.ell(cx, y + h * 0.42 * u, 0.12 * u, 0.12 * u).fill('#f0d070');
}

/** A round tower with a cone roof or battlements, standing in `r`. */
export function roundTower(p: Pen, r: Rect, wall: string, roof: string | null, bodyTop: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2, bw = r.w * 0.86;
    p.rr(cx - bw / 2, bodyTop, bw, ground - bodyTop - 0.05 * u, [0, 0, bw * 0.22, bw * 0.22]).shadeFill(wall, cx - bw / 2, 0, cx + bw / 2, 0, 0.38);
    courses(p, cx - bw / 2, bodyTop, bw, ground - bodyTop - 0.05 * u, wall);
    p.rr(cx - bw / 2, bodyTop, bw, ground - bodyTop - 0.05 * u, [0, 0, bw * 0.22, bw * 0.22]).stroke();
    p.rect(cx + bw * 0.12, bodyTop, bw * 0.38, ground - bodyTop - 0.1 * u).shade(0.18);
    for (let y = bodyTop + 0.6 * u; y < ground - 1.3 * u; y += 1.5 * u) slitWindow(p, cx, y);
    if (roof) {
        const eave = bodyTop + 0.2 * u;
        p.poly([[cx, r.y + 0.05 * u], [cx + r.w / 2, eave], [cx - r.w / 2, eave]]).shadeFill(roof, cx - r.w / 2, 0, cx + r.w / 2, 0, 0.35).stroke();
        p.poly([[cx, r.y + 0.05 * u], [cx + r.w / 2, eave], [cx + r.w * 0.12, eave]]).shade(0.2);
        p.ell(cx, eave, r.w / 2, 0.14 * u).fill(roof).stroke(0.7);
    } else {
        p.ell(cx, bodyTop, bw / 2 + 0.08 * u, 0.3 * u).fill(lighten(wall, 0.08)).stroke(0.8);
        p.ell(cx, bodyTop, bw / 2 - 0.2 * u, 0.18 * u).fill(darken(wall, 0.3));
        battlements(p, cx - bw / 2 - 0.05 * u, bw + 0.1 * u, bodyTop - 0.1 * u, wall);
    }
}

/* ----------------------------------------------------------- buildings */

/** A castle keep: a stone block behind battlements; v1 with corner turrets, v2 with a slate roof. */
export function keep(p: Pen, r: Rect, [stone, roof, flag]: string[], _rot: boolean, v: number): void {
    const u = p.u;
    const tw = v === 1 ? 1.3 * u : 0;
    const body: Rect = { x: r.x + tw * 0.6, y: r.y + 0.6 * u, w: r.w - tw * 1.2, h: r.h - 0.6 * u };
    const spec: BuildingSpec = {
        roof: v === 2 ? roof : darken(stone, 0.15), wall: stone, floors: 3, roofKind: v === 2 ? 'hip' : 'crenel', roofMat: 'slate',
        wallMat: 'stone', windowKind: 'arched', windows: 3, door_: 'gate', door: '#5a3a24', trim: darken(stone, 0.3),
    };
    building(p, body, spec);
    if (v === 1) {
        for (const x of [r.x, r.x + r.w - tw]) roundTower(p, { x, y: r.y, w: tw, h: r.h }, stone, roof, r.y + 1.3 * u);
    }
    const fx = r.x + r.w / 2;
    p.line([[fx, body.y + 0.2 * u], [fx, r.y - 0.3 * u]], '#3a3430', 1.2);
    p.poly([[fx, r.y - 0.3 * u], [fx + 0.7 * u, r.y - 0.12 * u], [fx, r.y + 0.08 * u]]).paint(flag, 0.7);
    if (v !== 2) banner(p, body.x + body.w * 0.25, body.y + body.h - 3.2 * u, flag);
}

/** A stretch of curtain wall with a walk behind battlements; turned, it runs down the map. v1 has a torch, v2 is ruined. */
export function castleWall(p: Pen, r: Rect, [stone]: string[], rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    if (rot) {
        /* Seen end-on from the slant: a long top face, a short front. */
        const front = 2.0 * u, x = r.x + 0.15 * u, w = r.w - 0.3 * u;
        p.rect(x, r.y + 0.5 * u, w, r.h - front - 0.5 * u).fill(lighten(stone, 0.06)).stroke();
        courses(p, x, r.y + 0.5 * u, w, r.h - front - 0.5 * u, lighten(stone, 0.06));
        p.rect(x + 0.18 * u, r.y + 0.55 * u, w - 0.36 * u, r.h - front - 0.6 * u).fill(darken(stone, 0.12));
        for (let y = r.y + 0.4 * u; y < ground - front - 0.3 * u; y += 0.7 * u) {
            p.rect(x - 0.02 * u, y, 0.22 * u, 0.42 * u).paint(stone, 0.7);
            p.rect(x + w - 0.2 * u, y, 0.22 * u, 0.42 * u).paint(stone, 0.7);
        }
        p.rect(x, ground - front, w, front - 0.05 * u).shadeFill(stone, 0, ground - front, 0, ground, 0.2);
        courses(p, x, ground - front, w, front - 0.05 * u, stone);
        p.rect(x, ground - front, w, front - 0.05 * u).stroke();
        battlements(p, x, w, ground - front - 0.38 * u, stone);
        return;
    }
    const top = r.y + 0.9 * u;
    p.rect(r.x, top, r.w, ground - top - 0.05 * u).shadeFill(stone, 0, top, 0, ground, 0.2);
    courses(p, r.x, top, r.w, ground - top - 0.05 * u, stone);
    p.rect(r.x, top, r.w, ground - top - 0.05 * u).stroke();
    p.rect(r.x, r.y + 0.45 * u, r.w, 0.5 * u).fill(darken(stone, 0.12)).stroke(0.7);
    if (v === 2) {
        /* Broken: a jagged top, rubble at the foot, ivy. */
        p.reseed(Math.round(r.w));
        const pts: [number, number][] = [[r.x, top + 0.1 * u]];
        for (let x = r.x + 0.3 * u; x < r.x + r.w; x += 0.3 * u) pts.push([x, top + (p.rnd() * 0.9 - 0.1) * u]);
        pts.push([r.x + r.w, top + 0.4 * u], [r.x + r.w, r.y], [r.x, r.y]);
        p.ctx.save();
        p.ctx.globalCompositeOperation = 'destination-out';
        p.poly(pts).fill('#000000');
        p.ctx.restore();
        p.ctx.beginPath();
        pts.slice(0, -2).forEach(([x, y], i) => (i ? p.ctx.lineTo(x, y) : p.ctx.moveTo(x, y)));
        p.stroke();
        for (let i = 0; i < 5; i++) p.rr(r.x + p.rnd() * r.w, ground - 0.25 * u, 0.3 * u, 0.2 * u, 0.06 * u).paint(stone, 0.5);
        for (let i = 0; i < 4; i++) p.ell(r.x + p.rnd() * r.w, top + (0.4 + p.rnd() * 1.2) * u, 0.3 * u, 0.22 * u).fill('#4a7a3a');
        return;
    }
    battlements(p, r.x, r.w, r.y + 0.1 * u, stone);
    if (v === 1) {
        const cx = r.x + r.w / 2, ty = top + 0.6 * u;
        p.line([[cx, ty + 0.2 * u], [cx, ty + 0.75 * u]], '#3a3430', 1.6);
        p.ell(cx, ty + 0.05 * u, 0.12 * u, 0.2 * u).fill('#f0a030');
        p.ell(cx, ty + 0.1 * u, 0.06 * u, 0.1 * u).fill('#fff0b0');
        p.glow(cx, ty, 1.8 * u);
    }
}

/** A tower of a castle's wall: round, square, or ruined. */
export function castleTower(p: Pen, r: Rect, [stone, roof]: string[], _rot: boolean, v: number): void {
    const u = p.u;
    if (v === 0) { roundTower(p, r, stone, null, r.y + 0.6 * u); return; }
    if (v === 1) {
        building(p, r, { roof, wall: stone, floors: 3, roofKind: 'crenel', wallMat: 'stone', windowKind: 'slit', windows: 1, door_: 'none', trim: darken(stone, 0.3) });
        return;
    }
    roundTower(p, r, stone, null, r.y + 1.6 * u);
    p.reseed(9);
    p.ctx.save();
    p.ctx.globalCompositeOperation = 'destination-out';
    p.poly([[r.x - 0.1 * u, r.y], [r.x + r.w + 0.1 * u, r.y], [r.x + r.w + 0.1 * u, r.y + 2.6 * u], [r.x + r.w * 0.6, r.y + 2.0 * u], [r.x + r.w * 0.35, r.y + 2.5 * u], [r.x - 0.1 * u, r.y + 1.8 * u]]).fill('#000000');
    p.ctx.restore();
    for (let i = 0; i < 4; i++) p.ell(r.x + r.w * (0.3 + p.rnd() * 0.4), r.y + (2.8 + p.rnd() * 1.5) * u, 0.3 * u, 0.22 * u).fill('#4a7a3a');
}

/** A gatehouse: two towers and the passage between; v1 has a wooden gate, v2 a drawbridge. */
export function gatehouse(p: Pen, r: Rect, [stone, door, flag]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, tw = Math.min(1.6 * u, r.w * 0.3);
    const mid: Rect = { x: r.x + tw * 0.7, y: r.y + 0.9 * u, w: r.w - tw * 1.4, h: r.h - 0.9 * u };
    building(p, mid, { roof: darken(stone, 0.15), wall: stone, floors: 2, roofKind: 'crenel', wallMat: 'stone', windowKind: 'slit', windows: 2, door_: v === 1 ? 'double' : 'gate', door, trim: darken(stone, 0.3) });
    for (const x of [r.x, r.x + r.w - tw]) roundTower(p, { x, y: r.y, w: tw, h: r.h }, stone, null, r.y + 0.7 * u);
    if (v === 2) {
        const bw = 1.9 * u, cx = mid.x + mid.w / 2;
        p.poly([[cx - bw / 2, ground - 0.1 * u], [cx + bw / 2, ground - 0.1 * u], [cx + bw / 2 + 0.1 * u, ground + 0.5 * u], [cx - bw / 2 - 0.1 * u, ground + 0.5 * u]]).fill(door).stroke();
        for (let x = cx - bw / 2 + 0.25 * u; x < cx + bw / 2; x += 0.25 * u) p.line([[x, ground - 0.1 * u], [x, ground + 0.5 * u]], null, 0.4, 0.6);
        for (const s of [-1, 1]) p.line([[cx + s * bw / 2, ground + 0.4 * u], [cx + s * 0.6 * u, ground - 1.9 * u]], '#3a3430', 0.8);
    }
    banner(p, mid.x + mid.w * 0.2, mid.y + 0.9 * u, flag, 0.9);
    banner(p, mid.x + mid.w * 0.8, mid.y + 0.9 * u, flag, 0.9);
}

/** A watchtower: timber on stilts, stone and square, or round with a cone roof. */
export function watchtower(p: Pen, r: Rect, [wood, roof]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    if (v === 1) {
        building(p, { x: r.x, y: r.y, w: r.w, h: r.h }, { roof, wall: '#a8a090', floors: 3, roofKind: 'hip', roofMat: 'slate', wallMat: 'stone', windowKind: 'slit', windows: 1, door_: 'arched', door: wood });
        return;
    }
    if (v === 2) {
        roundTower(p, r, '#b0a898', roof, r.y + 1.4 * u);
        p.rr(cx - 0.28 * u, ground - 1.05 * u, 0.56 * u, 0.95 * u, [0.28 * u, 0.28 * u, 0, 0]).shadeFill(wood, cx - 0.28 * u, 0, cx + 0.28 * u, 0, 0.3).stroke();
        return;
    }
    p.groundShadow(cx, ground - 0.12 * u, r.w * 0.45, 0.2 * u);
    const legTop = r.y + 1.7 * u;
    for (const [a, b] of [[0.15, 0.3], [0.85, 0.7]] as const) {
        p.line([[r.x + r.w * a, ground - 0.05 * u], [r.x + r.w * b, legTop]], wood, 2.6);
    }
    p.line([[r.x + r.w * 0.2, ground - 0.8 * u], [r.x + r.w * 0.8, legTop + 0.5 * u]], wood, 1.4);
    p.line([[r.x + r.w * 0.8, ground - 0.8 * u], [r.x + r.w * 0.2, legTop + 0.5 * u]], wood, 1.4);
    for (let y = ground - 0.4 * u; y > legTop; y -= 0.35 * u) p.line([[cx - 0.18 * u, y], [cx + 0.18 * u, y]], darken(wood, 0.2), 0.9);
    p.line([[cx - 0.18 * u, ground], [cx - 0.18 * u, legTop]], darken(wood, 0.2), 0.9);
    p.line([[cx + 0.18 * u, ground], [cx + 0.18 * u, legTop]], darken(wood, 0.2), 0.9);
    const hx = r.x + 0.1 * u, hw = r.w - 0.2 * u, hy = legTop - 0.9 * u;
    p.rect(hx, hy, hw, 0.95 * u).shadeFill(wood, hx, 0, hx + hw, 0, 0.3).stroke();
    for (let x = hx + 0.25 * u; x < hx + hw; x += 0.25 * u) p.line([[x, hy], [x, hy + 0.95 * u]], null, 0.4, 0.5);
    p.rect(hx + 0.3 * u, hy + 0.15 * u, hw - 0.6 * u, 0.3 * u).fill('#2a2420');
    for (const s of [0.18, 0.82]) p.line([[r.x + r.w * s, hy], [r.x + r.w * s, r.y + 0.7 * u]], wood, 1.3);
    p.poly([[cx, r.y + 0.05 * u], [r.x + r.w + 0.1 * u, r.y + 0.8 * u], [r.x - 0.1 * u, r.y + 0.8 * u]]).shadeFill(roof, r.x, 0, r.x + r.w, 0, 0.3).stroke();
    p.glow(cx, hy + 0.3 * u, 1.5 * u);
}

/** A stone church: a bell tower beside the nave (v0), over the door (v1), or a plain chapel with a bellcote (v2). */
export function church(p: Pen, r: Rect, [roof, stone, glass]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    const nave = (rr: Rect) => building(p, rr, {
        roof, wall: stone, floors: 1, roofKind: 'gable', roofMat: 'slate', wallMat: 'stone', windowKind: 'arched',
        windows: 3, wallH: 2.4, door_: 'arched', door: '#6a3a24', trim: darken(stone, 0.3), glass,
    });
    if (v === 0) {
        const tw = Math.min(1.8 * u, r.w * 0.34);
        nave({ x: r.x + tw - 0.1 * u, y: r.y + 2.4 * u, w: r.w - tw + 0.1 * u, h: r.h - 2.4 * u });
        const tx = r.x, ty = r.y + 1.4 * u;
        p.rect(tx, ty, tw, ground - ty - 0.05 * u).shadeFill(stone, tx, 0, tx + tw, 0, 0.3);
        courses(p, tx, ty, tw, ground - ty - 0.05 * u, stone);
        p.rect(tx, ty, tw, ground - ty - 0.05 * u).stroke();
        p.rr(tx + tw / 2 - 0.25 * u, ty + 0.35 * u, 0.5 * u, 0.7 * u, [0.25 * u, 0.25 * u, 0, 0]).fill('#2a2420').stroke(0.6);
        p.ell(tx + tw / 2, ty + 0.85 * u, 0.15 * u, 0.15 * u).fill('#c8a040');
        slitWindow(p, tx + tw / 2, ty + 1.6 * u);
        p.poly([[tx + tw / 2, r.y - 0.2 * u], [tx + tw + 0.1 * u, ty + 0.05 * u], [tx - 0.1 * u, ty + 0.05 * u]]).shadeFill(roof, tx, 0, tx + tw, 0, 0.3).stroke();
        p.line([[tx + tw / 2, r.y - 0.2 * u], [tx + tw / 2, r.y - 0.6 * u]], '#c8a040', 1.3);
        p.line([[tx + tw / 2 - 0.14 * u, r.y - 0.45 * u], [tx + tw / 2 + 0.14 * u, r.y - 0.45 * u]], '#c8a040', 1.3);
        return;
    }
    if (v === 1) {
        nave({ x: r.x, y: r.y + 2.2 * u, w: r.w, h: r.h - 2.2 * u });
        const cx = r.x + r.w / 2, tw = 1.4 * u, base = ground - 2.3 * u, ty = r.y + 1.3 * u;
        p.rect(cx - tw / 2, ty, tw, base - ty).shadeFill(stone, cx - tw / 2, 0, cx + tw / 2, 0, 0.3);
        courses(p, cx - tw / 2, ty, tw, base - ty, stone);
        p.rect(cx - tw / 2, ty, tw, base - ty).stroke();
        /* A rose window. */
        p.ell(cx, ty + (base - ty) * 0.55, 0.42 * u, 0.42 * u).paint(darken(stone, 0.25), 0.8);
        p.ell(cx, ty + (base - ty) * 0.55, 0.32 * u, 0.32 * u).fill(p.look.night ? lighten(glass, 0.4) : glass).stroke(0.6);
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3;
            p.line([[cx, ty + (base - ty) * 0.55], [cx + Math.cos(a) * 0.32 * u, ty + (base - ty) * 0.55 + Math.sin(a) * 0.32 * u]], null, 0.5);
        }
        p.poly([[cx, r.y + 0.05 * u], [cx + tw / 2 + 0.12 * u, ty + 0.05 * u], [cx - tw / 2 - 0.12 * u, ty + 0.05 * u]]).shadeFill(roof, cx - tw, 0, cx + tw, 0, 0.3).stroke();
        return;
    }
    nave({ x: r.x, y: r.y + 1.0 * u, w: r.w, h: r.h - 1.0 * u });
    const cx = r.x + r.w / 2, by = r.y + 0.2 * u;
    p.rect(cx - 0.35 * u, by + 0.35 * u, 0.7 * u, 0.85 * u).shadeFill(stone, cx - 0.35 * u, 0, cx + 0.35 * u, 0).stroke();
    p.rr(cx - 0.2 * u, by + 0.5 * u, 0.4 * u, 0.55 * u, [0.2 * u, 0.2 * u, 0, 0]).fill('#2a2420');
    p.ell(cx, by + 0.85 * u, 0.13 * u, 0.15 * u).fill('#c8a040');
    p.poly([[cx, by], [cx + 0.48 * u, by + 0.4 * u], [cx - 0.48 * u, by + 0.4 * u]]).paint(roof);
}

/** A cathedral: twin towers (v0), one spire (v1), or a great dome (v2). */
export function cathedral(p: Pen, r: Rect, [roof, stone, glass]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    const tw = Math.min(2 * u, r.w * 0.24);
    const mid: Rect = v === 0 ? { x: r.x + tw - 0.1 * u, y: r.y + 2.2 * u, w: r.w - 2 * tw + 0.2 * u, h: r.h - 2.2 * u } : { x: r.x, y: r.y + 2.6 * u, w: r.w, h: r.h - 2.6 * u };
    building(p, mid, {
        roof, wall: stone, floors: 1, roofKind: v === 2 ? 'dome' : 'gable', roofMat: 'slate', wallMat: 'stone', windowKind: 'arched',
        windows: 4, wallH: 3.0, door_: 'double', door: '#5a3020', trim: darken(stone, 0.3),
    });
    const rose = (x: number, y: number, rad: number) => {
        p.ell(x, y, rad + 0.1 * u, rad + 0.1 * u).paint(darken(stone, 0.25), 0.8);
        p.ell(x, y, rad, rad).fill(p.look.night ? lighten(glass, 0.4) : glass).stroke(0.6);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            p.line([[x, y], [x + Math.cos(a) * rad, y + Math.sin(a) * rad]], null, 0.5);
        }
        p.ell(x, y, rad * 0.3, rad * 0.3).stroke(0.6);
    };
    if (v === 0) {
        for (const x of [r.x, r.x + r.w - tw]) {
            const ty = r.y + 1.2 * u;
            p.rect(x, ty, tw, ground - ty - 0.05 * u).shadeFill(stone, x, 0, x + tw, 0, 0.3);
            courses(p, x, ty, tw, ground - ty - 0.05 * u, stone);
            p.rect(x, ty, tw, ground - ty - 0.05 * u).stroke();
            for (let y = ty + 0.5 * u; y < ground - 1.5 * u; y += 1.4 * u) win2(p, x + tw / 2, y, glass);
            p.poly([[x + tw / 2, r.y - 0.1 * u], [x + tw + 0.1 * u, ty + 0.05 * u], [x - 0.1 * u, ty + 0.05 * u]]).shadeFill(roof, x, 0, x + tw, 0, 0.3).stroke();
            p.line([[x + tw / 2, r.y - 0.1 * u], [x + tw / 2, r.y - 0.5 * u]], '#c8a040', 1.2);
        }
        rose(cx, mid.y + mid.h - 3.1 * u, 0.55 * u);
        return;
    }
    if (v === 1) {
        const sw = 1.5 * u, base = mid.y + mid.h - 3.2 * u, ty = r.y + 1.8 * u;
        p.rect(cx - sw / 2, ty, sw, base - ty + 0.3 * u).shadeFill(stone, cx - sw / 2, 0, cx + sw / 2, 0, 0.3);
        courses(p, cx - sw / 2, ty, sw, base - ty + 0.3 * u, stone);
        p.rect(cx - sw / 2, ty, sw, base - ty + 0.3 * u).stroke();
        win2(p, cx, ty + 0.3 * u, glass);
        p.poly([[cx, r.y - 0.4 * u], [cx + sw / 2 + 0.12 * u, ty + 0.05 * u], [cx - sw / 2 - 0.12 * u, ty + 0.05 * u]]).shadeFill(roof, cx - sw, 0, cx + sw, 0, 0.3).stroke();
        p.line([[cx, r.y - 0.4 * u], [cx, r.y - 0.8 * u]], '#c8a040', 1.3);
        rose(cx, mid.y + mid.h - 2.0 * u, 0.42 * u);
        return;
    }
    rose(cx, mid.y + mid.h - 2.3 * u, 0.5 * u);
}

function win2(p: Pen, cx: number, y: number, glass: string): void {
    const u = p.u;
    p.rr(cx - 0.25 * u, y, 0.5 * u, 0.85 * u, [0.25 * u, 0.25 * u, 0, 0]).fill(p.look.night ? lighten(glass, 0.4) : glass).stroke(0.6);
    p.line([[cx, y + 0.1 * u], [cx, y + 0.85 * u]], null, 0.5);
}

/** A covered market: a roof on posts (v0), a stone arcade with a hall above (v1), or a striped pavilion (v2). */
export function marketHall(p: Pen, r: Rect, [roof, wood, cloth, wall = '#e8d8b8']: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    p.groundShadow(r.x + r.w / 2, ground - 0.1 * u, r.w * 0.5, 0.3 * u);
    if (v === 1) {
        building(p, r, { roof, wall, floors: 2, roofKind: 'hip', roofMat: 'tile', wallMat: 'timber', lowerMat: 'stone', lowerWall: '#b8ac98', windowKind: 'leaded', windows: 4, door_: 'none', trim: wood, jetty: true });
        /* Arches through the ground floor. */
        const n = Math.max(3, Math.round(r.w / u / 1.4)), ah = 1.15 * u;
        for (let i = 0; i < n; i++) {
            const aw = (r.w - 0.6 * u) / n - 0.2 * u, ax = r.x + 0.4 * u + i * (aw + 0.2 * u);
            p.rr(ax, ground - 0.26 * u - ah, aw, ah, [aw / 2, aw / 2, 0, 0]).fill('#3a2e26').stroke(0.8);
            p.reseed(i + 3);
            p.ell(ax + aw * 0.3, ground - 0.4 * u, 0.12 * u, 0.1 * u).fill(['#e04848', '#f0b030', '#58a848'][i % 3]);
            p.rect(ax + aw * 0.5, ground - 0.55 * u, 0.25 * u, 0.25 * u).fill('#a87444').stroke(0.4);
        }
        bunting(p, r.x + 0.3 * u, r.x + r.w - 0.3 * u, ground - 1.55 * u, cloth);
        return;
    }
    const top = r.y + 0.1 * u, eave = r.y + (v === 2 ? 1.0 : 1.6) * u;
    for (const fx of [0.15, 0.5, 0.85]) {
        const x = r.x + r.w * fx - 0.08 * u;
        p.rect(x, eave - 0.1 * u, 0.16 * u, ground - eave).shadeFill(wood, x, 0, x + 0.16 * u, 0).stroke(0.7);
    }
    p.reseed(Math.round(r.w * 3));
    const goods = ['#e04848', '#f0b030', '#58a848', '#e07830', '#a868c8'];
    for (let i = 0; i < Math.round(r.w / u); i++) {
        const x = r.x + 0.3 * u + i * 0.95 * u;
        if (x > r.x + r.w - 0.8 * u) break;
        p.rect(x, ground - 0.85 * u, 0.75 * u, 0.5 * u).shadeFill(wood, x, 0, x + 0.75 * u, 0).stroke(0.6);
        for (let k = 0; k < 3; k++) p.ell(x + 0.15 * u + k * 0.22 * u, ground - 0.9 * u, 0.1 * u, 0.08 * u).paint(goods[Math.floor(p.rnd() * goods.length)], 0.4);
    }
    if (v === 2) {
        const n = Math.round(r.w / (0.5 * u));
        for (let i = 0; i < n; i++) {
            const sx = r.x + r.w * i / n, sw = r.w / n;
            p.poly([[r.x + r.w / 2, top], [sx + sw, eave], [sx, eave]]).fill(i % 2 ? roof : cloth);
        }
        p.poly([[r.x + r.w / 2, top], [r.x + r.w, eave], [r.x, eave]]).stroke();
        for (let i = 0; i < n; i++) {
            const sx = r.x + r.w * i / n, sw = r.w / n;
            p.ctx.beginPath();
            p.ctx.moveTo(sx, eave);
            p.ctx.quadraticCurveTo(sx + sw / 2, eave + 0.35 * u, sx + sw, eave);
            p.fill(i % 2 ? roof : cloth).stroke(0.5);
        }
        p.line([[r.x + r.w / 2, top], [r.x + r.w / 2, top - 0.4 * u]], '#5a3a24', 1.2);
        p.poly([[r.x + r.w / 2, top - 0.4 * u], [r.x + r.w / 2 + 0.4 * u, top - 0.3 * u], [r.x + r.w / 2, top - 0.2 * u]]).paint(cloth, 0.6);
        return;
    }
    building(p, { x: r.x, y: top, w: r.w, h: eave - top + 0.25 * u }, { roof, wall: wood, floors: 1, roofKind: 'gable', roofMat: 'tile', wallH: 0.25, door_: 'none', windows: 0, trim: darken(wood, 0.3) });
    bunting(p, r.x + 0.25 * u, r.x + r.w - 0.25 * u, eave + 0.4 * u, cloth);
}

/** A string of little pennants, sagging between two points. */
function bunting(p: Pen, x0: number, x1: number, y: number, cloth: string): void {
    const u = p.u, n = Math.max(3, Math.round((x1 - x0) / (0.42 * u)));
    const at = (t: number) => y + Math.sin(t * Math.PI) * 0.25 * u;
    p.ctx.beginPath();
    p.ctx.moveTo(x0, y);
    for (let i = 1; i <= 24; i++) p.ctx.lineTo(x0 + (x1 - x0) * i / 24, at(i / 24));
    p.stroke(0.5);
    for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, py = at(t);
        p.poly([[x - 0.13 * u, py], [x + 0.13 * u, py], [x, py + 0.28 * u]]).paint(i % 2 ? lighten(cloth, 0.35) : cloth, 0.4);
    }
}

/** A watermill: a mill house with its wheel on the side; v1 of stone, v2 with a second storey. */
export function watermill(p: Pen, r: Rect, [roof, wall, wood]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    const ww = Math.min(1.6 * u, r.w * 0.32);
    building(p, { x: r.x, y: r.y, w: r.w - ww * 0.55, h: r.h }, {
        roof, wall, floors: v === 2 ? 2 : 1, roofKind: 'gable', roofMat: v === 1 ? 'slate' : 'thatch',
        wallMat: v === 1 ? 'stone' : 'timber', windowKind: 'leaded', windows: 2, door_: 'arched', door: wood, chimney: true, trim: darken(wood, 0.3),
    });
    /* The wheel, on its edge, in the race beside the house. */
    /* Drawn face-on so it reads at any zoom: rim, spokes, paddles, the race under it. */
    const rad = Math.min(ww * 0.62, 1.3 * u), cx = r.x + r.w - rad - 0.05 * u, cy = ground - rad - 0.05 * u;
    p.rr(cx - rad - 0.2 * u, ground - 0.3 * u, rad * 2 + 0.4 * u, 0.3 * u, 0.1 * u).fill('#5aa0d0').stroke(0.6);
    p.ell(cx, cy, rad, rad).fill(darken(wood, 0.45)).stroke();
    p.ell(cx, cy, rad - 0.16 * u, rad - 0.16 * u).fill('#3a5a6a').stroke(0.7);
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + 0.2;
        p.line([[cx, cy], [cx + Math.cos(a) * (rad - 0.1 * u), cy + Math.sin(a) * (rad - 0.1 * u)]], wood, 1.3);
        const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        p.line([[px, py], [px + Math.cos(a) * 0.2 * u, py + Math.sin(a) * 0.2 * u]], wood, 2.4);
    }
    p.ell(cx, cy, 0.14 * u, 0.14 * u).paint('#3a3430', 0.6);
    p.ell(cx + 0.2 * u, ground - 0.15 * u, rad * 0.7, 0.08 * u).fill('#ffffff');
}

/** A smithy: a house with an open forge under a lean-to; v1 of stone; v2 a lone open forge. */
export function smithy(p: Pen, r: Rect, [roof, wall, fire]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    const fw = v === 2 ? r.w : Math.min(2.2 * u, r.w * 0.45);
    if (v !== 2) {
        building(p, { x: r.x, y: r.y, w: r.w - fw + 0.1 * u, h: r.h }, {
            roof, wall, floors: 1, roofKind: 'gable', roofMat: v === 1 ? 'slate' : 'shingle', wallMat: v === 1 ? 'stone' : 'timber',
            windowKind: 'leaded', windows: 1, door_: 'arched', hangSign: '#c8b088', hangIcon: 'anvil', trim: '#4a3020',
        });
    }
    /* The lean-to: posts, a sloping roof, the hearth glowing under it. */
    const fx = r.x + r.w - fw, top = ground - 2.4 * u;
    p.rect(fx + 0.2 * u, top + 0.5 * u, fw - 0.4 * u, ground - top - 0.75 * u).fill(darken(wall, 0.45));
    for (const x of [fx + 0.1 * u, fx + fw - 0.25 * u]) p.rect(x, top + 0.4 * u, 0.15 * u, ground - top - 0.45 * u).paint('#6a4a2a', 0.7);
    const hx = fx + fw * 0.55, hy = ground - 1.15 * u;
    p.rect(hx - 0.55 * u, hy, 1.1 * u, 0.9 * u).shadeFill('#8a8070', hx - 0.55 * u, 0, hx + 0.55 * u, 0).stroke();
    p.rect(hx - 0.35 * u, hy + 0.15 * u, 0.7 * u, 0.3 * u).fill('#2a1a10');
    p.ell(hx, hy + 0.32 * u, 0.28 * u, 0.12 * u).fill(fire);
    p.ell(hx, hy + 0.3 * u, 0.14 * u, 0.06 * u).fill('#fff0a0');
    p.glow(hx, hy + 0.3 * u, 2 * u);
    p.rect(hx - 0.15 * u, top - 0.3 * u, 0.3 * u, hy - top + 0.3 * u).shadeFill('#8a8070', hx - 0.15 * u, 0, hx + 0.15 * u, 0).stroke(0.7);
    /* An anvil on its block. */
    const ax = fx + fw * 0.22, ay = ground - 0.55 * u;
    p.rect(ax - 0.12 * u, ay, 0.24 * u, 0.42 * u).paint('#6a4a2a', 0.6);
    p.poly([[ax - 0.3 * u, ay - 0.15 * u], [ax + 0.32 * u, ay - 0.15 * u], [ax + 0.15 * u, ay], [ax - 0.15 * u, ay]]).paint('#4a4a52', 0.6);
    p.poly([[fx - 0.05 * u, top + 0.6 * u], [fx + 0.1 * u, top], [fx + fw, top + 0.15 * u], [fx + fw + 0.1 * u, top + 0.7 * u]]).shadeFill(roof, 0, top, 0, top + 0.7 * u, 0.25).stroke();
}

/** A stable: a long low barn with half doors; v1 with a hayloft, v2 an open shelter. */
export function stable(p: Pen, r: Rect, [roof, wood, door]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    if (v === 2) {
        const top = ground - 2.2 * u;
        p.rect(r.x + 0.2 * u, top + 0.4 * u, r.w - 0.4 * u, ground - top - 0.6 * u).fill(darken(wood, 0.45));
        for (let i = 0; i < 4; i++) {
            const x = r.x + 0.15 * u + i * (r.w - 0.45 * u) / 3;
            p.rect(x, top + 0.3 * u, 0.15 * u, ground - top - 0.35 * u).paint(wood, 0.7);
        }
        p.line([[r.x + 0.2 * u, ground - 0.7 * u], [r.x + r.w - 0.2 * u, ground - 0.7 * u]], wood, 1.6);
        for (let i = 0; i < 3; i++) p.ell(r.x + (0.9 + i * 1.1) * u, ground - 0.3 * u, 0.35 * u, 0.15 * u).fill('#e0c060');
        building(p, { x: r.x, y: r.y, w: r.w, h: top - r.y + 0.6 * u }, { roof, wall: wood, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallH: 0.3, door_: 'none', windows: 0, trim: darken(wood, 0.3) });
        return;
    }
    building(p, r, {
        roof, wall: wood, floors: 1, roofKind: v === 1 ? 'cross' : 'gable', roofMat: v === 1 ? 'shingle' : 'thatch', wallMat: 'planks',
        windows: 0, door_: 'none', wallH: 1.9, trim: darken(wood, 0.35),
    });
    const n = Math.max(2, Math.floor(r.w / u / 1.3));
    for (let i = 0; i < n; i++) {
        const dw = 0.85 * u, dx = r.x + (r.w - n * 1.15 * u) / 2 + i * 1.15 * u + 0.15 * u, dy = ground - 1.45 * u;
        p.rect(dx, dy, dw, 0.55 * u).fill('#2a2018').stroke(0.6);
        p.rect(dx, dy + 0.55 * u, dw, 0.65 * u).fill(door).stroke(0.7);
        p.line([[dx, dy + 0.55 * u], [dx + dw, dy + 1.2 * u]], null, 0.6);
        if (i % 2 === 0) p.ell(dx + dw / 2, dy + 0.32 * u, 0.2 * u, 0.15 * u).fill('#8a5a3a');
    }
}

/** A round peasant hut of wattle and thatch; v1 a pair of them; v2 on stone footings. */
export function roundHut(p: Pen, r: Rect, [thatch, wall]: string[], _rot: boolean, v: number): void {
    const u = p.u;
    const one = (x: number, w: number, h: number) => {
        const ground = r.y + r.h, cx = x + w / 2, top = ground - h;
        p.groundShadow(cx, ground - 0.12 * u, w * 0.5, 0.2 * u);
        const wallTop = ground - Math.min(1.2 * u, h * 0.42);
        p.rr(x + 0.15 * u, wallTop, w - 0.3 * u, ground - wallTop - 0.05 * u, [0, 0, w * 0.25, w * 0.25]).shadeFill(wall, x, 0, x + w, 0, 0.35).stroke();
        for (let y = wallTop + 0.15 * u; y < ground - 0.1 * u; y += 0.16 * u) p.line([[x + 0.2 * u, y], [x + w - 0.2 * u, y]], darken(wall, 0.25), 0.5, 0.5);
        if (v === 2) {
            /* Stone footings: the lower half of the wall. */
            const fy = ground - (ground - wallTop) * 0.5, base = '#a8a090';
            p.rr(x + 0.15 * u, fy, w - 0.3 * u, ground - fy - 0.05 * u, [0, 0, w * 0.25, w * 0.25]).shadeFill(base, x, 0, x + w, 0, 0.35);
            courses(p, x + 0.15 * u, fy, w - 0.3 * u, ground - fy - 0.05 * u, base);
            p.rr(x + 0.15 * u, fy, w - 0.3 * u, ground - fy - 0.05 * u, [0, 0, w * 0.25, w * 0.25]).stroke();
        }
        p.rr(cx - 0.3 * u, ground - 0.95 * u, 0.6 * u, 0.9 * u, [0.3 * u, 0.3 * u, 0, 0]).fill('#2a2018').stroke(0.7);
        p.ctx.beginPath();
        p.ctx.moveTo(cx, top);
        p.ctx.quadraticCurveTo(x + w + 0.1 * u, wallTop - 0.4 * u, x + w + 0.1 * u, wallTop + 0.15 * u);
        p.ctx.quadraticCurveTo(cx, wallTop + 0.45 * u, x - 0.1 * u, wallTop + 0.15 * u);
        p.ctx.quadraticCurveTo(x - 0.1 * u, wallTop - 0.4 * u, cx, top);
        p.shadeFill(thatch, x, top, x + w, wallTop, 0.25).stroke();
        p.reseed(Math.round(x));
        for (let i = 0; i < 40; i++) {
            const t = p.rnd(), sx = x + 0.1 * u + p.rnd() * (w - 0.2 * u), sy = top + (wallTop - top) * (0.25 + t * 0.7);
            if (Math.abs(sx - cx) > (sy - top) / (wallTop - top) * w * 0.5) continue;
            p.line([[sx, sy], [sx + 0.02 * u, sy + 0.18 * u]], darken(thatch, 0.25), 0.5, 0.6);
        }
    };
    if (v === 1) {
        one(r.x + r.w * 0.42, r.w * 0.58, r.h * 0.95);
        one(r.x, r.w * 0.5, r.h * 0.8);
    } else {
        one(r.x, r.w, r.h);
    }
}

/* ------------------------------------------------------------- street */

/** Hay: a round bale (v0), a square bale (v1), a stack on a pole (v2). */
export function hay(p: Pen, r: Rect, [straw]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground - 0.1 * u, r.w * 0.45, 0.16 * u);
    if (v === 0) {
        p.ell(cx, ground - 0.5 * u, r.w * 0.42, 0.45 * u).shadeFill(straw, cx - r.w * 0.4, 0, cx + r.w * 0.4, 0, 0.3).stroke();
        p.ell(cx - r.w * 0.18, ground - 0.5 * u, 0.2 * u, 0.4 * u).fill(lighten(straw, 0.15)).stroke(0.5);
        p.ell(cx - r.w * 0.18, ground - 0.5 * u, 0.1 * u, 0.2 * u).stroke(0.4);
        return;
    }
    if (v === 1) {
        p.rect(r.x + 0.08 * u, ground - 0.7 * u, r.w - 0.16 * u, 0.62 * u).shadeFill(straw, 0, ground - 0.7 * u, 0, ground, 0.25).stroke();
        p.rect(r.x + 0.08 * u, ground - 0.9 * u, r.w - 0.16 * u, 0.22 * u).fill(lighten(straw, 0.12)).stroke(0.6);
        for (const t of [0.33, 0.66]) p.line([[r.x + r.w * t, ground - 0.9 * u], [r.x + r.w * t, ground - 0.08 * u]], '#8a5a3a', 0.8);
        return;
    }
    p.line([[cx, ground], [cx, r.y]], '#6a4a2a', 1.3);
    p.ctx.beginPath();
    p.ctx.moveTo(cx, r.y + 0.15 * u);
    p.ctx.quadraticCurveTo(r.x + r.w, ground - 0.8 * u, r.x + r.w - 0.05 * u, ground - 0.1 * u);
    p.ctx.lineTo(r.x + 0.05 * u, ground - 0.1 * u);
    p.ctx.quadraticCurveTo(r.x, ground - 0.8 * u, cx, r.y + 0.15 * u);
    p.shadeFill(straw, r.x, 0, r.x + r.w, 0, 0.3).stroke();
}

export function woodpile(p: Pen, r: Rect, [wood]: string[]): void {
    const u = p.u, ground = r.y + r.h;
    p.groundShadow(r.x + r.w / 2, ground - 0.1 * u, r.w * 0.5, 0.15 * u);
    const rad = 0.17 * u;
    for (let row = 0; row < 3; row++) {
        const n = Math.floor((r.w - 0.2 * u) / (rad * 2)) - row;
        const y = ground - rad - 0.05 * u - row * rad * 1.7;
        for (let i = 0; i < n; i++) {
            const x = r.x + 0.1 * u + rad + row * rad + i * rad * 2;
            p.ell(x, y, rad, rad).fill(lighten(wood, 0.25)).stroke(0.6);
            p.ell(x, y, rad * 0.45, rad * 0.45).stroke(0.35);
        }
    }
}

export function anvil(p: Pen, r: Rect, [metal]: string[]): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground - 0.1 * u, 0.4 * u, 0.12 * u);
    p.rect(cx - 0.22 * u, ground - 0.6 * u, 0.44 * u, 0.55 * u).shadeFill('#7a5a3a', cx - 0.22 * u, 0, cx + 0.22 * u, 0).stroke();
    p.poly([[cx - 0.42 * u, ground - 0.9 * u], [cx + 0.45 * u, ground - 0.9 * u], [cx + 0.2 * u, ground - 0.7 * u], [cx + 0.15 * u, ground - 0.6 * u], [cx - 0.15 * u, ground - 0.6 * u], [cx - 0.2 * u, ground - 0.7 * u]])
        .shadeFill(metal, cx - 0.4 * u, 0, cx + 0.4 * u, 0, 0.3).stroke();
    p.rect(cx - 0.4 * u, ground - 0.92 * u, 0.8 * u, 0.05 * u).shine(0.4);
}

export function dummy(p: Pen, r: Rect, [straw, cloth]: string[]): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground - 0.1 * u, 0.35 * u, 0.12 * u);
    p.line([[cx, ground], [cx, r.y + 0.6 * u]], '#6a4a2a', 1.6);
    p.line([[cx - 0.45 * u, r.y + 0.95 * u], [cx + 0.45 * u, r.y + 0.95 * u]], '#6a4a2a', 1.4);
    p.rr(cx - 0.28 * u, r.y + 0.75 * u, 0.56 * u, 0.85 * u, 0.2 * u).shadeFill(cloth, cx - 0.28 * u, 0, cx + 0.28 * u, 0).stroke();
    p.ell(cx, r.y + 0.48 * u, 0.22 * u, 0.24 * u).shadeFill(straw, cx - 0.2 * u, 0, cx + 0.2 * u, 0).stroke();
    p.line([[cx - 0.2 * u, r.y + 1.2 * u], [cx + 0.2 * u, r.y + 1.2 * u]], darken(cloth, 0.4), 0.8);
    p.ell(cx, r.y + 1.0 * u, 0.12 * u, 0.12 * u).stroke(0.6);
}

export function scarecrow(p: Pen, r: Rect, [cloth, hat]: string[]): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.line([[cx, ground], [cx, r.y + 0.6 * u]], '#6a4a2a', 1.4);
    p.line([[cx - 0.6 * u, r.y + 1.05 * u], [cx + 0.6 * u, r.y + 1.05 * u]], '#6a4a2a', 1.2);
    p.poly([[cx - 0.55 * u, r.y + 0.95 * u], [cx + 0.55 * u, r.y + 0.95 * u], [cx + 0.3 * u, r.y + 1.75 * u], [cx - 0.3 * u, r.y + 1.75 * u]]).shadeFill(cloth, cx - 0.5 * u, 0, cx + 0.5 * u, 0).stroke();
    p.line([[cx - 0.55 * u, r.y + 1.05 * u], [cx - 0.7 * u, r.y + 1.2 * u]], '#e0c060', 1);
    p.line([[cx + 0.55 * u, r.y + 1.05 * u], [cx + 0.7 * u, r.y + 1.2 * u]], '#e0c060', 1);
    p.ell(cx, r.y + 0.7 * u, 0.22 * u, 0.24 * u).paint('#e8d8a8');
    p.ell(cx, r.y + 0.48 * u, 0.4 * u, 0.08 * u).paint(hat, 0.7);
    p.poly([[cx - 0.2 * u, r.y + 0.48 * u], [cx + 0.2 * u, r.y + 0.48 * u], [cx, r.y + 0.12 * u]]).paint(hat, 0.7);
}

/** Fire on a stand: a brazier (v0), a torch post (v1). */
export function brazier(p: Pen, r: Rect, [metal, flame]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    if (v === 1) {
        p.line([[cx, ground], [cx, r.y + 0.6 * u]], '#5a3a24', 1.6);
        p.rect(cx - 0.1 * u, r.y + 0.45 * u, 0.2 * u, 0.25 * u).paint(metal, 0.6);
        p.ell(cx, r.y + 0.3 * u, 0.13 * u, 0.24 * u).fill(flame);
        p.ell(cx, r.y + 0.36 * u, 0.06 * u, 0.12 * u).fill('#fff0b0');
        p.glow(cx, r.y + 0.3 * u, 2 * u);
        return;
    }
    p.groundShadow(cx, ground - 0.1 * u, 0.35 * u, 0.12 * u);
    for (const s of [-1, 1]) p.line([[cx + s * 0.25 * u, ground - 0.05 * u], [cx + s * 0.1 * u, ground - 0.7 * u]], metal, 1.2);
    p.ctx.beginPath();
    p.ctx.ellipse(cx, ground - 0.85 * u, 0.36 * u, 0.3 * u, 0, 0, Math.PI);
    p.ctx.closePath();
    p.shadeFill(metal, cx - 0.3 * u, 0, cx + 0.3 * u, 0, 0.3).stroke();
    for (const [dx, h] of [[-0.12, 0.45], [0.1, 0.55], [0, 0.7]] as const) p.ell(cx + dx * u, ground - (0.85 + h / 2) * u, 0.12 * u, h / 2 * u).fill(flame);
    p.ell(cx, ground - 1.05 * u, 0.07 * u, 0.15 * u).fill('#fff0b0');
    p.glow(cx, ground - 1.0 * u, 2.4 * u);
}

/** A banner on a pole: long pennant (v0), square standard (v1), two crossed (v2). */
export function bannerPole(p: Pen, r: Rect, [cloth, trim]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground - 0.08 * u, 0.25 * u, 0.08 * u);
    const pole = (x: number, top: number) => {
        p.line([[x, ground], [x, top]], '#5a3a24', 1.4);
        p.ell(x, top, 0.07 * u, 0.07 * u).fill('#d0a840');
    };
    if (v === 2) {
        for (const s of [-1, 1]) {
            const tx = cx + s * 0.55 * u, ty = r.y + 0.2 * u;
            p.line([[cx - s * 0.2 * u, ground], [tx, ty]], '#5a3a24', 1.3);
            p.poly([[tx, ty + 0.05 * u], [tx - s * 0.55 * u, ty + 0.15 * u], [tx - s * 0.5 * u, ty + 0.75 * u], [tx - s * 0.05 * u, ty + 0.6 * u]]).paint(s < 0 ? cloth : trim, 0.6);
        }
        return;
    }
    pole(cx - 0.25 * u, r.y + 0.1 * u);
    if (v === 1) {
        p.line([[cx - 0.25 * u, r.y + 0.3 * u], [cx + 0.6 * u, r.y + 0.3 * u]], '#5a3a24', 1);
        p.rect(cx - 0.2 * u, r.y + 0.32 * u, 0.75 * u, 0.85 * u).shadeFill(cloth, cx - 0.2 * u, 0, cx + 0.55 * u, 0, 0.3).stroke(0.7);
        p.rect(cx - 0.2 * u, r.y + 0.32 * u, 0.75 * u, 0.14 * u).fill(trim);
        p.ell(cx + 0.18 * u, r.y + 0.8 * u, 0.16 * u, 0.16 * u).paint(trim, 0.5);
        return;
    }
    p.poly([[cx - 0.22 * u, r.y + 0.2 * u], [cx + 0.6 * u, r.y + 0.35 * u], [cx - 0.22 * u, r.y + 0.62 * u]]).paint(cloth, 0.7);
    p.line([[cx - 0.22 * u, r.y + 0.41 * u], [cx + 0.3 * u, r.y + 0.41 * u]], trim, 0.8);
}

export function trough(p: Pen, r: Rect, [wood, water]: string[]): void {
    const u = p.u, ground = r.y + r.h;
    p.groundShadow(r.x + r.w / 2, ground - 0.1 * u, r.w * 0.5, 0.15 * u);
    p.rect(r.x + 0.1 * u, ground - 0.65 * u, r.w - 0.2 * u, 0.5 * u).shadeFill(wood, 0, ground - 0.65 * u, 0, ground, 0.25).stroke();
    p.rect(r.x + 0.1 * u, ground - 0.8 * u, r.w - 0.2 * u, 0.2 * u).fill(lighten(wood, 0.1)).stroke(0.7);
    p.rect(r.x + 0.2 * u, ground - 0.76 * u, r.w - 0.4 * u, 0.12 * u).fill(water);
    for (const x of [r.x + 0.2 * u, r.x + r.w - 0.3 * u]) p.rect(x, ground - 0.2 * u, 0.1 * u, 0.15 * u).fill(darken(wood, 0.3));
}

export function beehive(p: Pen, r: Rect, [straw]: string[]): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground - 0.1 * u, 0.4 * u, 0.12 * u);
    p.rect(cx - 0.42 * u, ground - 0.35 * u, 0.84 * u, 0.12 * u).paint('#7a5a3a', 0.6);
    for (const s of [-1, 1]) p.line([[cx + s * 0.3 * u, ground - 0.25 * u], [cx + s * 0.3 * u, ground]], '#7a5a3a', 1);
    p.ctx.beginPath();
    p.ctx.ellipse(cx, ground - 0.35 * u, 0.36 * u, 0.7 * u, 0, Math.PI, 0);
    p.ctx.closePath();
    p.shadeFill(straw, cx - 0.35 * u, 0, cx + 0.35 * u, 0, 0.3).stroke();
    for (let y = ground - 0.5 * u; y > ground - 0.95 * u; y -= 0.15 * u) {
        const half = 0.36 * u * Math.sqrt(Math.max(0, 1 - ((ground - 0.35 * u - y) / (0.7 * u)) ** 2));
        p.line([[cx - half, y], [cx + half, y]], darken(straw, 0.3), 0.5, 0.7);
    }
    p.rr(cx - 0.08 * u, ground - 0.5 * u, 0.16 * u, 0.12 * u, 0.05 * u).fill('#2a2018');
}

/** A grave: a round stone (v0), a cross (v1), a slab with a carved top (v2). */
export function grave(p: Pen, r: Rect, [stone]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground - 0.12 * u, 0.4 * u, 0.12 * u);
    p.ell(cx, ground - 0.2 * u, 0.4 * u, 0.12 * u).fill('#6a8a4a');
    if (v === 1) {
        p.rect(cx - 0.09 * u, r.y + 0.15 * u, 0.18 * u, ground - r.y - 0.3 * u).shadeFill(stone, cx - 0.09 * u, 0, cx + 0.09 * u, 0).stroke();
        p.rect(cx - 0.32 * u, r.y + 0.4 * u, 0.64 * u, 0.16 * u).shadeFill(stone, 0, 0, 0, 0).stroke();
        return;
    }
    const w = v === 2 ? 0.7 * u : 0.56 * u, top = r.y + 0.25 * u;
    p.rr(cx - w / 2, top, w, ground - top - 0.2 * u, v === 2 ? [0.08 * u, 0.08 * u, 0, 0] : [w / 2, w / 2, 0, 0]).shadeFill(stone, cx - w / 2, 0, cx + w / 2, 0, 0.3).stroke();
    p.line([[cx - w * 0.25, top + 0.4 * u], [cx + w * 0.25, top + 0.4 * u]], null, 0.5);
    p.line([[cx - w * 0.25, top + 0.55 * u], [cx + w * 0.2, top + 0.55 * u]], null, 0.5);
    if (v === 2) p.poly([[cx - w / 2 - 0.05 * u, top], [cx, top - 0.2 * u], [cx + w / 2 + 0.05 * u, top]]).paint(stone, 0.7);
}

/** A row of crops on tilled ground (flat): wheat, cabbages, pumpkins. */
export function crops(p: Pen, r: Rect, [soil, plant]: string[], _rot: boolean, v: number): void {
    const u = p.u;
    p.rr(r.x + 0.05 * u, r.y + 0.05 * u, r.w - 0.1 * u, r.h - 0.1 * u, 0.1 * u).fill(soil).stroke(0.6);
    for (let y = r.y + 0.5 * u; y < r.y + r.h; y += 0.5 * u) p.line([[r.x + 0.15 * u, y], [r.x + r.w - 0.15 * u, y]], darken(soil, 0.25), 0.8, 0.8);
    p.reseed(Math.round(r.w * 5 + r.h));
    for (let y = r.y + 0.42 * u; y < r.y + r.h - 0.1 * u; y += 0.5 * u) {
        for (let x = r.x + 0.3 * u; x < r.x + r.w - 0.2 * u; x += v === 0 ? 0.18 * u : 0.48 * u) {
            if (v === 0) {
                p.line([[x, y], [x + 0.02 * u, y - 0.32 * u]], plant, 0.6);
                p.ell(x + 0.02 * u, y - 0.36 * u, 0.04 * u, 0.08 * u).fill(lighten(plant, 0.15));
            } else if (v === 1) {
                p.ell(x, y - 0.1 * u, 0.17 * u, 0.13 * u).paint(plant, 0.6);
                p.ell(x, y - 0.12 * u, 0.08 * u, 0.06 * u).fill(lighten(plant, 0.25));
            } else {
                if (p.rnd() < 0.35) { p.line([[x - 0.15 * u, y - 0.05 * u], [x + 0.2 * u, y - 0.12 * u]], plant, 0.8); continue; }
                p.ell(x, y - 0.12 * u, 0.18 * u, 0.13 * u).shadeFill('#e08030', x - 0.18 * u, 0, x + 0.18 * u, 0, 0.3).stroke(0.5);
                p.line([[x, y - 0.25 * u], [x + 0.03 * u, y - 0.32 * u]], darken(plant, 0.2), 0.8);
                p.ell(x - 0.16 * u, y - 0.2 * u, 0.09 * u, 0.06 * u).fill(plant);
            }
        }
    }
}

/** A low wall of fieldstone, or a palisade of sharpened stakes (v1). */
export function lowWall(p: Pen, r: Rect, [stone]: string[], rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    if (v === 1) {
        const stake = (x: number, y0: number, y1: number) => {
            p.rect(x - 0.12 * u, y0 + 0.15 * u, 0.24 * u, y1 - y0 - 0.15 * u).shadeFill(stone, x - 0.12 * u, 0, x + 0.12 * u, 0, 0.3).stroke(0.6);
            p.poly([[x - 0.12 * u, y0 + 0.16 * u], [x, y0], [x + 0.12 * u, y0 + 0.16 * u]]).paint(lighten(stone, 0.15), 0.6);
        };
        if (rot) { for (let y = r.y + 0.6 * u; y <= ground - 0.3 * u; y += 0.5 * u) stake(r.x + r.w / 2, y - 1.5 * u, y + 0.25 * u); return; }
        for (let x = r.x + 0.13 * u; x < r.x + r.w; x += 0.26 * u) stake(x, r.y + 0.05 * u, ground - 0.05 * u);
        p.line([[r.x, r.y + 0.75 * u], [r.x + r.w, r.y + 0.75 * u]], '#5a3a24', 1);
        return;
    }
    const block = (x: number, y: number, w: number, h: number) => {
        p.rect(x, y, w, h).shadeFill(stone, 0, y, 0, y + h, 0.2);
        courses(p, x, y, w, h, stone);
        p.rect(x, y, w, h).stroke();
        p.rr(x - 0.04 * u, y - 0.18 * u, w + 0.08 * u, 0.22 * u, 0.08 * u).paint(lighten(stone, 0.1), 0.7);
    };
    if (rot) { block(r.x + 0.2 * u, r.y + 0.3 * u, r.w - 0.4 * u, r.h - 0.35 * u); return; }
    block(r.x, r.y + 0.25 * u, r.w, r.h - 0.3 * u);
}

/** A wayside shrine: a carved cross on steps (v0), a little roofed shrine (v1). */
export function wayside(p: Pen, r: Rect, [stone, roof]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    p.groundShadow(cx, ground - 0.1 * u, 0.4 * u, 0.12 * u);
    p.rect(cx - 0.4 * u, ground - 0.25 * u, 0.8 * u, 0.2 * u).paint(darken(stone, 0.1), 0.6);
    if (v === 0) {
        p.rect(cx - 0.1 * u, r.y + 0.15 * u, 0.2 * u, ground - r.y - 0.4 * u).shadeFill(stone, cx - 0.1 * u, 0, cx + 0.1 * u, 0).stroke();
        p.rect(cx - 0.35 * u, r.y + 0.45 * u, 0.7 * u, 0.18 * u).paint(stone, 0.8);
        p.ell(cx, r.y + 0.54 * u, 0.2 * u, 0.2 * u).stroke(0.7);
        return;
    }
    p.rect(cx - 0.1 * u, r.y + 0.9 * u, 0.2 * u, ground - r.y - 1.1 * u).paint('#6a4a2a', 0.7);
    p.rect(cx - 0.3 * u, r.y + 0.45 * u, 0.6 * u, 0.5 * u).shadeFill(stone, cx - 0.3 * u, 0, cx + 0.3 * u, 0).stroke();
    p.rr(cx - 0.15 * u, r.y + 0.55 * u, 0.3 * u, 0.32 * u, [0.15 * u, 0.15 * u, 0, 0]).fill('#2a2018');
    p.ell(cx, r.y + 0.75 * u, 0.06 * u, 0.06 * u).fill('#f0c050');
    p.poly([[cx - 0.42 * u, r.y + 0.5 * u], [cx, r.y + 0.12 * u], [cx + 0.42 * u, r.y + 0.5 * u]]).paint(roof);
}
