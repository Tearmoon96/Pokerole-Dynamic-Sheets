import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { useMap } from '../../map/MapContext';
import { PATH_KINDS, styleOf } from '../../map/styles';
import { snapPoint, snapsFor, uid } from '../../map/doc';
import { EMPTY, allowTable, codeIndex, encode, floodFill, rasterOf, remember, resolvedOf } from '../../map/raster';
import type { Canvas } from '../../map/raster';
import { BRUSH_BY_ID, newStroke, strokeSegment } from '../../map/brushes';
import type { Stroke } from '../../map/brushes';
import { PAINT_INHERIT, blankEdges, edgesOf, encodeEdges, paintValue, rememberEdges } from '../../map/edges';
import { FOG_CLEAR, blankFog, encodeFog, fogOf, fogValue, rememberFog } from '../../map/fog';
import { fogImage } from '../../map/render/fog';
import { slotOf } from '../../map/store';
import type { BrushSetting, MapUi } from '../../map/store';
import { distToPolyline, simplify } from '../../map/geometry';
import type { Pt } from '../../map/geometry';
import { landmarkOf } from '../../map/landmarks';
import { CELL } from '../../map/render/patterns';
import { buildGeometry, drawEdgeTint, drawGrid, drawTerrain, geometryKey } from '../../map/render/terrain';
import type { TerrainGeometry } from '../../map/render/terrain';
import { onImageArrived } from '../../map/sprites';
import { LabelsLayer, PathsLayer, StampsLayer, TokensLayer } from './MapObjects';
import type { Grab, ObjectDown } from './MapObjects';
import { useToast } from '../common/Toast';
import type { MapDoc, Selection, Tool } from '../../map/types';
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
    | { kind: 'erase' }
    /* Everything selected moves together; `anchor` is the one under the
       pointer, the one whose snapping decides the step for all of them. */
    | { kind: 'move'; items: { sel: Selection; orig: Pt[] }[]; anchor: number; start: Pt; moved: boolean }
    | { kind: 'box'; start: Pt; add: boolean; base: Selection[] }
    | { kind: 'resize'; sel: Selection; centre: Pt }
    | { kind: 'rotate'; sel: Selection; centre: Pt }
    | { kind: 'vertex'; sel: Selection; index: number }
    | { kind: 'pinch'; dist: number; mid: Pt; view: View };

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/** A brush stroke under way: the painting tool, the eraser's terrain mode,
    the Borders brush and the two fog brushes all stroke the same way, into
    their own layers. */
interface Stroking {
    last: Pt;
    canvas: Canvas;
    /** The copies being painted, whichever of the two this stroke writes. */
    terrain: Uint8Array | null;
    edges: Uint8Array | null;
    fog: Uint8Array | null;
    brush: BrushSetting;
    stroke: Stroke;
    frame: number | null;
}

/** The layers one press of a painting tool writes, as copies to paint into:
    terrain and its border look for the brush, bare ground and no border for
    the eraser, the border look alone for the Borders brush, and the fog
    alone for the two fog brushes — which never touch the ground under it. */
function strokeLayers(d: MapDoc, tool: Tool, ui: Pick<MapUi, 'terrain' | 'paintEdge' | 'edgeKind' | 'fogColor' | 'fogStrength'>):
    { terrain: Uint8Array | null; edges: Uint8Array | null; fog: Uint8Array | null; canvas: Canvas } {
    const r = rasterOf(d);
    const had = edgesOf(d);
    const edgeCopy = () => (had ? had.slice() : blankEdges(d));
    const layers: Canvas['layers'] = [];
    let terrain: Uint8Array | null = null, edges: Uint8Array | null = null, fog: Uint8Array | null = null;
    if (tool === 'fog' || tool === 'unfog') {
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
    }
    return { terrain, edges, fog, canvas: { w: r.w, h: r.h, res: r.res, layers } };
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
    const before = d.stamps.length + d.tokens.length + d.labels.length + d.paths.length;
    if (kind === 'stamp') d.stamps = d.stamps.filter((o) => o.id !== id);
    if (kind === 'token') d.tokens = d.tokens.filter((o) => o.id !== id);
    if (kind === 'label') d.labels = d.labels.filter((o) => o.id !== id);
    if (kind === 'path') d.paths = d.paths.filter((o) => o.id !== id);
    return d.stamps.length + d.tokens.length + d.labels.length + d.paths.length !== before;
}

