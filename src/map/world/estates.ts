import type { Pen, Rect } from './looks';
import { darken, lighten, mix } from './looks';
import { building } from './buildings';
import type { BuildingSpec } from './buildings';
import { gatehouse, keep, roundTower } from './medieval';
import { castleRun, metalGateRun, railingsRun } from './walls';
import type { Pt } from './walls';
import { below, collapsed, ragged, rubble, shell } from './damage';

/* Medieval homes for every walk of life, and the castle (owner's ask,
   2026-11-10): a whole castle as one structure, a noble's palace, poor
   wooden hovels, burghers' and artisans' houses, farmhouses, rows of
   commoners' houses, and houses ruined or burned. Same conventions as
   medieval.ts: `r` is the sprite in px, its bottom edge the footprint's
   front; `v` is the variant. */

/** A straight run of castle wall drawn as cell-long pieces, back to front. */
function wallLine(p: Pen, a: Pt, b: Pt, stone: string, v: number): void {
    const u = p.u, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(L / u));
    for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        castleRun(p, [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], [stone], v);
    }
}

/** A round tower at a ground point, maybe broken off. */
function towerAt(p: Pen, cx: number, base: number, w: number, h: number, stone: string, roof: string | null, ruined: boolean): void {
    const u = p.u, r: Rect = { x: cx - w / 2, y: base - h, w, h };
    if (!ruined) { roundTower(p, r, stone, roof, r.y + (roof ? 1.5 * u : 0.6 * u)); return; }
    const top = ragged(p, r.x - 0.2 * u, r.x + r.w + 0.2 * u, r.y + h * (0.35 + p.rnd() * 0.2), 0.45 * u, 0.4 * u);
    below(p, top, () => roundTower(p, r, stone, null, r.y + 0.6 * u));
    for (let i = 0; i < 3; i++) p.ell(r.x + r.w * (0.25 + p.rnd() * 0.5), r.y + h * (0.5 + p.rnd() * 0.35), 0.3 * u, 0.22 * u).fill('#4a7a3a');
    rubble(p, r.x, base + 0.05 * u, r.w, stone, 4);
}

/** A whole castle: curtain walls, four towers, a gatehouse, the keep and a
    hall in the ward. v0 grey and battlemented, v1 with tall roofs (a
    fairy-tale castle), v2 a ruin. */
