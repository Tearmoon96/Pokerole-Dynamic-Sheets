import { TERRAINS } from './terrain';
import { decodeWith, encodeWith } from './raster';
import type { EdgeKind, MapBorders } from './types';

/* How the edge between two terrains is drawn, and who decides.

   Four looks:
   - style: whatever the style does for that terrain — an ink line on some,
     nothing on others. What every map had before this could be chosen;
   - line: a clear dark line, the style's own ink, whatever the terrain;
   - plain: the two colours simply meet, no line;
   - soft: the two blend into each other across a band — a biome shading off
     into the next rather than stopping.

   Three places can say which, and the most specific one wins:
   1. the PAINTED border layer — a sample at a time, laid down by the terrain
      brush along with the terrain, or by the Borders brush on its own;
   2. the terrain's own setting on this map ("forest edges: soft");
   3. the map's setting, for every edge nobody said anything about.

   An edge has a terrain on each side. Where the two sides disagree, the one
   that SAID something beats the one that did not, and between two that both
   said something the terrain stacked higher wins — the one drawn on top.

   Whoever asked for it, a Soft edge never blends land with water, nor
   anything with the map's background terrain: those come out as None, the
   two colours meeting with no line. */

export const EDGE_KINDS: { kind: EdgeKind; name: string; icon: string; hint: string }[] = [
    { kind: 'style', name: 'Style', icon: 'fa-palette', hint: 'Whatever the map style does for that terrain' },
    { kind: 'line', name: 'Line', icon: 'fa-pen', hint: 'A clear dark line' },
    { kind: 'plain', name: 'None', icon: 'fa-square', hint: 'The colours just meet, with no line' },
    { kind: 'soft', name: 'Soft', icon: 'fa-cloud', hint: 'The two terrains blend into each other — never land with water, nor anything with the background' },
];

export const EDGE_NAME: Record<EdgeKind, string> = { style: 'Style', line: 'Line', plain: 'None', soft: 'Soft' };

/* The painted layer, one byte a sample: 0 says nothing (the terrain's or the
   map's setting applies), 1-4 are the kinds. Stored like the terrain, as runs,
   with its own letters — `m` for "the map decides". */
export const PAINT_INHERIT = 0;
const PAINT_KINDS: EdgeKind[] = ['style', 'line', 'plain', 'soft'];
const LETTERS = ['m', 'y', 'l', 'n', 's'];
const LETTER_VALUE = new Map(LETTERS.map((l, i) => [l, i]));

export function paintValue(kind: EdgeKind | 'map'): number {
    return kind === 'map' ? PAINT_INHERIT : PAINT_KINDS.indexOf(kind) + 1;
}

export function paintedKind(v: number): EdgeKind | null {
    return v > 0 ? PAINT_KINDS[v - 1] ?? null : null;
}

export function encodeEdges(data: Uint8Array): string {
    for (let i = 0; i < data.length; i++) if (data[i] !== PAINT_INHERIT) return encodeWith(data, (v) => LETTERS[v] ?? 'm');
    /* Nothing painted: store nothing. */
    return '';
}

export function decodeEdges(text: string, length: number): Uint8Array {
    return decodeWith(text, length, (l) => LETTER_VALUE.get(l) ?? PAINT_INHERIT, PAINT_INHERIT);
}

/* Decoded layers, keyed by the string like the terrain's — see raster.ts. */
const cache = new Map<string, Uint8Array>();

export function edgesOf(doc: { cols: number; rows: number; res: number; edges: string }): Uint8Array | null {
    if (!doc.edges) return null;
    const n = doc.cols * doc.res * doc.rows * doc.res;
    let data = cache.get(doc.edges);
    if (!data || data.length !== n) {
        data = decodeEdges(doc.edges, n);
        cache.set(doc.edges, data);
        if (cache.size > 6) cache.delete(cache.keys().next().value as string);
    }
    return data;
}

export function rememberEdges(text: string, data: Uint8Array): void {
    if (!text) return;
    cache.set(text, data);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
}

/** A blank painted layer for a map, to paint into. */
export function blankEdges(doc: { cols: number; rows: number; res: number }): Uint8Array {
    return new Uint8Array(doc.cols * doc.res * doc.rows * doc.res);
}

export const DEFAULT_BORDERS: MapBorders = { kind: 'style', soft: 1.5, terrain: {} };
export const MIN_SOFT = 0.25;
export const MAX_SOFT = 6;

/** A resolver for one map: terrain indices (upper, lower) and the painted
    values on each side, to the kind that edge is drawn as. `background` is
    the index of the map's background terrain. Built once per geometry;
    called for every stretch of edge. */
export function edgeResolver(borders: MapBorders, background: number): (upper: number, lower: number, pUpper: number, pLower: number) => EdgeKind {
    const byIndex: (EdgeKind | undefined)[] = TERRAINS.map((t) => borders.terrain[t.slug]);
    const asked = (upper: number, lower: number, pUpper: number, pLower: number): EdgeKind => {
        if (pUpper) return PAINT_KINDS[pUpper - 1] ?? borders.kind;
        if (pLower) return PAINT_KINDS[pLower - 1] ?? borders.kind;
        return byIndex[upper] ?? (lower >= 0 ? byIndex[lower] : undefined) ?? borders.kind;
    };
    return (upper, lower, pUpper, pLower) => {
        const kind = asked(upper, lower, pUpper, pLower);
        if (kind !== 'soft' || lower < 0) return kind;
        if (upper === background || lower === background || !!TERRAINS[upper]?.water !== !!TERRAINS[lower]?.water) return 'plain';
        return kind;
    };
}

export function isEdgeKind(v: unknown): v is EdgeKind {
    return v === 'style' || v === 'line' || v === 'plain' || v === 'soft';
}
