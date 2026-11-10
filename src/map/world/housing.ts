import type { Pen, Rect } from './looks';
import { darken, lighten, mix } from './looks';
import { building } from './buildings';
import type { BuildingSpec } from './buildings';
import { roundTower } from './medieval';
import { collapsed, shell } from './damage';

/* Modern homes from the poorest to the richest (owner's ask, 2026-11-10):
   shacks and trailers, terraces and housing blocks, mansions and luxury
   villas, and houses ruined or burned. Same conventions as modern.ts. */

/** A shack: corrugated iron (v0), plywood under a tarp (v1), two shacks leaning together (v2). */
export function shack(p: Pen, r: Rect, [roof, wall, patch]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    const one = (b: Rect, ply: boolean, seed: number) => {
        p.reseed(seed);
        building(p, b, ply
            ? { roof, wall, door: darken(wall, 0.3), floors: 1, roofKind: 'gable', roofMat: 'tarp', wallMat: 'planks', windows: 1, windowKind: 'square', wallH: 1.4, door_: 'wood', trim: darken(wall, 0.3) }
            : { roof, wall, door: darken(wall, 0.25), floors: 1, roofKind: 'gable', roofMat: 'metal', wallMat: 'metal', windows: 1, windowKind: 'square', wallH: 1.4, door_: 'wood', trim: darken(wall, 0.35) });
        /* Patches: rust or odd boards, and an old tyre weighing the roof down. */
        for (let i = 0; i < 3; i++) {
            const x = b.x + (0.2 + p.rnd() * (b.w / p.u - 1)) * u, y = i ? b.y + (0.4 + p.rnd() * 0.6) * u : ground - (0.5 + p.rnd() * 0.6) * u;
            p.rect(x, y, (0.4 + p.rnd() * 0.35) * u, (0.3 + p.rnd() * 0.2) * u).paint(patch, 0.6);
        }
        p.ell(b.x + b.w * 0.7, b.y + 0.9 * u, 0.28 * u, 0.14 * u).paint('#2a2a2a', 0.6);
        p.ell(b.x + b.w * 0.7, b.y + 0.9 * u, 0.12 * u, 0.06 * u).fill('#6a6a6a');
    };
    if (v === 2) {
        one({ x: r.x + r.w * 0.42, y: r.y + 0.3 * u, w: r.w * 0.58, h: r.h - 0.3 * u }, true, 7);
        one({ x: r.x, y: r.y, w: r.w * 0.55, h: r.h }, false, 3);
        return;
    }
    one(r, v === 1, 5);
}

