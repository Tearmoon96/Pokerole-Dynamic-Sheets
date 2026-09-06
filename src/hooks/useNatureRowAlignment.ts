import { useEffect } from 'react';

/* Puts the Nature / Extra row level with the CHARACTER row of the licence plate
   beside it. The two live in different panels, so no stylesheet rule can tie
   them together — and the distance depends on font metrics, which differ
   between browsers and are not even settled until the webfont has loaded. So:
   measure from zero, then hand CSS the offset.

   Only while the two are actually side by side. Under the stacked layout the
   plate is above the quadrant, not opposite it, and there is nothing to line up
   with. */
export function useNatureRowAlignment(deps: unknown[] = []): void {
    useEffect(() => {
        const align = () => {
            /* .license-plate, not its first .plate-row: what has to meet the
               Nature pill's edge is the plate's painted border, and the row
               inside it starts a border-width lower. Rounded, because the two
               rects can land on fractions the browser then paints to different
               whole pixels. */
            const plate = document.querySelector('.license-plate');
            const nat = document.querySelector('.nature-rank');
            if (!plate || !nat) return;
            const root = document.documentElement;
            root.style.setProperty('--natrank-lift', '0px');
            const p = plate.getBoundingClientRect();
            const n = nat.getBoundingClientRect();
            if (n.left < p.right) return;          // stacked: leave it alone
            root.style.setProperty('--natrank-lift', Math.round(p.top - n.top) + 'px');
        };

        align();
        window.addEventListener('resize', align);
        /* Metrics move when the webfont swaps in, so measure again once it has */
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
        return () => window.removeEventListener('resize', align);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
