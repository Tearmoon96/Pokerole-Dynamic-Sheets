import { GITHUB_RAW, IMG_BASE } from '../data/paths';
import {
    BOX_SPRITE_FRAME, SPRITE_FIT_TARGET, SPRITE_SET_BLOCKED,
} from '../state/constants';
import type { SpriteFrames } from '../data/types';
import type { MonPreview, SpriteType } from '../state/types';

export const SPRITE_FOLDERS: Record<string, string> = {
    Home: 'HomeSprites', Book: 'BookSprites',
    Box: 'BoxSprites', Shuffle: 'ShuffleTokens',
};

/* Picker tiles prefer the Home sprite; if a species lacks one they fall back
   Home -> Book -> Box -> Token (each local then GitHub-raw) so a tile shows real
   art instead of a broken "no image" icon. The <img> also gets a sprite-<kind>
   class so Home sprites can be sized down a touch. */
export const TILE_SPRITE_FOLDERS = ['HomeSprites', 'BookSprites', 'BoxSprites', 'ShuffleTokens'];

export const SPRITE_CLASS: Record<string, string> = {
    HomeSprites: 'sprite-home', BookSprites: 'sprite-book',
    BoxSprites: 'sprite-box', ShuffleTokens: 'sprite-token',
};

/** The trainer-side default when a slot has no saved preview yet. */
export function defaultPreview(): MonPreview {
    return { spriteType: 'Home', scale: 1, offsetX: 0, offsetY: 0, useNickname: false };
}

/* The set actually drawn: the one asked for, unless that pack has nothing
   usable for this species, in which case the first that does. Shuffle is never
   a substitute — it is much the sparsest pack. */
export function usableSpriteType(image: string | undefined, type: string): string {
    const blocked = image && SPRITE_SET_BLOCKED[image];
    if (!blocked || blocked.indexOf(type) === -1) return type;
    return ['Home', 'Book', 'Box'].filter((t) => blocked.indexOf(t) === -1)[0] || 'Home';
}

/** Local copy first, GitHub-raw second — the chain an <img> walks on error. */
export function speciesSpriteChain(image: string, folder: string): string[] {
    return [IMG_BASE + folder + '/' + image, GITHUB_RAW + '/images/' + folder + '/' + image];
}

/** Every local folder first, then the remote ones, for a tile that just wants
    *some* art.

    The two passes are deliberate. Interleaved per folder — local Home, remote
    Home, local Book, remote Book — a species with no HomeSprites art fired a
    request at GitHub for a file that is missing there too, and only reached the
    perfectly good local BookSprites copy after that round trip had failed. Every
    pack is now tried locally before the network is touched at all, so the remote
    entries are what they were meant to be: a last resort for art this install
    does not have in any pack. */
export function tileSpriteChain(image: string): { url: string; className: string }[] {
    const cls = (f: string) => 'tile-sprite ' + SPRITE_CLASS[f];
    return [
        ...TILE_SPRITE_FOLDERS.map((f) => ({ url: IMG_BASE + f + '/' + image, className: cls(f) })),
        ...TILE_SPRITE_FOLDERS.map((f) => ({
            url: GITHUB_RAW + '/images/' + f + '/' + image, className: cls(f),
        })),
    ];
}

export function stripMegaSuffix(name: string): string {
    return name.replace(/\s*\(Mega[^)]*\)/, '');
}

export function megaStoneUrl(stone: string): { local: string; remote: string } {
    const file = stone.toLowerCase().replace(/ /g, '-') + '.png';
    return { local: IMG_BASE + 'ItemSprites/' + file, remote: GITHUB_RAW + '/images/ItemSprites/' + file };
}

export interface SpriteFrame { scale: number; offsetX: number; offsetY: number }

/* Per-sprite zoom and offset, from the measurements in sprite-frames-db.js.
   Three numbers per sprite, in thousandths of the square the canvas is drawn
   into: the art's centre offset, then the radius of the circle around that
   centre holding the whole silhouette.

   The sprite is object-fit: contain into the well, so the canvas's longest side
   measures exactly `well` before the transform, and every stored fraction is a
   fraction of that. Offsets come out in final px because translate is applied
   after scale. */
export function boxSpriteFrame(
    image: string | undefined, type: string, well: number, frames: SpriteFrames | undefined,
): SpriteFrame {
    const dflt = BOX_SPRITE_FRAME[type] || { scale: 1, offsetY: 0 };
    const table = (frames && (frames as unknown as Record<string, Record<string, [number, number, number]>>)[type]) || null;
    const f = (table && image) ? table[image] : null;
    if (!f) return { scale: dflt.scale, offsetX: 0, offsetY: dflt.offsetY };

    const base = well;
    const cx = f[0] / 1000, cy = f[1] / 1000;
    /* the art's own radius, as a fraction of the well's radius, at 1x */
    const reach = (f[2] / 1000) * base / (well / 2);
    if (!(reach > 0)) return { scale: dflt.scale, offsetX: 0, offsetY: dflt.offsetY };

    const scale = SPRITE_FIT_TARGET / reach;
    return { scale, offsetX: -cx * base * scale, offsetY: -cy * base * scale };
}

/** Which sprite set a team slot draws, honouring a blocked pack and the
    Custom set's stand-in. */
export function standInType(image: string | undefined, preview: MonPreview): string {
    const type = (preview.spriteType as SpriteType | undefined) || 'Home';
    return usableSpriteType(image, type === 'Custom'
        ? ((preview.fallbackType as string) || 'Home') : type);
}
