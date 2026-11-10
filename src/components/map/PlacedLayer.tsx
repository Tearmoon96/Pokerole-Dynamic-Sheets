import { memo, useLayoutEffect, useRef } from 'react';
import { CELL } from '../../map/render/patterns';
import type { MapStyle } from '../../map/styles';
import type { LookId, MapDoc, MapPlaced, Selection } from '../../map/types';
import { PAD, clashes, depthOrder, dims, footprint, renderSprite, segOutline, spriteBox, variantOf } from '../../map/world/placed';
import { itemOf } from '../../map/world/catalog';
import { linkedDoc } from '../../map/world';
import { TokenView } from './MapObjects';
import type { ObjectDown } from './MapObjects';

/* A city's buildings, trees and benches, and its tokens, as ONE layer drawn
   back to front (world/placed.ts): a token behind a house is covered by its
   roof, a token in front of it is not. DOM order is paint order, so no
   z-index is needed.

   Each placed thing is its own canvas, drawn by the item's vector painter at
   a resolution chosen from the zoom (`res`, in steps, so a wheel of zooming
   does not redraw every house), and redrawn only when the thing, the look
   or that step changes. The press goes to a box over the sprite itself, not
   to the padding round it kept for shadows and glow. */

const isSel = (sel: Selection[], kind: Selection['kind'], id: string) => sel.some((x) => x.kind === kind && x.id === id);

/** The longest side, in px, one placed thing's canvas may have. */
const MAX_SIDE = 1200;

/** px per cell to draw at: the screen's at this zoom, in a few steps, capped. */
export function resFor(zoom: number): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const want = zoom * dpr;
    const step = want <= 1 ? 1 : want <= 2 ? 2 : want <= 3 ? 3 : 4;
    return CELL * step;
}

export const PlacedView = memo(function PlacedView({ p, look, res, selected, clash, opens, ghost, onDown }: {
    p: MapPlaced; look: LookId | undefined; res: number; selected: boolean; clash: boolean;
    /** The interior it opens, if any: a door badge in the editor. */
    opens?: string;
    /** The Build tool's preview under the pointer. */
    ghost?: boolean;
    onDown?: ObjectDown;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const b = spriteBox(p);
    const f = footprint(p);
    const ox = (b.x - PAD) * CELL, oy = (b.y - PAD) * CELL;
    const W = (b.w + PAD * 2) * CELL, H = (b.h + PAD * 2) * CELL;

    /* A big building at a close zoom would be a canvas of millions of
       pixels, and a city has a hundred of them: no side past MAX_SIDE. */
    const u = Math.max(8, Math.min(res, Math.floor(MAX_SIDE / Math.max(b.w + PAD * 2, b.h + PAD * 2))));
    useLayoutEffect(() => {
        if (canvas.current) renderSprite(canvas.current, p, u, look);
    }, [p, u, look]);

    const sel = { kind: 'placed' as const, id: p.id };
    /* A wall piece takes presses on the wall itself, not on its whole box,
       or a slanting piece would cover its neighbours. */
    const hull = segOutline(p);
    const clip = hull ? `polygon(${hull.map(([x, y]) => `${((x - b.x) * CELL).toFixed(1)}px ${((y - b.y) * CELL).toFixed(1)}px`).join(', ')})` : undefined;
    return (
        <div
            className={'map-placed' + (selected ? ' selected' : '') + (hull ? ' piece' : '') + (ghost ? ' ghost' : '') + (clash ? ' clash' : '')
                + (p.label && p.labelShow === 'hover' ? ' label-hover' : '')}
            style={{ left: ox, top: oy, width: W, height: H }}
            data-placed={p.id}
        >
            <canvas ref={canvas} className="map-placed-art" style={{ width: W, height: H }} />
            {(selected || ghost || clash) && !hull && (
                <span className="map-placed-foot" style={{
                    left: (f.x - b.x + PAD) * CELL, top: (f.y - b.y + PAD) * CELL, width: f.w * CELL, height: f.h * CELL,
                }} />
            )}
            {!ghost && (
                <div
                    className="map-obj map-placed-hit"
                    data-obj={'placed:' + p.id}
                    style={{ left: PAD * CELL, top: PAD * CELL, width: b.w * CELL, height: b.h * CELL, clipPath: clip }}
                    onPointerDown={onDown ? (e) => onDown(e, sel, 'move') : undefined}
                />
            )}
            {opens && !ghost && (
                <span className="map-link-badge map-placed-door" data-opens={opens} style={{ left: PAD * CELL, top: PAD * CELL, fontSize: 11 }}
                    title="Opens an interior — double-click to step inside">
                    <i className="fa-solid fa-door-open"></i>
                </span>
            )}
            {p.label && !ghost && (
                <span className="map-placed-label" style={{ top: (b.h + PAD) * CELL + 2 }}>{p.label}</span>
            )}
        </div>
    );
});

/** Buildings and tokens of a city or interior, back to front. */
export function DepthLayer({ doc, style, selection, res, maps, onDown }: {
    doc: MapDoc; style: MapStyle; selection: Selection[]; res: number; maps: MapDoc[]; onDown: ObjectDown;
}) {
    const order = depthOrder(doc.placed, doc.tokens);
    return (
        <>
            {order.map((e) => (e.kind === 'placed'
                ? (
                    <PlacedView
                        key={'p:' + e.obj.id} p={e.obj} look={doc.look} res={res}
                        selected={isSel(selection, 'placed', e.obj.id)}
                        clash={isSel(selection, 'placed', e.obj.id) && clashes(doc, e.obj)}
                        opens={linkedDoc(maps, e.obj)?.id}
                        onDown={onDown}
                    />
                )
                : (
                    <TokenView key={'t:' + e.obj.id} token={e.obj} style={style} selected={isSel(selection, 'token', e.obj.id)} onDown={onDown} />
                )))}
        </>
    );
}

/** Where the Build tool would put its item for a pointer at `at`. */
export function BuildGhost({ doc, item, rot, variant: want, flip, at, res }: {
    doc: MapDoc; item: string; rot: 1 | undefined; variant: number; flip: boolean; at: [number, number]; res: number;
}) {
    const variant = variantOf(itemOf(item), want);
    const { w, h } = dims({ item, rot, variant });
    const snap = doc.grid.snap;
    const x = snap ? Math.round(at[0] - w / 2) : at[0] - w / 2;
    const y = snap ? Math.round(at[1] - h / 2) : at[1] - h / 2;
    const p: MapPlaced = { id: '__ghost', item, x, y, ...(rot ? { rot } : {}), ...(variant ? { variant } : {}), ...(flip ? { flip } : {}) };
    return <PlacedView p={p} look={doc.look} res={res} selected={false} clash={clashes(doc, p)} ghost />;
}
