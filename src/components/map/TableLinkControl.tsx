import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Popover } from './Popover';
import { useGmConfirm } from '../gm/ConfirmDialog';
import { keyHint } from '../../map/hotkeys';
import { HOLD_MS } from '../../map/tableLive';
import type { LiveState, TableLiveLink } from '../../map/tableLive';

/* The Map Maker's button for the rolling table, and the bar that says what
   live is doing. Both only appear while a table this browser hosts is open —
   see src/map/tableLive.ts for what live will and will not send. */

export function useTableLive(link: TableLiveLink): LiveState {
    useSyncExternalStore(link.subscribe, link.getSnapshot, link.getSnapshot);
    return link.state;
}

const pct = (v: number) => Math.round(v * 100) + '%';

export function TableLinkControl({ link }: { link: TableLiveLink }) {
    const s = useTableLive(link);
    const confirm = useGmConfirm();
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);

    if (!s.connected && s.mode === 'off') return null;

    const goLive = async () => {
        if (link.needsFogWarning()) {
            const ok = await confirm({
                icon: 'fa-eye', danger: true, confirmLabel: 'Go live anyway',
                title: 'This map has no fog of war',
                text: 'Every player will see the whole map, and every change you make to it. '
                    + 'Paint fog over what they have not found yet first, or go live if they may see it all.',
            });
            if (!ok) return;
        }
        await link.goLive();
    };

    const label = s.mode === 'live' ? 'Live' : s.mode === 'paused' ? 'Paused' : s.mode === 'held' ? 'Held' : 'Table';
    const icon = s.mode === 'live' ? 'fa-tower-broadcast' : s.mode === 'paused' ? 'fa-pause' : s.mode === 'held' ? 'fa-hand' : 'fa-dice';

    return (
        <>
            <button
                ref={anchor}
                className={'icon-btn map-table-btn mode-' + s.mode}
                aria-expanded={open}
                data-table-link=""
                title="Show this map at the rolling table"
                onClick={() => setOpen((o) => !o)}
            >
                <i className={'fa-solid ' + icon}></i><span className="map-btn-text"> {label}</span>
            </button>
            <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} className="map-table-pop">
                <div className="map-popover-title">Rolling table</div>
                <p className="map-hint">
                    {s.connected
                        ? <>Connected to your table <strong>{s.table}</strong>.</>
                        : 'The table is not open any more.'}
                </p>

                {s.mode === 'off' ? (
                    <div className="map-table-actions">
                        <button disabled={!s.connected || s.busy} onClick={() => { void link.snapshot(); }}>
                            <i className="fa-solid fa-camera"></i> Send a snapshot
                        </button>
                        <button className="accent" disabled={!s.connected || s.busy} onClick={() => { void goLive(); }}>
                            <i className="fa-solid fa-tower-broadcast"></i> Go live
                        </button>
                    </div>
                ) : (
                    <div className="map-table-actions">
                        {s.mode === 'live' && (
                            <button onClick={() => link.pause()} title={'Pause live' + keyHint('table-live')}>
                                <i className="fa-solid fa-pause"></i> Pause
                            </button>
                        )}
                        {s.mode === 'paused' && (
                            <button className="accent" onClick={() => link.resume()} title={'Resume live' + keyHint('table-live')}>
                                <i className="fa-solid fa-play"></i> Resume
                            </button>
                        )}
                        <button className="danger" onClick={() => link.stop()}>
                            <i className="fa-solid fa-stop"></i> Stop live
                        </button>
                    </div>
                )}

                {s.connected && !s.shown && (
                    <p className="map-hint map-warn" data-table-hidden="">
                        The map is hidden at the table: players see what you send once you press
                        <strong> Show to players</strong> there.
                    </p>
                )}

                {s.mode !== 'off' && (
                    <p className="map-hint">
                        Live follows <strong>{s.mapName || 'this map'}</strong>. A change reaches the table
                        {' '}{HOLD_MS / 1000} seconds after you stop editing; undo before then and nothing is sent.
                    </p>
                )}

                <label className="map-field">
                    <span>Hold an update that uncovers more than {pct(s.threshold)} of the map</span>
                    <input
                        type="range" min={1} max={50} step={1}
                        value={Math.round(s.threshold * 100)}
                        onChange={(e) => link.setThreshold(Number(e.currentTarget.value) / 100)}
                    />
                </label>

                {s.lastUrl && (
                    <figure className="map-table-preview">
                        <img src={s.lastUrl} alt="What the players were last sent" />
                        <figcaption>
                            What players see{s.lastAt ? ' · sent ' + new Date(s.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </figcaption>
                    </figure>
                )}

                <p className="map-hint">
                    Players get a picture, never the map itself: the fog is always drawn, and anything
                    under full fog is left out.
                </p>
                {s.busy && <p className="map-hint"><i className="fa-solid fa-circle-notch fa-spin"></i> Sending…</p>}
                {s.error && <p className="map-hint map-warn">{s.error}</p>}
            </Popover>
        </>
    );
}

/** The strip under the top bar while live is not simply running: the held
    update waiting for a decision, or why live is paused. */
export function TableLiveBanner({ link }: { link: TableLiveLink }) {
    const s = useTableLive(link);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!s.dueAt) return;
        const t = window.setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, [s.dueAt]);

    if (s.mode === 'held' && s.held) {
        return (
            <div className="map-live-banner held" role="alert" data-live-banner="held">
                <i className="fa-solid fa-hand"></i>
                <span>
                    {s.held.clearedAll
                        ? 'This update clears ALL the fog: players would see the whole map.'
                        : 'This update uncovers ' + pct(s.held.revealed) + ' of the map at once.'}
                    {' '}It has not been sent.
                </span>
                <button className="danger" onClick={() => { void link.publishHeld(); }}>
                    <i className="fa-solid fa-eye"></i> Show it to the players
                </button>
                <button className="accent" onClick={() => link.discardHeld()}>
                    <i className="fa-solid fa-ban"></i> Don't send
                </button>
            </div>
        );
    }

    if (s.mode === 'paused') {
        return (
            <div className="map-live-banner paused" data-live-banner="paused">
                <i className="fa-solid fa-pause"></i>
                <span>{s.why || 'Live is paused.'}</span>
                <button className="accent" onClick={() => link.resume()}><i className="fa-solid fa-play"></i> Resume</button>
                <button onClick={() => link.stop()}><i className="fa-solid fa-stop"></i> Stop live</button>
            </div>
        );
    }

    if (s.mode === 'live') {
        const left = s.dueAt ? Math.max(0, Math.ceil((s.dueAt - now) / 1000)) : 0;
        return (
            <div className="map-live-banner live" data-live-banner="live">
                <span className="map-live-dot"></span>
                <span>
                    LIVE at the table: <strong>{s.mapName || 'this map'}</strong>
                    {s.busy ? ' · sending…' : s.dueAt ? ' · update in ' + left + ' s' : ''}
                </span>
                <button onClick={() => link.pause()} title={'Pause live' + keyHint('table-live')}>
                    <i className="fa-solid fa-pause"></i> Pause
                </button>
            </div>
        );
    }

    return null;
}
