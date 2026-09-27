import { decodeWith, encodeWith } from './raster';

/* Fog of war: a layer of samples over everything on the map — terrain,
   paths, landmarks, labels and tokens — that the GM paints to hide what the
   players have not found yet, and clears as they explore. It lives apart
   from the terrain, so clearing it uncovers the ground exactly as it was.

   One byte a sample, on the terrain's own grid (so the brushes paint it with
   no code of their own): 0 is clear; 1-20 dark grey fog and 21-40 soft white
   fog, each at 5% to 100% strength in steps of 5. Stored as runs like the
   terrain, `_` for clear, `a`-`t` dark and `A`-`T` white. */

export type FogColor = 'dark' | 'light';

export const FOG_STEPS = 20;
export const FOG_CLEAR = 0;

export const FOG_COLORS: { color: FogColor; name: string; rgb: [number, number, number] }[] = [
    { color: 'dark', name: 'Dark grey', rgb: [38, 40, 46] },
    { color: 'light', name: 'Soft white', rgb: [238, 240, 244] },
];

const LETTERS = '_' + 'abcdefghijklmnopqrst' + 'ABCDEFGHIJKLMNOPQRST';
const LETTER_VALUE = new Map([...LETTERS].map((l, i) => [l, i]));

/** A strength in percent, to the nearest step the layer can hold (5-100). */
export function fogStep(percent: number): number {
    return Math.max(1, Math.min(FOG_STEPS, Math.round((Number(percent) || 0) / (100 / FOG_STEPS))));
}

/** The byte a brush lays down for one colour and strength (in percent). */
export function fogValue(color: FogColor, percent: number): number {
    return fogStep(percent) + (color === 'light' ? FOG_STEPS : 0);
}

/** What one sample shows: its colour and its opacity 0..1, or null if clear. */
export function fogLook(v: number): { color: FogColor; alpha: number } | null {
    if (v <= 0 || v > FOG_STEPS * 2) return null;
    const light = v > FOG_STEPS;
    return { color: light ? 'light' : 'dark', alpha: (light ? v - FOG_STEPS : v) / FOG_STEPS };
}

export function encodeFog(data: Uint8Array): string {
    for (let i = 0; i < data.length; i++) if (data[i] !== FOG_CLEAR) return encodeWith(data, (v) => LETTERS[v] ?? '_');
    /* No fog anywhere: store nothing. */
    return '';
}

export function decodeFog(text: string, length: number): Uint8Array {
    return decodeWith(text, length, (l) => LETTER_VALUE.get(l) ?? FOG_CLEAR, FOG_CLEAR);
}

/* Decoded layers, keyed by the string like the terrain's — see raster.ts. */
const cache = new Map<string, Uint8Array>();

export function fogOf(doc: { cols: number; rows: number; res: number; fog: string }): Uint8Array | null {
    if (!doc.fog) return null;
    const n = doc.cols * doc.res * doc.rows * doc.res;
    let data = cache.get(doc.fog);
    if (!data || data.length !== n) {
        data = decodeFog(doc.fog, n);
        cache.set(doc.fog, data);
        if (cache.size > 6) cache.delete(cache.keys().next().value as string);
    }
    return data;
}

export function rememberFog(text: string, data: Uint8Array): void {
    if (!text) return;
    cache.set(text, data);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
}

/** A clear fog layer for a map, to paint into. */
export function blankFog(doc: { cols: number; rows: number; res: number }): Uint8Array {
    return new Uint8Array(doc.cols * doc.res * doc.rows * doc.res);
}

/** The whole map under one fog. */
export function fullFog(doc: { cols: number; rows: number; res: number }, value: number): string {
    return value ? LETTERS[value] + doc.cols * doc.res * doc.rows * doc.res : '';
}
