/* Procedural terrain textures, drawn once into a small tile and repeated.

   They are what a style looks like before anyone has drawn it any art: a
   texture file in MapSprites/<Style>/terrain/ replaces the painter for that
   terrain outright. Each painter is seeded, so the tile is identical on every
   redraw and the ground does not crawl while you paint.

   Two families. The smooth ones draw at 2x into a tile TWO cells wide and are
   scaled back down by the pattern's transform, so they stay sharp at the zoom
   people actually use. The `px-` ones are pixel art: 16 texels a cell, drawn at
   1x and blown up with smoothing off, which is the whole look. */

export const CELL = 32;              // world px per cell
export const TILE_CELLS = 2;         // a tile covers 2x2 cells
export const SMOOTH_RES = 2;         // texels per world px, smooth painters
export const PX_PER_CELL = 16;       // texels per cell, pixel painters

type Rng = () => number;

function rng(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* A painter calls `mark()` as it starts each marker — a tree, a tuft, a
   peak — and `mark(false)` to go back to plain ground texture. That is what
   lets a marker that a neighbouring terrain would cut be left out whole
   (see patternParts). Ground texture — sand, waves, snow — is never cut out. */
type Mark = (on?: boolean) => void;
type Painter = (c: CanvasRenderingContext2D, S: number, ink: string, r: Rng, mark: Mark) => void;
const noMark: Mark = () => {};

/* Every painter is drawn nine times, shifted by a tile each way, so a tree
   whose crown hangs past the tile's edge carries on in the next tile instead
   of being sliced off at the cell line. The same seed makes all nine the same
   layout. Painters that already tile by construction — full-width lines, or a
   wrap of their own — are left out, or their shapes would be drawn twice over
   and any translucent ink would darken. */
const SELF_TILING = new Set(['bricks', 'clouds', 'puffs', 'px-bricks', 'px-clouds', 'engr-clouds', 'engr-cobbles']);

/* The organic painters use a tile four cells wide rather than two, so their
   scatter repeats half as often and reads as random ground. Their counts are
   written per two-cell tile and scaled up by `area(S)`. */
const BIG_TILE = new Set(['tussocks', 'tall-tussocks', 'flowers', 'swamp', 'forest-line', 'forest-fill',
    'jungle-line', 'jungle-fill', 'shrubs', 'bare-trees', 'volcanoes', 'rocks', 'hatch-peaks', 'hatch-snow-peaks',
    'engr-forest', 'engr-jungle', 'engr-grass', 'engr-flowers', 'engr-dunes', 'engr-mesas', 'engr-tundra', 'engr-drifts',
    'engr-volcanoes', 'engr-rocks', 'engr-swamp',
    'px-flowers', 'px-swamp', 'px-forest', 'px-jungle', 'px-shrubs', 'px-bare-trees', 'px-volcanic', 'px-rocks']);

/** How many cells a side of this pattern's tile covers. */
export function tileCells(name: string): number {
    return BIG_TILE.has(name) ? 4 : TILE_CELLS;
}

/** How many times a two-cell tile's worth of things fits in this tile. */
const area = (S: number, pixel = false) => (S / (pixel ? PX_PER_CELL * TILE_CELLS : CELL * TILE_CELLS * SMOOTH_RES)) ** 2;

/** A colour lightened (amt > 0) or darkened (amt < 0), alpha kept. */
function shade(hex: string, amt: number): string {
    let h = hex.replace('#', '');
    if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
    const a = h.length === 8 ? h.slice(6) : '';
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
        .map((v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))
        .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'));
    return '#' + rgb.join('') + a;
}

const FLOWER_COLORS = ['#e84a6f', '#f6c945', '#ffffff', '#9b6ae0', '#ff8a3d', '#4aa8e8', '#f07ac0', '#e8413a'];

/** Things placed at random but not on top of each other: up to `n` points
    at least `gap` apart, which a painter then draws in order of height so the
    nearer ones overlap the farther. */
function scatter(r: Rng, S: number, n: number, gap: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let tries = 0; pts.length < n && tries < n * 30; tries++) {
        const x = r() * S, y = r() * S;
        /* Distance across the tile's wrap, so the edges keep their spacing too. */
        const ok = pts.every((p) => {
            const dx = Math.min(Math.abs(p.x - x), S - Math.abs(p.x - x));
            const dy = Math.min(Math.abs(p.y - y), S - Math.abs(p.y - y));
            return dx * dx + dy * dy >= gap * gap;
        });
        if (ok) pts.push({ x, y });
    }
    return pts.sort((a, b) => a.y - b.y);
}

/* ------------------------------------------------------------ smooth family */

const line = (c: CanvasRenderingContext2D, w: number) => {
    c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
};

/** Offsets that draw a shape again across each edge of the tile. */
const WRAP: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];


/* One broadleaf tree and one pine, in the two looks: `fill` draws them as
   solid shapes with a highlight (Anime), otherwise as ink outlines over a
   pale wash (Hand-drawn). */
function roundTree(c: CanvasRenderingContext2D, x: number, y: number, rad: number, S: number, ink: string, fill: boolean) {
    if (fill) {
        c.fillStyle = shade(ink, -0.25);
        c.fillRect(x - rad * 0.12, y - rad * 0.3, rad * 0.24, rad * 0.7);
        c.fillStyle = ink;
        c.beginPath(); c.arc(x, y - rad, rad, 0, 7); c.fill();
        c.fillStyle = '#ffffff30';
        c.beginPath(); c.arc(x - rad * 0.3, y - rad * 1.3, rad * 0.45, 0, 7); c.fill();
        return;
    }
    c.strokeStyle = ink; line(c, S / 110);
    c.fillStyle = '#ffffff22';
    c.beginPath(); c.arc(x, y - rad, rad, Math.PI * 0.85, Math.PI * 2.15); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x, y - rad * 0.2); c.lineTo(x, y + rad * 0.5); c.stroke();
}

function pineTree(c: CanvasRenderingContext2D, x: number, y: number, h: number, S: number, ink: string, fill: boolean) {
    const tiers = 3, w = h * 0.36;
    if (fill) {
        c.fillStyle = shade(ink, -0.35);
        c.fillRect(x - h * 0.04, y - h * 0.15, h * 0.08, h * 0.2);
    } else {
        c.strokeStyle = ink; line(c, S / 110);
        c.beginPath(); c.moveTo(x, y - h * 0.15); c.lineTo(x, y + h * 0.05); c.stroke();
    }
    for (let k = 0; k < tiers; k++) {
        const base = y - h * 0.12 - k * h * 0.25, top = base - h * 0.42, half = w * (1 - k * 0.24);
        c.beginPath();
        c.moveTo(x - half, base); c.lineTo(x, top); c.lineTo(x + half, base); c.closePath();
        if (fill) {
            c.fillStyle = shade(ink, -0.15); c.fill();
            c.fillStyle = '#ffffff26';
            c.beginPath(); c.moveTo(x - half * 0.85, base - h * 0.02); c.lineTo(x, top); c.lineTo(x - half * 0.1, base - h * 0.02); c.closePath(); c.fill();
        } else {
            c.fillStyle = '#ffffff22'; c.fill(); c.stroke();
        }
    }
}

/* Forest: the round trees in staggered rows, as before, and pines dropped
   at random into the gaps between them. */
function forest(c: CanvasRenderingContext2D, S: number, ink: string, r: Rng, fill: boolean, mark: Mark) {
    const n = Math.round((fill ? 3 : 4) * Math.sqrt(area(S)));
    const things: { x: number; y: number; kind: 'round' | 'pine'; size: number }[] = [];
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            const x = (col + (row % 2) * 0.5 + (fill ? 0.25 : 0) + (r() - 0.5) * 0.3) * S / n;
            const y = (row + 0.6 + (r() - 0.5) * 0.2) * S / n;
            /* About one tree in four is a pine instead. */
            if (r() < 0.25) things.push({ x, y, kind: 'pine', size: S * (fill ? 0.2 : 0.13) * (0.85 + r() * 0.3) });
            else things.push({ x, y, kind: 'round', size: S * (fill ? 0.1 + r() * 0.03 : 0.045 + r() * 0.012) });
        }
    }
    /* And a few more pines squeezed in between the rows. */
    for (let i = 0; i < n * 1.5; i++) {
        const x = r() * S, y = r() * S;
        const near = things.some((t) => Math.hypot(t.x - x, t.y - y) < S / n * 0.45);
        if (!near) things.push({ x, y, kind: 'pine', size: S * (fill ? 0.17 : 0.11) * (0.85 + r() * 0.3) });
    }
    things.sort((a, b) => a.y - b.y);
    for (const t of things) {
        mark();
        if (t.kind === 'pine') pineTree(c, t.x, t.y, t.size, S, ink, fill);
        else roundTree(c, t.x, t.y, t.size, S, ink, fill);
    }
}

/* Jungle: palms leaning out of a dense broadleaf canopy, and ferns in
   whatever ground shows between. */
function palm(c: CanvasRenderingContext2D, x: number, y: number, h: number, S: number, ink: string, fill: boolean, r: Rng) {
    const lean = (r() - 0.5) * h * 0.5;
    const tx = x + lean, ty = y - h;
    c.strokeStyle = fill ? shade(ink, -0.45) : ink;
    line(c, fill ? S / 70 : S / 100);
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 0.2, y - h * 0.55, tx, ty); c.stroke();
    const fronds = 6;
    for (let k = 0; k < fronds; k++) {
        const a = -Math.PI / 2 + (k / (fronds - 1) - 0.5) * Math.PI * 1.45 + (r() - 0.5) * 0.2;
        const len = h * (0.5 + r() * 0.15);
        const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.55 + len * 0.35;
        const mx = tx + Math.cos(a) * len * 0.5, my = ty + Math.sin(a) * len * 0.5 - len * 0.12;
        const nx = -Math.sin(a) * len * 0.12, ny = Math.cos(a) * len * 0.12;
        c.beginPath();
        c.moveTo(tx, ty);
        c.quadraticCurveTo(mx + nx, my + ny, ex, ey);
        c.quadraticCurveTo(mx - nx, my - ny, tx, ty);
        if (fill) { c.fillStyle = k % 2 ? ink : shade(ink, 0.18); c.fill(); }
        else { c.fillStyle = '#ffffff22'; c.fill(); line(c, S / 130); c.strokeStyle = ink; c.stroke(); }
    }
}

function broadleaf(c: CanvasRenderingContext2D, x: number, y: number, rad: number, S: number, ink: string, fill: boolean, r: Rng) {
    const lobes = 5;
    c.beginPath();
    for (let k = 0; k < lobes; k++) {
        const a = Math.PI + k / (lobes - 1) * Math.PI;
        const lx = x + Math.cos(a) * rad * 0.62, ly = y - rad + Math.sin(a) * rad * 0.45 + rad * 0.1;
        const lr = rad * (0.45 + r() * 0.12);
        c.moveTo(lx + lr, ly); c.arc(lx, ly, lr, 0, 7);
    }
    c.moveTo(x + rad * 0.55, y - rad * 0.8); c.arc(x, y - rad * 0.8, rad * 0.55, 0, 7);
    if (fill) {
        c.fillStyle = shade(ink, -0.1); c.fill();
        c.fillStyle = '#ffffff28';
        c.beginPath(); c.arc(x - rad * 0.25, y - rad * 1.35, rad * 0.3, 0, 7); c.fill();
    } else {
        c.fillStyle = '#ffffff22'; c.fill();
        c.strokeStyle = ink; line(c, S / 110); c.stroke();
        c.beginPath(); c.moveTo(x, y - rad * 0.35); c.lineTo(x, y + rad * 0.35); c.stroke();
    }
}

