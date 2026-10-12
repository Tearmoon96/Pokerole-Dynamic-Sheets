/* The guided tour, on any page: one part lit, the rest dimmed and blurred,
   and a card beside it saying what it is. Plus the first-time question and
   the ? button that replays it. Each page hands in its own steps.

   Three layers, bottom to top:
   - a clear SHIELD over the whole page that takes every click: the tour is
     look, don't touch — a click inside the hole could fold the very panel it
     is showing;
   - the dim, blurred VEIL, with the hole cut out of it by an even-odd
     clip-path, and the ring drawn round the hole;
   - the CARD.

   Pages are live — rolls arrive, panels grow — so the hole is not placed
   once: a frame loop measures the target and eases the hole towards it, and
   writes the styles straight onto the elements rather than through React
   sixty times a second. */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { shouldAsk, tour, useTour } from '../../lib/tour';
import type { TourId, TourStep } from '../../lib/tour';

const PAD = 8;       // the hole's margin round its target
const GAP = 14;      // between the hole and the card
const EDGE = 8;      // the card's closest approach to the viewport's edge

interface Box { x: number; y: number; w: number; h: number }

const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
};

/** The step's target as a box: the first candidate on screen, or with
    `union` every one of them together. */
function targetBox(step: TourStep): { box: DOMRect; first: HTMLElement } | null {
    const found: HTMLElement[] = [];
    for (const sel of step.target ?? []) {
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            if (!visible(el)) continue;
            found.push(el);
            if (!step.union) break;
        }
        if (found.length && !step.union) break;
    }
    if (!found.length) return null;
    const rs = found.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return { box: new DOMRect(left, top, right - left, bottom - top), first: found[0] };
}

