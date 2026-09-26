import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useMap } from '../../map/MapContext';
import { LABEL_ROLES, PATH_KINDS, styleOf } from '../../map/styles';
import type { MapStyle } from '../../map/styles';
import { TERRAINS, TERRAIN_BY_CODE } from '../../map/terrain';
import { LANDMARK_GROUPS, LANDMARKS, landmarkOf } from '../../map/landmarks';
import type { LandmarkGroup } from '../../map/landmarks';
import { landmarkChain, markerChain, onImageArrived, pokemonTokenChain, probeImage, terrainTextureUrl } from '../../map/sprites';
import { patternDataUrl } from '../../map/render/patterns';
import { snapPoint, uid } from '../../map/doc';
import { typeColors } from '../../lib/themeTables';
import { MapSprite } from './MapSprite';
import { TokenPicker } from './TokenPicker';
import { BrushControls } from './BrushControls';
import { EDGE_KINDS, EDGE_NAME, paintValue } from '../../map/edges';
import { EDGE_TINT } from '../../map/render/terrain';
import type { EdgeKind, MapDoc, MapLabel, MapPath, MapStamp, MapToken, Selection } from '../../map/types';
import type { MapStore } from '../../map/store';

/* The right-hand panel: what the current tool lays down, and — once something
   is selected — the inspector for it. Every field is controlled (`value=`) and
   keyed by the object's id, never by what is typed into it (§5E). */

export const TOKEN_COLORS = ['#e0645c', '#3c6cf8', '#3aa593', '#f0b429', '#a855f7', '#ec4899', '#f8f8f8', '#333333'];

const TYPES = Object.keys(typeColors);

/* ------------------------------------------------------------- terrain */

export function swatchBackground(style: MapStyle, slug: string): string {
    const look = style.terrain[slug];
    const fill = look?.fill ?? '#888';
    const tex = probeImage(terrainTextureUrl(style, slug));
    if (tex) return `url("${tex.src}") center / 50% repeat, ${fill}`;
    const tile = look?.pattern ? patternDataUrl(look.pattern, look.ink ?? '#0003') : null;
    return tile ? `url("${tile}") 0 0 / 100% repeat, ${fill}` : fill;
}

function TerrainPalette({ style }: { style: MapStyle }) {
    const { store, ui } = useMap();
    const [, setTick] = useState(0);
    useEffect(() => onImageArrived(() => setTick((n) => n + 1)), []);
    const backgrounds = new Map(TERRAINS.map((t) => [t.slug, swatchBackground(style, t.slug)]));
    return (
        <section className="map-section">
            <h3>Terrain</h3>
            <div className="map-swatches">
                {TERRAINS.map((t) => (
                    <button
                        key={t.code}
                        className={'map-swatch' + (ui.terrain === t.code ? ' on' : '')}
                        aria-pressed={ui.terrain === t.code}
                        title={t.name}
                        onClick={() => store.setUi({ terrain: t.code, tool: ui.tool === 'fill' ? 'fill' : 'paint' })}
                    >
                        <span className={'map-swatch-chip' + (style.pixelated ? ' pixelated' : '')} style={{ background: backgrounds.get(t.slug) }}></span>
                        <span className="map-swatch-name">{t.name}</span>
                    </button>
                ))}
            </div>
            {ui.tool !== 'fill' && <BrushControls slot="paint" />}
            <EdgeChoice
                label="Its edges"
                value={ui.paintEdge}
                mapHint="Leave the edges to the Borders settings on the top bar"
                onChange={(v) => store.setUi({ paintEdge: v })}
            />
            <p className="map-hint">
                {ui.tool === 'fill'
                    ? 'Click to fill the whole connected patch of the terrain under the pointer.'
                    : 'Drag to paint. [ and ] change the size. Hold Space to pan.'}
            </p>
        </section>
    );
}

/** How the edges of what is painted are drawn: the map's say, or one of the
    four looks. */
