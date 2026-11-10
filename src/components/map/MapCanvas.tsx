import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { linkedDoc } from '../../map/world';
import { footprint, pieceOf, placeAt, segEnds, spriteBox, variantOf } from '../../map/world/placed';
import { itemOf, runShapeOf } from '../../map/world/catalog';
import { runPath, splitRun, underGate } from '../../map/world/walls';
import type { RunShape } from '../../map/world/walls';
import { RoomCursor, RoomHandles, RoomLayer } from './RoomLayer';
import { edgesBetween, nearestEdge, pieceAt, regionOf, wallsOfRegion, withFloor, withWallpaper, withWalls } from '../../map/world/room';
import { lookOf } from '../../map/world/looks';
import { BuildGhost, DepthLayer, resFor } from './PlacedLayer';
import { useMap } from '../../map/MapContext';
import { PATH_KINDS, styleOf } from '../../map/styles';
import { snapPoint, snapsFor, uid } from '../../map/doc';
import { EMPTY, allowTable, codeIndex, encode, floodFill, rasterOf, remember, resolvedOf } from '../../map/raster';
import type { Canvas } from '../../map/raster';
import { BRUSH_BY_ID, cleanSize, newStroke, strokeSegment } from '../../map/brushes';
import type { Stroke } from '../../map/brushes';
import { PAINT_INHERIT, blankEdges, edgesOf, encodeEdges, paintValue, rememberEdges } from '../../map/edges';
import { FOG_CLEAR, blankFog, encodeFog, fogOf, fogValue, rememberFog } from '../../map/fog';
import { NO_FILLER, blankFillers, encodeFillers, fillersOf, rememberFillers } from '../../map/fillers';
import { fogImage } from '../../map/render/fog';
import { paintShape, shapeGeometry, shapeHasSize } from '../../map/shapes';
import type { ShapeGeometry } from '../../map/shapes';
import { slotOf } from '../../map/store';
import type { BrushSetting, MapUi } from '../../map/store';
import { distToPolyline, simplify } from '../../map/geometry';
import type { Pt } from '../../map/geometry';
import { FILLER_PREFIX, FILLER_SIZE, landmarkOf } from '../../map/landmarks';
import { CELL } from '../../map/render/patterns';
import { buildGeometry, drawEdgeTint, drawGrid, drawTerrain, geometryKey } from '../../map/render/terrain';
import { onPictureArrived, pictureNow } from '../../map/picture';
import type { TerrainGeometry } from '../../map/render/terrain';
import { onImageArrived } from '../../map/sprites';
import { LabelsLayer, PathsLayer, SketchesLayer, StampsLayer, TokensLayer } from './MapObjects';
import { cleanSketchWidth, finishTrack, shapeTrack } from '../../map/sketch';
import type { Grab, ObjectDown } from './MapObjects';
import { useToast } from '../common/Toast';
import type { MapDoc, MapSketch, Selection, Tool } from '../../map/types';
import { sameSel } from '../../map/store';

/* The map itself: a canvas for the ground, and the world layer on top of it
   holding paths, stamps, labels and tokens as real elements.

   The canvas is the size of the viewport and redraws the ground under the view
   transform; the world layer is the size of the MAP in world px and is simply
   CSS-transformed by the same view. Both read one `view` — the offset of the
   map's top-left corner on screen, and the zoom.

   Every gesture is one pointer sequence handled here. The objects hand their
   own pointerdown up through `onObjectDown`, and the stage takes the pointer
   capture either way, so a drag carries on even when it leaves the element it
   began on. */

export interface View { x: number; y: number; zoom: number }

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;

type Gesture =
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
    /* A stroke paints into its own copy of the samples and publishes it at
       most once a frame: encoding a big map is milliseconds, and a pointer
       reports far more often than the screen redraws. */
    | ({ kind: 'paint' } & Stroking)
    | { kind: 'path'; pts: Pt[] }
    /* A shape: redrawn from the map as it was at the press on every move,
       so it can shrink back as well as grow. `even` is Alt held. */
    | { kind: 'shape'; start: Pt; end: Pt; even: boolean; base: MapDoc; frame: number | null }
    /* A freehand sketch: the pointer's track, and the zoom it is drawn at,
       which decides how closely the track is kept. */
    | { kind: 'sketch'; pts: Pt[]; pxPerCell: number }
    | { kind: 'sketchErase' }
    /* A shape drawn as a sketch: the same drag and Alt rule as the Shapes
       tool, kept as a draft until the button is let go. */
    | { kind: 'sketchShape'; start: Pt; end: Pt; even: boolean }
    | { kind: 'erase' }
    /* Everything selected moves together; `anchor` is the one under the
       pointer, the one whose snapping decides the step for all of them. */
    | { kind: 'move'; items: { sel: Selection; orig: Pt[] }[]; anchor: number; start: Pt; moved: boolean; narrow?: Selection }
    | { kind: 'box'; start: Pt; add: boolean; base: Selection[] }
    | { kind: 'resize'; sel: Selection; centre: Pt }
    | { kind: 'rotate'; sel: Selection; centre: Pt }
    | { kind: 'vertex'; sel: Selection; index: number }
    | { kind: 'pinch'; dist: number; mid: Pt; view: View }
    /* The Room tool drawing walls (from grid corner to grid corner), or
       painting floors or wallpaper under the pointer. */
    | { kind: 'room'; mode: 'walls' | 'floor' | 'wallpaper'; vertex: Pt | null; start: Pt; moved: boolean }
    /* A wall or fence dragged as a line, a rectangle, a circle or an ellipse. */
    | { kind: 'wall'; shape: RunShape; item: string; start: Pt; end: Pt };

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/** A brush stroke under way: the painting tool, the eraser's terrain mode,
    the Borders brush and the two fog brushes all stroke the same way, into
    their own layers. */
interface Stroking {
    last: Pt;
    canvas: Canvas;
    /** The copies being painted, whichever of them this stroke writes. */
    terrain: Uint8Array | null;
    edges: Uint8Array | null;
    fog: Uint8Array | null;
    fillers: Uint8Array | null;
    brush: BrushSetting;
    stroke: Stroke;
    frame: number | null;
}

/** The layers one press of a painting tool writes, as copies to paint into:
    terrain and its border look for the brush, bare ground and no border for
    the eraser, the border look alone for the Borders brush, and the fog
    alone for the two fog brushes — which never touch the ground under it —
    and the fillers alone for the brush in filler mode. The eraser rubs
    painted fillers out with the terrain. */
function strokeLayers(d: MapDoc, tool: Tool,
    ui: Pick<MapUi, 'terrain' | 'paintEdge' | 'edgeKind' | 'fogColor' | 'fogStrength' | 'paintLayer' | 'filler'>):
    { terrain: Uint8Array | null; edges: Uint8Array | null; fog: Uint8Array | null; fillers: Uint8Array | null; canvas: Canvas } {
    const r = rasterOf(d);
    const had = edgesOf(d);
    const edgeCopy = () => (had ? had.slice() : blankEdges(d));
    const layers: Canvas['layers'] = [];
    let terrain: Uint8Array | null = null, edges: Uint8Array | null = null, fog: Uint8Array | null = null;
    let fillers: Uint8Array | null = null;
    if (tool === 'paint' && ui.paintLayer === 'fillers') {
        fillers = fillersOf(d)?.slice() ?? blankFillers(d);
        layers.push({ data: fillers, value: codeIndex(ui.filler) });
    } else if (tool === 'fog' || tool === 'unfog') {
        fog = fogOf(d)?.slice() ?? blankFog(d);
        layers.push({ data: fog, value: tool === 'fog' ? fogValue(ui.fogColor, ui.fogStrength) : FOG_CLEAR });
    } else if (tool === 'edge') {
        edges = edgeCopy();
        layers.push({ data: edges, value: paintValue(ui.edgeKind) });
    } else {
        terrain = r.data.slice();
        const erase = tool === 'erase';
        layers.push({ data: terrain, value: erase ? EMPTY : codeIndex(ui.terrain) });
        const edge = erase ? PAINT_INHERIT : paintValue(ui.paintEdge);
        /* Laying "the map decides" on a map where nothing was ever painted
           changes nothing: skip the layer. */
        if (edge !== PAINT_INHERIT || had) {
            edges = edgeCopy();
            layers.push({ data: edges, value: edge });
        }
        const filled = erase ? fillersOf(d) : null;
        if (filled) {
            fillers = filled.slice();
            layers.push({ data: fillers, value: NO_FILLER });
        }
    }
    return { terrain, edges, fog, fillers, canvas: { w: r.w, h: r.h, res: r.res, layers } };
}

