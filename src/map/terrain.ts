/* The paintable ground.

   Each terrain is one character in MapDoc.terrain, and the characters are
   STORAGE: a saved map is a string of them, so a code may never be reused or
   reassigned — add new terrains with new letters.

   `z` is the stacking order the smooth renderer draws in. Layer k covers every
   cell whose terrain sits at k or above, so a higher terrain is always painted
   over a lower one and two smooth edges can never leave a gap between them —
   see render/terrain.ts. The clouds a sky isle floats on are at the very
   bottom, then water, then the ground, then what stands on it. */

export interface TerrainDef {
    slug: string;
    name: string;
    code: string;
    z: number;
    water?: boolean;
    /** Open sky: below everything, even the sea. */
    sky?: boolean;
    icon: string;
}

export const TERRAINS: TerrainDef[] = [
    { slug: 'clouds', name: 'Clouds', code: 'k', z: 0, sky: true, icon: 'fa-cloud' },
    { slug: 'deep-sea', name: 'Deep sea', code: 'D', z: 1, water: true, icon: 'fa-water' },
    { slug: 'sea', name: 'Sea', code: 'S', z: 2, water: true, icon: 'fa-water' },
    { slug: 'shallows', name: 'Shallows', code: 'h', z: 3, water: true, icon: 'fa-water' },
    { slug: 'lake', name: 'Lake', code: 'L', z: 4, water: true, icon: 'fa-droplet' },
    { slug: 'swamp', name: 'Swamp', code: 'w', z: 5, icon: 'fa-frog' },
    { slug: 'beach', name: 'Beach', code: 'b', z: 6, icon: 'fa-umbrella-beach' },
    { slug: 'grassland', name: 'Grassland', code: 'g', z: 7, icon: 'fa-seedling' },
    { slug: 'flower-field', name: 'Flower field', code: 'F', z: 8, icon: 'fa-spa' },
    { slug: 'tall-grass', name: 'Tall grass', code: 't', z: 9, icon: 'fa-wheat-awn' },
    { slug: 'forest', name: 'Forest', code: 'f', z: 10, icon: 'fa-tree' },
    { slug: 'jungle', name: 'Jungle', code: 'j', z: 11, icon: 'fa-leaf' },
    { slug: 'desert', name: 'Desert', code: 'd', z: 12, icon: 'fa-sun' },
    { slug: 'badlands', name: 'Badlands', code: 'B', z: 13, icon: 'fa-mound' },
    { slug: 'tundra', name: 'Tundra', code: 'u', z: 14, icon: 'fa-icicles' },
    { slug: 'snow', name: 'Snow', code: 'n', z: 15, icon: 'fa-snowflake' },
    { slug: 'mountain', name: 'Mountain', code: 'm', z: 16, icon: 'fa-mountain' },
    { slug: 'snow-mountain', name: 'Snow mountain', code: 'M', z: 17, icon: 'fa-mountain-sun' },
    { slug: 'volcanic', name: 'Volcanic', code: 'v', z: 18, icon: 'fa-volcano' },
    { slug: 'cave-floor', name: 'Cave floor', code: 'c', z: 19, icon: 'fa-dungeon' },
    { slug: 'road', name: 'Road', code: 'r', z: 20, icon: 'fa-road' },
    { slug: 'town-paving', name: 'Town paving', code: 'p', z: 21, icon: 'fa-border-all' },
];

export const TERRAIN_BY_CODE = new Map(TERRAINS.map((t) => [t.code, t]));
export const TERRAIN_BY_SLUG = new Map(TERRAINS.map((t) => [t.slug, t]));

/** What an unknown character reads as — a map from a newer version, say. */
export const FALLBACK_TERRAIN = TERRAIN_BY_SLUG.get('grassland')!;

export function terrainOf(code: string): TerrainDef {
    return TERRAIN_BY_CODE.get(code) ?? FALLBACK_TERRAIN;
}
