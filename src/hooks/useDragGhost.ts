import { useRef } from 'react';

/* Left to itself the browser drags a rectangular snapshot of the element, so a
   round tile travels as a square with hard corners that sits over the circles it
   passes. setDragImage takes a purpose-built copy instead — same diameter, same
   sprite, no selection ring.

   It has to be in the document and painted when setDragImage is called, so it is
   parked off-screen and swept up on the next tick (the browser snapshots it
   synchronously once the handler returns). */
export function useDragGhost() {
    const ghost = useRef<HTMLElement | null>(null);

    const clear = () => {
        if (ghost.current && ghost.current.parentNode) ghost.current.remove();
        ghost.current = null;
    };

    const setCircleDragImage = (e: React.DragEvent, sourceEl: HTMLElement) => {
        if (!e.dataTransfer || !e.dataTransfer.setDragImage) return;
        clear();
        const size = Math.round(sourceEl.getBoundingClientRect().width) || 62;
        const clone = sourceEl.cloneNode(true) as HTMLElement;
        /* Drop the transient states — a ghost should look like the tile at rest,
           not like the one being dragged out from under the cursor. */
        clone.classList.remove('selected', 'dragging', 'drop-hover');
        clone.classList.add('box-drag-ghost');
        clone.style.width = size + 'px';
        clone.style.height = size + 'px';
        document.body.appendChild(clone);
        ghost.current = clone;
        try { e.dataTransfer.setDragImage(clone, size / 2, size / 2); } catch { /* older engines */ }
        setTimeout(clear, 0);
    };

    return { setCircleDragImage, clearDragGhost: clear };
}
