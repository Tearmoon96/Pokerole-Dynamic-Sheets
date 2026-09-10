import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* The species grid both pickers use, rendering only the rows near the viewport.

   Why it has to: the dex is 1200 entries and every tile pulls a Home render,
   which is a 512x512 PNG — about 1MB of decoded RGBA apiece, to be shown in a
   62px box. Rendering the lot put 1200 tiles and 1247 <img> elements in one
   72,000px-tall scroller, and scrolling it walked the browser through up to a
   gigabyte of decoded bitmap. `loading="lazy"` does not save you: it defers the
   load until the image scrolls near view, which is exactly what scrolling does.

   The symptoms were a tab that stopped responding — to a reload as well, since
   the main thread never got far enough to process one — and, while it thrashed,
   rows repainting stale so the grid appeared to repeat itself. Both are what
   memory pressure looks like from the outside, and both are random in the way
   memory pressure is: they depend on what else the machine is holding.

   Windowing caps all of it at a few screens' worth no matter how long the list
   is. The reserved space above and below is PADDING on the grid rather than
   spacer children, because a spacer would be a grid item and would collect a
   `gap` of its own, putting the arithmetic permanently one gap out. */

const OVERSCAN_ROWS = 3;

/** Fallback until a tile has been laid out and can be measured. */
const ASSUMED_TILE_H = 144;

export function PokeTileGrid<T>({ items, id, children }: {
    items: T[];
    id?: string;
    /** Renders one tile. Must render an element carrying `.poke-tile`. */
    children: (item: T, index: number) => ReactNode;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    const grid = useRef<HTMLDivElement>(null);
    const [win, setWin] = useState({ start: 0, end: 60, top: 0, bottom: 0 });

    /* Row height is measured off a real tile rather than hard-coded, so the
       stylesheet stays the single place the tile's size is decided. It is only
       trustworthy because `.poke-tile` has a fixed height — with ragged tiles
       (they ranged 110-144px before, from two sprite sizes and names wrapping
       to different line counts) no single row height exists and the window
       drifts out of step with the scrollbar. */
    const measure = useCallback(() => {
        const sc = scroller.current;
        const gr = grid.current;
        if (!sc || !gr) return;
        const style = getComputedStyle(gr);
        const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
        const gap = parseFloat(style.rowGap) || 0;
        const tile = gr.querySelector<HTMLElement>('.poke-tile');
        const rowH = ((tile && tile.offsetHeight) || ASSUMED_TILE_H) + gap;
        const rows = Math.ceil(items.length / cols);

        const firstRow = Math.max(0, Math.floor(sc.scrollTop / rowH) - OVERSCAN_ROWS);
        const shownRows = Math.ceil(sc.clientHeight / rowH) + OVERSCAN_ROWS * 2 + 1;
        const lastRow = Math.min(rows, firstRow + shownRows);

        const next = {
            start: firstRow * cols,
            end: Math.min(items.length, lastRow * cols),
            top: firstRow * rowH,
            bottom: Math.max(0, (rows - lastRow) * rowH),
        };
        /* Scroll fires far more often than the window actually moves. */
        setWin((prev) => (prev.start === next.start && prev.end === next.end
            && prev.top === next.top && prev.bottom === next.bottom) ? prev : next);
    }, [items.length]);

    /* A new search is a different list: staying at the old offset would leave
       you looking at reserved padding with nothing in it. */
    useLayoutEffect(() => {
        if (scroller.current) scroller.current.scrollTop = 0;
        measure();
    }, [items, measure]);

    useEffect(() => {
        const sc = scroller.current;
        if (!sc) return;
        const onScroll = () => measure();
        sc.addEventListener('scroll', onScroll, { passive: true });
        /* The modal is sized in vh and the column count comes from auto-fill,
           so both change with the window without any scroll happening. */
        const ro = new ResizeObserver(() => measure());
        ro.observe(sc);
        if (grid.current) ro.observe(grid.current);
        return () => { sc.removeEventListener('scroll', onScroll); ro.disconnect(); };
    }, [measure]);

    return (
        <div className="poke-picker-scroll" ref={scroller}>
            <div
                className="poke-picker-grid"
                id={id}
                ref={grid}
                style={{ paddingTop: win.top, paddingBottom: win.bottom }}
            >
                {items.slice(win.start, win.end).map((item, i) => children(item, win.start + i))}
            </div>
        </div>
    );
}
