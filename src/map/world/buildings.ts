import type { Pen, Rect } from './looks';
import { darken, lighten } from './looks';

/* Buildings, drawn as the samples the owner picked (2026-11-08): seen from
   above at a slant, the roof's front slope on top and the front wall below,
   in ink outlines. One function draws them all from a description; each
   catalogue building is a few lines of options. Every measure is in cells
   (times `p.u`), so a building draws the same at any zoom.

   The sprite rectangle `r` is the whole picture: its bottom edge is the
   front of the footprint, where the wall meets the ground. */

export type WallMat = 'plaster' | 'brick' | 'stone' | 'timber' | 'planks' | 'logs' | 'glass' | 'siding' | 'metal' | 'panels';
export type RoofMat = 'shingle' | 'tile' | 'slate' | 'thatch' | 'metal' | 'tarp';
export type WindowKind = 'square' | 'arched' | 'leaded' | 'round' | 'tall' | 'wide' | 'slit';
export type HangIcon = 'mug' | 'bread' | 'anvil' | 'potion' | 'bed' | 'key' | 'book' | 'candle' | 'none';

export interface BuildingSpec {
    roof: string;
    wall: string;
    door?: string;
    trim?: string;
    accent?: string;
    /** Storeys of windows on the front wall. */
    floors: number;
    /** `crenel`: a flat top behind battlements; `dome`: a round roof;
        `mansard`: a steep lower slope under a gentle one; `cross`: a gable
        with a second, front-facing gable over the door. */
    roofKind: 'gable' | 'hip' | 'flat' | 'mansard' | 'cross' | 'crenel' | 'dome';
    door_?: 'wood' | 'glass' | 'barn' | 'arched' | 'double' | 'gate' | 'none';
    /** Windows a storey (the ground floor loses the one in the door's way). */
    windows?: number;
    chimney?: boolean;
    /** Drawn on the roof's front edge, centred: a sign. */
    sign?: (p: Pen, cx: number, y: number) => void;
    /** A striped awning over the ground floor, in this colour. */
    awning?: string;
    /** The wall's height in cells; else from the storeys. */
    wallH?: number;

    /** What the front wall is made of; plaster when absent. */
    wallMat?: WallMat;
    /** The ground floor of another material (a stone shop under a timber house). */
    lowerMat?: WallMat;
    lowerWall?: string;
    roofMat?: RoofMat;
    windowKind?: WindowKind;
    /** Shutters beside every window, in this colour. */
    shutters?: string;
    /** Window boxes of flowers, in this colour. */
    boxes?: string;
    /** A little roof on posts over the door, in this colour. */
    porch?: string;
    /** The upper storeys stand out over the ground floor (a medieval jetty). */
    jetty?: boolean;
    /** A sign hanging from a bracket beside the door. */
    hangSign?: string;
    hangIcon?: HangIcon;
    /** A railed balcony along each upper storey. */
    balcony?: boolean;
    /** A garage door beside the front door, in this colour. */
    garage?: string;
    /** Small windows in the roof. */
    dormers?: number;
    /** A lower side wing, drawn as a building of its own. */
    annex?: { side: 'left' | 'right'; w: number } & Partial<BuildingSpec>;
    /** Shop windows across the ground floor. */
    storefront?: boolean;
    /** The panes' colour (stained glass, tinted office glass); sky blue when absent. */
    glass?: string;
    /** Columns across the front, holding the eaves (a portico). */
    columns?: number;
    /** A second chimney, at the other end. */
    chimney2?: boolean;
    /** A derelict house's windows: smashed (dark, shards left) or boarded over. */
    ruin?: 'broken' | 'boarded';
}

