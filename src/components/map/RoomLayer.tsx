import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { CELL } from '../../map/render/patterns';
import { drawRoom } from '../../map/world/room';
import type { Pt } from '../../map/world/room';
import { MAX_CORNERS, crossings, nearestEdge, pieceAt, pieceOutline, regionOf } from '../../map/world/room';
import type { MapUi } from '../../map/store';
import type { MapStore } from '../../map/store';
import type { LookId, MapRoom } from '../../map/types';

/* An interior's walls and floor (world/room.ts) as one canvas over the
   ground and under the furniture, redrawn when the room, the look or the
   zoom step changes; and, under the Room tool, the outline's corners as
   handles to drag. */

/** The longest side, in px, the room's canvas may have. */
const MAX_SIDE = 4096;

export const RoomLayer = memo(function RoomLayer({ room, look, cols, rows, res, grid }: {
    room: MapRoom; look: LookId | undefined; cols: number; rows: number; res: number;
    /** The grid's opacity when it shows, so furniture can be lined up on the floor. */
    grid: number;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    const u = Math.max(8, Math.min(res, Math.floor(MAX_SIDE / Math.max(cols, rows))));
    useLayoutEffect(() => {
        const c = ref.current;
        if (!c) return;
        const w = cols * u, h = rows * u;
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        drawRoom(ctx, room, u, look, cols, rows);
        if (grid > 0) {
            ctx.save();
            ctx.globalAlpha = grid * 0.35;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 1; x < cols; x++) { ctx.moveTo(x * u + 0.5, 0); ctx.lineTo(x * u + 0.5, h); }
            for (let y = 1; y < rows; y++) { ctx.moveTo(0, y * u + 0.5); ctx.lineTo(w, y * u + 0.5); }
            ctx.stroke();
            ctx.restore();
        }
    }, [room, look, cols, rows, u, grid]);
    return <canvas ref={ref} className="map-room" style={{ width: cols * CELL, height: rows * CELL }} />;
});

