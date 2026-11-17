/* The sheet watch's log as a list: on the GM's table (Sheet watch panel) and
   in the GM screen's bell. Every text in it came from a player's browser, so
   it is rendered as text children only. No table context is read here: the
   GM screen has none. */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { colorVars } from '../../table/colors';
import type { WatchEntry } from '../../table/watch';
import type { Change } from '../../table/watchSheet';
import { KIND_TEXT, clockTime, ctxText } from '../../table/watchText';

const SHOWN = 6;

export function ChangeLine({ c }: { c: Change }) {
    return (
        <li className={'watch-change sev-' + c.sev}>
            {c.sev === 'warn' && <i className="fa-solid fa-triangle-exclamation" aria-label="Warning"></i>}
            {c.who && <span className="watch-char">{c.who}</span>}
            <span className="watch-field">{c.field}</span>
            {(c.from || c.to) && (
                <span className="watch-values">
                    <span className="watch-from">{c.from}</span>
                    <i className="fa-solid fa-arrow-right" aria-label="to"></i>
                    <span className="watch-to">{c.to}</span>
                    {c.delta !== undefined && (
                        <span className={'watch-delta ' + (c.delta > 0 ? 'up' : 'down')}>
                            {(c.delta > 0 ? '+' : '') + c.delta}
                        </span>
                    )}
                </span>
            )}
            {c.why && <em className="watch-why">{c.why}</em>}
        </li>
    );
}

function Changes({ list }: { list: Change[] }) {
    const [all, setAll] = useState(false);
    /* Warnings first, so a long list never hides one under "more". */
    const sorted = [...list].sort((a, b) => Number(b.sev === 'warn') - Number(a.sev === 'warn'));
    const shown = all ? sorted : sorted.slice(0, SHOWN);
    return (
        <>
            <ul className="watch-changes">
                {shown.map((c, i) => <ChangeLine key={i} c={c} />)}
            </ul>
            {sorted.length > SHOWN && (
                <button type="button" className="watch-more" onClick={() => setAll(!all)}>
                    {all ? 'Show fewer' : 'Show all ' + sorted.length}
                </button>
            )}
        </>
    );
}

const KIND_ICON: Record<WatchEntry['kind'], string> = {
    change: 'fa-pen',
    join: 'fa-right-to-bracket',
    left: 'fa-right-from-bracket',
};

export function WatchList({ entries, seen, onOk }: {
    entries: WatchEntry[];
    seen: number;
    /** Marks a warning as fine, or not; absent where the log is read only. */
    onOk?: (id: string, ok: boolean) => void;
}) {
    return (
        <ul className="watch-list">
            {entries.map((e) => {
                const fresh = e.warn && !e.ok && e.at > seen;
                return (
                    <li key={e.id}
                        className={'watch-entry' + (e.warn && !e.ok ? ' warn' : '') + (e.ok ? ' ok' : '') + (fresh ? ' fresh' : '')}
                        style={colorVars(e.color) as CSSProperties}>
                        <div className="watch-head">
                            <i className={'fa-solid ' + KIND_ICON[e.kind]} aria-label={KIND_TEXT[e.kind]}></i>
                            <span className="watch-time">{clockTime(e.at)}</span>
                            <span className="watch-who">{e.player}</span>
                            <span className="watch-trainer">{e.trainer}</span>
                            <span className={'watch-ctx ctx-' + e.ctx}>{ctxText(e)}</span>
                            {onOk && e.warn && (
                                <button type="button" className="mini-btn watch-ok" aria-pressed={!!e.ok}
                                    title={e.ok ? 'Count it as a warning again' : 'It was fine: stop counting it'}
                                    onClick={() => onOk(e.id, !e.ok)}>
                                    {e.ok ? 'Undo' : 'Fine'}
                                </button>
                            )}
                        </div>
                        {e.note && <p className="watch-note">{e.note}</p>}
                        {e.changes.length > 0 && <Changes list={e.changes} />}
                    </li>
                );
            })}
        </ul>
    );
}