export function building(p: Pen, r0: Rect, s: BuildingSpec): void {
    const u = p.u;
    let r = r0;
    /* A wing: its own small building on one side, lower, drawn first. */
    if (s.annex) {
        const aw = Math.min(s.annex.w * u, r.w * 0.6);
        const { side, w: _w, ...rest } = s.annex;
        const wingWallH = rest.wallH ?? Math.max(1.3, (s.wallH ?? s.floors * 1.4 + 0.45) - 1.2);
        const wingH = Math.min(r.h, wingWallH * u + Math.min(2.4 * u, aw * 0.7) + 0.4 * u);
        const ar: Rect = { x: side === 'left' ? r.x : r.x + r.w - aw, y: r.y + r.h - wingH, w: aw, h: wingH };
        building(p, ar, {
            roof: s.roof, wall: s.wall, trim: s.trim, wallMat: s.wallMat, roofMat: s.roofMat, windowKind: s.windowKind,
            shutters: s.shutters, boxes: s.boxes, floors: 1, roofKind: s.roofKind === 'crenel' ? 'crenel' : 'gable', door_: 'none',
            windows: Math.max(1, Math.round(aw / u / 1.6)), wallH: wingWallH, ...rest,
        });
        r = { x: side === 'left' ? r.x + aw - 0.1 * u : r.x, y: r.y, w: r.w - aw + 0.1 * u, h: r.h };
    }

    const wallH = (s.wallH ?? s.floors * 1.4 + 0.45) * u;
    const ground = r.y + r.h;
    const wallTop = ground - wallH;
    const inset = 0.14 * u;
    const wx = r.x + inset, ww = r.w - inset * 2;
    const trim = s.trim ?? '#9a8a70';
    const floorH = (wallH - 0.5 * u) / s.floors;
    /* Where the ground floor ends and the storeys above begin. */
    const split = s.floors > 1 ? ground - 0.26 * u - floorH - 0.08 * u : wallTop;
    const jet = s.jetty && s.floors > 1 ? 0.2 * u : 0;

    /* The front wall: one band, or the ground floor and the storeys above. */
    const band = (x: number, y: number, w: number, h: number, mat: WallMat, hex: string) => {
        p.rect(x, y, w, h).shadeFill(hex, 0, y, 0, y + h, mat === 'glass' ? 0.3 : 0.16);
        texture(p, { x, y, w, h }, mat, hex, trim);
        p.rect(x, y, w, h).stroke();
    };
    const lowMat = s.lowerMat ?? s.wallMat ?? 'plaster';
    const lowHex = s.lowerWall ?? s.wall;
    if (s.floors > 1 && (jet || s.lowerMat)) {
        band(wx + jet, split, ww - jet * 2, ground - 0.04 * u - split, lowMat, lowHex);
        band(wx - jet * 0.3, wallTop, ww + jet * 0.6, split - wallTop, s.wallMat ?? 'plaster', s.wall);
        if (jet) {
            p.rect(wx + jet, split, ww - jet * 2, 0.25 * u).shade(0.35);
            p.rect(wx - jet * 0.3, split - 0.12 * u, ww + jet * 0.6, 0.14 * u).fill(s.trim ?? '#4a3020').stroke(0.6);
        }
    } else {
        band(wx, wallTop, ww, wallH - 0.04 * u, s.wallMat ?? 'plaster', s.wall);
    }
    p.rect(wx, ground - 0.26 * u, ww, 0.22 * u).fill(lowMat === 'stone' || lowMat === 'brick' ? darken(lowHex, 0.2) : trim).stroke(0.6);
    /* The shadow the eaves throw on the wall. */
    p.rect(wx - jet * 0.3, wallTop, ww + jet * 0.6, 0.22 * u).shade(0.28);

    /* Windows, storey by storey, the door in the middle of the ground floor. */
    const doorKind = s.door_ ?? 'wood';
    const doorW = (doorKind === 'glass' ? 1.2 : doorKind === 'barn' ? 1.6 : doorKind === 'double' ? 1.3 : doorKind === 'gate' ? 1.8 : 0.8) * u;
    const garageW = s.garage ? Math.min(2 * u, ww * 0.38) : 0;
    const per = s.windows ?? Math.max(2, Math.round(r.w / u / 1.6));
    const wk = s.windowKind ?? 'square';
    const [winW, winH] = wk === 'tall' ? [0.5 * u, 0.95 * u] : wk === 'wide' ? [1.0 * u, 0.62 * u] : wk === 'round' ? [0.56 * u, 0.56 * u]
        : wk === 'slit' ? [0.2 * u, 0.7 * u] : wk === 'leaded' ? [0.55 * u, 0.62 * u] : [0.62 * u, 0.6 * u];
    const doorCx = r.x + r.w / 2 - garageW / 2;
    const storeTop = ground - 0.26 * u - Math.min(floorH, 1.25 * u);
    for (let f = 0; f < s.floors; f++) {
        if (f === 0 && s.storefront) continue;
        const rowY = ground - 0.26 * u - f * floorH - floorH * 0.62 - winH / 2;
        for (let i = 0; i < per; i++) {
            const cx = wx + ww * (i + 0.5) / per;
            if (f === 0 && doorKind !== 'none' && Math.abs(cx - doorCx) < doorW / 2 + winW * 0.6) continue;
            if (f === 0 && garageW && cx > r.x + r.w - inset - garageW - winW * 0.6) continue;
            win(p, cx - winW / 2, rowY, winW, winH, wk, (i + f) % 3 !== 1, s);
        }
        if (s.balcony && f > 0) {
            const by = rowY + winH + 0.06 * u;
            p.rect(wx + 0.15 * u, by, ww - 0.3 * u, 0.1 * u).fill(trim).stroke(0.6);
            p.rect(wx + 0.15 * u, by - 0.42 * u, ww - 0.3 * u, 0.08 * u).fill(trim).stroke(0.5);
            for (let x = wx + 0.25 * u; x < wx + ww - 0.2 * u; x += 0.22 * u) p.line([[x, by - 0.38 * u], [x, by]], null, 0.45, 0.8);
        }
    }

    if (s.storefront) {
        /* Glass from the plinth to the band above, broken by the door. */
        const parts: [number, number][] = [[wx + 0.25 * u, doorCx - doorW / 2 - 0.15 * u], [doorCx + doorW / 2 + 0.15 * u, wx + ww - 0.25 * u - garageW]];
        for (const [a, b] of parts) if (b - a > 0.4 * u) {
            p.glass(a, storeTop + 0.15 * u, b - a, ground - 0.3 * u - storeTop - 0.15 * u, true, s.glass);
            p.line([[(a + b) / 2, storeTop + 0.15 * u], [(a + b) / 2, ground - 0.3 * u]], null, 0.6);
        }
        p.rect(wx, storeTop - 0.1 * u, ww, 0.22 * u).fill(s.accent ?? trim).stroke(0.7);
    }

    if (s.columns) {
        const n = s.columns, cw = 0.28 * u, top = wallTop + 0.2 * u;
        p.rect(wx, top - 0.08 * u, ww, 0.2 * u).fill(lighten(s.wall, 0.12)).stroke(0.7);
        for (let i = 0; i < n; i++) {
            const x = wx + 0.15 * u + i * (ww - 0.3 * u - cw) / Math.max(1, n - 1);
            p.rect(x, top + 0.12 * u, cw, ground - top - 0.42 * u).shadeFill('#f6f2ea', x, 0, x + cw, 0, 0.35).stroke(0.7);
            p.rect(x - 0.05 * u, top + 0.08 * u, cw + 0.1 * u, 0.1 * u).fill('#ece6da').stroke(0.5);
        }
    }

    if (s.awning) awning(p, wx + 0.1 * u, ground - 1.55 * u, ww - 0.2 * u, s.awning);

    /* The door. */
    const dx = doorCx - doorW / 2, dh = (doorKind === 'barn' ? 1.5 : doorKind === 'gate' ? Math.min(1.9, wallH / u - 0.5) : 1.2) * u, dy = ground - 0.26 * u - dh;
    if (doorKind === 'wood') {
        p.rr(dx, dy, doorW, dh, [doorW / 2, doorW / 2, 0, 0]).shadeFill(s.door ?? '#8a5636', dx, 0, dx + doorW, 0, 0.3).stroke();
        p.ell(dx + doorW * 0.74, dy + dh * 0.58, 0.05 * u, 0.05 * u).fill('#e8c060');
    } else if (doorKind === 'glass') {
        /* The frame in the door's colour, so the door's colour picker works. */
        if (s.door) p.rect(dx - 0.08 * u, dy - 0.08 * u, doorW + 0.16 * u, dh + 0.08 * u).fill(s.door).stroke(0.7);
        p.glass(dx, dy, doorW, dh, true);
        p.line([[dx + doorW / 2, dy], [dx + doorW / 2, dy + dh]]);
        p.rect(dx - 0.15 * u, ground - 0.3 * u, doorW + 0.3 * u, 0.1 * u).fill('#e8e0d0').stroke(0.5);
    } else if (doorKind === 'barn') {
        p.rect(dx, dy, doorW, dh).fill(s.door ?? '#f0e8d8').stroke();
        p.line([[dx, dy], [dx + doorW, dy + dh]]);
        p.line([[dx + doorW, dy], [dx, dy + dh]]);
        p.line([[dx + doorW / 2, dy], [dx + doorW / 2, dy + dh]]);
    } else if (doorKind === 'arched' || doorKind === 'double' || doorKind === 'gate') {
        const hex = s.door ?? '#7a4a2a';
        p.rr(dx - 0.08 * u, dy - 0.08 * u, doorW + 0.16 * u, dh + 0.08 * u, [doorW / 2 + 0.08 * u, doorW / 2 + 0.08 * u, 0, 0]).fill(darken(s.lowerWall ?? s.wall, 0.25)).stroke(0.7);
        p.rr(dx, dy, doorW, dh, [doorW / 2, doorW / 2, 0, 0]).shadeFill(hex, dx, 0, dx + doorW, 0, 0.3).stroke();
        const ctx = p.ctx;
        ctx.save();
        p.rr(dx, dy, doorW, dh, [doorW / 2, doorW / 2, 0, 0]);
        ctx.clip();
        if (doorKind === 'gate') {
            /* A portcullis half raised over the dark passage. */
            p.rect(dx, dy, doorW, dh).fill('#2a2420');
            /* Its bars in the door's colour: a wooden portcullis. */
            for (let x = dx + 0.15 * u; x < dx + doorW; x += 0.28 * u) p.line([[x, dy], [x, dy + dh * 0.55]], hex, 1.3);
            for (let y = dy + 0.2 * u; y < dy + dh * 0.55; y += 0.28 * u) p.line([[dx, y], [dx + doorW, y]], hex, 1.3);
        } else {
            for (let x = dx + 0.2 * u; x < dx + doorW; x += 0.2 * u) p.line([[x, dy], [x, dy + dh]], null, 0.4, 0.45);
            for (const t of [0.35, 0.75]) p.line([[dx, dy + dh * t], [dx + doorW, dy + dh * t]], '#3a3430', 1.1, 0.9);
            if (doorKind === 'double') p.line([[dx + doorW / 2, dy], [dx + doorW / 2, dy + dh]], null, 0.9);
        }
        ctx.restore();
        if (doorKind !== 'gate') p.ell(dx + doorW * (doorKind === 'double' ? 0.42 : 0.74), dy + dh * 0.58, 0.05 * u, 0.05 * u).fill('#2a2420');
    }

    if (s.ruin === 'boarded' && doorKind !== 'none') {
        for (const t of [0.3, 0.65]) p.rect(dx - 0.1 * u, dy + dh * t, doorW + 0.2 * u, 0.15 * u).paint('#9a7a54', 0.5);
    }

    if (s.garage) {
        const gx = r.x + r.w - inset - garageW - 0.12 * u, gh = 1.15 * u, gy = ground - 0.26 * u - gh;
        p.rect(gx, gy, garageW, gh).shadeFill(s.garage, 0, gy, 0, gy + gh, 0.2).stroke();
        for (let y = gy + 0.2 * u; y < gy + gh; y += 0.2 * u) p.line([[gx, y], [gx + garageW, y]], null, 0.5, 0.6);
    }

    if (s.porch) {
        const pw = doorW + 0.9 * u, px = doorCx - pw / 2, py = dy - 0.38 * u;
        for (const x of [px + 0.08 * u, px + pw - 0.2 * u]) p.rect(x, py + 0.2 * u, 0.12 * u, ground - 0.26 * u - py - 0.2 * u).fill('#efe6d6').stroke(0.6);
        p.poly([[px - 0.1 * u, py + 0.3 * u], [px + 0.25 * u, py - 0.15 * u], [px + pw - 0.25 * u, py - 0.15 * u], [px + pw + 0.1 * u, py + 0.3 * u]])
            .shadeFill(s.porch, 0, py - 0.15 * u, 0, py + 0.3 * u, 0.25).stroke();
        p.rect(px - 0.2 * u, ground - 0.3 * u, pw + 0.4 * u, 0.12 * u).fill('#cfc4b0').stroke(0.5);
    }

    if (s.hangSign) hanging(p, dx + doorW + 0.25 * u, dy + 0.05 * u, s.hangSign, s.hangIcon ?? 'none');

    /* The roof, over everything above the wall. */
    roofOf(p, r, wallTop, s);
    if (s.chimney) chimney(p, r.x + r.w - 1.15 * u, r.y + 0.08 * u - 0.12 * u);
    if (s.chimney2) chimney(p, r.x + 0.7 * u, r.y + 0.08 * u - 0.12 * u);
    if (s.sign) s.sign(p, r.x + r.w / 2, wallTop + 0.16 * u);
}