/** The Room tool's handles: a dot on each corner, a plus halfway along each edge. */
export function RoomHandles({ store, room, cols, rows, zoom }: {
    store: MapStore; room: MapRoom; cols: number; rows: number; zoom: number;
}) {
    const svg = useRef<SVGSVGElement>(null);
    const drag = useRef<{ index: number; id: number } | null>(null);
    /* Handle sizes in cells, so they stay the same size on screen. */
    const k = 1 / (CELL * zoom);
    const pts = room.pts;

    const cellAt = (e: ReactPointerEvent): Pt => {
        const r = svg.current!.getBoundingClientRect();
        const x = Math.round((e.clientX - r.left) / r.width * cols);
        const y = Math.round((e.clientY - r.top) / r.height * rows);
        return [Math.max(0, Math.min(cols, x)), Math.max(0, Math.min(rows, y))];
    };
    const setCorner = (index: number, at: Pt) => {
        store.live((d) => {
            if (!d.room) return;
            const next = d.room.pts.slice();
            if (next[index][0] === at[0] && next[index][1] === at[1]) return;
            next[index] = at;
            /* Walls may never cross: the corner stays where it last could be.
               A room already tangled may still be moved, as long as it does
               not get worse, so it can be untangled. */
            if (crossings(next) > crossings(d.room.pts)) return;
            d.room = { ...d.room, pts: next };
        });
    };
    const start = (e: ReactPointerEvent<SVGElement>, index: number, insert: boolean) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        store.checkpoint();
        if (insert) {
            if (pts.length >= MAX_CORNERS) { store.cancel(); return; }
            const a = pts[index], b = pts[(index + 1) % pts.length];
            const mid: Pt = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
            store.live((d) => {
                if (!d.room) return;
                const next = d.room.pts.slice();
                next.splice(index + 1, 0, mid);
                d.room = { ...d.room, pts: next };
            });
            index += 1;
        }
        drag.current = { index, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = (e: ReactPointerEvent<SVGElement>) => {
        const g = drag.current;
        if (!g || g.id !== e.pointerId) return;
        setCorner(g.index, cellAt(e));
    };
    const end = (e: ReactPointerEvent<SVGElement>) => {
        const g = drag.current;
        if (!g || g.id !== e.pointerId) return;
        drag.current = null;
        store.settle();
    };
    const remove = (index: number) => {
        if (pts.length <= 3) return;
        const next = pts.filter((_, i) => i !== index);
        if (crossings(next) > crossings(pts)) return;
        store.edit((d) => {
            if (!d.room) return;
            d.room = { ...d.room, pts: d.room.pts.filter((_, i) => i !== index) };
        });
    };

    return (
        <svg
            ref={svg} className="map-room-handles" data-room-handles=""
            viewBox={`0 0 ${cols} ${rows}`} width={cols * CELL} height={rows * CELL}
        >
            <polygon points={pts.map((p) => p.join(',')).join(' ')} className="map-room-outline" strokeWidth={2 * k} />
            {pts.map((a, i) => {
                const b = pts[(i + 1) % pts.length];
                const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
                const long = Math.hypot(b[0] - a[0], b[1] - a[1]) >= 2;
                return long && (
                    <g key={'m' + i} className="map-room-add" data-room-add={i}
                        onPointerDown={(e) => start(e, i, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
                        <circle cx={mx} cy={my} r={7 * k} />
                        <path d={`M${mx - 3.5 * k},${my}H${mx + 3.5 * k}M${mx},${my - 3.5 * k}V${my + 3.5 * k}`} strokeWidth={1.6 * k} />
                    </g>
                );
            })}
            {pts.map((p, i) => (
                <circle
                    key={'c' + i} className="map-room-corner" data-room-corner={i}
                    cx={p[0]} cy={p[1]} r={8 * k} strokeWidth={2 * k}
                    onPointerDown={(e) => start(e, i, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
                    onDoubleClick={(e) => { e.stopPropagation(); remove(i); }}
                >
                    <title>Drag to move this corner; double-click to remove it</title>
                </circle>
            ))}
        </svg>
    );
}

/** What a click of the Room tool would change, under the pointer: the piece
    of wall it draws or rubs out, the cells the floor brush covers, the room
    a fill would reach, the wall a roller would paper. */
export function RoomCursor({ room, at, ui, cols, rows, zoom }: {
    room: MapRoom; at: Pt; ui: MapUi; cols: number; rows: number; zoom: number;
}) {
    const k = 1 / (CELL * zoom);
    const mode = ui.roomMode;
    const cx = Math.floor(at[0]), cy = Math.floor(at[1]);
    const fill = mode !== 'walls' && ui.roomFill;
    /* A fill's reach only changes from cell to cell. */
    const region = useMemo(() => (fill ? regionOf(room, cols, rows, cx, cy) : null), [fill, room, cols, rows, cx, cy]);
    let body: JSX.Element | null = null;
    if (mode === 'walls') {
        const v: Pt = [Math.round(at[0]), Math.round(at[1])];
        if (Math.hypot(at[0] - v[0], at[1] - v[1]) <= 0.4) {
            body = <circle cx={v[0]} cy={v[1]} r={6 * k} strokeWidth={2 * k} className="map-room-cursor-dot" />;
        } else {
            const [o, x, y] = nearestEdge(at[0], at[1]);
            const [x2, y2] = o === 'h' ? [x + 1, y] : [x, y + 1];
            body = <line x1={x} y1={y} x2={x2} y2={y2} strokeWidth={6 * k} className={'map-room-cursor-line' + (ui.roomErase ? ' erase' : '')} />;
        }
    } else if (region) {
        body = (
            <path className="map-room-cursor-area" strokeWidth={1.5 * k}
                d={region.map((i) => { const x = i % cols, y = (i - x) / cols; return `M${x},${y}h1v1h-1z`; }).join('')} />
        );
    } else if (mode === 'floor') {
        const n = ui.roomBrush;
        const x0 = n % 2 ? cx - (n - 1) / 2 : Math.round(at[0]) - n / 2;
        const y0 = n % 2 ? cy - (n - 1) / 2 : Math.round(at[1]) - n / 2;
        body = <rect x={x0} y={y0} width={n} height={n} strokeWidth={2 * k} className="map-room-cursor-area" />;
    } else {
        const key = pieceAt(room, at[0], at[1]);
        const pts = key ? pieceOutline(room, key) : null;
        if (pts) body = <polygon points={pts.map((p) => p.join(',')).join(' ')} strokeWidth={2 * k} className="map-room-cursor-area" />;
    }
    return (
        <svg className="map-room-cursor" viewBox={`0 0 ${cols} ${rows}`} width={cols * CELL} height={rows * CELL} data-room-cursor={mode}>
            {body}
        </svg>
    );
}
