import { fogLook, fogOf } from '../fog';
import { exportSize, renderMapPng } from './exportPng';
import type { ImageLoader } from './exportPng';
import type { MapDoc } from '../types';

/* The map as the players at the shared table see it.

   This is the only picture of a map that ever leaves the GM's browser, so it
   is where the fog of war is enforced, and it is enforced by what is DRAWN,
   never by what is hidden afterwards:

   - the fog is always drawn, whatever the editor's "hide the fog" toggle says
     (that is the GM's view, and this is not);
   - every sample under full-strength fog is painted back to 100% after the
     blur (`sealFog`), so nothing shows faintly through the fog's rim;
   - a landmark, label or token whose anchor is under full fog is not drawn at
     all. Fog covers the map's own area; a label hidden near the edge can
     stick out past the fog, or past the map into the frame, and would be
     read there;
   - and the MapDoc itself — terrain, everything under the fog, the GM's
     notes in a label — is never sent. Players get pixels.

   The reveal guard below is the other half: the live link holds an update
   that uncovers a lot at once until the GM says yes. */

/** A shared map is at most this many pixels on a side. */
export const PLAYER_MAX_SIDE = 4096;
const MAX_PX_PER_CELL = 48;
const MIN_PX_PER_CELL = 4;

export function playerPxPerCell(doc: MapDoc): number {
    let px = Math.max(MIN_PX_PER_CELL, Math.min(MAX_PX_PER_CELL, Math.floor(PLAYER_MAX_SIDE / Math.max(doc.cols, doc.rows))));
    while (px > MIN_PX_PER_CELL) {
        const s = exportSize(doc, px);
        if (s.ok && s.w <= PLAYER_MAX_SIDE && s.h <= PLAYER_MAX_SIDE) break;
        px--;
    }
    return px;
}

/** Whether the point (in cells) lies under full-strength fog. */
function hiddenAt(doc: MapDoc, fog: Uint8Array | null, x: number, y: number): boolean {
    if (!fog) return false;
    const w = doc.cols * doc.res, h = doc.rows * doc.res;
    const sx = Math.min(w - 1, Math.max(0, Math.floor(x * doc.res)));
    const sy = Math.min(h - 1, Math.max(0, Math.floor(y * doc.res)));
    const look = fogLook(fog[sy * w + sx]);
    return !!look && look.alpha >= 1;
}

/** The map with everything under full fog taken out. A path or a sketch is
    dropped only when every point of it is hidden: a road running out of the fog is drawn,
    and its hidden stretch is covered like the ground under it. */
export function playerDoc(doc: MapDoc): MapDoc {
    const fog = fogOf(doc);
    if (!fog) return doc;
    return {
        ...doc,
        stamps: doc.stamps.filter((s) => !hiddenAt(doc, fog, s.x, s.y)),
        labels: doc.labels.filter((l) => !hiddenAt(doc, fog, l.x, l.y)),
        tokens: doc.tokens.filter((t) => !hiddenAt(doc, fog, t.x, t.y)),
        paths: doc.paths.filter((p) => !p.points.every(([x, y]) => hiddenAt(doc, fog, x, y))),
        sketches: doc.sketches.filter((k) => !k.points.every(([x, y]) => hiddenAt(doc, fog, x, y))),
    };
}

export interface PlayerView {
    blob: Blob;
    width: number;
    height: number;
}

export async function renderPlayerView(doc: MapDoc, load: ImageLoader): Promise<PlayerView> {
    const shown = playerDoc(doc);
    const res = await renderMapPng(shown, {
        pxPerCell: playerPxPerCell(doc),
        grid: doc.grid.show,
        tokens: true,
        fog: true,
        sealFog: true,
        type: 'image/webp',
        quality: 0.86,
    }, load);
    return { blob: res.blob, width: res.width, height: res.height };
}

/* ------------------------------------------------------------ the guard */

/** What is under the fog, as the reveal guard measures it. */
export interface FogSnapshot {
    cols: number;
    rows: number;
    res: number;
    fog: string;
}

export function fogSnapshot(doc: MapDoc): FogSnapshot {
    return { cols: doc.cols, rows: doc.rows, res: doc.res, fog: doc.fog };
}

/** How much fog weighs at one sample, 0..1. */
function weight(v: number): number {
    return fogLook(v)?.alpha ?? 0;
}

export interface RevealStats {
    /** Share of the map, 0..1, that this update uncovers. */
    revealed: number;
    /** There was fog, and now there is none at all. */
    clearedAll: boolean;
    /** The new map has fog anywhere. */
    hasFog: boolean;
}

/** Compares the fog players last saw with the fog about to be published.

    "Uncovered" is measured in fog strength, so thinning a whole map from 100%
    to 50% counts as revealing half of it — which, to a player, it does. */
export function revealStats(before: FogSnapshot | null, doc: MapDoc): RevealStats {
    const after = fogOf(doc);
    const hasFog = !!after;
    if (!before || !before.fog) return { revealed: 0, clearedAll: false, hasFog };

    const prev = fogOf(before);
    if (!prev) return { revealed: 0, clearedAll: false, hasFog };
    const clearedAll = !after;

    const sameGrid = before.cols === doc.cols && before.rows === doc.rows && before.res === doc.res;
    if (sameGrid) {
        let lost = 0;
        for (let i = 0; i < prev.length; i++) {
            const d = weight(prev[i]) - (after ? weight(after[i]) : 0);
            if (d > 0) lost += d;
        }
        return { revealed: lost / prev.length, clearedAll, hasFog };
    }

    /* Resized: compare how much of each map is covered. */
    const cover = (data: Uint8Array | null) => {
        if (!data) return 0;
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += weight(data[i]);
        return sum / data.length;
    };
    return { revealed: Math.max(0, cover(prev) - cover(after)), clearedAll, hasFog };
}