export function EdgeChoice({ label, value, mapHint, tints, onChange }: {
    label: string; value: EdgeKind | 'map'; mapHint: string; tints?: boolean; onChange: (v: EdgeKind | 'map') => void;
}) {
    return (
        <div className="map-field map-edge-choice">
            <span>{label}</span>
            <div className="map-segmented" role="group" aria-label={label}>
                <button aria-pressed={value === 'map'} onClick={() => onChange('map')} title={mapHint}>Map</button>
                {EDGE_KINDS.map((k) => (
                    <button key={k.kind} aria-pressed={value === k.kind} onClick={() => onChange(k.kind)} title={k.hint}>
                        {tints && <span className="map-edge-dot" style={{ background: EDGE_TINT[paintValue(k.kind)] }}></span>}
                        {k.name}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------- eraser */

function ErasePalette() {
    const { store, ui, doc } = useMap();
    const bg = TERRAIN_BY_CODE.get(doc.background);
    return (
        <section className="map-section">
            <h3>Eraser</h3>
            <div className="map-segmented map-erase-mode" role="group" aria-label="What the eraser removes">
                <button aria-pressed={ui.eraseMode === 'terrain'} onClick={() => store.setUi({ eraseMode: 'terrain' })}>
                    <i className="fa-solid fa-layer-group"></i> Terrain
                </button>
                <button aria-pressed={ui.eraseMode === 'objects'} onClick={() => store.setUi({ eraseMode: 'objects' })}>
                    <i className="fa-solid fa-shapes"></i> Objects
                </button>
            </div>
            {ui.eraseMode === 'terrain' ? (
                <>
                    <BrushControls slot="erase" />
                    <p className="map-hint">
                        Drag to rub terrain out: the map's background{bg ? ' (' + bg.name + ')' : ''} shows through.
                        Change the background on the top bar. [ and ] change the size.
                    </p>
                </>
            ) : (
                <p className="map-hint">Click or drag across landmarks, tokens, labels and paths to remove them.</p>
            )}
        </section>
    );
}

/* ------------------------------------------------------------- borders */

function EdgePalette() {
    const { store, ui, doc } = useMap();
    return (
        <section className="map-section">
            <h3>Borders</h3>
            <EdgeChoice
                label="Paint edges as"
                tints
                value={ui.edgeKind}
                mapHint="Clear what was painted, so the Borders settings on the top bar apply again"
                onChange={(v) => store.setUi({ edgeKind: v })}
            />
            <BrushControls slot="edge" />
            <p className="map-hint">
                Paint over the edges between terrains to choose how they look there — a line, none, or a soft
                blend of one terrain into the next. What you paint is tinted while this tool is out. The rest
                follow the Borders settings on the top bar (now: {EDGE_NAME[doc.borders.kind]}).
            </p>
        </section>
    );
}

/* ------------------------------------------------------------- landmarks */

function LandmarkPalette({ style }: { style: MapStyle }) {
    const { store, ui } = useMap();
    const [group, setGroup] = useState<LandmarkGroup | 'all'>('all');
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const list = LANDMARKS.filter((l) => (group === 'all' || l.group === group) && (!q || l.name.toLowerCase().includes(q)));
    return (
        <section className="map-section">
            <h3>Landmarks</h3>
            <div className="map-chips">
                <button className="map-chip" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>All</button>
                {LANDMARK_GROUPS.map((g) => (
                    <button key={g.key} className="map-chip" aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>{g.label}</button>
                ))}
            </div>
            <input
                type="text" className="map-search" placeholder="Search landmarks…" value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <div className="map-tiles">
                {list.map((l) => (
                    <button
                        key={l.slug}
                        className={'map-tile' + (ui.landmark === l.slug ? ' on' : '')}
                        aria-pressed={ui.landmark === l.slug}
                        title={l.name + ' — ' + l.slug + '.png'}
                        onClick={() => store.setUi({ landmark: l.slug, tool: 'stamp' })}
                    >
                        <MapSprite
                            candidates={landmarkChain(style, l.slug)} icon={l.icon} color={l.color}
                            className={'map-tile-art' + (style.pixelated ? ' pixelated' : '')}
                        />
                        <span className="map-tile-name">{l.name}</span>
                    </button>
                ))}
                {!list.length && <p className="map-hint">No landmark matches.</p>}
            </div>
            <p className="map-hint">Click the map to place. Hold Space to pan.</p>
        </section>
    );
}

/* ------------------------------------------------------------- paths */

function PathPreview({ style, kind }: { style: MapStyle; kind: MapPath['kind'] }) {
    const look = style.paths[kind];
    const w = Math.max(2, 10 * look.widthScale);
    const d = 'M6 20 C 22 4, 38 36, 58 14';
    return (
        <svg className="map-path-preview" viewBox="0 0 64 32" width={64} height={32} style={{ background: style.terrain.grassland.fill }}>
            {look.casing && <path d={d} fill="none" stroke={look.casing} strokeWidth={w + 4} strokeLinecap={look.cap} />}
            <path d={d} fill="none" stroke={look.color} strokeWidth={w} strokeLinecap={look.cap}
                strokeDasharray={look.dash?.map((x) => x * w).join(' ')} />
        </svg>
    );
}

function PathPalette({ style }: { style: MapStyle }) {
    const { store, ui } = useMap();
    return (
        <section className="map-section">
            <h3>Paths</h3>
            <div className="map-kinds">
                {PATH_KINDS.map((k) => (
                    <button
                        key={k.kind}
                        className={'map-kind' + (ui.pathKind === k.kind ? ' on' : '')}
                        aria-pressed={ui.pathKind === k.kind}
                        onClick={() => store.setUi({ pathKind: k.kind, tool: 'path' })}
                    >
                        <PathPreview style={style} kind={k.kind} />
                        <span>{k.name}</span>
                    </button>
                ))}
            </div>
            <p className="map-hint">Drag to draw; the line is smoothed when you let go. Select a path to name it, number a Route or drag its points.</p>
        </section>
    );
}

/* ------------------------------------------------------------- tokens */

function TokenPalette({ style }: { style: MapStyle }) {
    const { store, ui } = useMap();
    const [picking, setPicking] = useState(false);
    const tok = ui.token;
    const set = (patch: Partial<NonNullable<typeof tok>>) => {
        if (tok) store.setUi({ token: { ...tok, ...patch }, tool: 'token' });
    };
    return (
        <section className="map-section">
            <h3>Tokens</h3>
            <div className="map-token-kinds">
                <button className="map-kind" aria-pressed={tok?.kind === 'pokemon'} onClick={() => setPicking(true)}>
                    <i className="fa-solid fa-dragon"></i><span>Pokémon…</span>
                </button>
                <button
                    className="map-kind" aria-pressed={tok?.kind === 'trainer'}
                    onClick={() => store.setUi({ tool: 'token', token: { kind: 'trainer', name: 'Trainer', color: tok?.color ?? TOKEN_COLORS[0] } })}
                >
                    <i className="fa-solid fa-user"></i><span>Trainer</span>
                </button>
                <button
                    className="map-kind" aria-pressed={tok?.kind === 'wild'}
                    onClick={() => store.setUi({ tool: 'token', token: { kind: 'wild', name: '', color: tok?.color ?? TOKEN_COLORS[3] } })}
                >
                    <i className="fa-solid fa-circle-question"></i><span>Wild</span>
                </button>
            </div>
            {tok ? (
                <div className="map-token-pending">
                    <span className="map-token-preview" style={{ borderColor: tok.color }}>
                        <MapSprite
                            candidates={tok.kind === 'pokemon' && tok.image ? pokemonTokenChain(tok.image) : markerChain(style, tok.kind === 'trainer' ? 'trainer' : 'wild')}
                            icon={tok.kind === 'trainer' ? 'fa-user' : 'fa-question'} color={tok.color}
                            className="map-token-art"
                        />
                    </span>
                    <div className="map-token-fields">
                        <input type="text" value={tok.name} placeholder="Name (optional)" onChange={(e) => set({ name: e.currentTarget.value })} />
                        <ColorRow value={tok.color} onPick={(color) => set({ color })} />
                    </div>
                </div>
            ) : (
                <p className="map-hint">Pick a Pokémon, a trainer or a wild marker, then click the map to place it.</p>
            )}
            <TokenPicker
                open={picking}
                onClose={() => setPicking(false)}
                onPick={(p) => {
                    setPicking(false);
                    store.setUi({ tool: 'token', token: { kind: 'pokemon', image: p.Image, name: p.Name, color: tok?.color ?? TOKEN_COLORS[1] } });
                }}
            />
        </section>
    );
}

function ColorRow({ value, onPick }: { value: string; onPick: (c: string) => void }) {
    return (
        <div className="map-colors">
            {TOKEN_COLORS.map((c) => (
                <button key={c} className="map-color" aria-pressed={value === c} style={{ background: c }} title={c} onClick={() => onPick(c)}></button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------- labels */

function LabelPalette() {
    const { store, ui } = useMap();
    return (
        <section className="map-section">
            <h3>Labels</h3>
            <div className="map-chips">
                {LABEL_ROLES.map((r) => (
                    <button key={r.role} className="map-chip" aria-pressed={ui.labelRole === r.role} onClick={() => store.setUi({ labelRole: r.role, tool: 'label' })}>
                        {r.name}
                    </button>
                ))}
            </div>
            <p className="map-hint">Click the map to place a label, then type its text below.</p>
        </section>
    );
}

/* ------------------------------------------------------------- inspector */

function NumberField({ label, value, step, min, max, onChange }: {
    label: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void;
}) {
    return (
        <label className="map-field">
            <span>{label}</span>
            <input
                type="number" value={Number(value.toFixed(2))} step={step} min={min} max={max}
                onChange={(e) => {
                    const v = Number(e.currentTarget.value);
                    if (isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
                }}
            />
        </label>
    );
}

/** Size as the Pokémon card sizes a sprite: a slider, the value as a
    multiple, and Reset. `base` is what 1.00× means — a token's one cell, a
    landmark's own default size. */
function SizeSlider({ size, base, onChange }: { size: number; base: number; onChange: (v: number) => void }) {
    const scale = size / base;
    return (
        <div className="map-size-editor">
            <label className="map-size-row">
                <span>Size</span>
                <input
                    type="range" min="0.25" max="4" step="0.01"
                    className="map-size-range"
                    value={Math.min(4, Math.max(0.25, scale))}
                    onChange={(e) => onChange(Math.round(parseFloat(e.currentTarget.value) * base * 1000) / 1000)}
                />
                <span className="map-size-val">{scale.toFixed(2)}×</span>
            </label>
            <button className="map-size-reset" onClick={() => onChange(base)} disabled={Math.abs(scale - 1) < 0.001}>Reset</button>
        </div>
    );
}

/** This object's own snap setting, over the map's. */
function SnapChoice({ value, mapSnap, onChange }: {
    value: boolean | undefined; mapSnap: boolean; onChange: (v: boolean | undefined) => void;
}) {
    return (
        <div className="map-field">
            <span>Snap to grid</span>
            <div className="map-segmented" role="group" aria-label="Snap to grid">
                <button aria-pressed={value === undefined} onClick={() => onChange(undefined)}
                    title="Follow the map's Snap button in the top bar">
                    Map ({mapSnap ? 'on' : 'off'})
                </button>
                <button aria-pressed={value === true} onClick={() => onChange(true)} title="Always snap, whatever the map says">
                    <i className="fa-solid fa-magnet"></i> Snap
                </button>
                <button aria-pressed={value === false} onClick={() => onChange(false)} title="Never snap, whatever the map says">
                    <i className="fa-solid fa-up-down-left-right"></i> Free
                </button>
            </div>
        </div>
    );
}

/** A new snap setting, and — if it now snaps — the position it snaps to,
    so choosing Snap puts the object on the grid there and then. */
function snapPatch(doc: MapDoc, o: { x: number; y: number; size: number }, snap: boolean | undefined): Record<string, unknown> {
    if (!(snap ?? doc.grid.snap)) return { snap };
    const [x, y] = snapPoint(o.x, o.y, o.size);
    return { snap, x, y };
}

function patchObject(store: MapStore, sel: Selection, patch: Record<string, unknown>): void {
    store.edit((d) => {
        if (sel.kind === 'stamp') d.stamps = d.stamps.map((o) => (o.id === sel.id ? { ...o, ...patch } as MapStamp : o));
        if (sel.kind === 'token') d.tokens = d.tokens.map((o) => (o.id === sel.id ? { ...o, ...patch } as MapToken : o));
        if (sel.kind === 'label') d.labels = d.labels.map((o) => (o.id === sel.id ? { ...o, ...patch } as MapLabel : o));
        if (sel.kind === 'path') d.paths = d.paths.map((o) => (o.id === sel.id ? { ...o, ...patch } as MapPath : o));
    }, sel.id + ':' + Object.keys(patch).join(','));
}

/** The ids of the selection, by kind — what every group action filters on. */
function selectedIds(store: MapStore): Record<Selection['kind'], Set<string>> {
    const out = { stamp: new Set<string>(), token: new Set<string>(), label: new Set<string>(), path: new Set<string>() };
    for (const sel of store.ui.selection) out[sel.kind].add(sel.id);
    return out;
}

export function deleteSelection(store: MapStore): void {
    if (!store.ui.selection.length) return;
    const ids = selectedIds(store);
    store.edit((d) => {
        d.stamps = d.stamps.filter((o) => !ids.stamp.has(o.id));
        d.tokens = d.tokens.filter((o) => !ids.token.has(o.id));
        d.labels = d.labels.filter((o) => !ids.label.has(o.id));
        d.paths = d.paths.filter((o) => !ids.path.has(o.id));
    });
    store.setUi({ selection: [] });
}

/** Copies of everything selected, offset a step, and the copies selected. */
export function duplicateSelection(store: MapStore): void {
    if (!store.ui.selection.length) return;
    const ids = selectedIds(store);
    const off = store.doc.grid.snap ? 1 : 0.6;
    const made: Selection[] = [];
    const copy = <T extends { id: string; x: number; y: number }>(list: T[], kind: Selection['kind']): T[] => [
        ...list,
        ...list.filter((o) => ids[kind].has(o.id)).map((o) => {
            const id = uid();
            made.push({ kind, id });
            return { ...o, id, x: o.x + off, y: o.y + off };
        }),
    ];
    store.edit((d) => {
        d.stamps = copy(d.stamps, 'stamp');
        d.tokens = copy(d.tokens, 'token');
        d.labels = copy(d.labels, 'label');
        d.paths = [
            ...d.paths,
            ...d.paths.filter((o) => ids.path.has(o.id)).map((o) => {
                const id = uid();
                made.push({ kind: 'path', id });
                return { ...o, id, points: o.points.map(([x, y]) => [x + off, y + off] as [number, number]) };
            }),
        ];
    });
    store.setUi({ selection: made });
}

/** Move the selection to the top (or bottom) of each of its layers, keeping
    the selected objects' order among themselves. */
function restack(store: MapStore, top: boolean): void {
    const ids = selectedIds(store);
    const move = <T extends { id: string }>(list: T[], set: Set<string>): T[] => {
        const picked = list.filter((x) => set.has(x.id));
        if (!picked.length) return list;
        const rest = list.filter((x) => !set.has(x.id));
        return top ? [...rest, ...picked] : [...picked, ...rest];
    };
    store.edit((d) => {
        d.stamps = move(d.stamps, ids.stamp);
        d.tokens = move(d.tokens, ids.token);
        d.labels = move(d.labels, ids.label);
        d.paths = move(d.paths, ids.path);
    });
}

function GroupActions() {
    const { store } = useMap();
    return (
        <div className="map-inspector-actions">
            <button className="icon-btn" title="Duplicate (Ctrl+D)" onClick={() => duplicateSelection(store)}><i className="fa-solid fa-clone"></i></button>
            <button className="icon-btn" title="Bring to front" onClick={() => restack(store, true)}><i className="fa-solid fa-arrow-up-wide-short"></i></button>
            <button className="icon-btn" title="Send to back" onClick={() => restack(store, false)}><i className="fa-solid fa-arrow-down-short-wide"></i></button>
            <span className="spacer"></span>
            <button className="icon-btn danger" title="Delete (Del)" onClick={() => deleteSelection(store)}><i className="fa-solid fa-trash"></i></button>
        </div>
    );
}

const KIND_NAMES: Record<Selection['kind'], [string, string]> = {
    stamp: ['landmark', 'landmarks'], token: ['token', 'tokens'], label: ['label', 'labels'], path: ['path', 'paths'],
};

/** Several things selected: what they are, and what can be done to all of them. */
function GroupInspector({ selection }: { selection: Selection[] }) {
    const counts = new Map<Selection['kind'], number>();
    for (const s of selection) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
    return (
        <section className="map-section map-inspector">
            <h3>{selection.length} selected</h3>
            <p className="map-hint">
                {[...counts].map(([k, n]) => n + ' ' + KIND_NAMES[k][n === 1 ? 0 : 1]).join(', ')}.
                {' '}Drag any of them to move them together. Ctrl-click to add or remove one.
            </p>
            <GroupActions />
        </section>
    );
}

function Inspector({ doc, sel }: { doc: MapDoc; sel: Selection }) {
    const { store } = useMap();
    const labelRef = useRef<HTMLTextAreaElement>(null);
    const set = (patch: Record<string, unknown>) => patchObject(store, sel, patch);

    /* A label just placed from the map: put the caret in its text straight
       away so it can be typed over. A frame later, so the press that placed
       it has finished moving focus first. */
    useEffect(() => {
        if (sel.kind !== 'label' || store.ui.focusLabel !== sel.id) return;
        const frame = requestAnimationFrame(() => {
            labelRef.current?.focus();
            labelRef.current?.select();
            store.setUi({ focusLabel: undefined });
        });
        return () => cancelAnimationFrame(frame);
    }, [store, sel]);

    let body: ReactElement | null = null;
    let title = '';
    if (sel.kind === 'stamp') {
        const s = doc.stamps.find((o) => o.id === sel.id);
        if (!s) return null;
        const def = landmarkOf(s.landmark);
        title = def.name;
        body = (
            <>
                <label className="map-field">
                    <span>Landmark</span>
                    <select value={s.landmark} onChange={(e) => set({ landmark: e.currentTarget.value })}>
                        {LANDMARK_GROUPS.map((g) => (
                            <optgroup key={g.key} label={g.label}>
                                {LANDMARKS.filter((l) => l.group === g.key).map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
                            </optgroup>
                        ))}
                    </select>
                </label>
                <label className="map-field">
                    <span>Label</span>
                    <input type="text" value={s.label ?? ''} placeholder="Shown under it" onChange={(e) => set({ label: e.currentTarget.value })} />
                </label>
                {def.typed && (
                    <label className="map-field">
                        <span>Type</span>
                        <select value={s.type ?? ''} onChange={(e) => set({ type: e.currentTarget.value || undefined })}>
                            <option value="">None</option>
                            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </label>
                )}
                <SizeSlider size={s.size} base={def.size} onChange={(v) => set({ size: v })} />
                <div className="map-field-row">
                    <NumberField label="Turn°" value={s.rotation} step={15} min={-360} max={360} onChange={(v) => set({ rotation: v })} />
                    <label className="map-check">
                        <input type="checkbox" checked={s.flip} onChange={(e) => set({ flip: e.currentTarget.checked })} /> Mirror
                    </label>
                </div>
                <SnapChoice value={s.snap} mapSnap={doc.grid.snap} onChange={(v) => set(snapPatch(doc, s, v))} />
            </>
        );
    } else if (sel.kind === 'token') {
        const t = doc.tokens.find((o) => o.id === sel.id);
        if (!t) return null;
        title = t.kind === 'pokemon' ? 'Pokémon token' : t.kind === 'trainer' ? 'Trainer token' : 'Wild Pokémon';
        body = (
            <>
                <label className="map-field">
                    <span>Name</span>
                    <input type="text" value={t.name} onChange={(e) => set({ name: e.currentTarget.value })} />
                </label>
                <SizeSlider size={t.size} base={1} onChange={(v) => set({ size: v })} />
                <ColorRow value={t.color} onPick={(color) => set({ color })} />
                <SnapChoice value={t.snap} mapSnap={doc.grid.snap} onChange={(v) => set(snapPatch(doc, t, v))} />
            </>
        );
    } else if (sel.kind === 'label') {
        const l = doc.labels.find((o) => o.id === sel.id);
        if (!l) return null;
        title = 'Label';
        body = (
            <>
                <label className="map-field">
                    <span>Text</span>
                    <textarea ref={labelRef} rows={2} value={l.text} onChange={(e) => set({ text: e.currentTarget.value })} />
                </label>
                <div className="map-chips">
                    {LABEL_ROLES.map((r) => (
                        <button key={r.role} className="map-chip" aria-pressed={l.role === r.role} onClick={() => set({ role: r.role })}>{r.name}</button>
                    ))}
                </div>
                <div className="map-field-row">
                    <NumberField label="Scale" value={l.scale} step={0.1} min={0.2} max={8} onChange={(v) => set({ scale: v })} />
                    <NumberField label="Turn°" value={l.rotation} step={5} min={-360} max={360} onChange={(v) => set({ rotation: v })} />
                </div>
            </>
        );
    } else {
        const p = doc.paths.find((o) => o.id === sel.id);
        if (!p) return null;
        title = PATH_KINDS.find((k) => k.kind === p.kind)?.name ?? 'Path';
        body = (
            <>
                <label className="map-field">
                    <span>Kind</span>
                    <select value={p.kind} onChange={(e) => set({ kind: e.currentTarget.value })}>
                        {PATH_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}
                    </select>
                </label>
                <label className="map-field">
                    <span>Name</span>
                    <input type="text" value={p.label ?? ''} placeholder="Written along it" onChange={(e) => set({ label: e.currentTarget.value })} />
                </label>
                {p.kind === 'route' && (
                    <label className="map-field">
                        <span>Route no.</span>
                        <input type="text" value={p.routeNo ?? ''} placeholder="e.g. 12" onChange={(e) => set({ routeNo: e.currentTarget.value })} />
                    </label>
                )}
                <NumberField label="Width" value={p.width} step={0.1} min={0.1} max={6} onChange={(v) => set({ width: v })} />
            </>
        );
    }

    return (
        <section className="map-section map-inspector">
            <h3>{title}</h3>
            {body}
            <GroupActions />
        </section>
    );
}

export function SidePanel() {
    const { doc, ui } = useMap();
    const style = styleOf(doc.styleId);
    let palette: ReactElement | null = null;
    switch (ui.tool) {
        case 'paint': case 'fill': palette = <TerrainPalette style={style} />; break;
        case 'stamp': palette = <LandmarkPalette style={style} />; break;
        case 'path': palette = <PathPalette style={style} />; break;
        case 'token': palette = <TokenPalette style={style} />; break;
        case 'label': palette = <LabelPalette />; break;
        case 'select': palette = !ui.selection.length ? <p className="map-hint map-section">Click something on the map to select it. Drag to move; drag a landmark's corner to resize it or its knob to turn it. Ctrl-click to select several, or drag a box round them.</p> : null; break;
        case 'erase': palette = <ErasePalette />; break;
        case 'edge': palette = <EdgePalette />; break;
        case 'pan': palette = <p className="map-hint map-section">Drag to move around the map; the wheel or a pinch zooms.</p>; break;
    }
    return (
        <aside className="map-side">
            {palette}
            {ui.selection.length === 1 && <Inspector key={ui.selection[0].kind + ':' + ui.selection[0].id} doc={doc} sel={ui.selection[0]} />}
            {ui.selection.length > 1 && <GroupInspector selection={ui.selection} />}
        </aside>
    );
}
