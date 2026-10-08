import type { LabelRole, PathKind, StyleId } from './types';

/* The four looks a map can be drawn in.

   A style is data plus the few renderer switches in render/terrain.ts, so a new
   one is mostly a new entry here. What a style decides:

   - the colour of every terrain, and optionally a procedural texture drawn over
     it (the names are the painters in render/patterns.ts). A tile the owner
     drops in MapSprites/<folder>/terrain/<slug>.png replaces both;
   - how terrain edges look: `smooth` contours rounded off the cells, or
     `blocky` cells drawn as the squares they are;
   - the line work of every path kind, the fonts of the labels, and whether
     sprites are scaled up pixel-sharp. */

export interface TerrainLook {
    fill: string;
    /** A painter from render/patterns.ts, drawn over the fill. */
    pattern?: string;
    /** Colour the pattern draws in. */
    ink?: string;
    /** The outline where this terrain's region ends, in world px at 1x. A
        tint of the terrain's own colour, never the style's ink: a hard dark
        rim on a few terrains read as a mistake beside the rest. A map that
        wants dark lines picks the Line border look, on every terrain alike. */
    edge?: { color: string; width: number };
}

export interface PathLook {
    color: string;
    /** A second, wider stroke underneath — a road's kerb, a river's bank. */
    casing?: string;
    /** In multiples of the stroke's own width, so a dotted line stays dotted
        at any width. A near-zero dash with a round cap draws a dot. */
    dash?: number[];
    /** Multiplies the path's own width. */
    widthScale: number;
    /** Rivers taper from their source. */
    taper?: boolean;
    cap: CanvasLineCap;
}

export interface MapStyle {
    id: StyleId;
    name: string;
    /** Folder under MapSprites/ holding this style's art. */
    folder: string;
    icon: string;
    edgeMode: 'smooth' | 'blocky';
    /** Everything past the map's edge. */
    backdrop: string;
    /** A frame drawn around the map itself. */
    frame: { color: string; width: number };
    terrain: Record<string, TerrainLook>;
    /** Blocky styles: a 1px line between two different terrains, where the
        edge is left to the style. */
    cellBorder?: string;
    /** An edge set to Line: one clear line, the same on every terrain. */
    line: { color: string; width: number };
    /** Shading laid along the coast on the water side, one stroke per width
        (in cells), each in `color` — translucent, so they build up towards the
        shore. The old-map coastal wash; nothing is drawn without it. */
    coast?: { color: string; widths: number[]; skyOnly?: boolean };
    /** The shallows, in bands by how far the water is from land: `steps` are
        the distances (in cells) where one band gives way to the next, and
        `colors` the tint of each band, nearest the coast first — one more
        colour than steps. Translucent, laid over whatever water is painted.
        `line` inks the edge between bands. See depthBands in
        render/terrain.ts. */
    depth?: { steps: number[]; colors: string[]; line?: { color: string; width: number } };
    /** The shoreline of inland water — a lake or river against land, where
        the edge is left to the style. Lakes and rivers get no shallows, so
        this is what tells them from the land; the sea keeps its own look. */
    shore: { color: string; width: number };
    pixelated: boolean;
    grid: string;
    paths: Record<PathKind, PathLook>;
    label: Record<LabelRole, { font: string; size: number; weight: number; color: string; halo: string; italic?: boolean; upper?: boolean; spacing?: number }>;
    /** Route-number badge. */
    badge: { fill: string; text: string; border: string };
}

const HAND_FONT = "'IM Fell English', 'Palatino Linotype', Georgia, serif";
const HAND_SC = "'IM Fell English SC', 'Palatino Linotype', Georgia, serif";
const ANIME_FONT = "'Baloo 2', 'Outfit', system-ui, sans-serif";
const PIXEL_FONT = "'Pixelify Sans', 'Fira Code', ui-monospace, monospace";

const HAND_INK = '#3b2f24';

