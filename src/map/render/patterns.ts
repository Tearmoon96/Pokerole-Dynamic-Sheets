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

/* ------------------------------------------------------------ smooth family */

const line = (c: CanvasRenderingContext2D, w: number) => {
    c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
};

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
    reeds(c, S, ink, r) {
        c.strokeStyle = ink; c.fillStyle = ink; line(c, S / 90);
        for (let i = 0; i < 5; i++) {
            const x = r() * S, y = r() * S, h = S * 0.07;
            for (let k = -1; k <= 1; k++) {
                c.beginPath(); c.moveTo(x + k * S * 0.015, y); c.lineTo(x + k * S * 0.025, y - h * (1 - Math.abs(k) * 0.3)); c.stroke();
            }
            c.beginPath(); c.moveTo(x - S * 0.04, y + S * 0.004); c.lineTo(x + S * 0.04, y + S * 0.004); c.stroke();
        }
    },
    sand(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(r() * S, r() * S, S / 220 + r() * S / 260, 0, 7); c.fill(); }
    },
    stipple(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(r() * S, r() * S, S / 200, 0, 7); c.fill(); }
    },
    tufts(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 9; i++) {
            const x = r() * S, y = r() * S, h = S * 0.035;
            c.beginPath();
            c.moveTo(x - h * 0.7, y - h); c.lineTo(x, y); c.lineTo(x + h * 0.7, y - h);
            c.moveTo(x, y); c.lineTo(x, y - h * 1.2);
            c.stroke();
        }
    },
    trees(c, S, ink, r) {
        /* Little round-topped trees in rows, the way a cartographer fills a
           wood — staggered so the repeat is harder to spot. */
        c.strokeStyle = ink; line(c, S / 110);
        const n = 4;
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const x = (col + (row % 2) * 0.5 + (r() - 0.5) * 0.3) * S / n;
                const y = (row + 0.6 + (r() - 0.5) * 0.2) * S / n;
                const rad = S * (0.045 + r() * 0.012);
                c.fillStyle = '#ffffff22';
                c.beginPath(); c.arc(x, y - rad, rad, Math.PI * 0.85, Math.PI * 2.15); c.closePath(); c.fill(); c.stroke();
                c.beginPath(); c.moveTo(x, y - rad * 0.2); c.lineTo(x, y + rad * 0.5); c.stroke();
            }
        }
    },
    dunes(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 100);
        for (let i = 0; i < 5; i++) {
            const x = r() * S, y = r() * S, w = S * (0.1 + r() * 0.08);
            c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - w * 0.35, x + w, y); c.stroke();
        }
    },
    hatch(c, S, ink) {
        c.strokeStyle = ink; line(c, S / 120);
        const step = S / 8;
        for (let i = -S; i < S * 2; i += step) {
            c.beginPath(); c.moveTo(i, 0); c.lineTo(i + S, S); c.stroke();
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
    cracks(c, S, ink, r) {
        c.strokeStyle = ink; line(c, S / 110);
        for (let i = 0; i < 4; i++) {
            let x = r() * S, y = r() * S;
            c.beginPath(); c.moveTo(x, y);
            for (let k = 0; k < 4; k++) { x += (r() - 0.5) * S * 0.12; y += r() * S * 0.06; c.lineTo(x, y); }
            c.stroke();
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
    blades(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 10; i++) {
            const x = r() * S, y = r() * S, h = S * 0.06, w = S * 0.012;
            c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y - h * 1.2, x + w * 0.5, y - h); c.lineTo(x + w, y); c.fill();
        }
    },
    canopy(c, S, ink, r) {
        const n = 3;
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const x = (col + (row % 2) * 0.5 + 0.25 + (r() - 0.5) * 0.2) * S / n;
                const y = (row + 0.5 + (r() - 0.5) * 0.2) * S / n;
                const rad = S * (0.1 + r() * 0.03);
                c.fillStyle = ink;
                c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
                c.fillStyle = '#ffffff30';
                c.beginPath(); c.arc(x - rad * 0.3, y - rad * 0.35, rad * 0.45, 0, 7); c.fill();
            }
        }
    },
};

/* ------------------------------------------------------------- pixel family
   S is 32 texels here: a 2x2-cell tile at 16 texels a cell. */

const px = (c: CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1) => c.fillRect(x | 0, y | 0, w, h);

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
    'px-swamp'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S; px(c, x, y, 4, 2); px(c, x + 1, y - 1, 2, 1); }
        c.fillStyle = '#90a868';
        for (let i = 0; i < 8; i++) { const x = r() * S, y = r() * S; px(c, x, y, 1, 3); }
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
    'px-tree'(c, S, ink) {
        /* One round tree per cell: dark outline, lit crown, trunk. */
        const cell = S / 2;
        for (let cy = 0; cy < 2; cy++) {
            for (let cx = 0; cx < 2; cx++) {
                const ox = cx * cell, oy = cy * cell;
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
        }
    },
    'px-rock'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 6; i++) { const x = r() * S, y = r() * S; px(c, x, y, 3, 1); px(c, x + 2, y + 1, 1, 2); }
        c.fillStyle = '#ffffff30';
        for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S; px(c, x, y, 2, 1); }
    },
    'px-lava'(c, S, ink, r) {
        c.fillStyle = ink;
        for (let i = 0; i < 5; i++) {
            let x = r() * S, y = r() * S;
            for (let k = 0; k < 4; k++) { px(c, x, y, 2, 1); x += 2; y += (r() * 3 | 0) - 1; }
        }
    },
    'px-bricks'(c, S, ink) {
        c.fillStyle = ink;
        for (let y = 0; y < S; y += 4) {
            px(c, 0, y, S, 1);
            for (let x = (y / 4) % 2 ? 4 : 0; x < S; x += 8) px(c, x, y, 1, 4);
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
    const S = pixel ? PX_PER_CELL * TILE_CELLS : CELL * TILE_CELLS * SMOOTH_RES;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const c = canvas.getContext('2d')!;
    /* Seeded by name, so each texture has its own layout but always the same one. */
    let seed = 7;
    for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0;
    painter(c, S, ink, rng(seed));
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