function chimney(p: Pen, cx: number, cy: number): void {
    const u = p.u;
    p.rect(cx, cy, 0.42 * u, 0.75 * u).shadeFill('#a8705a', cx, 0, cx + 0.42 * u, 0).stroke();
    p.rect(cx - 0.05 * u, cy, 0.52 * u, 0.12 * u).fill('#7a4a3a').stroke(0.6);
}

/** One window of a kind, with what the spec dresses it in. */
function win(p: Pen, x: number, y: number, w: number, h: number, kind: WindowKind, lit: boolean, s: BuildingSpec): void {
    const u = p.u;
    if (s.shutters && kind !== 'slit' && kind !== 'round') {
        for (const sx of [x - w * 0.42 - 0.03 * u, x + w + 0.03 * u]) {
            p.rect(sx, y, w * 0.42, h).fill(s.shutters).stroke(0.5);
            for (let ly = y + h * 0.2; ly < y + h; ly += h * 0.2) p.line([[sx + 0.03 * u, ly], [sx + w * 0.42 - 0.03 * u, ly]], null, 0.35, 0.6);
        }
    }
    if (s.ruin) {
        /* No glass to light: a dark hole with shards, or boards nailed across. */
        const hole = () => (kind === 'arched' || kind === 'slit' ? p.rr(x, y, w, h, [w / 2, w / 2, 0, 0]) : kind === 'round' ? p.ell(x + w / 2, y + h / 2, w / 2, h / 2) : p.rect(x, y, w, h));
        hole().fill('#2a2420').stroke(0.8);
        if (s.ruin === 'broken') {
            p.ctx.save();
            hole();
            p.ctx.clip();
            p.poly([[x, y], [x + w * 0.45, y], [x, y + h * 0.55]]).fill('#8aa4b0');
            p.poly([[x + w, y + h], [x + w * 0.7, y + h], [x + w, y + h * 0.6]]).fill('#8aa4b0');
            p.ctx.restore();
        } else {
            const wood = '#9a7a54';
            for (const t of [0.25, 0.6]) p.rect(x - 0.06 * u, y + h * t, w + 0.12 * u, 0.13 * u).paint(wood, 0.5);
            p.line([[x - 0.04 * u, y + h * 0.1], [x + w + 0.04 * u, y + h * 0.95]], wood, 2.2);
        }
        if (kind !== 'slit' && kind !== 'round') p.rect(x - 0.05 * u, y + h, w + 0.1 * u, 0.09 * u).fill(s.trim ?? '#7a5a3a').stroke(0.5);
        return;
    }
    if (kind === 'arched' || kind === 'slit') {
        p.rr(x, y, w, h, [w / 2, w / 2, 0, 0]);
        glassFill(p, x, y, w, h, lit, s.glass);
    } else if (kind === 'round') {
        p.ell(x + w / 2, y + h / 2, w / 2, h / 2);
        glassFill(p, x, y, w, h, lit, s.glass);
        p.line([[x + w / 2, y], [x + w / 2, y + h]], null, 0.6);
        p.line([[x, y + h / 2], [x + w, y + h / 2]], null, 0.6);
    } else {
        p.glass(x, y, w, h, lit, s.glass);
        if (kind === 'leaded') {
            const ctx = p.ctx;
            ctx.save();
            p.rect(x, y, w, h);
            ctx.clip();
            for (let t = -h; t < w + h; t += 0.17 * u) {
                p.line([[x + t, y], [x + t + h, y + h]], '#3a3430', 0.45, 0.7);
                p.line([[x + t, y + h], [x + t + h, y]], '#3a3430', 0.45, 0.7);
            }
            ctx.restore();
        } else if (kind === 'tall' || kind === 'wide' || kind === 'square') {
            p.line([[x + w / 2, y], [x + w / 2, y + h]], null, 0.45, 0.6);
            if (kind !== 'square') p.line([[x, y + h / 2], [x + w, y + h / 2]], null, 0.45, 0.6);
        }
    }
    if (kind !== 'slit' && kind !== 'round') p.rect(x - 0.05 * u, y + h, w + 0.1 * u, 0.09 * u).fill(s.trim ?? '#7a5a3a').stroke(0.5);
    if (s.boxes && kind !== 'slit') {
        p.rect(x - 0.02 * u, y + h + 0.06 * u, w + 0.04 * u, 0.16 * u).fill('#8a5a3a').stroke(0.5);
        for (let fx = x + 0.06 * u; fx < x + w; fx += 0.13 * u) p.ell(fx, y + h + 0.04 * u, 0.06 * u, 0.06 * u).fill(s.boxes);
    }
}

