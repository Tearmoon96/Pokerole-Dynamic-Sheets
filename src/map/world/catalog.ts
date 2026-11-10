import type { Pen, Rect } from './looks';
import { darken } from './looks';
import { building, crossSign, emblem, shrine, textSign, tower } from './buildings';
import type { BuildingSpec } from './buildings';
import * as M from './medieval';
import * as N from './modern';
import {
    bench, bush, crates, fence, flowers, fountain, hedge, lamp, mailbox, pine, rock, signpost, stall, statue, tree, well,
} from './props';
import {
    archGate, barrel, bridge, busStop, cabin, cactus, cafeTable, campfire, cart, chapel, deadTree, dock, flagpole, grassTuft,
    greenhouse, hydrant, lighthouse, log, museum, mushrooms, noticeBoard, palm, picnicTable, planter, pond, station, stump,
    tent, torii, trashCan, vending, windmill,
} from './props2';
import * as F from './interior';
import * as G from './garden';

/* What a city can be built from (the World Builder's city builder).

   An item stands on a FOOTPRINT of whole cells (`w` x `h`) and is drawn as a
   SPRITE that may be wider (`sw`) and is usually taller (`sh`), anchored to
   the footprint's bottom edge and centred on it: a roof overhangs the street
   behind it, a tree's crown the path beside it. Depth goes by the footprint's
   bottom edge (placed.ts), never by the sprite.

   The slug is storage — saved in every city — so slugs are append-only;
   rename the display name instead. Colours are slots the GM can change one
   by one in the inspector; their defaults are here. */

export type ItemGroup = 'building' | 'nature' | 'garden' | 'street' | 'furniture' | 'kitchen' | 'shop';

export interface ColorSlot { name: string; value: string }

export type Painter = (p: Pen, r: Rect, colors: string[], rot: boolean, variant: number) => void;

/** One of an item's looks: same colour slots, maybe another size. */
export interface Variant {
    name: string;
    w?: number;
    h?: number;
    sw?: number;
    sh?: number;
    /** Default colours for this variant, slot by slot. */
    colors?: string[];
    /** Colour slots this variant has nothing to paint with (a keep with no
        roof): the inspector leaves their pickers out. */
    skip?: number[];
}

/** Which kind of town a thing belongs in; absent fits both. */
export type Era = 'modern' | 'medieval';

export interface ItemDef {
    slug: string;
    name: string;
    group: ItemGroup;
    icon: string;
    w: number;
    h: number;
    /** Sprite width, cells; the footprint's when absent. */
    sw?: number;
    /** Sprite height, cells. */
    sh: number;
    /** Lies flat on the ground: drawn under everything that stands, never sorted. */
    floor?: boolean;
    /** The quarter-turned footprint and sprite, for things that offer it. */
    turned?: { w: number; h: number; sw?: number; sh: number };
    colors: ColorSlot[];
    /** 2-3 versions of the same thing; `MapPlaced.variant` picks one. */
    variants?: Variant[];
    era?: Era;
    /** A building: it can open an interior of its own. */
    enterable?: boolean;
    paint: Painter;
}

/** Where a group is offered: in cities, in interiors, or both. */
export const ITEM_GROUPS: { key: ItemGroup; label: string; where: ('city' | 'interior')[] }[] = [
    { key: 'building', label: 'Buildings', where: ['city'] },
    { key: 'nature', label: 'Nature', where: ['city', 'interior'] },
    { key: 'garden', label: 'Garden', where: ['city', 'interior'] },
    { key: 'street', label: 'Street', where: ['city'] },
    { key: 'furniture', label: 'Furniture', where: ['interior'] },
    { key: 'kitchen', label: 'Kitchen & bath', where: ['interior'] },
    { key: 'shop', label: 'Shops & storage', where: ['interior', 'city'] },
];

/** The groups a map of this kind offers. */
export function groupsFor(kind: 'world' | 'city' | 'interior') {
    return ITEM_GROUPS.filter((g) => g.where.includes(kind === 'interior' ? 'interior' : 'city'));
}

/* Street things that belong in a garden too (2026-11-10: gardens inside
   interiors). A city keeps them under Street; an interior, which has no
   Street, offers them under Garden. */
const GARDEN_TOO = new Set([
    'lamp', 'bench', 'fence', 'mailbox', 'fountain', 'well', 'statue', 'picnic-table', 'cafe-table', 'planter',
    'campfire', 'bridge', 'dock', 'woodpile', 'scarecrow', 'beehive', 'stone-wall', 'trough', 'brazier', 'wayside', 'torii',
]);

/** The group an item is offered under on a map of this kind. */
export function groupOf(d: ItemDef, kind: 'world' | 'city' | 'interior'): ItemGroup {
    return kind === 'interior' && GARDEN_TOO.has(d.slug) ? 'garden' : d.group;
}

const C = (name: string, value: string): ColorSlot => ({ name, value });
const V = (name: string, more: Omit<Variant, 'name'> = {}): Variant => ({ name, ...more });
/** A building drawn by `building()`, one spec per variant. */
const specs = (...fs: ((c: string[]) => BuildingSpec)[]): Painter => (p, r, c, _rot, v) => building(p, r, (fs[v] ?? fs[0])(c));
const ROOF = (v: string) => C('Roof', v);
const WALL = (v: string) => C('Walls', v);