function jungle(c: CanvasRenderingContext2D, S: number, ink: string, r: Rng, fill: boolean, mark: Mark) {
    const k = area(S);
    const things = [
        ...scatter(r, S, Math.round((fill ? 6 : 9) * k), S * (fill ? 0.16 : 0.12)).map((p) => ({ ...p, kind: 'leaf' as const })),
        ...scatter(r, S, Math.round((fill ? 3 : 4) * k), S * 0.2).map((p) => ({ ...p, kind: 'palm' as const })),
        ...scatter(r, S, Math.round(5 * k), S * 0.1).map((p) => ({ ...p, kind: 'fern' as const })),
    ].sort((a, b) => a.y - b.y);
    for (const t of things) {
        mark();
        if (t.kind === 'palm') palm(c, t.x, t.y, S * (fill ? 0.2 : 0.15) * (0.85 + r() * 0.3), S, ink, fill, r);
        else if (t.kind === 'leaf') broadleaf(c, t.x, t.y, S * (fill ? 0.085 : 0.06) * (0.85 + r() * 0.3), S, ink, fill, r);
        else {
            c.strokeStyle = fill ? shade(ink, -0.2) : ink; line(c, S / 140);
            const h = S * 0.035;
            for (let j = 0; j < 5; j++) {
                const a = (j / 4 - 0.5) * 2.2;
                c.beginPath(); c.moveTo(t.x, t.y);
                c.quadraticCurveTo(t.x + Math.sin(a) * h * 0.8, t.y - h, t.x + Math.sin(a) * h * 1.3, t.y - Math.cos(a) * h * 0.6);
                c.stroke();
            }
        }
    }
}

/* An engraver's mountain range, as an old atlas draws one: peaks in
   clusters, each a pale lit face and a shadowed flank filled with parallel
   hatching, under one ink outline. The lit face is nearly opaque, so a peak
   in front hides the one behind it. `snow` leaves the top of every peak
   unhatched and paler: bare paper reads as snow. */
function hatchedRange(c: CanvasRenderingContext2D, S: number, ink: string, r: Rng, mark: Mark, snow: boolean) {
    const peaks: { x: number; y: number; w: number; h: number; sk: number }[] = [];
    for (const p of scatter(r, S, Math.round(4 * area(S)), S * 0.11)) {
        const n = 2 + (r() * 3 | 0);
        for (let k = 0; k < n; k++) {
            const w = S * (0.06 + r() * 0.045);
            peaks.push({
                x: p.x + (r() - 0.5) * S * 0.14, y: p.y + (r() - 0.5) * S * 0.06,
                w, h: w * (0.95 + r() * 0.5), sk: (r() - 0.5) * 0.35,
            });
        }
    }
    peaks.sort((a, b) => a.y - b.y);
    const lw = S / 125;
    for (const { x, y, w, h, sk } of peaks) {
        mark();
        const top: [number, number] = [x + w * sk, y - h];
        /* A rugged slope: three jags, one of them sometimes a shoulder. */
        const slope = (from: [number, number], to: [number, number]): [number, number][] => {
            const out: [number, number][] = [];
            for (const t of [0.28, 0.55, 0.8]) {
                out.push([from[0] + (to[0] - from[0]) * t + (r() - 0.5) * w * 0.28,
                    from[1] + (to[1] - from[1]) * t + (r() - 0.4) * h * 0.14]);
            }
            return out;
        };
        const left = slope([x - w, y], top);
        const right = slope(top, [x + w, y]);
        const ridgeFoot: [number, number] = [x + w * (0.05 + r() * 0.2), y];
        const outline = () => {
            c.beginPath(); c.moveTo(x - w, y);
            for (const q of left) c.lineTo(q[0], q[1]);
            c.lineTo(top[0], top[1]);
            for (const q of right) c.lineTo(q[0], q[1]);
            c.lineTo(x + w, y);
        };
        /* The lit face, over everything behind. */
        outline(); c.closePath();
        c.fillStyle = snow ? '#f2ead6f0' : '#e2d3abf0';
        c.fill();
        /* The shadowed flank: summit, down the right slope, back up the ridge. */
        const shadow = () => {
            c.beginPath(); c.moveTo(top[0], top[1]);
            for (const q of right) c.lineTo(q[0], q[1]);
            c.lineTo(x + w, y); c.lineTo(ridgeFoot[0], ridgeFoot[1]); c.closePath();
        };
        c.save();
        shadow();
        c.fillStyle = shade(ink, 0.2) + (snow ? '26' : '44');
        c.fill();
        c.clip();
        if (snow) { c.beginPath(); c.rect(x - w * 2, y - h * 0.6, w * 4, h); c.clip(); }
        c.strokeStyle = ink; line(c, lw * 0.75);
        const step = Math.max(2.5, w * 0.12);
        for (let d = -h; d < w * 2; d += step) {
            c.beginPath();
            c.moveTo(top[0] + d, top[1]);
            c.lineTo(top[0] + d + h * 0.5, top[1] + h * 1.1);
            c.stroke();
        }
        c.restore();
        /* A few strokes down the lit face, the ridge, the outline, scree. */
        c.strokeStyle = ink; line(c, lw * 0.6);
        for (let k = 0; k < 2; k++) {
            const t = 0.35 + r() * 0.3, q = left[1];
            c.beginPath();
            c.moveTo(q[0] + (top[0] - q[0]) * t, q[1] + (top[1] - q[1]) * t);
            c.lineTo(q[0] + (top[0] - q[0]) * t - w * 0.12, q[1] + (top[1] - q[1]) * t + h * 0.22);
            c.stroke();
        }
        line(c, lw);
        c.beginPath(); c.moveTo(top[0], top[1]);
        c.quadraticCurveTo((top[0] + ridgeFoot[0]) / 2 + w * 0.1, (top[1] + y) / 2, ridgeFoot[0], ridgeFoot[1] - h * 0.1);
        c.stroke();
        outline(); c.stroke();
        line(c, lw * 0.7);
        for (let k = 0; k < 2; k++) {
            const bx = x + (r() - 0.2) * w * 1.4;
            c.beginPath(); c.moveTo(bx, y + h * 0.04); c.lineTo(bx + w * 0.3, y + h * 0.04); c.stroke();
        }
    }
}

/* ---- the engraver's hand: every other Ancient biome, drawn as the
   mountains are. Light from the upper left; a pale face toward it, the far
   side tinted and filled with strokes at the mountains' slant, one ink
   outline over both. */

const ENGR_LIT = '#e2d3abf0';

/** The ink's lighter tint at alpha `a` (two hex digits), whatever alpha the ink had. */
const tintOf = (ink: string, a: string) => shade(ink.slice(0, 7), 0.2) + a;

/** Parallel strokes over a box, at the mountains' slant. */
function hatchBox(c: CanvasRenderingContext2D, ink: string, x0: number, y0: number, x1: number, y1: number, step: number, lw: number) {
    c.strokeStyle = ink; line(c, lw);
    const run = (y1 - y0) * 0.45;
    c.beginPath();
    for (let d = x0 - run; d <= x1; d += step) { c.moveTo(d, y0); c.lineTo(d + run, y1); }
    c.stroke();
}

/** A shape engraved: `outline` traces it, `shadow` traces its shaded part
    (clipped to the shape, with `rule`), `box` bounds the hatching. */
function engrave(c: CanvasRenderingContext2D, S: number, ink: string, outline: () => void, shadow: () => void,
    box: [number, number, number, number], opts: { lit?: string; step?: number; rule?: CanvasFillRule; lw?: number } = {}) {
    const lw = opts.lw ?? S / 125;
    outline(); c.fillStyle = opts.lit ?? ENGR_LIT; c.fill();
    c.save();
    outline(); c.clip();
    shadow(); c.fillStyle = tintOf(ink, '44'); c.fill(opts.rule ?? 'nonzero'); c.clip(opts.rule ?? 'nonzero');
    hatchBox(c, ink, box[0], box[1], box[2], box[3], opts.step ?? 2.5, lw * 0.55);
    c.restore();
    c.strokeStyle = ink; line(c, lw * 0.9);
    outline(); c.stroke();
}

/** A rounded shape engraved, its shade the crescent on the lower right:
    everything outside an ellipse pushed toward the light. */
function engraveBlob(c: CanvasRenderingContext2D, S: number, ink: string, outline: () => void,
    cx: number, cy: number, rx: number, ry: number, opts: { lit?: string; lw?: number } = {}) {
    const ex = cx - rx * 0.4, ey = cy - ry * 0.45, erx = rx * 0.98, ery = ry * 0.98;
    engrave(c, S, ink, outline, () => {
        c.beginPath();
        c.rect(cx - rx * 2, cy - ry * 2, rx * 4, ry * 4);
        c.moveTo(ex + erx, ey); c.ellipse(ex, ey, erx, ery, 0, 0, Math.PI * 2);
    }, [cx - rx * 1.2, cy - ry * 1.2, cx + rx * 1.2, cy + ry * 1.2],
    { ...opts, rule: 'evenodd', step: Math.max(2.2, Math.min(rx, ry) * 0.24) });
}

/** A closed outline through points, as a path function. */
const polyPath = (c: CanvasRenderingContext2D, pts: [number, number][]) => () => {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
    c.closePath();
};

/** A scalloped crown round (x, y): `lobes` bumps, drawn once with r(). */
function crownPts(x: number, y: number, rad: number, lobes: number, r: Rng): [number, number][] {
    const phase = r() * Math.PI, n = lobes * 5, out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const rr = rad * (0.84 + 0.18 * Math.abs(Math.sin(a * lobes / 2 + phase)) + (r() - 0.5) * 0.05);
        out.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.92]);
    }
    return out;
}

/** A few short strokes at a marker's foot, on its shaded side. */
function footShadow(c: CanvasRenderingContext2D, ink: string, x: number, y: number, w: number, S: number) {
    c.strokeStyle = ink; line(c, S / 230);
    c.beginPath();
    for (let k = 0; k < 3; k++) {
        const fx = x + w * (0.1 + k * 0.3);
        c.moveTo(fx, y + S * 0.002); c.lineTo(fx + w * 0.25, y + S * 0.006);
    }
    c.stroke();
}

function engrTree(c: CanvasRenderingContext2D, S: number, ink: string, x: number, y: number, rad: number, r: Rng, lit: string, lobes = 6) {
    c.strokeStyle = ink; line(c, S / 140);
    c.beginPath(); c.moveTo(x, y - rad * 0.4); c.lineTo(x, y); c.stroke();
    footShadow(c, ink, x, y, rad * 0.9, S);
    const cy = y - rad * 1.15;
    engraveBlob(c, S, ink, polyPath(c, crownPts(x, cy, rad, lobes, r)), x, cy, rad, rad * 0.92, { lit });
}