const handdrawn: MapStyle = {
    id: 'handdrawn', name: 'Hand-drawn', folder: 'HandDrawn', icon: 'fa-feather-pointed',
    edgeMode: 'smooth',
    backdrop: '#2a241d', frame: { color: HAND_INK, width: 3 },
    /* The dark wash would fight the depth shading's pale coast, so on water
       it is left to that; it still shades the cloud round a sky isle. */
    coast: { color: '#3f5e5a1c', widths: [1.8, 1.3, 0.85, 0.45], skyOnly: true },
    depth: {
        steps: [0.45, 1, 1.7],
        colors: ['#f1efd6b8', '#e2e6cf80', '#cfdccd40', '#00000000'],
        line: { color: '#4f6f6a55', width: 1 },
    },
    line: { color: HAND_INK, width: 1.6 },
    shore: { color: '#3f5d58d9', width: 2.2 },
    pixelated: false,
    grid: '#3b2f2455',
    terrain: {
        'clouds': { fill: '#dfe3dc', pattern: 'clouds', ink: '#98a4a3' },
        'deep-sea': { fill: '#9fb4ae', pattern: 'waves', ink: '#5d7a74' },
        'sea': { fill: '#b6c8bd', pattern: 'waves', ink: '#7d968c' },
        'shallows': { fill: '#cbd8c6', pattern: 'ripples', ink: '#8fa89a' },
        'lake': { fill: '#b6c8bd', pattern: 'ripples', ink: '#7d968c', edge: { color: '#5d7a7466', width: 1 } },
        'river': { fill: '#b6c8bd', pattern: 'ripples', ink: '#7d968c', edge: { color: '#5d7a7466', width: 1 } },
        'swamp': { fill: '#b3b58c', pattern: 'swamp', ink: '#5f7a3c', edge: { color: '#6b6a4588', width: 1 } },
        'beach': { fill: '#ecdfb2', pattern: 'sand', ink: '#b8a472', edge: { color: '#b8a47299', width: 1 } },
        'grassland': { fill: '#e2dcae', pattern: 'tussocks', ink: '#7f9a4a' },
        'flower-field': { fill: '#f3d9dc', pattern: 'flowers', ink: '#7f9a4a', edge: { color: '#b0808888', width: 1 } },
        'tall-grass': { fill: '#cbd29a', pattern: 'tall-tussocks', ink: '#5f7a34', edge: { color: '#6f7a3e88', width: 1 } },
        'forest': { fill: '#b8c291', pattern: 'forest-line', ink: HAND_INK, edge: { color: '#3b2f2499', width: 1.2 } },
        'jungle': { fill: '#a3b484', pattern: 'jungle-line', ink: '#2f3b24', edge: { color: '#3b2f2499', width: 1.2 } },
        'desert': { fill: '#ecd6a0', pattern: 'dunes', ink: '#b08a4e', edge: { color: '#b08a4e99', width: 1 } },
        'badlands': { fill: '#dbb38e', pattern: 'shrubs', ink: '#a8784e', edge: { color: '#8e5a3a99', width: 1 } },
        'tundra': { fill: '#e4e3d4', pattern: 'bare-trees', ink: '#6e665a', edge: { color: '#8a908f88', width: 1 } },
        'snow': { fill: '#f5f2e8', pattern: 'snow', ink: '#a8b0b4', edge: { color: '#7a808488', width: 1 } },
        'mountain': { fill: '#d0c19f', pattern: 'peaks', ink: HAND_INK, edge: { color: '#3b2f2499', width: 1.2 } },
        'snow-mountain': { fill: '#cdcbc4', pattern: 'snow-peaks', ink: '#4e5660', edge: { color: '#6a707899', width: 1.2 } },
        'volcanic': { fill: '#b39a8c', pattern: 'volcanoes', ink: HAND_INK, edge: { color: '#7a5a4c99', width: 1.2 } },
        'cave-floor': { fill: '#c2b294', pattern: 'rocks', ink: '#6b5a44', edge: { color: '#6b5a4499', width: 1.2 } },
        'road': { fill: '#dccb9f', edge: { color: '#3b2f2499', width: 1 } },
        'town-paving': { fill: '#d9cab0', pattern: 'bricks', ink: '#9a8a70', edge: { color: '#9a8a7099', width: 1 } },
    },
    paths: {
        'river': { color: '#6f8f96', casing: HAND_INK, widthScale: 1, taper: true, cap: 'round' },
        'road': { color: HAND_INK, dash: [1.6, 1.2], widthScale: 0.35, cap: 'round' },
        'route': { color: '#8a3a2a', dash: [0.01, 1.9], widthScale: 0.5, cap: 'round' },
        'trail': { color: HAND_INK, dash: [0.01, 2.2], widthScale: 0.3, cap: 'round' },
        'border': { color: '#7a2f3a', dash: [3.5, 1.3, 0.6, 1.3], widthScale: 0.3, cap: 'butt' },
        'sea-route': { color: '#4a6a74', dash: [1.8, 2], widthScale: 0.3, cap: 'round' },
    },
    label: {
        region: { font: HAND_SC, size: 1.6, weight: 400, color: HAND_INK, halo: '#efe3c2cc', spacing: 0.25 },
        town: { font: HAND_FONT, size: 0.8, weight: 400, color: HAND_INK, halo: '#efe3c2cc' },
        route: { font: HAND_FONT, size: 0.6, weight: 400, color: '#5a3a2a', halo: '#efe3c2aa', italic: true },
        small: { font: HAND_FONT, size: 0.45, weight: 400, color: HAND_INK, halo: '#efe3c2aa', italic: true },
    },
    badge: { fill: '#f3e8cc', text: HAND_INK, border: HAND_INK },
};

