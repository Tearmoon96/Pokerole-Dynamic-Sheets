/* Line work: turning a wobbly freehand drag into a clean curve.

   A drag is dozens of pointer samples a second, jittery and far too many to
   store. Ramer–Douglas–Peucker keeps only the points the shape actually turns
   at; a Catmull-Rom spline then draws a smooth curve THROUGH those points, so
   what is stored is small and what is drawn still passes where the pointer did. */

export type Pt = [number, number];

function perpDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker, iterative so a long drag cannot blow the stack. */
export function simplify(points: Pt[], tolerance: number): Pt[] {
    if (points.length <= 2) return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop()!;
        let maxD = 0, idx = -1;
        for (let i = s + 1; i < e; i++) {
            const d = perpDist(points[i], points[s], points[e]);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (idx !== -1 && maxD > tolerance) {
            keep[idx] = 1;
            stack.push([s, idx], [idx, e]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/** Cubic Bézier segments of a Catmull-Rom spline through `pts`, each as
    [c1, c2, end]. The first point is the start. */
export function catmullRom(pts: Pt[], closed = false): [Pt, Pt, Pt][] {
    const n = pts.length;
    const out: [Pt, Pt, Pt][] = [];
    if (n < 2) return out;
    const at = (i: number): Pt => {
        if (closed) return pts[(i + n) % n];
        return pts[Math.max(0, Math.min(n - 1, i))];
    };
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        out.push([
            [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
            [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
            [p2[0], p2[1]],
        ]);
    }
    return out;
}

/** An SVG path `d` through the points, in whatever units they are in, scaled. */
export function smoothPathD(pts: Pt[], scale: number): string {
    if (pts.length < 2) return '';
    const f = (v: number) => (v * scale).toFixed(1);
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (const [c1, c2, e] of catmullRom(pts)) {
        d += 'C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(e[0]) + ' ' + f(e[1]);
    }
    return d;
}

/** A point halfway along the polyline, by length — where a Route's badge sits. */
export function midpoint(pts: Pt[]): Pt {
    if (pts.length === 1) return pts[0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let half = total / 2;
    for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (half <= seg && seg > 0) {
            const t = half / seg;
            return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        }
        half -= seg;
    }
    return pts[pts.length - 1];
}

/** Distance from a point to the polyline — the hit test for selecting a path. */
export function distToPolyline(p: Pt, pts: Pt[]): number {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) best = Math.min(best, perpDist(p, pts[i - 1], pts[i]));
    return best;
}

/** One round of Chaikin corner-cutting on a closed loop. Two rounds turn the
    staircase marching squares leaves into a soft coastline, and it stays
    local — each new point depends on two old ones — so two terrains sharing a
    stretch of boundary still share it exactly after smoothing. */
export function chaikinClosed(loop: Pt[]): Pt[] {
    const n = loop.length;
    if (n < 3) return loop;
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const a = loop[i], b = loop[(i + 1) % n];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    return out;
}

/* ------------------------------------------------------------------ contours

   Marching squares over a grid of levels, one sample per grid point. For each
   threshold asked for it traces the outline of "every sample at or above the
   threshold", as closed loops ready to fill with the even-odd rule — which is
   what makes a lake inside an island inside a sea come out right with no
   bookkeeping about which loop is a hole.

   All thresholds in ONE pass: a 2x2 square whose four samples agree — nearly
   all of them on a painted map — is skipped at once, and only squares on a
   boundary do any work. A 1600x1600 raster is millions of squares, and one
   pass per terrain was too slow to redraw under a brush.

   The grid is padded by two rings: the first repeats the edge samples, the
   second is below every threshold. So a region touching the map's border
   closes OUTSIDE the map rather than curling back in along the edge, and the
   renderer clips it — land runs straight off the edge of the page. Loops come
   back in sample units, where sample i's centre is i + 0.5. */

export function traceLevels(levels: Uint8Array, w: number, h: number, thresholds: number[]): Pt[][][] {
    const W = w + 4, H = h + 4;
    const g = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
        const sy = Math.max(0, Math.min(h - 1, y - 2));
        const row = sy * w;
        for (let x = 1; x < W - 1; x++) {
            g[y * W + x] = levels[row + Math.max(0, Math.min(w - 1, x - 2))] + 1;
        }
    }
    /* +1 above so the empty outer ring (0) is below every threshold. */
    const ts = thresholds.map((t) => t + 1);
    const nexts = ts.map(() => new Map<number, number>());

    /* Edge points are keyed by which grid edge they sit on:
       horizontal edge (x,y)-(x+1,y) -> 2*(y*W+x); vertical (x,y)-(x,y+1) -> 2*(y*W+x)+1. */
    for (let y = 0; y < H - 1; y++) {
        for (let x = 0; x < W - 1; x++) {
            const i = y * W + x;
            const a = g[i], b = g[i + 1], c = g[i + W + 1], d = g[i + W];
            if (a === b && b === c && c === d) continue;
            const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
            const top = 2 * i, bottom = 2 * (i + W), left = 2 * i + 1, right = 2 * (i + 1) + 1;
            for (let k = 0; k < ts.length; k++) {
                const t = ts[k];
                if (t <= lo || t > hi) continue;
                const next = nexts[k];
                const code = ((a >= t ? 1 : 0) << 3) | ((b >= t ? 1 : 0) << 2) | ((c >= t ? 1 : 0) << 1) | (d >= t ? 1 : 0);
                /* Every segment keeps the filled side on the same hand, so
                   following `next` walks each loop one way round. The two
                   saddles join their filled corners diagonally. */
                switch (code) {
                    case 1: next.set(bottom, left); break;
                    case 2: next.set(right, bottom); break;
                    case 3: next.set(right, left); break;
                    case 4: next.set(top, right); break;
                    case 5: next.set(top, left); next.set(bottom, right); break;
                    case 6: next.set(top, bottom); break;
                    case 7: next.set(top, left); break;
                    case 8: next.set(left, top); break;
                    case 9: next.set(bottom, top); break;
                    case 10: next.set(left, bottom); next.set(right, top); break;
                    case 11: next.set(right, top); break;
                    case 12: next.set(left, right); break;
                    case 13: next.set(bottom, right); break;
                    case 14: next.set(left, bottom); break;
                }
            }
        }
    }

    /* An edge key back to its position, in sample units of the UNPADDED
       grid: padded point (x, y) is the centre of sample (x-2, y-2). */
    const pos = (k: number): Pt => {
        const vert = k & 1;
        const i = k >> 1;
        const x = i % W, y = (i - x) / W;
        return [(vert ? x : x + 0.5) - 1.5, (vert ? y + 0.5 : y) - 1.5];
    };

    return nexts.map((next) => {
        const loops: Pt[][] = [];
        const seen = new Set<number>();
        for (const start of next.keys()) {
            if (seen.has(start)) continue;
            const loop: Pt[] = [];
            let k: number | undefined = start;
            while (k !== undefined && !seen.has(k)) {
                seen.add(k);
                loop.push(pos(k));
                k = next.get(k);
            }
            if (loop.length >= 3) loops.push(loop);
        }
        return loops;
    });
}

/** One boolean mask's outline, in cell units of a one-sample-a-cell grid. */
export function traceContours(mask: Uint8Array, cols: number, rows: number): Pt[][] {
    return traceLevels(mask, cols, rows, [1])[0];
}

/** Collapse runs of points that lie on one straight line. A square brush's
    edge comes back from marching squares as a point every sample; this keeps
    its four corners, and makes a big map's outlines a fraction the size. */
export function dropCollinear(loop: Pt[]): Pt[] {
    const n = loop.length;
    if (n < 4) return loop;
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const a = loop[(i + n - 1) % n], b = loop[i], c = loop[(i + 1) % n];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) > 1e-9) out.push(b);
    }
    return out.length >= 3 ? out : loop;
}