function glassFill(p: Pen, x: number, y: number, w: number, h: number, lit: boolean, tint?: string): void {
    /* The path is already built: fill it as `Pen.glass` would a rectangle. */
    const ctx = p.ctx;
    if (p.look.night && lit) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,200,110,0.85)';
        ctx.shadowBlur = p.u * 0.5;
        p.fill(tint ? lighten(tint, 0.4) : '#ffd98a');
        ctx.restore();
    } else if (p.look.shading === 'hatch') {
        p.fill(tint ? lighten(tint, 0.3) : '#c8d8e0');
    } else {
        p.shadeFill(tint ?? '#a8d4ee', x, y, x + w, y + h, 0.35);
    }
    p.stroke(0.8);
}

/** The pattern of a wall's material, inside the band `b`. */
function texture(p: Pen, b: Rect, mat: WallMat, hex: string, trim: string): void {
    const u = p.u, ctx = p.ctx;
    if (mat === 'plaster') return;
    ctx.save();
    p.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    if (mat === 'brick') {
        const rh = 0.2 * u;
        for (let y = b.y + b.h, row = 0; y > b.y; y -= rh, row++) {
            p.line([[b.x, y], [b.x + b.w, y]], lighten(hex, 0.35), 0.5, 0.55);
            for (let x = b.x + (row % 2 ? 0.22 * u : 0); x < b.x + b.w; x += 0.44 * u) p.line([[x, y - rh], [x, y]], lighten(hex, 0.35), 0.45, 0.5);
        }
    } else if (mat === 'stone') {
        p.reseed(Math.round(b.w * 7 + b.h));
        const rh = 0.36 * u;
        for (let y = b.y + b.h, row = 0; y > b.y - rh; y -= rh, row++) {
            let x = b.x - p.rnd() * 0.4 * u;
            while (x < b.x + b.w) {
                const w = (0.45 + p.rnd() * 0.45) * u;
                p.rr(x + 0.03 * u, y - rh + 0.03 * u, w - 0.06 * u, rh - 0.06 * u, 0.06 * u).fill(p.rnd() < 0.5 ? lighten(hex, 0.06) : darken(hex, 0.06));
                p.rr(x + 0.03 * u, y - rh + 0.03 * u, w - 0.06 * u, rh - 0.06 * u, 0.06 * u).stroke(0.4);
                x += w;
            }
        }
    } else if (mat === 'timber') {
        /* Dark beams on plaster: rails, posts, and braces between them. */
        const beam = trim === '#9a8a70' ? '#4a3020' : trim;
        const bw = 0.11 * u;
        const posts = Math.max(2, Math.round(b.w / (1.15 * u)));
        const xs = Array.from({ length: posts + 1 }, (_, i) => b.x + (b.w - bw) * i / posts);
        for (let i = 0; i < posts; i++) {
            const x0 = xs[i] + bw, x1 = xs[i + 1];
            if (i % 2 === 0) p.line([[x0, b.y + b.h - 0.1 * u], [x1, b.y + 0.1 * u]], beam, 2.4);
            else p.line([[x0, b.y + 0.1 * u], [x1, b.y + b.h - 0.1 * u]], beam, 2.4);
        }
        for (const x of xs) p.rect(x, b.y, bw, b.h).fill(beam);
        p.rect(b.x, b.y, b.w, bw).fill(beam);
        p.rect(b.x, b.y + b.h - bw, b.w, bw).fill(beam);
    } else if (mat === 'planks') {
        for (let x = b.x + 0.28 * u; x < b.x + b.w; x += 0.28 * u) p.line([[x, b.y], [x, b.y + b.h]], null, 0.45, 0.5);
    } else if (mat === 'siding') {
        for (let y = b.y + 0.22 * u; y < b.y + b.h; y += 0.22 * u) {
            p.line([[b.x, y], [b.x + b.w, y]], null, 0.4, 0.45);
            p.rect(b.x, y, b.w, 0.05 * u).shade(0.1);
        }
    } else if (mat === 'logs') {
        for (let y = b.y + b.h - 0.3 * u; y > b.y; y -= 0.3 * u) {
            p.rr(b.x - 0.1 * u, y, b.w + 0.2 * u, 0.3 * u, 0.15 * u).fill(p.rnd() < 0.5 ? hex : darken(hex, 0.06));
            p.rr(b.x - 0.1 * u, y, b.w + 0.2 * u, 0.3 * u, 0.15 * u).stroke(0.45);
        }
    } else if (mat === 'metal') {
        /* Corrugated sheets: close ribs, a seam now and then. */
        for (let x = b.x + 0.12 * u; x < b.x + b.w; x += 0.12 * u) p.line([[x, b.y], [x, b.y + b.h]], null, 0.4, 0.4);
        for (let x = b.x + 0.15 * u; x < b.x + b.w; x += 0.24 * u) p.line([[x, b.y], [x, b.y + b.h]], '#ffffff', 0.5, 0.2);
        for (let x = b.x + 1.1 * u; x < b.x + b.w; x += 1.1 * u) p.line([[x, b.y], [x, b.y + b.h]], null, 0.8, 0.7);
    } else if (mat === 'panels') {
        /* Precast concrete: a joint at every storey and every bay. */
        for (let y = b.y + b.h - 1.4 * u; y > b.y + 0.1 * u; y -= 1.4 * u) p.line([[b.x, y], [b.x + b.w, y]], darken(hex, 0.25), 0.7, 0.7);
        for (let x = b.x + 1.3 * u; x < b.x + b.w; x += 1.3 * u) p.line([[x, b.y], [x, b.y + b.h]], darken(hex, 0.2), 0.6, 0.6);
    } else if (mat === 'glass') {
        /* A curtain wall: panes in a grid of mullions. */
        for (let y = b.y + 0.1 * u; y < b.y + b.h - 0.2 * u; y += 0.7 * u) {
            for (let x = b.x + 0.1 * u; x < b.x + b.w - 0.2 * u; x += 0.6 * u) {
                p.rect(x, y, Math.min(0.5 * u, b.x + b.w - 0.1 * u - x), Math.min(0.6 * u, b.y + b.h - 0.1 * u - y));
                if (p.look.night && p.rnd() < 0.55) p.fill('#ffd98a'); else p.shadeFill('#9cc8e4', x, y, x + 0.5 * u, y + 0.6 * u, 0.4);
            }
        }
    }
    ctx.restore();
}