const ANIME_LINE = '#24324d';

const anime: MapStyle = {
    id: 'anime', name: 'Anime', folder: 'Anime', icon: 'fa-wand-magic-sparkles',
    edgeMode: 'smooth',
    backdrop: '#1c2335', frame: { color: ANIME_LINE, width: 4 },
    coast: { color: '#ffffff2e', widths: [1.1, 0.7, 0.4], skyOnly: true },
    depth: {
        steps: [0.45, 1, 1.7],
        colors: ['#dff8ffd0', '#b4e9ffa0', '#8fd6fa55', '#00000000'],
        line: { color: '#ffffff40', width: 1.5 },
    },
    line: { color: ANIME_LINE, width: 2.5 },
    shore: { color: '#1f6fb8', width: 3 },
    pixelated: false,
    grid: '#ffffff40',
    terrain: {
        'clouds': { fill: '#cfe6fb', pattern: 'puffs', ink: '#ffffff' },
        'deep-sea': { fill: '#2f7fd6', pattern: 'sparkle', ink: '#5a9de4' },
        'sea': { fill: '#48a6f2', pattern: 'sparkle', ink: '#8ccaf8' },
        'shallows': { fill: '#82d3f6', edge: { color: '#ffffffaa', width: 3 } },
        'lake': { fill: '#5cbaf2', pattern: 'sparkle', ink: '#a8dcfa', edge: { color: '#3a94dc', width: 2 } },
        'river': { fill: '#5cbaf2', pattern: 'sparkle', ink: '#a8dcfa', edge: { color: '#3a94dc', width: 2 } },
        'swamp': { fill: '#78a05e', pattern: 'swamp', ink: '#4e8a3c', edge: { color: '#4e7a3c', width: 2 } },
        'beach': { fill: '#f7e4a4', edge: { color: '#d9b862', width: 2 } },
        'grassland': { fill: '#86d66f', pattern: 'tussocks', ink: '#56a848', edge: { color: '#4f9a4a', width: 2 } },
        'flower-field': { fill: '#f8d0dc', pattern: 'flowers', ink: '#5aa84a', edge: { color: '#d88aa4', width: 2 } },
        'tall-grass': { fill: '#6cbf58', pattern: 'tall-tussocks', ink: '#3a8f3a', edge: { color: '#3f8a3f', width: 2 } },
        'forest': { fill: '#40a04a', pattern: 'forest-fill', ink: '#2f8040', edge: { color: '#2a7a38', width: 2 } },
        'jungle': { fill: '#2f8c4c', pattern: 'jungle-fill', ink: '#237038', edge: { color: '#1e6a34', width: 2 } },
        'desert': { fill: '#f4d26e', pattern: 'blobs', ink: '#ecc25a', edge: { color: '#c89a3a', width: 2 } },
        'badlands': { fill: '#dd8e56', pattern: 'shrubs', ink: '#b06a38', edge: { color: '#9a5a2e', width: 2 } },
        'tundra': { fill: '#d4eaf0', pattern: 'bare-trees', ink: '#6a6660', edge: { color: '#8ab4c4', width: 2 } },
        'snow': { fill: '#fafdff', pattern: 'sparkle', ink: '#d4ecf8', edge: { color: '#8ab4c4', width: 2 } },
        'mountain': { fill: '#b09a80', pattern: 'blobs', ink: '#9a8468', edge: { color: '#8a7258', width: 2 } },
        'snow-mountain': { fill: '#aebccc', pattern: 'snow-peaks', ink: '#5a6a80', edge: { color: '#8394a8', width: 2 } },
        'volcanic': { fill: '#6e4a46', pattern: 'volcanoes', ink: '#3a2624', edge: { color: '#4e3230', width: 2 } },
        'cave-floor': { fill: '#8e7c68', pattern: 'rocks', ink: '#5e4e3e', edge: { color: '#6a5846', width: 2 } },
        'road': { fill: '#ebd6a6', edge: { color: '#b89a64', width: 2 } },
        'town-paving': { fill: '#dcd7cf', pattern: 'bricks', ink: '#c4beb4', edge: { color: '#b0a89c', width: 2 } },
    },
    paths: {
        'river': { color: '#48a6f2', casing: ANIME_LINE, widthScale: 1, taper: true, cap: 'round' },
        'road': { color: '#f4e2b4', casing: '#9a7a4a', widthScale: 0.5, cap: 'round' },
        'route': { color: '#fff4b0', casing: '#d08a2a', widthScale: 0.55, cap: 'round' },
        'trail': { color: '#8a6a4a', dash: [0.01, 2], widthScale: 0.25, cap: 'round' },
        'border': { color: '#e0507a', dash: [2.5, 1.8], widthScale: 0.25, cap: 'round' },
        'sea-route': { color: '#ffffff', dash: [1.6, 2], widthScale: 0.25, cap: 'round' },
    },
    label: {
        region: { font: ANIME_FONT, size: 1.5, weight: 800, color: '#ffffff', halo: ANIME_LINE, upper: true, spacing: 0.08 },
        town: { font: ANIME_FONT, size: 0.75, weight: 700, color: '#ffffff', halo: ANIME_LINE },
        route: { font: ANIME_FONT, size: 0.6, weight: 700, color: ANIME_LINE, halo: '#ffffffdd' },
        small: { font: ANIME_FONT, size: 0.45, weight: 600, color: ANIME_LINE, halo: '#ffffffcc' },
    },
    badge: { fill: '#ffffff', text: ANIME_LINE, border: ANIME_LINE },
};