/** Dense points along the Catmull-Rom curve through `pts`. */
export function sampleCurve(pts: Pt[], steps = 8): Pt[] {
    if (pts.length < 2) return pts.slice();
    const out: Pt[] = [pts[0]];
    let p0 = pts[0];
    for (const [c1, c2, e] of catmullRom(pts)) {
        for (let s = 1; s <= steps; s++) {
            const t = s / steps, u = 1 - t;
            out.push([
                u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
                u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1],
            ]);
        }
        p0 = e;
    }
    return out;
}

/** The outline of a stroke whose width grows from `w0` to `w1` along it — a
    river widening from its source. SVG strokes have one width, so a tapered
    one is drawn as a filled shape instead. */
export function taperOutline(dense: Pt[], w0: number, w1: number): Pt[] {
    const n = dense.length;
    if (n < 2) return [];
    const left: Pt[] = [], right: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const a = dense[Math.max(0, i - 1)], b = dense[Math.min(n - 1, i + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const half = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
        left.push([dense[i][0] - dy * half, dense[i][1] + dx * half]);
        right.push([dense[i][0] + dy * half, dense[i][1] - dx * half]);
    }
    return [...left, ...right.reverse()];
}

export function polygonD(poly: Pt[], scale: number): string {
    if (!poly.length) return '';
    return poly.map(([x, y], i) => (i ? 'L' : 'M') + (x * scale).toFixed(1) + ' ' + (y * scale).toFixed(1)).join('') + 'Z';
}
