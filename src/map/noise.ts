/* Smooth value noise: hashed lattice values blended with smoothstep.

   The Organic and Rugged brushes bend their edges with it, and old maps are
   baked through it when they are converted. It is a function of position
   alone, so two dabs that meet agree about where the edge wanders and the
   stroke comes out as one coastline, not a string of beads. */

function hash(x: number, y: number, k: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
    return s - Math.floor(s);
}

/** -1..1 */
export function noise(x: number, y: number, k: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, k), b = hash(x0 + 1, y0, k), c = hash(x0, y0 + 1, k), d = hash(x0 + 1, y0 + 1, k);
    return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

/** A point pushed about by the noise: `amp` how far, `scale` the wavelength,
    both in cells. Two octaves — the broad bend and a little grain on top. */
export function warp(x: number, y: number, amp: number, scale: number, grain = 0.35): [number, number] {
    const u = x / scale, v = y / scale;
    return [
        x + (noise(u, v, 1) + grain * noise(u * 3.1, v * 3.1, 3)) * amp,
        y + (noise(u, v, 2) + grain * noise(u * 3.1, v * 3.1, 4)) * amp,
    ];
}