/** A mobile home: single-wide (v0), double-wide with a porch (v1), a vintage camper (v2). */
export function trailer(p: Pen, r: Rect, [body, stripe, skirt]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    if (v === 1) {
        building(p, { x: r.x, y: r.y, w: r.w, h: r.h - 0.3 * u }, { roof: skirt, wall: body, floors: 1, roofKind: 'gable', roofMat: 'shingle', wallMat: 'siding', windows: 3, door_: 'wood', door: stripe, porch: stripe, wallH: 1.5, trim: darken(body, 0.2) });
        p.rect(r.x + 0.15 * u, ground - 0.42 * u, r.w - 0.3 * u, 0.4 * u).fill(skirt).stroke(0.6);
        for (let x = r.x + 0.4 * u; x < r.x + r.w - 0.2 * u; x += 0.3 * u) p.line([[x, ground - 0.42 * u], [x, ground - 0.02 * u]], null, 0.4, 0.5);
        return;
    }
    const camper = v === 2;
    const bx = r.x + 0.15 * u, bw = r.w - 0.3 * u, top = r.y + 0.35 * u, base = ground - (camper ? 0.45 : 0.4) * u, rad = camper ? 0.9 * u : 0.18 * u;
    p.groundShadow(r.x + r.w / 2, ground - 0.1 * u, r.w * 0.52, 0.3 * u);
    if (camper) {
        for (const x of [bx + bw * 0.3, bx + bw * 0.7]) p.ell(x, ground - 0.3 * u, 0.28 * u, 0.28 * u).paint('#2a2a2a', 0.7);
        p.line([[bx + bw, base - 0.3 * u], [bx + bw + 0.4 * u, ground - 0.25 * u]], '#3a3a3a', 1.6);
    } else {
        p.rect(bx + 0.1 * u, base, bw - 0.2 * u, ground - base - 0.02 * u).fill(skirt).stroke(0.6);
        for (let x = bx + 0.35 * u; x < bx + bw - 0.2 * u; x += 0.3 * u) p.line([[x, base], [x, ground - 0.02 * u]], null, 0.4, 0.5);
    }
    /* The roof seen from the slant, then the long side facing us. */
    const side = base - (camper ? 1.6 : 1.55) * u;
    p.rr(bx, top, bw, side - top + rad, rad).fill(lighten(body, 0.08)).stroke();
    p.rr(bx, side, bw, base - side, [0, 0, rad * 0.5, rad * 0.5]).shadeFill(body, 0, side, 0, base, 0.2).stroke();
    if (camper) {
        for (let x = bx + 0.3 * u; x < bx + bw; x += 0.3 * u) p.line([[x, top + 0.2 * u], [x, side]], '#ffffff', 0.5, p.look.shading === 'hatch' ? 0 : 0.3);
    } else {
        p.rect(bx + bw * 0.7, top + 0.15 * u, 0.6 * u, 0.4 * u).paint('#c8ccd0', 0.6);
    }
    p.rect(bx, side + (base - side) * 0.55, bw, 0.18 * u).fill(stripe);
    const wins = camper ? [0.2, 0.75] : [0.12, 0.3, 0.68, 0.86];
    for (const t of wins) p.glass(bx + bw * t - 0.3 * u, side + 0.25 * u, 0.6 * u, 0.5 * u, true);
    const dx = bx + bw * (camper ? 0.47 : 0.49) - 0.3 * u;
    p.rr(dx, side + 0.2 * u, 0.6 * u, base - side - 0.25 * u, 0.06 * u).shadeFill(darken(body, 0.12), dx, 0, dx + 0.6 * u, 0, 0.25).stroke(0.8);
    p.ell(dx + 0.48 * u, side + 0.75 * u, 0.04 * u, 0.04 * u).fill('#3a3a3a');
    if (!camper) for (let i = 0; i < 2; i++) p.rect(dx - 0.05 * u, base + i * 0.15 * u, 0.7 * u, 0.12 * u).paint('#a8a4a0', 0.5);
}