export function castle(p: Pen, r: Rect, [stone, roof, flag]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    const back = ground - 9.1 * u, front = ground - 0.75 * u;
    const lx = r.x + 1.3 * u, rx = r.x + r.w - 1.3 * u;
    const ruined = v === 2, wv = ruined ? 2 : 0;
    const towerRoof = v === 1 ? roof : null;
    p.reseed(Math.round(r.w + r.h * 3 + v));

    /* The ward: packed earth, a worn track from the gate to the keep. */
    const ward = mix(stone, '#b8a070', 0.65);
    p.rect(lx, back, rx - lx, front - back).fill(ward).stroke(0.6);
    p.poly([[cx - 0.8 * u, front], [cx + 0.8 * u, front], [cx + 0.6 * u, back + 4 * u], [cx - 0.6 * u, back + 4 * u]]).fill(lighten(ward, 0.12));
    if (ruined) for (let i = 0; i < 8; i++) p.ell(lx + p.rnd() * (rx - lx), back + 1 * u + p.rnd() * (front - back - 2 * u), 0.35 * u, 0.2 * u).fill('#6a9a4a');

    /* The far wall and its towers. */
    wallLine(p, [lx, back], [rx, back], stone, wv);
    for (const x of [lx, rx]) towerAt(p, x, back + 0.9 * u, 2.6 * u, 5.4 * u, stone, towerRoof, ruined);

    /* The keep, at the back of the ward. */
    const kw = v === 1 ? 7 * u : 5.4 * u, kBase = back + 4.2 * u;
    const kr: Rect = { x: cx - kw / 2, y: r.y + (v === 1 ? 0 : 0.6 * u), w: kw, h: kBase - r.y - (v === 1 ? 0 : 0.6 * u) };
    if (ruined) {
        shell(p, { x: kr.x, y: kBase - 7.2 * u, w: kw, h: 7.2 * u }, { wall: stone, mat: 'stone', depth: 3, wallH: 4.2, floors: 2, windows: 2, floor: darken(ward, 0.15) });
    } else {
        keep(p, kr, [stone, roof, flag], false, v === 1 ? 1 : 0);
    }

    /* A hall and a barracks in the ward, mostly behind the front wall. */
    const hall: BuildingSpec = { roof, wall: stone, floors: 1, roofKind: 'gable', roofMat: 'slate', wallMat: 'stone', windowKind: 'arched', windows: 2, door_: 'arched', chimney: true };
    const hb = front - 1.7 * u;
    if (ruined) {
        shell(p, { x: lx + 0.7 * u, y: hb - 4.2 * u, w: 3.6 * u, h: 4.2 * u }, { wall: stone, mat: 'stone', depth: 2.2, wallH: 1.9, floors: 1, windows: 2, floor: darken(ward, 0.15) });
    } else {
        building(p, { x: lx + 0.7 * u, y: hb - 4.4 * u, w: 3.6 * u, h: 4.4 * u }, hall);
        building(p, { x: rx - 4.3 * u, y: hb - 3.8 * u, w: 3.6 * u, h: 3.8 * u }, { ...hall, roofMat: 'tile', windowKind: 'slit', windows: 3, chimney: false, door_: 'wood', door: '#6a4a2a' });
    }

    /* The side walls, far end first, then the front with the gatehouse. */
    const sideN = Math.max(1, Math.round((front - back) / u));
    for (let i = 0; i < sideN; i++) {
        const y0 = back + (front - back) * i / sideN, y1 = back + (front - back) * (i + 1) / sideN;
        for (const x of [lx, rx]) castleRun(p, [x, y0], [x, y1], [stone], wv);
    }
    const gw = 5.4 * u;
    wallLine(p, [lx, front], [cx - gw / 2 + 0.4 * u, front], stone, wv);
    wallLine(p, [cx + gw / 2 - 0.4 * u, front], [rx, front], stone, wv);
    const gr: Rect = { x: cx - gw / 2, y: ground - 6.6 * u, w: gw, h: 6.5 * u };
    if (ruined) {
        below(p, ragged(p, gr.x - 0.2 * u, gr.x + gr.w + 0.2 * u, gr.y + 2.8 * u, 0.6 * u, 0.45 * u), () => gatehouse(p, gr, [stone, '#4a3a2a', flag], false, 1));
        rubble(p, gr.x, ground + 0.05 * u, gr.w, stone, 6);
    } else {
        gatehouse(p, gr, [stone, '#5a3a24', flag], false, v === 1 ? 2 : 0);
    }
    for (const x of [lx, rx]) towerAt(p, x, ground - 0.1 * u, 2.9 * u, 6 * u, stone, towerRoof, ruined);
    if (!ruined) for (const x of [lx, rx]) {
        p.line([[x, ground - 6 * u + (towerRoof ? 0.1 : 0.4) * u], [x, ground - 6.9 * u]], '#3a3430', 1.1);
        p.poly([[x, ground - 6.9 * u], [x + 0.6 * u, ground - 6.75 * u], [x, ground - 6.55 * u]]).paint(flag, 0.6);
    }
}

