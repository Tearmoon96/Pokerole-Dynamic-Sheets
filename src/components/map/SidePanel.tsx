import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useMap } from '../../map/MapContext';
import { LABEL_ROLES, PATH_KINDS, styleOf } from '../../map/styles';
import type { MapStyle } from '../../map/styles';
import { TERRAINS, TERRAIN_BY_CODE } from '../../map/terrain';
import { FILLER_PREFIX, LANDMARK_GROUPS, LANDMARKS, fillerTerrain, landmarkOf } from '../../map/landmarks';
import { fillerTerrains, fillerUrl, fillerVariants } from '../../map/fillerStamps';
import type { LandmarkGroup } from '../../map/landmarks';
import { landmarkChain, markerChain, onImageArrived, pokemonTokenChain, probeImage, terrainTextureUrl } from '../../map/sprites';
import { TILE_CELLS, patternDataUrl, tileCells } from '../../map/render/patterns';
import { snapPoint, uid } from '../../map/doc';
import { typeColors } from '../../lib/themeTables';
import { MapSprite } from './MapSprite';
import { TokenPicker } from './TokenPicker';
import { BrushControls } from './BrushControls';
import { LabelTypeEditor } from './LabelTypeEditor';
import { EDGE_KINDS, EDGE_NAME, paintValue } from '../../map/edges';
import { FOG_COLORS, fogValue, fullFog } from '../../map/fog';
import { EDGE_TINT, hasFiller } from '../../map/render/terrain';
import type { EdgeKind, MapDoc, MapLabel, MapPath, MapPlaced, MapSketch, MapStamp, MapToken, Selection } from '../../map/types';
import { riverInkD } from '../../map/geometry';
import { SketchFields, SketchPalette } from './SketchPanel';
import { ShapePicker } from './ShapePicker';
import type { MapStore } from '../../map/store';
import { brushSizeHint, panHint, useHotkeys } from '../../map/hotkeys';
import { KIND_ICON, KIND_LABEL, childKinds, linkCandidates, linkedDoc } from '../../map/world';
import { BuildPalette, PlacedFields, RoomPanel } from './BuildPanel';
import { itemOf } from '../../map/world/catalog';

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
    /* A chip shows two cells' worth, whatever size the tile is. */
    const size = look?.pattern ? tileCells(look.pattern) / TILE_CELLS * 100 : 100;
    return tile ? `url("${tile}") 0 0 / ${size}% repeat, ${fill}` : fill;
}