/** A block of flats for working families: concrete slab (v0), galleries (v1), a brick tenement with a fire escape (v2). */
export function housingBlock(p: Pen, r: Rect, [wall, roof, balc]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    if (v === 2) {
        building(p, r, { roof, wall, floors: 5, roofKind: 'flat', wallMat: 'brick', windowKind: 'tall', windows: 4, door_: 'double', door: '#3a3a40', trim: '#e8dcc8' });
        /* A fire escape zigzagging down the right side. */
        const fx = r.x + r.w - 2.4 * u, fw = 1.7 * u, fh = (7.45 * u - 0.5 * u) / 5;
        for (let f = 1; f < 5; f++) {
            const y = ground - 0.26 * u - f * fh + 0.2 * u;
            p.rect(fx, y, fw, 0.1 * u).fill(balc).stroke(0.5);
            for (let x = fx; x <= fx + fw; x += 0.2 * u) p.line([[x, y - 0.35 * u], [x, y]], balc, 0.6);
            p.line([[fx, y - 0.35 * u], [fx + fw, y - 0.35 * u]], balc, 1);
            if (f > 1) p.line(f % 2 ? [[fx + 0.1 * u, y], [fx + fw - 0.1 * u, y + fh]] : [[fx + fw - 0.1 * u, y], [fx + 0.1 * u, y + fh]], balc, 1.4);
        }
        return;
    }
    if (v === 1) {
        building(p, r, { roof, wall, floors: 5, roofKind: 'flat', wallMat: 'panels', windowKind: 'square', windows: 7, door_: 'glass', balcony: true, trim: balc });
        /* The railings take the trim colour, which a flat roof also uses: the roof back in its own. */
        const roofTop = r.y + 0.08 * u, eave = ground - 7.45 * u + 0.16 * u;
        p.rect(r.x + 0.22 * u, roofTop + 0.22 * u, r.w - 0.44 * u, eave - roofTop - 0.5 * u).fill(roof).stroke(0.6);
        p.rect(r.x + 0.22 * u, roofTop + 0.22 * u, r.w - 0.44 * u, 0.16 * u).shade(0.25);
        return;
    }
    building(p, r, { roof, wall, floors: 6, roofKind: 'flat', wallMat: 'panels', windowKind: 'square', windows: 6, door_: 'glass', trim: darken(wall, 0.2) });
    /* Little balconies in a colour, one window in three. */
    const floors = 6, wallH = (floors * 1.4 + 0.45) * u, floorH = (wallH - 0.5 * u) / floors;
    const wx = r.x + 0.14 * u, ww = r.w - 0.28 * u;
    for (let f = 1; f < floors; f++) {
        const rowY = ground - 0.26 * u - f * floorH - floorH * 0.62 - 0.3 * u + 0.6 * u + 0.04 * u;
        for (let i = (f % 2); i < 6; i += 3) {
            const cx = wx + ww * (i + 0.5) / 6;
            p.rect(cx - 0.45 * u, rowY, 0.9 * u, 0.36 * u).shadeFill(balc, 0, rowY, 0, rowY + 0.36 * u, 0.2).stroke(0.6);
        }
    }
}

/** Houses joined in a row: a brick terrace (v0), a painted row (v1), a semi-detached pair (v2). */
export function terrace(p: Pen, r: Rect, [roof, wall, door]: string[], _rot: boolean, v: number): void {
    const u = p.u;
    if (v === 2) {
        const half = r.w / 2;
        const spec: BuildingSpec = { roof, wall, door, floors: 2, roofKind: 'hip', roofMat: 'tile', wallMat: 'brick', windows: 2, door_: 'wood', garage: '#e8e4dc', chimney: true, trim: '#f0e8d8' };
        const ctx = p.ctx;
        ctx.save();
        ctx.translate(r.x * 2 + half, 0);
        ctx.scale(-1, 1);
        building(p, { x: r.x, y: r.y, w: half + 0.05 * u, h: r.h }, spec);
        ctx.restore();
        building(p, { x: r.x + half - 0.05 * u, y: r.y, w: half + 0.05 * u, h: r.h }, spec);
        return;
    }
    const n = v === 1 ? 4 : 3, w = r.w / n;
    const tints = ['#f0b8b0', '#b8dcc8', '#f0dc98', '#b8ccec'];
    for (let i = 0; i < n; i++) {
        const b: Rect = { x: r.x + i * w - (i ? 0.04 * u : 0), y: r.y, w: w + (i ? 0.04 * u : 0), h: r.h };
        building(p, b, v === 1
            ? { roof, wall: mix(wall, tints[i], 0.55), door, floors: 2, roofKind: 'gable', roofMat: 'slate', windows: 2, windowKind: 'tall', door_: 'wood', trim: '#f4f0e6', boxes: i % 2 ? '#e05080' : undefined }
            : { roof, wall, door, floors: 2, roofKind: 'gable', roofMat: 'slate', wallMat: 'brick', windows: 2, door_: 'wood', chimney: true, trim: '#e8dcc8' });
    }
}

