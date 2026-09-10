/* Which kind of screen this is, published as attributes on <html>.

   Two attributes, not one, because size and input are different questions and
   answering them together is what makes responsive layouts wrong:

     data-device="phone|tablet|desktop"   how much room there is
     data-pointer="coarse|fine"           what is doing the pointing

   A desktop window dragged narrow should stack like a phone — that is a size
   question. It should NOT grow 44px finger-sized buttons — that is a pointer
   question, and the mouse is still a mouse. Keying both off one breakpoint is
   why so many sites turn chunky when you resize them.

   Deliberately width-driven rather than user-agent driven: there is no reliable
   way to ask a browser "are you a tablet", every attempt to sniff it has aged
   badly, and the layout only ever cared about the room it has anyway.

   The desktop floor is above the 1400px `compare-ui` shoots at, so the pixel
   harness keeps measuring exactly the layout it always did. */

import { useSyncExternalStore } from 'react';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

/* A 6.7" phone reports ~412 CSS px across in portrait, ~430 at the largest.
   640 leaves room above the biggest of them without reaching a small tablet. */
const PHONE_MAX = 640;

/* A 10.5" tablet in landscape reports ~1112; an 11" iPad Pro 1194. 1180 keeps
   the 10.5" reference and the common 1024 sizes on the tablet side while
   leaving a real desktop window alone. */
const TABLET_MAX = 1180;

export function deviceClass(width = window.innerWidth): DeviceClass {
    if (width <= PHONE_MAX) return 'phone';
    if (width <= TABLET_MAX) return 'tablet';
    return 'desktop';
}

export function isCoarsePointer(): boolean {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;
}

/** True where HTML5 drag-and-drop will not fire — see lib/touchDrag.ts. */
export function isTouchDevice(): boolean {
    return isCoarsePointer() || navigator.maxTouchPoints > 0;
}

function stamp(): void {
    const root = document.documentElement;
    root.setAttribute('data-device', deviceClass());
    root.setAttribute('data-pointer', isCoarsePointer() ? 'coarse' : 'fine');
    root.setAttribute('data-orient', window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait');
}

/* Called once per page, before React mounts, so the first paint is already in
   the right class and nothing re-flows under the user.

   resize covers rotation too — orientationchange fires BEFORE the new size is
   readable on several browsers, so reading innerWidth there gives the old one.
   The visualViewport listener is what catches the phone case resize misses:
   the on-screen keyboard opening shrinks the visual viewport without ever
   firing a window resize on iOS. */
export function initDevice(): void {
    stamp();
    window.addEventListener('resize', stamp);
    window.visualViewport?.addEventListener('resize', stamp);
}

/* ------------------------------------------------------------
   The same answer, for components that have to change what they
   RENDER rather than only how it is painted — the GM board's tab
   bar being the one case. Anything CSS can do belongs in
   styles/responsive/, not here.

   useSyncExternalStore rather than a useState + useEffect pair,
   matching the stores in this codebase: it reads the class during
   render, so the first paint is already correct instead of
   flashing the desktop layout for a frame.
   ------------------------------------------------------------ */

function subscribe(onChange: () => void): () => void {
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
        window.removeEventListener('resize', onChange);
        window.removeEventListener('orientationchange', onChange);
    };
}

/* getSnapshot must return a value that is === the last one when nothing
   changed, or React re-renders forever. A string does that for free. */
export function useDeviceClass(): DeviceClass {
    return useSyncExternalStore(subscribe, () => deviceClass(), () => 'desktop' as DeviceClass);
}
