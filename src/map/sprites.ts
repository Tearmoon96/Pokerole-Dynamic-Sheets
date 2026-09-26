import { IMG_BASE } from '../data/paths';
import { speciesSpriteChain } from '../lib/sprites';
import type { MapStyle } from './styles';

/* Where the Map Maker's art is looked for.

   The link between a landmark and its picture is nothing but the file name:
   `MapSprites/<Style>/<slug>.png`, then `MapSprites/Common/<slug>.png`, then a
   placeholder drawn from the catalogue. So art dropped into the folder shows up
   on the next reload with nothing to register — see MAP-SPRITES.md. */

export const MAP_SPRITE_BASE = IMG_BASE + 'MapSprites/';
export const COMMON_FOLDER = 'Common';

export function landmarkChain(style: MapStyle, slug: string): string[] {
    return [
        MAP_SPRITE_BASE + style.folder + '/' + slug + '.png',
        MAP_SPRITE_BASE + COMMON_FOLDER + '/' + slug + '.png',
    ];
}

/** A Pokémon's token: the Shuffle head where there is one, the Box sprite
    (framed round by the stylesheet) where there is not, each local then
    GitHub-raw. */
export function pokemonTokenChain(image: string): { url: string; className: string }[] {
    return [
        ...speciesSpriteChain(image, 'ShuffleTokens').map((url) => ({ url, className: 'tok-shuffle' })),
        ...speciesSpriteChain(image, 'BoxSprites').map((url) => ({ url, className: 'tok-box' })),
    ];
}

/** The generic markers, overridable per style like any landmark. */
export function markerChain(style: MapStyle, kind: 'trainer' | 'wild'): string[] {
    const slug = kind === 'trainer' ? 'trainer' : 'wild-pokemon';
    const chain = landmarkChain(style, slug);
    if (kind === 'wild') chain.push(IMG_BASE + 'ItemSprites/pokeball.png');
    return chain;
}

export function terrainTextureUrl(style: MapStyle, slug: string): string {
    return MAP_SPRITE_BASE + style.folder + '/terrain/' + slug + '.png';
}

/* ------------------------------------------------------------ probing

   Terrain textures are drawn into a canvas, not an <img>, so there is no
   onError to walk a chain with: each URL is probed once and the answer kept.
   The renderer asks, gets null while the probe is in flight or the file is
   missing, and is told to redraw when one arrives. */

type Probe = { img: HTMLImageElement; ok: boolean | null };

const probes = new Map<string, Probe>();
const listeners = new Set<() => void>();

export function onImageArrived(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

/** The image once it has loaded; null before that or if it never will. */
export function probeImage(url: string): HTMLImageElement | null {
    let p = probes.get(url);
    if (!p) {
        const img = new Image();
        p = { img, ok: null };
        probes.set(url, p);
        const probe = p;
        img.onload = () => { probe.ok = true; listeners.forEach((l) => l()); };
        img.onerror = () => { probe.ok = false; };
        img.src = url;
    }
    return p.ok ? p.img : null;
}

/** Resolves true if the file exists — for the sprite checklist. */
export function imageExists(url: string): Promise<boolean> {
    const p = probes.get(url);
    if (p && p.ok !== null) return Promise.resolve(p.ok);
    return new Promise((res) => {
        const img = new Image();
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = url;
    });
}
