/* The Map Maker's saved shapes.

   Every position is in CELL units, as floats: (0, 0) is the top-left corner of
   the map and (cols, rows) the bottom-right. Nothing stores pixels, so resizing
   the map's cells, switching the grid off or changing style never moves a
   thing — the renderer multiplies by the cell size at draw time. */

export type StyleId = 'handdrawn' | 'ancient' | 'anime' | 'townmap' | 'overworld';

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
    /** Shown under it; may run over several lines. */
    label?: string;
    /** 'hover': the label shows only while the pointer is over the
        landmark (or it is selected), and a picture of the map — the PNG,
        the players' view at the table — leaves it out. Absent: always. */
    labelShow?: 'hover';
    /** A single filler (`landmark` is `filler:<terrain>`): which of the
        terrain's markers it is. See fillerStamps.ts. */
    variant?: number;
    /** A Gym's type, drawn as a badge in its corner. */
    type?: string;
    /** Snap to the grid: true or false overrides the map's own setting,
        absent follows it. */
    snap?: boolean;
    /** The id of the map this landmark opens: a city on a world map, an
        interior in a city. Absent, or naming a map that is gone: nothing to
        open yet. See world.ts. */
    link?: string;
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

/** How a freehand sketch's line looks — see sketch.ts. */
export type SketchBrush = 'pen' | 'marker' | 'dashed' | 'dotted';

/** A freehand line the GM drew over the map: a note, a circle round a
    town, an arrow for where the party heads. Nothing to do with terrain. */
export interface MapSketch {
    id: string;
    brush: SketchBrush;
    /** The pointer's track, thinned; drawn as a smooth curve through it. */
    points: [number, number][];
    color: string;
    /** Line width in cells. */
    width: number;
    /** 0..1 */
    opacity: number;
    /** An arrowhead at the end. */
    arrow?: boolean;
    /** Drawn with straight segments through its points, corners kept: a
        shape from the Sketch tool's Shape mode (a closed one repeats its
        first point at the end). Absent: a smooth freehand curve. */
    straight?: boolean;
}

/** A building, tree or bench in a city (the World Builder's city builder):
    a catalogue item standing on a FOOTPRINT of whole cells, drawn by a
    vector painter as a sprite taller than the footprint and anchored to its
    bottom edge, so a roof overlaps what stands behind it. See world/placed.ts. */
export interface MapPlaced {
    id: string;
    /** The catalogue slug — see world/catalog.ts. Append-only, like landmarks. */
    item: string;
    /** The footprint's top-left corner, in cells. */
    x: number;
    y: number;
    flip?: boolean;
    /** Turned a quarter: the footprint's width and depth swap. Only items
        that offer it (fences, benches, hedges). */
    rot?: 1;
    /** Which of the item's variants (world/catalog.ts); the first when absent. */
    variant?: number;
    /** The item's own colours, slot by slot; a missing slot keeps the
        catalogue's. */
    colors?: string[];
    label?: string;
    labelShow?: 'hover';
    /** The map it opens, like a landmark's — an interior. */
    link?: string;
    snap?: boolean;
    /** A piece of a wall or fence drawn as a run (world/walls.ts): its line
        on the ground from (x + seg[0], y + seg[1]) to (x + seg[2], y + seg[3]),
        in cells. x/y are then the smaller ends of that line, not a corner of
        the footprint (which is the line widened by the wall's thickness). */
    seg?: [number, number, number, number];
    /** The pieces drawn in one drag share it: a click selects them all. */
    run?: string;
}

/** What a GM note is attached to: a landmark, a placed thing, or a whole
    wall or fence drawn as a run (every piece of it). */
export interface NoteTarget {
    kind: 'stamp' | 'placed' | 'run';
    id: string;
}

/** A note for the GM's eyes only (owner's request, 2026-11-11): the
    description of a place prepared before the session. Either attached to
    an object (`on`), or free over an area of the map (`x/y/w/h`, a point
    when `w` and `h` are 0). Drawn by the editor alone — never in a picture
    of the map, never sent to the table. See notes.ts. */
export interface MapNote {
    id: string;
    title: string;
    text: string;
    on?: NoteTarget;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
}

/** An interior's floor plan (world/room.ts): an outline of corners on whole
    cells; outside it is nothing, the edges with the room below them stand as
    back walls `wallH` cells tall. */
export interface MapRoom {
    pts: [number, number][];
    wallH: number;
    floor: import('./world/room').FloorKind;
    floorColor: string;
    wall: import('./world/room').WallKind;
    wallColor: string;
    /** The tops of the walls and the skirting. */
    trim: string;
    /** Walls drawn inside (owner's request, 2026-11-10): unit edges of the
        grid, `h<x>,<y>` from (x,y) to (x+1,y) and `v<x>,<y>` from (x,y) to
        (x,y+1). A horizontal one stands like a back wall over the room below it. */
    walls?: string[];
    /** Floors painted over parts of the map: `cols * rows` characters, row
        by row; '.' keeps the room's own floor (or the outside's), any other
        is an index into `floorPaints` (room.ts FINISH_CHARS). */
    floorGrid?: string;
    floorPaints?: FloorFinish[];
    /** The wallpaper of single wall pieces, by piece key (the keys of
        `walls`, and the outline's own pieces); the rest use `wall`. */
    wallPaints?: Record<string, WallFinish>;
    /** What lies outside the walls: a ground (a garden, a yard) people can
        walk and build on; absent, nothing (dark). */
    outside?: FloorFinish;
}

