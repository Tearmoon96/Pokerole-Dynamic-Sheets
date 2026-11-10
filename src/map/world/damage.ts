import type { Pen, Rect } from './looks';
import { darken, lighten, mix } from './looks';
import { building } from './buildings';
import type { BuildingSpec, WallMat } from './buildings';
import { courses } from './medieval';

/* Houses that have seen better days (owner's ask, 2026-11-10: destroyed and
   burned houses, medieval and modern). Two ways of drawing one:

   - `collapsed`: the whole house by `building()`, with a hole torn in the
     roof showing the dark inside, broken rafters across it;
   - `shell`: no roof at all — the back wall's inner face, the floor heaped
     with rubble or ash, the side walls' tops and a broken front wall, as the
     slant view would show a roofless box.

   Burned is either, blackened, with soot, charred beams and maybe smoke.
   Holes are CLIPPED, never erased: a placed thing in the picture is drawn
   straight onto the map, where erasing would cut the ground away too. */

type Pt = [number, number];

/** A ragged line from x0 to x1 at height y (±amp). */
export function ragged(p: Pen, x0: number, x1: number, y: number, amp: number, step = 0.3 * p.u): Pt[] {
    const pts: Pt[] = [];
    for (let x = x0; x < x1; x += step) pts.push([x, y + (p.rnd() - 0.5) * 2 * amp]);
    pts.push([x1, y + (p.rnd() - 0.5) * 2 * amp]);
    return pts;
}

/** Draws, keeping only what lies below the ragged line `top`. */
export function below(p: Pen, top: Pt[], draw: () => void): void {
    const ctx = p.ctx, x0 = top[0][0], x1 = top[top.length - 1][0];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 - 1e4, top[0][1]);
    top.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(x1 + 1e4, top[top.length - 1][1]);
    ctx.lineTo(x1 + 1e4, 1e5);
    ctx.lineTo(x0 - 1e4, 1e5);
    ctx.closePath();
    ctx.clip();
    draw();
    ctx.restore();
}

/** Draws everything except what falls inside `hole`. */
function outside(p: Pen, hole: Pt[], draw: () => void): void {
    const ctx = p.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1e5, -1e5, 2e5, 2e5);
    hole.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip('evenodd');
    draw();
    ctx.restore();
}

/** Fallen stones (or bricks) heaped along a line. */
export function rubble(p: Pen, x: number, y: number, w: number, hex: string, n = 7): void {
    const u = p.u;
    for (let i = 0; i < n; i++) {
        const rx = x + p.rnd() * w, rw = (0.18 + p.rnd() * 0.22) * u;
        p.rr(rx - rw / 2, y - (0.1 + p.rnd() * 0.18) * u, rw, rw * 0.62, 0.05 * u).paint(p.rnd() < 0.5 ? hex : lighten(hex, 0.1), 0.5);
    }
}

/** Weeds and grass growing out of a ruin. */
function weeds(p: Pen, x: number, y: number, w: number, n = 4): void {
    const u = p.u;
    for (let i = 0; i < n; i++) {
        const gx = x + p.rnd() * w;
        for (const a of [-0.35, 0, 0.35]) p.line([[gx, y], [gx + a * 0.3 * u, y - (0.25 + p.rnd() * 0.15) * u]], '#5a8a3a', 1.1);
    }
}

/** Black stains rising from a line: soot over windows and roof. */
function soot(p: Pen, x: number, y: number, w: number, h: number): void {
    const ctx = p.ctx;
    ctx.save();
    p.rect(x, y - h, w, h * 1.4);
    ctx.clip();
    ctx.globalAlpha *= 0.45;
    for (let i = 0; i < Math.max(2, Math.round(w / (0.8 * p.u))); i++) {
        const sx = x + p.rnd() * w, sw = (0.3 + p.rnd() * 0.35) * p.u;
        p.ell(sx, y - h * 0.4, sw, h * (0.4 + p.rnd() * 0.4)).fill('#1a1410');
    }
    ctx.restore();
}

/** Grey smoke rising in puffs, thinning as it goes. */
export function smoke(p: Pen, cx: number, y: number, top: number): void {
    const ctx = p.ctx, u = p.u;
    ctx.save();
    for (let yy = y, i = 0; yy > top + 0.4 * u; yy -= 0.5 * u, i++) {
        const k = (y - yy) / Math.max(1, y - top);
        ctx.globalAlpha = 0.55 * (1 - k * 0.7);
        const sx = cx + Math.sin(i * 1.3) * 0.25 * u + k * 0.6 * u;
        p.ell(sx, yy, (0.32 + k * 0.45) * u, (0.26 + k * 0.3) * u).fill(mix('#6a6a6a', '#b8b8b8', k));
    }
    ctx.restore();
}