/** A noble's palace: a palazzo (v0), with towers at both ends (v1), behind a forecourt and railings (v2). */
export function palace(p: Pen, r: Rect, [roof, wall, trim]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    const arms = (q: Pen, x: number, y: number) => {
        q.poly([[x - 0.35 * u, y + 0.15 * u], [x + 0.35 * u, y + 0.15 * u], [x + 0.35 * u, y + 0.6 * u], [x, y + 0.9 * u], [x - 0.35 * u, y + 0.6 * u]]).shadeFill(trim, x - 0.35 * u, 0, x + 0.35 * u, 0, 0.3).stroke(0.7);
        q.line([[x, y + 0.2 * u], [x, y + 0.8 * u]], '#f4ecd8', 0.9);
    };
    const main = (b: Rect, more: Partial<BuildingSpec> = {}) => building(p, b, {
        roof, wall, floors: 3, roofKind: 'hip', roofMat: 'tile', lowerMat: 'stone', lowerWall: darken(wall, 0.12),
        windowKind: 'arched', windows: Math.max(3, Math.round(b.w / u / 1.35)), door_: 'double', door: '#5a3020', trim, glass: undefined,
        sign: (q, x, y) => arms(q, x, y), ...more,
    });
    /* A cornice under the eaves and a balcony over the door. */
    const dress = (b: Rect, floors: number) => {
        const wallTop = b.y + b.h - (floors * 1.4 + 0.45) * u;
        p.rect(b.x + 0.1 * u, wallTop + 0.16 * u, b.w - 0.2 * u, 0.14 * u).fill(lighten(trim, 0.15)).stroke(0.6);
        const by = b.y + b.h - 0.26 * u - (b.h > 0 ? 1.55 * u : 0);
        p.rect(cx - 1.0 * u, by, 2.0 * u, 0.12 * u).fill(trim).stroke(0.6);
        for (let x = cx - 0.95 * u; x <= cx + 0.95 * u; x += 0.19 * u) p.line([[x, by - 0.38 * u], [x, by]], trim, 0.8);
        p.line([[cx - 1.0 * u, by - 0.4 * u], [cx + 1.0 * u, by - 0.4 * u]], trim, 1.4);
    };
    if (v === 1) {
        const tw = 2.6 * u, body: Rect = { x: r.x + tw - 0.2 * u, y: r.y + 1.4 * u, w: r.w - 2 * tw + 0.4 * u, h: r.h - 1.4 * u };
        main(body);
        dress(body, 3);
        for (const x of [r.x, r.x + r.w - tw]) {
            building(p, { x, y: r.y, w: tw, h: r.h }, {
                roof, wall, floors: 4, roofKind: 'hip', roofMat: 'slate', lowerMat: 'stone', lowerWall: darken(wall, 0.12),
                windowKind: 'tall', windows: 1, door_: 'none', trim,
            });
            p.line([[x + tw / 2, r.y + 0.1 * u], [x + tw / 2, r.y - 0.5 * u]], trim, 1.4);
            p.ell(x + tw / 2, r.y - 0.55 * u, 0.12 * u, 0.12 * u).fill(trim);
        }
        return;
    }
    if (v === 2) {
        const yard = 2.8 * u, body: Rect = { x: r.x + 0.6 * u, y: r.y, w: r.w - 1.2 * u, h: r.h - yard };
        building(p, body, {
            roof, wall, floors: 2, roofKind: 'mansard', roofMat: 'slate', lowerMat: 'stone', lowerWall: darken(wall, 0.12), windowKind: 'tall',
            windows: Math.round(body.w / u / 1.3), door_: 'double', door: '#5a3020', trim, dormers: 4, chimney: true, chimney2: true, columns: 4,
            sign: (q, x, y) => arms(q, x, y),
        });
        /* The forecourt: gravel, clipped trees, railings and a gate. */
        p.rect(r.x + 0.2 * u, ground - yard, r.w - 0.4 * u, yard - 0.1 * u).fill('#d8ccb0').stroke(0.5);
        p.poly([[cx - 0.9 * u, ground - yard], [cx + 0.9 * u, ground - yard], [cx + 1.3 * u, ground - 0.2 * u], [cx - 1.3 * u, ground - 0.2 * u]]).fill('#e8dec8');
        for (const x of [r.x + 1.6 * u, r.x + r.w - 1.6 * u]) {
            p.groundShadow(x, ground - 1.2 * u, 0.5 * u, 0.16 * u);
            p.poly([[x, ground - 2.9 * u], [x + 0.45 * u, ground - 1.25 * u], [x - 0.45 * u, ground - 1.25 * u]]).shadeFill('#3e7a44', x - 0.45 * u, 0, x + 0.45 * u, 0, 0.3).stroke(0.7);
        }
        const y = ground - 0.35 * u, gate = 1.5 * u;
        railingsRun(p, [r.x + 0.3 * u, y], [cx - gate, y], [darken(trim, 0.6), darken(wall, 0.15)], 1);
        railingsRun(p, [cx + gate, y], [r.x + r.w - 0.3 * u, y], [darken(trim, 0.6), darken(wall, 0.15)], 1);
        metalGateRun(p, [cx - gate, y], [cx + gate, y], [darken(trim, 0.6), darken(wall, 0.15)], 0);
        return;
    }
    main(r);
    dress(r, 3);
}