/** A mansion: colonial with columns (v0), Georgian brick (v1), a château with towers (v2). */
export function mansion(p: Pen, r: Rect, [roof, wall, door]: string[], _rot: boolean, v: number): void {
    const u = p.u;
    if (v === 0) {
        building(p, r, { roof, wall, door, floors: 2, roofKind: 'hip', roofMat: 'slate', wallMat: 'siding', windowKind: 'tall', windows: 6, shutters: door, door_: 'double', columns: 6, dormers: 3, chimney: true, chimney2: true });
        return;
    }
    if (v === 1) {
        building(p, r, { roof, wall, door, floors: 3, roofKind: 'hip', roofMat: 'slate', wallMat: 'brick', windowKind: 'tall', windows: 7, door_: 'double', porch: roof, dormers: 4, chimney: true, chimney2: true, trim: '#f0ece0' });
        return;
    }
    const tw = 2.6 * u;
    building(p, { x: r.x + tw * 0.7, y: r.y + 1.2 * u, w: r.w - tw * 1.4, h: r.h - 1.2 * u }, {
        roof, wall, door, floors: 2, roofKind: 'mansard', roofMat: 'slate', wallMat: 'plaster', lowerMat: 'stone', lowerWall: darken(wall, 0.1), windowKind: 'tall', windows: 6, door_: 'double', dormers: 4, chimney: true, chimney2: true, trim: darken(wall, 0.2),
    });
    for (const x of [r.x, r.x + r.w - tw]) roundTower(p, { x, y: r.y, w: tw, h: r.h }, wall, roof, r.y + 2.2 * u);
}

/** A luxury villa: glass and concrete (v0), with a pool (v1), Mediterranean (v2). */
export function luxuryVilla(p: Pen, r: Rect, [wall, glass, pool]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    const poolAt = (x: number, y: number, w: number, h: number) => {
        p.rr(x - 0.3 * u, y - 0.3 * u, w + 0.6 * u, h + 0.6 * u, 0.1 * u).fill('#e0d4bc').stroke(0.6);
        p.rr(x, y, w, h, 0.08 * u).shadeFill(pool, 0, y, 0, y + h, 0.35).stroke(0.8);
        p.rect(x, y, w, 0.18 * u).shade(0.25);
        for (let i = 0; i < 3; i++) p.line([[x + w * (0.2 + i * 0.25), y + h * 0.5], [x + w * (0.32 + i * 0.25), y + h * 0.42]], '#ffffff', 0.8, p.look.shading === 'hatch' ? 0 : 0.6);
        for (const dx of [0.15, 0.3]) p.line([[x + w - dx * u, y - 0.25 * u], [x + w - dx * u, y + 0.25 * u]], '#c8ccd0', 1);
    };
    if (v === 2) {
        building(p, { x: r.x + r.w * 0.32, y: r.y, w: r.w * 0.68, h: r.h - 0.2 * u }, { roof: '#c8603a', wall, floors: 2, roofKind: 'hip', roofMat: 'tile', windowKind: 'arched', windows: 4, glass, door_: 'arched', door: '#6a4a2a', balcony: true, trim: '#c8b090', shutters: '#3a7a8a' });
        poolAt(r.x + 0.5 * u, ground - 2.4 * u, r.w * 0.32 - 1.0 * u, 1.9 * u);
        return;
    }
    const yard = v === 1 ? 2.5 * u : 0;
    const body: Rect = { x: r.x, y: r.y, w: r.w, h: r.h - yard };
    const lower: Rect = { x: body.x, y: body.y + body.h - 3.2 * u, w: body.w, h: 3.2 * u };
    building(p, lower, { roof: lighten(wall, 0.05), wall, floors: 1, roofKind: 'flat', storefront: true, glass, door_: 'glass', accent: darken(wall, 0.15), wallH: 1.9, trim: darken(wall, 0.12) });
    const upper: Rect = { x: body.x + body.w * 0.3, y: body.y, w: body.w * 0.68, h: body.h - 1.75 * u };
    building(p, upper, { roof: lighten(wall, 0.05), wall, floors: 1, roofKind: 'flat', windowKind: 'wide', windows: 3, glass, door_: 'none', wallH: 1.8, trim: darken(wall, 0.12) });
    p.rect(upper.x, upper.y + upper.h - 0.15 * u, upper.w, 0.15 * u).shade(0.3);
    if (v === 1) {
        poolAt(r.x + 0.8 * u, ground - yard + 0.5 * u, r.w * 0.55, yard - 1.0 * u);
        for (const x of [r.x + r.w * 0.72, r.x + r.w * 0.84]) {
            p.rr(x, ground - 1.3 * u, 0.5 * u, 0.9 * u, 0.08 * u).paint('#f4f0e6', 0.6);
            p.rect(x, ground - 1.3 * u, 0.5 * u, 0.25 * u).fill(pool);
        }
    } else {
        p.line([[r.x + 0.2 * u, ground - 0.1 * u], [r.x + r.w * 0.28, ground - 0.1 * u]], glass, 2);
    }
}