/** Glowing embers along a line, lit up at night. */
export function embers(p: Pen, x: number, y: number, w: number, hex: string, n = 6): void {
    const u = p.u;
    for (let i = 0; i < n; i++) {
        const ex = x + p.rnd() * w, ey = y - p.rnd() * 0.25 * u;
        p.ell(ex, ey, (0.06 + p.rnd() * 0.07) * u, 0.05 * u).fill(p.rnd() < 0.5 ? hex : lighten(hex, 0.35));
        if (i % 2 === 0) p.glow(ex, ey, 0.9 * u);
    }
}

/** Beams sticking up out of a burned house, at an angle. */
function charredBeams(p: Pen, x: number, y: number, w: number, n: number, rise: number): void {
    const u = p.u;
    for (let i = 0; i < n; i++) {
        const bx = x + (i + 0.5) * w / n + (p.rnd() - 0.5) * 0.3 * u;
        const tx = bx + (p.rnd() - 0.5) * 0.8 * u, ty = y - rise * (0.5 + p.rnd() * 0.5);
        p.line([[bx, y], [tx, ty]], '#1a1410', 3.2);
        p.line([[bx, y], [tx, ty]], '#3a2a20', 1.6);
    }
}

/** A house whose roof has fallen in, maybe burned. */
export function collapsed(p: Pen, r: Rect, s: BuildingSpec, burned = false, ember?: string): void {
    const u = p.u, ground = r.y + r.h;
    const wallH = (s.wallH ?? s.floors * 1.4 + 0.45) * u, wallTop = ground - wallH;
    const roofTop = r.y + 0.08 * u, eave = wallTop + 0.16 * u;
    p.reseed(Math.round(r.w * 3 + r.h * 7));
    const cx = r.x + r.w * (0.42 + p.rnd() * 0.16), cy = roofTop + (eave - roofTop) * 0.56;
    const rx = r.w * (burned ? 0.34 : 0.24), ry = (eave - roofTop) * (burned ? 0.6 : 0.44);
    const hole: Pt[] = [];
    for (let i = 0; i < 14; i++) {
        const t = i * Math.PI * 2 / 14, k = 0.72 + p.rnd() * 0.42;
        hole.push([cx + Math.cos(t) * rx * k, Math.min(eave + 0.2 * u, cy + Math.sin(t) * ry * k)]);
    }
    const spec: BuildingSpec = burned
        ? { ...s, wall: mix(s.wall, '#2a2420', 0.55), roof: mix(s.roof, '#1a1410', 0.6), ruin: 'broken', chimney: false, chimney2: false, boxes: undefined, awning: undefined, hangSign: undefined }
        : { ...s, ruin: s.ruin ?? 'broken', boxes: undefined };
    outside(p, hole, () => building(p, r, spec));
    /* Inside the hole: the dark of the house, rafters across it, a fallen beam. */
    p.poly(hole).fill('#2a2018');
    p.poly(hole).shade(0.35);
    const ctx = p.ctx;
    ctx.save();
    p.poly(hole);
    ctx.clip();
    const wood = burned ? '#1a1410' : '#6a4a2a';
    for (let x = cx - rx * 1.2; x < cx + rx * 1.2; x += 0.5 * u) {
        const end = cy - ry + (p.rnd() * 1.6) * ry;
        p.line([[x, cy - ry * 1.3], [x + 0.08 * u, end]], wood, 2.4);
    }
    p.line([[cx - rx, cy + ry * 0.2], [cx + rx * 0.8, cy - ry * 0.5]], wood, 3);
    rubble(p, cx - rx, cy + ry * 0.9, rx * 2, burned ? '#3a3430' : lighten(s.wall, 0.05), 6);
    if (burned && ember) embers(p, cx - rx * 0.7, cy + ry * 0.6, rx * 1.4, ember, 5);
    ctx.restore();
    p.poly(hole).stroke(1);
    if (burned) {
        soot(p, r.x + 0.2 * u, wallTop + 0.5 * u, r.w - 0.4 * u, 1.2 * u);
        if (ember) smoke(p, cx, cy - ry * 0.4, r.y - 0.2 * u);
    } else {
        weeds(p, r.x + 0.2 * u, ground - 0.02 * u, r.w - 0.4 * u, 3);
    }
    rubble(p, r.x + 0.2 * u, ground + 0.05 * u, r.w - 0.4 * u, burned ? '#3a3430' : s.roof, 5);
}

