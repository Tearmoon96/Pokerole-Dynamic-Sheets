import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from '../../map/MapContext';
import { BRUSHES, BRUSH_BY_ID, MAX_BRUSH, MIN_BRUSH, cleanSize } from '../../map/brushes';
import type { BrushId } from '../../map/brushes';
import { Popover } from './Popover';

/* The brush: which one, and how big.

   The size slider is logarithmic — the same drag moves 0.1 to 0.2 as 10 to
   20 — because the small end is where precision matters and a linear 0.05..40
   slider gives it a few pixels. The number beside it takes any size typed to
   three decimals. */

export function BrushGlyph({ id, size = 22 }: { id: BrushId; size?: number }) {
    const common = { fill: 'currentColor' };
    let body;
    switch (id) {
        case 'circle': body = <circle cx="12" cy="12" r="8" {...common} />; break;
        case 'square': body = <rect x="4" y="4" width="16" height="16" {...common} />; break;
        case 'diamond': body = <polygon points="12,3 21,12 12,21 3,12" {...common} />; break;
        case 'hexagon': body = <polygon points="3,12 7.5,4.2 16.5,4.2 21,12 16.5,19.8 7.5,19.8" {...common} />; break;
        case 'cells': body = <g {...common}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></g>; break;
        case 'organic': body = <path d="M12 3c3 0 4 2 6 3s3 4 2 6-1 4-3 5-4 3-6 2-4-1-5-3-3-4-2-6 2-3 3-5 3-2 5-2z" {...common} />; break;
        case 'rugged': body = <polygon points="12,2 14,6 19,4 18,9 22,12 18,14 20,19 15,18 12,22 10,18 5,20 6,15 2,12 6,10 4,5 9,6" {...common} />; break;
        case 'spray': body = <g {...common}>{[[12, 12, 2], [7, 8, 1.5], [16, 7, 1.3], [18, 13, 1.6], [8, 16, 1.4], [13, 18, 1.5], [5, 12, 1], [11, 5, 1.1], [19, 18, 1]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}</g>; break;
    }
    return <svg className="map-brush-glyph" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{body}</svg>;
}

const LOG_MIN = Math.log(MIN_BRUSH), LOG_MAX = Math.log(MAX_BRUSH);
const toSlider = (size: number) => Math.round(((Math.log(size) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
const fromSlider = (v: number) => cleanSize(Math.exp(LOG_MIN + (v / 1000) * (LOG_MAX - LOG_MIN)));

/** A number field that can be typed into freely — "1." or "" on the way to
    "1.25" — and commits a clean value as it goes. The draft is local; the
    size shown is the store's whenever the field is not being typed in. */
function SizeField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    /* Changed from elsewhere — the slider, [ and ] — while not being typed
       in: show the new size, not what was last typed. */
    useEffect(() => {
        if (document.activeElement !== input.current) setDraft(null);
    }, [value]);
    return (
        <input
            ref={input}
            type="number"
            className="map-brush-size"
            min={MIN_BRUSH}
            max={MAX_BRUSH}
            step={0.001}
            value={draft ?? String(value)}
            onFocus={() => setDraft(String(value))}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
                const text = e.currentTarget.value;
                setDraft(text);
                const v = parseFloat(text);
                if (isFinite(v) && v > 0) onChange(cleanSize(v));
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
            aria-label="Brush size in cells"
        />
    );
}

export function BrushControls() {
    const { store, ui } = useMap();
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const close = useCallback(() => setOpen(false), []);
    const current = BRUSH_BY_ID.get(ui.brushShape) ?? BRUSHES[0];
    const setSize = (v: number) => store.setUi({ brush: cleanSize(v) });

    /* The picker is for choosing: pick one and it is done. */
    useEffect(() => { setOpen(false); }, [ui.brushShape]);

    return (
        <div className="map-brush-controls">
            <div className="map-row">
                <button
                    ref={button}
                    className="map-brush-btn"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    title={'Brush: ' + current.name + ' — click to choose another'}
                    onClick={() => setOpen((o) => !o)}
                >
                    <BrushGlyph id={current.id} size={18} />
                    <span>{current.name}</span>
                    <i className="fa-solid fa-caret-down"></i>
                </button>
            </div>
            <div className="map-row">
                <label htmlFor="map-brush-range">Size</label>
                <input
                    id="map-brush-range" type="range" min={0} max={1000} step={1}
                    value={toSlider(ui.brush)}
                    onChange={(e) => setSize(fromSlider(Number(e.currentTarget.value)))}
                />
                <SizeField value={ui.brush} onChange={setSize} />
                <span className="map-unit">cells</span>
            </div>
            <Popover anchor={button} open={open} onClose={close} className="map-brush-picker">
                <div className="map-popover-title">Brushes</div>
                <div className="map-brush-grid">
                    {BRUSHES.map((b) => (
                        <button
                            key={b.id}
                            className="map-brush-choice"
                            aria-pressed={b.id === ui.brushShape}
                            title={b.hint}
                            onClick={() => store.setUi({ brushShape: b.id, tool: ui.tool === 'fill' ? 'paint' : ui.tool })}
                        >
                            <BrushGlyph id={b.id} />
                            <span>{b.name}</span>
                        </button>
                    ))}
                </div>
                <p className="map-hint">{current.hint}.</p>
            </Popover>
        </div>
    );
}
