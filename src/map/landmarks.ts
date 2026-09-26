/* The landmarks a map can be stamped with.

   The slug is the contract with the art: a landmark's sprite is the file
   `<slug>.png` in app-data/images/MapSprites/<Style>/ (or Common/). Renaming a
   slug orphans whatever art was drawn for it AND every stamp already saved in a
   map, so slugs are append-only — change the display name instead. MAP-SPRITES.md
   lists them all for whoever draws the art.

   `icon` and `color` are the placeholder: what is drawn until a sprite exists. */

export type LandmarkGroup = 'nature' | 'settlement' | 'pokemon' | 'furniture';

export interface LandmarkDef {
    slug: string;
    name: string;
    group: LandmarkGroup;
    icon: string;
    color: string;
    /** Size in cells when first placed. */
    size: number;
    /** Takes a type badge — the Gym. */
    typed?: boolean;
}

export const LANDMARK_GROUPS: { key: LandmarkGroup; label: string }[] = [
    { key: 'nature', label: 'Nature' },
    { key: 'settlement', label: 'Settlements' },
    { key: 'pokemon', label: 'Pokémon' },
    { key: 'furniture', label: 'Map furniture' },
];

const N = (slug: string, name: string, icon: string, color: string, size = 2): LandmarkDef =>
    ({ slug, name, group: 'nature', icon, color, size });
const S = (slug: string, name: string, icon: string, color: string, size = 2): LandmarkDef =>
    ({ slug, name, group: 'settlement', icon, color, size });
const P = (slug: string, name: string, icon: string, color: string, size = 2): LandmarkDef =>
    ({ slug, name, group: 'pokemon', icon, color, size });
const F = (slug: string, name: string, icon: string, color: string, size = 1.5): LandmarkDef =>
    ({ slug, name, group: 'furniture', icon, color, size });