/** What a terrain stroke pressed at `at` may cover — see Canvas.guard.
    Smart painting refuses the locked terrains; staying on the start refuses
    everything but the terrain under the press. Both together keep only what
    both allow. Null when neither is on: the brush covers anything. */
function strokeGuard(d: MapDoc, ui: Pick<MapUi, 'smartPaint' | 'lockedTerrains' | 'stayOnStart'>, at: Pt): Canvas['guard'] | null {
    if (!ui.smartPaint && !ui.stayOnStart) return null;
    const r = resolvedOf(d);
    const locked = new Set(ui.smartPaint ? ui.lockedTerrains.map(codeIndex) : []);
    const sx = Math.min(r.w - 1, Math.floor(at[0] * r.res)), sy = Math.min(r.h - 1, Math.floor(at[1] * r.res));
    const start = r.data[sy * r.w + sx];
    return {
        looks: r.data,
        allow: allowTable((i) => !locked.has(i) && (!ui.stayOnStart || i === start)),
    };
}

/* Capture keeps a drag coming to the stage after it leaves the element it
   started on. It throws for a pointer the browser no longer counts as down
   (a pen lifted mid-event, a synthetic event), and a drag without capture
   still works while the pointer stays over the stage — so never let that
   failure end the gesture. */
/** Two selections merged, without repeats. */
function union(a: Selection[], b: Selection[]): Selection[] {
    return [...a, ...b.filter((x) => !a.some((y) => sameSel(x, y)))];
}

function capture(el: HTMLElement, pointerId: number): void {
    try { el.setPointerCapture(pointerId); } catch { /* not capturable: carry on without */ }
}

/** Remove whatever `data-obj` names from the doc. */
function removeObject(d: MapDoc, tag: string): boolean {
    const [kind, id] = tag.split(':');
    const count = () => d.stamps.length + d.tokens.length + d.labels.length + d.paths.length + d.sketches.length + d.placed.length;
    const before = count();
    if (kind === 'stamp') d.stamps = d.stamps.filter((o) => o.id !== id);
    if (kind === 'token') d.tokens = d.tokens.filter((o) => o.id !== id);
    if (kind === 'label') d.labels = d.labels.filter((o) => o.id !== id);
    if (kind === 'path') d.paths = d.paths.filter((o) => o.id !== id);
    if (kind === 'sketch') d.sketches = d.sketches.filter((o) => o.id !== id);
    if (kind === 'placed') d.placed = d.placed.filter((o) => o.id !== id);
    return count() !== before;
}

/** Everything whose position (or, for a path, any of whose points) lies in
    the box between two corners, in cell units. */
function objectsInBox(d: MapDoc, a: Pt, b: Pt): Selection[] {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    return [
        ...d.paths.filter((p) => p.points.some(([x, y]) => inBox(x, y))).map((p) => ({ kind: 'path' as const, id: p.id })),
        ...d.sketches.filter((k) => k.points.some(([x, y]) => inBox(x, y))).map((k) => ({ kind: 'sketch' as const, id: k.id })),
        ...d.stamps.filter((o) => inBox(o.x, o.y)).map((o) => ({ kind: 'stamp' as const, id: o.id })),
        ...d.labels.filter((o) => inBox(o.x, o.y)).map((o) => ({ kind: 'label' as const, id: o.id })),
        ...d.tokens.filter((o) => inBox(o.x, o.y)).map((o) => ({ kind: 'token' as const, id: o.id })),
        ...d.placed.filter((o) => { const f = footprint(o); return inBox(f.x + f.w / 2, f.y + f.h / 2); })
            .map((o) => ({ kind: 'placed' as const, id: o.id })),
    ];
}

/** The position (or, for a path, all the points) of a selected object. */
function positionsOf(d: MapDoc, sel: Selection): Pt[] {
    if (sel.kind === 'path') return (d.paths.find((p) => p.id === sel.id)?.points ?? []).map((p) => [p[0], p[1]] as Pt);
    if (sel.kind === 'sketch') return (d.sketches.find((k) => k.id === sel.id)?.points ?? []).map((p) => [p[0], p[1]] as Pt);
    if (sel.kind === 'placed') { const o = d.placed.find((x) => x.id === sel.id); return o ? [[o.x, o.y]] : []; }
    const list = sel.kind === 'stamp' ? d.stamps : sel.kind === 'token' ? d.tokens : d.labels;
    const o = (list as { id: string; x: number; y: number }[]).find((x) => x.id === sel.id);
    return o ? [[o.x, o.y]] : [];
}

/** Where each map was looked at from, this session (World Builder). */
const VIEWS = new Map<string, View>();

