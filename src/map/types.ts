/* The Map Maker's saved shapes.

   Every position is in CELL units, as floats: (0, 0) is the top-left corner of
   the map and (cols, rows) the bottom-right. Nothing stores pixels, so resizing
   the map's cells, switching the grid off or changing style never moves a
   thing — the renderer multiplies by the cell size at draw time. */

export type StyleId = 'handdrawn' | 'anime' | 'townmap' | 'overworld';

export type PathKind = 'river' | 'road' | 'route' | 'trail' | 'border' | 'sea-route';

export interface MapPath {
    id: string;
    kind: PathKind;
    /** The simplified control points; the curve through them is drawn smooth. */
    points: [number, number][];
    /** Stroke width in cells. */
    width: number;
    label?: string;
    /** A Route's number, drawn as a badge halfway along. */
    routeNo?: string;
}

export interface MapStamp {
    id: string;
    /** The landmark's slug, which is also its sprite's file name. */
    landmark: string;
    x: number;
    y: number;
    /** Width and height in cells: the sprite is square. */
    size: number;
    /** Degrees. */
    rotation: number;
    flip: boolean;
    label?: string;
    /** A Gym's type, drawn as a badge in its corner. */
    type?: string;
}

export type TokenKind = 'pokemon' | 'trainer' | 'wild';

export interface MapToken {
    id: string;
    kind: TokenKind;
    /** The Pokédex `Image` file name, for a Pokémon token. */
    image?: string;
    name: string;
    x: number;
    y: number;
    size: number;
    /** The ring around the token — whose side it is on, at a glance. */
    color: string;
}

export type LabelRole = 'region' | 'town' | 'route' | 'small';

export interface MapLabel {
    id: string;
    text: string;
    x: number;
    y: number;
    role: LabelRole;
    /** Multiplies the role's own size. */
    scale: number;
    rotation: number;
}

export interface MapGrid {
    show: boolean;
    /** Snap placed and dragged objects to the cells. */
    snap: boolean;
    /** 0..1 */
    opacity: number;
}

export interface MapDoc {
    id: string;
    name: string;
    styleId: StyleId;
    cols: number;
    rows: number;
    /** What a cell means, in the GM's words: "1 cell = 5 km". Shown, never computed with. */
    scaleLabel: string;
    grid: MapGrid;
    /** One terrain code per cell, row by row — see terrain.ts. A string rather
        than an array because it is by far the biggest thing in the file, and one
        character a cell keeps a 200x200 map to 40 KB. */
    terrain: string;
    paths: MapPath[];
    stamps: MapStamp[];
    tokens: MapToken[];
    labels: MapLabel[];
    /** ISO time of the last change, for the map list. */
    updatedAt: string;
}

/** Which object is selected, if any. */
export interface Selection {
    kind: 'stamp' | 'token' | 'label' | 'path';
    id: string;
}

export type Tool = 'select' | 'paint' | 'fill' | 'erase' | 'path' | 'stamp' | 'token' | 'label' | 'pan';
