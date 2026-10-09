/* The GM's side of the shared maps: every map held, which one is on show,
   and where they come from. Only the active map reaches the players. */

import { useRef, useState } from 'react';
import { useTable } from '../../table/TableContext';
import { MAX_TABLE_MAPS } from '../../table/mapShare';
import type { MapEntry } from '../../table/mapShare';
import { isHidden } from '../../lib/tableLink';
import type { HideKind } from '../../lib/tableLink';
import { FoldTitle, useFold } from './Fold';

export function MapControls() {
    const { session } = useTable();
    const map = session.map.view;
    const input = useRef<HTMLInputElement>(null);
    const [open, toggle] = useFold('map');
    const full = map.entries.length >= MAX_TABLE_MAPS;

    return (
        <div className="side-panel map-controls">
            <FoldTitle id="map" open={open} onToggle={toggle} icon="fa-map" extra={map.ready && (
                <span className={'map-state ' + (map.show ? 'on' : 'off')}>
                    {map.show ? 'shown' : 'hidden'}
                </span>
            )}>
                {map.entries.length > 1 ? 'Maps (' + map.entries.length + ')' : 'Map'}
            </FoldTitle>

            {open && <>
            {map.ready ? (
                <ul className="map-list">
                    {map.entries.map((e) => (
                        <li key={e.key} className={'map-entry' + (e.active ? ' active' : '')} data-map-entry={e.key}>
                            <img src={e.url} alt="" className="map-thumb" />
                            <div className="map-entry-body">
                                <strong className="map-entry-title">{e.title}</strong>
                                <span className="muted">
                                    {e.active && <span className="map-entry-on">On show · </span>}
                                    {e.w}×{e.h}{e.live ? ' · live' : e.fromMaker ? ' · Map Maker' : ''}
                                </span>
                                <div className="map-buttons">
                                    <button
                                        className={e.active ? '' : 'accent'}
                                        data-map-toggle=""
                                        onClick={() => session.map.activate(e.active ? null : e.key)}
                                    >
                                        <i className={'fa-solid ' + (e.active ? 'fa-eye-slash' : 'fa-eye')}></i>
                                        {e.active ? ' Hide' : map.show ? ' Show this one' : ' Show to players'}
                                    </button>
                                    <button
                                        className="icon-btn danger" title="Take this map off the table"
                                        aria-label={'Remove ' + e.title} onClick={() => session.map.remove(e.key)}
                                    >
                                        <i className="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            {e.live && e.fromMaker && <MapObjects entry={e} />}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="muted">No map on the table.</p>
            )}

            <button onClick={() => input.current?.click()} data-map-image="" disabled={full}>
                <i className="fa-solid fa-image"></i> {map.ready ? 'Add images…' : 'Use an image…'}
            </button>
            <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                    const files = [...(e.currentTarget.files ?? [])];
                    e.currentTarget.value = '';
                    if (files.length) void session.map.useImages(files);
                }}
            />

            {map.loading !== null && (
                <div className="progress" aria-label="Uploading the map">
                    <span style={{ width: Math.round(map.loading * 100) + '%' }}></span>
                </div>
            )}
            {map.error && <p className="warn-text">{map.error}</p>}

            <p className="muted">
                {map.entries.length > 1
                    ? <>Players see only the map on show; the others stay with you, ready to switch to. </>
                    : <>Hold up to {MAX_TABLE_MAPS} maps and choose which one players see. </>}
                From the Map Maker: open it in another tab of this browser. Its <strong>Table</strong> button
                adds the map here as a snapshot, or keeps it live as you edit it. Players only ever see a
                picture with the fog drawn in.
            </p>
            </>}
        </div>
    );
}

const KINDS: { kind: HideKind; label: string; icon: string }[] = [
    { kind: 'stamp', label: 'Landmarks', icon: 'fa-location-dot' },
    { kind: 'token', label: 'Tokens', icon: 'fa-chess-pawn' },
    { kind: 'label', label: 'Labels', icon: 'fa-font' },
];

/* What of a live map players see: its landmarks, tokens and labels, each one
   or a whole kind kept off their picture. The Map Maker draws that picture,
   so a change here has it draw the one players already have again — edits
   not yet synced stay unsent. */
function MapObjects({ entry }: { entry: MapEntry }) {
    const { session } = useTable();
    const [open, setOpen] = useState(false);
    const hide = entry.hide;
    const hiddenCount = entry.objects.filter((o) => isHidden(hide, o.kind, o.id)).length;

    return (
        <div className="map-objects">
            <button
                className="map-objects-toggle" aria-expanded={open} data-map-objects=""
                onClick={() => setOpen((o) => !o)}
            >
                <i className={'fa-solid fa-caret-' + (open ? 'down' : 'right')}></i>
                <i className="fa-solid fa-eye-slash"></i> What players see
                {hiddenCount > 0 && <span className="map-objects-count">{hiddenCount} hidden</span>}
            </button>
            {open && (
                <div className="map-objects-body">
                    {KINDS.map(({ kind, label, icon }) => {
                        const list = entry.objects.filter((o) => o.kind === kind);
                        const all = hide.kinds.includes(kind);
                        return (
                            <div key={kind} className="map-objects-group" data-hide-kind={kind}>
                                <div className="map-objects-head">
                                    <span><i className={'fa-solid ' + icon}></i> {label} <span className="muted">({list.length})</span></span>
                                    <button
                                        className={all ? 'accent' : ''}
                                        aria-pressed={all}
                                        title={all ? 'Players see them again' : 'Keep every one off the players\u2019 picture, ones added later too'}
                                        onClick={() => session.map.setHidden(entry.key, kind, null, !all)}
                                    >
                                        <i className={'fa-solid ' + (all ? 'fa-eye' : 'fa-eye-slash')}></i> {all ? 'Show all' : 'Hide all'}
                                    </button>
                                </div>
                                {list.length > 0 && (
                                    <ul>
                                        {list.map((o) => {
                                            const off = isHidden(hide, kind, o.id);
                                            return (
                                                <li key={o.id} className={off ? 'off' : ''}>
                                                    <button
                                                        className="map-object" aria-pressed={off} disabled={all}
                                                        data-hide-object={o.id}
                                                        onClick={() => session.map.setHidden(entry.key, kind, o.id, !off)}
                                                    >
                                                        <i className={'fa-solid ' + (off ? 'fa-eye-slash' : 'fa-eye')}></i>
                                                        <span className="map-object-name">{o.name}</span>
                                                        {o.fogged && <span className="muted map-object-fog">under fog</span>}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                    <p className="muted">
                        Hidden ones are left out of the picture players get, at once. Anything under full fog
                        is left out anyway. The list follows the map as you sync it.
                    </p>
                </div>
            )}
        </div>
    );
}