function engrPine(c: CanvasRenderingContext2D, S: number, ink: string, x: number, y: number, h: number, r: Rng, lit: string) {
    const w = h * 0.3, base = y - h * 0.1;
    c.strokeStyle = ink; line(c, S / 140);
    c.beginPath(); c.moveTo(x, base); c.lineTo(x, y); c.stroke();
    footShadow(c, ink, x, y, w, S);
    /* Three tiers, each a jag out on both sides. */
    const right: [number, number][] = [], left: [number, number][] = [];
    for (let k = 0; k < 3; k++) {
        const t = (k + 1) / 3, ty = base - h * 0.9 * (1 - t);
        const half = w * (0.35 + t * 0.65) * (0.92 + r() * 0.16);
        right.push([x + half * 0.55, ty - h * 0.1], [x + half, ty]);
        left.push([x - half * 0.55, ty - h * 0.1], [x - half, ty]);
    }
    const top: [number, number] = [x, base - h * 0.9];
    const pts: [number, number][] = [top, ...right, ...left.reverse()];
    engrave(c, S, ink, polyPath(c, pts), () => {
        c.beginPath(); c.moveTo(top[0], top[1] - 2); c.lineTo(x + w * 2, top[1]); c.lineTo(x + w * 2, base + 2); c.lineTo(x + w * 0.1, base + 2); c.closePath();
    }, [x - w, top[1], x + w * 1.2, base + 2], { lit, step: Math.max(2.2, w * 0.2) });
}

/** A low mound: drifts, hummocks. */
function engrMound(c: CanvasRenderingContext2D, S: number, ink: string, x: number, y: number, w: number, h: number, lit: string) {
    const outline = () => {
        c.beginPath(); c.moveTo(x - w, y);
        c.bezierCurveTo(x - w * 0.6, y - h * 1.2, x + w * 0.2, y - h * 1.5, x + w, y);
        c.closePath();
    };
    engraveBlob(c, S, ink, outline, x, y - h * 0.4, w, h * 1.1, { lit });
}

function engrClouds(c: CanvasRenderingContext2D, S: number, ink: string, r: Rng) {
    for (let i = 0; i < 3; i++) {
        const x = r() * S, y = r() * S, rad = S * (0.045 + r() * 0.02), n = 3 + (r() * 2 | 0);
        for (const [ox, oy] of WRAP) {
            const bx = x + ox * S, by = y + oy * S, foot = by + rad * 0.35;
            const end = bx + (n - 1) * rad * 1.3 + rad * 0.9;
            const body = () => {
                c.beginPath(); c.moveTo(bx - rad * 0.9, foot);
                for (let k = 0; k < n; k++) {
                    const cx = bx + k * rad * 1.3, lift = Math.sin((k + 0.5) / n * Math.PI) * rad * 0.9;
                    c.arc(cx, by - lift, rad, Math.PI * 0.9, Math.PI * 2.1);
                }
                c.lineTo(end, foot); c.closePath();
            };
            engrave(c, S, ink, body, () => {
                c.beginPath(); c.rect(bx - rad * 2, by - rad * 0.15, end - bx + rad * 4, rad * 2);
            }, [bx - rad, by - rad * 0.2, end, foot], { lit: '#f0e8d4d8', lw: S / 90, step: 2.4 });
        }
    }
}

function engrCobbles(c: CanvasRenderingContext2D, S: number, ink: string, r: Rng) {
    const rowsN = 8, h = S / rowsN;
    for (let row = 0; row < rowsN; row++) {
        const y = row * h, widths: number[] = [];
        let left = S;
        while (left > 0) {
            let w = h * (1 + r() * 0.7);
            if (left - w < h * 0.7) w = left;
            widths.push(w); left -= w;
        }
        let x = r() * h;
        for (const w of widths) {
            for (const ox of [0, -S]) {
                const sx = x + ox + 1.6, sy = y + 1.6, sw = w - 3.2, sh = h - 3.2;
                c.fillStyle = '#efe3c255';
                c.beginPath(); c.roundRect(sx, sy, sw, sh, h * 0.3); c.fill();
                c.strokeStyle = ink; line(c, S / 220); c.stroke();
                c.strokeStyle = tintOf(ink, 'cc'); line(c, S / 120);
                c.beginPath(); c.moveTo(sx + sw * 0.25, sy + sh); c.lineTo(sx + sw - h * 0.2, sy + sh);
                c.quadraticCurveTo(sx + sw, sy + sh, sx + sw, sy + sh - h * 0.2); c.lineTo(sx + sw, sy + sh * 0.35);
                c.stroke();
            }
            x += w;
        }
    }
}