export function MapCanvas({ spaceHeld }: { spaceHeld: boolean }) {
    const { store, doc, ui } = useMap();
    const toast = useToast();
    const style = styleOf(doc.styleId);
    const tool = ui.tool;
    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
    const viewRef = useRef(view);
    viewRef.current = view;
    const geoRef = useRef<TerrainGeometry | null>(null);
    const [texTick, setTexTick] = useState(0);
    const [hover, setHover] = useState<Pt | null>(null);
    const [draft, setDraft] = useState<Pt[] | null>(null);
    const [sketchDraft, setSketchDraft] = useState<MapSketch | null>(null);
    const [shapeDraft, setShapeDraft] = useState<ShapeGeometry | null>(null);
    const [runDraft, setRunDraft] = useState<{ pts: Pt[]; closed: boolean; thick: number } | null>(null);
    /* The drag box of a Select drag on empty ground, corners in cell units. */
    const [box, setBox] = useState<[Pt, Pt] | null>(null);
    const gesture = useRef<Gesture | null>(null);
    const pointers = useRef(new Map<number, Pt>());
    const fitted = useRef('');

    /* ---------------------------------------------------------------- sizing */

    useLayoutEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    const fit = useCallback(() => {
        const { w, h } = { w: stageRef.current?.clientWidth ?? 0, h: stageRef.current?.clientHeight ?? 0 };
        if (!w || !h) return;
        const d = store.doc;
        const zoom = clampZoom(Math.min(w / (d.cols * CELL), h / (d.rows * CELL)) * 0.92);
        setView({ zoom, x: (w - d.cols * CELL * zoom) / 2, y: (h - d.rows * CELL * zoom) / 2 });
    }, [store]);

    /* A different map, or the first measurement: frame the whole of it —
       or, for a map already visited this session, put the view back where
       it was, so stepping into a city and out again lands on the same spot. */
    useEffect(() => {
        if (!size.w || fitted.current === doc.id) return;
        if (fitted.current) VIEWS.set(fitted.current, viewRef.current);
        fitted.current = doc.id;
        const was = VIEWS.get(doc.id);
        if (was) setView(was);
        else fit();
    }, [doc.id, size.w, fit]);

    useEffect(() => {
        const onFit = () => fit();
        window.addEventListener('map-fit', onFit);
        return () => window.removeEventListener('map-fit', onFit);
    }, [fit]);

    useEffect(() => onImageArrived(() => setTexTick((n) => n + 1)), []);
    useEffect(() => onPictureArrived(() => setTexTick((n) => n + 1)), []);

    /* --------------------------------------------------------------- drawing */

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !size.w) return;
        const frame = requestAnimationFrame(() => {
            const dpr = window.devicePixelRatio || 1;
            const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr);
            if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = style.backdrop;
            ctx.fillRect(0, 0, W, H);
            ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y);
            const key = geometryKey(doc, style);
            if (!geoRef.current || geoRef.current.key !== key) geoRef.current = buildGeometry(doc, style);
            drawTerrain(ctx, geoRef.current, doc, style, undefined, doc.picture ? pictureNow(doc.picture.id) : null);
            if (tool === 'edge') drawEdgeTint(ctx, doc);
            drawGrid(ctx, doc, style, view.zoom * dpr, {
                x0: -view.x / view.zoom / CELL, y0: -view.y / view.zoom / CELL,
                x1: (size.w - view.x) / view.zoom / CELL, y1: (size.h - view.y) / view.zoom / CELL,
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [doc, style, view, size, texTick, tool]);

    /* ------------------------------------------------------------ zoom/wheel */

    const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
        setView((v) => {
            const zoom = clampZoom(v.zoom * factor);
            const k = zoom / v.zoom;
            return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
        });
    }, []);

    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        /* Not a React handler: React's wheel listener is passive, and a map
           that scrolls the page while it zooms is no good. */
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            const lines = e.deltaMode === 1 ? 16 : 1;
            /* Shift + wheel resizes the brush of the tool that is out, on the
               same log scale as the size slider: a notch is about 16%. Chrome
               turns Shift + a mouse wheel into a sideways scroll, so the notch
               arrives as deltaX. A tool with no brush zooms as usual. */
            if (e.shiftKey && !e.ctrlKey) {
                const ui = store.ui;
                if (ui.tool === 'sketch' && !ui.sketchErase) {
                    const d = (e.deltaY || e.deltaX) * lines;
                    if (d) store.setUi({ sketch: { ...ui.sketch, width: cleanSketchWidth(ui.sketch.width * Math.exp(-d * 0.0015)) } });
                    return;
                }
                const slot = brushTool(ui.tool, ui.eraseMode) ? slotOf(ui.tool) : null;
                const d = (e.deltaY || e.deltaX) * lines;
                if (slot) {
                    if (d) store.setBrush(slot, { size: cleanSize(ui.brushes[slot].size * Math.exp(-d * 0.0015)) });
                    return;
                }
            }
            const dy = e.deltaY * lines;
            zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.0015));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        const onZoom = (e: Event) => zoomAt(el.clientWidth / 2, el.clientHeight / 2, (e as CustomEvent<number>).detail);
        window.addEventListener('map-zoom', onZoom);
        return () => { el.removeEventListener('wheel', onWheel); window.removeEventListener('map-zoom', onZoom); };
    }, [zoomAt, store]);

    /* -------------------------------------------------------------- gestures */

    const local = (e: { clientX: number; clientY: number }): Pt => {
        const r = stageRef.current!.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };
    const toCell = (e: { clientX: number; clientY: number }): Pt => {
        const [sx, sy] = local(e);
        const v = viewRef.current;
        return [(sx - v.x) / v.zoom / CELL, (sy - v.y) / v.zoom / CELL];
    };
    const inside = ([x, y]: Pt) => x >= 0 && y >= 0 && x <= store.doc.cols && y <= store.doc.rows;

    /* A double-click on a landmark that opens a map steps into it. Tested by
       geometry rather than by the event's target, which pointer capture
       may have moved to the stage; only under Select and Pan, so a quick
       double dab of the brush over a town never leaves the map. */
    const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
        const t = store.ui.tool;
        if ((t !== 'select' && t !== 'pan') || spaceHeld) return;
        const [x, y] = toCell(e);
        /* A building first: they stand over the landmarks. */
        const building = [...store.doc.placed].reverse().find((o) => {
            if (!o.link || !linkedDoc(store.maps, o)) return false;
            const b = spriteBox(o);
            return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
        });
        const hit = building ?? [...store.doc.stamps].reverse().find((st) =>
            st.link && Math.abs(x - st.x) <= st.size / 2 && Math.abs(y - st.y) <= st.size / 2 && linkedDoc(store.maps, st));
        if (hit) { e.preventDefault(); store.enter(hit.id); }
    };

    const publish = (g: Stroking) => {
        if (g.frame != null) { cancelAnimationFrame(g.frame); g.frame = null; }
        publishLayers(g);
    };

    /** Put painted copies of the layers on the map, as a live change. */
    const publishLayers = (g: Pick<Stroking, 'terrain' | 'edges' | 'fog' | 'fillers'>) => {
        const terrain = g.terrain ? encode(g.terrain) : store.doc.terrain;
        const edges = g.edges ? encodeEdges(g.edges) : store.doc.edges;
        const fog = g.fog ? encodeFog(g.fog) : store.doc.fog;
        const fillers = g.fillers ? encodeFillers(g.fillers) : store.doc.fillers;
        if (terrain === store.doc.terrain && edges === store.doc.edges && fog === store.doc.fog
            && fillers === store.doc.fillers) return;
        /* Copies for the cache: the stroke goes on painting into its own. */
        if (g.terrain && terrain !== store.doc.terrain) remember(terrain, g.terrain.slice());
        if (g.edges && edges !== store.doc.edges) rememberEdges(edges, g.edges.slice());
        if (g.fog && fog !== store.doc.fog) rememberFog(fog, g.fog.slice());
        if (g.fillers && fillers !== store.doc.fillers) rememberFillers(fillers, g.fillers.slice());
        store.live((m) => { m.terrain = terrain; m.edges = edges; m.fog = fog; m.fillers = fillers; });
    };

    /* The shape as it stands: the layers copied from the map at the press,
       the shape painted into them, published. */
    const drawShape = (g: Extract<Gesture, { kind: 'shape' }>) => {
        if (g.frame != null) { cancelAnimationFrame(g.frame); g.frame = null; }
        const ui = store.ui;
        const geom = shapeGeometry(ui.shape, g.start, g.end, g.even);
        setShapeDraft(geom);
        const layers = strokeLayers(g.base, 'paint', ui);
        if (shapeHasSize(geom)) {
            const guard = strokeGuard(g.base, ui, g.start);
            if (guard) layers.canvas.guard = guard;
            paintShape(layers.canvas, geom, ui.shape === 'line' ? 'outline' : ui.shapeFill, ui.shapeWidth);
        }
        publishLayers(layers);
    };
    const shapeSoon = (g: Extract<Gesture, { kind: 'shape' }>) => {
        if (g.frame == null) g.frame = requestAnimationFrame(() => { g.frame = null; drawShape(g); });
    };

    /* Alt evens the shape out the moment it goes down or up, without
       waiting for the pointer to move; Escape drops the shape. */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const g = gesture.current;
            if (g?.kind !== 'shape' && g?.kind !== 'sketchShape') return;
            if (e.key === 'Alt') {
                e.preventDefault();
                const even = e.type === 'keydown';
                if (g.even === even) return;
                g.even = even;
                if (g.kind === 'shape') shapeSoon(g); else sketchShapeDraft(g);
            } else if (e.key === 'Escape' && e.type === 'keydown') {
                e.preventDefault();
                e.stopPropagation();
                gesture.current = null;
                if (g.kind === 'sketchShape') { setSketchDraft(null); return; }
                if (g.frame != null) cancelAnimationFrame(g.frame);
                setShapeDraft(null);
                store.cancel();
            }
        };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); };
    });

    /** The sketch a shape drag would leave, shown as the draft. */
    const sketchShapeOf = (g: Extract<Gesture, { kind: 'sketchShape' }>): MapSketch | null => {
        const ui = store.ui;
        const geom = shapeGeometry(ui.shape, g.start, g.end, g.even);
        if (!shapeHasSize(geom)) return null;
        const d = store.doc;
        return {
            id: '', ...ui.sketch, straight: true,
            points: shapeTrack(geom.pts, geom.closed, d.cols, d.rows),
            /* An arrowhead belongs on a line, not round a shape. */
            arrow: geom.closed ? false : ui.sketch.arrow,
        };
    };
    const sketchShapeDraft = (g: Extract<Gesture, { kind: 'sketchShape' }>) => setSketchDraft(sketchShapeOf(g));

    const paintAlong = (g: Stroking, from: Pt, to: Pt) => {
        if (!strokeSegment(g.canvas, g.brush.shape, from, to, g.brush.size, g.stroke)) return;
        if (g.frame == null) g.frame = requestAnimationFrame(() => { g.frame = null; publish(g); });
    };

    const eraseAt = (e: { clientX: number; clientY: number }) => {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement | SVGElement>('[data-obj]');
        const tag = el?.getAttribute('data-obj');
        if (tag) store.live((m) => { removeObject(m, tag); });
    };

    /* Rubs out every sketch the pointer touches, whole. */
    const eraseSketchesAt = (at: Pt) => {
        const tol = 6 / (viewRef.current.zoom * CELL);
        const hit = store.doc.sketches.filter((k) => distToPolyline(at, k.points as Pt[]) < Math.max(tol, k.width / 2));
        if (!hit.length) return;
        const gone = new Set(hit.map((k) => k.id));
        store.live((m) => { m.sketches = m.sketches.filter((k) => !gone.has(k.id)); });
    };

    const place = (at: Pt, size: number): Pt => (store.doc.grid.snap ? snapPoint(at[0], at[1], size) : at);

    const beginPinch = () => {
        const [a, b] = [...pointers.current.values()];
        /* Two fingers down mid-stroke: that was the start of a pinch, not a
           stroke, so whatever the first finger did is put back. */
        const was = gesture.current;
        if ((was?.kind === 'paint' || was?.kind === 'shape') && was.frame != null) cancelAnimationFrame(was.frame);
        setShapeDraft(null);
        if (was && was.kind !== 'pan' && was.kind !== 'pinch') store.cancel();
        setDraft(null);
        setSketchDraft(null);
        gesture.current = {
            kind: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
            mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: viewRef.current,
        };
    };

    /** The Room tool's floor or wallpaper at a point: under the brush, or
        the whole room it is in (up to its walls). */
    const roomPaint = (mode: 'floor' | 'wallpaper', at: Pt) => {
        const ui = store.ui;
        store.live((d) => {
            const room = d.room;
            if (!room) return;
            const { cols, rows } = d;
            const cx = Math.floor(at[0]), cy = Math.floor(at[1]);
            if (mode === 'floor') {
                let cells: number[] = [];
                if (ui.roomFill) cells = regionOf(room, cols, rows, cx, cy);
                else {
                    const n = ui.roomBrush;
                    const x0 = n % 2 ? cx - (n - 1) / 2 : Math.round(at[0]) - n / 2;
                    const y0 = n % 2 ? cy - (n - 1) / 2 : Math.round(at[1]) - n / 2;
                    for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) if (x >= 0 && y >= 0 && x < cols && y < rows) cells.push(y * cols + x);
                }
                d.room = withFloor(room, cols, rows, cells, ui.roomFloor);
            } else {
                const keys = ui.roomFill ? wallsOfRegion(room, cols, regionOf(room, cols, rows, cx, cy)) : [pieceAt(room, at[0], at[1])].filter((k): k is string => !!k);
                d.room = withWallpaper(room, keys, ui.roomWall);
            }
        });
    };

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        const stage = stageRef.current!;
        pointers.current.set(e.pointerId, local(e));
        capture(stage, e.pointerId);
        if (pointers.current.size === 2) { beginPinch(); return; }
        if (pointers.current.size > 2) return;

        const tool = store.ui.tool;
        /* Alt-drag pans, except while drawing a shape, where Alt evens it out. */
        const shaping = tool === 'shape' || (tool === 'sketch' && store.ui.sketchShape && !store.ui.sketchErase);
        if (e.button === 1 || tool === 'pan' || spaceHeld || (e.button === 0 && e.altKey && !shaping)) {
            e.preventDefault();
            const v = viewRef.current;
            gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
            return;
        }
        if (e.button !== 0) return;
        const at = toCell(e);

        switch (tool) {
            case 'paint':
            case 'edge':
            case 'fog':
            case 'unfog':
            case 'erase': {
                if (tool === 'paint' && store.ui.paintLayer === 'single') {
                    /* One filler, exactly where clicked: placed by eye, not on
                       the grid. It is a landmark from here on. */
                    if (!inside(at)) return;
                    const landmark = FILLER_PREFIX + store.ui.singleFiller;
                    const variant = store.ui.fillerVariant;
                    const id = uid();
                    store.edit((d) => {
                        d.stamps = [...d.stamps, { id, landmark, variant, x: at[0], y: at[1], size: FILLER_SIZE, rotation: 0, flip: false, snap: false }];
                    });
                    /* Its panel opens under the palette, size slider and all. */
                    store.setUi({ selection: [{ kind: 'stamp', id }] });
                    return;
                }
                if (tool === 'erase' && store.ui.eraseMode === 'objects') {
                    store.checkpoint();
                    gesture.current = { kind: 'erase' };
                    eraseAt(e);
                    return;
                }
                if (!inside(at)) return;
                store.checkpoint();
                const d = store.doc;
                const g: { kind: 'paint' } & Stroking = {
                    kind: 'paint', last: at, frame: null,
                    ...strokeLayers(d, tool, store.ui),
                    brush: store.ui.brushes[slotOf(tool)!],
                    stroke: newStroke(d.cols, d.rows),
                };
                if (tool === 'paint') {
                    const guard = strokeGuard(d, store.ui, at);
                    if (guard) {
                        g.canvas.guard = guard;
                        if (!guard.allow.some((v) => v)) toast('<i class="fa-solid fa-lock"></i> Nothing here to paint over: this terrain is locked in Smart painting.');
                    }
                }
                gesture.current = g;
                paintAlong(g, at, at);
                return;
            }
            case 'fill':
                if (!inside(at)) return;
                {
                    const d = store.doc;
                    const { terrain, edges, canvas } = strokeLayers(d, 'paint', { ...store.ui, paintLayer: 'terrain' });
                    const looks = resolvedOf(d).data;
                    if (floodFill(canvas, looks, Math.floor(at[0] * d.res), Math.floor(at[1] * d.res))) {
                        const t = encode(terrain!);
                        remember(t, terrain!);
                        const ed = edges ? encodeEdges(edges) : d.edges;
                        if (edges) rememberEdges(ed, edges);
                        store.edit((m) => { m.terrain = t; m.edges = ed; });
                    }
                }
                return;
            case 'shape': {
                if (!inside(at)) return;
                e.preventDefault();
                store.checkpoint();
                const g: Extract<Gesture, { kind: 'shape' }> = { kind: 'shape', start: at, end: at, even: e.altKey, base: store.doc, frame: null };
                gesture.current = g;
                setShapeDraft(shapeGeometry(store.ui.shape, at, at, g.even));
                return;
            }
            case 'path':
                gesture.current = { kind: 'path', pts: [at] };
                setDraft([at]);
                return;
            case 'sketch':
                if (store.ui.sketchErase) {
                    store.checkpoint();
                    gesture.current = { kind: 'sketchErase' };
                    eraseSketchesAt(at);
                    return;
                }
                if (!inside(at)) return;
                if (store.ui.sketchShape) {
                    e.preventDefault();
                    gesture.current = { kind: 'sketchShape', start: at, end: at, even: e.altKey };
                    setSketchDraft(null);
                    return;
                }
                gesture.current = { kind: 'sketch', pts: [at], pxPerCell: viewRef.current.zoom * CELL };
                setSketchDraft({ id: '', ...store.ui.sketch, points: [[at[0], at[1]]] });
                return;
            case 'stamp': {
                if (!inside(at)) return;
                const def = landmarkOf(store.ui.landmark);
                const id = uid();
                const [x, y] = place(at, def.size);
                store.edit((d) => {
                    d.stamps = [...d.stamps, { id, landmark: def.slug, x, y, size: def.size, rotation: 0, flip: false }];
                });
                store.setUi({ selection: [{ kind: 'stamp', id }] });
                return;
            }
            case 'room': {
                const mode = store.ui.roomMode;
                if (mode === 'shape' || !store.doc.room || !inside(at)) return;
                e.preventDefault();
                store.checkpoint();
                const v: Pt = [Math.round(at[0]), Math.round(at[1])];
                const g: Extract<Gesture, { kind: 'room' }> = { kind: 'room', mode, vertex: Math.hypot(at[0] - v[0], at[1] - v[1]) <= 0.4 ? v : null, start: at, moved: false };
                gesture.current = g;
                if (mode !== 'walls') roomPaint(mode, at);
                return;
            }
            case 'build': {
                if (!inside(at)) return;
                const item = store.ui.buildItem;
                const runShape = runShapeOf(itemOf(item), store.ui.buildShape);
                if (runShape) {
                    e.preventDefault();
                    const p0 = wallPoint(at);
                    gesture.current = { kind: 'wall', shape: runShape, item, start: p0, end: p0 };
                    setRunDraft(null);
                    return;
                }
                const rot = store.ui.buildRot;
                const variant = variantOf(itemOf(item), store.ui.buildVariant);
                const [x, y] = placeAt(item, rot, variant, at, store.doc.grid.snap);
                const id = uid();
                store.edit((d) => {
                    d.placed = [...d.placed, {
                        id, item, x, y, ...(rot ? { rot } : {}), ...(variant ? { variant } : {}), ...(store.ui.buildFlip ? { flip: true } : {}),
                    }];
                });
                store.setUi({ selection: [{ kind: 'placed', id }] });
                return;
            }
            case 'token': {
                const tok = store.ui.token;
                if (!tok) { toast('<i class="fa-solid fa-circle-info"></i> Choose a token in the side panel first.'); return; }
                if (!inside(at)) return;
                const [x, y] = place(at, 1);
                const id = uid();
                store.edit((d) => { d.tokens = [...d.tokens, { id, ...tok, x, y, size: 1 }]; });
                store.setUi({ selection: [{ kind: 'token', id }] });
                return;
            }
            case 'label': {
                if (!inside(at)) return;
                const id = uid();
                store.edit((d) => {
                    d.labels = [...d.labels, { id, text: 'New label', x: at[0], y: at[1], role: store.ui.labelRole, scale: 1, rotation: 0 }];
                });
                store.setUi({ selection: [{ kind: 'label', id }], focusLabel: id });
                return;
            }
            case 'select': {
                /* Nothing took the press: paths are hit on their stroke only, so
                   try a looser distance test before calling it empty ground. */
                const hitTol = 0.5;
                const tol = 6 / (viewRef.current.zoom * CELL);
                const sketch = [...store.doc.sketches].reverse()
                    .find((k) => distToPolyline(at, k.points as Pt[]) < Math.max(tol, k.width / 2));
                if (sketch) { startObjectGesture(e, { kind: 'sketch', id: sketch.id }, 'move'); return; }
                const hit = [...store.doc.paths].reverse().find((p) => distToPolyline(at, p.points as Pt[]) < Math.max(hitTol, p.width / 2));
                if (hit) { startObjectGesture(e, { kind: 'path', id: hit.id }, 'move'); return; }
                /* Empty ground: a drag box. With Ctrl or Cmd it adds to what is
                   already selected; without, a click that never becomes a
                   drag just clears the selection. */
                const add = e.ctrlKey || e.metaKey;
                gesture.current = { kind: 'box', start: at, add, base: add ? store.ui.selection : [] };
                return;
            }
        }
    };

    const wallPoint = (at: Pt): Pt => snapRun(at, store.doc.grid.snap);

    /** Lays a dragged wall down as pieces of one run; a gate takes out the
        wall it is drawn across. A click (no drag) on a line lays a straight
        stretch, or a gate, centred on it. */
    const commitRun = (g: Extract<Gesture, { kind: 'wall' }>) => {
        const def = itemOf(g.item);
        const wall = def.wall;
        if (!wall) return;
        let path = runPath(g.shape, g.start, g.end);
        if (!path) {
            if (g.shape !== 'line') return;
            const half = (wall.gate ?? 3) / 2, [x, y] = g.start;
            path = store.ui.buildRot
                ? { pts: [[x, y - half], [x, y + half]], closed: false }
                : { pts: [[x - half, y], [x + half, y]], closed: false };
        }
        const d0 = store.doc;
        const onMap = ([x, y]: Pt) => x >= 0 && y >= 0 && x <= d0.cols && y <= d0.rows;
        const pieces = (wall.gate
            ? [[path.pts[0], path.pts[path.pts.length - 1]] as [Pt, Pt]]
            : splitRun(path.pts, path.closed, 1)).filter(([a, b]) => onMap(a) || onMap(b));
        if (!pieces.length) return;
        const variant = variantOf(def, store.ui.buildVariant);
        const run = uid();
        const made = pieces.map(([a, b]) => pieceOf(uid(), g.item, a, b, run, variant));
        store.edit((d) => {
            let placed = d.placed;
            if (wall.gate) {
                const [g0, g1] = pieces[0];
                placed = placed.filter((o) => {
                    const ends = segEnds(o), w = itemOf(o.item).wall;
                    return !(ends && w && !w.gate && underGate(ends[0], ends[1], g0, g1, Math.max(0.6, (wall.thick + w.thick) / 2 + 0.2)));
                });
            }
            d.placed = [...placed, ...made];
        });
        store.setUi({ selection: made.map((m) => ({ kind: 'placed' as const, id: m.id })) });
    };

    const startObjectGesture = (e: ReactPointerEvent, sel: Selection, grab: Grab) => {
        const d = store.doc;
        const current = store.ui.selection;
        const picked = current.some((x) => sameSel(x, sel));

        /* Ctrl or Cmd: add it to the selection, or take it out. No drag. */
        if (grab === 'move' && (e.ctrlKey || e.metaKey)) {
            store.setUi({ selection: picked ? current.filter((x) => !sameSel(x, sel)) : [...current, sel] });
            return;
        }

        store.checkpoint();
        if (grab === 'move') {
            /* Pressing one of several selected things drags them all; pressing
               anything else selects just that. */
            /* A piece of a wall drawn as a run brings the whole run with it. */
            const run = sel.kind === 'placed' ? d.placed.find((o) => o.id === sel.id)?.run : undefined;
            const whole: Selection[] = run ? d.placed.filter((o) => o.run === run).map((o) => ({ kind: 'placed' as const, id: o.id })) : [sel];
            const group = picked ? current : whole;
            if (!picked) store.setUi({ selection: group });
            gesture.current = {
                kind: 'move',
                items: group.map((x) => ({ sel: x, orig: positionsOf(d, x) })).filter((x) => x.orig.length),
                anchor: Math.max(0, group.findIndex((x) => sameSel(x, sel))),
                start: toCell(e),
                moved: false,
                narrow: picked && run && current.length > 1 && current.length === whole.length ? sel : undefined,
            };
            return;
        }
        store.setUi({ selection: [sel] });
        const pos = positionsOf(d, sel);
        if (grab === 'resize' || grab === 'rotate') {
            gesture.current = { kind: grab, sel, centre: pos[0] };
        } else {
            gesture.current = { kind: 'vertex', sel, index: grab.vertex };
        }
    };

    /* Handed to every object. Only Select acts on its own press; under Erase
       the press bubbles to the stage, which erases what is under it. */
    const onObjectDown: ObjectDown = (e, sel, grab) => {
        if (store.ui.tool !== 'select' || spaceHeld || e.button !== 0) return;
        e.stopPropagation();
        const stage = stageRef.current!;
        pointers.current.set(e.pointerId, local(e));
        capture(stage, e.pointerId);
        startObjectGesture(e, sel, grab);
    };

    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e));
        const at = toCell(e);
        const g = gesture.current;
        if (!g) {
            if (brushTool(store.ui.tool, store.ui.eraseMode) || store.ui.tool === 'fill' || store.ui.tool === 'build' || store.ui.tool === 'room') setHover(at);
            return;
        }
        switch (g.kind) {
            case 'pan':
                setView((v) => ({ ...v, x: g.vx + e.clientX - g.sx, y: g.vy + e.clientY - g.sy }));
                return;
            case 'pinch': {
                if (pointers.current.size < 2) return;
                const [a, b] = [...pointers.current.values()];
                const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
                const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                const zoom = clampZoom(g.view.zoom * dist / g.dist);
                const k = zoom / g.view.zoom;
                setView({ zoom, x: mid[0] - (g.mid[0] - g.view.x) * k, y: mid[1] - (g.mid[1] - g.view.y) * k });
                return;
            }
            case 'shape':
                g.end = at;
                g.even = e.altKey;
                shapeSoon(g);
                return;
            case 'wall': {
                setHover(at);
                g.end = wallPoint(at);
                const path = runPath(g.shape, g.start, g.end);
                setRunDraft(path ? { ...path, thick: itemOf(g.item).wall?.thick ?? 0.5 } : null);
                return;
            }
            case 'paint':
                setHover(at);
                paintAlong(g, g.last, at);
                g.last = at;
                return;
            case 'room': {
                setHover(at);
                if (g.mode !== 'walls') {
                    if (!store.ui.roomFill) roomPaint(g.mode, at);
                    return;
                }
                /* A new grid corner only once the pointer is near it, so a
                   hand wobbling between two corners draws nothing. */
                const v: Pt = [Math.round(at[0]), Math.round(at[1])];
                if ((g.vertex && v[0] === g.vertex[0] && v[1] === g.vertex[1]) || Math.hypot(at[0] - v[0], at[1] - v[1]) > 0.4) return;
                let edges: ReturnType<typeof edgesBetween>;
                if (g.vertex) edges = edgesBetween(g.vertex, v);
                else {
                    /* Pressed along a line, away from its corners: that piece
                       counts once the drag reaches one of its ends. */
                    const [o, ex, ey] = nearestEdge(g.start[0], g.start[1]);
                    const ends = o === 'h' ? [[ex, ey], [ex + 1, ey]] : [[ex, ey], [ex, ey + 1]];
                    edges = ends.some(([x, y]) => x === v[0] && y === v[1]) ? [[o, ex, ey]] : [];
                }
                g.vertex = v;
                g.moved = true;
                const on = !store.ui.roomErase;
                store.live((d) => { if (d.room) d.room = withWalls(d.room, d.cols, d.rows, edges, on); });
                return;
            }
            case 'path': {
                const last = g.pts[g.pts.length - 1];
                if (Math.hypot(at[0] - last[0], at[1] - last[1]) < 0.12) return;
                g.pts.push(at);
                setDraft(g.pts.slice());
                return;
            }
            case 'sketch': {
                const last = g.pts[g.pts.length - 1];
                /* About a screen pixel apart: closer adds nothing to see. */
                if (Math.hypot(at[0] - last[0], at[1] - last[1]) * g.pxPerCell < 1.5) return;
                g.pts.push(at);
                setSketchDraft((k) => (k ? { ...k, points: g.pts.map(([x, y]) => [x, y] as [number, number]) } : k));
                return;
            }
            case 'sketchShape':
                g.end = at;
                g.even = e.altKey;
                sketchShapeDraft(g);
                return;
            case 'sketchErase':
                eraseSketchesAt(at);
                return;
            case 'erase':
                eraseAt(e);
                return;
            case 'move': {
                const dx = at[0] - g.start[0], dy = at[1] - g.start[1];
                if (!g.moved && Math.hypot(dx, dy) < 0.05) return;
                g.moved = true;
                moveItems(g.items, g.anchor, dx, dy);
                return;
            }
            case 'box':
                setBox([g.start, at]);
                store.setUi({ selection: union(g.base, objectsInBox(store.doc, g.start, at)) });
                return;
            case 'resize': {
                const s = store.doc.stamps.find((o) => o.id === g.sel.id);
                if (!s) return;
                /* The handle is a corner of the box, which is rotated with the
                   stamp — so measure along the box's own axes. */
                const r = -s.rotation * Math.PI / 180;
                const dx = at[0] - g.centre[0], dy = at[1] - g.centre[1];
                const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
                let size = Math.max(0.3, 2 * Math.max(Math.abs(lx), Math.abs(ly)));
                if (snapsFor(store.doc, s)) size = Math.max(0.5, Math.round(size * 2) / 2);
                store.live((d) => { d.stamps = d.stamps.map((o) => (o.id === s.id ? { ...o, size } : o)); });
                return;
            }
            case 'rotate': {
                let deg = Math.atan2(at[1] - g.centre[1], at[0] - g.centre[0]) * 180 / Math.PI + 90;
                if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
                deg = ((Math.round(deg) % 360) + 360) % 360;
                store.live((d) => { d.stamps = d.stamps.map((o) => (o.id === g.sel.id ? { ...o, rotation: deg } : o)); });
                return;
            }
            case 'vertex':
                store.live((d) => {
                    d.paths = d.paths.map((p) => (p.id === g.sel.id
                        ? { ...p, points: p.points.map((q, i) => (i === g.index ? [at[0], at[1]] as [number, number] : q)) }
                        : p));
                });
                return;
        }
    };

    /* One step for the whole group. With snapping on, the object under the
       pointer snaps and the rest take the same step, so the group keeps its
       shape rather than each piece jumping to its own nearest cell. */
    const moveItems = (items: { sel: Selection; orig: Pt[] }[], anchor: number, dx: number, dy: number) => {
        const d0 = store.doc;
        const lead = items[anchor];
        if (lead && lead.sel.kind === 'placed') {
            /* A building's footprint sits on whole cells. */
            const o = d0.placed.find((x) => x.id === lead.sel.id);
            if (o && o.seg && snapsFor(d0, o)) {
                /* A wall keeps its shape on the half cells it was drawn on. */
                dx = Math.round(dx * 2) / 2;
                dy = Math.round(dy * 2) / 2;
            } else if (o && snapsFor(d0, o)) {
                dx = Math.round(lead.orig[0][0] + dx) - lead.orig[0][0];
                dy = Math.round(lead.orig[0][1] + dy) - lead.orig[0][1];
            }
        } else if (lead && (lead.sel.kind === 'stamp' || lead.sel.kind === 'token')) {
            const list = lead.sel.kind === 'stamp' ? d0.stamps : d0.tokens;
            const o = (list as { id: string; size: number; snap?: boolean }[]).find((x) => x.id === lead.sel.id);
            if (o && snapsFor(d0, o)) {
                const [sx, sy] = snapPoint(lead.orig[0][0] + dx, lead.orig[0][1] + dy, o.size);
                dx = sx - lead.orig[0][0];
                dy = sy - lead.orig[0][1];
            }
        }
        const at = new Map(items.map((it) => [it.sel.kind + ':' + it.sel.id, it.orig]));
        const shift = (kind: string, id: string): Pt[] | undefined =>
            at.get(kind + ':' + id)?.map(([x, y]) => [x + dx, y + dy] as Pt);
        store.live((d) => {
            const place = <T extends { id: string; x: number; y: number }>(list: T[], kind: string): T[] =>
                list.map((o) => { const p = shift(kind, o.id); return p ? { ...o, x: p[0][0], y: p[0][1] } : o; });
            d.stamps = place(d.stamps, 'stamp');
            d.tokens = place(d.tokens, 'token');
            d.labels = place(d.labels, 'label');
            d.placed = place(d.placed, 'placed');
            d.paths = d.paths.map((p) => {
                const pts = shift('path', p.id);
                return pts ? { ...p, points: pts.map(([x, y]) => [x, y] as [number, number]) } : p;
            });
            d.sketches = d.sketches.map((k) => {
                const pts = shift('sketch', k.id);
                return pts ? { ...k, points: pts.map(([x, y]) => [x, y] as [number, number]) } : k;
            });
        });
    };

    const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        pointers.current.delete(e.pointerId);
        const g = gesture.current;
        if (g?.kind === 'pinch') {
            /* One finger still down after a pinch pans nothing until lifted. */
            if (pointers.current.size === 0) gesture.current = null;
            return;
        }
        gesture.current = null;
        if (!g) return;
        if (g.kind === 'box') {
            setBox(null);
            /* A press that never became a drag: an ordinary click on nothing. */
            if (!box && !g.add) store.setUi({ selection: [] });
            return;
        }
        if (g.kind === 'sketchShape') {
            setSketchDraft(null);
            g.end = toCell(e);
            if (e.type === 'pointerup') g.even = e.altKey;
            const k = sketchShapeOf(g);
            if (!k) return;
            const id = uid();
            store.edit((m) => { m.sketches = [...m.sketches, { ...k, id }]; });
            return;
        }
        if (g.kind === 'sketch') {
            setSketchDraft(null);
            const d = store.doc;
            const points = finishTrack(g.pts, g.pxPerCell, d.cols, d.rows);
            const id = uid();
            store.edit((m) => { m.sketches = [...m.sketches, { id, ...store.ui.sketch, points }]; });
            return;
        }
        if (g.kind === 'path') {
            setDraft(null);
            const pts = simplify(g.pts, 0.15);
            const len = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
            if (pts.length < 2 || len < 0.5) return;
            const id = uid();
            const kind = store.ui.pathKind;
            store.edit((d) => {
                d.paths = [...d.paths, { id, kind, points: pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)] as [number, number]), width: PATH_KINDS.find((k) => k.kind === kind)?.width ?? 0.6 }];
            });
            store.setUi({ selection: [{ kind: 'path', id }] });
            return;
        }
        if (g.kind === 'wall') {
            setRunDraft(null);
            commitRun(g);
            return;
        }
        if (g.kind === 'move' && !g.moved && g.narrow) {
            /* A second click on a wall already selected whole: just that piece. */
            store.setUi({ selection: [g.narrow] });
        }
        if (g.kind === 'paint') publish(g);
        if (g.kind === 'room' && g.mode === 'walls' && !g.moved) {
            /* A click: the one piece of wall nearest it. */
            const edge = nearestEdge(g.start[0], g.start[1]);
            const on = !store.ui.roomErase;
            store.live((d) => { if (d.room) d.room = withWalls(d.room, d.cols, d.rows, [edge], on); });
        }
        if (g.kind === 'shape') {
            g.end = toCell(e);
            if (e.type === 'pointerup') g.even = e.altKey;
            drawShape(g);
            setShapeDraft(null);
        }
        if (g.kind !== 'pan') store.settle();
    };

    const onPointerLeave = () => { if (!gesture.current) setHover(null); };

    /* ---------------------------------------------------------------- render */

    const W = doc.cols * CELL, H = doc.rows * CELL;
    /* Cities and interiors draw their placed things and tokens by depth,
       and may filter the ground for their look. */
    const city = doc.kind !== 'world';
    const groundFilter = city ? lookOf(doc.look).ground(doc.styleId) : '';
    const res = resFor(view.zoom);
    const slot = brushTool(ui.tool, ui.eraseMode) ? slotOf(ui.tool) : null;
    const showBrush = hover && (slot || ui.tool === 'fill') && !spaceHeld && !(ui.tool === 'paint' && ui.paintLayer === 'single');
    const cursorTool = spaceHeld ? 'pan' : ui.tool;

    return (
        <div
            ref={stageRef}
            className={'map-stage' + (gesture.current?.kind === 'pan' ? ' panning' : '')}
            data-tool={cursorTool}
            data-look={city ? (doc.look ?? 'colorful') : undefined}
            style={groundFilter ? { '--ground-filter': groundFilter } as CSSProperties : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            onDoubleClick={onDoubleClick}
        >
            <canvas ref={canvasRef} className="map-canvas" style={{ width: size.w, height: size.h }} />
            <div
                className={'map-world' + (style.pixelated ? ' pixelated' : '')}
                style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
            >
                {/* An interior's walls and floor, over the ground and under everything on it. */}
                {doc.room && (
                    <RoomLayer room={doc.room} look={doc.look} cols={doc.cols} rows={doc.rows} res={res}
                        grid={doc.grid.show ? doc.grid.opacity || 0.5 : 0} />
                )}
                <PathsLayer doc={doc} style={style} selection={ui.selection} draft={draft} onDown={onObjectDown} />
                <StampsLayer doc={doc} style={style} selection={ui.selection} onDown={onObjectDown} maps={store.maps} />
                {/* A city or interior: buildings and tokens in one layer, back to front, under the labels. */}
                {city && <DepthLayer doc={doc} style={style} selection={ui.selection} res={res} maps={store.maps} onDown={onObjectDown} />}
                {city && ui.tool === 'build' && hover && !spaceHeld && !runShapeOf(itemOf(ui.buildItem), ui.buildShape) && (
                    <BuildGhost doc={doc} item={ui.buildItem} rot={ui.buildRot} variant={ui.buildVariant} flip={ui.buildFlip} at={hover} res={res} />
                )}
                {city && ui.tool === 'build' && hover && !spaceHeld && runShapeOf(itemOf(ui.buildItem), ui.buildShape) && (
                    <RunCursor at={snapRun(hover, doc.grid.snap)} zoom={view.zoom} />
                )}
                {runDraft && <RunDraft draft={runDraft} zoom={view.zoom} />}
                <LabelsLayer doc={doc} style={style} selection={ui.selection} onDown={onObjectDown} />
                <SketchesLayer doc={doc} selection={ui.selection} draft={sketchDraft} onDown={onObjectDown} />
                {!city && <TokensLayer doc={doc} style={style} selection={ui.selection} onDown={onObjectDown} />}
                {(!ui.fogHidden || ui.tool === 'fog' || ui.tool === 'unfog') && <FogLayer doc={doc} />}
                {doc.room && ui.tool === 'room' && ui.roomMode === 'shape' && <RoomHandles store={store} room={doc.room} cols={doc.cols} rows={doc.rows} zoom={view.zoom} />}
                {doc.room && ui.tool === 'room' && ui.roomMode !== 'shape' && hover && !spaceHeld && (
                    <RoomCursor room={doc.room} at={hover} ui={ui} cols={doc.cols} rows={doc.rows} zoom={view.zoom} />
                )}
                {box && (
                    <div
                        className="map-marquee"
                        style={{
                            left: Math.min(box[0][0], box[1][0]) * CELL, top: Math.min(box[0][1], box[1][1]) * CELL,
                            width: Math.abs(box[1][0] - box[0][0]) * CELL, height: Math.abs(box[1][1] - box[0][1]) * CELL,
                            borderWidth: 1.5 / view.zoom,
                        }}
                    />
                )}
                {shapeDraft && <ShapeOutline geom={shapeDraft} zoom={view.zoom} />}
                {showBrush && hover && (
                    <BrushOutline
                        at={hover}
                        shape={!slot ? 'fill' : BRUSH_BY_ID.get(ui.brushes[slot].shape)?.outline ?? 'circle'}
                        size={slot ? ui.brushes[slot].size : 1}
                        res={doc.res}
                        zoom={view.zoom}
                    />
                )}
            </div>
            <div className="map-zoom-readout">{Math.round(view.zoom * 100)}%</div>
        </div>
    );
}