export const LANDMARKS: LandmarkDef[] = [
    N('mountain', 'Mountain', 'fa-mountain', '#8b7355'),
    N('mountain-range', 'Mountain range', 'fa-mountain-sun', '#7a6248', 3),
    N('hill', 'Hill', 'fa-mound', '#8aa05a'),
    N('volcano', 'Volcano', 'fa-volcano', '#b4432f'),
    N('forest', 'Forest', 'fa-tree', '#2f7a3a'),
    N('woods', 'Woods', 'fa-tree', '#5f9a4a'),
    N('jungle', 'Jungle', 'fa-leaf', '#2c7d4f'),
    N('grassland', 'Grassland', 'fa-seedling', '#7fb54e'),
    N('tall-grass', 'Tall grass', 'fa-wheat-awn', '#4f9a3a', 1),
    N('flower-field', 'Flower field', 'fa-spa', '#d46a9c'),
    N('giant-tree', 'Giant tree', 'fa-tree', '#3e6b2f', 3),
    N('desert', 'Desert', 'fa-sun', '#d9a441'),
    N('oasis', 'Oasis', 'fa-droplet', '#3aa0a8'),
    N('badlands', 'Badlands', 'fa-mound', '#b8683c'),
    N('canyon', 'Canyon', 'fa-road-barrier', '#a0542f'),
    N('swamp', 'Swamp', 'fa-frog', '#5d7a3f'),
    N('frozen-tundra', 'Frozen tundra', 'fa-icicles', '#7fb4cc'),
    N('glacier', 'Glacier', 'fa-snowflake', '#8ccbe6'),
    N('lake', 'Lake', 'fa-water', '#3a86c8'),
    N('sea', 'Sea', 'fa-water', '#2a64b0'),
    N('waterfall', 'Waterfall', 'fa-bars-staggered', '#4a9ad8'),
    N('island', 'Island', 'fa-umbrella-beach', '#c9a55a'),
    N('beach', 'Beach', 'fa-umbrella-beach', '#e0c07a'),
    N('cave', 'Cave', 'fa-dungeon', '#5a4a3e'),
    N('rock-formation', 'Rock formation', 'fa-cubes-stacked', '#86796a'),
    N('geyser', 'Geyser', 'fa-fire-flame-simple', '#6aa8c8'),

    S('city', 'City', 'fa-city', '#5a6a8a', 3),
    S('town', 'Town', 'fa-house-chimney', '#7a6a5a'),
    S('village', 'Village', 'fa-house', '#8a7a5a'),
    S('medieval-city', 'Medieval city', 'fa-chess-rook', '#6a5a7a', 3),
    S('castle', 'Castle', 'fa-chess-rook', '#6a6a7a'),
    S('tower', 'Tower', 'fa-tower-observation', '#6a6a6a'),
    S('house', 'House', 'fa-house', '#9a6a4a', 1),
    S('farm', 'Farm', 'fa-tractor', '#9a7a3a'),
    S('windmill', 'Windmill', 'fa-fan', '#9a8a6a'),
    S('port', 'Port', 'fa-anchor', '#3a6a9a'),
    S('lighthouse', 'Lighthouse', 'fa-tower-broadcast', '#c84a3a'),
    S('bridge', 'Bridge', 'fa-bridge', '#8a6a4a'),
    S('camp', 'Camp', 'fa-campground', '#8a7a3a', 1.5),
    S('mine', 'Mine', 'fa-helmet-safety', '#6a5a4a'),
    S('temple', 'Temple', 'fa-landmark', '#a08a5a'),
    S('shrine', 'Shrine', 'fa-torii-gate', '#c8443a', 1.5),
    S('ruins', 'Ruins', 'fa-landmark-dome', '#8a8070'),

    P('pokemon-center', 'Pokémon Center', 'fa-kit-medical', '#e04a4a', 1.5),
    P('poke-mart', 'Poké Mart', 'fa-store', '#3a7ad0', 1.5),
    { ...P('gym', 'Gym', 'fa-medal', '#c89a2a'), typed: true },
    P('pokemon-league', 'Pokémon League', 'fa-trophy', '#b8902a', 3),
    P('pokemon-lab', 'Pokémon Lab', 'fa-flask', '#4aa0a0'),
    P('day-care', 'Day Care', 'fa-egg', '#d08ab0'),
    P('safari-zone', 'Safari Zone', 'fa-binoculars', '#6a9a3a'),
    P('battle-tower', 'Battle Tower', 'fa-building-flag', '#7a4ab0'),
    P('contest-hall', 'Contest Hall', 'fa-star', '#e0609a'),
    P('berry-tree', 'Berry tree', 'fa-apple-whole', '#c0443a', 1),
    P('team-hideout', 'Team hideout', 'fa-user-secret', '#3a3a4a'),
    P('power-plant', 'Power plant', 'fa-bolt', '#e0b020'),
    P('radio-tower', 'Radio tower', 'fa-tower-cell', '#8a8a9a'),
    P('ferry', 'Ferry', 'fa-ship', '#3a7ab0'),
    P('game-corner', 'Game Corner', 'fa-dice', '#d0a02a'),
    P('museum', 'Museum', 'fa-building-columns', '#8a7a6a'),
    P('trainer-school', 'Trainer school', 'fa-school', '#5a8ac0'),
    P('route-gate', 'Route gate', 'fa-torii-gate', '#7a8a9a', 1.5),
    P('legendary-shrine', 'Legendary shrine', 'fa-dragon', '#9a5ac8'),

    F('compass-rose', 'Compass rose', 'fa-compass', '#6a5a4a', 3),
    F('signpost', 'Signpost', 'fa-signs-post', '#8a6a3a', 1),
    F('flag', 'Flag', 'fa-flag', '#c8443a', 1),
    F('x-marks-the-spot', 'X marks the spot', 'fa-xmark', '#c8443a', 1),
    F('danger', 'Danger', 'fa-skull-crossbones', '#3a3a3a', 1),
    F('point-of-interest', 'Point of interest', 'fa-location-dot', '#c8443a', 1),
    F('campfire', 'Campfire', 'fa-fire', '#e07a2a', 1),
];

export const LANDMARK_BY_SLUG = new Map(LANDMARKS.map((l) => [l.slug, l]));

/** A stamp whose slug this version does not know still draws — as itself. */
export function landmarkOf(slug: string): LandmarkDef {
    return LANDMARK_BY_SLUG.get(slug) ?? {
        slug, name: slug, group: 'furniture', icon: 'fa-question', color: '#777', size: 1.5,
    };
}
