import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Popover } from './Popover';

/* A colour picker this page draws itself, instead of <input type="color">
   (2026-11-09, the owner's report: the browser's own picker opened half off
   the screen from the side panel, and a page cannot move it — under Wayland
   the browser clips its popup to the window). A swatch button opens a
   Popover, which is held inside the viewport: a saturation/brightness square,
   a hue bar, the hex code, a row of ready colours and, where the browser has
   one, the eyedropper the native picker had.

   `onChange` fires on every move of a drag, as the native input's did, so
   callers keep their undo coalescing as it was. */

type Hsv = { h: number; s: number; v: number };

const PRESETS = [
    '#ffffff', '#c8c8cc', '#7a7a82', '#2a2a30', '#e04848', '#f07830', '#f0c040', '#7ac050',
    '#3a8a5a', '#40b0c0', '#3a7ad0', '#2a3a8a', '#8a5ac0', '#e070b0', '#a06a42', '#5a3a24',
];

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function hexToHsv(hex: string): Hsv | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
    const f = (n: number) => {
        const k = (n + h / 60) % 6;
        return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return '#' + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Read a pointer's place in an element as 0..1 on each axis. */
function at(e: ReactPointerEvent<HTMLElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)];
}

function ColorPanel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
    const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0 });
    const [draft, setDraft] = useState(value);
    const sent = useRef(value);

    /* A colour set from outside (Reset, undo) moves the handles; one this
       panel sent does not, or a grey would lose the hue being dragged. */
    useEffect(() => {
        if (value.toLowerCase() === sent.current.toLowerCase()) return;
        const next = hexToHsv(value);
        if (next) setHsv((old) => (next.s === 0 || next.v === 0 ? { ...next, h: old.h } : next));
        sent.current = value;
        setDraft(value);
    }, [value]);

    const send = (next: Hsv) => {
        setHsv(next);
        const hex = hsvToHex(next);
        sent.current = hex;
        setDraft(hex);
        onChange(hex);
    };
    const sendHex = (hex: string) => {
        const next = hexToHsv(hex);
        if (!next) return;
        setHsv((old) => (next.s === 0 || next.v === 0 ? { ...next, h: old.h } : next));
        sent.current = hex.toLowerCase();
        setDraft(hex.toLowerCase());
        onChange(hex.toLowerCase());
    };

    const drag = (move: (e: ReactPointerEvent<HTMLDivElement>) => void) => ({
        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.focus();
            move(e);
        },
        onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
        },
    });
    const keys = (step: (dx: number, dy: number) => void) => (e: ReactKeyboardEvent) => {
        const big = e.shiftKey ? 5 : 1;
        const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
        if (!d) return;
        e.preventDefault();
        step(d[0] * big, d[1] * big);
    };

    const dropper = typeof window !== 'undefined' && 'EyeDropper' in window;
    const pickFromScreen = () => {
        const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
        new Ctor().open().then((r) => sendHex(r.sRGBHex)).catch(() => { /* cancelled */ });
    };

    const hue = hsvToHex({ h: hsv.h, s: 1, v: 1 });
    return (
        <div className="map-colorpick">
            <div
                className="map-colorpick-sv" tabIndex={0} role="slider"
                aria-label="Saturation and brightness" aria-valuetext={Math.round(hsv.s * 100) + '% saturation, ' + Math.round(hsv.v * 100) + '% brightness'}
                style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})` }}
                {...drag((e) => { const [x, y] = at(e); send({ h: hsv.h, s: x, v: 1 - y }); })}
                onKeyDown={keys((dx, dy) => send({ h: hsv.h, s: clamp(hsv.s + dx * 0.02, 0, 1), v: clamp(hsv.v - dy * 0.02, 0, 1) }))}
            >
                <span className="map-colorpick-dot" style={{ left: hsv.s * 100 + '%', top: (1 - hsv.v) * 100 + '%', background: hsvToHex(hsv) }}></span>
            </div>
            <div
                className="map-colorpick-hue" tabIndex={0} role="slider" aria-label="Hue"
                aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}
                {...drag((e) => { const [x] = at(e); send({ ...hsv, h: x * 359.9 }); })}
                onKeyDown={keys((dx) => send({ ...hsv, h: clamp(hsv.h + dx * 4, 0, 359.9) }))}
            >
                <span className="map-colorpick-knob" style={{ left: hsv.h / 360 * 100 + '%', background: hue }}></span>
            </div>
            <div className="map-colorpick-row">
                <span className="map-colorpick-now" style={{ background: hsvToHex(hsv) }}></span>
                <input
                    type="text" className="map-colorpick-hex" aria-label="Colour code" spellCheck={false} maxLength={7}
                    value={draft}
                    onChange={(e) => {
                        const t = e.currentTarget.value;
                        setDraft(t);
                        if (/^#?[0-9a-f]{6}$/i.test(t.trim())) sendHex((t.trim().startsWith('#') ? '' : '#') + t.trim());
                    }}
                    onBlur={() => setDraft(sent.current)}
                />
                {dropper && (
                    <button type="button" className="icon-btn map-colorpick-dropper" onClick={pickFromScreen} aria-label="Pick a colour from the screen">
                        <i className="fa-solid fa-eye-dropper"></i>
                    </button>
                )}
            </div>
            <div className="map-colorpick-presets">
                {PRESETS.map((c) => (
                    <button
                        key={c} type="button" className="map-colorpick-preset" style={{ background: c }}
                        aria-label={'Colour ' + c} aria-pressed={c === value.toLowerCase()} onClick={() => sendHex(c)}
                    ></button>
                ))}
            </div>
        </div>
    );
}

/** A swatch that opens the picker. Extra props go on the button. */
export function ColorField({ value, onChange, label, className, children, ...rest }: {
    value: string;
    onChange: (hex: string) => void;
    /** What the colour is for: the button's accessible name. */
    label: string;
    className?: string;
    /** Drawn inside the button instead of the plain swatch. */
    children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'children'>) {
    const btn = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const hex = hexToHsv(value) ? value : '#000000';
    return (
        <>
            <button
                ref={btn} type="button" {...rest}
                className={'map-color-swatch' + (className ? ' ' + className : '')}
                aria-label={label} aria-haspopup="dialog" aria-expanded={open}
                data-color={hex}
                onClick={() => setOpen((o) => !o)}
            >
                {children ?? <span className="map-color-swatch-fill" style={{ background: hex }}></span>}
            </button>
            <Popover anchor={btn} open={open} onClose={() => setOpen(false)} className="map-colorpick-pop">
                <ColorPanel value={hex} onChange={onChange} />
            </Popover>
        </>
    );
}