/** The fog, over everything placed on the map: a canvas one pixel a sample,
    stretched to the map and smoothed. Redrawn only when the fog changes —
    a stroke publishes at most once a frame. */
function FogLayer({ doc }: { doc: MapDoc }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const { cols, rows, res, fog } = doc;
    const image = useMemo(() => fogImage({ cols, rows, res, fog }), [cols, rows, res, fog]);
    useLayoutEffect(() => {
        const c = ref.current;
        if (!c || !image) return;
        c.width = image.width;
        c.height = image.height;
        c.getContext('2d')?.drawImage(image, 0, 0);
    }, [image]);
    if (!image) return null;
    return <canvas ref={ref} className="map-fog" style={{ width: cols * CELL, height: rows * CELL }} aria-hidden="true" />;
}

/** Whether a tool paints with a brush right now — the eraser only when it
    rubs out terrain. */
function brushTool(tool: string, eraseMode: string): boolean {
    return tool === 'paint' || tool === 'edge' || tool === 'fog' || tool === 'unfog' || (tool === 'erase' && eraseMode === 'terrain');
}

/* Where the brush will land, drawn in world px. Its shape is the brush's own:
   a circle, a square, a diamond, a hexagon, the whole cells the Grid-cells
   brush will take — or, for the noisy brushes, a dashed circle, since their
   edge is decided by the noise under it. The fill tool shows the sample. */
