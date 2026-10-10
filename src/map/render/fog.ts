import { FOG_COLORS, fogLook, fogOf } from '../fog';
import type { MapDoc } from '../types';

/* The fog layer as a picture: one pixel a sample, blurred a little so its
   edges drift like fog rather than stop like paint. The page stretches it
   over the whole map (smoothed, so the samples never show as squares) and
   the PNG export draws it last, over the tokens.

   A blur fades towards transparent at the picture's own edge, which would
   leave a fully fogged map with a clear rim. So the samples are drawn into a
   padded canvas first, with the outermost row and column smeared out into
   the padding, and blurred from there. */

/** How far the edge of the fog drifts, in cells. */
export const FOG_BLUR = 0.35;

function canvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

/** The map's fog, one pixel a sample; null when there is none. */
export function fogImage(doc: Pick<MapDoc, 'cols' | 'rows' | 'res' | 'fog'>): HTMLCanvasElement | null {
    const data = fogOf(doc);
    if (!data) return null;
    const w = doc.cols * doc.res, h = doc.rows * doc.res;

    const src = canvas(w, h);
    const sctx = src.getContext('2d')!;
    const img = sctx.createImageData(w, h);
    const px = img.data;
    const rgb = new Map(FOG_COLORS.map((c) => [c.color, c.rgb]));
    for (let i = 0; i < data.length; i++) {
        const look = fogLook(data[i]);
        if (!look) continue;
        const [r, g, b] = rgb.get(look.color)!;
        const o = i * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(look.alpha * 255);
    }
    sctx.putImageData(img, 0, 0);

    const blur = Math.max(1, doc.res * FOG_BLUR);
    const p = Math.ceil(blur * 3);
    const padded = canvas(w + 2 * p, h + 2 * p);
    const pctx = padded.getContext('2d')!;
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(src, p, p);
    pctx.drawImage(src, 0, 0, w, 1, p, 0, w, p);
    pctx.drawImage(src, 0, h - 1, w, 1, p, h + p, w, p);
    pctx.drawImage(src, 0, 0, 1, h, 0, p, p, h);
    pctx.drawImage(src, w - 1, 0, 1, h, w + p, p, p, h);
    pctx.drawImage(src, 0, 0, 1, 1, 0, 0, p, p);
    pctx.drawImage(src, w - 1, 0, 1, 1, w + p, 0, p, p);
    pctx.drawImage(src, 0, h - 1, 1, 1, 0, h + p, p, p);
    pctx.drawImage(src, w - 1, h - 1, 1, 1, w + p, h + p, p, p);

    const out = canvas(w, h);
    const octx = out.getContext('2d')!;
    /* A browser without canvas filters simply draws it unblurred. */
    octx.filter = `blur(${blur}px)`;
    octx.drawImage(padded, -p, -p);
    return out;
}

/** Grows a mask (1 = set) by `r` samples each way — a square, which the
    blur after it rounds off. Two passes per axis of "how far to the nearest
    set sample", so the cost does not grow with `r`. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
    const along = (src: Uint8Array, n: number, lines: number, at: (line: number, i: number) => number) => {
        const out = new Uint8Array(src.length);
        const dist = new Int32Array(n);
        for (let line = 0; line < lines; line++) {
            let d = 1 << 30;
            for (let i = 0; i < n; i++) { d = src[at(line, i)] ? 0 : d + 1; dist[i] = d; }
            d = 1 << 30;
            for (let i = n - 1; i >= 0; i--) {
                d = src[at(line, i)] ? 0 : d + 1;
                if (Math.min(d, dist[i]) <= r) out[at(line, i)] = 1;
            }
        }
        return out;
    };
    const rows = along(mask, w, h, (y, x) => y * w + x);
    return along(rows, h, w, (x, y) => y * w + x);
}

/** The samples under FULL-strength fog, at 100%, with a soft rim outside
    them: one pixel a sample, the fog's colour.

    The shared table draws this over the soft fog. The blur that makes fog
    drift also thins it for a sample or two inside its own edge, which is fine
    on the GM's screen and is a leak on a player's: whatever sits just inside
    a fogged area would show faintly at the rim. So every hidden sample is put
    back at 100% here. It used to be exactly that and nothing more — hard
    squares, drawn unsmoothed — which turned the fog's every edge into a
    staircase on the players' picture. Now the hidden region is grown a little
    and blurred, so its edge is soft OUTSIDE the hidden samples, and then
    every hidden sample is stamped back at full strength: the guarantee is
    exact, and the picture can be drawn smoothed. Fog the GM painted at a
    lower strength is see-through by intent, and left alone. */