export interface ShellSpec {
    wall: string;
    mat: WallMat;
    /** The footprint's depth and the wall's height, in cells. */
    depth: number;
    wallH: number;
    floors: number;
    windows: number;
    /** The floor inside: earth, ash, concrete. */
    floor: string;
    burned?: boolean;
    /** Embers' colour: smouldering. */
    ember?: string;
    /** Concrete floor slabs at every storey, rebar sticking out (modern). */
    slabs?: boolean;
    /** Black posts left standing where a timber frame stood. */
    posts?: boolean;
}

/** A roofless shell of a house: what is left after a war or a fire. */
export function shell(p: Pen, r: Rect, s: ShellSpec): void {
    const u = p.u, ground = r.y + r.h, wh = s.wallH * u, D = s.depth * u, t = 0.26 * u;
    const x0 = r.x + 0.1 * u, x1 = r.x + r.w - 0.1 * u, gb = ground - D;
    const wall = s.burned ? mix(s.wall, '#2a2420', 0.5) : s.wall;
    const inner = darken(wall, 0.3);
    p.reseed(Math.round(r.w * 5 + r.h * 11 + s.floors));
    const face = (x: number, y: number, w: number, h: number, hex: string) => {
        p.rect(x, y, w, h).shadeFill(hex, 0, y, 0, y + h, 0.18);
        if (s.mat === 'stone') courses(p, x, y, w, h, hex);
        else if (s.mat === 'brick' || s.mat === 'timber' || s.mat === 'planks' || s.mat === 'panels') {
            /* The building's own pattern, from a wall of the same size. */
            const ctx = p.ctx;
            ctx.save();
            p.rect(x, y, w, h);
            ctx.clip();
            if (s.mat === 'brick') {
                for (let yy = y + h, row = 0; yy > y; yy -= 0.2 * u, row++) {
                    p.line([[x, yy], [x + w, yy]], lighten(hex, 0.3), 0.5, 0.5);
                    for (let xx = x + (row % 2 ? 0.22 * u : 0); xx < x + w; xx += 0.44 * u) p.line([[xx, yy - 0.2 * u], [xx, yy]], lighten(hex, 0.3), 0.45, 0.45);
                }
            } else if (s.mat === 'planks') {
                for (let xx = x + 0.28 * u; xx < x + w; xx += 0.28 * u) p.line([[xx, y], [xx, y + h]], null, 0.45, 0.5);
            } else if (s.mat === 'panels') {
                for (let xx = x + 1.3 * u; xx < x + w; xx += 1.3 * u) p.line([[xx, y], [xx, y + h]], darken(hex, 0.2), 0.6, 0.6);
            } else {
                const beam = s.burned ? '#1a1410' : '#4a3020';
                for (let xx = x; xx <= x + w; xx += w / Math.max(2, Math.round(w / (1.15 * u)))) p.rect(xx - 0.05 * u, y, 0.11 * u, h).fill(beam);
                p.rect(x, y + h - 0.11 * u, w, 0.11 * u).fill(beam);
            }
            ctx.restore();
        }
    };

    /* The back wall's inner face, its ragged top. */
    const backTop = ragged(p, x0, x1, gb - wh * 0.9, wh * 0.18, 0.4 * u);
    below(p, backTop, () => {
        face(x0, gb - wh * 1.1, x1 - x0, wh * 1.1, inner);
        p.rect(x0, gb - wh * 1.1, x1 - x0, wh * 1.1).shade(0.2);
        const fh = (wh - 0.5 * u) / s.floors;
        for (let f = 0; f < s.floors; f++) {
            const y = gb - 0.3 * u - f * fh - fh * 0.62 - 0.3 * u;
            for (let i = 0; i < s.windows; i++) {
                const cx = x0 + (x1 - x0) * (i + 0.5) / s.windows;
                p.rect(cx - 0.28 * u, y, 0.56 * u, 0.6 * u).fill(mix(inner, '#8aa080', 0.35)).stroke(0.6);
            }
            if (s.slabs && f > 0) p.rect(x0, gb - f * fh - 0.08 * u, x1 - x0, 0.16 * u).fill(lighten(wall, 0.1)).stroke(0.5);
        }
    });
    p.line(backTop, lighten(wall, 0.15), 1.6);

    /* The floor between, heaped. */
    const floorTop = gb, floorBot = ground - wh;
    if (floorBot > floorTop) {
        p.rect(x0 + t, floorTop, x1 - x0 - 2 * t, floorBot - floorTop).fill(s.floor).stroke(0.6);
        rubble(p, x0 + t, floorBot - 0.1 * u, x1 - x0 - 2 * t, s.burned ? '#3a3430' : lighten(wall, 0.05), 6);
        const wood = s.burned ? '#1a1410' : '#7a5434';
        p.line([[x0 + t + 0.3 * u, floorTop + 0.3 * u], [x1 - t - 0.6 * u, floorBot - 0.2 * u]], wood, 2.6);
        if (s.ember) embers(p, x0 + t, (floorTop + floorBot) / 2, x1 - x0 - 2 * t, s.ember, 7);
        if (!s.burned) weeds(p, x0 + t, floorBot, x1 - x0 - 2 * t, 3);
    }

    /* The side walls' tops, from the back down to the front. */
    for (const sx of [x0, x1 - t]) {
        const top = gb - wh * (0.7 + p.rnd() * 0.25), bot = ground - wh * (0.75 + p.rnd() * 0.25);
        p.rect(sx, top, t, Math.max(0, bot - top)).fill(lighten(wall, 0.08)).stroke(0.7);
    }

    /* The front wall, broken along the top. */
    const frontTop = ragged(p, x0, x1, ground - wh * 0.86, wh * 0.16, 0.35 * u);
    below(p, frontTop, () => {
        face(x0, ground - wh * 1.05, x1 - x0, wh * 1.05 - 0.04 * u, wall);
        p.rect(x0, ground - wh * 1.05, x1 - x0, wh * 1.05 - 0.04 * u).stroke();
        const fh = (wh - 0.5 * u) / s.floors;
        for (let f = 0; f < s.floors; f++) {
            const y = ground - 0.26 * u - f * fh - fh * 0.62 - 0.32 * u;
            for (let i = 0; i < s.windows; i++) {
                const cx = x0 + (x1 - x0) * (i + 0.5) / s.windows;
                if (f === 0 && Math.abs(cx - (x0 + x1) / 2) < 0.7 * u) continue;
                p.rect(cx - 0.3 * u, y, 0.6 * u, 0.64 * u).fill('#1e1812').stroke(0.7);
            }
            if (s.slabs && f > 0) p.rect(x0 - 0.05 * u, ground - 0.26 * u - f * fh - 0.08 * u, x1 - x0 + 0.1 * u, 0.16 * u).fill(lighten(wall, 0.12)).stroke(0.5);
        }
        /* The doorway, empty. */
        const dc = (x0 + x1) / 2;
        p.rr(dc - 0.42 * u, ground - 1.4 * u, 0.84 * u, 1.36 * u, [0.3 * u, 0.3 * u, 0, 0]).fill('#1e1812').stroke(0.7);
        if (s.burned) soot(p, x0, ground - 0.3 * u - fh * 0.3, x1 - x0, wh * 0.7);
    });
    p.line(frontTop, lighten(wall, 0.18), 2);
    p.line(frontTop, null, 0.8);

    if (s.slabs) {
        /* Bent bars out of the broken concrete. */
        for (let i = 0; i < 5; i++) {
            const q = frontTop[Math.floor(p.rnd() * frontTop.length)];
            p.line([[q[0], q[1]], [q[0] + (p.rnd() - 0.5) * 0.4 * u, q[1] - (0.25 + p.rnd() * 0.3) * u]], '#5a4a40', 0.9);
        }
    }
    if (s.posts) {
        /* What a timber frame leaves: black posts, one rafter still leaning. */
        for (const fx of [0.04, 0.5, 0.96]) {
            const x = x0 + (x1 - x0) * fx;
            p.rect(x - 0.08 * u, ground - wh - 1.2 * u * (0.5 + p.rnd() * 0.5), 0.16 * u, wh * 0.3 + 1.2 * u).fill('#1a1410');
        }
        p.line([[x0 + 0.1 * u, ground - wh - 0.4 * u], [(x0 + x1) / 2, ground - wh - 1.6 * u]], '#1a1410', 3);
    }
    if (s.burned) charredBeams(p, x0 + 0.3 * u, ground - wh * 0.8, x1 - x0 - 0.6 * u, 2, 0.9 * u);
    /* No floor to be seen over a tall front wall: the embers glow in the doorway's rubble. */
    if (s.ember && !(floorBot > floorTop)) embers(p, (x0 + x1) / 2 - 0.6 * u, ground - 0.12 * u, 1.2 * u, s.ember, 6);
    if (s.ember) smoke(p, x0 + (x1 - x0) * 0.6, gb - 0.3 * u, r.y);
    rubble(p, x0, ground + 0.05 * u, x1 - x0, s.burned ? '#3a3430' : wall, 6);
    if (!s.burned) weeds(p, x0, ground, x1 - x0, 3);
}
