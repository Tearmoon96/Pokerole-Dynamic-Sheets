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
    /** The outline where this terrain's region ends, in world px at 1x. */
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
    /** Blocky styles: a 1px line between two different terrains. */
    cellBorder?: string;
    /** Shading laid along the coast on the water side, one stroke per width
        (in cells), each in `color` — translucent, so they build up towards the
        shore. The old-map coastal wash; nothing is drawn without it. */
    coast?: { color: string; widths: number[] };
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
    coast: { color: '#3f5e5a1c', widths: [1.8, 1.3, 0.85, 0.45] },
    pixelated: false,
    grid: '#3b2f2455',
    terrain: {
        'deep-sea': { fill: '#9fb4ae', pattern: 'waves', ink: '#5d7a74' },
        'sea': { fill: '#b6c8bd', pattern: 'waves', ink: '#7d968c' },
        'shallows': { fill: '#cbd8c6', pattern: 'ripples', ink: '#8fa89a' },
        'lake': { fill: '#b6c8bd', pattern: 'ripples', ink: '#7d968c', edge: { color: HAND_INK, width: 1.6 } },
        'swamp': { fill: '#b3b58c', pattern: 'reeds', ink: '#6b6a45', edge: { color: '#6b6a4588', width: 1 } },
        'beach': { fill: '#ecdfb2', pattern: 'sand', ink: '#b8a472', edge: { color: HAND_INK, width: 2.2 } },
        'grassland': { fill: '#e2dcae', pattern: 'stipple', ink: '#9a9a62' },
        'tall-grass': { fill: '#d3d29b', pattern: 'tufts', ink: '#6f7a3e', edge: { color: '#6f7a3e88', width: 1 } },
        'forest': { fill: '#b8c291', pattern: 'trees', ink: HAND_INK, edge: { color: '#3b2f2499', width: 1.2 } },
        'jungle': { fill: '#a3b484', pattern: 'trees', ink: '#2f3b24', edge: { color: '#3b2f2499', width: 1.2 } },
        'desert': { fill: '#ecd6a0', pattern: 'dunes', ink: '#b08a4e', edge: { color: '#b08a4e99', width: 1 } },
        'badlands': { fill: '#dbb38e', pattern: 'hatch', ink: '#8e5a3a', edge: { color: '#8e5a3a99', width: 1 } },
        'tundra': { fill: '#e4e3d4', pattern: 'stipple', ink: '#9aa0a0', edge: { color: '#8a908f88', width: 1 } },
        'snow': { fill: '#f5f2e8', pattern: 'snow', ink: '#a8b0b4', edge: { color: '#7a808488', width: 1 } },
        'mountain': { fill: '#d0c19f', pattern: 'peaks', ink: HAND_INK, edge: { color: '#3b2f2499', width: 1.2 } },
        'volcanic': { fill: '#b39a8c', pattern: 'cracks', ink: '#7a2f1f', edge: { color: HAND_INK, width: 1.4 } },
        'cave-floor': { fill: '#c2b294', pattern: 'hatch', ink: '#6b5a44', edge: { color: HAND_INK, width: 1.4 } },
        'road': { fill: '#dccb9f', edge: { color: '#3b2f2499', width: 1 } },
        'town-paving': { fill: '#d9cab0', pattern: 'bricks', ink: '#9a8a70', edge: { color: HAND_INK, width: 1.4 } },
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
    coast: { color: '#ffffff2e', widths: [1.1, 0.7, 0.4] },
    pixelated: false,
    grid: '#ffffff40',
    terrain: {
        'deep-sea': { fill: '#2f7fd6', pattern: 'sparkle', ink: '#5a9de4' },
        'sea': { fill: '#48a6f2', pattern: 'sparkle', ink: '#8ccaf8' },
        'shallows': { fill: '#82d3f6', edge: { color: '#ffffffaa', width: 3 } },
        'lake': { fill: '#5cbaf2', pattern: 'sparkle', ink: '#a8dcfa', edge: { color: ANIME_LINE, width: 2.5 } },
        'swamp': { fill: '#78a05e', pattern: 'blobs', ink: '#5e8a4c', edge: { color: ANIME_LINE, width: 2 } },
        'beach': { fill: '#f7e4a4', edge: { color: ANIME_LINE, width: 3 } },
        'grassland': { fill: '#86d66f', edge: { color: '#4f9a4a', width: 2 } },
        'tall-grass': { fill: '#62c253', pattern: 'blades', ink: '#3f9a3f', edge: { color: '#3f8a3f', width: 2 } },
        'forest': { fill: '#40a04a', pattern: 'canopy', ink: '#2f8040', edge: { color: ANIME_LINE, width: 2.5 } },
        'jungle': { fill: '#2f8c4c', pattern: 'canopy', ink: '#237038', edge: { color: ANIME_LINE, width: 2.5 } },
        'desert': { fill: '#f4d26e', pattern: 'blobs', ink: '#ecc25a', edge: { color: '#c89a3a', width: 2 } },
        'badlands': { fill: '#dd8e56', pattern: 'blobs', ink: '#c87a44', edge: { color: '#9a5a2e', width: 2 } },
        'tundra': { fill: '#d4eaf0', edge: { color: '#8ab4c4', width: 2 } },
        'snow': { fill: '#fafdff', pattern: 'sparkle', ink: '#d4ecf8', edge: { color: '#8ab4c4', width: 2 } },
        'mountain': { fill: '#b09a80', pattern: 'blobs', ink: '#9a8468', edge: { color: ANIME_LINE, width: 2.5 } },
        'volcanic': { fill: '#6e4a46', pattern: 'blobs', ink: '#e0643a', edge: { color: ANIME_LINE, width: 2.5 } },
        'cave-floor': { fill: '#8e7c68', edge: { color: ANIME_LINE, width: 2.5 } },
        'road': { fill: '#ebd6a6', edge: { color: '#b89a64', width: 2 } },
        'town-paving': { fill: '#dcd7cf', pattern: 'bricks', ink: '#c4beb4', edge: { color: ANIME_LINE, width: 2 } },
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
    grid: '#ffffff30',
    terrain: {
        'deep-sea': { fill: '#3868c0', pattern: 'px-waves', ink: '#4878d0' },
        'sea': { fill: '#5890e0', pattern: 'px-waves', ink: '#70a8f0' },
        'shallows': { fill: '#78b0f0' },
        'lake': { fill: '#5890e0', pattern: 'px-waves', ink: '#70a8f0' },
        'swamp': { fill: '#709860' },
        'beach': { fill: '#e8d890' },
        'grassland': { fill: '#88c870' },
        'tall-grass': { fill: '#70b058' },
        'forest': { fill: '#489048' },
        'jungle': { fill: '#387840' },
        'desert': { fill: '#e0c070' },
        'badlands': { fill: '#c89060' },
        'tundra': { fill: '#c8e0e8' },
        'snow': { fill: '#f0f8f8' },
        'mountain': { fill: '#b09068' },
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
    grid: '#00000030',
    terrain: {
        'deep-sea': { fill: '#3070d8', pattern: 'px-water', ink: '#5890f0' },
        'sea': { fill: '#4890f0', pattern: 'px-water', ink: '#88c0f8' },
        'shallows': { fill: '#70b8f8', pattern: 'px-water', ink: '#a8d8f8' },
        'lake': { fill: '#4890f0', pattern: 'px-water', ink: '#88c0f8' },
        'swamp': { fill: '#607848', pattern: 'px-swamp', ink: '#485838' },
        'beach': { fill: '#f0d898', pattern: 'px-sand', ink: '#d8b870' },
        'grassland': { fill: '#78c850', pattern: 'px-grass', ink: '#58a838' },
        'tall-grass': { fill: '#58a838', pattern: 'px-tallgrass', ink: '#387820' },
        'forest': { fill: '#387830', pattern: 'px-tree', ink: '#58a040' },
        'jungle': { fill: '#286028', pattern: 'px-tree', ink: '#408838' },
        'desert': { fill: '#e8c878', pattern: 'px-sand', ink: '#d0a858' },
        'badlands': { fill: '#c88858', pattern: 'px-rock', ink: '#a06840' },
        'tundra': { fill: '#d0e0e0', pattern: 'px-sand', ink: '#b0c8c8' },
        'snow': { fill: '#f8f8f8', pattern: 'px-sand', ink: '#d8e8f0' },
        'mountain': { fill: '#a88860', pattern: 'px-rock', ink: '#806040' },
        'volcanic': { fill: '#584040', pattern: 'px-lava', ink: '#e05020' },
        'cave-floor': { fill: '#886850', pattern: 'px-rock', ink: '#685038' },
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