/** Everything above the wall: the roof's front slope, seen from the slant. */
function roofOf(p: Pen, r: Rect, wallTop: number, s: BuildingSpec): void {
    const u = p.u;
    const roofTop = r.y + 0.08 * u, eave = wallTop + 0.16 * u;
    const kind = s.roofKind;
    if (kind === 'flat' || kind === 'crenel') {
        const top = kind === 'crenel' ? lighten(s.wall, 0.08) : s.roof;
        p.rect(r.x, roofTop, r.w, eave - roofTop).shadeFill(top, 0, roofTop, 0, eave, 0.18).stroke();
        if (kind === 'crenel') {
            /* A walk behind battlements: the floor of it, merlons at both edges. */
            const fx = r.x + 0.3 * u, fy = roofTop + 0.35 * u, fw = r.w - 0.6 * u, fh = eave - roofTop - 0.7 * u;
            p.rect(fx, fy, fw, fh).fill(s.roof).stroke(0.5);
            /* Flagstones on the walk, and a stair hatch. */
            p.ctx.save();
            p.rect(fx, fy, fw, fh);
            p.ctx.clip();
            for (let y = fy + 0.45 * u, row = 0; y < fy + fh; y += 0.45 * u, row++) {
                p.line([[fx, y], [fx + fw, y]], null, 0.4, 0.4);
                for (let x = fx + (row % 2 ? 0.35 : 0.7) * u; x < fx + fw; x += 0.7 * u) p.line([[x, y - 0.45 * u], [x, y]], null, 0.35, 0.35);
            }
            p.ctx.restore();
            p.rect(fx, fy, fw, 0.15 * u).shade(0.3);
            if (fw > 2 * u && fh > 1.2 * u) {
                const hx = fx + fw * 0.68, hy = fy + fh * 0.3;
                p.rect(hx, hy, 0.7 * u, 0.55 * u).paint(darken(s.roof, 0.35), 0.6);
                for (let i = 1; i < 4; i++) p.line([[hx + 0.05 * u, hy + i * 0.13 * u], [hx + 0.65 * u, hy + i * 0.13 * u]], lighten(s.roof, 0.2), 0.5, 0.7);
            }
            texture(p, { x: r.x, y: roofTop, w: r.w, h: 0.35 * u }, 'stone', top, '#000');
            merlons(p, r.x, r.w, roofTop - 0.25 * u, top);
            merlons(p, r.x, r.w, eave - 0.45 * u, s.wall);
            return;
        }
        p.rect(r.x + 0.22 * u, roofTop + 0.22 * u, r.w - 0.44 * u, eave - roofTop - 0.5 * u).fill(s.trim ?? s.roof).stroke(0.6);
        p.rect(r.x + 0.22 * u, roofTop + 0.22 * u, r.w - 0.44 * u, 0.16 * u).shade(0.25);
        /* Vents and a unit on top. */
        p.reseed(Math.round(r.w + r.h));
        for (let i = 0; i < Math.max(1, Math.floor(r.w / u / 2)); i++) {
            const vx = r.x + (0.6 + i * 1.9 + p.rnd() * 0.4) * u, vy = roofTop + (0.55 + p.rnd() * 0.5) * u;
            if (vx + 0.6 * u > r.x + r.w - 0.3 * u || vy + 0.45 * u > eave - 0.35 * u) continue;
            p.rr(vx, vy, 0.6 * u, 0.42 * u, 0.06 * u).shadeFill('#b8bcc0', vx, vy, vx, vy + 0.42 * u).stroke(0.6);
        }
        p.rect(r.x, eave - 0.12 * u, r.w, 0.12 * u).shade(0.35);
    } else if (kind === 'dome') {
        const cx = r.x + r.w / 2, ry = eave - roofTop;
        p.rect(r.x, eave - 0.3 * u, r.w, 0.3 * u).fill(s.trim ?? darken(s.wall, 0.1)).stroke(0.7);
        p.ctx.beginPath();
        p.ctx.ellipse(cx, eave - 0.3 * u, r.w / 2 - 0.1 * u, ry - 0.2 * u, 0, Math.PI, 0);
        p.ctx.closePath();
        p.shadeFill(s.roof, r.x, roofTop, r.x + r.w, eave, 0.32).stroke();
        /* Ribs from the crown down to the drum. */
        const R = r.w / 2 - 0.1 * u, base = eave - 0.3 * u;
        for (const t of [-0.55, 0.55]) {
            p.ctx.beginPath();
            p.ctx.ellipse(cx, base, Math.abs(t) * R, ry - 0.2 * u, 0, Math.PI * 1.5, t < 0 ? Math.PI : Math.PI * 2, t < 0);
            p.stroke(0.5);
        }
        p.line([[cx, base - ry + 0.2 * u], [cx, base]], null, 0.5);
        p.ell(cx - r.w * 0.15, roofTop + ry * 0.35, r.w * 0.12, ry * 0.18).shine(0.3);
        p.rect(cx - 0.12 * u, roofTop - 0.1 * u, 0.24 * u, 0.4 * u).paint(lighten(s.roof, 0.2), 0.6);
    } else {
        const top = kind === 'hip' || kind === 'mansard' ? 0.9 * u : 0.3 * u;
        const slope: [number, number][] = [[r.x + top, roofTop], [r.x + r.w - top, roofTop], [r.x + r.w, eave], [r.x, eave]];
        roofSlope(p, slope, roofTop, eave, r, s);
        if (kind === 'hip') {
            p.line([[r.x + top, roofTop], [r.x + 0.02 * u, eave]], null, 0.8, 0.6);
            p.line([[r.x + r.w - top, roofTop], [r.x + r.w - 0.02 * u, eave]], null, 0.8, 0.6);
        }
        if (kind === 'mansard') {
            /* The steep lower slope, darker, with the break line. */
            const brk = roofTop + (eave - roofTop) * 0.42;
            p.poly([[r.x + top * 0.55, brk], [r.x + r.w - top * 0.55, brk], [r.x + r.w, eave], [r.x, eave]]).shade(0.18);
            p.line([[r.x + top * 0.55, brk], [r.x + r.w - top * 0.55, brk]], null, 1);
        }
        if (kind === 'cross') {
            /* A gable facing us over the door, its end wall in the wall's colour. */
            const cx = r.x + r.w / 2, gw = Math.min(r.w * 0.42, 2.4 * u), gt = roofTop + 0.05 * u;
            p.poly([[cx - gw / 2 - 0.15 * u, eave + 0.02 * u], [cx, gt], [cx + gw / 2 + 0.15 * u, eave + 0.02 * u]]).shadeFill(s.roof, cx - gw, 0, cx + gw, 0, 0.3).stroke();
            p.poly([[cx - gw / 2 + 0.1 * u, eave], [cx, gt + 0.35 * u], [cx + gw / 2 - 0.1 * u, eave]]).shadeFill(s.wall, 0, gt, 0, eave, 0.15);
            if (s.wallMat === 'timber') {
                p.line([[cx, gt + 0.35 * u], [cx, eave]], s.trim ?? '#4a3020', 2.2);
                p.line([[cx - gw / 4, eave], [cx, gt + 0.7 * u]], s.trim ?? '#4a3020', 2.2);
                p.line([[cx + gw / 4, eave], [cx, gt + 0.7 * u]], s.trim ?? '#4a3020', 2.2);
            }
            p.poly([[cx - gw / 2 + 0.1 * u, eave], [cx, gt + 0.35 * u], [cx + gw / 2 - 0.1 * u, eave]]).stroke();
            win(p, cx - 0.25 * u, eave - (eave - gt) * 0.5, 0.5 * u, 0.42 * u, s.windowKind === 'leaded' ? 'leaded' : 'round', true, { ...s, shutters: undefined, boxes: undefined });
        }
        for (let i = 0; i < (s.dormers ?? 0); i++) {
            const n = s.dormers!, dx = r.x + r.w * (i + 0.5) / n, dw = 0.75 * u, db = eave - (eave - roofTop) * 0.25, dt = db - 0.85 * u;
            if (dt < roofTop) continue;
            p.rect(dx - dw / 2, dt + 0.3 * u, dw, db - dt - 0.3 * u).fill(s.wall).stroke(0.7);
            p.glass(dx - dw / 2 + 0.12 * u, dt + 0.4 * u, dw - 0.24 * u, db - dt - 0.5 * u, i % 2 === 0);
            p.poly([[dx - dw / 2 - 0.12 * u, dt + 0.38 * u], [dx, dt], [dx + dw / 2 + 0.12 * u, dt + 0.38 * u]]).paint(s.roof, 0.8);
        }
    }
    /* The eaves' edge. */
    p.rect(r.x + 0.06 * u, eave - 0.04 * u, r.w - 0.12 * u, 0.1 * u).fill(s.roofMat === 'thatch' ? darken(s.roof, 0.25) : s.trim ?? '#5a3a24');
}