/** A modern house fallen in (v0), a bombed-out shell (v1), abandoned and boarded up (v2). */
export function ruinedBuilding(p: Pen, r: Rect, [wall, roof]: string[], _rot: boolean, v: number): void {
    const u = p.u, ground = r.y + r.h;
    if (v === 0) {
        collapsed(p, r, { roof, wall, door: '#5a5050', floors: 2, roofKind: 'gable', roofMat: 'slate', wallMat: 'plaster', windows: 3, door_: 'wood', trim: '#8a8478' });
        return;
    }
    if (v === 1) {
        shell(p, r, { wall, mat: 'panels', depth: 3, wallH: 3.3, floors: 2, windows: 3, floor: '#7a7470', slabs: true });
        return;
    }
    building(p, r, { roof, wall, door: '#5a5050', floors: 2, roofKind: 'gable', roofMat: 'shingle', wallMat: 'siding', windows: 3, door_: 'wood', ruin: 'boarded', trim: '#8a8478' });
    /* Missing shingles, scrawls on the wall, weeds at the foot. */
    p.reseed(Math.round(r.w * 17));
    for (let i = 0; i < 4; i++) p.rect(r.x + (0.4 + p.rnd() * (r.w / u - 1)) * u, r.y + (0.4 + p.rnd() * 1) * u, 0.3 * u, 0.2 * u).fill('#2a2420');
    for (const [x, hex] of [[0.15, '#d04848'], [0.62, '#3a8ad0']] as const) {
        const gx = r.x + r.w * x, gy = ground - 0.75 * u;
        p.line([[gx, gy], [gx + 0.2 * u, gy - 0.2 * u], [gx + 0.35 * u, gy + 0.05 * u], [gx + 0.55 * u, gy - 0.25 * u], [gx + 0.7 * u, gy]], hex, 1.6);
    }
    for (let i = 0; i < 5; i++) {
        const gx = r.x + p.rnd() * r.w;
        for (const a of [-0.3, 0, 0.3]) p.line([[gx, ground], [gx + a * 0.3 * u, ground - 0.35 * u]], '#5a8a3a', 1.1);
    }
}

/** A burned house: burnt out (v0), still smouldering (v1), a burned block of flats (v2). */
export function burnedBuilding(p: Pen, r: Rect, [wall, ember]: string[], _rot: boolean, v: number): void {
    if (v === 1) {
        collapsed(p, r, { roof: '#4a4a50', wall, door: '#3a3030', floors: 2, roofKind: 'gable', roofMat: 'shingle', wallMat: 'siding', windows: 3, door_: 'wood', trim: '#2a2420' }, true, ember);
        return;
    }
    shell(p, r, v === 0
        ? { wall, mat: 'plaster', depth: 3, wallH: 3.3, floors: 2, windows: 3, floor: '#3a3430', burned: true, ember }
        : { wall, mat: 'brick', depth: 3, wallH: 4.6, floors: 3, windows: 4, floor: '#3a3430', burned: true, slabs: true });
}