/** Everything whose position (or, for a path, any of whose points) lies in
    the box between two corners, in cell units. */
function objectsInBox(d: MapDoc, a: Pt, b: Pt): Selection[] {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    return [
        ...d.paths.filter((p) => p.points.some(([x, y]) => inBox(x, y))).map((p) => ({ kind: 'path' as const, id: p.id })),
        ...d.stamps.filter((o) => inBox(o.x, o.y)).map((o) => ({ kind: 'stamp' as const, id: o.id })),
        ...d.labels.filter((o) => inBox(o.x, o.y)).map((o) => ({ kind: 'label' as const, id: o.id })),
        ...d.tokens.filter((o) => inBox(o.x, o.y)).map((o) => ({ kind: 'token' as const, id: o.id })),
    ];
}

/** The position (or, for a path, all the points) of a selected object. */
function positionsOf(d: MapDoc, sel: Selection): Pt[] {
    if (sel.kind === 'path') return (d.paths.find((p) => p.id === sel.id)?.points ?? []).map((p) => [p[0], p[1]] as Pt);
    const list = sel.kind === 'stamp' ? d.stamps : sel.kind === 'token' ? d.tokens : d.labels;
    const o = (list as { id: string; x: number; y: number }[]).find((x) => x.id === sel.id);
    return o ? [[o.x, o.y]] : [];
}

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

    /* A different map, or the first measurement: frame the whole of it. */
    useEffect(() => {
        if (!size.w || fitted.current === doc.id) return;
        fitted.current = doc.id;
        fit();
    }, [doc.id, size.w, fit]);

    useEffect(() => {
        const onFit = () => fit();
        window.addEventListener('map-fit', onFit);
        return () => window.removeEventListener('map-fit', onFit);
    }, [fit]);

    useEffect(() => onImageArrived(() => setTexTick((n) => n + 1)), []);

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
            drawTerrain(ctx, geoRef.current, doc, style);
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
            const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.0015));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        const onZoom = (e: Event) => zoomAt(el.clientWidth / 2, el.clientHeight / 2, (e as CustomEvent<number>).detail);
        window.addEventListener('map-zoom', onZoom);
        return () => { el.removeEventListener('wheel', onWheel); window.removeEventListener('map-zoom', onZoom); };
    }, [zoomAt]);

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

    const publish = (g: Stroking) => {
        if (g.frame != null) { cancelAnimationFrame(g.frame); g.frame = null; }
        const terrain = g.terrain ? encode(g.terrain) : store.doc.terrain;
        const edges = g.edges ? encodeEdges(g.edges) : store.doc.edges;
        const fog = g.fog ? encodeFog(g.fog) : store.doc.fog;
        if (terrain === store.doc.terrain && edges === store.doc.edges && fog === store.doc.fog) return;
        /* Copies for the cache: the stroke goes on painting into its own. */
        if (g.terrain && terrain !== store.doc.terrain) remember(terrain, g.terrain.slice());
        if (g.edges && edges !== store.doc.edges) rememberEdges(edges, g.edges.slice());
        if (g.fog && fog !== store.doc.fog) rememberFog(fog, g.fog.slice());
        store.live((m) => { m.terrain = terrain; m.edges = edges; m.fog = fog; });
    };

    const paintAlong = (g: Stroking, from: Pt, to: Pt) => {
        if (!strokeSegment(g.canvas, g.brush.shape, from, to, g.brush.size, g.stroke)) return;
        if (g.frame == null) g.frame = requestAnimationFrame(() => { g.frame = null; publish(g); });
    };

    const eraseAt = (e: { clientX: number; clientY: number }) => {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement | SVGElement>('[data-obj]');
        const tag = el?.getAttribute('data-obj');
        if (tag) store.live((m) => { removeObject(m, tag); });
    };

    const place = (at: Pt, size: number): Pt => (store.doc.grid.snap ? snapPoint(at[0], at[1], size) : at);

    const beginPinch = () => {
        const [a, b] = [...pointers.current.values()];
        /* Two fingers down mid-stroke: that was the start of a pinch, not a
           stroke, so whatever the first finger did is put back. */
        const was = gesture.current;
        if (was?.kind === 'paint' && was.frame != null) cancelAnimationFrame(was.frame);
        if (was && was.kind !== 'pan' && was.kind !== 'pinch') store.cancel();
        setDraft(null);
        gesture.current = {
            kind: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
            mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: viewRef.current,
        };
    };

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        const stage = stageRef.current!;
        pointers.current.set(e.pointerId, local(e));
        capture(stage, e.pointerId);
        if (pointers.current.size === 2) { beginPinch(); return; }
        if (pointers.current.size > 2) return;

        const tool = store.ui.tool;
        if (e.button === 1 || tool === 'pan' || spaceHeld || (e.button === 0 && e.altKey)) {
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
                    const { terrain, edges, canvas } = strokeLayers(d, 'paint', store.ui);
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
            case 'path':
                gesture.current = { kind: 'path', pts: [at] };
                setDraft([at]);
                return;
            case 'stamp': {
                if (!inside(at)) return;
                const def = landmarkOf(store.ui.landmark);
                const [x, y] = place(at, def.size);
                const id = uid();
                store.edit((d) => {
                    d.stamps = [...d.stamps, { id, landmark: def.slug, x, y, size: def.size, rotation: 0, flip: false }];
                });
                store.setUi({ selection: [{ kind: 'stamp', id }] });
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
            const group = picked ? current : [sel];
            if (!picked) store.setUi({ selection: group });
            gesture.current = {
                kind: 'move',
                items: group.map((x) => ({ sel: x, orig: positionsOf(d, x) })).filter((x) => x.orig.length),
                anchor: Math.max(0, group.findIndex((x) => sameSel(x, sel))),
                start: toCell(e),
                moved: false,
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
            if (brushTool(store.ui.tool, store.ui.eraseMode) || store.ui.tool === 'fill') setHover(at);
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
            case 'paint':
                setHover(at);
                paintAlong(g, g.last, at);
                g.last = at;
                return;
            case 'path': {
                const last = g.pts[g.pts.length - 1];
                if (Math.hypot(at[0] - last[0], at[1] - last[1]) < 0.12) return;
                g.pts.push(at);
                setDraft(g.pts.slice());
                return;
            }
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
        if (lead && (lead.sel.kind === 'stamp' || lead.sel.kind === 'token')) {
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
            d.paths = d.paths.map((p) => {
                const pts = shift('path', p.id);
                return pts ? { ...p, points: pts.map(([x, y]) => [x, y] as [number, number]) } : p;
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
        if (g.kind === 'paint') publish(g);
        if (g.kind !== 'pan') store.settle();
    };

    const onPointerLeave = () => { if (!gesture.current) setHover(null); };

    /* ---------------------------------------------------------------- render */

    const W = doc.cols * CELL, H = doc.rows * CELL;
    const slot = brushTool(ui.tool, ui.eraseMode) ? slotOf(ui.tool) : null;
    const showBrush = hover && (slot || ui.tool === 'fill') && !spaceHeld;
    const cursorTool = spaceHeld ? 'pan' : ui.tool;

    return (
        <div
            ref={stageRef}
            className={'map-stage' + (gesture.current?.kind === 'pan' ? ' panning' : '')}
            data-tool={cursorTool}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onContextMenu={(e) => e.preventDefault()}
        >
            <canvas ref={canvasRef} className="map-canvas" style={{ width: size.w, height: size.h }} />
            <div
                className={'map-world' + (style.pixelated ? ' pixelated' : '')}
                style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
            >
                <PathsLayer doc={doc} style={style} selection={ui.selection} draft={draft} onDown={onObjectDown} />
                <StampsLayer doc={doc} style={style} selection={ui.selection} onDown={onObjectDown} />
                <LabelsLayer doc={doc} style={style} selection={ui.selection} onDown={onObjectDown} />
                <TokensLayer doc={doc} style={style} selection={ui.selection} onDown={onObjectDown} />
                {(!ui.fogHidden || ui.tool === 'fog' || ui.tool === 'unfog') && <FogLayer doc={doc} />}
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
