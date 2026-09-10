import { useCallback, useEffect, useRef, useState } from 'react';

/* "Which one did I just move?"

   The up/down buttons reorder a list in place, and the thing that moved ends up
   looking exactly like the thing it swapped with — on a roster of five similar
   cards, or a combat list of six, the only way to tell whether the press landed
   is to re-read the order. So the row that moved says so for a moment: the
   caller flashes its id, the id comes back as a class, and the stylesheet fades
   a tint over that row and stops.

   The reset-then-set is the load-bearing part. A CSS animation runs when the
   class ARRIVES, and these lists are keyed by id, so moving the same row twice
   in a row hands React the same DOM node with the class already on it and
   nothing plays the second time. Dropping the id for one frame is what makes
   the class arrive again. requestAnimationFrame rather than a 0ms timeout
   because the browser must have painted the class-less frame for the animation
   to restart; a macrotask can be coalesced into the same paint.

   Ids are opaque strings, so one hook serves all four callers — notes and their
   folders, roster entries and theirs, and the combat rows. */
export function useFlash(ms = 850): [string | null, (id: string) => void] {
    const [id, setId] = useState<string | null>(null);
    const timer = useRef(0);
    const frame = useRef(0);

    const flash = useCallback((next: string) => {
        window.clearTimeout(timer.current);
        cancelAnimationFrame(frame.current);
        setId(null);
        frame.current = requestAnimationFrame(() => {
            setId(next);
            timer.current = window.setTimeout(() => setId(null), ms);
        });
    }, [ms]);

    /* A panel can be unmounted mid-flash — the phone board swaps one for
       another on every tab press. */
    useEffect(() => () => {
        window.clearTimeout(timer.current);
        cancelAnimationFrame(frame.current);
    }, []);

    return [id, flash];
}