/** The shape being dragged, outlined exactly where it lands. */
/** Where a wall's end goes: on the half cells when the map snaps. */
function snapRun(at: Pt, snap: boolean): Pt {
    return snap ? [Math.round(at[0] * 2) / 2, Math.round(at[1] * 2) / 2] : [at[0], at[1]];
}

/** The run being dragged: its band as wide as the wall, its pieces ticked. */
function RunDraft({ draft, zoom }: { draft: { pts: Pt[]; closed: boolean; thick: number }; zoom: number }) {
    const points = draft.pts.map(([x, y]) => x * CELL + ',' + y * CELL).join(' ');
    const Tag = draft.closed ? 'polygon' : 'polyline';
    const sw = 1.5 / zoom;
    return (
        <svg className="map-svg map-brush-outline map-run-draft" style={{ overflow: 'visible' }} width={1} height={1} data-run-draft={draft.pts.length}>
            <Tag points={points} fill="none" stroke="#fff6" strokeWidth={Math.max(draft.thick * CELL, 4 / zoom)} strokeLinejoin="round" />
            <Tag points={points} fill="none" stroke="#000a" strokeWidth={sw * 2.2} strokeLinejoin="round" />
            <Tag points={points} fill="none" stroke="#fff" strokeWidth={sw} strokeDasharray={`${5 / zoom} ${4 / zoom}`} />
        </svg>
    );
}

