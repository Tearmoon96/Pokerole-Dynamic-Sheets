/* The rolling table's sheet watch, seen from the GM screen: a bell in the top
   bar with the count of new warnings, a line for a few seconds when one comes
   in, and the log on a click. It reads what the GM's table tab writes to this
   browser's storage (table/watch.ts), so it needs nothing from that tab but
   the storage event — a hidden table tab writes promptly. Shown only while a
   table this browser hosts has a log: never on a board with no table. */

import { useEffect, useRef, useState } from 'react';
import { LOG_KEY, SEEN_KEY, markSeen, readSeen, readWatchLog, unseenCount } from '../../table/watch';
import type { WatchLog } from '../../table/watch';
import { headline } from '../../table/watchText';
import { WatchList } from '../table/WatchList';

const FLASH_MS = 6000;
const SHOWN = 40;

export function WatchBell() {
    const [log, setLog] = useState<WatchLog | null>(() => readWatchLog());
    const [seen, setSeen] = useState(() => readSeen());
    const [open, setOpen] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    const lastId = useRef<string | null>(log?.log[0]?.id ?? null);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const read = () => {
            const next = readWatchLog();
            setLog(next);
            setSeen(readSeen());
            const top = next?.log[0];
            if (top && top.id !== lastId.current) {
                lastId.current = top.id;
                if (top.warn && !top.ok) setFlash(headline(top));
            }
        };
        const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === LOG_KEY || e.key === SEEN_KEY) read(); };
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', read);
        return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', read); };
    }, []);

    useEffect(() => {
        if (!flash) return;
        const t = window.setTimeout(() => setFlash(null), FLASH_MS);
        return () => clearTimeout(t);
    }, [flash]);

    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
    }, [open]);

    if (!log || !log.log.length) return null;
    const unseen = unseenCount(log.log, seen);

    return (
        <div className="watch-bell" ref={box}>
            <button type="button" className={'icon-btn' + (unseen ? ' lit' : '')} id="watch-bell"
                aria-expanded={open} aria-label={'Sheet watch' + (unseen ? ': ' + unseen + ' new' : '')}
                title="Sheet watch: players' changes at the table"
                onClick={() => { setOpen(!open); setFlash(null); }}>
                <i className="fa-solid fa-user-shield"></i>
                {unseen > 0 && <span className="watch-badge">{unseen}</span>}
            </button>

            {flash && !open && (
                <div className="watch-flash in-bar" role="status" aria-live="polite">
                    <button type="button" onClick={() => { setOpen(true); setFlash(null); }}>
                        <i className="fa-solid fa-user-shield"></i> {flash}
                    </button>
                </div>
            )}

            {open && (
                <div className="watch-pop" data-tt-avoid>
                    <div className="watch-pop-head">
                        <b>Sheet watch</b>
                        <button type="button" className="mini-btn" disabled={!unseen}
                            onClick={() => { markSeen(); setSeen(readSeen()); }}>
                            <i className="fa-solid fa-check-double"></i> Mark seen
                        </button>
                    </div>
                    <div className="watch-scroll">
                        <WatchList entries={log.log.slice(0, SHOWN)} seen={seen} />
                    </div>
                    <p className="muted">Filters, the whole log and Compare are on the table&rsquo;s page.</p>
                </div>
            )}
        </div>
    );
}