export interface FloorFinish { kind: import('./world/room').FloorKind; color: string }
export interface WallFinish { kind: import('./world/room').WallKind; color: string }

/** How a city or interior's buildings are coloured — see world/looks.ts. */
export type LookId = 'colorful' | 'ancient' | 'pastel' | 'night';

export type LabelRole = 'region' | 'town' | 'route' | 'small';

export type LabelAlign = 'left' | 'center' | 'right';
export type LabelCase = 'none' | 'upper' | 'lower' | 'title';
export type LabelWarp = 'none' | 'arc' | 'arch' | 'circle' | 'wave' | 'flag' | 'rise' | 'bulge';

export interface MapLabel {
    id: string;
    text: string;
    x: number;
    y: number;
    role: LabelRole;
    /** Multiplies the role's own size. */
    scale: number;
    rotation: number;
    /* Type settings. Every one is optional: absent follows the role's look
       in the map's style, so switching style still restyles an untouched
       label. See labelText.ts. */
    /** An id from LABEL_FONTS. */
    font?: string;
    weight?: number;
    italic?: boolean;
    caps?: LabelCase;
    color?: string;
    halo?: string;
    /** The halo's width as a fraction of the size; 0 for none. */
    haloWidth?: number;
    /** 0..1 */
    opacity?: number;
    /** Extra letter spacing, in ems. */
    spacing?: number;
    /** Baseline to baseline, in ems. */
    lineHeight?: number;
    align?: LabelAlign;
    direction?: 'horizontal' | 'vertical';
    warp?: LabelWarp;
    /** -100..100 */
    bend?: number;
    /** Degrees the letters lean, -45..45. */
    slant?: number;
    /** Horizontal scale, 0.3..3. */
    stretch?: number;
    shadow?: boolean;
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

/** A picture of the GM's own under the map — see picture.ts. Where it lies
    is in cells like everything else, so resizing the map leaves it where it
    was; "Fit to map" stretches it over the whole map again. */
export interface MapPicture {
    /** The key of its bytes in IndexedDB: the picture's hash. */
    id: string;
    /** The file it came from, to show. */
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** 0.1..1 */
    opacity: number;
}

/** What a map is in the World Builder: a region, a city in it, or the inside
    of a building. Every kind is drawn and edited the same way for now; the
    city and interior builders add their own layers. */
export type DocKind = 'world' | 'city' | 'interior';

/** Where a map is entered from: the map and the landmark on it that links here. */
export interface DocParent {
    doc: string;
    object: string;
}

export interface MapDoc {
    id: string;
    name: string;
    /** Absent in a map from before the World Builder: a world map. */
    kind: DocKind;
    parent?: DocParent;
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
    /** A picture under the terrain: bare ground shows it instead of the
        background terrain. Absent on an ordinary map. */
    picture?: MapPicture;
    /** The painted border layer, run-length encoded like the terrain; empty
        when nothing was painted. See edges.ts. */
    edges: string;
    borders: MapBorders;
    /** Fog of war over everything, run-length encoded on the terrain's
        samples; empty when there is none. See fog.ts. */
    fog: string;
    /** Painted fillers: a terrain's markers (peaks, flowers, trees) laid
        over the ground on top of its own, run-length encoded on the
        terrain's samples; empty when none were painted. See fillers.ts. */
    fillers: string;
    paths: MapPath[];
    stamps: MapStamp[];
    tokens: MapToken[];
    labels: MapLabel[];
    /** Freehand sketches, drawn over the labels and under the tokens. */
    sketches: MapSketch[];
    /** Buildings and street furniture (cities and interiors), drawn in depth
        order with the tokens. Empty on a world map. */
    placed: MapPlaced[];
    /** The colouring of the placed things; absent: Colorful. */
    look?: LookId;
    /** An interior's floor plan: walls, floor and wallpaper (world/room.ts). */
    room?: MapRoom;
    /** The GM's notes (notes.ts). Absent on a map from before them. Never
        drawn into a picture and never sent to the table. */
    notes?: MapNote[];
    /** ISO time of the last change, for the map list. */
    updatedAt: string;
}

/** Which object is selected, if any. */
export interface Selection {
    kind: 'stamp' | 'token' | 'label' | 'path' | 'sketch' | 'placed';
    id: string;
}

export type Tool = 'select' | 'paint' | 'fill' | 'shape' | 'erase' | 'edge' | 'fog' | 'unfog' | 'path' | 'stamp' | 'build' | 'room' | 'token' | 'label' | 'sketch' | 'note' | 'pan';