/** The point a wall would start from, under the Build tool. */
function RunCursor({ at, zoom }: { at: Pt; zoom: number }) {
    const r = 5 / zoom;
    return (
        <svg className="map-svg map-brush-outline" style={{ overflow: 'visible' }} width={1} height={1} data-run-cursor="">
            <circle cx={at[0] * CELL} cy={at[1] * CELL} r={r} fill="#fff" stroke="#000a" strokeWidth={1.5 / zoom} />
        </svg>
    );
}

function ShapeOutline({ geom, zoom }: { geom: ShapeGeometry; zoom: number }) {
    const points = geom.pts.map(([x, y]) => x * CELL + ',' + y * CELL).join(' ');
    const sw = 1.5 / zoom;
    const Tag = geom.closed ? 'polygon' : 'polyline';
    return (
        <svg className="map-svg map-brush-outline map-shape-outline" style={{ overflow: 'visible' }} width={1} height={1}>
            <Tag points={points} fill="none" stroke="#000a" strokeWidth={sw * 2.2} />
            <Tag points={points} fill="none" stroke="#fff" strokeWidth={sw} strokeDasharray={`${5 / zoom} ${4 / zoom}`} />
        </svg>
    );
}

function BrushOutline({ at, shape, size, res, zoom }: {
    at: Pt; shape: string; size: number; res: number; zoom: number;
}) {
    const r = (size / 2) * CELL;
    const [x, y] = [at[0] * CELL, at[1] * CELL];
    const sw = 1.5 / zoom;
    let body: ReactElement;
    if (shape === 'fill') {
        const s = CELL / res;
        body = <rect x={Math.floor(at[0] * res) * s} y={Math.floor(at[1] * res) * s} width={s} height={s} />;
    } else if (shape === 'cells') {
        const n = Math.max(1, Math.round(size));
        const x0 = Math.floor(at[0] - n / 2 + 0.5), y0 = Math.floor(at[1] - n / 2 + 0.5);
        body = <rect x={x0 * CELL} y={y0 * CELL} width={n * CELL} height={n * CELL} />;
    } else if (shape === 'square') {
        body = <rect x={x - r} y={y - r} width={r * 2} height={r * 2} />;
    } else if (shape === 'diamond') {
        body = <polygon points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`} />;
    } else if (shape === 'hexagon') {
        const h = r * Math.sqrt(3) / 2;
        body = <polygon points={`${x - r},${y} ${x - r / 2},${y - h} ${x + r / 2},${y - h} ${x + r},${y} ${x + r / 2},${y + h} ${x - r / 2},${y + h}`} />;
    } else {
        body = <circle cx={x} cy={y} r={r} strokeDasharray={shape === 'blob' ? `${4 / zoom} ${3 / zoom}` : undefined} />;
    }
    return (
        <svg className="map-svg map-brush-outline" style={{ overflow: 'visible' }} width={1} height={1}>
            <g fill="none" stroke="#000a" strokeWidth={sw * 2.2}>{body}</g>
            <g fill="none" stroke="#fff" strokeWidth={sw}>{body}</g>
        </svg>
    );
}
