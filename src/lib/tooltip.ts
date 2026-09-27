/* The themed tooltip that replaces the browser's native grey `title` square.

   It moves the text out of the title attribute at hover time and renders it in
   a panel that follows the palette like everything else. Entirely DOM-level: it
   works on any element carrying a title, whether React drew it or not, so it is
   installed once at boot and never thought about again.

   Ported verbatim from the inline script — the timings and the edge-clamping
   maths are what make it feel like a native hint rather than a popup. */

export function installTooltips(): () => void {
/* Long enough that resting the pointer on a control between clicks, or
   crossing a dense row on the way somewhere else, draws nothing. 350 did, and
   every such hint landed on the line being read. */
const SHOW_DELAY = 600;
const LONG_PRESS = 500;     // touch: press-and-hold to reveal
const TOUCH_LINGER = 3500;  // touch: auto-dismiss again
const GAP = 10;             // between target and bubble
const EDGE = 8;             // keep-inside-viewport margin

/* Hover only on real pointing devices — touch and pen go through
   the long-press path so tooltips never interfere with taps */
const canHover = window.matchMedia('(hover: hover)').matches;

let box: HTMLDivElement | null = null;
let head: HTMLSpanElement | null = null;
let body: HTMLSpanElement | null = null;
let target: HTMLElement | null = null;   // element whose title we are holding
let showTimer = 0, hideTimer = 0;
let press: { x: number; y: number } | null = null;   // in-flight long press
/* The element last pressed. Its hint stays down until the pointer leaves it:
   the button has been found and used, and sliding onto its own label or icon
   is a new pointerover that would otherwise draw the hint straight back. */
let pressed: HTMLElement | null = null;
let swallowClick = false;   // eat the click a long press would fire

function tooltipBox(): HTMLDivElement {
    if (!box) build();
    return box!;
}

function build() {
    box = document.createElement('div');
    box.id = 'app-tooltip';
    head = document.createElement('span');
    head.className = 'tt-head';
    body = document.createElement('span');
    body.className = 'tt-body';
    document.body.appendChild(box);
}

function hintOwner(node: EventTarget | null): HTMLElement | null {
    const el = node as HTMLElement | null;
    return el && el.closest ? el.closest<HTMLElement>('[title], [data-tt]') : null;
}

/* Take the text off the element. A live title attribute always
   wins, so code that switches a hint off with `el.title = ''`
   still works; removing the attribute is what suppresses the
   native bubble. */
function claim(el: HTMLElement): string {
    if (el.hasAttribute('title')) {
        const t = el.getAttribute('title');
        el.removeAttribute('title');
        dropAria(el);
        if (t && t.trim()) {
            el.dataset.tt = t;
            /* Keep the label reachable for screen readers while
               the title is parked, but never mask a real name */
            if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
                el.dataset.ttAria = '1';
                el.setAttribute('aria-label', t.replace(/\n/g, ' — '));
            }
        } else {
            delete el.dataset.tt;   // an emptied title means "no hint"
        }
    }
    return el.dataset.tt || '';
}

function dropAria(el: HTMLElement): void {
    if (el.dataset.ttAria) {
        delete el.dataset.ttAria;
        el.removeAttribute('aria-label');
    }
}

// Hand the title back so the DOM is left as it was found
function release(el: HTMLElement | null): void {
    if (!el) return;
    const t = el.dataset.tt;
    delete el.dataset.tt;
    dropAria(el);
    /* A re-render may have assigned a fresh title while ours was
       parked — in that case the newer value wins */
    if (t && !el.hasAttribute('title')) el.setAttribute('title', t);
}

/* Floating panels a hint must never be drawn over: an open popover, menu or
   dropdown is what is being read or clicked while the pointer rests on its
   anchor, and the anchor's hint landing on top of it hid the very button the
   panel was opened for (the ailment popover's Roll row). Anything can opt in
   with data-tt-avoid. A panel that CONTAINS the target is not an obstacle —
   that is where the target lives. */
const OBSTACLES = '[data-tt-avoid], [role="dialog"], [role="listbox"], [role="menu"], '
    + '.move-suggestions, .filter-picker-menu, .def-offset-pop';

function obstacles(el: HTMLElement): DOMRect[] {
    const out: DOMRect[] = [];
    document.querySelectorAll<HTMLElement>(OBSTACLES).forEach((o) => {
        if (o.contains(el) || o === box) return;
        const r = o.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(r);
    });
    return out;
}

const overlaps = (a: { left: number; top: number; right: number; bottom: number }, b: DOMRect) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

type Side = 'above' | 'below' | 'right' | 'left';

/* Above the target, then below, then beside it — the first side that fits
   the viewport and clears every open panel. False when none does: no hint
   beats one drawn over a popover. */
