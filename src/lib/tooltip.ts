/* The themed tooltip that replaces the browser's native grey `title` square.

   It moves the text out of the title attribute at hover time and renders it in
   a panel that follows the palette like everything else. Entirely DOM-level: it
   works on any element carrying a title, whether React drew it or not, so it is
   installed once at boot and never thought about again.

   Ported verbatim from the inline script — the timings and the edge-clamping
   maths are what make it feel like a native hint rather than a popup. */

export function installTooltips(): () => void {
const SHOW_DELAY = 350;     // beats the native bubble to the punch
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

function place(rect: DOMRect): void {
    const box = tooltipBox();
    box.classList.remove('below');
    box.style.left = '0px';
    box.style.top = '0px';
    const w = box.offsetWidth, h = box.offsetHeight;

    const below = rect.top - GAP - h < EDGE;
    box.classList.toggle('below', below);
    let top = below ? rect.bottom + GAP : rect.top - GAP - h;
    top = Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE));

    const centre = rect.left + rect.width / 2;
    const left = Math.max(EDGE, Math.min(centre - w / 2, window.innerWidth - w - EDGE));

    box.style.left = Math.round(left) + 'px';
    box.style.top = Math.round(top) + 'px';
    /* The arrow tracks the target, not the bubble's own centre, so
       it still points at the right thing after an edge clamp */
    box.style.setProperty('--tt-arrow-x',
        Math.round(Math.max(12, Math.min(centre - left, w - 12))) + 'px');
}

function render(el: HTMLElement, text: string): void {
    if (!el.isConnected) return;
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
    place(el.getBoundingClientRect());
    bx.classList.add('show');
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
    if (!el) return;
    const text = claim(el);   // strip now, draw after the delay
    if (!text) return;
    target = el;
    showTimer = window.setTimeout(() => render(el, text), SHOW_DELAY);
}, true);   // capture, so a stopPropagation elsewhere can't blind us

document.addEventListener('pointerout', (e: PointerEvent) => {
    /* Sliding onto a child of the same target isn't leaving it;
       a genuine switch is handled by pointerover above */
    if (!target || (e.relatedTarget && target.contains(e.relatedTarget as Node))) return;
    hide();
}, true);

document.addEventListener('pointerdown', (e: PointerEvent) => {
    hide();
    swallowClick = false;
    if (e.pointerType === 'mouse') return;
    const el = hintOwner(e.target);
    if (!el) return;
    /* Never preventDefault here: taps, drags and the hold-to-repeat
       pool buttons have to keep working exactly as before */
    press = { x: e.clientX, y: e.clientY };
    showTimer = window.setTimeout(() => {
        const text = claim(el);
        if (!text) return;
        target = el;
        render(el, text);
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