/** A sloped roof face in its material, outlined. */
function roofSlope(p: Pen, slope: [number, number][], roofTop: number, eave: number, r: Rect, s: BuildingSpec): void {
    const u = p.u, ctx = p.ctx;
    const mat = s.roofMat ?? 'shingle';
    p.poly(slope).shadeFill(s.roof, 0, roofTop, 0, eave, mat === 'thatch' ? 0.2 : 0.28);
    ctx.save();
    ctx.clip();
    if (mat === 'shingle') {
        const rowH = 0.3 * u;
        for (let y = roofTop + rowH, row = 0; y < eave; y += rowH, row++) {
            p.line([[r.x, y], [r.x + r.w, y]], null, 0.55, 0.35);
            for (let x = r.x + (row % 2) * 0.25 * u; x < r.x + r.w; x += 0.5 * u) p.line([[x, y - rowH], [x, y]], null, 0.45, 0.25);
        }
    } else if (mat === 'tile') {
        /* Rows of half-round tiles. */
        const rowH = 0.26 * u, tw = 0.32 * u;
        for (let y = roofTop + rowH, row = 0; y < eave + rowH; y += rowH, row++) {
            for (let x = r.x - (row % 2) * tw / 2; x < r.x + r.w + tw; x += tw) {
                ctx.beginPath();
                ctx.arc(x + tw / 2, y - rowH * 0.3, tw / 2, 0, Math.PI);
                p.stroke(0.45);
            }
        }
    } else if (mat === 'slate') {
        const rowH = 0.2 * u;
        for (let y = roofTop + rowH, row = 0; y < eave; y += rowH, row++) {
            p.line([[r.x, y], [r.x + r.w, y]], null, 0.5, 0.5);
            for (let x = r.x + (row % 2) * 0.17 * u; x < r.x + r.w; x += 0.34 * u) p.line([[x, y - rowH], [x, y]], null, 0.4, 0.35);
            if (row % 3 === 1) p.rect(r.x, y - rowH, r.w, rowH).shade(0.08);
        }
    } else if (mat === 'thatch') {
        /* Straw: short strokes in two tones, and a thick lip. */
        p.reseed(Math.round(r.w + r.x));
        for (let y = roofTop + 0.15 * u; y < eave; y += 0.16 * u) {
            for (let x = r.x + p.rnd() * 0.12 * u; x < r.x + r.w; x += 0.12 * u) {
                p.line([[x, y], [x + 0.03 * u, y + 0.2 * u]], p.rnd() < 0.5 ? darken(s.roof, 0.28) : lighten(s.roof, 0.18), 0.5, 0.55);
            }
        }
        for (let y = roofTop + 0.6 * u; y < eave - 0.2 * u; y += 0.6 * u) p.line([[r.x, y], [r.x + r.w, y]], darken(s.roof, 0.3), 0.7, 0.4);
    } else if (mat === 'tarp') {
        /* A sheet tied down: creases and two ropes. */
        p.reseed(Math.round(r.w * 5 + r.x));
        for (let i = 0; i < 6; i++) {
            const x = r.x + p.rnd() * r.w, y = roofTop + p.rnd() * (eave - roofTop);
            p.line([[x, y], [x + (p.rnd() - 0.5) * 0.8 * u, y + 0.3 * u]], null, 0.5, 0.45);
        }
        for (const t of [0.3, 0.7]) p.line([[r.x + r.w * t, roofTop], [r.x + r.w * t + 0.1 * u, eave]], '#d8c8a0', 0.9);
    } else if (mat === 'metal') {
        for (let x = r.x + 0.35 * u; x < r.x + r.w; x += 0.35 * u) p.line([[x, roofTop], [x, eave]], null, 0.5, 0.45);
        for (let x = r.x + 0.4 * u; x < r.x + r.w; x += 0.35 * u) p.line([[x, roofTop], [x, eave]], '#ffffff', 0.5, 0.25);
    }
    ctx.restore();
    if (mat === 'thatch') {
        /* Thatch has no hard edge: a rounded, overhanging lip. */
        const [a, b, c, d] = slope;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.quadraticCurveTo(c[0] + 0.15 * u, (b[1] + c[1]) / 2, c[0] + 0.1 * u, c[1] + 0.12 * u);
        ctx.lineTo(d[0] - 0.1 * u, d[1] + 0.12 * u);
        ctx.quadraticCurveTo(d[0] - 0.15 * u, (a[1] + d[1]) / 2, a[0], a[1]);
        p.stroke();
        p.rr(d[0] - 0.1 * u, d[1] - 0.12 * u, c[0] - d[0] + 0.2 * u, 0.26 * u, 0.13 * u).paint(darken(s.roof, 0.08), 0.7);
    } else {
        p.poly(slope).stroke();
    }
    const [a, b] = slope;
    p.poly([[a[0] + 0.05 * u, a[1] + 0.05 * u], [b[0] - 0.05 * u, b[1] + 0.05 * u], [b[0] - 0.15 * u, b[1] + 0.2 * u], [a[0] + 0.15 * u, a[1] + 0.2 * u]]).shine(mat === 'thatch' ? 0.15 : 0.35);
}

/** A row of battlements along a top edge. */
function merlons(p: Pen, x: number, w: number, y: number, hex: string): void {
    const u = p.u, mw = 0.42 * u, gap = 0.3 * u, mh = 0.42 * u;
    const n = Math.max(2, Math.floor((w + gap) / (mw + gap)));
    const step = (w - mw) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
        p.rect(x + i * step, y, mw, mh).shadeFill(hex, 0, y, 0, y + mh, 0.2).stroke(0.8);
        p.rect(x + i * step, y, mw, 0.1 * u).shine(0.25);
    }
}

