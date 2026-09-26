import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

/* A small window hanging off a button: the brush picker, and the top bar's
   grid, size, scale and export settings.

   In a portal on <body>, placed against its anchor with position: fixed, so no
   panel's overflow can clip it (the side panel scrolls; the top bar wraps on a
   phone) — and held inside the viewport, so a button at the right edge opens a
   window that grows leftwards instead of off the screen.

   Closes on Escape and on a press anywhere outside it and its anchor. The
   Escape is taken in the capture phase and stopped, so the page's own Escape
   (clear the selection) does not fire as well. */

const MARGIN = 8;

export function Popover({ anchor, open, onClose, children, className }: {
    anchor: RefObject<HTMLElement>;
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    className?: string;
}) {
    const box = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        if (!open) { setPos(null); return; }
        const place = () => {
            const a = anchor.current?.getBoundingClientRect();
            const b = box.current;
            if (!a || !b) return;
            const w = b.offsetWidth, h = b.offsetHeight;
            let left = a.left;
            if (left + w > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - w;
            left = Math.max(MARGIN, left);
            let top = a.bottom + 6;
            /* No room below: open above the button instead. */
            if (top + h > window.innerHeight - MARGIN && a.top - 6 - h >= MARGIN) top = a.top - 6 - h;
            setPos({ left, top: Math.max(MARGIN, top) });
        };
        place();
        const ro = new ResizeObserver(place);
        if (box.current) ro.observe(box.current);
        window.addEventListener('resize', place);
        return () => { ro.disconnect(); window.removeEventListener('resize', place); };
    }, [open, anchor]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (box.current?.contains(t) || anchor.current?.contains(t)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
        };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open, onClose, anchor]);

    if (!open) return null;
    return createPortal(
        <div
            ref={box}
            className={'map-popover' + (className ? ' ' + className : '')}
            role="dialog"
            /* Measured first, invisibly, then placed. */
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
        >
            {children}
        </div>,
        document.body,
    );
}
