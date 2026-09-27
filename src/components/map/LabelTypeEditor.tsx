import { useMap } from '../../map/MapContext';
import { styleOf } from '../../map/styles';
import { LABEL_FONTS, LABEL_WARPS, LABEL_WEIGHTS, labelType } from '../../map/labelText';
import { CELL } from '../../map/render/patterns';
import type { LabelAlign, LabelCase, LabelWarp, MapLabel } from '../../map/types';

/* The type settings of one label, the way an image editor's Character and
   Warp panels lay them out. Every setting left alone follows the label's role
   in the map's style; Reset hands them all back to it. */

const TYPE_KEYS: (keyof MapLabel)[] = ['font', 'weight', 'italic', 'caps', 'color', 'halo', 'haloWidth', 'opacity',
    'spacing', 'lineHeight', 'align', 'direction', 'warp', 'bend', 'slant', 'stretch', 'shadow'];

/** A colour input only takes #rrggbb; the styles' colours carry alpha. */
function hex6(c: string): string {
    if (/^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7);
    if (/^#[0-9a-f]{3,4}$/i.test(c)) return '#' + c.slice(1, 4).split('').map((x) => x + x).join('');
    return '#000000';
}

function Num({ label, value, step, min, max, suffix, onChange }: {
    label: string; value: number; step: number; min: number; max: number; suffix?: string;
    onChange: (v: number) => void;
}) {
    return (
        <label className="map-field">
            <span>{label}{suffix ? ' ' + suffix : ''}</span>
            <input
                type="number" value={Number(value.toFixed(2))} step={step} min={min} max={max}
                onChange={(e) => {
                    const v = Number(e.currentTarget.value);
                    if (e.currentTarget.value !== '' && isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
                }}
            />
        </label>
    );
}

export function LabelTypeEditor({ label, set }: { label: MapLabel; set: (patch: Partial<MapLabel>) => void }) {
    const { doc } = useMap();
    const style = styleOf(doc.styleId);
    const look = style.label[label.role];
    const t = labelType(label, style, CELL);
    const warp = label.warp ?? 'none';
    const vertical = label.direction === 'vertical';
    const touched = TYPE_KEYS.some((k) => label[k] !== undefined);
    const defaultFont = LABEL_FONTS.find((f) => f.css === look.font)?.name ?? 'the style’s';

    return (
        <div className="map-type-editor">
            <h4 className="map-subhead">Character</h4>
            <label className="map-field">
                <span>Font</span>
                <select value={label.font ?? ''} onChange={(e) => set({ font: e.currentTarget.value || undefined })}>
                    <option value="">Style default ({defaultFont})</option>
                    {LABEL_FONTS.map((f) => (
                        <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.name}</option>
                    ))}
                </select>
            </label>
            <div className="map-field-row">
                <label className="map-field">
                    <span>Weight</span>
                    <select value={t.weight} onChange={(e) => set({ weight: Number(e.currentTarget.value) })}>
                        {LABEL_WEIGHTS.map((w) => <option key={w.weight} value={w.weight}>{w.name}</option>)}
                        {!LABEL_WEIGHTS.some((w) => w.weight === t.weight) && <option value={t.weight}>{t.weight}</option>}
                    </select>
                </label>
                <label className="map-field">
                    <span>Case</span>
                    <select
                        value={label.caps ?? (look.upper ? 'upper' : 'none')}
                        onChange={(e) => set({ caps: e.currentTarget.value as LabelCase })}
                    >
                        <option value="none">As typed</option>
                        <option value="upper">UPPERCASE</option>
                        <option value="lower">lowercase</option>
                        <option value="title">Title Case</option>
                    </select>
                </label>
            </div>
            <div className="map-type-toggles">
                <div className="map-segmented" role="group" aria-label="Style">
                    <button aria-pressed={t.weight >= 700} title="Bold" onClick={() => set({ weight: t.weight >= 700 ? 400 : 700 })}>
                        <i className="fa-solid fa-bold"></i>
                    </button>
                    <button aria-pressed={t.italic} title="Italic" onClick={() => set({ italic: !t.italic })}>
                        <i className="fa-solid fa-italic"></i>
                    </button>
                    <button aria-pressed={t.shadow} title="Drop shadow" onClick={() => set({ shadow: !t.shadow })}>
                        <i className="fa-solid fa-clone"></i>
                    </button>
                </div>
                <div className="map-segmented" role="group" aria-label="Alignment">
                    {(['left', 'center', 'right'] as LabelAlign[]).map((a) => (
                        <button key={a} aria-pressed={t.align === a} title={'Align ' + a} onClick={() => set({ align: a })}>
                            <i className={'fa-solid fa-align-' + a}></i>
                        </button>
                    ))}
                </div>
                <div className="map-segmented" role="group" aria-label="Direction">
                    <button aria-pressed={!vertical} title="Horizontal text" onClick={() => set({ direction: 'horizontal' })}>
                        <i className="fa-solid fa-text-width"></i>
                    </button>
                    <button aria-pressed={vertical} title="Vertical text: letters stacked top to bottom" onClick={() => set({ direction: 'vertical' })}>
                        <i className="fa-solid fa-text-height"></i>
                    </button>
                </div>
            </div>
            <div className="map-field-row">
                <Num label="Size" suffix="×" value={label.scale} step={0.1} min={0.2} max={8} onChange={(v) => set({ scale: v })} />
                <Num label="Tracking" suffix="em" value={label.spacing ?? look.spacing ?? 0} step={0.02} min={-0.5} max={2} onChange={(v) => set({ spacing: v })} />
                <Num label="Leading" suffix="em" value={t.lineHeight} step={0.05} min={0.5} max={4} onChange={(v) => set({ lineHeight: v })} />
            </div>
            <div className="map-field-row">
                <label className="map-field map-color-field">
                    <span>Colour</span>
                    <input type="color" value={hex6(t.color)} onChange={(e) => set({ color: e.currentTarget.value })} />
                </label>
                <label className="map-field map-color-field">
                    <span>Outline</span>
                    <input type="color" value={hex6(t.halo)} onChange={(e) => set({ halo: e.currentTarget.value })} />
                </label>
                <Num label="Thickness" value={label.haloWidth ?? 0.2} step={0.02} min={0} max={1} onChange={(v) => set({ haloWidth: v })} />
                <Num label="Opacity" suffix="%" value={Math.round(t.opacity * 100)} step={5} min={5} max={100} onChange={(v) => set({ opacity: v / 100 })} />
            </div>

            <h4 className="map-subhead">Transform</h4>
            <div className="map-field-row">
                <Num label="Turn" suffix="°" value={label.rotation} step={5} min={-360} max={360} onChange={(v) => set({ rotation: v })} />
                <Num label="Slant" suffix="°" value={t.slant} step={1} min={-60} max={60} onChange={(v) => set({ slant: v })} />
                <Num label="Width" suffix="%" value={Math.round(t.stretch * 100)} step={5} min={20} max={400} onChange={(v) => set({ stretch: v / 100 })} />
            </div>

            <h4 className="map-subhead">Warp</h4>
            <div className="map-field-row">
                <label className="map-field">
                    <span>Style</span>
                    <select value={vertical ? 'none' : warp} disabled={vertical} onChange={(e) => set({ warp: e.currentTarget.value as LabelWarp })}>
                        {LABEL_WARPS.map((w) => <option key={w.warp} value={w.warp}>{w.name}</option>)}
                    </select>
                </label>
            </div>
            {vertical && <p className="map-hint">Vertical text is not warped.</p>}
            {!vertical && warp !== 'none' && (
                <label className="map-size-row map-bend">
                    <span>Bend</span>
                    <input
                        type="range" min="-100" max="100" step="1"
                        className="map-size-range"
                        value={label.bend ?? 50}
                        onChange={(e) => set({ bend: Number(e.currentTarget.value) })}
                    />
                    <span className="map-size-val">{label.bend ?? 50}%</span>
                </label>
            )}

            <button
                className="map-size-reset map-type-reset"
                disabled={!touched}
                title="Put every type setting back to the role's look in this map style"
                onClick={() => set(Object.fromEntries(TYPE_KEYS.map((k) => [k, undefined])) as Partial<MapLabel>)}
            >
                <i className="fa-solid fa-rotate-left"></i> Reset type
            </button>
        </div>
    );
}