/** A sign hung on a bracket beside a door, with a picture of the trade. */
function hanging(p: Pen, x: number, y: number, hex: string, icon: HangIcon): void {
    const u = p.u;
    p.line([[x - 0.15 * u, y], [x + 0.55 * u, y]], '#2a2420', 1.3);
    p.line([[x - 0.15 * u, y + 0.25 * u], [x + 0.1 * u, y]], '#2a2420', 0.9);
    p.line([[x + 0.12 * u, y], [x + 0.12 * u, y + 0.12 * u]], '#2a2420', 0.6);
    p.line([[x + 0.48 * u, y], [x + 0.48 * u, y + 0.12 * u]], '#2a2420', 0.6);
    const sx = x + 0.02 * u, sy = y + 0.12 * u, sw = 0.56 * u, sh = 0.46 * u;
    p.rr(sx, sy, sw, sh, 0.06 * u).shadeFill(hex, sx, sy, sx + sw, sy + sh, 0.25).stroke(0.8);
    const cx = sx + sw / 2, cy = sy + sh / 2, k = 0.15 * u;
    const ink = '#2a2420';
    if (icon === 'mug') {
        p.rr(cx - k * 0.8, cy - k, k * 1.4, k * 2, 0.03 * u).paint('#f0e0b0', 0.5);
        p.ell(cx + k * 0.75, cy, k * 0.4, k * 0.6).stroke(0.6);
        p.rect(cx - k * 0.8, cy - k, k * 1.4, k * 0.5).fill('#ffffff');
    } else if (icon === 'bread') {
        p.ell(cx, cy, k * 1.3, k * 0.75).paint('#d8a050', 0.6);
        for (const t of [-0.5, 0, 0.5]) p.line([[cx + t * k - 0.2 * k, cy - 0.4 * k], [cx + t * k + 0.2 * k, cy + 0.2 * k]], ink, 0.5);
    } else if (icon === 'anvil') {
        p.poly([[cx - k * 1.3, cy - k * 0.5], [cx + k * 1.1, cy - k * 0.5], [cx + k * 0.5, cy], [cx + k * 0.5, cy + k * 0.4], [cx + k * 0.9, cy + k], [cx - k * 0.9, cy + k], [cx - k * 0.5, cy + k * 0.4], [cx - k * 0.5, cy]]).paint('#5a5a60', 0.5);
    } else if (icon === 'potion') {
        p.ell(cx, cy + k * 0.4, k * 0.8, k * 0.7).paint('#7ad0a0', 0.5);
        p.rect(cx - k * 0.25, cy - k * 1.0, k * 0.5, k * 0.8).paint('#e8e8f0', 0.5);
    } else if (icon === 'bed') {
        p.rect(cx - k * 1.2, cy, k * 2.4, k * 0.6).paint('#f0f0f0', 0.5);
        p.rect(cx - k * 1.2, cy - k * 0.6, k * 0.3, k * 1.4).fill(ink);
        p.ell(cx - k * 0.5, cy - k * 0.15, k * 0.35, k * 0.25).fill('#ffffff');
    } else if (icon === 'key') {
        p.ell(cx - k * 0.7, cy, k * 0.45, k * 0.45).stroke(0.8);
        p.line([[cx - k * 0.25, cy], [cx + k * 1.1, cy]], ink, 0.9);
        p.line([[cx + k * 0.8, cy], [cx + k * 0.8, cy + k * 0.4]], ink, 0.8);
    } else if (icon === 'candle') {
        p.rect(cx - k * 0.35, cy - k * 0.4, k * 0.7, k * 1.4).paint('#f4ecd8', 0.5);
        p.ell(cx, cy - k * 0.75, k * 0.22, k * 0.38).fill('#f0a030');
    } else if (icon === 'book') {
        p.rect(cx - k, cy - k * 0.8, k * 2, k * 1.6).paint('#8a3a3a', 0.5);
        p.line([[cx, cy - k * 0.8], [cx, cy + k * 0.8]], '#f0e0c0', 0.8);
    }
}

function awning(p: Pen, x: number, y: number, w: number, hex: string): void {
    const u = p.u, h = 0.45 * u;
    const n = Math.max(4, Math.round(w / (0.4 * u)));
    for (let i = 0; i < n; i++) {
        const sx = x + w * i / n, sw = w / n;
        p.poly([[sx, y], [sx + sw, y], [sx + sw + 0.04 * u, y + h], [sx - 0.04 * u, y + h]]).fill(i % 2 ? '#fbf6ec' : hex);
        p.ell(sx + sw / 2, y + h, sw / 2, 0.12 * u).fill(i % 2 ? '#fbf6ec' : hex);
    }
    p.rect(x, y - 0.05 * u, w, h + 0.05 * u).stroke(0.8);
    p.rect(x, y + h - 0.02 * u, w, 0.18 * u).shade(0.18);
}

/* ---------------------------------------------------------- signs */

export function crossSign(p: Pen, cx: number, y: number, hex: string): void {
    const u = p.u, w = 0.95 * u, h = 0.72 * u, x = cx - w / 2, sy = y - h - 0.12 * u;
    p.rr(x, sy, w, h, 0.12 * u).paint('#ffffff');
    p.rect(cx - 0.09 * u, sy + 0.12 * u, 0.18 * u, h - 0.24 * u).fill(hex);
    p.rect(cx - 0.27 * u, sy + h / 2 - 0.09 * u, 0.54 * u, 0.18 * u).fill(hex);
}

export function textSign(p: Pen, cx: number, y: number, text: string, bg: string, fg = '#ffffff'): void {
    const u = p.u, w = (0.42 * text.length + 0.4) * u, h = 0.6 * u, x = cx - w / 2, sy = y - h - 0.1 * u;
    p.rr(x, sy, w, h, 0.14 * u).paint(bg);
    p.letters(text, cx, sy + h / 2 + 0.02 * u, 0.42 * u, fg);
}

export function emblem(p: Pen, cx: number, y: number, hex: string): void {
    const u = p.u, rad = 0.45 * u, cy = y - rad - 0.1 * u;
    p.ell(cx, cy, rad, rad).shadeFill(hex, cx - rad, cy - rad, cx + rad, cy + rad, 0.3).stroke();
    p.poly([[cx, cy - rad * 0.62], [cx + rad * 0.52, cy + rad * 0.42], [cx - rad * 0.52, cy + rad * 0.42]]).paint('#ffffff', 0.6);
}

/* ---------------------------------------------------------- unusual */