function engrVolcano(c: CanvasRenderingContext2D, S: number, ink: string, x: number, y: number, r: Rng) {
    const w = S * (0.07 + r() * 0.03), h = w * (1 + r() * 0.3), top = w * 0.22;
    const lw = S / 125;
    const jag = (a: [number, number], b: [number, number]) => [0.35, 0.7].map((t): [number, number] =>
        [a[0] + (b[0] - a[0]) * t + (r() - 0.5) * w * 0.15, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * h * 0.08]);
    const tl: [number, number] = [x - top, y - h], tr: [number, number] = [x + top, y - h];
    const leftSide = jag([x - w, y], tl), rightSide = jag(tr, [x + w, y]);
    const pts: [number, number][] = [[x - w, y], ...leftSide, tl, tr, ...rightSide, [x + w, y]];
    footShadow(c, ink, x + w * 0.5, y, w * 0.6, S);
    engrave(c, S, ink, polyPath(c, pts), () => {
        c.beginPath(); c.moveTo(x + top * 0.1, y - h); c.lineTo(tr[0], tr[1]);
        for (const q of rightSide) c.lineTo(q[0], q[1]);
        c.lineTo(x + w, y); c.lineTo(x + w * 0.15, y); c.closePath();
    }, [x - w, y - h, x + w, y], { step: Math.max(2.5, w * 0.12) });
    /* A lava runnel down the lit flank, in the atlas's red. */
    c.strokeStyle = '#7e2a1caa'; line(c, lw * 0.9);
    c.beginPath(); c.moveTo(x - top * 0.5, y - h);
    c.quadraticCurveTo(x - w * 0.25, y - h * 0.55, x - w * 0.45, y - h * 0.15); c.stroke();
    c.fillStyle = '#7e2a1cd0'; c.strokeStyle = ink; line(c, lw * 0.8);
    c.beginPath(); c.ellipse(x, y - h, top, top * 0.38, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    /* Smoke: three puffs rising and drifting right, each engraved. */
    let px = x + top * 0.3, py = y - h - top * 0.9;
    for (let k = 0; k < 3; k++) {
        const pr = top * (0.75 + k * 0.3);
        const cx = px, cy = py;
        engraveBlob(c, S, ink, () => { c.beginPath(); c.ellipse(cx, cy, pr, pr * 0.8, 0, 0, Math.PI * 2); }, cx, cy, pr, pr * 0.8,
            { lit: '#ebe1c6e8', lw: lw * 0.8 });
        px += pr * (0.9 + r() * 0.4); py -= pr * 1.1;
    }
}

const SMOOTH: Record<string, Painter> = {
    'hatch-peaks'(c, S, ink, r, mark) { hatchedRange(c, S, ink, r, mark, false); },
    'hatch-snow-peaks'(c, S, ink, r, mark) { hatchedRange(c, S, ink, r, mark, true); },
    'engr-forest'(c, S, ink, r, mark) {
        /* Close rows of round crowns, a pine in every third place or so. */
        const n = Math.round(4 * Math.sqrt(area(S)));
        const things: { x: number; y: number; pine: boolean; size: number }[] = [];
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const x = (col + (row % 2) * 0.5 + (r() - 0.5) * 0.35) * S / n;
                const y = (row + 0.75 + (r() - 0.5) * 0.25) * S / n;
                const pine = r() < 0.3;
                things.push({ x, y, pine, size: pine ? S * (0.11 + r() * 0.03) : S * (0.045 + r() * 0.012) });
            }
        }
        things.sort((a, b) => a.y - b.y);
        for (const t of things) {
            mark();
            if (t.pine) engrPine(c, S, ink, t.x, t.y, t.size, r, '#dcd3a8f0');
            else engrTree(c, S, ink, t.x, t.y, t.size, r, '#dcd3a8f0');
        }
    },
    'engr-jungle'(c, S, ink, r, mark) {
        /* Big many-lobed crowns packed tight, and palms leaning out of them. */
        const k = area(S);
        const things = [
            ...scatter(r, S, Math.round(10 * k), S * 0.1).map((p) => ({ ...p, palm: false })),
            ...scatter(r, S, Math.round(3 * k), S * 0.2).map((p) => ({ ...p, palm: true })),
        ].sort((a, b) => a.y - b.y);
        for (const t of things) {
            mark();
            if (!t.palm) { engrTree(c, S, ink, t.x, t.y, S * (0.055 + r() * 0.015), r, '#d6d2a0f0', 8); continue; }
            const h = S * (0.14 + r() * 0.04), lean = (r() - 0.5) * h * 0.5;
            const tx = t.x + lean, ty = t.y - h;
            footShadow(c, ink, t.x, t.y, h * 0.25, S);
            c.strokeStyle = ink; line(c, S / 90);
            c.beginPath(); c.moveTo(t.x, t.y); c.quadraticCurveTo(t.x + lean * 0.2, t.y - h * 0.55, tx, ty); c.stroke();
            for (let j = 0; j < 6; j++) {
                const a = -Math.PI / 2 + (j / 5 - 0.5) * Math.PI * 1.45 + (r() - 0.5) * 0.2;
                const len = h * (0.45 + r() * 0.12);
                const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.55 + len * 0.35;
                const mx = tx + Math.cos(a) * len * 0.5, my = ty + Math.sin(a) * len * 0.5 - len * 0.12;
                const nx = -Math.sin(a) * len * 0.13, ny = Math.cos(a) * len * 0.13;
                c.beginPath(); c.moveTo(tx, ty);
                c.quadraticCurveTo(mx + nx, my + ny, ex, ey);
                c.quadraticCurveTo(mx - nx, my - ny, tx, ty);
                /* The fronds away from the light are tinted. */
                c.fillStyle = Math.cos(a) > 0.2 ? tintOf(ink, '66') : '#d6d2a0f0'; c.fill();
                c.strokeStyle = ink; line(c, S / 150); c.stroke();
                c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
            }
        }
    },
    'engr-grass'(c, S, ink, r, mark) {
        /* Tall grass: stiff clumps of strokes, a shadow at each foot. */
        for (const p of scatter(r, S, Math.round(12 * area(S)), S * 0.07)) {
            mark();
            const h = S * (0.05 + r() * 0.025), n = 7 + (r() * 3 | 0);
            c.strokeStyle = ink; line(c, S / 150);
            c.beginPath();
            for (let k = 0; k < n; k++) {
                const a = (k / (n - 1) - 0.5) * 0.9 + (r() - 0.5) * 0.15;
                const bx = p.x + (k - (n - 1) / 2) * h * 0.07, len = h * (0.7 + r() * 0.35);
                c.moveTo(bx, p.y);
                c.quadraticCurveTo(bx + Math.sin(a) * len * 0.3, p.y - len * 0.6, bx + Math.sin(a) * len, p.y - Math.cos(a) * len);
            }
            c.stroke();
            footShadow(c, ink, p.x, p.y, h * 0.6, S);
        }
    },
    'engr-flowers'(c, S, ink, r, mark) {
        /* A meadow in ink: small open flowers on stems, leaves either side. */
        for (const p of scatter(r, S, Math.round(12 * area(S)), S * 0.065)) {
            mark();
            const h = S * (0.03 + r() * 0.015), pr = S * (0.008 + r() * 0.004), turn = r() * Math.PI;
            const hx = p.x + (r() - 0.5) * h * 0.3, hy = p.y - h;
            c.strokeStyle = ink; line(c, S / 200);
            c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x, p.y - h * 0.5, hx, hy); c.stroke();
            for (const side of [-1, 1]) {
                const lx = p.x + side * h * 0.22, ly = p.y - h * 0.3;
                c.fillStyle = side > 0 ? tintOf(ink, '88') : ENGR_LIT;
                c.beginPath(); c.ellipse(lx, ly, h * 0.2, h * 0.07, side * 0.5, 0, Math.PI * 2); c.fill(); c.stroke();
            }
            for (let k = 0; k < 5; k++) {
                const a = turn + k * Math.PI * 2 / 5, qx = hx + Math.cos(a) * pr, qy = hy + Math.sin(a) * pr;
                c.fillStyle = Math.cos(a) + Math.sin(a) > 0.6 ? tintOf(ink, '77') : '#efe4c8';
                c.beginPath(); c.arc(qx, qy, pr * 0.72, 0, Math.PI * 2); c.fill(); c.stroke();
            }
            c.fillStyle = ink;
            c.beginPath(); c.arc(hx, hy, pr * 0.4, 0, Math.PI * 2); c.fill();
            footShadow(c, ink, p.x, p.y, h * 0.4, S);
        }
    },
    'engr-dunes'(c, S, ink, r, mark) {
        /* Crescent dunes: a crest line, the slip face under it hatched, and
           fine stipple of sand between. */
        c.fillStyle = tintOf(ink, '99');
        for (let i = 0; i < 30 * area(S); i++) { c.beginPath(); c.arc(r() * S, r() * S, S / 500 + r() * S / 600, 0, Math.PI * 2); c.fill(); }
        for (const p of scatter(r, S, Math.round(5 * area(S)), S * 0.16)) {
            mark();
            const w = S * (0.07 + r() * 0.04), h = w * (0.35 + r() * 0.15);
            const L: [number, number] = [p.x - w, p.y], R: [number, number] = [p.x + w, p.y + h * 0.15];
            const crest = () => { c.moveTo(L[0], L[1]); c.quadraticCurveTo(p.x - w * 0.1, p.y - h * 1.9, R[0], R[1]); };
            const body = () => { c.beginPath(); crest(); c.quadraticCurveTo(p.x + w * 0.1, p.y + h * 0.5, L[0], L[1]); c.closePath(); };
            engrave(c, S, ink, body, () => {
                c.beginPath(); crest(); c.quadraticCurveTo(p.x + w * 0.3, p.y - h * 0.3, L[0], L[1]); c.closePath();
            }, [L[0], p.y - h, R[0], R[1]], { lit: '#ecdcb2d0', lw: S / 160, step: 2.3 });
            c.strokeStyle = ink; line(c, S / 110);
            c.beginPath(); crest(); c.stroke();
        }
    },
    'engr-mesas'(c, S, ink, r, mark) {
        /* Badlands: flat-topped buttes in layered rock, and dry scrub. */
        const k = area(S);
        const things = [
            ...scatter(r, S, Math.round(2 * k), S * 0.24).map((p) => ({ ...p, mesa: true })),
            ...scatter(r, S, Math.round(5 * k), S * 0.1).map((p) => ({ ...p, mesa: false })),
        ].sort((a, b) => a.y - b.y);
        for (const t of things) {
            mark();
            const { x, y } = t;
            if (!t.mesa) {
                const h = S * (0.03 + r() * 0.015);
                c.strokeStyle = ink; line(c, S / 160);
                c.beginPath();
                for (let j = 0; j < 5; j++) {
                    const a = (j / 4 - 0.5) * 2 + (r() - 0.5) * 0.3;
                    c.moveTo(x, y); c.lineTo(x + Math.sin(a) * h, y - Math.cos(a) * h * 0.85);
                }
                c.stroke();
                footShadow(c, ink, x, y, h * 0.7, S);
                continue;
            }
            const w = S * (0.07 + r() * 0.03), h = w * (0.5 + r() * 0.2), tw = w * (0.55 + r() * 0.2);
            const wob = () => (r() - 0.5) * w * 0.08;
            const pts: [number, number][] = [[x - w, y], [x - w * 0.82 + wob(), y - h * 0.4], [x - tw - w * 0.05, y - h * 0.75],
                [x - tw, y - h], [x + tw, y - h + wob() * 0.3], [x + tw + w * 0.06, y - h * 0.7], [x + w * 0.85 + wob(), y - h * 0.35], [x + w, y]];
            footShadow(c, ink, x + w * 0.4, y, w * 0.7, S);
            engrave(c, S, ink, polyPath(c, pts), () => {
                c.beginPath(); c.moveTo(x + tw * 0.35, y - h - 2); c.lineTo(x + w * 2, y - h - 2); c.lineTo(x + w * 2, y + 2); c.lineTo(x + w * 0.3, y + 2); c.closePath();
            }, [x - w, y - h, x + w, y], { step: Math.max(2.5, w * 0.11) });
            /* Strata across the lit face, and the rim of the table top. */
            c.strokeStyle = ink; line(c, S / 220);
            c.save(); polyPath(c, pts)(); c.clip();
            c.beginPath();
            for (const f of [0.4, 0.68]) { c.moveTo(x - w, y - h * f + wob()); c.lineTo(x + w * 0.35, y - h * f + wob()); }
            c.moveTo(x - tw * 0.9, y - h * 0.86); c.lineTo(x + tw * 0.9, y - h * 0.88);
            c.stroke();
            c.restore();
        }
    },
    'engr-tundra'(c, S, ink, r, mark) {
        /* Tundra: bare trees, thinner than Hand-drawn's, and low hummocks. */
        const k = area(S);
        const things = [
            ...scatter(r, S, Math.round(4 * k), S * 0.15).map((p) => ({ ...p, tree: true })),
            ...scatter(r, S, Math.round(4 * k), S * 0.12).map((p) => ({ ...p, tree: false })),
        ].sort((a, b) => a.y - b.y);
        for (const p of things) {
            mark();
            if (!p.tree) { engrMound(c, S, ink, p.x, p.y, S * (0.035 + r() * 0.02), S * 0.018, '#ece2c8e8'); continue; }
            const h = S * (0.13 + r() * 0.05), lean = (r() - 0.5) * h * 0.08;
            footShadow(c, ink, p.x, p.y, h * 0.3, S);
            c.strokeStyle = ink; line(c, S / 90);
            c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x + lean, p.y - h * 0.5, p.x + lean * 0.6, p.y - h); c.stroke();
            for (let j = 0; j < 4; j++) {
                const t = 0.35 + j * 0.17, bx = p.x + lean * t, by = p.y - h * t, len = h * (0.3 - j * 0.055);
                line(c, S / (150 + j * 30));
                c.beginPath();
                for (const side of [-1, 1]) {
                    if (j > 0 && r() < 0.2) continue;
                    c.moveTo(bx, by); c.lineTo(bx + side * len * 0.8, by - len * 0.75);
                    c.moveTo(bx + side * len * 0.5, by - len * 0.46); c.lineTo(bx + side * len * 0.75, by - len * 0.95);
                }
                c.stroke();
            }
        }
    },
    'engr-drifts'(c, S, ink, r, mark) {
        /* Snow: wind-drifts, white on their lit side, hatched on the far one. */
        c.fillStyle = tintOf(ink, '88');
        for (let i = 0; i < 6 * area(S); i++) { c.beginPath(); c.arc(r() * S, r() * S, S / 450, 0, Math.PI * 2); c.fill(); }
        for (const p of scatter(r, S, Math.round(5 * area(S)), S * 0.15)) {
            mark();
            const w = S * (0.05 + r() * 0.03);
            engrMound(c, S, ink, p.x, p.y, w, w * (0.28 + r() * 0.1), '#f4ede0f0');
        }
    },
    'engr-volcanoes'(c, S, ink, r, mark) {
        /* Volcanic ground: red cracks in the rock, cinder specks, and cones
           engraved like the mountains, smoking. */
        const k = area(S);
        for (let i = 0; i < 3 * k; i++) {
            let x = r() * S, y = r() * S;
            c.strokeStyle = '#7e2a1c88'; line(c, S / 160);
            c.beginPath(); c.moveTo(x, y);
            for (let j = 0; j < 5; j++) { x += (r() - 0.3) * S * 0.05; y += (r() - 0.5) * S * 0.04; c.lineTo(x, y); }
            c.stroke();
        }
        c.fillStyle = tintOf(ink, 'aa');
        for (let i = 0; i < 12 * k; i++) { c.beginPath(); c.arc(r() * S, r() * S, S / 450 + r() * S / 500, 0, Math.PI * 2); c.fill(); }
        for (const p of scatter(r, S, Math.round(2.5 * k), S * 0.22)) {
            mark();
            engrVolcano(c, S, ink, p.x, p.y, r);
        }
    },
    'engr-rocks'(c, S, ink, r, mark) {
        /* Cave floor: boulders and stalagmites, each lit and hatched, and
           pebbles between them. */
        c.strokeStyle = ink; line(c, S / 260);
        for (let i = 0; i < 10 * area(S); i++) { c.beginPath(); c.arc(r() * S, r() * S, S * (0.003 + r() * 0.003), 0, Math.PI * 2); c.stroke(); }
        for (const p of scatter(r, S, Math.round(8 * area(S)), S * 0.09)) {
            mark();
            const s = S * (0.022 + r() * 0.016);
            if (r() < 0.7) {
                const pts: [number, number][] = [];
                for (let j = 0; j < 7; j++) {
                    const a = j / 7 * Math.PI * 2, rr = s * (0.8 + r() * 0.35);
                    pts.push([p.x + Math.cos(a) * rr, p.y - s * 0.6 + Math.sin(a) * rr * 0.72]);
                }
                footShadow(c, ink, p.x, p.y + s * 0.1, s, S);
                engraveBlob(c, S, ink, polyPath(c, pts), p.x, p.y - s * 0.6, s, s * 0.72);
                c.strokeStyle = ink; line(c, S / 220);
                c.beginPath(); c.moveTo(p.x - s * 0.4, p.y - s * 0.9); c.lineTo(p.x - s * 0.1, p.y - s * 0.55); c.lineTo(p.x + s * 0.1, p.y - s * 0.7); c.stroke();
                continue;
            }
            const pts: [number, number][] = [[p.x - s * 0.6, p.y], [p.x - s * 0.1, p.y - s * 2], [p.x + s * 0.15, p.y - s * 1.8], [p.x + s * 0.6, p.y]];
            footShadow(c, ink, p.x, p.y, s * 0.8, S);
            engrave(c, S, ink, polyPath(c, pts), () => {
                c.beginPath(); c.moveTo(p.x - s * 0.05, p.y - s * 2.1); c.lineTo(p.x + s, p.y - s * 2.1); c.lineTo(p.x + s, p.y + 2); c.lineTo(p.x + s * 0.05, p.y + 2); c.closePath();
            }, [p.x - s * 0.6, p.y - s * 2, p.x + s * 0.6, p.y], { step: 2.2 });
        }
    },
    'engr-swamp'(c, S, ink, r, mark) {
        /* Still water drawn as short level strokes; reed beds, hummocks and
           now and then a gnarled tree on its roots. */
        const k = area(S);
        c.strokeStyle = tintOf(ink, 'cc'); line(c, S / 200);
        c.beginPath();
        for (let i = 0; i < 7 * k; i++) {
            const x = r() * S, y = r() * S, w = S * (0.03 + r() * 0.03);
            for (let j = 0; j < 3; j++) { c.moveTo(x + j * w * 0.15, y + j * S * 0.009); c.lineTo(x + w * (1 - j * 0.3), y + j * S * 0.009); }
        }
        c.stroke();
        const things = [
            ...scatter(r, S, Math.round(5 * k), S * 0.1).map((p) => ({ ...p, kind: 0 })),
            ...scatter(r, S, Math.round(3 * k), S * 0.12).map((p) => ({ ...p, kind: 1 })),
            ...scatter(r, S, Math.round(1 * k), S * 0.25).map((p) => ({ ...p, kind: 2 })),
        ].sort((a, b) => a.y - b.y);
        for (const t of things) {
            mark();
            if (t.kind === 0) {
                const h = S * (0.05 + r() * 0.015);
                c.strokeStyle = ink; line(c, S / 170);
                c.beginPath();
                for (let j = -2; j <= 2; j++) {
                    c.moveTo(t.x + j * S * 0.007, t.y);
                    c.quadraticCurveTo(t.x + j * S * 0.011, t.y - h * 0.6, t.x + j * S * 0.018, t.y - h * (1 - Math.abs(j) * 0.18));
                }
                c.stroke();
                c.fillStyle = ink;
                c.beginPath(); c.ellipse(t.x + S * 0.004, t.y - h * 0.92, S * 0.0035, S * 0.011, 0.1, 0, Math.PI * 2); c.fill();
                footShadow(c, ink, t.x, t.y, h * 0.5, S);
            } else if (t.kind === 1) {
                const w = S * (0.03 + r() * 0.015);
                engrMound(c, S, ink, t.x, t.y, w, w * 0.4, '#d6cfa6e8');
                c.strokeStyle = ink; line(c, S / 220);
                c.beginPath();
                for (let j = 0; j < 4; j++) { const bx = t.x - w * 0.4 + j * w * 0.25; c.moveTo(bx, t.y - w * 0.35); c.lineTo(bx + (j - 1.5) * w * 0.08, t.y - w * 0.7); }
                c.stroke();
            } else {
                const h = S * (0.1 + r() * 0.03), base = t.y - h * 0.3;
                c.strokeStyle = ink; line(c, S / 150);
                c.beginPath();
                for (let j = 0; j < 5; j++) {
                    const dx = (j / 4 - 0.5) * h * 0.8;
                    c.moveTo(t.x + dx * 0.15, base); c.quadraticCurveTo(t.x + dx * 0.9, base - h * 0.08, t.x + dx, t.y);
                }
                c.moveTo(t.x, base); c.lineTo(t.x, base - h * 0.3);
                c.stroke();
                engrTree(c, S, ink, t.x, base - h * 0.15, h * 0.28, r, '#d6cfa6f0', 7);
            }
        }
    },
    'engr-water'(c, S, ink, r) {
        /* Engraved water: little runs of two or three level strokes. */
        c.strokeStyle = ink; line(c, S / 170);
        c.beginPath();
        for (let i = 0; i < 6; i++) {
            const x = r() * S, y = r() * S, w = S * (0.07 + r() * 0.06), n = 2 + (r() * 2 | 0);
            for (let j = 0; j < n; j++) { c.moveTo(x + j * w * 0.18, y + j * S * 0.022); c.lineTo(x + w * (1 - j * 0.25), y + j * S * 0.022); }
        }
        c.stroke();
    },
    'engr-stipple'(c, S, ink, r) {
        /* Sand as an engraver stipples it, with a pebble here and there. */
        c.fillStyle = ink;
        for (let i = 0; i < 70; i++) { c.beginPath(); c.arc(r() * S, r() * S, S / 520 + r() * S / 620, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = ink; line(c, S / 300);
        for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(r() * S, r() * S, S * 0.01, S * 0.007, r(), 0, Math.PI * 2); c.stroke(); }
    },
    'engr-clouds'(c, S, ink, r) { engrClouds(c, S, ink, r); },
    'engr-cobbles'(c, S, ink, r) { engrCobbles(c, S, ink, r); },
    waves(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 70);
        for (let i = 0; i < 5; i++) {
            const x = r() * S, y = r() * S, w = S * (0.08 + r() * 0.05);
            c.beginPath();
            c.moveTo(x, y);
            c.quadraticCurveTo(x + w / 2, y - w / 3, x + w, y);
            c.quadraticCurveTo(x + w * 1.5, y + w / 3, x + w * 2, y);
            c.stroke();
        }
    },
    ripples(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 90);
        for (let i = 0; i < 6; i++) {
            const x = r() * S, y = r() * S, w = S * (0.05 + r() * 0.06);
            c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke();
        }
    },
    sand(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(r() * S, r() * S, S / 220 + r() * S / 260, 0, 7); c.fill(); }
    },
    dunes(c, S, ink, r, mark) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 5; i++) {
            mark();
            const x = r() * S, y = r() * S, w = S * (0.1 + r() * 0.08);
            c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - w * 0.35, x + w, y); c.stroke();
        }
    },
    snow(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 130);
        for (let i = 0; i < 6; i++) {
            const x = r() * S, y = r() * S, k = S * 0.015;
            c.beginPath();
            c.moveTo(x - k, y); c.lineTo(x + k, y);
            c.moveTo(x - k * 0.6, y - k * 0.8); c.lineTo(x + k * 0.6, y + k * 0.8);
            c.moveTo(x + k * 0.6, y - k * 0.8); c.lineTo(x - k * 0.6, y + k * 0.8);
            c.stroke();
        }
    },
    peaks(c, S, ink, r, mark) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 5; i++) {
            mark();
            const x = r() * S, y = r() * S, w = S * (0.08 + r() * 0.05);
            c.fillStyle = '#00000014';
            c.beginPath(); c.moveTo(x - w, y); c.lineTo(x, y - w * 1.1); c.lineTo(x + w, y); c.fill(); c.stroke();
            c.beginPath(); c.moveTo(x, y - w * 1.1); c.lineTo(x + w * 0.25, y - w * 0.3); c.stroke();
        }
    },
    /* The Mountain's peaks with white caps: the shaded body, then the snow
       down to a ragged line, then the outline over both so the cap never
       eats the ink. */
    'snow-peaks'(c, S, ink, r, mark) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 5; i++) {
            mark();
            const x = r() * S, y = r() * S, w = S * (0.08 + r() * 0.05), h = w * 1.2;
            c.fillStyle = '#00000014';
            c.beginPath(); c.moveTo(x - w, y); c.lineTo(x, y - h); c.lineTo(x + w, y); c.fill();
            const k = 0.45, cy = y - h * (1 - k), cw = w * k;
            c.fillStyle = '#ffffff';
            c.beginPath();
            c.moveTo(x, y - h); c.lineTo(x + cw, cy); c.lineTo(x + cw * 0.35, cy - h * 0.09);
            c.lineTo(x, cy + h * 0.05); c.lineTo(x - cw * 0.45, cy - h * 0.1); c.lineTo(x - cw, cy);
            c.closePath(); c.fill();
            c.beginPath(); c.moveTo(x - w, y); c.lineTo(x, y - h); c.lineTo(x + w, y); c.stroke();
            c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w * 0.25, y - w * 0.3); c.stroke();
        }
    },
    bricks(c, S, ink) {
        c.strokeStyle = ink; line(c, S / 140);
        const rowsN = 8, h = S / rowsN, w = S / 4;
        for (let row = 0; row < rowsN; row++) {
            const y = row * h;
            c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke();
            for (let x = (row % 2) * w / 2; x < S; x += w) {
                c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.stroke();
            }
        }
    },
    sparkle(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 4; i++) {
            const x = r() * S, y = r() * S, w = S * (0.05 + r() * 0.04), h = S * 0.012;
            c.beginPath(); c.ellipse(x, y, w, h, 0, 0, 7); c.fill();
        }
    },
    blobs(c, S, ink, r, mark) {
        c.fillStyle = ink;
        for (let i = 0; i < 5; i++) {
            mark();
            c.beginPath(); c.ellipse(r() * S, r() * S, S * (0.04 + r() * 0.04), S * (0.025 + r() * 0.02), 0, 0, 7); c.fill();
        }
    },
    clouds(c, S, ink, r) {
        /* A cartographer's cloud bank: rows of scalloped curls with a flat
           underside, drawn across the tile's edge so the repeat has no seam. */
        c.strokeStyle = ink; line(c, S / 80);
        for (let i = 0; i < 3; i++) {
            const x = r() * S, y = r() * S, rad = S * (0.045 + r() * 0.02), n = 3 + (r() * 2 | 0);
            for (const [ox, oy] of WRAP) {
                const bx = x + ox * S, by = y + oy * S;
                c.beginPath();
                for (let k = 0; k < n; k++) {
                    const cx = bx + k * rad * 1.3, lift = Math.sin((k + 0.5) / n * Math.PI) * rad * 0.9;
                    c.arc(cx, by - lift, rad, Math.PI * 0.9, Math.PI * 2.1);
                }
                c.stroke();
                c.beginPath();
                c.moveTo(bx - rad * 0.9, by + rad * 0.35);
                c.lineTo(bx + (n - 1) * rad * 1.3 + rad * 0.9, by + rad * 0.35);
                c.stroke();
            }
        }
    },
    puffs(c, S, ink, r) {
        /* Soft round puffs, lit from above, overlapping into banks. */
        for (let i = 0; i < 5; i++) {
            const x = r() * S, y = r() * S, rad = S * (0.05 + r() * 0.035);
            for (const [ox, oy] of WRAP) {
                const cx = x + ox * S, cy = y + oy * S;
                c.fillStyle = '#9ec2e633';
                c.beginPath(); c.ellipse(cx, cy + rad * 0.35, rad * 1.5, rad * 0.8, 0, 0, 7); c.fill();
                c.fillStyle = ink;
                c.beginPath(); c.arc(cx - rad * 0.8, cy, rad * 0.75, 0, 7); c.arc(cx, cy - rad * 0.3, rad, 0, 7); c.arc(cx + rad * 0.85, cy + rad * 0.05, rad * 0.7, 0, 7); c.fill();
            }
        }
    },
    /* ---- the ground each biome is told apart by ---- */

    tussocks(c, S, ink, r, mark) {
        /* Grassland: low green tufts, a few blades fanned from one root. */
        c.strokeStyle = ink; line(c, S / 115);
        for (const p of scatter(r, S, Math.round(11 * area(S)), S * 0.07)) {
            mark();
            const h = S * (0.028 + r() * 0.014), n = 4 + (r() * 2 | 0);
            for (let k = 0; k < n; k++) {
                const a = (k / (n - 1) - 0.5) * 1.3 + (r() - 0.5) * 0.2;
                const bx = p.x + (k - (n - 1) / 2) * h * 0.12;
                c.beginPath();
                c.moveTo(bx, p.y);
                c.quadraticCurveTo(bx + Math.sin(a) * h * 0.25, p.y - h * 0.65, bx + Math.sin(a) * h, p.y - Math.cos(a) * h);
                c.stroke();
            }
        }
    },
    'tall-tussocks'(c, S, ink, r, mark) {
        /* Tall grass: taller, stiffer clumps — straight blades in a narrow
           fan, packed closer, a darker one behind each. */
        line(c, S / 105);
        for (const p of scatter(r, S, Math.round(13 * area(S)), S * 0.065)) {
            mark();
            const h = S * (0.06 + r() * 0.025), n = 6 + (r() * 3 | 0);
            for (let k = 0; k < n; k++) {
                const a = (k / (n - 1) - 0.5) * 0.7 + (r() - 0.5) * 0.12;
                const bx = p.x + (k - (n - 1) / 2) * h * 0.07;
                const len = h * (0.75 + r() * 0.3);
                c.strokeStyle = k % 2 ? shade(ink, -0.25) : ink;
                c.beginPath();
                c.moveTo(bx, p.y);
                c.lineTo(bx + Math.sin(a) * len, p.y - Math.cos(a) * len);
                c.stroke();
            }
        }
    },
    flowers(c, S, ink, r, mark) {
        /* A flower field: little five-petalled flowers in every colour, each
           over its two leaves. The leaves' angles are all drawn first, as
           they always were, so the layout is the same. */
        const pts = scatter(r, S, Math.round(18 * area(S)), S * 0.055);
        const leaves = pts.map(() => [0, 1].map((k) => (r() - 0.5) * 2.4 + (k ? Math.PI : 0)));
        pts.forEach((p, i) => {
            mark();
            c.fillStyle = ink;
            for (const a of leaves[i]) {
                c.beginPath();
                c.ellipse(p.x + Math.cos(a) * S * 0.014, p.y + S * 0.01 + Math.sin(a) * S * 0.006, S * 0.012, S * 0.005, a, 0, 7);
                c.fill();
            }
            const col = FLOWER_COLORS[(r() * FLOWER_COLORS.length) | 0];
            const pr = S * (0.009 + r() * 0.005), turn = r() * Math.PI;
            c.fillStyle = col;
            c.strokeStyle = shade(col === '#ffffff' ? '#c8c8c8' : col, -0.35);
            line(c, S / 400);
            for (let k = 0; k < 5; k++) {
                const a = turn + k * Math.PI * 2 / 5;
                c.beginPath(); c.arc(p.x + Math.cos(a) * pr, p.y + Math.sin(a) * pr, pr * 0.72, 0, 7); c.fill(); c.stroke();
            }
            c.fillStyle = col === '#f6c945' ? '#a0521e' : '#f8d64a';
            c.beginPath(); c.arc(p.x, p.y, pr * 0.55, 0, 7); c.fill();
        });
    },
    swamp(c, S, ink, r, mark) {
        /* Green water-waves, clumps of reeds, and mangroves standing on
           their arched roots. */
        const k = area(S);
        c.strokeStyle = ink; line(c, S / 90);
        for (let i = 0; i < 6 * k; i++) {
            const x = r() * S, y = r() * S, w = S * (0.035 + r() * 0.025);
            c.beginPath();
            c.moveTo(x, y);
            c.quadraticCurveTo(x + w / 2, y - w / 3, x + w, y);
            c.quadraticCurveTo(x + w * 1.5, y + w / 3, x + w * 2, y);
            c.stroke();
        }
        const reed = shade(ink, -0.3);
        const things = [
            ...scatter(r, S, Math.round(4 * k), S * 0.12).map((p) => ({ ...p, kind: 'reed' })),
            ...scatter(r, S, Math.round(2 * k), S * 0.2).map((p) => ({ ...p, kind: 'mangrove' })),
        ].sort((a, b) => a.y - b.y);
        for (const t of things) {
            mark();
            if (t.kind === 'reed') {
                c.strokeStyle = reed; line(c, S / 110);
                const h = S * 0.06;
                for (let j = -2; j <= 2; j++) {
                    c.beginPath(); c.moveTo(t.x + j * S * 0.008, t.y);
                    c.quadraticCurveTo(t.x + j * S * 0.012, t.y - h * 0.6, t.x + j * S * 0.02, t.y - h * (1 - Math.abs(j) * 0.18));
                    c.stroke();
                }
                c.fillStyle = shade(reed, -0.3);
                c.beginPath(); c.ellipse(t.x + S * 0.004, t.y - h * 0.95, S * 0.004, S * 0.012, 0.1, 0, 7); c.fill();
                continue;
            }
            /* A mangrove: roots arching into the water, a short trunk, a
               bushy crown. */
            const h = S * (0.11 + r() * 0.03);
            const base = t.y - h * 0.3;
            c.strokeStyle = '#4e3f2a'; line(c, S / 120);
            for (let j = 0; j < 5; j++) {
                const dx = (j / 4 - 0.5) * h * 0.8;
                c.beginPath(); c.moveTo(t.x + dx * 0.15, base);
                c.quadraticCurveTo(t.x + dx * 0.9, base - h * 0.08, t.x + dx, t.y);
                c.stroke();
            }
            c.beginPath(); c.moveTo(t.x, base); c.lineTo(t.x, base - h * 0.3); c.stroke();
            const crown = shade(ink, -0.2), rim = shade(ink, -0.5);
            c.fillStyle = crown; c.strokeStyle = rim; line(c, S / 130);
            const cy = base - h * 0.45;
            const lobes: [number, number, number][] = [[-0.22, 0.02, 0.2], [0.22, 0.03, 0.2], [0, -0.1, 0.24], [-0.1, 0.08, 0.18], [0.12, 0.08, 0.18]];
            c.beginPath();
            for (const [ox, oy, rr] of lobes) { c.moveTo(t.x + ox * h + rr * h, cy + oy * h); c.arc(t.x + ox * h, cy + oy * h, rr * h, 0, 7); }
            c.fill(); c.stroke();
            c.fillStyle = shade(ink, 0.25);
            c.beginPath(); c.arc(t.x - h * 0.07, cy - h * 0.14, h * 0.07, 0, 7); c.fill();
            c.strokeStyle = ink; line(c, S / 110);
            c.beginPath(); c.moveTo(t.x - h * 0.45, t.y + S * 0.004); c.lineTo(t.x + h * 0.45, t.y + S * 0.004); c.stroke();
        }
    },
    'forest-line'(c, S, ink, r, mark) { forest(c, S, ink, r, false, mark); },
    'forest-fill'(c, S, ink, r, mark) { forest(c, S, ink, r, true, mark); },
    'jungle-line'(c, S, ink, r, mark) { jungle(c, S, ink, r, false, mark); },
    'jungle-fill'(c, S, ink, r, mark) { jungle(c, S, ink, r, true, mark); },
    shrubs(c, S, ink, r, mark) {
        /* Badlands: dry, twiggy shrubs in a darker tint of the ground, and a
           few pebbles between them. */
        c.strokeStyle = ink; c.fillStyle = ink;
        for (const p of scatter(r, S, Math.round(7 * area(S)), S * 0.11)) {
            mark();
            const h = S * (0.045 + r() * 0.025), n = 6 + (r() * 3 | 0);
            for (let k = 0; k < n; k++) {
                const a = (k / (n - 1) - 0.5) * 2.2 + (r() - 0.5) * 0.3;
                const len = h * (0.65 + r() * 0.45);
                const ex = p.x + Math.sin(a) * len, ey = p.y - Math.cos(a) * len * 0.85;
                line(c, S / 95);
                c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(ex, ey); c.stroke();
                /* two forks off each twig */
                line(c, S / 150);
                for (const [at, turn] of [[0.45, 0.7], [0.7, -0.6]]) {
                    const mx = p.x + (ex - p.x) * at, my = p.y + (ey - p.y) * at;
                    c.beginPath(); c.moveTo(mx, my);
                    c.lineTo(mx + Math.sin(a + turn) * len * 0.35, my - Math.cos(a + turn) * len * 0.32);
                    c.stroke();
                }
                if (r() < 0.7) { c.beginPath(); c.arc(ex, ey, S * 0.004, 0, 7); c.fill(); }
            }
            c.beginPath(); c.ellipse(p.x, p.y + S * 0.002, h * 0.4, h * 0.1, 0, 0, 7); c.fill();
        }
        mark(false);
        for (let i = 0; i < 8 * area(S); i++) { c.beginPath(); c.arc(r() * S, r() * S, S * (0.003 + r() * 0.003), 0, 7); c.fill(); }
    },
    'bare-trees'(c, S, ink, r, mark) {
        /* Tundra: tall, leafless trees, a few to a cell, with a streak of
           frost at the foot of each. */
        for (const p of scatter(r, S, Math.round(5 * area(S)), S * 0.14)) {
            mark();
            const h = S * (0.17 + r() * 0.07);
            c.strokeStyle = '#ffffffaa'; line(c, S / 110);
            c.beginPath(); c.moveTo(p.x - h * 0.16, p.y + S * 0.003); c.lineTo(p.x + h * 0.16, p.y + S * 0.003); c.stroke();
            c.strokeStyle = ink;
            const lean = (r() - 0.5) * h * 0.08;
            line(c, S / 70);
            c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x + lean, p.y - h * 0.5, p.x + lean * 0.6, p.y - h); c.stroke();
            const levels = 4;
            for (let k = 0; k < levels; k++) {
                const t = 0.35 + k * 0.17, bx = p.x + lean * t, by = p.y - h * t;
                const len = h * (0.32 - k * 0.06);
                line(c, S / (130 + k * 30));
                for (const side of [-1, 1]) {
                    if (k > 0 && r() < 0.2) continue;
                    const ex = bx + side * len * 0.8, ey = by - len * 0.75;
                    c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey);
                    c.moveTo(bx + side * len * 0.5, by - len * 0.46);
                    c.lineTo(bx + side * len * 0.75, by - len * 0.95);
                    c.stroke();
                }
            }
        }
    },
    volcanoes(c, S, ink, r, mark) {
        /* Volcanic ground: red scorch patches, glowing cracks of lava, and
           cones with molten tops and a flow down one flank. */
        const k = area(S);
        for (let i = 0; i < 3 * k; i++) {
            const x = r() * S, y = r() * S, rad = S * (0.04 + r() * 0.04);
            c.fillStyle = '#c8321e40';
            c.beginPath();
            for (let j = 0; j < 9; j++) {
                const a = j / 9 * Math.PI * 2, rr = rad * (0.6 + r() * 0.5);
                if (j === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
                else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
            }
            c.closePath(); c.fill();
        }
        for (let i = 0; i < 3 * k; i++) {
            let x = r() * S, y = r() * S;
            const pts: [number, number][] = [[x, y]];
            for (let j = 0; j < 5; j++) { x += (r() - 0.3) * S * 0.05; y += (r() - 0.5) * S * 0.04; pts.push([x, y]); }
            for (const [col, w] of [['#b52a16', S / 70], ['#ff7a2a', S / 150]] as const) {
                c.strokeStyle = col; line(c, w);
                c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
                for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
                c.stroke();
            }
        }
        for (const p of scatter(r, S, Math.round(3 * k), S * 0.2)) {
            mark();
            const w = S * (0.07 + r() * 0.03), h = w * (1 + r() * 0.3);
            const top = w * 0.22;
            c.fillStyle = '#00000024'; c.strokeStyle = ink; line(c, S / 100);
            c.beginPath();
            c.moveTo(p.x - w, p.y); c.lineTo(p.x - top, p.y - h); c.lineTo(p.x + top, p.y - h); c.lineTo(p.x + w, p.y);
            c.closePath(); c.fill(); c.stroke();
            c.fillStyle = '#e8481f';
            c.beginPath(); c.ellipse(p.x, p.y - h, top, top * 0.4, 0, 0, 7); c.fill();
            c.fillStyle = '#ffb13b';
            c.beginPath(); c.ellipse(p.x, p.y - h, top * 0.55, top * 0.2, 0, 0, 7); c.fill();
            const side = r() < 0.5 ? -1 : 1;
            c.strokeStyle = '#e8481f'; line(c, S / 95);
            c.beginPath(); c.moveTo(p.x + side * top * 0.4, p.y - h);
            c.quadraticCurveTo(p.x + side * w * 0.2, p.y - h * 0.55, p.x + side * w * 0.45, p.y - h * 0.25);
            c.stroke();
            c.strokeStyle = '#ffb13b'; line(c, S / 260);
            c.stroke();
        }
    },
    rocks(c, S, ink, r, mark) {
        /* Cave floor: every kind of stone — boulders, sharp shards, flat
           slabs, pebble scatters and stubby stalagmites. */
        c.strokeStyle = ink; line(c, S / 120);
        for (const p of scatter(r, S, Math.round(10 * area(S)), S * 0.085)) {
            mark();
            const kind = (r() * 5) | 0, s = S * (0.022 + r() * 0.016);
            c.fillStyle = '#ffffff1c';
            c.beginPath();
            if (kind === 0) {           // boulder
                for (let j = 0; j < 8; j++) {
                    const a = j / 8 * Math.PI * 2, rr = s * (0.85 + r() * 0.25);
                    const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr * 0.75;
                    if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
                }
                c.closePath(); c.fill(); c.stroke();
                c.beginPath(); c.arc(p.x - s * 0.2, p.y - s * 0.15, s * 0.45, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
            } else if (kind === 1) {    // shard
                c.moveTo(p.x - s, p.y + s * 0.4); c.lineTo(p.x - s * 0.3, p.y - s * 0.9); c.lineTo(p.x + s * 0.5, p.y - s * 0.4);
                c.lineTo(p.x + s * 0.9, p.y + s * 0.4); c.closePath(); c.fill(); c.stroke();
                c.beginPath(); c.moveTo(p.x - s * 0.3, p.y - s * 0.9); c.lineTo(p.x, p.y + s * 0.4); c.stroke();
            } else if (kind === 2) {    // slab
                c.ellipse(p.x, p.y, s * 1.3, s * 0.5, (r() - 0.5) * 0.5, 0, 7); c.fill(); c.stroke();
                c.beginPath(); c.moveTo(p.x - s * 0.5, p.y - s * 0.1); c.lineTo(p.x, p.y + s * 0.15); c.lineTo(p.x + s * 0.4, p.y - s * 0.05); c.stroke();
            } else if (kind === 3) {    // pebbles
                for (let j = 0; j < 4; j++) {
                    c.beginPath(); c.arc(p.x + (r() - 0.5) * s * 2, p.y + (r() - 0.5) * s * 1.2, s * (0.2 + r() * 0.15), 0, 7); c.fill(); c.stroke();
                }
            } else {                    // stalagmite
                c.moveTo(p.x - s * 0.6, p.y); c.lineTo(p.x - s * 0.1, p.y - s * 1.8); c.lineTo(p.x + s * 0.15, p.y - s * 1.5);
                c.lineTo(p.x + s * 0.6, p.y); c.closePath(); c.fill(); c.stroke();
                c.beginPath(); c.moveTo(p.x - s * 0.1, p.y - s * 1.8); c.lineTo(p.x, p.y); c.stroke();
            }
        }
    },
};

/* ------------------------------------------------------------- pixel family
   S is 32 texels here: a 2x2-cell tile at 16 texels a cell. */

const px = (c: CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1) => c.fillRect(x | 0, y | 0, w, h);


/* One overworld tree filling a 16-texel cell from (ox, oy). */
function pxRoundTree(c: CanvasRenderingContext2D, ox: number, oy: number, ink: string) {
    c.fillStyle = '#183818';
    px(c, ox + 3, oy + 1, 10, 1); px(c, ox + 1, oy + 3, 1, 8); px(c, ox + 14, oy + 3, 1, 8);
    px(c, ox + 2, oy + 2); px(c, ox + 13, oy + 2); px(c, ox + 2, oy + 11); px(c, ox + 13, oy + 11);
    px(c, ox + 3, oy + 12, 10, 1);
    c.fillStyle = ink;
    px(c, ox + 3, oy + 2, 10, 10); px(c, ox + 2, oy + 3, 12, 8);
    c.fillStyle = '#88c860';
    px(c, ox + 4, oy + 3, 4, 2); px(c, ox + 4, oy + 5, 2, 2);
    c.fillStyle = '#704828';
    px(c, ox + 7, oy + 12, 2, 3);
}

function pxPine(c: CanvasRenderingContext2D, ox: number, oy: number, ink: string) {
    c.fillStyle = '#704828';
    px(c, ox + 7, oy + 13, 2, 2);
    for (let row = 0; row < 13; row++) {
        const half = 1 + ((row % 5) + Math.floor(row / 5) * 1.5) | 0;
        c.fillStyle = '#183818';
        px(c, ox + 8 - half - 1, oy + row, half * 2 + 2, 1);
    }
    for (let row = 1; row < 12; row++) {
        const half = ((row % 5) + Math.floor(row / 5) * 1.5) | 0;
        c.fillStyle = ink;
        px(c, ox + 8 - half, oy + row, half * 2, 1);
        c.fillStyle = '#88c860';
        if (half > 0) px(c, ox + 8 - half, oy + row);
    }
}

const PIXEL: Record<string, Painter> = {
    'px-waves'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 6; i++) px(c, r() * S, r() * S, 3 + (r() * 3 | 0), 1);
    },
    'px-water'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 5; i++) {
            const x = r() * (S - 6), y = r() * S;
            px(c, x, y, 2, 1); px(c, x + 2, y - 1, 2, 1); px(c, x + 4, y, 2, 1);
        }
    },
    'px-sand'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 14; i++) px(c, r() * S, r() * S);
    },
    'px-grass'(c, S, ink, r, mark) {
        c.fillStyle = ink;
        for (let i = 0; i < 8; i++) { mark(); const x = r() * S, y = r() * S; px(c, x, y, 1, 2); px(c, x + 2, y, 1, 2); px(c, x + 1, y + 1); }
    },
    'px-tallgrass'(c, S, ink, _r, mark) {
        /* The classic encounter grass: a tuft per quarter-cell. */
        for (let ty = 0; ty < S; ty += 8) {
            for (let tx = 0; tx < S; tx += 8) {
                mark();
                c.fillStyle = ink;
                px(c, tx + 1, ty + 3, 1, 4); px(c, tx + 3, ty + 1, 1, 6); px(c, tx + 5, ty + 2, 1, 5);
                c.fillStyle = '#98e070';
                px(c, tx + 3, ty + 1); px(c, tx + 5, ty + 2);
            }
        }
    },
    'px-rock'(c, S, ink, r, mark) {
        c.fillStyle = ink;
        for (let i = 0; i < 6; i++) { mark(); const x = r() * S, y = r() * S; px(c, x, y, 3, 1); px(c, x + 2, y + 1, 1, 2); }
        mark(false);
        c.fillStyle = '#ffffff30';
        for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S; px(c, x, y, 2, 1); }
    },
    'px-snow-peaks'(c, S, ink, r, mark) {
        /* A few small peaks a tile, rock in the ink and the top two rows
           white, with a lit left flank. */
        for (let i = 0; i < 3; i++) {
            mark();
            const x = r() * S, y = r() * S;
            for (let row = 0; row < 6; row++) {
                c.fillStyle = row < 2 ? '#ffffff' : ink;
                px(c, x + 5 - row, y + row, 2 + row * 2, 1);
            }
            c.fillStyle = '#ffffff70';
            for (let row = 2; row < 6; row++) px(c, x + 5 - row, y + row);
        }
    },
    'px-clouds'(c, _S, ink) {
        /* Two stacked puffs a tile, the flat shade under each. */
        const puff = (x: number, y: number) => {
            c.fillStyle = '#a8c0e0';
            px(c, x + 1, y + 6, 12, 1);
            c.fillStyle = ink;
            px(c, x + 4, y, 5, 1); px(c, x + 2, y + 1, 9, 1); px(c, x + 1, y + 2, 12, 3); px(c, x, y + 3, 14, 2); px(c, x + 1, y + 5, 12, 1);
        };
        puff(2, 4);
        puff(17, 20);
    },
    'px-bricks'(c, S, ink) {
        c.fillStyle = ink;
        for (let y = 0; y < S; y += 4) {
            px(c, 0, y, S, 1);
            for (let x = (y / 4) % 2 ? 4 : 0; x < S; x += 8) px(c, x, y, 1, 4);
        }
    },

    /* ---- the pixel biomes; S is 64 texels, a four-cell tile ---- */

    'px-flowers'(c, S, ink, r, mark) {
        const k = area(S, true);
        c.fillStyle = ink;
        for (let i = 0; i < 10 * k; i++) { const x = r() * S, y = r() * S; px(c, x, y, 1, 2); px(c, x + 1, y + 1); }
        for (let i = 0; i < 9 * k; i++) {
            mark();
            const x = r() * (S - 3), y = r() * (S - 3);
            const col = FLOWER_COLORS[(r() * FLOWER_COLORS.length) | 0];
            c.fillStyle = col;
            px(c, x + 1, y); px(c, x, y + 1); px(c, x + 2, y + 1); px(c, x + 1, y + 2);
            c.fillStyle = col === '#f6c945' ? '#a0521e' : '#f8d64a';
            px(c, x + 1, y + 1);
        }
    },
    'px-swamp'(c, S, ink, r, mark) {
        /* Green waves, reeds, and a mangrove or two on arched roots. */
        const k = area(S, true);
        c.fillStyle = ink;
        for (let i = 0; i < 6 * k; i++) {
            const x = r() * S, y = r() * S;
            px(c, x, y, 2, 1); px(c, x + 2, y - 1, 2, 1); px(c, x + 4, y, 2, 1);
        }
        c.fillStyle = '#90a868';
        for (let i = 0; i < 6 * k; i++) { mark(); const x = r() * S, y = r() * S; px(c, x, y, 1, 3); px(c, x + 2, y + 1, 1, 2); }
        for (let i = 0; i < 2 * k; i++) {
            mark();
            const x = r() * S, y = r() * S;
            c.fillStyle = '#5a4428';
            px(c, x + 1, y + 7, 1, 2); px(c, x, y + 9); px(c, x + 3, y + 7, 1, 3); px(c, x + 5, y + 7, 1, 2); px(c, x + 6, y + 9);
            px(c, x + 3, y + 5, 1, 2);
            c.fillStyle = '#2c4020';
            px(c, x + 1, y, 5, 1); px(c, x, y + 1, 7, 4); px(c, x + 1, y + 5, 5, 1);
            c.fillStyle = '#6a9048';
            px(c, x + 1, y + 1, 2, 1); px(c, x + 2, y + 2);
        }
    },
    'px-forest'(c, S, ink, r, mark) {
        /* The round overworld trees, with a pine in about one cell in three. */
        const cells = S / PX_PER_CELL;
        for (let cy = 0; cy < cells; cy++) {
            for (let cx = 0; cx < cells; cx++) {
                const ox = cx * PX_PER_CELL, oy = cy * PX_PER_CELL;
                mark();
                if (r() < 0.33) { pxPine(c, ox, oy, ink); continue; }
                pxRoundTree(c, ox, oy, ink);
            }
        }
    },
    'px-jungle'(c, S, ink, r, mark) {
        /* Palms over a dense canopy of big-leafed bushes. */
        const k = area(S, true);
        for (let i = 0; i < 8 * k; i++) {
            mark();
            const x = r() * S, y = r() * S;
            c.fillStyle = '#183818';
            px(c, x, y + 1, 8, 5); px(c, x + 1, y, 6, 7);
            c.fillStyle = ink;
            px(c, x + 1, y + 1, 6, 5);
            c.fillStyle = '#60a848';
            px(c, x + 2, y + 1, 2, 1); px(c, x + 1, y + 2);
        }
        for (let i = 0; i < 4 * k; i++) {
            mark();
            const x = r() * S, y = r() * S;
            c.fillStyle = '#806030';
            px(c, x + 4, y + 4, 1, 8); px(c, x + 5, y + 7, 1, 5);
            c.fillStyle = '#58b040';
            px(c, x, y + 3, 4, 1); px(c, x + 5, y + 3, 4, 1); px(c, x + 2, y + 2, 5, 1);
            px(c, x - 1, y + 4); px(c, x + 9, y + 4); px(c, x + 3, y + 1, 3, 1);
            c.fillStyle = '#306820';
            px(c, x + 1, y + 4, 2, 1); px(c, x + 6, y + 4, 2, 1);
        }
    },
    'px-shrubs'(c, S, ink, r, mark) {
        const k = area(S, true);
        c.fillStyle = ink;
        for (let i = 0; i < 9 * k; i++) {
            mark();
            const x = r() * S, y = r() * S;
            px(c, x + 2, y + 3, 1, 2); px(c, x + 1, y + 2); px(c, x + 3, y + 2); px(c, x, y + 1);
            px(c, x + 4, y + 1); px(c, x + 2, y + 1); px(c, x + 1, y + 5, 3, 1);
        }
        mark(false);
        for (let i = 0; i < 8 * k; i++) px(c, r() * S, r() * S);
    },
    'px-bare-trees'(c, S, ink, r, mark) {
        const k = area(S, true);
        for (let i = 0; i < 4 * k; i++) {
            mark();
            const x = r() * S, y = r() * S;
            c.fillStyle = '#f8f8f8';
            px(c, x - 2, y + 12, 6, 1);
            c.fillStyle = ink;
            px(c, x, y, 1, 12); px(c, x + 1, y + 4, 1, 8);
            px(c, x - 1, y + 3); px(c, x - 2, y + 2); px(c, x - 3, y + 1);
            px(c, x + 2, y + 5); px(c, x + 3, y + 4); px(c, x + 4, y + 3);
            px(c, x - 1, y + 7); px(c, x - 2, y + 6);
            px(c, x + 2, y + 9); px(c, x + 3, y + 8);
        }
    },
    'px-volcanic'(c, S, ink, r, mark) {
        const k = area(S, true);
        c.fillStyle = '#a0301c';
        for (let i = 0; i < 4 * k; i++) { const x = r() * S, y = r() * S; px(c, x, y, 5, 2); px(c, x + 1, y - 1, 3, 1); px(c, x + 1, y + 2, 4, 1); }
        c.fillStyle = ink;
        for (let i = 0; i < 4 * k; i++) {
            let x = r() * S, y = r() * S;
            for (let j = 0; j < 4; j++) { px(c, x, y, 2, 1); x += 2; y += (r() * 3 | 0) - 1; }
        }
        for (let i = 0; i < 2 * k; i++) {
            mark();
            const x = r() * S, y = r() * S;
            c.fillStyle = '#382828';
            for (let row = 0; row < 7; row++) px(c, x + 6 - row, y + row + 1, 4 + row * 2, 1);
            c.fillStyle = '#704848';
            for (let row = 1; row < 7; row++) px(c, x + 6 - row, y + row + 1, row, 1);
            c.fillStyle = '#f06020';
            px(c, x + 6, y, 4, 1); px(c, x + 7, y + 1, 1, 3); px(c, x + 6, y + 4, 1, 2);
            c.fillStyle = '#ffc040';
            px(c, x + 7, y, 2, 1);
        }
    },
    'px-rocks'(c, S, ink, r, mark) {
        const k = area(S, true);
        for (let i = 0; i < 9 * k; i++) {
            mark();
            const x = r() * S, y = r() * S, kind = (r() * 4) | 0;
            c.fillStyle = ink;
            if (kind === 0) { px(c, x + 1, y, 3, 1); px(c, x, y + 1, 5, 2); px(c, x + 1, y + 3, 3, 1); c.fillStyle = '#ffffff40'; px(c, x + 1, y + 1, 2, 1); }
            else if (kind === 1) { px(c, x + 1, y, 1, 1); px(c, x, y + 1, 3, 1); px(c, x, y + 2, 4, 1); }
            else if (kind === 2) { px(c, x, y, 1, 1); px(c, x + 3, y + 1, 1, 1); px(c, x + 1, y + 3, 1, 1); }
            else { px(c, x + 1, y, 1, 2); px(c, x, y + 2, 3, 2); c.fillStyle = '#ffffff40'; px(c, x + 1, y + 2); }
        }
    },
};

