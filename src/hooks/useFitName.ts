import { useEffect } from 'react';

/* Long names (e.g. "Brambleghast") would wrap and shove the gender toggle out of
   place. Keep the title on one line and scale its font down until it fits the
   space left beside its row-mates. */
export function useFitName(deps: unknown[]): void {
    useEffect(() => {
        const fit = () => {
            const el = document.getElementById('pokemon-name');
            const row = el && el.parentElement;
            if (!el || !row) return;
            el.style.fontSize = '';                     // back to the 2.5rem default
            const rowStyle = getComputedStyle(row);
            const gap = parseFloat(rowStyle.columnGap || rowStyle.gap || '0') || 0;
            /* Hidden siblings (the Egg-only dex number, on every other species)
               take neither width nor a gap, so they must not be counted */
            let siblings = 0, shown = 0;
            Array.from(row.children).forEach((c) => {
                const el2 = c as HTMLElement;
                if (c !== el && !el2.offsetWidth) return;
                shown++;
                if (c !== el) siblings += el2.offsetWidth;
            });
            const avail = row.clientWidth - siblings - gap * Math.max(0, shown - 1);
            if (avail <= 0) return;
            let size = 2.5;
            while (el.scrollWidth > avail && size > 1.1) {
                size -= 0.1;
                el.style.fontSize = size.toFixed(2) + 'rem';
            }
        };

        fit();
        // Re-fit when the viewport (and thus the card/header width) changes
        window.addEventListener('resize', fit);
        // Web-font swap changes glyph widths: re-fit once fonts are ready
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
        return () => window.removeEventListener('resize', fit);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