/** An optional step whose target is not on the page at all is left out. */
function skipped(step: TourStep): boolean {
    return !!step.optional && !(step.target ?? []).some((sel) => document.querySelector(sel));
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => document.documentElement.dataset.device === 'phone';

/** The hole's outline, an even-odd path: the viewport, then the rounded hole. */
function holePath(b: Box, vw: number, vh: number): string {
    const r = Math.min(10, b.w / 2, b.h / 2);
    const { x, y, w, h } = b;
    return `path(evenodd, 'M0 0H${vw}V${vh}H0Z`
        + `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}`
        + `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`
        + `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z')`;
}

/** Where the card goes: below the hole, above it, beside it, or over the
    bottom of the screen when the target fills it. */
function placeCard(hole: Box, cw: number, ch: number, vw: number, vh: number): { left: number; top: number } {
    const clampX = (x: number) => Math.max(EDGE, Math.min(vw - cw - EDGE, x));
    const clampY = (y: number) => Math.max(EDGE, Math.min(vh - ch - EDGE, y));
    const midX = clampX(hole.x + hole.w / 2 - cw / 2);
    const midY = clampY(hole.y + hole.h / 2 - ch / 2);
    if (hole.y + hole.h + GAP + ch <= vh - EDGE) return { left: midX, top: hole.y + hole.h + GAP };
    if (hole.y - GAP - ch >= EDGE) return { left: midX, top: hole.y - GAP - ch };
    if (hole.x + hole.w + GAP + cw <= vw - EDGE) return { left: hole.x + hole.w + GAP, top: midY };
    if (hole.x - GAP - cw >= EDGE) return { left: hole.x - GAP - cw, top: midY };
    return { left: midX, top: vh - ch - EDGE };
}

/* Something the page put up first: the License's "Restore last session", a
   confirm, the card's empty landing. The question waits until it is gone. */
const BUSY = '.modal-overlay, .gm-overlay.open, .blank-landing, [role="dialog"]:not(.tour-card)';

/** First time on this page (and `ready`): offer the tour, once the page has
    drawn and nothing else is asking for attention. */
export function useFirstTimeTour(id: TourId, ready = true): void {
    useEffect(() => {
        if (!ready || !shouldAsk(id)) return;
        const t = window.setInterval(() => {
            if (!shouldAsk(id)) { window.clearInterval(t); return; }
            if (document.querySelector(BUSY)) return;
            window.clearInterval(t);
            tour.ask(id);
        }, 700);
        return () => window.clearInterval(t);
    }, [id, ready]);
}

/** The ? that plays the page's tour again. */
export function TourButton({ id, className }: { id: TourId; className: string }) {
    return (
        <button
            type="button" className={className} data-tour-start=""
            aria-label="Show me around" title="A guided tour of this page"
            onClick={() => tour.start(id)}
        >
            <i className="fa-solid fa-circle-question"></i>
        </button>
    );
}

/** The question and the tour for one page. `steps` may be rebuilt on every
    render (a step's live status reads the page's state). */
export function GuidedTour({ id, steps, intro }: { id: TourId; steps: TourStep[]; intro: string }) {
    const t = useTour();
    if (t.prompt === id) return <TourPrompt id={id} intro={intro} />;
    if (t.id === id) return <TourOverlay steps={steps} index={t.index} />;
    return null;
}

function TourPrompt({ id, intro }: { id: TourId; intro: string }) {
    const go = useRef<HTMLButtonElement>(null);
    useEffect(() => { go.current?.focus({ preventScroll: true }); }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            /* No key reaches the page under the question: the Map Maker's
               hotkeys would change tools behind it. Enter and Space still
               press the focused button — that is the browser's default. */
            e.stopPropagation();
            if (e.key === 'Escape') tour.dismiss();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, []);

    return (
        <div className="tour-root" data-tour-prompt="">
            <div className="tour-shield"></div>
            <div className="tour-veil"></div>
            <div className="tour-card tour-centered" role="dialog" aria-modal="true" aria-labelledby="tour-prompt-title" data-tt-avoid="">
                <h2 id="tour-prompt-title"><i className="fa-solid fa-route"></i> First time here?</h2>
                <p>{intro}</p>
                <div className="tour-actions">
                    <button className="tour-btn accent" ref={go} data-tour-go="" onClick={() => tour.start(id)}>
                        <i className="fa-solid fa-play"></i> Show me around
                    </button>
                    <button className="tour-btn" data-tour-later="" onClick={() => tour.dismiss()}>Not now</button>
                    <button className="tour-link" data-tour-never="" onClick={() => tour.never()}>Don't ask again</button>
                </div>
                <p className="tour-foot">
                    You can take it any time from <i className="fa-solid fa-circle-question" aria-label="the question mark"></i> at the top of the page.
                </p>
            </div>
        </div>
    );
}

function TourOverlay({ steps, index }: { steps: TourStep[]; index: number }) {
    const step = steps[Math.min(index, steps.length - 1)];
    const shown = steps.filter((s) => !skipped(s));
    const pos = Math.max(0, shown.indexOf(step));

    /* The frame loop reads the newest copy: `steps` is rebuilt each render. */
    const latest = useRef(step);
    latest.current = step;

    const veil = useRef<HTMLDivElement>(null);
    const ring = useRef<HTMLDivElement>(null);
    const card = useRef<HTMLDivElement>(null);
    const next = useRef<HTMLButtonElement>(null);

    /* The neighbour in either direction, passing over left-out steps. */
    const neighbour = (dir: 1 | -1): number | null => {
        for (let i = index + dir; i >= 0 && i < steps.length; i += dir) {
            if (!skipped(steps[i])) return i;
        }
        return null;
    };
    const forward = () => {
        const n = neighbour(1);
        if (n === null) tour.stop();
        else tour.go(n);
    };
    const backward = () => {
        const n = neighbour(-1);
        if (n !== null) tour.go(n);
    };
    const last = neighbour(1) === null;

    /* Open what the step needs before measuring anything. */
    useLayoutEffect(() => {
        tour.stage(step.unfold ?? null, step.view ?? null);
    }, [index, step.unfold, step.view]);

    /* Gone with the tour: what it opened goes back to how it was. */
    useEffect(() => () => tour.stage(null, null), []);

    /* The step's id on <html>, for what only a hover would show: a page's CSS
       reveals it with html[data-tour-step="…"]. */
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.tourStep = step.id;
        return () => { delete root.dataset.tourStep; };
    }, [step.id]);

    useEffect(() => { next.current?.focus({ preventScroll: true }); }, [index]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            /* As under the question: the page's own shortcuts sit it out. */
            e.stopPropagation();
            if (e.key === 'Escape') tour.stop();
            else if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); backward(); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    });

    /* Bring the target into view once, then follow it every frame. */
    useEffect(() => {
        let raf = 0;
        let cur: Box | null = null;
        let scrolled = false;
        let lastPath = '';
        let lastCard = '';
        const start = performance.now();

        const frame = () => {
            raf = requestAnimationFrame(frame);
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const found = targetBox(latest.current);
            const v = veil.current;
            const g = ring.current;
            const c = card.current;
            if (!v || !g || !c) return;

            if (found && !scrolled && performance.now() - start > 30) {
                /* Once the step's panel has had a frame to open. A target
                   taller than the screen shows its top rather than its middle,
                   and on a phone it goes above the card docked at the bottom. */
                scrolled = true;
                const tall = found.box.height > vh * 0.6;
                found.first.scrollIntoView({
                    block: tall || isPhone() ? 'start' : 'center',
                    inline: 'nearest',
                    behavior: reduced() ? 'auto' : 'smooth',
                });
            }

            if (!found) {
                cur = null;
                if (lastPath !== 'none') { v.style.clipPath = 'none'; g.style.opacity = '0'; lastPath = 'none'; }
                c.classList.add('tour-centered');
                c.classList.remove('tour-top');
                if (lastCard !== 'centered') { c.style.left = ''; c.style.top = ''; lastCard = 'centered'; }
                return;
            }

            const r = found.box;
            const x = Math.max(EDGE / 2, r.left - PAD);
            const y = Math.max(EDGE / 2, r.top - PAD);
            const goal: Box = {
                x, y,
                w: Math.max(0, Math.min(vw - EDGE / 2, r.right + PAD) - x),
                h: Math.max(0, Math.min(vh - EDGE / 2, r.bottom + PAD) - y),
            };
            /* Ease towards the goal: about a quarter of a second to arrive. */
            const k = !cur || reduced() ? 1 : 0.28;
            cur = cur
                ? { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k, w: cur.w + (goal.w - cur.w) * k, h: cur.h + (goal.h - cur.h) * k }
                : goal;
            const b = cur;
            const path = holePath(b, vw, vh);
            if (path !== lastPath) {
                v.style.clipPath = path;
                g.style.opacity = '1';
                g.style.transform = `translate(${b.x}px, ${b.y}px)`;
                g.style.width = b.w + 'px';
                g.style.height = b.h + 'px';
                lastPath = path;
            }

            c.classList.remove('tour-centered');
            if (isPhone()) {
                /* A sheet along the bottom — or along the top, for a target
                   at the end of the page that cannot scroll up past it. Not
                   for a target taller than the screen: that one is scrolled
                   to show its head, which is what the text talks about. */
                const tall = goal.h > vh * 0.6;
                c.classList.toggle('tour-top', !tall && goal.y + goal.h / 2 > vh / 2);
                if (lastCard !== 'phone') { c.style.left = ''; c.style.top = ''; lastCard = 'phone'; }
                return;
            }
            c.classList.remove('tour-top');
            const at = placeCard(goal, c.offsetWidth, c.offsetHeight, vw, vh);
            const key = Math.round(at.left) + ',' + Math.round(at.top);
            if (key !== lastCard) {
                c.style.left = at.left + 'px';
                c.style.top = at.top + 'px';
                lastCard = key;
            }
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [index]);

    const status = step.status ? step.status() : null;

    return (
        <div className="tour-root" data-tour-step={step.id}>
            <div className="tour-shield"></div>
            <div className="tour-veil" ref={veil}></div>
            <div className="tour-ring" ref={ring} aria-hidden="true"></div>
            <div
                className="tour-card tour-centered" ref={card}
                role="dialog" aria-modal="true" aria-labelledby="tour-title" data-tt-avoid=""
            >
                <div className="tour-head">
                    <h2 id="tour-title">{step.title}</h2>
                    <button className="tour-btn tour-close" aria-label="Close the tour" onClick={() => tour.stop()}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="tour-body">{step.body}</div>
                {status && (
                    <p className={'tour-status ' + (status.ok ? 'ok' : 'wait')} role="status" data-tour-status={status.ok ? 'ok' : 'wait'}>
                        <i className={'fa-solid ' + (status.ok ? 'fa-circle-check' : 'fa-circle-notch')}></i> {status.text}
                    </p>
                )}
                {step.links && (
                    <div className="tour-links">
                        {step.links.map((l) => (
                            <a key={l.href} className="tour-open" href={l.href} target="_blank" rel="noopener">
                                <i className={'fa-solid ' + l.icon}></i> {l.label}{' '}
                                <i className="fa-solid fa-arrow-up-right-from-square tour-ext"></i>
                            </a>
                        ))}
                    </div>
                )}
                <div className="tour-nav">
                    <span className="tour-dots" aria-label={'Step ' + (pos + 1) + ' of ' + shown.length}>
                        {shown.map((s, i) => <span key={s.id} className={'tour-dot' + (i === pos ? ' on' : '')}></span>)}
                    </span>
                    <span className="tour-spacer"></span>
                    {pos > 0 && (
                        <button className="tour-btn" data-tour-back="" onClick={backward}>
                            <i className="fa-solid fa-arrow-left"></i> Back
                        </button>
                    )}
                    <button className="tour-btn accent" ref={next} data-tour-next="" onClick={forward}>
                        {last ? <>Finish <i className="fa-solid fa-check"></i></> : <>Next <i className="fa-solid fa-arrow-right"></i></>}
                    </button>
                </div>
                {!last && (
                    <button className="tour-link tour-skip" data-tour-skip="" onClick={() => tour.stop()}>Skip the tour</button>
                )}
            </div>
        </div>
    );
}

/** A control named in the text, drawn the way it looks on the page. */
export function TourChip({ icon, children }: { icon?: string; children?: React.ReactNode }) {
    return (
        <span className="tour-chip">
            {icon && <i className={'fa-solid ' + icon}></i>}{icon && children && ' '}{children}
        </span>
    );
}
