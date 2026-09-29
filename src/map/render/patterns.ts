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

type Painter = (c: CanvasRenderingContext2D, S: number, ink: string, r: Rng) => void;

/* Every painter is drawn nine times, shifted by a tile each way, so a tree
   whose crown hangs past the tile's edge carries on in the next tile instead
   of being sliced off at the cell line. The same seed makes all nine the same
   layout. Painters that already tile by construction — full-width lines, or a
   wrap of their own — are left out, or their shapes would be drawn twice over
   and any translucent ink would darken. */
const SELF_TILING = new Set(['bricks', 'clouds', 'puffs', 'px-tallgrass', 'px-bricks', 'px-clouds']);

/* The organic painters use a tile four cells wide rather than two, so their
   scatter repeats half as often and reads as random ground. Their counts are
   written per two-cell tile and scaled up by `area(S)`. */
const BIG_TILE = new Set(['tussocks', 'tall-tussocks', 'flowers', 'swamp', 'forest-line', 'forest-fill',
    'jungle-line', 'jungle-fill', 'shrubs', 'bare-trees', 'volcanoes', 'rocks',
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
function forest(c: CanvasRenderingContext2D, S: number, ink: string, r: Rng, fill: boolean) {
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

function jungle(c: CanvasRenderingContext2D, S: number, ink: string, r: Rng, fill: boolean) {
    const k = area(S);
    const things = [
        ...scatter(r, S, Math.round((fill ? 6 : 9) * k), S * (fill ? 0.16 : 0.12)).map((p) => ({ ...p, kind: 'leaf' as const })),
        ...scatter(r, S, Math.round((fill ? 3 : 4) * k), S * 0.2).map((p) => ({ ...p, kind: 'palm' as const })),
        ...scatter(r, S, Math.round(5 * k), S * 0.1).map((p) => ({ ...p, kind: 'fern' as const })),
    ].sort((a, b) => a.y - b.y);
    for (const t of things) {
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

const SMOOTH: Record<string, Painter> = {
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
    dunes(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 5; i++) {
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
    peaks(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 5; i++) {
            const x = r() * S, y = r() * S, w = S * (0.08 + r() * 0.05);
            c.fillStyle = '#00000014';
            c.beginPath(); c.moveTo(x - w, y); c.lineTo(x, y - w * 1.1); c.lineTo(x + w, y); c.fill(); c.stroke();
            c.beginPath(); c.moveTo(x, y - w * 1.1); c.lineTo(x + w * 0.25, y - w * 0.3); c.stroke();
        }
    },
    /* The Mountain's peaks with white caps: the shaded body, then the snow
       down to a ragged line, then the outline over both so the cap never
       eats the ink. */
    'snow-peaks'(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 5; i++) {
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
    blobs(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 5; i++) {
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

    tussocks(c, S, ink, r) {
        /* Grassland: low green tufts, a few blades fanned from one root. */
        c.strokeStyle = ink; line(c, S / 115);
        for (const p of scatter(r, S, Math.round(11 * area(S)), S * 0.07)) {
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
    'tall-tussocks'(c, S, ink, r) {
        /* Tall grass: taller, stiffer clumps — straight blades in a narrow
           fan, packed closer, a darker one behind each. */
        line(c, S / 105);
        for (const p of scatter(r, S, Math.round(13 * area(S)), S * 0.065)) {
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
    flowers(c, S, ink, r) {
        /* A flower field: little five-petalled flowers in every colour, over
           a few leaves. */
        const pts = scatter(r, S, Math.round(18 * area(S)), S * 0.055);
        c.fillStyle = ink;
        for (const p of pts) {
            for (let k = 0; k < 2; k++) {
                const a = (r() - 0.5) * 2.4 + (k ? Math.PI : 0);
                c.beginPath();
                c.ellipse(p.x + Math.cos(a) * S * 0.014, p.y + S * 0.01 + Math.sin(a) * S * 0.006, S * 0.012, S * 0.005, a, 0, 7);
                c.fill();
            }
        }
        for (const p of pts) {
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
        }
    },
    swamp(c, S, ink, r) {
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
    'forest-line'(c, S, ink, r) { forest(c, S, ink, r, false); },
    'forest-fill'(c, S, ink, r) { forest(c, S, ink, r, true); },
    'jungle-line'(c, S, ink, r) { jungle(c, S, ink, r, false); },
    'jungle-fill'(c, S, ink, r) { jungle(c, S, ink, r, true); },
    shrubs(c, S, ink, r) {
        /* Badlands: dry, twiggy shrubs in a darker tint of the ground, and a
           few pebbles between them. */
        c.strokeStyle = ink; c.fillStyle = ink;
        for (const p of scatter(r, S, Math.round(7 * area(S)), S * 0.11)) {
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
        for (let i = 0; i < 8 * area(S); i++) { c.beginPath(); c.arc(r() * S, r() * S, S * (0.003 + r() * 0.003), 0, 7); c.fill(); }
    },
    'bare-trees'(c, S, ink, r) {
        /* Tundra: tall, leafless trees, a few to a cell, with a streak of
           frost at the foot of each. */
        for (const p of scatter(r, S, Math.round(5 * area(S)), S * 0.14)) {
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
    volcanoes(c, S, ink, r) {
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
    rocks(c, S, ink, r) {
        /* Cave floor: every kind of stone — boulders, sharp shards, flat
           slabs, pebble scatters and stubby stalagmites. */
        c.strokeStyle = ink; line(c, S / 120);
        for (const p of scatter(r, S, Math.round(10 * area(S)), S * 0.085)) {
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
    'px-grass'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 8; i++) { const x = r() * S, y = r() * S; px(c, x, y, 1, 2); px(c, x + 2, y, 1, 2); px(c, x + 1, y + 1); }
    },
    'px-tallgrass'(c, S, ink) {
        /* The classic encounter grass: a tuft per quarter-cell. */
        for (let ty = 0; ty < S; ty += 8) {
            for (let tx = 0; tx < S; tx += 8) {
                c.fillStyle = ink;
                px(c, tx + 1, ty + 3, 1, 4); px(c, tx + 3, ty + 1, 1, 6); px(c, tx + 5, ty + 2, 1, 5);
                c.fillStyle = '#98e070';
                px(c, tx + 3, ty + 1); px(c, tx + 5, ty + 2);
            }
        }
    },
    'px-rock'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 6; i++) { const x = r() * S, y = r() * S; px(c, x, y, 3, 1); px(c, x + 2, y + 1, 1, 2); }
        c.fillStyle = '#ffffff30';
        for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S; px(c, x, y, 2, 1); }
    },
    'px-snow-peaks'(c, S, ink, r) {
        /* A few small peaks a tile, rock in the ink and the top two rows
           white, with a lit left flank. */
        for (let i = 0; i < 3; i++) {
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

    'px-flowers'(c, S, ink, r) {
        const k = area(S, true);
        c.fillStyle = ink;
        for (let i = 0; i < 10 * k; i++) { const x = r() * S, y = r() * S; px(c, x, y, 1, 2); px(c, x + 1, y + 1); }
        for (let i = 0; i < 9 * k; i++) {
            const x = r() * (S - 3), y = r() * (S - 3);
            const col = FLOWER_COLORS[(r() * FLOWER_COLORS.length) | 0];
            c.fillStyle = col;
            px(c, x + 1, y); px(c, x, y + 1); px(c, x + 2, y + 1); px(c, x + 1, y + 2);
            c.fillStyle = col === '#f6c945' ? '#a0521e' : '#f8d64a';
            px(c, x + 1, y + 1);
        }
    },
    'px-swamp'(c, S, ink, r) {
        /* Green waves, reeds, and a mangrove or two on arched roots. */
        const k = area(S, true);
        c.fillStyle = ink;
        for (let i = 0; i < 6 * k; i++) {
            const x = r() * S, y = r() * S;
            px(c, x, y, 2, 1); px(c, x + 2, y - 1, 2, 1); px(c, x + 4, y, 2, 1);
        }
        c.fillStyle = '#90a868';
        for (let i = 0; i < 6 * k; i++) { const x = r() * S, y = r() * S; px(c, x, y, 1, 3); px(c, x + 2, y + 1, 1, 2); }
        for (let i = 0; i < 2 * k; i++) {
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
    'px-forest'(c, S, ink, r) {
        /* The round overworld trees, with a pine in about one cell in three. */
        const cells = S / PX_PER_CELL;
        for (let cy = 0; cy < cells; cy++) {
            for (let cx = 0; cx < cells; cx++) {
                const ox = cx * PX_PER_CELL, oy = cy * PX_PER_CELL;
                if (r() < 0.33) { pxPine(c, ox, oy, ink); continue; }
                pxRoundTree(c, ox, oy, ink);
            }
        }
    },
    'px-jungle'(c, S, ink, r) {
        /* Palms over a dense canopy of big-leafed bushes. */
        const k = area(S, true);
        for (let i = 0; i < 8 * k; i++) {
            const x = r() * S, y = r() * S;
            c.fillStyle = '#183818';
            px(c, x, y + 1, 8, 5); px(c, x + 1, y, 6, 7);
            c.fillStyle = ink;
            px(c, x + 1, y + 1, 6, 5);
            c.fillStyle = '#60a848';
            px(c, x + 2, y + 1, 2, 1); px(c, x + 1, y + 2);
        }
        for (let i = 0; i < 4 * k; i++) {
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
    'px-shrubs'(c, S, ink, r) {
        const k = area(S, true);
        c.fillStyle = ink;
        for (let i = 0; i < 9 * k; i++) {
            const x = r() * S, y = r() * S;
            px(c, x + 2, y + 3, 1, 2); px(c, x + 1, y + 2); px(c, x + 3, y + 2); px(c, x, y + 1);
            px(c, x + 4, y + 1); px(c, x + 2, y + 1); px(c, x + 1, y + 5, 3, 1);
        }
        for (let i = 0; i < 8 * k; i++) px(c, r() * S, r() * S);
    },
    'px-bare-trees'(c, S, ink, r) {
        const k = area(S, true);
        for (let i = 0; i < 4 * k; i++) {
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
    'px-volcanic'(c, S, ink, r) {
        const k = area(S, true);
        c.fillStyle = '#a0301c';
        for (let i = 0; i < 4 * k; i++) { const x = r() * S, y = r() * S; px(c, x, y, 5, 2); px(c, x + 1, y - 1, 3, 1); px(c, x + 1, y + 2, 4, 1); }
        c.fillStyle = ink;
        for (let i = 0; i < 4 * k; i++) {
            let x = r() * S, y = r() * S;
            for (let j = 0; j < 4; j++) { px(c, x, y, 2, 1); x += 2; y += (r() * 3 | 0) - 1; }
        }
        for (let i = 0; i < 2 * k; i++) {
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
    'px-rocks'(c, S, ink, r) {
        const k = area(S, true);
        for (let i = 0; i < 9 * k; i++) {
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
    /* Seeded by name, so each texture has its own layout but always the same one. */
    let seed = 7;
    for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0;
    if (SELF_TILING.has(name)) {
        painter(c, S, ink, rng(seed));
    } else {
        /* Top row of copies first, so something lower down the tile is
           always drawn over something higher up, across the seam too. */
        for (const oy of [-1, 0, 1]) {
            for (const ox of [-1, 0, 1]) {
                c.save();
                c.translate(ox * S, oy * S);
                painter(c, S, ink, rng(seed));
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