function place(el: HTMLElement): boolean {
    const box = tooltipBox();
    box.classList.remove('below', 'right', 'left');
    box.style.left = '0px';
    box.style.top = '0px';
    const w = box.offsetWidth, h = box.offsetHeight;
    const rect = el.getBoundingClientRect();
    const blocks = obstacles(el);
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const clampX = (x: number) => Math.max(EDGE, Math.min(x, window.innerWidth - w - EDGE));
    const clampY = (y: number) => Math.max(EDGE, Math.min(y, window.innerHeight - h - EDGE));

    const spot = (side: Side): { left: number; top: number } | null => {
        let left: number, top: number;
        if (side === 'above' || side === 'below') {
            top = side === 'above' ? rect.top - GAP - h : rect.bottom + GAP;
            if (top < EDGE || top + h > window.innerHeight - EDGE) return null;
            left = clampX(cx - w / 2);
        } else {
            left = side === 'right' ? rect.right + GAP : rect.left - GAP - w;
            if (left < EDGE || left + w > window.innerWidth - EDGE) return null;
            top = clampY(cy - h / 2);
        }
        const r = { left, top, right: left + w, bottom: top + h };
        return blocks.some((b) => overlaps(r, b)) ? null : { left, top };
    };

    const order: Side[] = ['above', 'below', 'right', 'left'];
    let side: Side | null = null, at: { left: number; top: number } | null = null;
    for (const s of order) {
        at = spot(s);
        if (at) { side = s; break; }
    }
    if (!side || !at) {
        /* A target taller than the room either side of it, with nothing open
           around it: pin to the nearer edge as before rather than drop it. */
        if (blocks.length) return false;
        side = rect.top - GAP - h < EDGE ? 'below' : 'above';
        at = {
            left: clampX(cx - w / 2),
            top: clampY(side === 'below' ? rect.bottom + GAP : rect.top - GAP - h),
        };
    }

    if (side !== 'above') box.classList.add(side);
    box.style.left = Math.round(at.left) + 'px';
    box.style.top = Math.round(at.top) + 'px';
    /* The arrow tracks the target, not the bubble's own centre, so it still
       points at the right thing after an edge clamp */
    box.style.setProperty('--tt-arrow-x',
        Math.round(Math.max(12, Math.min(cx - at.left, w - 12))) + 'px');
    box.style.setProperty('--tt-arrow-y',
        Math.round(Math.max(10, Math.min(cy - at.top, h - 10))) + 'px');
    return true;
}

/* A hint that only repeats the element's own visible text — a name in a
   narrow column — says nothing unless that text is cut off. */
function redundant(el: HTMLElement, text: string): boolean {
    const own = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!own || own !== text.replace(/\s+/g, ' ').trim()) return false;
    return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
}

function render(el: HTMLElement, text: string): boolean {
    if (!el.isConnected) return false;
    if (!box) build();
    const bx = box!, hd = head!, bd = body!;
    const nl = text.indexOf('\n');
    bx.textContent = '';
    if (nl > -1) {
        hd.textContent = text.slice(0, nl).trim();
        bd.textContent = text.slice(nl + 1).trim();
        bx.append(hd, bd);
    } else {
        bd.textContent = text;
        bx.append(bd);
    }
    if (redundant(el, text) || !place(el)) {
        bx.classList.remove('show');
        return false;
    }
    bx.classList.add('show');
    return true;
}

function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (box) box.classList.remove('show');
    release(target);
    target = null;
}

document.addEventListener('pointerover', (e: PointerEvent) => {
    if (!canHover || e.pointerType !== 'mouse') return;
    const el = hintOwner(e.target);
    if (el === target) return;
    hide();
    if (!el || el === pressed) return;
    const text = claim(el);   // strip now, draw after the delay
    if (!text) return;
    target = el;
    showTimer = window.setTimeout(() => render(el, text), SHOW_DELAY);
}, true);   // capture, so a stopPropagation elsewhere can't blind us

document.addEventListener('pointerout', (e: PointerEvent) => {
    /* Sliding onto a child of the same target isn't leaving it;
       a genuine switch is handled by pointerover above */
    if (pressed && !(e.relatedTarget && pressed.contains(e.relatedTarget as Node))) pressed = null;
    if (!target || (e.relatedTarget && target.contains(e.relatedTarget as Node))) return;
    hide();
}, true);

document.addEventListener('pointerdown', (e: PointerEvent) => {
    hide();
    swallowClick = false;
    const el = hintOwner(e.target);
    if (e.pointerType === 'mouse') { pressed = el; return; }
    if (!el) return;
    /* Never preventDefault here: taps, drags and the hold-to-repeat
       pool buttons have to keep working exactly as before */
    press = { x: e.clientX, y: e.clientY };
    showTimer = window.setTimeout(() => {
        const text = claim(el);
        if (!text) return;
        target = el;
        if (!render(el, text)) return;
        /* Reading a hint shouldn't also press the button, so the
           click this press ends in is dropped */
        swallowClick = true;
        hideTimer = window.setTimeout(hide, TOUCH_LINGER);
    }, LONG_PRESS);
}, true);

document.addEventListener('click', (e: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
}, true);

document.addEventListener('pointermove', (e: PointerEvent) => {
    /* A re-render can rip the hovered element out of the DOM
       without ever firing pointerout — drop the orphan */
    if (target && !target.isConnected) hide();
    if (!press) return;
    if (Math.abs(e.clientX - press.x) > 8 || Math.abs(e.clientY - press.y) > 8) {
        press = null;
        clearTimeout(showTimer);   // turned into a scroll or drag
    }
}, true);

const endPress = () => {
    if (!press) return;
    press = null;
    clearTimeout(showTimer);   // released before the hold threshold
};
document.addEventListener('pointerup', endPress, true);
document.addEventListener('pointercancel', endPress, true);

window.addEventListener('scroll', hide, { capture: true, passive: true });
window.addEventListener('resize', hide);
window.addEventListener('blur', hide);
document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide();
});

    return () => { if (box && box.parentNode) box.remove(); };
}