/** A hovel: crooked planks and patched thatch (v0), a lean-to shack (v1), wattle and daub (v2). */
export function hovel(p: Pen, r: Rect, [roof, wall, door]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    p.reseed(Math.round(r.w * 7 + v));
    if (v === 1) {
        building(p, r, { roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'planks', windows: 0, wallH: 1.15, door_: 'none', trim: '#4a3020' });
        /* A sacking curtain for a door, and the poles holding the roof up. */
        const dx = r.x + r.w / 2 - 0.4 * u, dy = ground - 1.15 * u;
        p.poly([[dx, dy], [dx + 0.8 * u, dy], [dx + 0.8 * u, ground - 0.3 * u], [dx + 0.6 * u, ground - 0.2 * u], [dx + 0.4 * u, ground - 0.32 * u], [dx + 0.2 * u, ground - 0.2 * u], [dx, ground - 0.3 * u]])
            .shadeFill(door, dx, 0, dx + 0.8 * u, 0, 0.3).stroke(0.7);
        for (const x of [r.x + 0.25 * u, r.x + r.w - 0.25 * u]) p.line([[x, ground], [x - 0.08 * u, ground - 1.5 * u]], '#5a4028', 2.2);
        p.rect(r.x + r.w - 0.9 * u, ground - 0.5 * u, 0.6 * u, 0.45 * u).paint('#8a6a48', 0.6);
        return;
    }
    if (v === 2) {
        building(p, r, { roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'plaster', windows: 1, windowKind: 'slit', wallH: 1.5, door_: 'wood', trim: '#5a4028' });
        /* Daub fallen off, the woven wattle showing. */
        const px = r.x + 0.5 * u, py = ground - 1.0 * u, pw = 0.7 * u, ph = 0.5 * u;
        p.ell(px + pw / 2, py + ph / 2, pw / 2, ph / 2).fill(darken(wall, 0.25));
        p.ctx.save();
        p.ell(px + pw / 2, py + ph / 2, pw / 2, ph / 2);
        p.ctx.clip();
        for (let x = px; x < px + pw; x += 0.14 * u) p.line([[x, py], [x, py + ph]], '#6a4a2a', 1.4);
        for (let y = py + 0.08 * u; y < py + ph; y += 0.14 * u) p.line([[px, y], [px + pw, y + 0.04 * u]], '#9a7a50', 1.2);
        p.ctx.restore();
        p.ell(px + pw / 2, py + ph / 2, pw / 2, ph / 2).stroke(0.6);
        return;
    }
    building(p, r, { roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'planks', windows: 1, windowKind: 'slit', wallH: 1.35, door_: 'wood', trim: '#4a3020' });
    /* Patches on the thatch, a board nailed across, a log propping a wall. */
    for (let i = 0; i < 3; i++) {
        const x = r.x + (0.3 + p.rnd() * (r.w / u - 1.2)) * u, y = r.y + (0.5 + p.rnd() * 0.8) * u;
        p.rect(x, y, (0.5 + p.rnd() * 0.3) * u, 0.32 * u).paint(i % 2 ? darken(roof, 0.25) : lighten(roof, 0.15), 0.6);
    }
    p.line([[r.x + 0.3 * u, ground - 0.9 * u], [r.x + 1.0 * u, ground - 0.6 * u]], darken(wall, 0.3), 2.6);
    p.line([[r.x - 0.05 * u, ground], [r.x + 0.3 * u, ground - 1.2 * u]], '#5a4028', 2.6);
}