export function fogSealImage(doc: Pick<MapDoc, 'cols' | 'rows' | 'res' | 'fog'>): HTMLCanvasElement | null {
    const data = fogOf(doc);
    if (!data) return null;
    const w = doc.cols * doc.res, h = doc.rows * doc.res;
    const rgb = new Map(FOG_COLORS.map((c) => [c.color, c.rgb]));

    /* Which samples are hidden, and in what colour (the nearest hidden
       sample's, for the rim: fog colours rarely meet). */
    const full = new Uint8Array(w * h);
    const colour = new Int32Array(w * h).fill(-1);
    let any = false;
    for (let i = 0; i < data.length; i++) {
        const look = fogLook(data[i]);
        if (!look || look.alpha < 1) continue;
        full[i] = 1;
        const [r, g, b] = rgb.get(look.color)!;
        colour[i] = (r << 16) | (g << 8) | b;
        any = true;
    }
    if (!any) return null;

    /* Nearly the soft layer's own blur, so the players' edge reads like the
       GM's; grown by twice that first, so the blurred value is ~98% where the
       hidden samples begin and stamping them back to 100% leaves no visible
       step. The cost: the players' fog edge lies about half a cell further
       out than the GM painted it — it hides a little more, never less. */
    const sigma = Math.max(1, doc.res * FOG_BLUR) * 0.75;
    const grow = Math.ceil(sigma * 2);
    const grown = dilate(full, w, h, grow);

    /* The rim's colour: spread each hidden sample's outwards, row then column. */
    const spread = colour.slice();
    for (let pass = 0; pass < grow; pass++) {
        const prev = spread.slice();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (prev[i] >= 0 || !grown[i]) continue;
                const n = (x > 0 && prev[i - 1] >= 0) ? prev[i - 1]
                    : (x < w - 1 && prev[i + 1] >= 0) ? prev[i + 1]
                        : (y > 0 && prev[i - w] >= 0) ? prev[i - w]
                            : (y < h - 1 && prev[i + w] >= 0) ? prev[i + w] : -1;
                if (n >= 0) spread[i] = n;
            }
        }
    }
    const fallback = colour.find((c) => c >= 0)!;

    const src = canvas(w, h);
    const sctx = src.getContext('2d')!;
    const img = sctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
        if (!grown[i]) continue;
        const c = spread[i] >= 0 ? spread[i] : fallback;
        const o = i * 4;
        img.data[o] = c >> 16; img.data[o + 1] = (c >> 8) & 255; img.data[o + 2] = c & 255; img.data[o + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);

    /* Blurred from a padded copy, as the soft layer is, so a map fogged to its
       edge does not fade at the edge. */
    const p = Math.ceil(sigma * 3);
    const padded = canvas(w + 2 * p, h + 2 * p);
    const pctx = padded.getContext('2d')!;
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(src, p, p);
    pctx.drawImage(src, 0, 0, w, 1, p, 0, w, p);
    pctx.drawImage(src, 0, h - 1, w, 1, p, h + p, w, p);
    pctx.drawImage(src, 0, 0, 1, h, 0, p, p, h);
    pctx.drawImage(src, w - 1, 0, 1, h, w + p, p, p, h);
    pctx.drawImage(src, 0, 0, 1, 1, 0, 0, p, p);
    pctx.drawImage(src, w - 1, 0, 1, 1, w + p, 0, p, p);
    pctx.drawImage(src, 0, h - 1, 1, 1, 0, h + p, p, p);
    pctx.drawImage(src, w - 1, h - 1, 1, 1, w + p, h + p, p, p);

    const out = canvas(w, h);
    const octx = out.getContext('2d', { willReadFrequently: true })!;
    octx.filter = `blur(${sigma}px)`;
    octx.drawImage(padded, -p, -p);
    octx.filter = 'none';

    /* And every hidden sample back at exactly 100%, in its own colour. */
    const done = octx.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
        if (!full[i]) continue;
        const c = colour[i], o = i * 4;
        done.data[o] = c >> 16; done.data[o + 1] = (c >> 8) & 255; done.data[o + 2] = c & 255; done.data[o + 3] = 255;
    }
    octx.putImageData(done, 0, 0);
    return out;
}
