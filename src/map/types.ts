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
    /** Snap to the grid: true or false overrides the map's own setting,
        absent follows it. */
    snap?: boolean;
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
    /** Snap to the grid: true or false overrides the map's own setting,
        absent follows it. */
    snap?: boolean;
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
    /** Snap placed and dragged objects to the cells — the default each
        landmark and token follows unless it has its own setting. */
    snap: boolean;
    /** 0..1 */
    opacity: number;
}

/** How the edge between two terrains is drawn — see edges.ts. */
export type EdgeKind = 'style' | 'line' | 'plain' | 'soft';

export interface MapBorders {
    /** Every edge no terrain and no painted border says anything about. */
    kind: EdgeKind;
    /** How wide a Soft edge blends, in cells. */
    soft: number;
    /** A terrain's own edges, by slug; absent follows `kind`. */
    terrain: Partial<Record<string, EdgeKind>>;
}

export interface MapDoc {
    id: string;
    name: string;
    styleId: StyleId;
    cols: number;
    rows: number;
    /** Terrain samples per cell on each side — see raster.ts. */
    res: number;
    /** What a cell means, in the GM's words: "1 cell = 5 km". Shown, never computed with. */
    scaleLabel: string;
    grid: MapGrid;
    /** The terrain samples, run-length encoded — see raster.ts. A string
        rather than an array because it is by far the biggest thing in the
        file, and an immutable string is what lets undo snapshots share it. */
    terrain: string;
    /** The terrain code every bare sample shows — the layer under the
        painting. Rubbing terrain out uncovers it. */
    background: string;
    /** The painted border layer, run-length encoded like the terrain; empty
        when nothing was painted. See edges.ts. */
    edges: string;
    borders: MapBorders;
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

export type Tool = 'select' | 'paint' | 'fill' | 'erase' | 'edge' | 'path' | 'stamp' | 'token' | 'label' | 'pan';
