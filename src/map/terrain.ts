/* The paintable ground.

   Each terrain is one character in MapDoc.terrain, and the characters are
   STORAGE: a saved map is a string of them, so a code may never be reused or
   reassigned — add new terrains with new letters.

   `z` is the stacking order the smooth renderer draws in. Layer k covers every
   cell whose terrain sits at k or above, so a higher terrain is always painted
   over a lower one and two smooth edges can never leave a gap between them —
   see render/terrain.ts. Water is at the bottom, then the ground, then what
   stands on it. */

export interface TerrainDef {
    slug: string;
    name: string;
    code: string;
    z: number;
    water?: boolean;
    icon: string;
}

export const TERRAINS: TerrainDef[] = [
    { slug: 'deep-sea', name: 'Deep sea', code: 'D', z: 0, water: true, icon: 'fa-water' },
    { slug: 'sea', name: 'Sea', code: 'S', z: 1, water: true, icon: 'fa-water' },
    { slug: 'shallows', name: 'Shallows', code: 'h', z: 2, water: true, icon: 'fa-water' },
    { slug: 'lake', name: 'Lake', code: 'L', z: 3, water: true, icon: 'fa-droplet' },
    { slug: 'swamp', name: 'Swamp', code: 'w', z: 4, icon: 'fa-frog' },
    { slug: 'beach', name: 'Beach', code: 'b', z: 5, icon: 'fa-umbrella-beach' },
    { slug: 'grassland', name: 'Grassland', code: 'g', z: 6, icon: 'fa-seedling' },
    { slug: 'tall-grass', name: 'Tall grass', code: 't', z: 7, icon: 'fa-wheat-awn' },
    { slug: 'forest', name: 'Forest', code: 'f', z: 8, icon: 'fa-tree' },
    { slug: 'jungle', name: 'Jungle', code: 'j', z: 9, icon: 'fa-leaf' },
    { slug: 'desert', name: 'Desert', code: 'd', z: 10, icon: 'fa-sun' },
    { slug: 'badlands', name: 'Badlands', code: 'B', z: 11, icon: 'fa-mound' },
    { slug: 'tundra', name: 'Tundra', code: 'u', z: 12, icon: 'fa-icicles' },
    { slug: 'snow', name: 'Snow', code: 'n', z: 13, icon: 'fa-snowflake' },
    { slug: 'mountain', name: 'Mountain', code: 'm', z: 14, icon: 'fa-mountain' },
    { slug: 'volcanic', name: 'Volcanic', code: 'v', z: 15, icon: 'fa-volcano' },
    { slug: 'cave-floor', name: 'Cave floor', code: 'c', z: 16, icon: 'fa-dungeon' },
    { slug: 'road', name: 'Road', code: 'r', z: 17, icon: 'fa-road' },
    { slug: 'town-paving', name: 'Town paving', code: 'p', z: 18, icon: 'fa-border-all' },
];

export const TERRAIN_BY_CODE = new Map(TERRAINS.map((t) => [t.code, t]));
export const TERRAIN_BY_SLUG = new Map(TERRAINS.map((t) => [t.slug, t]));

/** What an unknown character reads as — a map from a newer version, say. */
export const FALLBACK_TERRAIN = TERRAIN_BY_SLUG.get('grassland')!;

export function terrainOf(code: string): TerrainDef {
    return TERRAIN_BY_CODE.get(code) ?? FALLBACK_TERRAIN;
}