function TerrainPalette({ style }: { style: MapStyle }) {
    const { store, ui } = useMap();
    const [, setTick] = useState(0);
    useEffect(() => onImageArrived(() => setTick((n) => n + 1)), []);
    const backgrounds = new Map(TERRAINS.map((t) => [t.slug, swatchBackground(style, t.slug)]));
    const fillers = ui.tool !== 'fill' && ui.paintLayer === 'fillers';
    /* One filler at a time is the Paint tool's alone: Shapes paint areas. */
    const single = ui.tool === 'paint' && ui.paintLayer === 'single';
    const shape = ui.tool === 'shape';
    return (
        <section className="map-section">
            {shape && <ShapePicker />}
            <h3>{single ? 'One filler' : fillers ? 'Fillers' : 'Terrain'}</h3>
            {ui.tool !== 'fill' && (
                <div className="map-segmented map-paint-layer" role="group" aria-label="What the brush paints">
                    <button aria-pressed={!fillers && !single} onClick={() => store.setUi({ paintLayer: 'terrain' })}>
                        <i className="fa-solid fa-layer-group"></i> Terrain
                    </button>
                    <button aria-pressed={fillers} onClick={() => store.setUi({ paintLayer: 'fillers' })}
                        title="Paint a terrain's peaks, trees or flowers over the ground, on top of its own">
                        <i className="fa-solid fa-mountain-sun"></i> Fillers only
                    </button>
                    {ui.tool === 'paint' && (
                        <button aria-pressed={single} onClick={() => store.setUi({ paintLayer: 'single' })}
                            title="Place one peak or one tree where you click, then size and turn it like a landmark">
                            <i className="fa-solid fa-tree"></i> One filler
                        </button>
                    )}
                </div>
            )}
            {single ? <SingleFillers style={style} /> : fillers ? <FillerPalette style={style} backgrounds={backgrounds} /> : (<>
            <div className="map-swatches">
                {TERRAINS.map((t) => (
                    <button
                        key={t.code}
                        className={'map-swatch' + (ui.terrain === t.code ? ' on' : '')}
                        aria-pressed={ui.terrain === t.code}
                        title={t.name}
                        onClick={() => store.setUi({ terrain: t.code, tool: ui.tool === 'fill' || ui.tool === 'shape' ? ui.tool : 'paint' })}
                    >
                        <span className={'map-swatch-chip' + (style.pixelated ? ' pixelated' : '')} style={{ background: backgrounds.get(t.slug) }}></span>
                        <span className="map-swatch-name">{t.name}</span>
                    </button>
                ))}
            </div>
            {ui.tool === 'paint' && <BrushControls slot="paint" />}
            {ui.tool !== 'fill' && <SmartPaint backgrounds={backgrounds} pixelated={!!style.pixelated} />}
            <EdgeChoice
                label="Its edges"
                value={ui.paintEdge}
                mapHint="Leave the edges to the Borders settings on the top bar"
                onChange={(v) => store.setUi({ paintEdge: v })}
            />
            <p className="map-hint">
                {ui.tool === 'fill'
                    ? 'Click to fill the whole connected patch of the terrain under the pointer.'
                    : shape
                        ? 'Drag on the map to draw the shape in this terrain. Escape while dragging drops it. ' + panHint()
                        : 'Drag to paint. ' + brushSizeHint() + panHint()}
            </p>
            </>)}
        </section>
    );
}

/** The brush in filler mode: which terrain's markers it lays down — the
    peaks, flowers or trees alone, over whatever ground is there and on top
    of that ground's own — or rubbing painted ones out. Only the terrains
    with markers in this style are offered. */
function FillerPalette({ style, backgrounds }: { style: MapStyle; backgrounds: Map<string, string> }) {
    const { store, ui, doc } = useMap();
    const offered = TERRAINS.filter((t) => hasFiller(style, t.slug));
    const current = TERRAIN_BY_CODE.get(ui.filler);
    const missing = ui.filler !== '_' && !offered.some((t) => t.code === ui.filler);
    return (
        <>
            <div className="map-swatches">
                <button
                    className={'map-swatch' + (ui.filler === '_' ? ' on' : '')}
                    aria-pressed={ui.filler === '_'}
                    title="Rub painted fillers out"
                    onClick={() => store.setUi({ filler: '_' })}
                >
                    <span className="map-swatch-chip map-filler-none"><i className="fa-solid fa-eraser"></i></span>
                    <span className="map-swatch-name">Rub out</span>
                </button>
                {offered.map((t) => (
                    <button
                        key={t.code}
                        className={'map-swatch' + (ui.filler === t.code ? ' on' : '')}
                        aria-pressed={ui.filler === t.code}
                        title={t.name}
                        onClick={() => store.setUi({ filler: t.code })}
                    >
                        <span className={'map-swatch-chip' + (style.pixelated ? ' pixelated' : '')} style={{ background: backgrounds.get(t.slug) }}></span>
                        <span className="map-swatch-name">{t.name}</span>
                    </button>
                ))}
            </div>
            {ui.tool === 'paint' && <BrushControls slot="paint" />}
            <SmartPaint backgrounds={backgrounds} pixelated={!!style.pixelated} />
            <div className="map-fog-actions">
                <button disabled={!doc.fillers} onClick={() => store.edit((d) => { d.fillers = ''; })}>
                    <i className="fa-solid fa-broom"></i> Clear all fillers
                </button>
            </div>
            <p className="map-hint">
                {missing && current ? current.name + ' has nothing to lay down in this style: pick another. ' : ''}
                {ui.filler === '_'
                    ? 'Drag to rub out the fillers you painted. The terrain\'s own stay. '
                    : 'Drag to add ' + (current?.name ?? 'a terrain') + '\'s fillers — its peaks, trees or flowers — over the ground, '
                        + 'on top of the ones it already has. The ground keeps its colour. '}
                {(ui.tool === 'paint' ? brushSizeHint() : '') + panHint()}
            </p>
        </>
    );
}

