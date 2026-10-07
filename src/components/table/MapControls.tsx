/* The GM's side of the shared map: what is on show, and where it comes from. */

import { useRef } from 'react';
import { useTable } from '../../table/TableContext';
import { FoldTitle, useFold } from './Fold';

export function MapControls() {
    const { session } = useTable();
    const map = session.map.view;
    const input = useRef<HTMLInputElement>(null);
    const [open, toggle] = useFold('map');

    return (
        <div className="side-panel map-controls">
            <FoldTitle id="map" open={open} onToggle={toggle} icon="fa-map" extra={map.ready && (
                <span className={'map-state ' + (map.show ? 'on' : 'off')}>
                    {map.show ? 'shown' : 'hidden'}
                </span>
            )}>
                Map
            </FoldTitle>

            {open && <>
            {map.ready ? (
                <>
                    <div className="map-current">
                        {map.url && <img src={map.url} alt="" className="map-thumb" />}
                        <div className="map-current-text">
                            <strong>{map.title}</strong>
                            <span className="muted">
                                {map.w}×{map.h}{map.live ? ' · live from the Map Maker' : ''}
                            </span>
                        </div>
                    </div>
                    <div className="map-buttons">
                        <button
                            className={map.show ? '' : 'accent'}
                            data-map-toggle=""
                            onClick={() => session.map.setShown(!map.show)}
                        >
                            <i className={'fa-solid ' + (map.show ? 'fa-eye-slash' : 'fa-eye')}></i>
                            {map.show ? ' Hide from players' : ' Show to players'}
                        </button>
                        <button className="icon-btn danger" title="Take this map off the table" onClick={() => session.map.clear()}>
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </>
            ) : (
                <p className="muted">No map on the table.</p>
            )}

            <button onClick={() => input.current?.click()} data-map-image="">
                <i className="fa-solid fa-image"></i> {map.ready ? 'Use another image…' : 'Use an image…'}
            </button>
            <input
                ref={input}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (f) void session.map.useImage(f);
                }}
            />

            {map.loading !== null && (
                <div className="progress" aria-label="Uploading the map">
                    <span style={{ width: Math.round(map.loading * 100) + '%' }}></span>
                </div>
            )}
            {map.error && <p className="warn-text">{map.error}</p>}

            <p className="muted">
                From the Map Maker: open it in another tab of this browser. Its <strong>Table</strong> button
                sends a snapshot here, or keeps the map live as you edit it. Players only ever see a
                picture with the fog drawn in.
            </p>
            </>}
        </div>
    );
}