/** A rich burgher's house: stone with a stepped gable (v0), painted with an oriel (v1), with a tower (v2). */
export function burgherHouse(p: Pen, r: Rect, [roof, wall, trim]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    if (v === 1) {
        building(p, r, { roof, wall, floors: 3, roofKind: 'cross', roofMat: 'tile', wallMat: 'plaster', windowKind: 'leaded', windows: 2, door_: 'double', door: '#5a3020', trim, boxes: '#e05080', jetty: true, chimney: true });
        /* An oriel: a bay of windows standing out from the upper storey. */
        const ox = r.x + r.w - 1.5 * u, oy = ground - 3.7 * u, ow = 1.0 * u, oh = 1.3 * u;
        p.rect(ox, oy, ow, oh).shadeFill(wall, ox, 0, ox + ow, 0, 0.25).stroke();
        p.glass(ox + 0.15 * u, oy + 0.2 * u, ow - 0.3 * u, oh - 0.45 * u, true);
        p.poly([[ox, oy + oh], [ox + ow, oy + oh], [ox + ow / 2, oy + oh + 0.45 * u]]).fill(trim).stroke(0.7);
        p.poly([[ox - 0.08 * u, oy], [ox + ow / 2, oy - 0.6 * u], [ox + ow + 0.08 * u, oy]]).paint(roof, 0.8);
        return;
    }
    if (v === 2) {
        building(p, r, { roof, wall, floors: 3, roofKind: 'hip', roofMat: 'slate', wallMat: 'stone', windowKind: 'tall', windows: 2, door_: 'double', door: '#5a3020', trim, shutters: trim,
            annex: { side: 'right', w: 1.6, floors: 4, wallH: 6.2, roofKind: 'hip', roofMat: 'slate', windows: 1, windowKind: 'slit', door_: 'none', shutters: undefined } });
        return;
    }
    /* A front gable stepped like a stair, the roof running back behind it. */
    const wallH = 4.5 * u, wallTop = ground - wallH, gTop = r.y + 0.3 * u;
    p.poly([[r.x + 0.25 * u, wallTop + 0.2 * u], [cx, gTop - 0.5 * u], [r.x + r.w - 0.25 * u, wallTop + 0.2 * u]]).shadeFill(roof, r.x, 0, r.x + r.w, 0, 0.35).stroke();
    building(p, { x: r.x, y: wallTop - 0.4 * u, w: r.w, h: wallH + 0.4 * u }, { roof: wall, wall, floors: 3, roofKind: 'flat', wallMat: 'stone', windowKind: 'tall', windows: 2, door_: 'double', door: '#5a3020', trim, shutters: trim, wallH: 4.5 });
    const steps = 4, sw = (r.w - 0.3 * u) / 2 / steps, sh = (wallTop - gTop) / steps;
    const pts: [number, number][] = [[r.x + 0.15 * u, wallTop + 0.05 * u]];
    for (let i = 0; i < steps; i++) {
        const x = r.x + 0.15 * u + i * sw, y = wallTop - i * sh;
        pts.push([x, y - sh], [x + sw, y - sh]);
    }
    for (let i = steps - 1; i >= 0; i--) {
        const x = r.x + r.w - 0.15 * u - i * sw, y = wallTop - i * sh;
        pts.push([x - sw, y - sh], [x, y - sh]);
    }
    pts.push([r.x + r.w - 0.15 * u, wallTop + 0.05 * u]);
    p.poly(pts).shadeFill(wall, 0, gTop, 0, wallTop, 0.15);
    p.poly(pts).stroke();
    for (const [x, y] of pts.slice(1, -1).filter((_, i) => i % 2 === 0)) p.rect(x - 0.04 * u, y - 0.06 * u, sw + 0.08 * u, 0.12 * u).fill(lighten(wall, 0.15)).stroke(0.5);
    p.ell(cx, wallTop - (wallTop - gTop) * 0.4, 0.32 * u, 0.32 * u).fill(trim).stroke(0.7);
    p.glass(cx - 0.2 * u, wallTop - (wallTop - gTop) * 0.4 - 0.2 * u, 0.4 * u, 0.4 * u, true);
}

/** A row of commoners' houses side by side: three (v0), four narrow (v1), two with an archway between (v2). */
export function rowHouses(p: Pen, r: Rect, [roof, wall, beam]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    const tints = [wall, mix(wall, '#e8c890', 0.45), mix(wall, '#c8d8b8', 0.45), mix(wall, '#e0b8a8', 0.45)];
    const roofs = [roof, darken(roof, 0.12), lighten(roof, 0.1), mix(roof, '#4a4a58', 0.4)];
    const n = v === 1 ? 4 : v === 2 ? 3 : 3;
    const widths = v === 2 ? [0.4, 0.2, 0.4] : Array(n).fill(1 / n);
    let x = r.x;
    widths.forEach((f, i) => {
        const w = r.w * f, low = [0.4, 0, 0.8, 0.25][i % 4] * u;
        const b: Rect = { x: x - (i ? 0.05 * u : 0), y: r.y + low, w: w + (i ? 0.05 * u : 0), h: r.h - low };
        if (v === 2 && i === 1) {
            /* The upper storey bridging a passage. */
            building(p, b, { roof: roofs[1], wall: tints[1], floors: 2, roofKind: 'gable', roofMat: 'tile', wallMat: 'timber', trim: beam, windowKind: 'leaded', windows: 1, door_: 'none', jetty: true });
            const aw = w - 0.5 * u, ah = 1.5 * u;
            p.rr(x + 0.25 * u, ground - ah, aw, ah, [aw / 2, aw / 2, 0, 0]).fill('#2a2420').stroke();
            p.rect(x + 0.25 * u, ground - 0.25 * u, aw, 0.2 * u).fill('#8a7a68');
        } else {
            building(p, b, {
                roof: roofs[i % 4], wall: tints[i % 4], floors: (i % 2 ? 3 : 2) - (v === 1 && i % 2 ? 1 : 0), roofKind: i % 2 ? 'cross' : 'gable',
                roofMat: i % 3 === 0 ? 'thatch' : i % 3 === 1 ? 'tile' : 'shingle', wallMat: 'timber', trim: beam, jetty: i % 2 === 0,
                windowKind: 'leaded', windows: Math.max(1, Math.round(w / u / 1.4)), door_: 'arched', chimney: i % 2 === 1, boxes: i === 0 ? '#e05080' : undefined,
            });
        }
        x += w;
    });
}