export function isPixelPattern(name: string): boolean {
    return name.startsWith('px-');
}

const cache = new Map<string, HTMLCanvasElement>();

/* Seeded by name, so each texture has its own layout but always the same one. */
function seedOf(name: string): number {
    let seed = 7;
    for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0;
    return seed;
}

/** The tile canvas for a painter, or null for an unknown name. */
export function patternTile(name: string, ink: string): HTMLCanvasElement | null {
    const key = name + '|' + ink;
    const hit = cache.get(key);
    if (hit) return hit;
    const pixel = isPixelPattern(name);
    const painter = pixel ? PIXEL[name] : SMOOTH[name];
    if (!painter) return null;
    const S = (pixel ? PX_PER_CELL : CELL * SMOOTH_RES) * tileCells(name);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const c = canvas.getContext('2d')!;
    const seed = seedOf(name);
    if (SELF_TILING.has(name)) {
        painter(c, S, ink, rng(seed), noMark);
    } else {
        /* Top row of copies first, so something lower down the tile is
           always drawn over something higher up, across the seam too. */
        for (const oy of [-1, 0, 1]) {
            for (const ox of [-1, 0, 1]) {
                c.save();
                c.translate(ox * S, oy * S);
                painter(c, S, ink, rng(seed), noMark);
                c.restore();
            }
        }
    }
    cache.set(key, canvas);
    return canvas;
}

