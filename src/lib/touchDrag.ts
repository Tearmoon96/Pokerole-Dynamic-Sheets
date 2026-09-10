/* Long-press reordering for touch screens.

   HTML5 drag-and-drop — `draggable`, dragstart, drop — DOES NOT EXIST ON
   TOUCH. Not "works badly": a finger never fires a dragstart on iOS Safari or
   Chrome for Android, so every list in the app that reorders by dragging is
   simply inert on a phone or a tablet. Three of them: the GM board's panels,
   the Pokémon card's move list, and the PC storage boxes.

   The gesture here is press-and-hold, then slide, which is what a touch user
   already expects from reordering a home screen. It has to be a hold rather
   than an immediate drag because a straight swipe on a list is a SCROLL, and
   stealing that would be a worse bug than the one being fixed.

   Native drag is left exactly as it is for a mouse. This runs only where the
   pointer is coarse, so the desktop path is untouched and nothing here can
   regress it.

   Both halves of the pair carry the same `data-reorder-group`, which is what
   the drop test looks for under the finger — so an item can never be dropped
   into a different list that happens to be underneath. */

import { isTouchDevice } from './device';

/* Long enough not to fire on a flick, short enough not to feel stuck. */
const HOLD_MS = 350;
/* Moving further than this before the hold completes means the user is
   scrolling, so the drag is abandoned rather than started under them. */
const SLOP_PX = 10;

interface Drag {
    from: string;
    group: string;
    el: HTMLElement;
    over: HTMLElement | null;
    onReorder: (from: string, to: string) => void;
}

let drag: Drag | null = null;

function keyUnder(x: number, y: number, group: string): { el: HTMLElement; key: string } | null {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    const el = (hit as HTMLElement).closest<HTMLElement>('[data-reorder-group="' + group + '"]');
    const key = el?.getAttribute('data-reorder-key');
    return el && key ? { el, key } : null;
}

function highlight(next: HTMLElement | null): void {
    if (!drag || drag.over === next) return;
    drag.over?.classList.remove('touch-drop-target');
    next?.classList.add('touch-drop-target');
    drag.over = next;
}

function endDrag(commitTo: string | null): void {
    if (!drag) return;
    const { from, el, over, onReorder } = drag;
    el.classList.remove('touch-dragging');
    over?.classList.remove('touch-drop-target');
    document.body.classList.remove('touch-reordering');
    drag = null;
    if (commitTo && commitTo !== from) onReorder(from, commitTo);
}

/** Marks an element as one reorderable item: both a thing that can be picked
    up and a place another can be dropped. Spread onto the same element the
    native `draggable` handlers are on. */
export function reorderItem(group: string, itemKey: string): Record<string, string> {
    return { 'data-reorder-group': group, 'data-reorder-key': itemKey };
}

/** The grab handle. Separate from reorderItem because the two are not always
    the same element: a GM board panel is dragged only by its grip, so that a
    long press on a note or a field inside it cannot pick the whole panel up —
    exactly the restriction the native path already enforces by only setting
    `draggable` while the grip is under the press. Where the whole tile IS the
    handle, put both on the tile. */
export function reorderHandle(opts: {
    itemKey: string;
    group: string;
    onReorder: (from: string, to: string) => void;
    /** An extra veto, not an override: touch is always required as well.
        The move list uses it to stop an expanded card being picked up,
        matching what its native `draggable` already does. */
    enabled?: boolean;
}): Record<string, unknown> {
    const { itemKey, group, onReorder } = opts;
    if (opts.enabled === false || !isTouchDevice()) return {};

    return {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
            /* A mouse keeps the native drag, which is the better of the two:
               it gives a real drag image and needs no hold. */
            if (e.pointerType === 'mouse') return;

            const el = e.currentTarget.closest<HTMLElement>('[data-reorder-group="' + group + '"]');
            if (!el) return;
            const startX = e.clientX;
            const startY = e.clientY;

            let held: number | null = window.setTimeout(() => {
                held = null;
                drag = { from: itemKey, group, el, over: null, onReorder };
                el.classList.add('touch-dragging');
                document.body.classList.add('touch-reordering');
                /* The standard "you may now move it" tick, and the only
                   feedback available when the finger is covering the thing
                   that just changed. Absent on iOS, which has no vibrate. */
                navigator.vibrate?.(15);
            }, HOLD_MS);

            const cancelHold = () => {
                if (held !== null) { clearTimeout(held); held = null; }
            };

            const move = (ev: PointerEvent) => {
                if (held !== null) {
                    if (Math.abs(ev.clientX - startX) > SLOP_PX || Math.abs(ev.clientY - startY) > SLOP_PX) {
                        cancelHold();          // it was a scroll after all
                    }
                    return;
                }
                if (!drag) return;
                const hit = keyUnder(ev.clientX, ev.clientY, group);
                highlight(hit ? hit.el : null);
            };

            /* Once the drag is live the page must not scroll under it.
               touch-action cannot do this on its own: it is read when the
               gesture STARTS, and at that point this was still a possible
               scroll. Cancelling touchmove is the only thing that stops it
               mid-gesture, and the listener has to be non-passive or the
               preventDefault is ignored. */
            const blockScroll = (ev: TouchEvent) => { if (drag) ev.preventDefault(); };

            const detach = () => {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', finish);
                document.removeEventListener('pointercancel', abort);
                document.removeEventListener('touchmove', blockScroll);
            };
            const finish = (ev: PointerEvent) => {
                cancelHold();
                const hit = drag ? keyUnder(ev.clientX, ev.clientY, group) : null;
                endDrag(hit ? hit.key : null);
                detach();
            };
            const abort = () => { cancelHold(); endDrag(null); detach(); };

            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', finish);
            document.addEventListener('pointercancel', abort);
            document.addEventListener('touchmove', blockScroll, { passive: false });
        },
    };
}
