import { useMap } from '../../map/MapContext';
import {
    MAX_SKETCH_WIDTH, MIN_SKETCH_WIDTH, SKETCH_BRUSHES, SKETCH_COLORS, arrowInLine, cleanSketchWidth,
    sketchArrowD, sketchLineD, sketchLook,
} from '../../map/sketch';
import type { SketchSettings } from '../../map/sketch';
import type { Pt } from '../../map/geometry';
import type { SketchBrush } from '../../map/types';
import { brushSizeHint } from '../../map/hotkeys';

/* The sketch tool's panel, and the same fields in the inspector for a sketch
   already drawn. Every field is controlled (§5E). */

const PREVIEW: Pt[] = [[0.3, 1.3], [1.1, 0.4], [2.1, 1.25], [3.1, 0.45], [3.7, 0.9]];

/** A short wiggle drawn the way the brush draws, in the chosen colour. */
function SketchPreview({ brush, color, arrow }: { brush: SketchBrush; color: string; arrow: boolean }) {
    const cell = 16;
    const width = brush === 'marker' ? 0.45 : brush === 'dotted' ? 0.2 : 0.14;
    const look = sketchLook({ brush, width, opacity: 1 }, cell);
    const line = sketchLineD(PREVIEW, cell);
    const head = arrow ? sketchArrowD(PREVIEW, width, cell) : '';
    const joined = !!head && arrowInLine(brush);
    const common = { fill: 'none', stroke: color, strokeWidth: look.width, strokeLinecap: look.cap, strokeLinejoin: 'round' as const };
    return (
        <svg className="map-sketch-preview" viewBox="0 0 64 28" width={64} height={28} aria-hidden="true">
            <g opacity={look.opacity}>
                <path d={joined ? line + head : line} strokeDasharray={joined ? undefined : look.dash?.join(' ')} {...common} />
                {head && !joined && <path d={head} {...common} />}
            </g>
        </svg>
    );
}

const LOG_MIN = Math.log(MIN_SKETCH_WIDTH), LOG_MAX = Math.log(MAX_SKETCH_WIDTH);
const toSlider = (w: number) => Math.round(((Math.log(w) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
const fromSlider = (v: number) => cleanSketchWidth(Math.exp(LOG_MIN + (v / 1000) * (LOG_MAX - LOG_MIN)));

/** Brush, colour, width, opacity and arrowhead — for the next sketch, or for
    the one selected. */
export function SketchFields({ value, onChange }: { value: SketchSettings; onChange: (patch: Partial<SketchSettings>) => void }) {
    const custom = !SKETCH_COLORS.includes(value.color.toLowerCase());
    return (
        <>
            <div className="map-kinds map-sketch-brushes">
                {SKETCH_BRUSHES.map((b) => (
                    <button
                        key={b.id}
                        className={'map-kind' + (value.brush === b.id ? ' on' : '')}
                        aria-pressed={value.brush === b.id}
                        data-sketch-brush={b.id}
                        onClick={() => onChange(value.brush === b.id ? {} : { brush: b.id, width: b.width })}
                    >
                        <SketchPreview brush={b.id} color={value.color} arrow={value.arrow} />
                        <span>{b.name}</span>
                    </button>
                ))}
            </div>
            <div className="map-colors map-sketch-colors">
                {SKETCH_COLORS.map((c) => (
                    <button key={c} className="map-color" aria-pressed={value.color.toLowerCase() === c} style={{ background: c }}
                        aria-label={'Colour ' + c} onClick={() => onChange({ color: c })}></button>
                ))}
                <label className={'map-color map-color-custom' + (custom ? ' on' : '')} title="Any colour">
                    <input type="color" value={value.color.length === 7 ? value.color : '#000000'}
                        onChange={(e) => onChange({ color: e.currentTarget.value })} />
                    <i className="fa-solid fa-eye-dropper" aria-hidden="true"></i>
                </label>
            </div>
            <label className="map-row">
                <span>Width</span>
                <input
                    type="range" min={0} max={1000} value={toSlider(value.width)} data-sketch-width=""
                    onChange={(e) => onChange({ width: fromSlider(Number(e.currentTarget.value)) })}
                />
                <span className="map-num">{value.width < 1 ? value.width.toFixed(2) : value.width.toFixed(1)}</span>
            </label>
            <label className="map-row">
                <span>Opacity</span>
                <input
                    type="range" min={10} max={100} step={5} value={Math.round(value.opacity * 100)}
                    onChange={(e) => onChange({ opacity: Number(e.currentTarget.value) / 100 })}
                />
                <span className="map-num">{Math.round(value.opacity * 100)}%</span>
            </label>
            <label className="map-check">
                <input type="checkbox" checked={value.arrow} onChange={(e) => onChange({ arrow: e.currentTarget.checked })} />
                Arrowhead at the end
            </label>
        </>
    );
}

export function SketchPalette() {
    const { store, ui, doc } = useMap();
    return (
        <section className="map-section map-sketch-panel">
            <h3>Sketch</h3>
            <div className="map-segmented" role="group" aria-label="Draw or rub out">
                <button aria-pressed={!ui.sketchErase} onClick={() => store.setUi({ sketchErase: false })}>
                    <i className="fa-solid fa-pen"></i> Draw
                </button>
                <button aria-pressed={ui.sketchErase} data-sketch-erase="" onClick={() => store.setUi({ sketchErase: true })}>
                    <i className="fa-solid fa-eraser"></i> Rub out
                </button>
            </div>
            <SketchFields value={ui.sketch} onChange={(patch) => store.setUi({ sketch: { ...ui.sketch, ...patch }, sketchErase: false })} />
            <button className="map-sketch-clear" disabled={!doc.sketches.length} onClick={() => store.edit((d) => { d.sketches = []; })}>
                <i className="fa-solid fa-broom"></i> Clear all sketches
            </button>
            <p className="map-hint">
                {ui.sketchErase
                    ? 'Drag across sketches to rub them out, a whole line at a time. Only sketches: terrain and everything else stay.'
                    : 'Draw freely over the map — circle a town, mark a route, scribble a note. Sketches sit over the labels and under the tokens, and the rolling table shows them. '
                        + 'Select one to restyle, move or delete it. ' + brushSizeHint()}
            </p>
        </section>
    );
}
