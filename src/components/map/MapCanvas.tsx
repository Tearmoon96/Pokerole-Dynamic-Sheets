import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useMap } from '../../map/MapContext';
import { PATH_KINDS, styleOf } from '../../map/styles';
import { brushCells, floodFill, paintCells, snapPoint, uid } from '../../map/doc';
import { distToPolyline, simplify } from '../../map/geometry';
import type { Pt } from '../../map/geometry';
import { landmarkOf } from '../../map/landmarks';
import { CELL } from '../../map/render/patterns';
import { buildGeometry, drawGrid, drawTerrain, geometryKey } from '../../map/render/terrain';
import type { TerrainGeometry } from '../../map/render/terrain';
import { onImageArrived } from '../../map/sprites';
import { LabelsLayer, PathsLayer, StampsLayer, TokensLayer } from './MapObjects';
import type { Grab, ObjectDown } from './MapObjects';
import { useToast } from '../common/Toast';
import type { MapDoc, Selection } from '../../map/types';

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
    | { kind: 'paint'; last: Pt }
    | { kind: 'path'; pts: Pt[] }
    | { kind: 'erase' }
    | { kind: 'move'; sel: Selection; start: Pt; orig: Pt[]; moved: boolean }
    | { kind: 'resize'; sel: Selection; centre: Pt }
    | { kind: 'rotate'; sel: Selection; centre: Pt }
    | { kind: 'vertex'; sel: Selection; index: number }
    | { kind: 'pinch'; dist: number; mid: Pt; view: View };

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/* Capture keeps a drag coming to the stage after it leaves the element it
   started on. It throws for a pointer the browser no longer counts as down
   (a pen lifted mid-event, a synthetic event), and a drag without capture
   still works while the pointer stays over the stage — so never let that
   failure end the gesture. */
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
            drawGrid(ctx, doc, style, view.zoom * dpr, {
                x0: -view.x / view.zoom / CELL, y0: -view.y / view.zoom / CELL,
                x1: (size.w - view.x) / view.zoom / CELL, y1: (size.h - view.y) / view.zoom / CELL,
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [doc, style, view, size, texTick]);

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

    const paintAlong = (from: Pt, to: Pt) => {
        const d = store.doc;
        const code = store.ui.terrain;
        const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.5));
        const cells: number[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            cells.push(...brushCells(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t,
                store.ui.brush, store.ui.brushSquare, d.cols, d.rows));
        }
        const terrain = paintCells(d.terrain, cells, code);
        if (terrain !== d.terrain) store.live((m) => { m.terrain = terrain; });
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
        if (gesture.current && gesture.current.kind !== 'pan' && gesture.current.kind !== 'pinch') store.cancel();
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
                if (!inside(at)) return;
                store.checkpoint();
                paintAlong(at, at);
                gesture.current = { kind: 'paint', last: at };
                return;
            case 'fill':
                if (!inside(at)) return;
                store.edit((d) => { d.terrain = floodFill(d, Math.floor(at[0]), Math.floor(at[1]), store.ui.terrain); });
                return;
            case 'path':
                gesture.current = { kind: 'path', pts: [at] };
                setDraft([at]);
                return;
            case 'erase':
                store.checkpoint();
                gesture.current = { kind: 'erase' };
                eraseAt(e);
                return;
            case 'stamp': {
                if (!inside(at)) return;
                const def = landmarkOf(store.ui.landmark);
                const [x, y] = place(at, def.size);
                const id = uid();
                store.edit((d) => {
                    d.stamps = [...d.stamps, { id, landmark: def.slug, x, y, size: def.size, rotation: 0, flip: false }];
                });
                store.setUi({ selection: { kind: 'stamp', id } });
                return;
            }
            case 'token': {
                const tok = store.ui.token;
                if (!tok) { toast('<i class="fa-solid fa-circle-info"></i> Choose a token in the side panel first.'); return; }
                if (!inside(at)) return;
                const [x, y] = place(at, 1);
                const id = uid();
                store.edit((d) => { d.tokens = [...d.tokens, { id, ...tok, x, y, size: 1 }]; });
                store.setUi({ selection: { kind: 'token', id } });
                return;
            }
            case 'label': {
                if (!inside(at)) return;
                const id = uid();
                store.edit((d) => {
                    d.labels = [...d.labels, { id, text: 'New label', x: at[0], y: at[1], role: store.ui.labelRole, scale: 1, rotation: 0 }];
                });
                store.setUi({ selection: { kind: 'label', id }, focusLabel: id });
                return;
            }
            case 'select': {
                /* Nothing took the press: paths are hit on their stroke only, so
                   try a looser distance test before calling it empty ground. */
                const hitTol = 0.5;
                const hit = [...store.doc.paths].reverse().find((p) => distToPolyline(at, p.points as Pt[]) < Math.max(hitTol, p.width / 2));
                if (hit) { startObjectGesture(e, { kind: 'path', id: hit.id }, 'move'); return; }
                store.setUi({ selection: null });
                return;
            }
        }
    };

    const startObjectGesture = (e: ReactPointerEvent, sel: Selection, grab: Grab) => {
        const d = store.doc;
        store.setUi({ selection: sel });
        store.checkpoint();
        const pos = positionsOf(d, sel);
        if (grab === 'move') {
            gesture.current = { kind: 'move', sel, start: toCell(e), orig: pos, moved: false };
        } else if (grab === 'resize' || grab === 'rotate') {
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
            if (store.ui.tool === 'paint' || store.ui.tool === 'fill') setHover(at);
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
                paintAlong(g.last, at);
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
                moveSelection(g.sel, g.orig, dx, dy);
                return;
            }
            case 'resize': {
                const s = store.doc.stamps.find((o) => o.id === g.sel.id);
                if (!s) return;
                /* The handle is a corner of the box, which is rotated with the
                   stamp — so measure along the box's own axes. */
                const r = -s.rotation * Math.PI / 180;
                const dx = at[0] - g.centre[0], dy = at[1] - g.centre[1];
                const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
                let size = Math.max(0.3, 2 * Math.max(Math.abs(lx), Math.abs(ly)));
                if (store.doc.grid.snap) size = Math.max(0.5, Math.round(size * 2) / 2);
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

    const moveSelection = (sel: Selection, orig: Pt[], dx: number, dy: number) => {
        store.live((d) => {
            if (sel.kind === 'path') {
                d.paths = d.paths.map((p) => (p.id === sel.id
                    ? { ...p, points: orig.map(([x, y]) => [x + dx, y + dy] as [number, number]) }
                    : p));
                return;
            }
            let [x, y] = [orig[0][0] + dx, orig[0][1] + dy];
            if (sel.kind === 'stamp') {
                const s = d.stamps.find((o) => o.id === sel.id);
                if (s && d.grid.snap) [x, y] = snapPoint(x, y, s.size);
                d.stamps = d.stamps.map((o) => (o.id === sel.id ? { ...o, x, y } : o));
            } else if (sel.kind === 'token') {
                const t = d.tokens.find((o) => o.id === sel.id);
                if (t && d.grid.snap) [x, y] = snapPoint(x, y, t.size);
                d.tokens = d.tokens.map((o) => (o.id === sel.id ? { ...o, x, y } : o));
            } else {
                d.labels = d.labels.map((o) => (o.id === sel.id ? { ...o, x, y } : o));
            }
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
            store.setUi({ selection: { kind: 'path', id } });
            return;
        }
        if (g.kind !== 'pan') store.settle();
    };

    const onPointerLeave = () => { if (!gesture.current) setHover(null); };

    /* ---------------------------------------------------------------- render */

    const W = doc.cols * CELL, H = doc.rows * CELL;
    const brushPx = ui.brush * CELL;
    const showBrush = hover && (ui.tool === 'paint' || ui.tool === 'fill') && !spaceHeld;
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
                {showBrush && hover && (
                    ui.tool === 'fill'
                        ? <div className="map-brush square" style={{ left: Math.floor(hover[0]) * CELL, top: Math.floor(hover[1]) * CELL, width: CELL, height: CELL }} />
                        : <div
                            className={'map-brush' + (ui.brushSquare || ui.brush <= 2 ? ' square' : '')}
                            style={{ left: hover[0] * CELL - brushPx / 2, top: hover[1] * CELL - brushPx / 2, width: brushPx, height: brushPx }}
                        />
                )}
            </div>
            <div className="map-zoom-readout">{Math.round(view.zoom * 100)}%</div>
        </div>
    );
}
