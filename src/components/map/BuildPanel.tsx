import { useState } from 'react';
import { useMap } from '../../map/MapContext';
import { ITEMS, groupOf, groupsFor, itemOf } from '../../map/world/catalog';
import type { ItemGroup } from '../../map/world/catalog';
import { ColorField } from './ColorField';
import { clashes, colorsOf, itemThumb, variantOf } from '../../map/world/placed';
import { panHint } from '../../map/hotkeys';
import type { FloorFinish, MapDoc, MapPlaced, MapRoom, WallFinish } from '../../map/types';
import { FLOORS, WALLS, crossings, defaultRoom, finishThumb, presetShape } from '../../map/world/room';

/* The Build tool's side panel (cities and interiors): the catalogue, drawn in
   the city's own look, and the fields of a placed building or prop. */

export function BuildPalette() {
    const { store, ui, doc } = useMap();
    const [group, setGroup] = useState<ItemGroup | 'all'>('all');
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    /* A city offers buildings, nature and the street; an interior, furniture. */
    const groups = groupsFor(doc.kind);
    const offered = new Set(groups.map((g) => g.key));
    const g = group !== 'all' && offered.has(group) ? group : 'all';
    /* Cities have a Modern and a Medieval set; things of neither fit both. */
    const eras = doc.kind !== 'interior';
    const era = eras ? ui.buildEra : 'all';
    const list = ITEMS.filter((d) => offered.has(groupOf(d, doc.kind)) && (g === 'all' || groupOf(d, doc.kind) === g) && (!q || d.name.toLowerCase().includes(q))
        && (era === 'all' || !d.era || d.era === era));
    const current = itemOf(ui.buildItem);
    const variant = variantOf(current, ui.buildVariant);
    return (
        <section className="map-section" data-build-palette="">
            <h3>{doc.kind === 'interior' ? 'Furnish' : 'Build'}</h3>
            {eras && (
                <div className="map-segmented map-build-era" role="group" aria-label="Which town's buildings">
                    {([['all', 'All', 'fa-border-all'], ['modern', 'Modern', 'fa-city'], ['medieval', 'Medieval', 'fa-chess-rook']] as const).map(([k, label, icon]) => (
                        <button key={k} aria-pressed={era === k} data-build-era={k} onClick={() => store.setUi({ buildEra: k })}>
                            <i className={'fa-solid ' + icon}></i> {label}
                        </button>
                    ))}
                </div>
            )}
            <div className="map-build-current" data-build-current={current.slug}>
                <div className="map-build-current-head">
                    <img className="map-build-current-art" src={itemThumb(current.slug, doc.look, 64, variant)} alt="" draggable={false} />
                    <div>
                        <strong>{current.name}</strong>
                        {current.variants && <span className="map-hint"> · {current.variants[variant].name}</span>}
                    </div>
                </div>
                {current.variants && (
                    <div className="map-variants" role="group" aria-label="Variant">
                        {current.variants.map((v, i) => (
                            <button key={i} className={'map-variant' + (i === variant ? ' on' : '')} aria-pressed={i === variant} data-variant={i}
                                title={v.name} onClick={() => store.setUi({ buildVariant: i, tool: 'build' })}>
                                <img src={itemThumb(current.slug, doc.look, 48, i)} alt="" draggable={false} />
                                <span>{v.name}</span>
                            </button>
                        ))}
                    </div>
                )}
                <div className="map-field-row">
                    {current.turned && (
                        <button className="map-chip" aria-pressed={!!ui.buildRot} data-build-turn=""
                            onClick={() => store.setUi({ buildRot: ui.buildRot ? undefined : 1 })}
                            title="Place it turned a quarter: running up and down the map">
                            <i className="fa-solid fa-rotate-right"></i> Turned
                        </button>
                    )}
                    <button className="map-chip" aria-pressed={ui.buildFlip} data-build-flip=""
                        onClick={() => store.setUi({ buildFlip: !ui.buildFlip })} title="Place it mirrored left to right">
                        <i className="fa-solid fa-left-right"></i> Mirrored
                    </button>
                </div>
            </div>
            <div className="map-chips">
                <button className="map-chip" aria-pressed={g === 'all'} onClick={() => setGroup('all')}>All</button>
                {groups.map((x) => (
                    <button key={x.key} className="map-chip" aria-pressed={g === x.key} onClick={() => setGroup(x.key)}>{x.label}</button>
                ))}
            </div>
            <input
                type="text" className="map-search" placeholder="Search buildings and props…" value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <div className="map-tiles map-build-tiles">
                {list.map((d) => (
                    <button
                        key={d.slug}
                        className={'map-tile' + (ui.buildItem === d.slug ? ' on' : '')}
                        aria-pressed={ui.buildItem === d.slug}
                        data-item={d.slug}
                        title={d.name + ' — stands on ' + d.w + '×' + d.h + (d.w * d.h === 1 ? ' cell' : ' cells')}
                        onClick={() => store.setUi({ buildItem: d.slug, buildRot: undefined, buildVariant: 0, tool: 'build' })}
                    >
                        <img className="map-tile-art map-build-thumb" src={itemThumb(d.slug, doc.look)} alt="" draggable={false} />
                        <span className="map-tile-name">{d.name}</span>
                        {d.variants && <span className="map-tile-count" title={d.variants.length + ' variants'}>{d.variants.length}</span>}
                    </button>
                ))}
                {!list.length && <p className="map-hint">Nothing matches.</p>}
            </div>
            <p className="map-hint">
                Click the map to build. The dashed outline is the ground it stands on; it turns red over
                something else, which is allowed. Things nearer the bottom of the map stand in front. {panHint()}
            </p>
        </section>
    );
}