/** A ruined house: the roof fallen in (v0), only walls left (v1), a heap of rubble (v2). */
export function ruinedHouse(p: Pen, r: Rect, [wall, roof]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    if (v === 0) {
        collapsed(p, r, { roof, wall, door: '#5a4028', floors: 1, roofKind: 'gable', roofMat: 'slate', wallMat: 'stone', windowKind: 'arched', windows: 2, door_: 'arched', wallH: 1.9 });
        return;
    }
    if (v === 1) {
        shell(p, r, { wall, mat: 'stone', depth: 3, wallH: 2.0, floors: 1, windows: 2, floor: mix(roof, '#6a5a40', 0.6) });
        return;
    }
    /* One corner still standing over a heap. */
    p.reseed(Math.round(r.w * 13));
    const cw = 1.3 * u, top = ground - 2.4 * u;
    below(p, ragged(p, r.x + 0.2 * u, r.x + 0.2 * u + cw, top, 0.4 * u, 0.3 * u), () => {
        p.rect(r.x + 0.2 * u, top - 0.6 * u, cw, ground - top + 0.6 * u - 0.6 * u).shadeFill(wall, 0, top, 0, ground, 0.2);
        p.rect(r.x + 0.2 * u, top - 0.6 * u, cw, ground - top).stroke();
    });
    const mound: [number, number][] = [[r.x + 0.3 * u, ground - 0.05 * u]];
    for (let x = r.x + 0.6 * u; x < r.x + r.w - 0.3 * u; x += 0.4 * u) mound.push([x, ground - (0.6 + Math.sin((x - r.x) / r.w * Math.PI) * 0.9 + p.rnd() * 0.25) * u]);
    mound.push([r.x + r.w - 0.2 * u, ground - 0.05 * u]);
    p.poly(mound).shadeFill(darken(wall, 0.1), 0, ground - 1.6 * u, 0, ground, 0.3).stroke();
    for (let i = 0; i < 4; i++) rubble(p, r.x + 0.5 * u, ground - (0.2 + i * 0.35) * u, r.w - 1 * u - i * 0.5 * u, i % 2 ? wall : lighten(wall, 0.08), 6 - i);
    p.line([[r.x + 1.4 * u, ground - 1.0 * u], [r.x + r.w - 0.8 * u, ground - 1.9 * u]], roof, 3);
    p.line([[r.x + 2.0 * u, ground - 0.5 * u], [r.x + r.w - 0.5 * u, ground - 0.9 * u]], roof, 2.6);
}

/** A burned house: a charred timber frame (v0), still smouldering (v1), a gutted stone shell (v2). */
export function burnedHouse(p: Pen, r: Rect, [wall, ember]: string[], _rot: boolean, v: number): void {
    if (v === 1) {
        collapsed(p, r, { roof: '#5a4a3a', wall, door: '#3a2a20', floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'timber', trim: '#1a1410', windowKind: 'leaded', windows: 2, door_: 'arched', wallH: 1.9 }, true, ember);
        return;
    }
    shell(p, r, v === 0
        ? { wall, mat: 'timber', depth: 3, wallH: 1.9, floors: 1, windows: 2, floor: '#3a3430', burned: true, posts: true, ember }
        : { wall, mat: 'stone', depth: 3, wallH: 2.2, floors: 1, windows: 2, floor: '#4a4440', burned: true });
}