/** World px per texel of a tile, which is the scale its pattern is drawn at. */
export function tileScale(name: string): number {
    return isPixelPattern(name) ? CELL / PX_PER_CELL : 1 / SMOOTH_RES;
}

const urls = new Map<string, string>();

/** The same tile as a data URL, for a CSS swatch. Cached: the side panel
    re-renders on every brush dab. */
export function patternDataUrl(name: string, ink: string): string | null {
    const key = name + '|' + ink;
    const hit = urls.get(key);
    if (hit) return hit;
    const tile = patternTile(name, ink);
    if (!tile) return null;
    const url = tile.toDataURL();
    urls.set(key, url);
    return url;
}

/* ------------------------------------------------------------ split tiles

   The same tile taken apart, so a marker a neighbouring terrain would cut
   can be left out whole rather than drawn sliced (see render/markers.ts):
   the ground texture as a tile of its own, the markers as a tile of their
   own, and each marker as a sprite with where it sits in the tile. Drawing
   the two tiles one over the other gives the original tile, except that
   ground drawn after a marker now lies under it. */

export interface MarkerSprite {
    canvas: HTMLCanvasElement;
    /** Its top-left in tile texels; past the tile's edge for an overhang. */
    x: number; y: number; w: number; h: number;
    /** Summed-area table of its inked texels, (w + 1) x (h + 1). */
    ink: Int32Array;
}