/** The inspector's fields for a placed building or prop. */
export function PlacedFields({ doc, p, set }: {
    doc: MapDoc; p: MapPlaced; set: (patch: Record<string, unknown>) => void;
}) {
    const def = itemOf(p.item);
    const colors = colorsOf(p);
    const skip = def.variants?.[variantOf(def, p.variant)]?.skip ?? [];
    const custom = !!p.colors?.some((c) => c);
    return (
        <>
            <label className="map-field">
                <span>What it is</span>
                <select value={p.item} onChange={(e) => set({ item: e.currentTarget.value, colors: undefined, rot: undefined, variant: undefined })}>
                    {groupsFor(doc.kind).map((g) => (
                        <optgroup key={g.key} label={g.label}>
                            {ITEMS.filter((d) => groupOf(d, doc.kind) === g.key).map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
                        </optgroup>
                    ))}
                    {!groupsFor(doc.kind).some((g) => g.key === groupOf(def, doc.kind)) && <option value={p.item}>{def.name}</option>}
                </select>
            </label>
            {def.variants && (
                <div className="map-field" data-placed-variants="">
                    <span>Variant</span>
                    <div className="map-variants" role="group" aria-label="Variant">
                        {def.variants.map((v, i) => (
                            <button key={i} className={'map-variant' + (i === variantOf(def, p.variant) ? ' on' : '')} aria-pressed={i === variantOf(def, p.variant)}
                                data-variant={i} title={v.name} onClick={() => set({ variant: i || undefined })}>
                                <img src={itemThumb(p.item, doc.look, 48, i)} alt="" draggable={false} />
                                <span>{v.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <label className="map-field">
                <span>Label</span>
                <textarea
                    className="map-stamp-label-field"
                    rows={Math.min(6, Math.max(2, (p.label ?? '').split('\n').length))}
                    value={p.label ?? ''}
                    placeholder={'Shown under it.\nEnter starts a new line.'}
                    onChange={(e) => set({ label: e.currentTarget.value })}
                />
            </label>
            {p.label && (
                <div className="map-field">
                    <span>Show the label</span>
                    <div className="map-segmented map-label-show" role="group" aria-label="When the label shows">
                        <button aria-pressed={p.labelShow !== 'hover'} onClick={() => set({ labelShow: undefined })}>
                            <i className="fa-solid fa-eye"></i> Always
                        </button>
                        <button aria-pressed={p.labelShow === 'hover'} onClick={() => set({ labelShow: 'hover' })}
                            title="Only while the pointer is over it. Pictures of the map (PNG, the table) leave it out">
                            <i className="fa-solid fa-arrow-pointer"></i> On hover
                        </button>
                    </div>
                </div>
            )}
            <div className="map-field" data-placed-colors="">
                <span>Colours</span>
                <div className="map-placed-colors">
                    {def.colors.map((slot, i) => !skip.includes(i) && (
                        <span key={slot.name} className="map-placed-color">
                            <ColorField
                                value={colors[i]} label={slot.name + ' colour'} data-color-slot={i}
                                onChange={(hex) => {
                                    const next = def.colors.map((_, k) => p.colors?.[k] || '');
                                    next[i] = hex;
                                    set({ colors: next });
                                }}
                            />
                            <span>{slot.name}</span>
                        </span>
                    ))}
                    {custom && (
                        <button className="map-chip" onClick={() => set({ colors: undefined })} title="Back to the catalogue's colours">
                            <i className="fa-solid fa-rotate-left"></i> Reset
                        </button>
                    )}
                </div>
            </div>
            <div className="map-field-row">
                <label className="map-check">
                    <input type="checkbox" checked={!!p.flip} onChange={(e) => set({ flip: e.currentTarget.checked || undefined })} /> Mirror
                </label>
                {def.turned && (
                    <label className="map-check">
                        <input type="checkbox" checked={!!p.rot} onChange={(e) => set({ rot: e.currentTarget.checked ? 1 : undefined })} /> Turned
                    </label>
                )}
            </div>
            {clashes(doc, p) && (
                <p className="map-hint map-warn" data-placed-clash="">
                    <i className="fa-solid fa-triangle-exclamation"></i> Its ground overlaps something else, or runs off the map.
                    That is allowed; move it if it was not meant.
                </p>
            )}
        </>
    );
}

/** The Room tool's panel (interiors), in four modes: the outline and what
    holds for the whole room; walls drawn inside; floors painted; wallpaper
    pasted piece by piece. */
export function RoomPanel() {
    const { store, ui, doc } = useMap();
    const room = doc.room;
    if (!room) {
        return (
            <section className="map-section" data-room-panel="">
                <h3>Room</h3>
                <p className="map-hint">This interior has no walls yet. Add them, then drag the corners to the shape of the house.</p>
                <button className="accent" data-room-add-walls="" onClick={() => store.edit((d) => { d.room = defaultRoom(d.cols, d.rows); })}>
                    <i className="fa-solid fa-vector-square"></i> Add walls
                </button>
            </section>
        );
    }
    const modes = [
        ['shape', 'Outline', 'fa-vector-square', 'The shape of the house, and what holds for the whole room'],
        ['walls', 'Walls', 'fa-grip-lines-vertical', 'Draw walls inside: rooms, corridors, a garden fence'],
        ['floor', 'Floors', 'fa-fill-drip', 'Paint floors room by room, or cell by cell'],
        ['wallpaper', 'Wallpaper', 'fa-paint-roller', 'Paper single walls, or every wall of one room'],
    ] as const;
    return (
        <section className="map-section" data-room-panel="">
            <h3>Room</h3>
            <div className="map-segmented map-room-modes" role="group" aria-label="What the Room tool does" data-room-modes="">
                {modes.map(([k, label, icon, hint]) => (
                    <button key={k} aria-pressed={ui.roomMode === k} data-room-mode={k} title={hint} onClick={() => store.setUi({ roomMode: k })}>
                        <i className={'fa-solid ' + icon}></i> {label}
                    </button>
                ))}
            </div>
            {ui.roomMode === 'shape' && <RoomOutlineFields room={room} />}
            {ui.roomMode === 'walls' && <RoomWallsFields room={room} />}
            {ui.roomMode === 'floor' && <RoomFloorFields />}
            {ui.roomMode === 'wallpaper' && <RoomWallpaperFields />}
        </section>
    );
}

function RoomOutlineFields({ room }: { room: MapRoom }) {
    const { store, doc } = useMap();
    const set = (patch: Partial<MapRoom>, coalesce?: string) => store.edit((d) => { if (d.room) d.room = { ...d.room, ...patch }; }, coalesce);
    const shapes = [['rect', 'Rectangle'], ['L', 'L'], ['T', 'T'], ['U', 'U'], ['plus', 'Cross']] as const;
    return (
        <>
            <p className="map-hint">
                Drag a corner to move it; drag a <b>+</b> on a wall to add a corner there; double-click a corner to remove it.
                Only the walls with the room below them stand up, as in a 3/4 view. Walls cannot cross.
            </p>
            {crossings(room.pts) > 0 && (
                <p className="map-hint map-warn" data-room-tangled="">
                    <i className="fa-solid fa-triangle-exclamation"></i> Some walls cross each other. Drag a corner to untangle
                    them, or start again from a shape below.
                </p>
            )}
            <div className="map-field">
                <span>Start from</span>
                <div className="map-chips" data-room-shapes="">
                    {shapes.map(([k, label]) => (
                        <button key={k} className="map-chip" data-room-shape={k} onClick={() => set({ pts: presetShape(k, doc.cols, doc.rows) })}>{label}</button>
                    ))}
                </div>
            </div>
            <div className="map-field">
                <span>Wall height</span>
                <div className="map-segmented" role="group" aria-label="Wall height" data-room-wallh="">
                    {[1, 2, 3, 4].map((h) => (
                        <button key={h} aria-pressed={room.wallH === h} onClick={() => set({ wallH: h })}>{h} {h === 1 ? 'cell' : 'cells'}</button>
                    ))}
                </div>
            </div>
            <label className="map-field">
                <span>Floor</span>
                <div className="map-field-row">
                    <select value={room.floor} data-room-floor="" onChange={(e) => {
                        const f = FLOORS.find((x) => x.id === e.currentTarget.value)!;
                        set({ floor: f.id, floorColor: f.color });
                    }}>
                        {FLOORS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <ColorField value={room.floorColor} label="Floor colour" data-room-floor-color="" onChange={(hex) => set({ floorColor: hex }, 'room-floor-color')} />
                </div>
            </label>
            <label className="map-field">
                <span>Walls</span>
                <div className="map-field-row">
                    <select value={room.wall} data-room-wall="" onChange={(e) => {
                        const w = WALLS.find((x) => x.id === e.currentTarget.value)!;
                        set({ wall: w.id, wallColor: w.color });
                    }}>
                        {WALLS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <ColorField value={room.wallColor} label="Wall colour" data-room-wall-color="" onChange={(hex) => set({ wallColor: hex }, 'room-wall-color')} />
                </div>
            </label>
            <div className="map-field">
                <span>Wall tops and skirting</span>
                <ColorField value={room.trim} label="Wall tops and skirting colour" className="wide" data-room-trim="" onChange={(hex) => set({ trim: hex }, 'room-trim')} />
            </div>
            <label className="map-field">
                <span>Outside the walls</span>
                <div className="map-field-row">
                    <select value={room.outside?.kind ?? ''} data-room-outside="" onChange={(e) => {
                        const v = e.currentTarget.value;
                        const f = FLOORS.find((x) => x.id === v);
                        set({ outside: f ? { kind: f.id, color: f.color } : undefined });
                    }}>
                        <option value="">Nothing (dark)</option>
                        <optgroup label="Outdoors">
                            {FLOORS.filter((f) => f.outdoor).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </optgroup>
                        <optgroup label="Indoors">
                            {FLOORS.filter((f) => !f.outdoor).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </optgroup>
                    </select>
                    {room.outside && (
                        <ColorField value={room.outside.color} label="Outside colour" data-room-outside-color=""
                            onChange={(hex) => set({ outside: { ...room.outside!, color: hex } }, 'room-outside-color')} />
                    )}
                </div>
            </label>
            <p className="map-hint">A ground outside (a lawn, a yard) can be walked, furnished and fenced: a garden round the house.</p>
            <button className="map-chip" data-room-remove="" onClick={() => store.edit((d) => { delete d.room; })}>
                <i className="fa-solid fa-trash-can"></i> Remove the walls
            </button>
        </>
    );
}

function RoomWallsFields({ room }: { room: MapRoom }) {
    const { store, ui } = useMap();
    const count = room.walls?.length ?? 0;
    return (
        <>
            <div className="map-segmented" role="group" aria-label="Draw or rub out walls" data-room-erase="">
                <button aria-pressed={!ui.roomErase} onClick={() => store.setUi({ roomErase: false })}><i className="fa-solid fa-pen"></i> Draw</button>
                <button aria-pressed={ui.roomErase} onClick={() => store.setUi({ roomErase: true })}><i className="fa-solid fa-eraser"></i> Rub out</button>
            </div>
            <p className="map-hint">
                Walls run along the grid lines. Click near a line for one piece of wall; hold the button and drag to
                draw a run of them. Leave a gap for a doorway. A wall running across stands up over the room below it.
            </p>
            <p className="map-hint">Hedges and fences are wallpapers: paint them on in Wallpaper.</p>
            {count > 0 && (
                <button className="map-chip" data-room-clear-walls="" onClick={() => store.edit((d) => {
                    if (!d.room) return;
                    const next = { ...d.room };
                    delete next.walls;
                    d.room = next;
                })}>
                    <i className="fa-solid fa-trash-can"></i> Remove every inner wall ({count})
                </button>
            )}
        </>
    );
}

function FillOrBrush({ fillLabel, brushLabel, sizes }: { fillLabel: string; brushLabel: string; sizes?: boolean }) {
    const { store, ui } = useMap();
    return (
        <>
            <div className="map-segmented" role="group" aria-label="Paint under the pointer or fill a whole room" data-room-fill="">
                <button aria-pressed={!ui.roomFill} onClick={() => store.setUi({ roomFill: false })}><i className="fa-solid fa-paintbrush"></i> {brushLabel}</button>
                <button aria-pressed={ui.roomFill} onClick={() => store.setUi({ roomFill: true })}><i className="fa-solid fa-fill-drip"></i> {fillLabel}</button>
            </div>
            {sizes && !ui.roomFill && (
                <div className="map-field">
                    <span>Brush</span>
                    <div className="map-segmented" role="group" aria-label="Brush size" data-room-brush="">
                        {[1, 2, 3].map((n) => (
                            <button key={n} aria-pressed={ui.roomBrush === n} onClick={() => store.setUi({ roomBrush: n })}>{n}×{n}</button>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

/** A grid of floors or wallpapers drawn in the room's look, the room's
    own first, and a colour for the one picked. */
function FinishPicker({ what }: { what: 'floor' | 'wall' }) {
    const { store, ui, doc } = useMap();
    const list = what === 'floor' ? FLOORS : WALLS;
    const cur = what === 'floor' ? ui.roomFloor : ui.roomWall;
    const pick = (f: { kind: string; color: string } | null) =>
        store.setUi(what === 'floor' ? { roomFloor: f as FloorFinish | null } : { roomWall: f as WallFinish | null });
    const tile = (d: (typeof list)[number]) => (
        <button key={d.id} className={'map-tile' + (cur?.kind === d.id ? ' on' : '')} aria-pressed={cur?.kind === d.id}
            data-room-finish={d.id} title={d.name}
            onClick={() => pick({ kind: d.id, color: cur?.kind === d.id ? cur.color : d.color })}>
            <img className="map-tile-art map-finish-art" src={finishThumb(what, d.id, cur?.kind === d.id ? cur.color : d.color, doc.look)} alt="" draggable={false} />
            <span className="map-tile-name">{d.name}</span>
        </button>
    );
    return (
        <>
            <div className="map-field-row map-finish-current">
                <button className="map-chip" aria-pressed={!cur} data-room-finish="own" onClick={() => pick(null)}
                    title={what === 'floor' ? 'Put back the room’s own floor' : 'Put back the room’s own wallpaper'}>
                    <i className="fa-solid fa-rotate-left"></i> {what === 'floor' ? 'Room’s own floor' : 'Room’s own walls'}
                </button>
                {cur && (
                    <ColorField value={cur.color} label={what === 'floor' ? 'Floor colour' : 'Wallpaper colour'} data-room-finish-color=""
                        onChange={(hex) => pick({ ...cur, color: hex })} />
                )}
            </div>
            <div className="map-field"><span>Indoors</span></div>
            <div className="map-tiles map-finish-tiles">{list.filter((d) => !d.outdoor).map(tile)}</div>
            <div className="map-field"><span>Outdoors</span></div>
            <div className="map-tiles map-finish-tiles">{list.filter((d) => d.outdoor).map(tile)}</div>
        </>
    );
}

function RoomFloorFields() {
    return (
        <>
            <FillOrBrush brushLabel="Brush" fillLabel="Whole room" sizes />
            <p className="map-hint">
                Paint over the floor, or fill a whole room at once: the fill stops at walls. Grass, soil and water
                make gardens and ponds.
            </p>
            <FinishPicker what="floor" />
        </>
    );
}

function RoomWallpaperFields() {
    return (
        <>
            <FillOrBrush brushLabel="One piece" fillLabel="Whole room" />
            <p className="map-hint">
                Click a wall (its face or its top) to paper that piece; drag along a wall for more. Whole room: click a
                floor to paper every wall around it.
            </p>
            <FinishPicker what="wall" />
        </>
    );
}