export const ITEMS: ItemDef[] = [
    /* ---------------------------------------------------------- buildings
       Every building has 2-3 variants (owner's request, 2026-11-08); the
       first is always the one the catalogue had before, so saved cities
       keep their look. `era` sorts them into the Modern and Medieval sets. */
    {
        slug: 'cottage', name: 'Cottage', group: 'building', icon: 'fa-house', w: 3, h: 2, sh: 3.8, enterable: true, era: 'modern',
        colors: [ROOF('#c8503a'), WALL('#f0e2c4'), C('Door', '#8a5636')],
        variants: [V('Gable'), V('With porch'), V('Shutters & flowers')],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', windows: 2 }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', windows: 2, porch: roof, wallMat: 'siding' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'hip', windows: 2, shutters: '#4a7a9a', boxes: '#e05080', roofMat: 'tile' }),
        ),
    },
    {
        slug: 'house', name: 'House', group: 'building', icon: 'fa-house-chimney', w: 4, h: 3, sh: 5, enterable: true, era: 'modern',
        colors: [ROOF('#3e6c9c'), WALL('#ead9b0'), C('Door', '#8a5636')],
        variants: [V('Classic'), V('With garage'), V('Modern', { sh: 4.6, colors: ['#5a5a62', '#f4f4f0', '#3a3a40'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', chimney: true }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'cross', windows: 3, garage: '#e8e4dc', wallMat: 'siding' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'flat', windowKind: 'wide', windows: 2, wallH: 2.1, trim: '#8a8a90' }),
        ),
    },
    {
        slug: 'townhouse', name: 'Two-storey house', group: 'building', icon: 'fa-house-chimney-window', w: 5, h: 3, sh: 6.2, enterable: true, era: 'modern',
        colors: [ROOF('#5a7a3a'), WALL('#e8dcc8'), C('Door', '#6a4a8a')],
        variants: [V('Hip roof'), V('Brick, dormers', { colors: ['#4a4a58', '#b0603e', '#2a3a5a'] }), V('With balcony')],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'hip', chimney: true }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'mansard', roofMat: 'slate', wallMat: 'brick', dormers: 2, trim: '#e8dcc8', chimney: true, chimney2: true }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'gable', balcony: true, windowKind: 'tall', shutters: '#5a8a5a', roofMat: 'tile' }),
        ),
    },
    {
        slug: 'shop', name: 'Shop', group: 'building', icon: 'fa-shop', w: 4, h: 3, sh: 4.9, enterable: true, era: 'modern',
        colors: [ROOF('#8a5a3a'), WALL('#f4ead8'), C('Awning', '#d04848')],
        variants: [V('Awning'), V('Shop window'), V('Brick corner shop', { sh: 6.2, colors: ['', '#b8664a'] })],
        paint: specs(
            ([roof, wall, aw]) => ({ roof, wall, floors: 1, roofKind: 'gable', awning: aw, door_: 'glass', windows: 2 }),
            ([roof, wall, aw]) => ({ roof, wall, floors: 1, roofKind: 'flat', storefront: true, door_: 'glass', accent: aw, wallH: 2.0 }),
            ([roof, wall, aw]) => ({ roof, wall, floors: 2, roofKind: 'flat', storefront: true, door_: 'glass', accent: aw, wallMat: 'brick', trim: '#e8dcc8', windows: 3 }),
        ),
    },
    {
        slug: 'pokemon-center', name: 'Pokémon Center', group: 'building', icon: 'fa-kit-medical', w: 6, h: 4, sh: 6, enterable: true, era: 'modern',
        colors: [ROOF('#d8463c'), WALL('#f6f2ec'), C('Sign', '#d8463c')],
        variants: [V('Classic'), V('Glass front'), V('Small', { w: 4, h: 3, sh: 4.8 })],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'hip', door_: 'glass', windows: 4, wallH: 2.2, sign: (q, cx, y) => crossSign(q, cx, y, sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'flat', door_: 'glass', storefront: true, accent: sign, windowKind: 'wide', windows: 3, sign: (q, cx, y) => crossSign(q, cx, y, sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'gable', door_: 'glass', windows: 2, wallH: 1.9, sign: (q, cx, y) => crossSign(q, cx, y, sign) }),
        ),
    },
    {
        slug: 'poke-mart', name: 'Poké Mart', group: 'building', icon: 'fa-store', w: 5, h: 3, sh: 5, enterable: true, era: 'modern',
        colors: [ROOF('#3a6ad0'), WALL('#f6f2ec'), C('Sign', '#3a6ad0')],
        variants: [V('Classic'), V('Big store', { w: 7, h: 4, sh: 6.4 }), V('Corner kiosk', { w: 3, h: 2, sh: 3.8 })],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'flat', door_: 'glass', windows: 3, wallH: 2.1, sign: (q, cx, y) => textSign(q, cx, y, 'MART', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'flat', door_: 'glass', storefront: true, accent: sign, windowKind: 'wide', windows: 4, sign: (q, cx, y) => textSign(q, cx, y, 'MART', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'gable', door_: 'glass', windows: 1, awning: sign, wallH: 1.8, sign: (q, cx, y) => textSign(q, cx, y, 'MART', sign) }),
        ),
    },
    {
        slug: 'gym', name: 'Gym', group: 'building', icon: 'fa-medal', w: 7, h: 5, sh: 6.6, enterable: true, era: 'modern',
        colors: [ROOF('#7a5ac0'), WALL('#e8e2d8'), C('Emblem', '#e0a030')],
        variants: [V('Classic'), V('Dome'), V('Arena with columns')],
        paint: specs(
            ([roof, wall, em]) => ({ roof, wall, floors: 1, roofKind: 'hip', door_: 'glass', windows: 4, wallH: 2.4, sign: (q, cx, y) => emblem(q, cx, y, em) }),
            ([roof, wall, em]) => ({ roof, wall, floors: 1, roofKind: 'dome', door_: 'glass', windows: 4, wallH: 2.4, windowKind: 'tall', sign: (q, cx, y) => emblem(q, cx, y, em) }),
            ([roof, wall, em]) => ({ roof, wall, floors: 1, roofKind: 'flat', door_: 'double', windows: 0, wallH: 2.6, columns: 6, sign: (q, cx, y) => emblem(q, cx, y, em) }),
        ),
    },
    {
        slug: 'lab', name: 'Laboratory', group: 'building', icon: 'fa-flask', w: 6, h: 4, sh: 5.2, enterable: true, era: 'modern',
        colors: [ROOF('#9aa8b0'), WALL('#f2f4f6'), C('Sign', '#3aa0a0')],
        variants: [V('Flat roof'), V('With observatory', { sh: 6.4 }), V('Glass wing')],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'flat', door_: 'glass', windows: 4, wallH: 2.2, trim: '#c8d0d4', sign: (q, cx, y) => textSign(q, cx, y, 'LAB', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'flat', door_: 'glass', windows: 3, wallH: 2.2, trim: '#c8d0d4', annex: { side: 'right', w: 2.4, roofKind: 'dome', wallH: 3.0, windows: 1, windowKind: 'round' }, sign: (q, cx, y) => textSign(q, cx, y, 'LAB', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'flat', door_: 'glass', windows: 3, trim: '#c8d0d4', annex: { side: 'left', w: 2.2, wallMat: 'glass', wallH: 2.0 }, sign: (q, cx, y) => textSign(q, cx, y, 'LAB', sign) }),
        ),
    },
    {
        slug: 'apartments', name: 'Apartments', group: 'building', icon: 'fa-building', w: 4, h: 3, sh: 7, enterable: true, era: 'modern',
        colors: [ROOF('#6a6a7a'), WALL('#d8c8b0'), C('Door', '#5a4a3a')],
        variants: [V('Three storeys'), V('Balconies', { sh: 8.4 }), V('Brick block', { w: 5, colors: ['#4a4a52', '#a85a40', '#3a3a40'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 3, roofKind: 'flat', door_: 'glass' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 4, roofKind: 'flat', door_: 'glass', balcony: true, windowKind: 'tall' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 3, roofKind: 'flat', door_: 'glass', wallMat: 'brick', trim: '#e8dcc8', windows: 4 }),
        ),
    },
    {
        slug: 'tower', name: 'Tower', group: 'building', icon: 'fa-chess-rook', w: 3, h: 3, sh: 8.4, enterable: true,
        colors: [ROOF('#6a4a8a'), WALL('#c8c0b0')],
        variants: [V('Cone roof'), V('Onion dome', { colors: ['#3a8a7a'] }), V('Observatory', { colors: ['#9aa8b8'] })],
        paint: (p, r, [roof, wall], _rot, v) => tower(p, r, roof, wall, v),
    },
    {
        slug: 'barn', name: 'Barn', group: 'building', icon: 'fa-warehouse', w: 5, h: 4, sh: 5.4, enterable: true,
        colors: [ROOF('#6a4a3a'), WALL('#b84a3a'), C('Door', '#f0e8d8')],
        variants: [V('Red barn'), V('Gambrel roof'), V('Stone barn', { colors: ['#8a6a4a', '#a8a090', '#7a5a3a'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', door_: 'barn', windows: 2, wallH: 2.3, trim: '#f0e8d8' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'mansard', roofMat: 'metal', door_: 'barn', windows: 2, wallH: 2.3, trim: '#f0e8d8', wallMat: 'planks' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'thatch', door_: 'barn', windows: 2, wallH: 2.3, wallMat: 'stone', trim: '#5a4a3a' }),
        ),
    },
    {
        slug: 'shrine', name: 'Shrine', group: 'building', icon: 'fa-torii-gate', w: 3, h: 2, sh: 3.6, enterable: true,
        colors: [ROOF('#3a3a4a'), C('Posts', '#c8443a')],
        variants: [V('Small'), V('With lanterns', { w: 4, sh: 3.6 }), V('Two roofs', { sh: 4.6 })],
        paint: (p, r, [roof, posts], _rot, v) => shrine(p, r, roof, posts, v),
    },
    {
        slug: 'chapel', name: 'Chapel', group: 'building', icon: 'fa-church', w: 4, h: 3, sh: 6.6, enterable: true,
        colors: [ROOF('#4a5a7a'), WALL('#efe6d4')],
        variants: [V('Steeple'), V('Brick', { colors: ['#4a4a58', '#a85a40'] }), V('Bell on the ridge', { sh: 5 })],
        paint: (p, r, c, rot, v) => chapel(p, r, c, rot, v),
    },
    {
        slug: 'school', name: 'School', group: 'building', icon: 'fa-school', w: 6, h: 3, sh: 6.4, enterable: true, era: 'modern',
        colors: [ROOF('#b05a3a'), WALL('#f0e0c0'), C('Door', '#5a7ab0')],
        variants: [V('Hip roof'), V('Brick with clock', { colors: ['', '#b8664a'] }), V('Modern', { colors: ['#5a6068', '#f4f4f0', '#3a7ab0'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'hip', door_: 'glass', windows: 5 }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'cross', roofMat: 'slate', wallMat: 'brick', door_: 'double', windows: 5, windowKind: 'tall', trim: '#f0e8d8' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'flat', door_: 'glass', windows: 4, windowKind: 'wide', annex: { side: 'left', w: 2, wallMat: 'glass', wallH: 1.9 } }),
        ),
    },
    {
        slug: 'hotel', name: 'Hotel', group: 'building', icon: 'fa-hotel', w: 5, h: 3, sh: 8, enterable: true, era: 'modern',
        colors: [ROOF('#7a3a4a'), WALL('#e8d8c0'), C('Sign', '#c8a040')],
        variants: [V('Three storeys'), V('Tall, balconies', { sh: 9.4 }), V('Resort', { w: 7, sh: 6.4 })],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 3, roofKind: 'flat', door_: 'glass', windows: 4, sign: (q, cx, y) => textSign(q, cx, y, 'HOTEL', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 4, roofKind: 'flat', door_: 'glass', windows: 4, balcony: true, windowKind: 'tall', sign: (q, cx, y) => textSign(q, cx, y, 'HOTEL', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'hip', roofMat: 'tile', door_: 'glass', windows: 6, balcony: true, porch: roof, sign: (q, cx, y) => textSign(q, cx, y, 'HOTEL', sign) }),
        ),
    },
    {
        slug: 'cafe', name: 'Café', group: 'building', icon: 'fa-mug-hot', w: 4, h: 3, sh: 4.9, enterable: true, era: 'modern',
        colors: [ROOF('#5a3a2a'), WALL('#f4e4cc'), C('Awning', '#2a8a6a')],
        variants: [V('Awning'), V('Brick, big windows', { colors: ['', '#a85a40'] }), V('Two storeys', { sh: 6.2 })],
        paint: specs(
            ([roof, wall, aw]) => ({ roof, wall, floors: 1, roofKind: 'hip', awning: aw, door_: 'glass', windows: 2 }),
            ([roof, wall, aw]) => ({ roof, wall, floors: 1, roofKind: 'flat', storefront: true, accent: aw, door_: 'glass', wallMat: 'brick', trim: '#e8dcc8', wallH: 2.1 }),
            ([roof, wall, aw]) => ({ roof, wall, floors: 2, roofKind: 'gable', roofMat: 'tile', awning: aw, door_: 'glass', windows: 3, shutters: aw, boxes: '#f0a0c0' }),
        ),
    },
    {
        slug: 'museum', name: 'Museum', group: 'building', icon: 'fa-building-columns', w: 6, h: 4, sh: 5.4, enterable: true, era: 'modern',
        colors: [ROOF('#8a8478'), WALL('#e8e0d0')],
        variants: [V('Portico'), V('Dome', { sh: 6.4, colors: ['#5a8a7a'] }), V('Glass', { sh: 6, colors: ['', '#e8ecf0'] })],
        paint: (p, r, c, rot, v) => museum(p, r, c, rot, v),
    },
    {
        slug: 'station', name: 'Station', group: 'building', icon: 'fa-train', w: 7, h: 3, sh: 5.4, enterable: true, era: 'modern',
        colors: [ROOF('#3a5a4a'), WALL('#d8c8a8')],
        variants: [V('Classic'), V('Brick hall', { sh: 6 }), V('Glass', { colors: ['', '#b8d8e8'] })],
        paint: (p, r, c, rot, v) => station(p, r, c, rot, v),
    },
    {
        slug: 'warehouse', name: 'Warehouse', group: 'building', icon: 'fa-warehouse', w: 6, h: 4, sh: 5, enterable: true, era: 'modern',
        colors: [ROOF('#7a8088'), WALL('#a8a098'), C('Door', '#5a6068')],
        variants: [V('Flat roof'), V('Metal shed'), V('Brick', { colors: ['#5a5a62', '#a85a40', '#4a5a6a'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'flat', door_: 'barn', windows: 2, wallH: 2.4, trim: '#6a6a70' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'metal', wallMat: 'siding', door_: 'barn', windows: 2, wallH: 2.4, trim: '#6a6a70' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'flat', wallMat: 'brick', door_: 'barn', windows: 4, windowKind: 'arched', trim: '#e8dcc8' }),
        ),
    },
    {
        slug: 'cabin', name: 'Log cabin', group: 'building', icon: 'fa-house-chimney', w: 3, h: 2, sh: 3.9, enterable: true,
        colors: [ROOF('#5a4a3a'), C('Logs', '#9a6a40')],
        variants: [V('Cabin'), V('With porch'), V('With woodshed', { w: 4 })],
        paint: (p, r, c, rot, v) => cabin(p, r, c, rot, v),
    },
    {
        slug: 'lighthouse', name: 'Lighthouse', group: 'building', icon: 'fa-tower-broadcast', w: 2, h: 2, sh: 7.5, enterable: true,
        colors: [C('Stripes', '#d04040'), WALL('#f4f0e8')],
        variants: [V('Striped'), V('Painted base'), V('Stone', { colors: ['#4a4a52', '#c8c0b0'] })],
        paint: (p, r, c, rot, v) => lighthouse(p, r, c, rot, v),
    },
    {
        slug: 'windmill', name: 'Windmill', group: 'building', icon: 'fa-fan', w: 3, h: 3, sh: 6.2, enterable: true,
        colors: [ROOF('#7a4a3a'), WALL('#e8dcc4'), C('Sails', '#f4ecdc')],
        variants: [V('Plastered'), V('Stone', { colors: ['#5a4a3a', '#b0a898'] }), V('Wooden, gallery', { colors: ['#4a4a52', '#7a5a3a'] })],
        paint: (p, r, c, rot, v) => windmill(p, r, c, rot, v),
    },
    {
        slug: 'greenhouse', name: 'Greenhouse', group: 'building', icon: 'fa-seedling', w: 4, h: 3, sh: 3.8, enterable: true,
        colors: [C('Frame', '#f4f4f0'), C('Plants', '#4a9a4a')],
        variants: [V('Glasshouse'), V('Polytunnel'), V('Small', { w: 3, h: 2, sh: 3.4 })],
        paint: (p, r, c, rot, v) => greenhouse(p, r, c, rot, v === 2 ? 0 : v),
    },
    {
        slug: 'daycare', name: 'Day Care', group: 'building', icon: 'fa-egg', w: 5, h: 3, sh: 5, enterable: true, era: 'modern',
        colors: [ROOF('#d088b0'), WALL('#fbf0e8'), C('Door', '#a86090')],
        variants: [V('Gable'), V('With porch'), V('Two storeys', { sh: 6.2 })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', windows: 3, chimney: true }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'cross', windows: 3, porch: roof, boxes: '#f0d040', wallMat: 'siding' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'hip', windows: 3, shutters: door, chimney: true }),
        ),
    },
    {
        slug: 'contest-hall', name: 'Contest Hall', group: 'building', icon: 'fa-star', w: 7, h: 4, sh: 6.2, enterable: true, era: 'modern',
        colors: [ROOF('#e0609a'), WALL('#fbf4f0'), C('Emblem', '#f0c040')],
        variants: [V('Hip roof'), V('Dome', { sh: 7 }), V('Columns')],
        paint: specs(
            ([roof, wall, em]) => ({ roof, wall, floors: 1, roofKind: 'hip', door_: 'glass', windows: 4, wallH: 2.4, sign: (q, cx, y) => emblem(q, cx, y, em) }),
            ([roof, wall, em]) => ({ roof, wall, floors: 1, roofKind: 'dome', door_: 'glass', windows: 4, wallH: 2.4, windowKind: 'arched', sign: (q, cx, y) => emblem(q, cx, y, em) }),
            ([roof, wall, em]) => ({ roof, wall, floors: 1, roofKind: 'hip', roofMat: 'tile', door_: 'double', windows: 0, wallH: 2.6, columns: 7, sign: (q, cx, y) => emblem(q, cx, y, em) }),
        ),
    },
    {
        slug: 'battle-tower', name: 'Battle Tower', group: 'building', icon: 'fa-building-flag', w: 5, h: 4, sh: 10, enterable: true, era: 'modern',
        colors: [ROOF('#5a4a8a'), WALL('#d8d4e4'), C('Emblem', '#e0a030')],
        variants: [V('Five storeys'), V('Glass', { sh: 11, colors: ['', '#a8c8e0'] }), V('Battlements')],
        paint: specs(
            ([roof, wall, em]) => ({ roof, wall, floors: 5, roofKind: 'flat', door_: 'glass', windows: 3, sign: (q, cx, y) => emblem(q, cx, y, em) }),
            ([roof, wall, em]) => ({ roof, wall, floors: 6, roofKind: 'flat', wallMat: 'glass', door_: 'glass', windows: 0, storefront: true, accent: roof, sign: (q, cx, y) => emblem(q, cx, y, em) }),
            ([roof, wall, em]) => ({ roof, wall, floors: 5, roofKind: 'crenel', wallMat: 'stone', door_: 'gate', windows: 2, windowKind: 'arched', sign: (q, cx, y) => emblem(q, cx, y, em) }),
        ),
    },
    {
        slug: 'tent', name: 'Tent', group: 'building', icon: 'fa-campground', w: 2, h: 2, sh: 2.4,
        colors: [C('Cloth', '#d07a3a')],
        variants: [V('Ridge tent'), V('Dome tent'), V('Pavilion', { w: 3, sh: 3.2, colors: ['#c83a3a'] })],
        paint: (p, r, c, rot, v) => tent(p, r, c, rot, v),
    },

    /* ------------------------------------------------- modern, 2026-11-08 */
    {
        slug: 'department-store', name: 'Department store', group: 'building', icon: 'fa-bag-shopping', w: 7, h: 4, sh: 8, enterable: true, era: 'modern',
        colors: [ROOF('#5a5a68'), WALL('#ece4d8'), C('Sign', '#d04878')],
        variants: [V('Classic'), V('Glass', { colors: ['', '#a8c8e0'] }), V('Arcade', { sh: 6.6 })],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 4, roofKind: 'flat', storefront: true, accent: sign, door_: 'glass', windows: 5, windowKind: 'wide', sign: (q, cx, y) => textSign(q, cx, y, 'DEPT', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 4, roofKind: 'flat', wallMat: 'glass', storefront: true, accent: sign, door_: 'glass', windows: 0, sign: (q, cx, y) => textSign(q, cx, y, 'DEPT', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 3, roofKind: 'mansard', roofMat: 'slate', dormers: 2, columns: 8, door_: 'double', windows: 5, windowKind: 'arched', accent: sign, sign: (q, cx, y) => textSign(q, cx, y, 'DEPT', sign) }),
        ),
    },
    {
        slug: 'office-tower', name: 'Office tower', group: 'building', icon: 'fa-city', w: 4, h: 3, sh: 11, enterable: true, era: 'modern',
        colors: [WALL('#d8dce0'), C('Glass', '#a8c8e0'), ROOF('#6a6a72')],
        variants: [V('Glass'), V('Concrete grid'), V('Stepped', { w: 5 })],
        paint: (p, r, c, rot, v) => N.officeTower(p, r, c, rot, v),
    },
    {
        slug: 'hospital', name: 'Hospital', group: 'building', icon: 'fa-hospital', w: 7, h: 4, sh: 7.6, enterable: true, era: 'modern',
        colors: [ROOF('#8a9aa8'), WALL('#f4f6f8'), C('Cross', '#d83a3a')],
        variants: [V('Main block'), V('With wing'), V('Clinic', { w: 4, h: 3, sh: 4.6 })],
        paint: specs(
            ([roof, wall, x]) => ({ roof, wall, floors: 4, roofKind: 'flat', door_: 'glass', windows: 5, windowKind: 'wide', trim: '#c8d0d8', sign: (q, cx, y) => crossSign(q, cx, y, x) }),
            ([roof, wall, x]) => ({ roof, wall, floors: 4, roofKind: 'flat', door_: 'glass', windows: 3, windowKind: 'wide', trim: '#c8d0d8', annex: { side: 'right', w: 2.6, floors: 2, wallH: 3.2, windows: 2 }, sign: (q, cx, y) => crossSign(q, cx, y, x) }),
            ([roof, wall, x]) => ({ roof, wall, floors: 1, roofKind: 'hip', door_: 'glass', windows: 2, wallH: 2.0, sign: (q, cx, y) => crossSign(q, cx, y, x) }),
        ),
    },
    {
        slug: 'police', name: 'Police station', group: 'building', icon: 'fa-shield-halved', w: 5, h: 3, sh: 6, enterable: true, era: 'modern',
        colors: [ROOF('#2a3a5a'), WALL('#e8e8ec'), C('Sign', '#2a4a8a')],
        variants: [V('Flat roof'), V('Brick', { colors: ['', '#a85a40'] }), V('Small post', { w: 3, h: 2, sh: 3.8 })],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'flat', door_: 'glass', windows: 4, trim: '#9aa0a8', sign: (q, cx, y) => textSign(q, cx, y, 'POLICE', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'hip', roofMat: 'slate', wallMat: 'brick', door_: 'double', windows: 4, trim: '#e8dcc8', sign: (q, cx, y) => textSign(q, cx, y, 'POLICE', sign) }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'gable', door_: 'glass', windows: 1, wallH: 1.9, sign: (q, cx, y) => textSign(q, cx, y, 'P', sign) }),
        ),
    },
    {
        slug: 'fire-station', name: 'Fire station', group: 'building', icon: 'fa-fire-extinguisher', w: 6, h: 4, sh: 6.4, enterable: true, era: 'modern',
        colors: [ROOF('#5a4a48'), WALL('#c8503a'), C('Doors', '#e8e4dc')],
        variants: [V('Two bays'), V('With tower', { sh: 8 }), V('Modern', { colors: ['', '#e8e8ec'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, floors: 2, roofKind: 'flat', wallMat: 'brick', door_: 'none', garage: door, windows: 3, trim: '#e8dcc8', annex: { side: 'left', w: 2.2, door_: 'none', garage: door, wallH: 3.0 } }),
            ([roof, wall, door]) => ({ roof, wall, floors: 2, roofKind: 'hip', wallMat: 'brick', door_: 'none', garage: door, windows: 2, trim: '#e8dcc8', annex: { side: 'left', w: 1.6, floors: 4, wallH: 6.2, windowKind: 'slit', roofKind: 'hip', door_: 'wood' } }),
            ([roof, wall, door]) => ({ roof, wall, floors: 2, roofKind: 'flat', door_: 'glass', garage: door, windows: 2, windowKind: 'wide', accent: wall }),
        ),
    },
    {
        slug: 'library', name: 'Library', group: 'building', icon: 'fa-book-open', w: 6, h: 4, sh: 6, enterable: true, era: 'modern',
        colors: [ROOF('#5a6a5a'), WALL('#e8e0cc'), C('Door', '#5a3a24')],
        variants: [V('Columns'), V('Brick', { colors: ['', '#a8604a'] }), V('Modern glass', { colors: ['', '#a8c8e0'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'hip', roofMat: 'slate', door_: 'double', windows: 0, wallH: 2.6, columns: 6 }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'gable', roofMat: 'slate', wallMat: 'brick', door_: 'arched', windows: 4, windowKind: 'arched', trim: '#e8dcc8', dormers: 2 }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'flat', wallMat: 'glass', door_: 'glass', windows: 0, storefront: true, accent: roof }),
        ),
    },
    {
        slug: 'post-office', name: 'Post office', group: 'building', icon: 'fa-envelopes-bulk', w: 4, h: 3, sh: 5, enterable: true, era: 'modern',
        colors: [ROOF('#a84a3a'), WALL('#f4ecd8'), C('Sign', '#e0a020')],
        variants: [V('Hip roof'), V('Brick', { colors: ['', '#b8664a'] }), V('Shopfront')],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'hip', door_: 'glass', windows: 2, sign: (q, cx, y) => textSign(q, cx, y, 'POST', sign, '#3a2a10') }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'gable', wallMat: 'brick', door_: 'double', windows: 2, windowKind: 'arched', trim: '#e8dcc8', sign: (q, cx, y) => textSign(q, cx, y, 'POST', sign, '#3a2a10') }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'flat', storefront: true, accent: sign, door_: 'glass', wallH: 2.0, sign: (q, cx, y) => textSign(q, cx, y, 'POST', sign, '#3a2a10') }),
        ),
    },
    {
        slug: 'restaurant', name: 'Restaurant', group: 'building', icon: 'fa-utensils', w: 5, h: 3, sh: 5, enterable: true, era: 'modern',
        colors: [ROOF('#7a2a2a'), WALL('#f4e8d0'), C('Awning', '#c83a3a')],
        variants: [V('Bistro'), V('Diner', { colors: ['#3a8aa0', '#f4f0e8', '#e04848'] }), V('Noodle bar', { colors: ['#2a2a30', '#e8d8b8', '#2a4a7a'] })],
        paint: specs(
            ([roof, wall, aw]) => ({ roof, wall, floors: 1, roofKind: 'gable', roofMat: 'tile', awning: aw, door_: 'glass', windows: 3, boxes: '#e05050', shutters: '#3a5a3a' }),
            ([roof, wall, aw]) => ({ roof, wall, floors: 1, roofKind: 'flat', storefront: true, accent: aw, door_: 'glass', wallH: 1.9, wallMat: 'siding' }),
            ([roof, wall, aw]) => ({ roof, wall, floors: 1, roofKind: 'hip', roofMat: 'tile', awning: aw, door_: 'wood', windows: 2, wallMat: 'planks' }),
        ),
    },
    {
        slug: 'villa', name: 'Villa', group: 'building', icon: 'fa-house-flag', w: 6, h: 4, sh: 6, enterable: true, era: 'modern',
        colors: [ROOF('#c86a3a'), WALL('#f6ecd8'), C('Door', '#5a3a24')],
        variants: [V('Tiled roof'), V('White modern', { colors: ['#e8e8ec', '#fafafa', '#3a3a40'] }), V('Mansion', { w: 8, h: 5, sh: 7.4 })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'hip', roofMat: 'tile', windows: 4, balcony: true, shutters: '#4a7a6a', windowKind: 'tall' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'flat', windows: 2, windowKind: 'wide', balcony: true, trim: '#9a9aa0', annex: { side: 'left', w: 2.4, wallMat: 'glass', wallH: 2.0 } }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'hip', roofMat: 'slate', windows: 6, windowKind: 'tall', columns: 4, door_: 'double', dormers: 3, chimney: true, chimney2: true }),
        ),
    },
    {
        slug: 'bungalow', name: 'Bungalow', group: 'building', icon: 'fa-house', w: 4, h: 3, sh: 4.2, enterable: true, era: 'modern',
        colors: [ROOF('#5a6a7a'), WALL('#e0d8c8'), C('Door', '#3a6a8a')],
        variants: [V('Hip roof'), V('Beach house', { colors: ['#e8e0d0', '#7ac0d0', '#f4f0e8'] }), V('With carport', { w: 5 })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'hip', windows: 3, wallH: 1.7 }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'metal', wallMat: 'siding', windows: 2, porch: roof, wallH: 1.7 }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', windows: 2, wallH: 1.7, garage: '#d8d4cc', wallMat: 'siding' }),
        ),
    },
    {
        slug: 'factory', name: 'Factory', group: 'building', icon: 'fa-industry', w: 7, h: 4, sh: 6.4, enterable: true, era: 'modern',
        colors: [WALL('#b8a898'), ROOF('#7a8088'), C('Chimney', '#a85a40')],
        variants: [V('Saw-tooth roof'), V('Big shed'), V('Plant with tanks')],
        paint: (p, r, c, rot, v) => N.factory(p, r, c, rot, v),
    },
    {
        slug: 'fuel-station', name: 'Petrol station', group: 'building', icon: 'fa-gas-pump', w: 6, h: 3, sh: 4.4, enterable: true, era: 'modern',
        colors: [C('Canopy', '#d83a3a'), WALL('#f4f4f0'), C('Pumps', '#3a6ab0')],
        variants: [V('Pumps and shop'), V('One pump', { w: 3, h: 2, sh: 3.4 }), V('Charging station', { colors: ['#3aa070', '#f4f4f0', '#2a8a5a'] })],
        paint: (p, r, c, rot, v) => N.fuelStation(p, r, c, rot, v),
    },
    {
        slug: 'game-corner', name: 'Game Corner', group: 'building', icon: 'fa-dice', w: 6, h: 4, sh: 5.6, enterable: true, era: 'modern',
        colors: [ROOF('#3a2a5a'), WALL('#2a2a3a'), C('Lights', '#f0c040')],
        variants: [V('Neon front'), V('Marquee'), V('Tower sign', { sh: 7 })],
        paint: specs(
            ([roof, wall, l]) => ({ roof, wall, floors: 1, roofKind: 'flat', storefront: true, accent: l, door_: 'glass', wallH: 2.4, sign: (q, cx, y) => textSign(q, cx, y, 'GAME', l, '#2a1a3a') }),
            ([roof, wall, l]) => ({ roof, wall, floors: 1, roofKind: 'flat', awning: l, door_: 'double', door: '#c83a3a', windows: 2, wallH: 2.4, sign: (q, cx, y) => textSign(q, cx, y, 'SLOTS', l, '#2a1a3a') }),
            ([roof, wall, l]) => ({ roof, wall, floors: 2, roofKind: 'flat', storefront: true, accent: l, door_: 'glass', windows: 3, sign: (q, cx, y) => { textSign(q, cx, y - 0.9 * q.u, 'GAME', l, '#2a1a3a'); q.glow(cx, y - 1.2 * q.u, 2.4 * q.u); } }),
        ),
    },

    /* ----------------------------------------------- medieval, 2026-11-08 */
    {
        slug: 'hut', name: 'Peasant hut', group: 'building', icon: 'fa-house-chimney-crack', w: 3, h: 2, sh: 3.4, enterable: true, era: 'medieval',
        colors: [ROOF('#c8a860'), WALL('#c8b490'), C('Door', '#6a4a2a')],
        variants: [V('Wattle and thatch'), V('With lean-to', { w: 4 }), V('Plank walls', { colors: ['', '#8a6a48'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'timber', windows: 1, wallH: 1.6, door_: 'arched', windowKind: 'slit', trim: '#5a4028' }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'timber', windows: 1, wallH: 1.6, door_: 'arched', trim: '#5a4028', annex: { side: 'right', w: 1.4, wallMat: 'planks', roofMat: 'shingle', wallH: 1.2 } }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'planks', windows: 1, wallH: 1.6, door_: 'arched', shutters: '#5a4028', trim: '#4a3020' }),
        ),
    },
    {
        slug: 'round-hut', name: 'Round hut', group: 'building', icon: 'fa-igloo', w: 3, h: 2, sh: 3.4, enterable: true, era: 'medieval',
        colors: [C('Thatch', '#c8a860'), WALL('#b89a70')],
        variants: [V('One hut'), V('Two huts', { w: 4 }), V('Stone footings')],
        paint: (p, r, c, rot, v) => M.roundHut(p, r, c, rot, v),
    },
    {
        slug: 'medieval-cottage', name: 'Cottage (medieval)', group: 'building', icon: 'fa-house', w: 4, h: 3, sh: 4.6, enterable: true, era: 'medieval',
        colors: [ROOF('#c8a860'), WALL('#efe2c4'), C('Beams', '#4a3020')],
        variants: [V('Thatch, timber'), V('Stone, thatch', { colors: ['', '#b8ac98'] }), V('Timber, tiles', { colors: ['#b0503a'] })],
        paint: specs(
            ([roof, wall, beam]) => ({ roof, wall, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'timber', trim: beam, windowKind: 'leaded', windows: 2, door_: 'arched', chimney: true, boxes: '#e05080' }),
            ([roof, wall, beam]) => ({ roof, wall, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'stone', trim: beam, windowKind: 'leaded', windows: 2, door_: 'arched', shutters: '#5a7a4a', chimney: true }),
            ([roof, wall, beam]) => ({ roof, wall, floors: 1, roofKind: 'cross', roofMat: 'tile', wallMat: 'timber', trim: beam, windowKind: 'leaded', windows: 2, door_: 'arched', chimney: true }),
        ),
    },
    {
        slug: 'timber-house', name: 'Timber-framed house', group: 'building', icon: 'fa-house-chimney-window', w: 4, h: 3, sh: 6.4, enterable: true, era: 'medieval',
        colors: [ROOF('#8a4a3a'), WALL('#f0e4c8'), C('Beams', '#4a3020')],
        variants: [V('Jettied, two storeys'), V('Narrow, three storeys', { w: 3, sh: 7.6 }), V('Stone below, timber above')],
        paint: specs(
            ([roof, wall, beam]) => ({ roof, wall, floors: 2, roofKind: 'gable', roofMat: 'tile', wallMat: 'timber', trim: beam, jetty: true, windowKind: 'leaded', windows: 2, door_: 'arched', chimney: true }),
            ([roof, wall, beam]) => ({ roof, wall, floors: 3, roofKind: 'cross', roofMat: 'slate', wallMat: 'timber', trim: beam, jetty: true, windowKind: 'leaded', windows: 2, door_: 'arched' }),
            ([roof, wall, beam]) => ({ roof, wall, floors: 2, roofKind: 'gable', roofMat: 'shingle', wallMat: 'timber', lowerMat: 'stone', lowerWall: '#b8ac98', trim: beam, windowKind: 'leaded', windows: 3, door_: 'arched', boxes: '#e0a030', chimney: true }),
        ),
    },
    {
        slug: 'tavern', name: 'Tavern', group: 'building', icon: 'fa-beer-mug-empty', w: 5, h: 3, sh: 6.4, enterable: true, era: 'medieval',
        colors: [ROOF('#6a4a3a'), WALL('#efe2c4'), C('Sign', '#c8a060')],
        variants: [V('Inn, two storeys'), V('Small tavern', { w: 4, sh: 4.8, colors: ['', '#b8ac98'] }), V('Coaching inn', { w: 7, h: 4, sh: 6.8 })],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'gable', roofMat: 'shingle', wallMat: 'timber', jetty: true, windowKind: 'leaded', windows: 3, door_: 'arched', hangSign: sign, hangIcon: 'mug', chimney: true, chimney2: true }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'gable', roofMat: 'thatch', wallMat: 'stone', windowKind: 'leaded', windows: 2, door_: 'arched', hangSign: sign, hangIcon: 'mug', chimney: true }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'cross', roofMat: 'tile', wallMat: 'timber', lowerMat: 'stone', lowerWall: '#b8ac98', windowKind: 'leaded', windows: 4, door_: 'double', hangSign: sign, hangIcon: 'bed', chimney: true, annex: { side: 'right', w: 2.2, wallMat: 'planks', roofMat: 'thatch', door_: 'barn', wallH: 2.0, windows: 0 } }),
        ),
    },
    {
        slug: 'smithy', name: 'Blacksmith', group: 'building', icon: 'fa-hammer', w: 5, h: 3, sh: 5, enterable: true, era: 'medieval',
        colors: [ROOF('#5a4a3a'), WALL('#efe2c4'), C('Fire', '#f07a20')],
        variants: [V('Forge and house'), V('Stone smithy', { colors: ['#4a4a52', '#b8ac98'] }), V('Open forge', { w: 3, sh: 3.4 })],
        paint: (p, r, c, rot, v) => M.smithy(p, r, c, rot, v),
    },
    {
        slug: 'bakery', name: 'Bakery', group: 'building', icon: 'fa-bread-slice', w: 4, h: 3, sh: 5.6, enterable: true, era: 'medieval',
        colors: [ROOF('#a8603a'), WALL('#f4e6c8'), C('Sign', '#d8a050')],
        variants: [V('Timber'), V('Stone with oven', { colors: ['', '#c0b4a0'] }), V('Shop window')],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'gable', roofMat: 'tile', wallMat: 'timber', windowKind: 'leaded', windows: 2, door_: 'arched', hangSign: sign, hangIcon: 'bread', chimney: true }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 1, roofKind: 'gable', roofMat: 'slate', wallMat: 'stone', windowKind: 'arched', windows: 2, door_: 'arched', hangSign: sign, hangIcon: 'bread', chimney: true, chimney2: true }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'cross', roofMat: 'shingle', wallMat: 'timber', jetty: true, awning: sign, windowKind: 'leaded', windows: 2, door_: 'arched' }),
        ),
    },
    {
        slug: 'apothecary', name: 'Apothecary', group: 'building', icon: 'fa-flask-vial', w: 3, h: 3, sh: 6, enterable: true, era: 'medieval',
        colors: [ROOF('#3a5a4a'), WALL('#e8e0d0'), C('Sign', '#7ab0a0')],
        variants: [V('Narrow, timber'), V('Stone, round window', { colors: ['', '#b8b0a0'] }), V('Tower shop', { sh: 7.4 })],
        paint: specs(
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'gable', roofMat: 'slate', wallMat: 'timber', jetty: true, windowKind: 'leaded', windows: 1, door_: 'arched', hangSign: sign, hangIcon: 'potion', boxes: '#a868c8' }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 2, roofKind: 'cross', roofMat: 'slate', wallMat: 'stone', windowKind: 'arched', windows: 1, door_: 'arched', hangSign: sign, hangIcon: 'potion' }),
            ([roof, wall, sign]) => ({ roof, wall, floors: 3, roofKind: 'hip', roofMat: 'slate', wallMat: 'timber', lowerMat: 'stone', lowerWall: '#b0a898', windowKind: 'round', windows: 1, door_: 'arched', hangSign: sign, hangIcon: 'potion', chimney: true }),
        ),
    },
    {
        slug: 'merchant-house', name: 'Merchant house', group: 'building', icon: 'fa-scale-balanced', w: 5, h: 3, sh: 7.2, enterable: true, era: 'medieval',
        colors: [ROOF('#4a4a5a'), WALL('#f0e4c8'), C('Shutters', '#6a3a3a')],
        variants: [V('Three storeys'), V('Stone, dormers', { colors: ['', '#c8bca8'] }), V('Shop below', { w: 6 })],
        paint: specs(
            ([roof, wall, sh]) => ({ roof, wall, floors: 3, roofKind: 'gable', roofMat: 'slate', wallMat: 'timber', jetty: true, windowKind: 'leaded', windows: 3, shutters: sh, door_: 'double', chimney: true }),
            ([roof, wall, sh]) => ({ roof, wall, floors: 2, roofKind: 'mansard', roofMat: 'slate', wallMat: 'stone', windowKind: 'tall', windows: 3, shutters: sh, door_: 'double', dormers: 3, chimney: true }),
            ([roof, wall, sh]) => ({ roof, wall, floors: 2, roofKind: 'gable', roofMat: 'tile', wallMat: 'timber', lowerMat: 'stone', lowerWall: '#b8ac98', windowKind: 'leaded', windows: 4, shutters: sh, door_: 'arched', awning: sh, hangSign: '#c8b088', hangIcon: 'key' }),
        ),
    },
    {
        slug: 'manor', name: 'Manor', group: 'building', icon: 'fa-chess-king', w: 8, h: 5, sh: 7.4, enterable: true, era: 'medieval',
        colors: [ROOF('#4a4a58'), WALL('#c8bca8'), C('Door', '#5a3020')],
        variants: [V('Stone manor'), V('With wing'), V('Timber hall', { colors: ['', '#f0e4c8'] })],
        paint: specs(
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'hip', roofMat: 'slate', wallMat: 'stone', windowKind: 'tall', windows: 5, door_: 'double', dormers: 3, chimney: true, chimney2: true, porch: roof }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'cross', roofMat: 'slate', wallMat: 'stone', windowKind: 'leaded', windows: 4, door_: 'double', chimney: true, annex: { side: 'left', w: 2.8, floors: 1, roofKind: 'gable', windows: 2 } }),
            ([roof, wall, door]) => ({ roof, wall, door, floors: 2, roofKind: 'gable', roofMat: 'tile', wallMat: 'timber', lowerMat: 'stone', lowerWall: '#b8ac98', jetty: true, windowKind: 'leaded', windows: 5, door_: 'double', chimney: true, chimney2: true }),
        ),
    },
    {
        slug: 'guild-hall', name: 'Town hall', group: 'building', icon: 'fa-landmark', w: 7, h: 4, sh: 8, enterable: true, era: 'medieval',
        colors: [ROOF('#7a3a3a'), WALL('#e8dcc0'), C('Banner', '#3a5aa0')],
        variants: [V('Bell tower', { sh: 9 }), V('Arcade below'), V('Stone hall', { colors: ['', '#c0b4a0'] })],
        paint: (p, r, c, rot, v) => {
            const [roof, wall, ban] = c;
            if (v === 1) { M.marketHall(p, r, [roof, '#4a3020', ban, wall], rot, 1); return; }
            const u = p.u;
            if (v === 0) {
                building(p, { x: r.x, y: r.y + 2.2 * u, w: r.w, h: r.h - 2.2 * u }, { roof, wall, floors: 2, roofKind: 'gable', roofMat: 'tile', wallMat: 'timber', lowerMat: 'stone', lowerWall: '#b8ac98', windowKind: 'leaded', windows: 4, door_: 'double',
                    sign: (q, cx, y) => { for (const dx of [-0.32, 0.32]) q.rect(cx + dx * r.w - 0.25 * q.u, y + 0.3 * q.u, 0.5 * q.u, 1.1 * q.u).paint(ban, 0.6); } });
                const cx = r.x + r.w / 2, tw = 1.3 * u, base = r.y + r.h - 4.2 * u;
                building(p, { x: cx - tw / 2, y: r.y, w: tw, h: base - r.y }, { roof, wall, floors: 1, roofKind: 'hip', roofMat: 'slate', wallMat: 'timber', windows: 0, door_: 'none', wallH: 1.6, sign: (q, x, y) => { q.ell(x, y + 0.7 * q.u, 0.35 * q.u, 0.35 * q.u).paint('#f4f0e6'); q.line([[x, y + 0.7 * q.u], [x, y + 0.45 * q.u]], null, 1); q.line([[x, y + 0.7 * q.u], [x + 0.2 * q.u, y + 0.8 * q.u]], null, 1); } });
                return;
            }
            building(p, r, { roof, wall, floors: 2, roofKind: 'hip', roofMat: 'slate', wallMat: 'stone', windowKind: 'arched', windows: 5, door_: 'double', dormers: 3,
                sign: (q, cx, y) => { for (const dx of [-1.6, 1.6]) { q.rect(cx + dx * q.u - 0.25 * q.u, y + 0.3 * q.u, 0.5 * q.u, 1.1 * q.u).paint(ban, 0.6); } } });
        },
    },
    {
        slug: 'church', name: 'Stone church', group: 'building', icon: 'fa-church', w: 6, h: 4, sh: 8.4, enterable: true, era: 'medieval',
        colors: [ROOF('#4a4a58'), WALL('#c0b4a0'), C('Glass', '#5a7ac0')],
        variants: [V('Bell tower beside'), V('Tower over the door'), V('Chapel', { w: 4, h: 3, sh: 5.6 })],
        paint: (p, r, c, rot, v) => M.church(p, r, c, rot, v),
    },
    {
        slug: 'cathedral', name: 'Cathedral', group: 'building', icon: 'fa-place-of-worship', w: 9, h: 6, sh: 11, enterable: true, era: 'medieval',
        colors: [ROOF('#3a4a5a'), WALL('#d0c4ac'), C('Glass', '#6a5ab0')],
        variants: [V('Twin towers'), V('Spire'), V('Great dome', { sh: 9.4, colors: ['#4a7a6a'] })],
        paint: (p, r, c, rot, v) => M.cathedral(p, r, c, rot, v),
    },
    {
        slug: 'keep', name: 'Castle keep', group: 'building', icon: 'fa-chess-rook', w: 7, h: 5, sh: 10, enterable: true, era: 'medieval',
        colors: [WALL('#b0a898'), ROOF('#4a4a5a'), C('Flag', '#c83a3a')],
        variants: [V('Battlements', { skip: [1] }), V('Corner turrets', { w: 9, sh: 11 }), V('Slate roof')],
        paint: (p, r, c, rot, v) => M.keep(p, r, c, rot, v),
    },
    {
        slug: 'castle-wall', name: 'Castle wall', group: 'building', icon: 'fa-dungeon', w: 4, h: 1, sh: 3.4, era: 'medieval',
        turned: { w: 1, h: 4, sw: 1.4, sh: 6.4 },
        colors: [C('Stone', '#b0a898')],
        variants: [V('Battlements'), V('With torch'), V('Ruined')],
        paint: (p, r, c, rot, v) => M.castleWall(p, r, c, rot, v),
    },
    {
        slug: 'castle-tower', name: 'Wall tower', group: 'building', icon: 'fa-chess-rook', w: 3, h: 3, sh: 6.4, enterable: true, era: 'medieval',
        colors: [C('Stone', '#b0a898'), ROOF('#4a4a5a')],
        variants: [V('Round', { skip: [1] }), V('Square'), V('Ruined', { skip: [1] })],
        paint: (p, r, c, rot, v) => M.castleTower(p, r, c, rot, v),
    },
    {
        slug: 'gatehouse', name: 'Gatehouse', group: 'building', icon: 'fa-archway', w: 6, h: 3, sh: 6.8, enterable: true, era: 'medieval',
        colors: [C('Stone', '#b0a898'), C('Wood', '#6a4a2a'), C('Banner', '#c83a3a')],
        variants: [V('Portcullis'), V('Wooden gates'), V('Drawbridge')],
        paint: (p, r, c, rot, v) => M.gatehouse(p, r, c, rot, v),
    },
    {
        slug: 'watchtower', name: 'Watchtower', group: 'building', icon: 'fa-tower-observation', w: 2, h: 2, sh: 5.6, enterable: true, era: 'medieval',
        colors: [C('Wood', '#8a6040'), ROOF('#6a4a3a')],
        variants: [V('Timber'), V('Stone, square'), V('Stone, round')],
        paint: (p, r, c, rot, v) => M.watchtower(p, r, c, rot, v),
    },
    {
        slug: 'watermill', name: 'Watermill', group: 'building', icon: 'fa-water', w: 6, h: 3, sh: 5.4, enterable: true, era: 'medieval',
        colors: [ROOF('#c8a860'), WALL('#efe2c4'), C('Wood', '#7a5434')],
        variants: [V('Thatch, timber'), V('Stone', { colors: ['#4a4a58', '#b8ac98'] }), V('Two storeys', { sh: 6.6 })],
        paint: (p, r, c, rot, v) => M.watermill(p, r, c, rot, v),
    },
    {
        slug: 'stable', name: 'Stable', group: 'building', icon: 'fa-horse', w: 6, h: 3, sh: 4.4, enterable: true, era: 'medieval',
        colors: [ROOF('#c8a860'), C('Wood', '#9a6a40'), C('Doors', '#6a4428')],
        variants: [V('Thatched stalls'), V('With hayloft', { sh: 5 }), V('Open shelter', { skip: [2] })],
        paint: (p, r, c, rot, v) => M.stable(p, r, c, rot, v),
    },
    {
        slug: 'market-hall', name: 'Market hall', group: 'building', icon: 'fa-store', w: 6, h: 4, sh: 4.6, enterable: true, era: 'medieval',
        colors: [ROOF('#a8603a'), C('Wood', '#6a4a2a'), C('Cloth', '#3a6aa0')],
        variants: [V('Roof on posts'), V('Hall over arches', { sh: 6.2 }), V('Striped pavilion', { colors: ['#fbf6ec'] })],
        paint: (p, r, c, rot, v) => M.marketHall(p, r, c, rot, v),
    },
    {
        slug: 'granary', name: 'Granary', group: 'building', icon: 'fa-wheat-awn', w: 4, h: 3, sh: 5, enterable: true, era: 'medieval',
        colors: [ROOF('#6a4a3a'), C('Wood', '#a87a50')],
        variants: [V('Planks'), V('Stone'), V('Tithe barn', { w: 7, h: 4, sh: 6 })],
        paint: specs(
            ([roof, wood]) => ({ roof, wall: wood, floors: 1, roofKind: 'gable', roofMat: 'shingle', wallMat: 'planks', windows: 0, door_: 'double', door: darken(wood, 0.3), wallH: 2.4, trim: darken(wood, 0.35) }),
            ([roof, wood]) => ({ roof, wall: '#b8ac98', floors: 2, roofKind: 'gable', roofMat: 'slate', wallMat: 'stone', windowKind: 'slit', windows: 2, door_: 'arched', door: wood }),
            ([roof, wood]) => ({ roof, wall: '#b8ac98', floors: 1, roofKind: 'hip', roofMat: 'thatch', wallMat: 'stone', windowKind: 'slit', windows: 4, door_: 'barn', door: wood, wallH: 2.6 }),
        ),
    },

    /* ------------------------------------------------------------- nature */
    {
        slug: 'tree', name: 'Tree', group: 'nature', icon: 'fa-tree', w: 1, h: 1, sw: 2, sh: 3,
        colors: [C('Leaves', '#3e8a44'), C('Trunk', '#7a4e2e')], paint: (p, r, c) => tree(p, r, c),
    },
    {
        slug: 'pine', name: 'Pine', group: 'nature', icon: 'fa-tree', w: 1, h: 1, sw: 1.7, sh: 3.2,
        colors: [C('Needles', '#2e6e44'), C('Trunk', '#6a4428')], paint: (p, r, c) => pine(p, r, c),
    },
    {
        slug: 'bush', name: 'Bush', group: 'nature', icon: 'fa-seedling', w: 1, h: 1, sw: 1.3, sh: 1.2,
        colors: [C('Leaves', '#4a9a4a'), C('Flowers', '#f0a0c0')], paint: (p, r, c) => bush(p, r, c),
    },
    {
        slug: 'hedge', name: 'Hedge', group: 'nature', icon: 'fa-grip-lines', w: 3, h: 1, sh: 1.3,
        turned: { w: 1, h: 3, sh: 3.3 },
        colors: [C('Leaves', '#3e8a44')], paint: (p, r, c, rot) => hedge(p, r, c, rot),
    },
    {
        slug: 'flower-bed', name: 'Flower bed', group: 'nature', icon: 'fa-spa', w: 2, h: 1, sh: 1, floor: true,
        colors: [C('Flowers', '#e05080'), C('Flowers 2', '#f0d040')], paint: (p, r, c) => flowers(p, r, c),
    },
    {
        slug: 'rock', name: 'Rock', group: 'nature', icon: 'fa-mound', w: 1, h: 1, sh: 1.1,
        colors: [C('Stone', '#8a8478')], paint: (p, r, c) => rock(p, r, c),
    },

    /* ------------------------------------------------------------- street */
    {
        slug: 'lamp', name: 'Street lamp', group: 'street', icon: 'fa-lightbulb', w: 1, h: 1, sw: 0.8, sh: 2.8,
        colors: [C('Metal', '#3a4048'), C('Glass', '#f4e8c0')], paint: (p, r, c) => lamp(p, r, c),
    },
    {
        slug: 'bench', name: 'Bench', group: 'street', icon: 'fa-couch', w: 2, h: 1, sh: 1.3,
        turned: { w: 1, h: 2, sh: 2.2 },
        colors: [C('Wood', '#a87444'), C('Metal', '#3a4048')], paint: (p, r, c, rot) => bench(p, r, c, rot),
    },
    {
        slug: 'fence', name: 'Fence', group: 'street', icon: 'fa-bars', w: 3, h: 1, sh: 1.25,
        turned: { w: 1, h: 3, sh: 3.4 },
        colors: [C('Wood', '#e8dcc0')], paint: (p, r, c, rot) => fence(p, r, c, rot),
    },
    {
        slug: 'sign', name: 'Sign', group: 'street', icon: 'fa-signs-post', w: 1, h: 1, sw: 1.2, sh: 1.7,
        colors: [C('Post', '#7a5a3a'), C('Board', '#c8a070')], paint: (p, r, c) => signpost(p, r, c),
    },
    {
        slug: 'mailbox', name: 'Mailbox', group: 'street', icon: 'fa-envelope', w: 1, h: 1, sw: 0.8, sh: 1.4,
        colors: [C('Box', '#3a6ab0')], paint: (p, r, c) => mailbox(p, r, c),
    },
    {
        slug: 'fountain', name: 'Fountain', group: 'street', icon: 'fa-droplet', w: 3, h: 3, sh: 3.4,
        colors: [C('Stone', '#c8c0b0'), C('Water', '#5aa8d8')], paint: (p, r, c) => fountain(p, r, c),
    },
    {
        slug: 'well', name: 'Well', group: 'street', icon: 'fa-bucket', w: 2, h: 2, sh: 2.8,
        colors: [C('Stone', '#a8a090'), C('Roof', '#8a4a3a')], paint: (p, r, c) => well(p, r, c),
    },
    {
        slug: 'stall', name: 'Market stall', group: 'street', icon: 'fa-store', w: 3, h: 2, sh: 2.9,
        colors: [C('Canopy', '#2a8a6a'), C('Wood', '#a87444')], paint: (p, r, c) => stall(p, r, c),
    },
    {
        slug: 'crates', name: 'Crates', group: 'street', icon: 'fa-boxes-stacked', w: 1, h: 1, sh: 1.3,
        colors: [C('Wood', '#b88a54')], paint: (p, r, c) => crates(p, r, c),
    },
    {
        slug: 'statue', name: 'Statue', group: 'street', icon: 'fa-monument', w: 2, h: 2, sh: 3.6,
        colors: [C('Stone', '#b8b4ac')], paint: (p, r, c) => statue(p, r, c),
    },

    /* ---------------------------------------------------- more nature */
    {
        slug: 'cherry-tree', name: 'Cherry tree', group: 'nature', icon: 'fa-tree', w: 1, h: 1, sw: 2, sh: 3,
        colors: [C('Blossom', '#f0a8c8'), C('Trunk', '#6a4030')], paint: (p, r, c) => tree(p, r, c),
    },
    {
        slug: 'autumn-tree', name: 'Autumn tree', group: 'nature', icon: 'fa-tree', w: 1, h: 1, sw: 2, sh: 3,
        colors: [C('Leaves', '#d8782a'), C('Trunk', '#6a4428')], paint: (p, r, c) => tree(p, r, c),
    },
    {
        slug: 'big-tree', name: 'Big tree', group: 'nature', icon: 'fa-tree', w: 2, h: 2, sw: 3.4, sh: 5,
        colors: [C('Leaves', '#2e7a3a'), C('Trunk', '#6a4428')], paint: (p, r, c) => tree(p, r, c),
    },
    {
        slug: 'palm', name: 'Palm tree', group: 'nature', icon: 'fa-umbrella-beach', w: 1, h: 1, sw: 2.2, sh: 3.4,
        colors: [C('Leaves', '#3e9a4a'), C('Trunk', '#9a7a4a')], paint: (p, r, c) => palm(p, r, c),
    },
    {
        slug: 'dead-tree', name: 'Bare tree', group: 'nature', icon: 'fa-tree', w: 1, h: 1, sw: 2, sh: 2.8,
        colors: [C('Wood', '#6a5040')], paint: (p, r, c) => deadTree(p, r, c),
    },
    {
        slug: 'cactus', name: 'Cactus', group: 'nature', icon: 'fa-seedling', w: 1, h: 1, sw: 1.4, sh: 2,
        colors: [C('Green', '#4a8a4a')], paint: (p, r, c) => cactus(p, r, c),
    },
    {
        slug: 'stump', name: 'Stump', group: 'nature', icon: 'fa-tree', w: 1, h: 1, sh: 1,
        colors: [C('Wood', '#7a5434')], paint: (p, r, c) => stump(p, r, c),
    },
    {
        slug: 'log', name: 'Fallen log', group: 'nature', icon: 'fa-grip-lines', w: 2, h: 1, sh: 1,
        colors: [C('Wood', '#7a5434')], paint: (p, r, c) => log(p, r, c),
    },
    {
        slug: 'mushrooms', name: 'Mushrooms', group: 'nature', icon: 'fa-seedling', w: 1, h: 1, sh: 0.9,
        colors: [C('Caps', '#d04848')], paint: (p, r, c) => mushrooms(p, r, c),
    },
    {
        slug: 'tall-grass', name: 'Tall grass', group: 'nature', icon: 'fa-wheat-awn', w: 1, h: 1, sh: 1,
        colors: [C('Grass', '#4a9a3a')], paint: (p, r, c) => grassTuft(p, r, c),
    },
    {
        slug: 'pond', name: 'Pond', group: 'nature', icon: 'fa-water', w: 3, h: 2, sh: 2, floor: true,
        colors: [C('Water', '#4a98d0'), C('Bank', '#b8a888')],
        variants: [V('Oval'), V('Round, stone bank', { w: 2, h: 2, sh: 2 }), V('Kidney', { w: 4, h: 3, sh: 3 }), V('With lilies and reeds', { w: 3, h: 2, sh: 2 })],
        paint: (p, r, c, _rot, v) => (v ? G.pondShape(p, r, c, v) : pond(p, r, c)),
    },
    {
        slug: 'boulder', name: 'Boulder', group: 'nature', icon: 'fa-mound', w: 2, h: 2, sh: 2,
        colors: [C('Stone', '#8a8478')], paint: (p, r, c) => rock(p, r, c),
    },

    /* ---------------------------------------------------- more street */
    {
        slug: 'barrel', name: 'Barrel', group: 'street', icon: 'fa-database', w: 1, h: 1, sw: 0.9, sh: 1.2,
        colors: [C('Wood', '#a8743c')], paint: (p, r, c) => barrel(p, r, c),
    },
    {
        slug: 'trash-can', name: 'Trash can', group: 'street', icon: 'fa-trash-can', w: 1, h: 1, sw: 0.8, sh: 1.2, era: 'modern',
        colors: [C('Metal', '#6a7a6a')], paint: (p, r, c) => trashCan(p, r, c),
    },
    {
        slug: 'vending', name: 'Vending machine', group: 'street', icon: 'fa-cash-register', w: 1, h: 1, sw: 1.1, sh: 2.2, era: 'modern',
        colors: [C('Body', '#d04040')], paint: (p, r, c) => vending(p, r, c),
    },
    {
        slug: 'bus-stop', name: 'Bus stop', group: 'street', icon: 'fa-bus', w: 3, h: 1, sh: 2.6, era: 'modern',
        colors: [C('Roof', '#3a6ab0'), C('Frame', '#5a5a62')], paint: (p, r, c) => busStop(p, r, c),
    },
    {
        slug: 'notice-board', name: 'Notice board', group: 'street', icon: 'fa-clipboard', w: 2, h: 1, sh: 2.2,
        colors: [C('Wood', '#8a5a34'), C('Paper', '#f4f0e4')], paint: (p, r, c) => noticeBoard(p, r, c),
    },
    {
        slug: 'picnic-table', name: 'Picnic table', group: 'street', icon: 'fa-table', w: 2, h: 2, sh: 2,
        colors: [C('Wood', '#a87444')], paint: (p, r, c) => picnicTable(p, r, c),
    },
    {
        slug: 'cafe-table', name: 'Café table', group: 'street', icon: 'fa-umbrella', w: 2, h: 1, sh: 2.4,
        colors: [C('Umbrella', '#d04848'), C('Table', '#f4f0e8')], paint: (p, r, c) => cafeTable(p, r, c),
    },
    {
        slug: 'planter', name: 'Planter', group: 'street', icon: 'fa-seedling', w: 2, h: 1, sh: 1.2,
        colors: [C('Box', '#a8744a'), C('Flowers', '#e05080')], paint: (p, r, c) => planter(p, r, c),
    },
    {
        slug: 'flagpole', name: 'Flagpole', group: 'street', icon: 'fa-flag', w: 1, h: 1, sw: 1.6, sh: 3.4,
        colors: [C('Flag', '#3a6ad0')], paint: (p, r, c) => flagpole(p, r, c),
    },
    {
        slug: 'campfire', name: 'Campfire', group: 'street', icon: 'fa-fire', w: 1, h: 1, sw: 1.2, sh: 1.3,
        colors: [C('Flame', '#f08030')], paint: (p, r, c) => campfire(p, r, c),
    },
    {
        slug: 'cart', name: 'Cart', group: 'street', icon: 'fa-cart-flatbed', w: 2, h: 1, sh: 2,
        colors: [C('Wood', '#9a6a3a'), C('Cover', '#e8dcc0')], paint: (p, r, c) => cart(p, r, c),
    },
    {
        slug: 'hydrant', name: 'Hydrant', group: 'street', icon: 'fa-fire-extinguisher', w: 1, h: 1, sw: 0.7, sh: 1.1, era: 'modern',
        colors: [C('Body', '#d04040')], paint: (p, r, c) => hydrant(p, r, c),
    },
    {
        slug: 'arch', name: 'Stone arch', group: 'street', icon: 'fa-archway', w: 3, h: 1, sh: 3.4,
        colors: [C('Stone', '#b8b0a0')], paint: (p, r, c) => archGate(p, r, c),
    },
    {
        slug: 'torii', name: 'Gate (torii)', group: 'street', icon: 'fa-torii-gate', w: 3, h: 1, sh: 3,
        colors: [C('Paint', '#d0443a')], paint: (p, r, c) => torii(p, r, c),
    },
    {
        slug: 'bridge', name: 'Wooden bridge', group: 'street', icon: 'fa-bridge', w: 4, h: 2, sh: 2, floor: true,
        turned: { w: 2, h: 4, sh: 4 },
        colors: [C('Wood', '#a87a4a')], paint: (p, r, c) => bridge(p, r, c),
    },
    {
        slug: 'dock', name: 'Dock', group: 'street', icon: 'fa-anchor', w: 3, h: 3, sh: 3, floor: true,
        colors: [C('Wood', '#9a7044')], paint: (p, r, c) => dock(p, r, c),
    },

    /* ------------------------------------------- street, 2026-11-08: medieval */
    {
        slug: 'hay', name: 'Hay', group: 'street', icon: 'fa-wheat-awn', w: 1, h: 1, sw: 1.2, sh: 1.2, era: 'medieval',
        colors: [C('Straw', '#e0c060')],
        variants: [V('Round bale'), V('Square bale', { w: 2, sw: 2, sh: 1.1 }), V('Haystack', { sw: 1.4, sh: 2.2 })],
        paint: (p, r, c, rot, v) => M.hay(p, r, c, rot, v),
    },
    {
        slug: 'woodpile', name: 'Woodpile', group: 'street', icon: 'fa-bars-staggered', w: 2, h: 1, sh: 1.2, era: 'medieval',
        colors: [C('Wood', '#a8784a')], paint: (p, r, c) => M.woodpile(p, r, c),
    },
    {
        slug: 'anvil', name: 'Anvil', group: 'street', icon: 'fa-hammer', w: 1, h: 1, sh: 1.1, era: 'medieval',
        colors: [C('Iron', '#5a5a62')], paint: (p, r, c) => M.anvil(p, r, c),
    },
    {
        slug: 'dummy', name: 'Training dummy', group: 'street', icon: 'fa-person', w: 1, h: 1, sw: 1.1, sh: 2.2, era: 'medieval',
        colors: [C('Straw', '#e0c060'), C('Sack', '#b89a70')], paint: (p, r, c) => M.dummy(p, r, c),
    },
    {
        slug: 'scarecrow', name: 'Scarecrow', group: 'street', icon: 'fa-person', w: 1, h: 1, sw: 1.5, sh: 2.4, era: 'medieval',
        colors: [C('Coat', '#7a5a8a'), C('Hat', '#6a4a2a')], paint: (p, r, c) => M.scarecrow(p, r, c),
    },
    {
        slug: 'brazier', name: 'Brazier', group: 'street', icon: 'fa-fire-flame-curved', w: 1, h: 1, sh: 1.5, era: 'medieval',
        colors: [C('Iron', '#4a4a52'), C('Flame', '#f08020')],
        variants: [V('Brazier'), V('Torch post', { sw: 0.8, sh: 2.4 })],
        paint: (p, r, c, rot, v) => M.brazier(p, r, c, rot, v),
    },
    {
        slug: 'banner', name: 'Banner', group: 'street', icon: 'fa-flag', w: 1, h: 1, sw: 1.4, sh: 2.8, era: 'medieval',
        colors: [C('Cloth', '#c83a3a'), C('Trim', '#f0d070')],
        variants: [V('Pennant'), V('Standard'), V('Crossed pair', { sw: 1.8 })],
        paint: (p, r, c, rot, v) => M.bannerPole(p, r, c, rot, v),
    },
    {
        slug: 'trough', name: 'Water trough', group: 'street', icon: 'fa-water', w: 2, h: 1, sh: 1.1, era: 'medieval',
        colors: [C('Wood', '#8a6040'), C('Water', '#5aa0d0')], paint: (p, r, c) => M.trough(p, r, c),
    },
    {
        slug: 'beehive', name: 'Beehive', group: 'street', icon: 'fa-bug', w: 1, h: 1, sh: 1.3, era: 'medieval',
        colors: [C('Straw', '#d8b060')], paint: (p, r, c) => M.beehive(p, r, c),
    },
    {
        slug: 'grave', name: 'Grave', group: 'street', icon: 'fa-cross', w: 1, h: 1, sh: 1.5,
        colors: [C('Stone', '#a8a49a')],
        variants: [V('Headstone'), V('Cross'), V('Carved slab')],
        paint: (p, r, c, rot, v) => M.grave(p, r, c, rot, v),
    },
    {
        slug: 'crops', name: 'Crops', group: 'nature', icon: 'fa-seedling', w: 3, h: 2, sh: 2, floor: true,
        colors: [C('Soil', '#8a6040'), C('Plants', '#c8b040')],
        variants: [V('Wheat'), V('Cabbages', { colors: ['#7a5434', '#5a9a4a'] }), V('Pumpkins', { colors: ['#7a5434', '#4a8a3a'] })],
        paint: (p, r, c, rot, v) => M.crops(p, r, c, rot, v),
    },
    {
        slug: 'stone-wall', name: 'Low stone wall', group: 'street', icon: 'fa-grip-lines', w: 3, h: 1, sh: 1.3, era: 'medieval',
        turned: { w: 1, h: 3, sh: 3.4 },
        colors: [C('Stone', '#a8a090')],
        variants: [V('Fieldstone'), V('Palisade', { sh: 2.2, colors: ['#8a6040'] })],
        paint: (p, r, c, rot, v) => M.lowWall(p, r, c, rot, v),
    },
    {
        slug: 'wayside', name: 'Wayside shrine', group: 'street', icon: 'fa-place-of-worship', w: 1, h: 1, sw: 1.2, sh: 2.2, era: 'medieval',
        colors: [C('Stone', '#b0a898'), ROOF('#6a4a3a')],
        variants: [V('Stone cross', { skip: [1] }), V('Little roof')],
        paint: (p, r, c, rot, v) => M.wayside(p, r, c, rot, v),
    },

    /* --------------------------------------------- street, 2026-11-08: modern */
    {
        slug: 'car', name: 'Car', group: 'street', icon: 'fa-car-side', w: 2, h: 1, sw: 2.2, sh: 1.5, era: 'modern',
        turned: { w: 1, h: 2, sw: 1.3, sh: 2.4 },
        colors: [C('Paint', '#d04040')],
        variants: [V('Saloon'), V('Van', { sh: 1.9, colors: ['#e8e8ec'] }), V('Hatchback', { colors: ['#3a7ac0'] })],
        paint: (p, r, c, rot, v) => N.car(p, r, c, rot, v),
    },
    {
        slug: 'traffic-light', name: 'Traffic light', group: 'street', icon: 'fa-traffic-light', w: 1, h: 1, sw: 0.7, sh: 2.8, era: 'modern',
        colors: [C('Metal', '#3a4048')],
        variants: [V('Three lights'), V('Crossing light', { sh: 2.4 })],
        paint: (p, r, c, rot, v) => N.trafficLight(p, r, c, rot, v),
    },
    {
        slug: 'phone-booth', name: 'Phone booth', group: 'street', icon: 'fa-phone', w: 1, h: 1, sw: 0.9, sh: 2.4, era: 'modern',
        colors: [C('Booth', '#c83a3a')], paint: (p, r, c) => N.phoneBooth(p, r, c),
    },
    {
        slug: 'billboard', name: 'Billboard', group: 'street', icon: 'fa-rectangle-ad', w: 3, h: 1, sh: 3.2, era: 'modern',
        colors: [C('Frame', '#4a4a52'), C('Poster', '#3a8ad0')],
        variants: [V('On legs'), V('Advert column', { w: 1, sw: 1, sh: 2.6 })],
        paint: (p, r, c, rot, v) => N.billboard(p, r, c, rot, v),
    },
    {
        slug: 'playground', name: 'Playground', group: 'street', icon: 'fa-child-reaching', w: 3, h: 1, sh: 2.4, era: 'modern',
        colors: [C('Paint', '#e0a030'), C('Metal', '#5a8ab0')],
        variants: [V('Slide'), V('Swings', { sh: 2.6 }), V('Sandpit', { w: 2, h: 2, sh: 2, skip: [1] })],
        paint: (p, r, c, rot, v) => N.playground(p, r, c, rot, v),
    },
    {
        slug: 'bike-rack', name: 'Bike rack', group: 'street', icon: 'fa-bicycle', w: 2, h: 1, sh: 1.2, era: 'modern',
        colors: [C('Metal', '#8a9098'), C('Bike', '#3a8a5a')], paint: (p, r, c) => N.bikeRack(p, r, c),
    },

    /* ---------------------------------------------- interior: furniture */
    {
        slug: 'bed', name: 'Bed', group: 'furniture', icon: 'fa-bed', w: 2, h: 3, sh: 3.4,
        colors: [C('Frame', '#9a6440'), C('Sheets', '#f2ede4'), C('Blanket', '#4d6fb6')], paint: (p, r, c) => F.bed(p, r, c),
    },
    {
        slug: 'double-bed', name: 'Double bed', group: 'furniture', icon: 'fa-bed', w: 3, h: 3, sh: 3.4,
        colors: [C('Frame', '#7a4a2e'), C('Sheets', '#f2ede4'), C('Blanket', '#b84a5a')], paint: (p, r, c) => F.bed(p, r, c),
    },
    {
        slug: 'bunk-bed', name: 'Bunk bed', group: 'furniture', icon: 'fa-bed', w: 2, h: 2, sh: 3.4,
        colors: [C('Frame', '#a87444'), C('Blankets', '#5a9a5a')], paint: (p, r, c) => F.bunkBed(p, r, c),
    },
    {
        slug: 'wardrobe', name: 'Wardrobe', group: 'furniture', icon: 'fa-door-closed', w: 2, h: 1, sh: 2.8,
        colors: [C('Wood', '#8a5636')], paint: (p, r, c) => F.wardrobe(p, r, c),
    },
    {
        slug: 'dresser', name: 'Chest of drawers', group: 'furniture', icon: 'fa-box-archive', w: 2, h: 1, sh: 1.8,
        colors: [C('Wood', '#a06a42')], paint: (p, r, c) => F.dresser(p, r, c),
    },
    {
        slug: 'nightstand', name: 'Bedside table', group: 'furniture', icon: 'fa-lightbulb', w: 1, h: 1, sh: 1.9,
        colors: [C('Wood', '#a06a42'), C('Lampshade', '#f0dca0')], paint: (p, r, c) => F.nightstand(p, r, c),
    },
    {
        slug: 'sofa', name: 'Sofa', group: 'furniture', icon: 'fa-couch', w: 3, h: 1, sh: 1.9,
        colors: [C('Fabric', '#6a8ac0')], paint: (p, r, c) => F.sofa(p, r, c),
    },
    {
        slug: 'armchair', name: 'Armchair', group: 'furniture', icon: 'fa-chair', w: 1, h: 1, sw: 1.3, sh: 1.8,
        colors: [C('Fabric', '#b05a4a')], paint: (p, r, c) => F.armchair(p, r, c),
    },
    {
        slug: 'coffee-table', name: 'Coffee table', group: 'furniture', icon: 'fa-table', w: 2, h: 1, sh: 1.3,
        colors: [C('Wood', '#8a5a36')], paint: (p, r, c) => F.coffeeTable(p, r, c),
    },
    {
        slug: 'dining-table', name: 'Dining table', group: 'furniture', icon: 'fa-table', w: 3, h: 2, sh: 2.6,
        colors: [C('Wood', '#a8744a'), C('Runner', '#f4ecdc')], paint: (p, r, c) => F.table(p, r, c),
    },
    {
        slug: 'table', name: 'Small table', group: 'furniture', icon: 'fa-table', w: 2, h: 1, sh: 1.9,
        colors: [C('Wood', '#c08a54'), C('Cloth', '#f4ecdc')], paint: (p, r, c) => F.table(p, r, c),
    },
    {
        slug: 'round-table', name: 'Round table', group: 'furniture', icon: 'fa-circle', w: 2, h: 2, sh: 2.2,
        colors: [C('Wood', '#a8744a')], paint: (p, r, c) => F.roundTable(p, r, c),
    },
    {
        slug: 'chair', name: 'Chair', group: 'furniture', icon: 'fa-chair', w: 1, h: 1, sh: 1.8,
        colors: [C('Wood', '#9a6440'), C('Seat', '#c85a4a')], paint: (p, r, c) => F.chair(p, r, c),
    },
    {
        slug: 'bookshelf', name: 'Bookshelf', group: 'furniture', icon: 'fa-book', w: 2, h: 1, sh: 3,
        colors: [C('Wood', '#7a4c2e')], paint: (p, r, c) => F.bookshelf(p, r, c),
    },
    {
        slug: 'tall-bookcase', name: 'Tall bookcase', group: 'furniture', icon: 'fa-book', w: 3, h: 1, sh: 3.8,
        colors: [C('Wood', '#5a3a24')], paint: (p, r, c) => F.bookshelf(p, r, c),
    },
    {
        slug: 'desk', name: 'Desk', group: 'furniture', icon: 'fa-pen', w: 2, h: 1, sh: 1.9,
        colors: [C('Wood', '#a87444')], paint: (p, r, c) => F.desk(p, r, c),
    },
    {
        slug: 'computer-desk', name: 'Computer desk', group: 'furniture', icon: 'fa-computer', w: 2, h: 1, sh: 2.6,
        colors: [C('Wood', '#8a8a92'), C('Computer', '#3a3a42')], paint: (p, r, c) => F.computerDesk(p, r, c),
    },
    {
        slug: 'tv', name: 'TV', group: 'furniture', icon: 'fa-tv', w: 2, h: 1, sh: 2.2,
        colors: [C('Cabinet', '#5a3a24'), C('Screen', '#3a6aa0')], paint: (p, r, c) => F.tv(p, r, c),
    },
    {
        slug: 'piano', name: 'Piano', group: 'furniture', icon: 'fa-music', w: 3, h: 1, sh: 2.6,
        colors: [C('Wood', '#2a1e18')], paint: (p, r, c) => F.piano(p, r, c),
    },
    {
        slug: 'fireplace', name: 'Fireplace', group: 'furniture', icon: 'fa-fire', w: 3, h: 1, sh: 2.8,
        colors: [C('Stone', '#a89c8c'), C('Fire', '#f08030')], paint: (p, r, c) => F.fireplace(p, r, c),
    },
    {
        slug: 'clock', name: 'Grandfather clock', group: 'furniture', icon: 'fa-clock', w: 1, h: 1, sh: 3.2,
        colors: [C('Wood', '#6a3a24')], paint: (p, r, c) => F.grandfatherClock(p, r, c),
    },
    {
        slug: 'potted-plant', name: 'Potted plant', group: 'furniture', icon: 'fa-seedling', w: 1, h: 1, sh: 2,
        colors: [C('Leaves', '#3e8f46'), C('Pot', '#c0643a')], paint: (p, r, c) => F.pottedPlant(p, r, c),
    },
    {
        slug: 'big-plant', name: 'Big plant', group: 'furniture', icon: 'fa-seedling', w: 1, h: 1, sw: 1.3, sh: 2.9,
        colors: [C('Leaves', '#2e7a3a'), C('Pot', '#e8e0d0')], paint: (p, r, c) => F.pottedPlant(p, r, c),
    },
    {
        slug: 'floor-lamp', name: 'Floor lamp', group: 'furniture', icon: 'fa-lightbulb', w: 1, h: 1, sw: 0.9, sh: 2.4,
        colors: [C('Lampshade', '#f0dca0')], paint: (p, r, c) => F.standingLamp(p, r, c),
    },
    {
        slug: 'rug', name: 'Rug', group: 'furniture', icon: 'fa-rug', w: 3, h: 2, sh: 2, floor: true,
        colors: [C('Rug', '#a83c3c'), C('Border', '#e0b060')], paint: (p, r, c) => F.rug(p, r, c),
    },
    {
        slug: 'big-rug', name: 'Large rug', group: 'furniture', icon: 'fa-rug', w: 4, h: 3, sh: 3, floor: true,
        colors: [C('Rug', '#3c5a8a'), C('Border', '#e0d0a0')], paint: (p, r, c) => F.rug(p, r, c),
    },
    {
        slug: 'round-rug', name: 'Round rug', group: 'furniture', icon: 'fa-circle', w: 2, h: 2, sh: 2, floor: true,
        colors: [C('Rug', '#6a9a5a'), C('Rings', '#f0e0b0')], paint: (p, r, c) => F.roundRug(p, r, c),
    },
    {
        slug: 'doormat', name: 'Doormat', group: 'furniture', icon: 'fa-square', w: 2, h: 1, sh: 1, floor: true,
        colors: [C('Mat', '#9a6a3a')], paint: (p, r, c) => F.doormat(p, r, c),
    },
    {
        slug: 'stairs', name: 'Stairs', group: 'furniture', icon: 'fa-stairs', w: 2, h: 2, sh: 2, floor: true,
        turned: { w: 2, h: 2, sh: 2 },
        colors: [C('Wood', '#a87444')], paint: (p, r, c, rot) => F.stairs(p, r, c, rot),
    },

    /* ------------------------------------------- interior: kitchen & bath */
    {
        slug: 'counter', name: 'Kitchen counter', group: 'kitchen', icon: 'fa-kitchen-set', w: 2, h: 1, sh: 1.9,
        colors: [C('Cabinets', '#e8dcc4'), C('Worktop', '#8a8a92')], paint: (p, r, c) => F.counter(p, r, c),
    },
    {
        slug: 'stove', name: 'Stove', group: 'kitchen', icon: 'fa-fire-burner', w: 1, h: 1, sh: 1.9,
        colors: [C('Body', '#e8e8ec')], paint: (p, r, c) => F.stove(p, r, c),
    },
    {
        slug: 'fridge', name: 'Fridge', group: 'kitchen', icon: 'fa-snowflake', w: 1, h: 1, sh: 2.8,
        colors: [C('Body', '#f0f0f4')], paint: (p, r, c) => F.fridge(p, r, c),
    },
    {
        slug: 'sink', name: 'Kitchen sink', group: 'kitchen', icon: 'fa-sink', w: 2, h: 1, sh: 1.9,
        colors: [C('Cabinets', '#e8dcc4')], paint: (p, r, c) => F.sink(p, r, c),
    },
    {
        slug: 'kitchen-shelf', name: 'Kitchen shelves', group: 'kitchen', icon: 'fa-jar', w: 2, h: 1, sh: 2.8,
        colors: [C('Wood', '#b88a5a')], paint: (p, r, c) => F.kitchenShelf(p, r, c),
    },
    {
        slug: 'bathtub', name: 'Bathtub', group: 'kitchen', icon: 'fa-bath', w: 3, h: 2, sh: 2.4,
        colors: [C('Tub', '#f4f4f8')], paint: (p, r, c) => F.bathtub(p, r, c),
    },
    {
        slug: 'toilet', name: 'Toilet', group: 'kitchen', icon: 'fa-toilet', w: 1, h: 1, sh: 1.7,
        colors: [C('Ceramic', '#f4f4f8')], paint: (p, r, c) => F.toilet(p, r, c),
    },
    {
        slug: 'washbasin', name: 'Washbasin', group: 'kitchen', icon: 'fa-sink', w: 1, h: 1, sh: 1.7,
        colors: [C('Ceramic', '#f4f4f8')], paint: (p, r, c) => F.washbasin(p, r, c),
    },

    /* ------------------------------------------ interior: shops & storage */
    {
        slug: 'shop-shelf', name: 'Shop shelves', group: 'shop', icon: 'fa-store', w: 3, h: 1, sh: 2.6,
        colors: [C('Metal', '#8a9aa8')], paint: (p, r, c) => F.shopShelf(p, r, c),
    },
    {
        slug: 'shop-counter', name: 'Shop counter', group: 'shop', icon: 'fa-cash-register', w: 3, h: 1, sh: 2,
        colors: [C('Wood', '#5a7ab0'), C('Top', '#e8e8ec')], paint: (p, r, c) => F.shopCounter(p, r, c),
    },
    {
        slug: 'healing-machine', name: 'Healing machine', group: 'shop', icon: 'fa-kit-medical', w: 2, h: 1, sh: 2,
        colors: [C('Body', '#e8e8ec'), C('Light', '#f06868')], paint: (p, r, c) => F.healingMachine(p, r, c),
    },
    {
        slug: 'chest', name: 'Chest', group: 'shop', icon: 'fa-box', w: 1, h: 1, sw: 1.2, sh: 1.3,
        colors: [C('Wood', '#8a5636')], paint: (p, r, c) => F.chest(p, r, c),
    },
    {
        slug: 'boxes', name: 'Cardboard boxes', group: 'shop', icon: 'fa-boxes-stacked', w: 2, h: 1, sh: 2.1,
        colors: [C('Cardboard', '#d0a868')], paint: (p, r, c) => F.boxes(p, r, c),
    },
    {
        slug: 'bin', name: 'Bin', group: 'shop', icon: 'fa-trash-can', w: 1, h: 1, sw: 0.8, sh: 1.1,
        colors: [C('Metal', '#8a9aa8')], paint: (p, r, c) => F.trashBin(p, r, c),
    },

    /* --------------------------------------------- nature and garden, more
       (2026-11-10, the owner's request: gardens and ponds in interiors). */
    {
        slug: 'lily-pads', name: 'Lily pads', group: 'nature', icon: 'fa-leaf', w: 1, h: 1, sh: 1, floor: true,
        colors: [C('Leaves', '#4a9a4a'), C('Flower', '#f4a8c8')],
        variants: [V('With a flower'), V('Leaves only', { skip: [1] }), V('Lotus', { colors: ['', '#f080b0'] })],
        paint: (p, r, c, rot, v) => G.lilyPads(p, r, c, rot, v),
    },
    {
        slug: 'reeds', name: 'Reeds', group: 'nature', icon: 'fa-wheat-awn', w: 1, h: 1, sh: 1.7,
        colors: [C('Stems', '#6a9a4a'), C('Heads', '#7a5030')],
        variants: [V('Cattails'), V('Rushes', { skip: [1] }), V('Papyrus', { skip: [1] })],
        paint: (p, r, c, rot, v) => G.reeds(p, r, c, rot, v),
    },
    {
        slug: 'koi', name: 'Koi fish', group: 'nature', icon: 'fa-fish', w: 1, h: 1, sh: 1, floor: true,
        colors: [C('Fish', '#f07a30'), C('Spots', '#ffffff')], paint: (p, r, c) => G.koi(p, r, c),
    },
    {
        slug: 'flower-clump', name: 'Flowers', group: 'nature', icon: 'fa-spa', w: 1, h: 1, sh: 1,
        colors: [C('Flowers', '#e04860'), C('Leaves', '#4a8a3c')],
        variants: [V('Tulips'), V('Daisies', { colors: ['#f8f6ee'] }), V('Roses', { colors: ['#d03050', '#3e7a3a'] }), V('Lavender', { colors: ['#9a7ad0', '#6a8a5a'] })],
        paint: (p, r, c, rot, v) => G.flowerClump(p, r, c, rot, v),
    },
    {
        slug: 'sunflowers', name: 'Sunflowers', group: 'nature', icon: 'fa-sun', w: 1, h: 1, sh: 2.3,
        colors: [C('Petals', '#f4c020'), C('Leaves', '#4a8a3a')], paint: (p, r, c) => G.sunflowers(p, r, c),
    },
    {
        slug: 'fern', name: 'Fern', group: 'nature', icon: 'fa-leaf', w: 1, h: 1, sw: 1.3, sh: 1.1,
        colors: [C('Fronds', '#4a9a4a')], paint: (p, r, c) => G.fern(p, r, c),
    },
    {
        slug: 'fruit-tree', name: 'Fruit tree', group: 'nature', icon: 'fa-apple-whole', w: 1, h: 1, sw: 2, sh: 3,
        colors: [C('Leaves', '#3e8a44'), C('Trunk', '#7a4e2e'), C('Fruit', '#d83a30')],
        variants: [V('Apples'), V('Oranges', { colors: ['#2e7a3a', '', '#f09020'] }), V('Lemons', { colors: ['#4a9a4a', '', '#f0d838'] }), V('Peaches', { colors: ['', '', '#f4a080'] })],
        paint: (p, r, c) => G.fruitTree(p, r, c),
    },
    {
        slug: 'sapling', name: 'Young tree', group: 'nature', icon: 'fa-seedling', w: 1, h: 1, sw: 1.3, sh: 2,
        colors: [C('Leaves', '#5aa04a'), C('Trunk', '#7a5434')], paint: (p, r, c) => G.sapling(p, r, c),
    },
    {
        slug: 'mossy-rock', name: 'Mossy rock', group: 'nature', icon: 'fa-mound', w: 1, h: 1, sh: 1.1,
        colors: [C('Stone', '#8a8478'), C('Moss', '#6a9a3a')],
        variants: [V('Rock'), V('Pond rocks'), V('Flat stone')],
        paint: (p, r, c, rot, v) => G.mossyRock(p, r, c, rot, v),
    },
    {
        slug: 'pebbles', name: 'Pebbles', group: 'nature', icon: 'fa-circle', w: 1, h: 1, sh: 1, floor: true,
        colors: [C('Stone', '#a8a090')], paint: (p, r, c) => G.pebbles(p, r, c),
    },
    {
        slug: 'stepping-stones', name: 'Stepping stones', group: 'garden', icon: 'fa-shoe-prints', w: 1, h: 1, sh: 1, floor: true,
        colors: [C('Stone', '#b0a898')],
        variants: [V('Round'), V('Slabs'), V('Pebble path')],
        paint: (p, r, c, rot, v) => G.steppingStones(p, r, c, rot, v),
    },
    {
        slug: 'bird-bath', name: 'Bird bath', group: 'garden', icon: 'fa-dove', w: 1, h: 1, sw: 1.1, sh: 1.5,
        colors: [C('Stone', '#c0b8a8'), C('Water', '#6ab0e0')], paint: (p, r, c) => G.birdBath(p, r, c),
    },
    {
        slug: 'stone-lantern', name: 'Stone lantern', group: 'garden', icon: 'fa-torii-gate', w: 1, h: 1, sh: 1.8,
        colors: [C('Stone', '#a8a498'), C('Light', '#f8d878')], paint: (p, r, c) => G.stoneLantern(p, r, c),
    },
    {
        slug: 'topiary', name: 'Topiary', group: 'garden', icon: 'fa-tree', w: 1, h: 1, sh: 2,
        colors: [C('Leaves', '#3e8a44'), C('Pot', '#c0643a')],
        variants: [V('Ball'), V('Cone'), V('Two balls')],
        paint: (p, r, c, rot, v) => G.topiary(p, r, c, rot, v),
    },
    {
        slug: 'garden-bridge', name: 'Arched footbridge', group: 'garden', icon: 'fa-archway', w: 3, h: 1, sh: 2,
        colors: [C('Deck', '#b08050'), C('Rails', '#c83a2a')],
        variants: [V('Red rails'), V('All wood', { colors: ['', '#8a6038'] })],
        paint: (p, r, c) => G.gardenBridge(p, r, c),
    },
    {
        slug: 'rose-arch', name: 'Rose arch', group: 'garden', icon: 'fa-archway', w: 2, h: 1, sh: 2.8,
        colors: [C('Frame', '#f0ece4'), C('Roses', '#e04860')], paint: (p, r, c) => G.roseArch(p, r, c),
    },
];

export const ITEM_BY_SLUG = new Map(ITEMS.map((d) => [d.slug, d]));

/** An item this version does not know still draws — as a plain block. */
export function itemOf(slug: string): ItemDef {
    return ITEM_BY_SLUG.get(slug) ?? {
        slug, name: slug, group: 'street', icon: 'fa-question', w: 1, h: 1, sh: 1.5, colors: [C('Colour', '#8a8a8a')],
        paint: (p, r, [c]) => { p.rr(r.x + 2, r.y + 2, r.w - 4, r.h - 4, p.u * 0.1).paint(c); },
    };
}