const townmap: MapStyle = {
    id: 'townmap', name: 'Town Map', folder: 'TownMap', icon: 'fa-map-location-dot',
    edgeMode: 'blocky',
    backdrop: '#101820', frame: { color: '#f8f8f8', width: 4 },
    pixelated: true,
    cellBorder: '#20402888',
    depth: { steps: [0.5, 1, 1.75], colors: ['#a8d4ffb0', '#8cc0f878', '#8cc0f838', '#00000000'] },
    line: { color: '#203028', width: 2 },
    shore: { color: '#284880', width: 2 },
    grid: '#ffffff30',
    terrain: {
        'clouds': { fill: '#c8dcf0', pattern: 'px-clouds', ink: '#f0f8ff' },
        'deep-sea': { fill: '#3868c0', pattern: 'px-waves', ink: '#4878d0' },
        'sea': { fill: '#5890e0', pattern: 'px-waves', ink: '#70a8f0' },
        'shallows': { fill: '#78b0f0' },
        'lake': { fill: '#5890e0', pattern: 'px-waves', ink: '#70a8f0' },
        'river': { fill: '#5890e0', pattern: 'px-waves', ink: '#70a8f0' },
        'swamp': { fill: '#709860' },
        'beach': { fill: '#e8d890' },
        'grassland': { fill: '#88c870' },
        'flower-field': { fill: '#f0c0d0' },
        'tall-grass': { fill: '#70b058' },
        'forest': { fill: '#489048' },
        'jungle': { fill: '#387840' },
        'desert': { fill: '#e0c070' },
        'badlands': { fill: '#c89060' },
        'tundra': { fill: '#c8e0e8' },
        'snow': { fill: '#f0f8f8' },
        'mountain': { fill: '#b09068' },
        'snow-mountain': { fill: '#b8c0d0' },
        'volcanic': { fill: '#886058' },
        'cave-floor': { fill: '#907860' },
        'road': { fill: '#f0e080' },
        'town-paving': { fill: '#e05048' },
    },
    paths: {
        'river': { color: '#5890e0', widthScale: 0.7, cap: 'square' },
        'road': { color: '#f0e080', casing: '#806020', widthScale: 0.6, cap: 'square' },
        'route': { color: '#f8e048', casing: '#886818', widthScale: 0.7, cap: 'square' },
        'trail': { color: '#d8c070', widthScale: 0.35, cap: 'square' },
        'border': { color: '#f8f8f8', dash: [2, 2], widthScale: 0.25, cap: 'butt' },
        'sea-route': { color: '#b0d0f8', dash: [1, 1], widthScale: 0.35, cap: 'butt' },
    },
    label: {
        region: { font: PIXEL_FONT, size: 1.3, weight: 700, color: '#f8f8f8', halo: '#304060', upper: true },
        town: { font: PIXEL_FONT, size: 0.6, weight: 700, color: '#f8f8f8', halo: '#304060' },
        route: { font: PIXEL_FONT, size: 0.5, weight: 600, color: '#303030', halo: '#f8f8f8' },
        small: { font: PIXEL_FONT, size: 0.4, weight: 500, color: '#303030', halo: '#f8f8f8cc' },
    },
    badge: { fill: '#f8f8f8', text: '#303030', border: '#303030' },
};