/** A round tower: walls with slit windows, a cone of a roof. */
export function tower(p: Pen, r: Rect, roof: string, wall: string, v = 0): void {
    const u = p.u, ground = r.y + r.h, cx = r.x + r.w / 2;
    const bodyTop = r.y + r.h * 0.36, bw = r.w * 0.78;
    p.rr(cx - bw / 2, bodyTop, bw, ground - bodyTop - 0.05 * u, [0, 0, bw * 0.2, bw * 0.2])
        .shadeFill(wall, cx - bw / 2, 0, cx + bw / 2, 0, 0.35).stroke();
    for (let y = bodyTop + 0.4 * u; y < ground - 0.5 * u; y += 0.45 * u) p.line([[cx - bw / 2 + 0.05 * u, y], [cx + bw / 2 - 0.05 * u, y]], null, 0.4, 0.25);
    for (const f of [0.3, 0.55]) p.glass(cx - 0.18 * u, bodyTop + (ground - bodyTop) * f, 0.36 * u, 0.62 * u, f > 0.4);
    p.rr(cx - 0.4 * u, ground - 1.25 * u, 0.8 * u, 1.2 * u, [0.4 * u, 0.4 * u, 0, 0]).shadeFill('#7a4a2a', cx - 0.4 * u, 0, cx + 0.4 * u, 0).stroke();
    const eave = bodyTop + 0.25 * u;
    if (v === 1) {
        /* An onion dome on a ring. */
        p.ell(cx, eave, r.w / 2, 0.16 * u).fill(roof).stroke(0.7);
        p.ctx.beginPath();
        p.ctx.moveTo(cx - bw / 2, eave);
        p.ctx.bezierCurveTo(cx - r.w * 0.62, eave - (eave - r.y) * 0.55, cx - 0.1 * u, eave - (eave - r.y) * 0.6, cx, r.y + 0.05 * u);
        p.ctx.bezierCurveTo(cx + 0.1 * u, eave - (eave - r.y) * 0.6, cx + r.w * 0.62, eave - (eave - r.y) * 0.55, cx + bw / 2, eave);
        p.ctx.closePath();
        p.shadeFill(roof, cx - r.w / 2, 0, cx + r.w / 2, 0, 0.35).stroke();
        p.ell(cx - r.w * 0.15, eave - (eave - r.y) * 0.45, r.w * 0.08, (eave - r.y) * 0.15).shine(0.3);
        p.line([[cx, r.y + 0.05 * u], [cx, r.y - 0.3 * u]], '#c8a040', 1.3);
        return;
    }
    if (v === 2) {
        /* An observatory: a dome with its slot open. */
        p.rect(cx - r.w / 2, eave - 0.2 * u, r.w, 0.25 * u).fill(lighten(wall, 0.1)).stroke(0.7);
        p.ctx.beginPath();
        p.ctx.ellipse(cx, eave - 0.2 * u, r.w / 2 - 0.05 * u, (eave - r.y) * 0.75, 0, Math.PI, 0);
        p.ctx.closePath();
        p.shadeFill(roof, cx - r.w / 2, 0, cx + r.w / 2, 0, 0.35).stroke();
        p.rect(cx - 0.18 * u, eave - (eave - r.y) * 0.75, 0.36 * u, (eave - r.y) * 0.55).fill('#1a2030').stroke(0.6);
        p.line([[cx - 0.05 * u, eave - 0.6 * u], [cx + 0.25 * u, eave - (eave - r.y) * 0.8]], '#c8c8d0', 2.2);
        return;
    }
    p.poly([[cx, r.y + 0.05 * u], [cx + r.w / 2, eave], [cx - r.w / 2, eave]]).shadeFill(roof, cx - r.w / 2, 0, cx + r.w / 2, 0, 0.35).stroke();
    p.poly([[cx, r.y + 0.05 * u], [cx + r.w / 2, eave], [cx + r.w * 0.12, eave]]).shade(0.22);
    p.ell(cx, eave, r.w / 2, 0.14 * u).fill(roof).stroke(0.7);
    p.line([[cx, r.y + 0.05 * u], [cx, r.y - 0.35 * u]], null, 1.2);
    p.poly([[cx, r.y - 0.35 * u], [cx + 0.35 * u, r.y - 0.25 * u], [cx, r.y - 0.15 * u]]).paint('#d04848', 0.6);
}

/** A small shrine: red posts, a dark curved roof. */
export function shrine(p: Pen, r: Rect, roof: string, posts: string, v = 0): void {
    const u = p.u, ground = r.y + r.h;
    if (v === 2) {
        /* Two tiers of roof. */
        shrine(p, { x: r.x + 0.4 * u, y: r.y, w: r.w - 0.8 * u, h: r.h * 0.55 }, roof, posts, 0);
        shrine(p, { x: r.x, y: r.y + r.h * 0.3, w: r.w, h: r.h * 0.7 }, roof, posts, 0);
        return;
    }
    const bodyTop = r.y + r.h * 0.45;
    p.rect(r.x + 0.35 * u, bodyTop, r.w - 0.7 * u, ground - bodyTop - 0.25 * u).shadeFill('#efe2c4', 0, bodyTop, 0, ground).stroke();
    p.rect(r.x + 0.35 * u, bodyTop, r.w - 0.7 * u, 0.25 * u).shade(0.3);
    for (const fx of [0.35, r.w / u - 0.6]) p.rect(r.x + fx * u, bodyTop - 0.1 * u, 0.25 * u, ground - bodyTop - 0.12 * u).shadeFill(posts, r.x + fx * u, 0, r.x + (fx + 0.25) * u, 0).stroke();
    p.rect(r.x + 0.1 * u, ground - 0.28 * u, r.w - 0.2 * u, 0.24 * u).fill('#a89878').stroke(0.6);
    const top = r.y + 0.15 * u, eave = bodyTop + 0.15 * u;
    p.ctx.beginPath();
    p.ctx.moveTo(r.x + 0.7 * u, top);
    p.ctx.lineTo(r.x + r.w - 0.7 * u, top);
    p.ctx.quadraticCurveTo(r.x + r.w - 0.3 * u, eave - 0.2 * u, r.x + r.w + 0.12 * u, eave - 0.3 * u);
    p.ctx.lineTo(r.x + r.w - 0.1 * u, eave);
    p.ctx.lineTo(r.x + 0.1 * u, eave);
    p.ctx.lineTo(r.x - 0.12 * u, eave - 0.3 * u);
    p.ctx.quadraticCurveTo(r.x + 0.3 * u, eave - 0.2 * u, r.x + 0.7 * u, top);
    p.shadeFill(roof, 0, top, 0, eave, 0.3).stroke();
    p.rect(r.x + 0.7 * u, top - 0.18 * u, r.w - 1.4 * u, 0.2 * u).paint(roof, 0.7);
    if (v === 1) {
        /* Stone lanterns either side. */
        for (const lx of [r.x + 0.05 * u, r.x + r.w - 0.45 * u]) {
            p.rect(lx + 0.14 * u, ground - 0.7 * u, 0.12 * u, 0.6 * u).paint('#a8a090', 0.6);
            p.rect(lx + 0.05 * u, ground - 0.98 * u, 0.3 * u, 0.3 * u).paint('#b8b0a0', 0.6);
            p.rect(lx + 0.12 * u, ground - 0.92 * u, 0.16 * u, 0.16 * u).fill(p.look.night ? '#ffd98a' : '#3a3430');
            p.poly([[lx, ground - 0.98 * u], [lx + 0.2 * u, ground - 1.18 * u], [lx + 0.4 * u, ground - 0.98 * u]]).paint('#a8a090', 0.6);
            p.glow(lx + 0.2 * u, ground - 0.84 * u, 0.9 * u);
        }
    }
}
