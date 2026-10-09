/* The GM's side of the shared maps: every map held, which one is on show,
   and where they come from. Only the active map reaches the players. */

import { useRef } from 'react';
import { useTable } from '../../table/TableContext';
import { MAX_TABLE_MAPS } from '../../table/mapShare';
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
