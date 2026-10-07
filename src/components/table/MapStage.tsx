/* The map in the middle of the table: drag to pan, wheel or pinch to zoom.

   The view is this browser's own — nobody else's screen moves when one player
   zooms in. A live map that refreshes keeps the view where it was, as long as
   the picture is the same size. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTable } from '../../table/TableContext';

interface View { x: number; y: number; k: number }

const MIN_K = 0.05;
const MAX_K = 8;

export function MapStage() {
    const { session } = useTable();
    const map = session.map.view;
    const box = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<View | null>(null);
    const fitted = useRef('');
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ dist: number; k: number } | null>(null);

    const fit = useCallback(() => {
        const el = box.current;
        if (!el || !map.w || !map.h) return;
        const r = el.getBoundingClientRect();
        /* Not laid out yet: the resize observer fits it once it is. */
        if (r.width < 8 || r.height < 8) return;
        const k = Math.min(r.width / map.w, r.height / map.h) * 0.98;
        setView({ k, x: (r.width - map.w * k) / 2, y: (r.height - map.h * k) / 2 });
    }, [map.w, map.h]);

    /* A new picture of a different size starts fitted; a refresh of the same
       one keeps the view. */
    useEffect(() => {
        const key = map.w + 'x' + map.h;
        if (map.url && fitted.current !== key) {
            fitted.current = key;
            fit();
        }
    }, [map.url, map.w, map.h, fit]);

    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(() => { if (!view && map.url) fit(); });
        ro.observe(el);
        return () => ro.disconnect();
    }, [fit, view, map.url]);

    const zoomAt = (cx: number, cy: number, factor: number) => {
        setView((v) => {
            if (!v) return v;
            const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
            const f = k / v.k;
            return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
        });
    };

    /* A non-passive listener: React's onWheel cannot preventDefault, and the
       page would scroll under the zoom. */
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const onDown = (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2 && view) {
            const [a, b] = [...pointers.current.values()];
            gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
        }
    };

    const onMove = (e: React.PointerEvent) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev || !view) return;
        const next = { x: e.clientX, y: e.clientY };
        pointers.current.set(e.pointerId, next);
        if (pointers.current.size === 1) {
            setView((v) => (v ? { ...v, x: v.x + next.x - prev.x, y: v.y + next.y - prev.y } : v));
        } else if (pointers.current.size === 2 && gesture.current && box.current) {
            const [a, b] = [...pointers.current.values()];
            const r = box.current.getBoundingClientRect();
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const target = Math.max(MIN_K, Math.min(MAX_K, gesture.current.k * dist / gesture.current.dist));
            zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, target / view.k);
        }
    };

    const onUp = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) gesture.current = null;
    };

    const zoomButton = (factor: number) => {
        const r = box.current?.getBoundingClientRect();
        if (r) zoomAt(r.width / 2, r.height / 2, factor);
    };

    return (
        <div className="map-stage">
            <div className="map-stage-head">
                <span className="map-stage-title">
                    <i className="fa-solid fa-map"></i> {map.title || 'Map'}
                </span>
                {map.live && <span className="map-live-tag" title="The GM is editing this map; it updates as they go">LIVE</span>}
                {map.loading !== null && (
                    <span className="map-stage-loading">
                        <i className="fa-solid fa-circle-notch fa-spin"></i> {Math.round(map.loading * 100)}%
                    </span>
                )}
                <span className="bar-spacer"></span>
                <button className="icon-btn" aria-label="Zoom out" onClick={() => zoomButton(1 / 1.3)}>
                    <i className="fa-solid fa-magnifying-glass-minus"></i>
                </button>
                <button className="icon-btn" aria-label="Zoom in" onClick={() => zoomButton(1.3)}>
                    <i className="fa-solid fa-magnifying-glass-plus"></i>
                </button>
                <button className="icon-btn" title="Fit the whole map" onClick={fit}>
                    <i className="fa-solid fa-expand"></i>
                </button>
            </div>
            <div
                ref={box}
                className="map-stage-view"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onDoubleClick={fit}
            >
                {map.url && view && (
                    <img
                        className="map-stage-img"
                        src={map.url}
                        alt={map.title || 'The shared map'}
                        draggable={false}
                        style={{
                            width: map.w, height: map.h,
                            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                        }}
                    />
                )}
                {!map.url && (
                    <p className="map-stage-empty">
                        {map.error || (map.loading !== null ? 'The map is on its way…' : 'Waiting for the map…')}
                    </p>
                )}
                {map.url && map.error && <p className="map-stage-error">{map.error}</p>}
            </div>
        </div>
    );
}
