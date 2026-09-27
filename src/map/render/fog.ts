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