const overworld: MapStyle = {
    id: 'overworld', name: 'Overworld', folder: 'Overworld', icon: 'fa-gamepad',
    edgeMode: 'blocky',
    backdrop: '#101010', frame: { color: '#000000', width: 2 },
    pixelated: true,
    depth: { steps: [0.5, 1, 1.75], colors: ['#b8e4ffb0', '#98cff878', '#98cff838', '#00000000'] },
    line: { color: '#202020', width: 2 },
    shore: { color: '#1c4890', width: 2 },
    grid: '#00000030',
    terrain: {
        'clouds': { fill: '#d8e8f8', pattern: 'px-clouds', ink: '#ffffff' },
        'deep-sea': { fill: '#3070d8', pattern: 'px-water', ink: '#5890f0' },
        'sea': { fill: '#4890f0', pattern: 'px-water', ink: '#88c0f8' },
        'shallows': { fill: '#70b8f8', pattern: 'px-water', ink: '#a8d8f8' },
        'lake': { fill: '#4890f0', pattern: 'px-water', ink: '#88c0f8' },
        'river': { fill: '#4890f0', pattern: 'px-water', ink: '#88c0f8' },
        'swamp': { fill: '#607848', pattern: 'px-swamp', ink: '#78a048' },
        'beach': { fill: '#f0d898', pattern: 'px-sand', ink: '#d8b870' },
        'grassland': { fill: '#78c850', pattern: 'px-grass', ink: '#58a838' },
        'flower-field': { fill: '#f8d0d8', pattern: 'px-flowers', ink: '#58a838' },
        'tall-grass': { fill: '#58a838', pattern: 'px-tallgrass', ink: '#387820' },
        'forest': { fill: '#387830', pattern: 'px-forest', ink: '#58a040' },
        'jungle': { fill: '#286028', pattern: 'px-jungle', ink: '#408838' },
        'desert': { fill: '#e8c878', pattern: 'px-sand', ink: '#d0a858' },
        'badlands': { fill: '#c88858', pattern: 'px-shrubs', ink: '#98603a' },
        'tundra': { fill: '#d0e0e0', pattern: 'px-bare-trees', ink: '#605850' },
        'snow': { fill: '#f8f8f8', pattern: 'px-sand', ink: '#d8e8f0' },
        'mountain': { fill: '#a88860', pattern: 'px-rock', ink: '#806040' },
        'snow-mountain': { fill: '#d0d8e0', pattern: 'px-snow-peaks', ink: '#8890a0' },
        'volcanic': { fill: '#584040', pattern: 'px-volcanic', ink: '#e05020' },
        'cave-floor': { fill: '#886850', pattern: 'px-rocks', ink: '#5a4230' },
        'road': { fill: '#d8b878', pattern: 'px-sand', ink: '#c09858' },
        'town-paving': { fill: '#c8c0b0', pattern: 'px-bricks', ink: '#a8a090' },
    },
    paths: {
        'river': { color: '#4890f0', casing: '#285898', widthScale: 0.9, cap: 'square' },
        'road': { color: '#d8b878', casing: '#a88848', widthScale: 0.8, cap: 'square' },
        'route': { color: '#e0c888', casing: '#a88848', widthScale: 0.9, cap: 'square' },
        'trail': { color: '#c8a868', widthScale: 0.4, cap: 'square' },
        'border': { color: '#f8f8f8', dash: [2, 2], widthScale: 0.25, cap: 'butt' },
        'sea-route': { color: '#e0f0ff', dash: [1, 1], widthScale: 0.3, cap: 'butt' },
    },
    label: {
        region: { font: PIXEL_FONT, size: 1.2, weight: 700, color: '#f8f8f8', halo: '#202020', upper: true },
        town: { font: PIXEL_FONT, size: 0.6, weight: 700, color: '#f8f8f8', halo: '#202020' },
        route: { font: PIXEL_FONT, size: 0.5, weight: 600, color: '#f8f8f8', halo: '#202020' },
        small: { font: PIXEL_FONT, size: 0.4, weight: 500, color: '#f8f8f8', halo: '#202020cc' },
    },
    badge: { fill: '#f8f8f8', text: '#202020', border: '#202020' },
};

export const MAP_STYLES: MapStyle[] = [handdrawn, anime, townmap, overworld];

export const STYLE_BY_ID = new Map(MAP_STYLES.map((s) => [s.id, s]));

export function styleOf(id: string): MapStyle {
    return STYLE_BY_ID.get(id as StyleId) ?? handdrawn;
}

export const PATH_KINDS: { kind: PathKind; name: string; icon: string; width: number }[] = [
    { kind: 'river', name: 'River', icon: 'fa-water', width: 0.5 },
    { kind: 'road', name: 'Road', icon: 'fa-road', width: 0.6 },
    { kind: 'route', name: 'Route', icon: 'fa-route', width: 0.8 },
    { kind: 'trail', name: 'Trail', icon: 'fa-shoe-prints', width: 0.5 },
    { kind: 'border', name: 'Border', icon: 'fa-draw-polygon', width: 0.6 },
    { kind: 'sea-route', name: 'Sea route', icon: 'fa-ship', width: 0.6 },
];

export const LABEL_ROLES: { role: LabelRole; name: string }[] = [
    { role: 'region', name: 'Region' },
    { role: 'town', name: 'Town' },
    { role: 'route', name: 'Route' },
    { role: 'small', name: 'Small' },
];