/** Where the terrain brush may land. Two switches that combine: a list of
    terrains to leave alone, and a stroke that keeps to the terrain it began
    on — the edge of that patch stops it without anyone tracing it. */
function SmartPaint({ backgrounds, pixelated }: { backgrounds: Map<string, string>; pixelated: boolean }) {
    const { store, ui } = useMap();
    const locked = new Set(ui.lockedTerrains);
    const toggle = (code: string) => store.setUi({
        lockedTerrains: locked.has(code) ? ui.lockedTerrains.filter((c) => c !== code) : [...ui.lockedTerrains, code],
    });
    return (
        <div className="map-smart">
            <label className="map-check">
                <input type="checkbox" checked={ui.stayOnStart} onChange={(e) => store.setUi({ stayOnStart: e.currentTarget.checked })} />
                Stay on the terrain the stroke starts on
            </label>
            <label className="map-check">
                <input type="checkbox" checked={ui.smartPaint} onChange={(e) => store.setUi({ smartPaint: e.currentTarget.checked })} />
                Smart painting: only over the ticked terrains
            </label>
            {ui.smartPaint && (
                <>
                    <div className="map-smart-bar">
                        <button className="map-chip" onClick={() => store.setUi({ lockedTerrains: [] })}>All</button>
                        <button className="map-chip" onClick={() => store.setUi({ lockedTerrains: TERRAINS.map((t) => t.code) })}>None</button>
                    </div>
                    <div className="map-smart-list" role="group" aria-label="Terrains the brush may paint over">
                        {TERRAINS.map((t) => (
                            <button
                                key={t.code}
                                className="map-smart-item"
                                aria-pressed={!locked.has(t.code)}
                                title={t.name}
                                onClick={() => toggle(t.code)}
                            >
                                <i className={'fa-solid ' + (locked.has(t.code) ? 'fa-lock' : 'fa-check')}></i>
                                <span className={'map-swatch-chip' + (pixelated ? ' pixelated' : '')} style={{ background: backgrounds.get(t.slug) }}></span>
                                <span className="map-swatch-name">{t.name}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
            {(ui.smartPaint || ui.stayOnStart) && (
                <p className="map-hint">
                    {ui.stayOnStart ? 'Each stroke covers only the terrain under the point where you pressed, until you let go. ' : ''}
                    {ui.smartPaint ? 'Locked terrains are left as they are. Bare ground counts as the map\'s background terrain.' : ''}
                </p>
            )}
        </div>
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
                        Drag to rub terrain out, painted fillers with it: the map's background{bg ? ' (' + bg.name + ')' : ''} shows through.
                        Change the background on the top bar. {brushSizeHint()}
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

/* ------------------------------------------------------------- fog */

/** The two fog brushes: one lays fog of the chosen colour and strength over
    everything, the other clears it. Neither touches the terrain. */
function FogPalette({ clear }: { clear: boolean }) {
    const { store, ui, doc } = useMap();
    const strength = ui.fogStrength;
    /* The tint over a checkerboard, so its strength reads. */
    const tint = (rgb: [number, number, number]) => {
        const c = `rgba(${rgb.join(',')},${strength / 100})`;
        return `linear-gradient(${c}, ${c}), repeating-conic-gradient(#8a8a8a 0 25%, #d8d8d8 0 50%) 0 0 / 7px 7px`;
    };
    return (
        <section className="map-section map-fog-panel">
            <h3>{clear ? 'Clear fog' : 'Fog of war'}</h3>
            {!clear && (
                <>
                    <div className="map-segmented map-fog-colors" role="group" aria-label="Fog colour">
                        {FOG_COLORS.map((c) => (
                            <button key={c.color} aria-pressed={ui.fogColor === c.color} onClick={() => store.setUi({ fogColor: c.color })}>
                                <span className="map-fog-chip" style={{ background: tint(c.rgb) }}></span>
                                {c.name}
                            </button>
                        ))}
                    </div>
                    <div className="map-row">
                        <label htmlFor="map-fog-strength">Strength</label>
                        <input
                            id="map-fog-strength" type="range" min={5} max={100} step={5}
                            value={strength}
                            onChange={(e) => store.setUi({ fogStrength: Number(e.currentTarget.value) })}
                        />
                        <span className="map-num map-fog-pct">{strength}%</span>
                    </div>
                </>
            )}
            <BrushControls slot={clear ? 'unfog' : 'fog'} />
            <div className="map-fog-actions">
                {!clear && (
                    <button onClick={() => store.edit((d) => { d.fog = fullFog(d, fogValue(ui.fogColor, strength)); })}>
                        <i className="fa-solid fa-smog"></i> Cover the whole map
                    </button>
                )}
                <button disabled={!doc.fog} onClick={() => store.edit((d) => { d.fog = ''; })}>
                    <i className="fa-solid fa-broom"></i> Clear all fog
                </button>
            </div>
            <label className="map-check map-fog-hide">
                <input type="checkbox" checked={ui.fogHidden} onChange={(e) => store.setUi({ fogHidden: e.currentTarget.checked })} />
                Hide the fog while using the other tools
            </label>
            <p className="map-hint">
                {clear
                    ? 'Drag to clear the fog and reveal what is under it. The terrain and everything on it stay as they were.'
                    : 'Drag to lay fog over the map — terrain, landmarks, labels and tokens alike. Painting over fog sets it to this colour and strength. '
                        + brushSizeHint()}
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
                            candidates={landmarkChain(style, l.slug)} icon={l.icon} color={l.color} shape={style.marker}
                            className={'map-tile-art' + (style.pixelated ? ' pixelated' : '')}
                        />
                        <span className="map-tile-name">{l.name}</span>
                    </button>
                ))}
                {!list.length && <p className="map-hint">No landmark matches.</p>}
            </div>
            <p className="map-hint">Click the map to place. {panHint()}</p>
        </section>
    );
}

/** The Paint tool's "One filler": a terrain's markers as single landmarks.
    Pick the terrain, then which of its markers; a click on the map places
    it, and from then on it is moved, sized and turned like any landmark. */
function SingleFillers({ style }: { style: MapStyle }) {
    const { store, ui } = useMap();
    const terrains = fillerTerrains(style);
    const current = terrains.some((t) => t.slug === ui.singleFiller) ? ui.singleFiller : null;
    const pick = (slug: string) => {
        const first = fillerVariants(style, slug)[0] ?? 0;
        store.setUi({ singleFiller: slug, fillerVariant: first });
    };
    return (
        <>
            <div className="map-tiles">
                {terrains.map((t) => {
                    const v = fillerVariants(style, t.slug)[0] ?? 0;
                    const url = fillerUrl(style, t.slug, v);
                    return (
                        <button
                            key={t.slug}
                            className={'map-tile' + (current === t.slug ? ' on' : '')}
                            data-filler={t.slug}
                            aria-pressed={current === t.slug}
                            title={t.name + ': place its fillers one at a time'}
                            onClick={() => pick(t.slug)}
                        >
                            {url && <img src={url} alt="" className={'map-tile-art map-filler-art' + (style.pixelated ? ' pixelated' : '')}
                                style={{ background: style.terrain[t.slug]?.fill }} />}
                            <span className="map-tile-name">{t.name}</span>
                        </button>
                    );
                })}
                {!terrains.length && <p className="map-hint">No terrain has fillers in this style.</p>}
            </div>
            {current && <FillerVariants style={style} terrain={current} value={ui.fillerVariant}
                onPick={(v) => store.setUi({ fillerVariant: v })} />}
            <p className="map-hint">
                Click the map to place one {current ? TERRAINS.find((t) => t.slug === current)?.name.toLowerCase() : ''} filler
                exactly there. Then, with Select, drag its corner to size it, its knob to turn it — or set both in its panel.
                {' ' + panHint()}
            </p>
        </>
    );
}

/** Which of a terrain's markers: a row of them to click. */
function FillerVariants({ style, terrain, value, onPick }: {
    style: MapStyle; terrain: string; value: number; onPick: (v: number) => void;
}) {
    const variants = fillerVariants(style, terrain);
    if (variants.length < 2) return null;
    return (
        <div className="map-field">
            <span>Which one</span>
            <div className="map-filler-variants" role="group" aria-label="Which filler">
                {variants.map((v) => (
                    <button key={v} className="map-filler-variant" data-variant={v} aria-pressed={value === v} onClick={() => onPick(v)}
                        style={{ background: style.terrain[terrain]?.fill }}>
                        <img src={fillerUrl(style, terrain, v) ?? ''} alt="" className={style.pixelated ? 'pixelated' : undefined} />
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------- paths */

function PathPreview({ style, kind }: { style: MapStyle; kind: MapPath['kind'] }) {
    const look = style.paths[kind];
    const w = Math.max(2, 10 * look.widthScale);
    const d = 'M6 20 C 22 4, 38 36, 58 14';
    if (look.taper && look.engraved) {
        const ink = riverInkD([[6, 20], [22, 11], [38, 24], [58, 14]], 3, 10, 1);
        return (
            <svg className="map-path-preview" viewBox="0 0 64 32" width={64} height={32} style={{ background: style.terrain.grassland.fill }}>
                <path d={ink.body} fill={look.color} />
                <path d={ink.shade} fill="none" stroke={look.engraved} strokeOpacity={0.7} strokeWidth={0.6} />
                <path d={ink.banks} fill="none" stroke={look.engraved} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
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
        if (sel.kind === 'sketch') d.sketches = d.sketches.map((o) => (o.id === sel.id ? { ...o, ...patch } as MapSketch : o));
        if (sel.kind === 'placed') d.placed = d.placed.map((o) => (o.id === sel.id ? { ...o, ...patch } as MapPlaced : o));
    }, sel.id + ':' + Object.keys(patch).join(','));
}

/** The ids of the selection, by kind — what every group action filters on. */
function selectedIds(store: MapStore): Record<Selection['kind'], Set<string>> {
    const out = {
        stamp: new Set<string>(), token: new Set<string>(), label: new Set<string>(), path: new Set<string>(), sketch: new Set<string>(),
        placed: new Set<string>(),
    };
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
        d.sketches = d.sketches.filter((o) => !ids.sketch.has(o.id));
        d.placed = d.placed.filter((o) => !ids.placed.has(o.id));
    });
    store.setUi({ selection: [] });
}

/** Copies of everything selected, offset a step, and the copies selected. */
export function duplicateSelection(store: MapStore): void {
    if (!store.ui.selection.length) return;
    const ids = selectedIds(store);
    const off = store.doc.grid.snap ? 1 : 0.6;
    const made: Selection[] = [];
    /* A copied wall is a run of its own. */
    const runs = new Map<string, string>();
    const copy = <T extends { id: string; x: number; y: number }>(list: T[], kind: Selection['kind']): T[] => [
        ...list,
        ...list.filter((o) => ids[kind].has(o.id)).map((o) => {
            const id = uid();
            made.push({ kind, id });
            /* A copy opens nothing: one way in to each city or interior. */
            const copied = { ...o, id, x: o.x + off, y: o.y + off } as T & { link?: string; run?: string };
            delete copied.link;
            if (copied.run) {
                if (!runs.has(copied.run)) runs.set(copied.run, uid());
                copied.run = runs.get(copied.run);
            }
            return copied;
        }),
    ];
    store.edit((d) => {
        d.stamps = copy(d.stamps, 'stamp');
        d.tokens = copy(d.tokens, 'token');
        d.labels = copy(d.labels, 'label');
        d.placed = copy(d.placed, 'placed');
        d.paths = [
            ...d.paths,
            ...d.paths.filter((o) => ids.path.has(o.id)).map((o) => {
                const id = uid();
                made.push({ kind: 'path', id });
                return { ...o, id, points: o.points.map(([x, y]) => [x + off, y + off] as [number, number]) };
            }),
        ];
        d.sketches = [
            ...d.sketches,
            ...d.sketches.filter((o) => ids.sketch.has(o.id)).map((o) => {
                const id = uid();
                made.push({ kind: 'sketch', id });
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
        d.sketches = move(d.sketches, ids.sketch);
        d.placed = move(d.placed, ids.placed);
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
    sketch: ['sketch', 'sketches'], placed: ['building or prop', 'buildings and props'],
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

/** The one run that every selected thing is a piece of, if they all are. */
function runOfSelection(doc: MapDoc, selection: Selection[]): MapPlaced[] | null {
    if (!selection.every((s) => s.kind === 'placed')) return null;
    const ids = new Set(selection.map((s) => s.id));
    const pieces = doc.placed.filter((o) => ids.has(o.id));
    const run = pieces[0]?.run;
    return run && pieces.length === selection.length && pieces.every((o) => o.run === run) ? pieces : null;
}

/** A wall drawn as a run, selected whole: its fields, for every piece at once. */
function RunInspector({ doc, pieces }: { doc: MapDoc; pieces: MapPlaced[] }) {
    const { store } = useMap();
    const first = pieces[0];
    const def = itemOf(first.item);
    const ids = new Set(pieces.map((o) => o.id));
    const set = (patch: Record<string, unknown>) => store.edit((d) => {
        d.placed = d.placed.map((o) => (ids.has(o.id) ? { ...o, ...patch } as MapPlaced : o));
    }, 'run:' + first.run + ':' + Object.keys(patch).join(','));
    return (
        <section className="map-section map-inspector" data-run-inspector={pieces.length}>
            <h3>{def.name}</h3>
            <p className="map-hint">
                {pieces.length} pieces drawn together. Click a piece again to pick just that one — to recolour it, or delete it for a gap.
            </p>
            <PlacedFields doc={doc} p={first} set={set} />
            <GroupActions />
        </section>
    );
}

/** What a landmark opens: a city or an interior of its own (World Builder). */
function InsideSection({ doc, stamp }: { doc: MapDoc; stamp: { id: string; link?: string } }) {
    const { store } = useMap();
    const target = linkedDoc(store.maps, stamp);
    const candidates = linkCandidates(store.maps, doc);
    return (
        <div className="map-inside" data-inside="">
            <div className="map-inside-title"><i className="fa-solid fa-door-open"></i> Inside</div>
            {target ? (
                <>
                    <button className="accent map-inside-open" data-enter="" onClick={() => store.enter(stamp.id)}>
                        <i className={'fa-solid ' + KIND_ICON[target.kind]}></i> Open {target.name || 'it'}
                    </button>
                    <p className="map-hint">Or double-click the landmark. <kbd>Esc</kbd> steps back out to this map.</p>
                </>
            ) : (
                <>
                    <div className="map-inside-create">
                        {childKinds(doc.kind).map((k) => (
                            <button key={k} data-create={k} onClick={() => store.createInside(stamp.id, k)}>
                                <i className={'fa-solid ' + KIND_ICON[k]}></i> Create {k === 'city' ? 'a city' : 'an interior'}
                            </button>
                        ))}
                    </div>
                    <p className="map-hint">A map of its own behind this landmark, opened from here.</p>
                </>
            )}
            {(candidates.length > 0 || target) && (
                <label className="map-field">
                    <span>Opens</span>
                    <select value={target?.id ?? ''} data-link-select="" onChange={(e) => store.linkTo(stamp.id, e.currentTarget.value || null)}>
                        <option value="">Nothing</option>
                        {candidates.map((m) => <option key={m.id} value={m.id}>{KIND_LABEL[m.kind]}: {m.name || 'Untitled'}</option>)}
                        {target && !candidates.some((m) => m.id === target.id) && <option value={target.id}>{target.name || 'Untitled'}</option>}
                    </select>
                </label>
            )}
        </div>
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
        const filler = fillerTerrain(s.landmark);
        const style = styleOf(doc.styleId);
        title = def.name;
        body = (
            <>
                {filler ? (
                    <>
                        <label className="map-field">
                            <span>Filler of</span>
                            <select value={filler} onChange={(e) => {
                                const slug = e.currentTarget.value;
                                set({ landmark: FILLER_PREFIX + slug, variant: fillerVariants(style, slug)[0] ?? 0 });
                            }}>
                                {fillerTerrains(style).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                                {!fillerTerrains(style).some((t) => t.slug === filler) && <option value={filler}>{def.name}</option>}
                            </select>
                        </label>
                        <FillerVariants style={style} terrain={filler} value={s.variant ?? 0} onPick={(v) => set({ variant: v })} />
                    </>
                ) : (
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
                )}
                <label className="map-field">
                    <span>Label</span>
                    <textarea
                        className="map-stamp-label-field"
                        rows={Math.min(8, Math.max(2, (s.label ?? '').split('\n').length))}
                        value={s.label ?? ''}
                        placeholder={'Shown under it.\nEnter starts a new line.'}
                        onChange={(e) => set({ label: e.currentTarget.value })}
                    />
                </label>
                <div className="map-field">
                    <span>Show the label</span>
                    <div className="map-segmented map-label-show" role="group" aria-label="When the label shows">
                        <button aria-pressed={s.labelShow !== 'hover'} onClick={() => set({ labelShow: undefined })}
                            title="The label is always on the map, and in pictures of it">
                            <i className="fa-solid fa-eye"></i> Always
                        </button>
                        <button aria-pressed={s.labelShow === 'hover'} onClick={() => set({ labelShow: 'hover' })}
                            title="The label appears only while the pointer is over the landmark. Pictures of the map (PNG, the table) leave it out">
                            <i className="fa-solid fa-arrow-pointer"></i> On hover
                        </button>
                    </div>
                </div>
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
                {!filler && <InsideSection doc={doc} stamp={s} />}
            </>
        );
    } else if (sel.kind === 'placed') {
        const o = doc.placed.find((x) => x.id === sel.id);
        if (!o) return null;
        const def = itemOf(o.item);
        title = def.name;
        body = (
            <>
                <PlacedFields doc={doc} p={o} set={set} />
                {def.enterable && <InsideSection doc={doc} stamp={o} />}
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
                <LabelTypeEditor label={l} set={set} />
            </>
        );
    } else if (sel.kind === 'sketch') {
        const k = doc.sketches.find((o) => o.id === sel.id);
        if (!k) return null;
        title = 'Sketch';
        body = <SketchFields value={{ ...k, arrow: !!k.arrow }} onChange={(patch) => set(patch)} />;
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
    useHotkeys();
    const style = styleOf(doc.styleId);
    let palette: ReactElement | null = null;
    switch (ui.tool) {
        case 'paint': case 'fill': case 'shape': palette = <TerrainPalette style={style} />; break;
        case 'stamp': palette = <LandmarkPalette style={style} />; break;
        case 'build': palette = doc.kind === 'world' ? null : <BuildPalette />; break;
        case 'room': palette = doc.kind === 'interior' ? <RoomPanel /> : null; break;
        case 'path': palette = <PathPalette style={style} />; break;
        case 'token': palette = <TokenPalette style={style} />; break;
        case 'label': palette = <LabelPalette />; break;
        case 'sketch': palette = <SketchPalette />; break;
        case 'select': palette = !ui.selection.length ? <p className="map-hint map-section">Click something on the map to select it. Drag to move; drag a landmark's corner to resize it or its knob to turn it. Ctrl-click to select several, or drag a box round them.</p> : null; break;
        case 'erase': palette = <ErasePalette />; break;
        case 'edge': palette = <EdgePalette />; break;
        case 'fog': case 'unfog': palette = <FogPalette clear={ui.tool === 'unfog'} />; break;
        case 'pan': palette = <p className="map-hint map-section">Drag to move around the map; the wheel or a pinch zooms. The middle mouse button pans under any tool.</p>; break;
    }
    return (
        <aside className="map-side">
            {palette}
            {ui.selection.length === 1 && <Inspector key={ui.selection[0].kind + ':' + ui.selection[0].id} doc={doc} sel={ui.selection[0]} />}
            {ui.selection.length > 1 && (() => {
                const run = runOfSelection(doc, ui.selection);
                return run ? <RunInspector key={run[0].run} doc={doc} pieces={run} /> : <GroupInspector selection={ui.selection} />;
            })()}
        </aside>
    );
}