export interface PatternParts {
    /** Tile size, texels. */
    S: number;
    ground: HTMLCanvasElement | null;
    markers: HTMLCanvasElement | null;
    sprites: MarkerSprite[];
}

const STATE = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'] as const;
const DRAWS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage']);
const parts = new Map<string, PatternParts | null>();

function tileCanvas(S: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    return [canvas, canvas.getContext('2d', { willReadFrequently: true })!];
}

/** A painter's tile taken apart, or null for an unknown name. */
export function patternParts(name: string, ink: string): PatternParts | null {
    const key = name + '|' + ink;
    if (parts.has(key)) return parts.get(key)!;
    const pixel = isPixelPattern(name);
    const painter = pixel ? PIXEL[name] : SMOOTH[name];
    if (!painter) { parts.set(key, null); return null; }
    const S = (pixel ? PX_PER_CELL : CELL * SMOOTH_RES) * tileCells(name);
    if (SELF_TILING.has(name)) {
        const out = { S, ground: patternTile(name, ink), markers: null, sprites: [] };
        parts.set(key, out);
        return out;
    }
    /* The painter runs once, on canvases twice the tile's size with the
       tile in the middle, so overhangs are kept. Every draw goes to the
       ground or to the marker under way, through a stand-in context. */
    const pad = S / 2, W = 2 * S;
    const [groundC, gx] = tileCanvas(W);
    const [markC, mx] = tileCanvas(W);
    gx.translate(pad, pad);
    mx.translate(pad, pad);
    let cur = gx, inMarker = false, groundInk = false;
    const sprites: MarkerSprite[] = [];
    const flush = () => {
        if (!inMarker) return;
        const a = mx.getImageData(0, 0, W, W).data;
        let x0 = W, y0 = W, x1 = -1, y1 = -1;
        for (let y = 0; y < W; y++) {
            for (let x = 0; x < W; x++) {
                if (!a[(y * W + x) * 4 + 3]) continue;
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return;
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const [canvas, cx] = tileCanvas(1);
        canvas.width = w; canvas.height = h;
        cx.drawImage(markC, x0, y0, w, h, 0, 0, w, h);
        const ink = new Int32Array((w + 1) * (h + 1));
        for (let y = 0; y < h; y++) {
            let row = 0;
            for (let x = 0; x < w; x++) {
                if (a[((y0 + y) * W + x0 + x) * 4 + 3]) row++;
                ink[(y + 1) * (w + 1) + x + 1] = ink[y * (w + 1) + x + 1] + row;
            }
        }
        sprites.push({ canvas, x: x0 - pad, y: y0 - pad, w, h, ink });
    };
    const mark: Mark = (on = true) => {
        flush();
        const next = on ? mx : gx;
        if (on) {
            mx.save(); mx.setTransform(1, 0, 0, 1, 0, 0); mx.clearRect(0, 0, W, W); mx.restore();
        }
        for (const k of STATE) (next as unknown as Record<string, unknown>)[k] = cur[k];
        cur = next;
        inMarker = on;
    };
    const stand = new Proxy({}, {
        get(_, prop: string) {
            const v = (cur as unknown as Record<string, unknown>)[prop];
            if (typeof v !== 'function') return v;
            return (...args: unknown[]) => {
                if (!inMarker && DRAWS.has(prop)) groundInk = true;
                return (v as (...a: unknown[]) => unknown).apply(cur, args);
            };
        },
        set(_, prop: string, v) {
            (cur as unknown as Record<string, unknown>)[prop] = v;
            return true;
        },
    }) as CanvasRenderingContext2D;
    painter(stand, S, ink, rng(seedOf(name)), mark);
    flush();

    /* Each half as a tile, drawn again across each edge like patternTile:
       top row of copies first, so lower things lie over higher ones. */
    let ground: HTMLCanvasElement | null = null, markers: HTMLCanvasElement | null = null;
    if (groundInk) {
        const [canvas, c] = tileCanvas(S);
        for (const oy of [-1, 0, 1]) for (const ox of [-1, 0, 1]) c.drawImage(groundC, ox * S - pad, oy * S - pad);
        ground = canvas;
    }
    if (sprites.length) {
        const [canvas, c] = tileCanvas(S);
        for (const oy of [-1, 0, 1]) {
            for (const ox of [-1, 0, 1]) for (const sp of sprites) c.drawImage(sp.canvas, ox * S + sp.x, oy * S + sp.y);
        }
        markers = canvas;
    }
    const out = { S, ground, markers, sprites };
    parts.set(key, out);
    return out;
}
