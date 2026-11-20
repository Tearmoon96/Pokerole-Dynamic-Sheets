/* The GM's Sheet watch, in the table's side column: every change players made
   to their own trainers, warnings first in the eye (a yellow count that stays
   on the folded title), and Compare for each player, there or gone. Players
   never see any of it. */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTable } from '../../table/TableContext';
import { colorVars } from '../../table/colors';
import { readSeen } from '../../table/watch';
import { fileStamp, logText, saveText } from '../../table/watchText';
import { FoldTitle, useFold } from './Fold';
import { WatchGroups } from './WatchList';
import type { WatchGroup } from './WatchList';
import { CompareDialog } from './CompareDialog';
import { TableConfirm } from './TableConfirm';
import type { TableAsk } from './TableConfirm';
import type { WatchEntry, WatchPlayer } from '../../table/watch';

const FLASH_MS = 6000;

/** Every trainer a player has brought, with a log or not, then any the log
    still names that is no longer kept. */
function groupLog(players: WatchPlayer[], list: WatchEntry[], who: string): WatchGroup[] {
    const groups: WatchGroup[] = [];
    const by = new Map<string, WatchGroup>();
    const add = (member: string, trainer: string, color?: number) => {
        const key = member + '\u0000' + trainer;
        let g = by.get(key);
        if (!g) { g = { key, member, trainer, color, entries: [] }; by.set(key, g); groups.push(g); }
        return g;
    };
    players.forEach((p) => {
        if (!who || p.member === who) p.trainers.forEach((t) => add(p.member, t.name, p.color));
    });
    list.forEach((e) => add(e.member, e.trainer, e.color).entries.push(e));
    return groups;
}

export function WatchPanel() {
    const { session, state } = useTable();
    const view = session.watch.view;
    const [open, toggle] = useFold('watch');
    const [who, setWho] = useState('');
    const [warnOnly, setWarnOnly] = useState(false);
    const [comparing, setComparing] = useState<string | null>(null);
    const [ask, setAsk] = useState<TableAsk | null>(null);
    const seen = readSeen();

    const list = view.log.filter((e) => (!who || e.member === who) && (!warnOnly || (e.warn && !e.ok)));
    const groups = groupLog(view.players, list, who);
    const online = new Set(state.members.map((m) => m.id));

    return (
        <div className="watch-panel" data-watch>
            <FoldTitle id="watch" open={open} onToggle={toggle} icon="fa-user-shield"
                extra={view.unseen > 0 ? (
                    <span className="watch-badge" title={view.unseen + ' new warning' + (view.unseen === 1 ? '' : 's')}>
                        {view.unseen}
                    </span>
                ) : undefined}>
                Sheet watch
            </FoldTitle>

            {open && (
                <>
                    {view.players.length > 0 && (
                        <ul className="watch-players">
                            {view.players.map((p) => (
                                <li key={p.member} style={colorVars(p.color) as CSSProperties}>
                                    <span className={'watch-online' + (online.has(p.member) ? ' on' : '')}
                                        role="img" aria-label={online.has(p.member) ? 'At the table' : 'Not at the table'}></span>
                                    <span className="watch-who">{p.player}</span>
                                    <span className="watch-trainer">{p.trainers.map((t) => t.name).join(', ')}</span>
                                    <button type="button" className="mini-btn" data-compare={p.member}
                                        onClick={() => setComparing(p.member)}>
                                        <i className="fa-solid fa-scale-balanced"></i> Compare
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="watch-tools">
                        <select value={who} onChange={(e) => setWho(e.currentTarget.value)} aria-label="Whose changes">
                            <option value="">Everyone</option>
                            {view.players.map((p) => <option key={p.member} value={p.member}>{p.player}</option>)}
                        </select>
                        <label className="watch-only">
                            <input type="checkbox" checked={warnOnly} onChange={(e) => setWarnOnly(e.currentTarget.checked)} />
                            Warnings only
                        </label>
                    </div>

                    <div className="watch-actions">
                        <button type="button" className="mini-btn" disabled={!view.unseen} onClick={() => session.watch.seeAll()}>
                            <i className="fa-solid fa-check-double"></i> Mark seen
                        </button>
                        <button type="button" className="mini-btn" disabled={!view.log.length}
                            onClick={() => saveText('sheet-watch-' + fileStamp() + '.txt', logText(view.log))}>
                            <i className="fa-solid fa-file-lines"></i> .txt
                        </button>
                        <button type="button" className="mini-btn" disabled={!view.log.length}
                            onClick={() => saveText('sheet-watch-' + fileStamp() + '.json', JSON.stringify(view.log, null, 1), 'application/json')}>
                            <i className="fa-solid fa-file-code"></i> .json
                        </button>
                        <button type="button" className="mini-btn danger" disabled={!view.log.length}
                            onClick={() => setAsk({
                                title: 'Clear the sheet watch?', icon: 'fa-eraser', ok: 'Clear', danger: true,
                                text: 'Every line of the log goes. The players’ last sheets stay, so Compare still works.',
                                onOk: () => session.watch.clear(),
                            })}>
                            <i className="fa-solid fa-eraser"></i> Clear
                        </button>
                    </div>

                    {groups.length ? (
                        <div className="watch-scroll">
                            <WatchGroups groups={groups} seen={seen} onOk={(id, ok) => session.watch.setOk(id, ok)} />
                        </div>
                    ) : (
                        <p className="muted">
                            {view.log.length
                                ? 'Nothing here with these filters.'
                                : 'Nothing yet. A player’s own trainer shows here when it changes, in a fight or out of one.'}
                        </p>
                    )}
                </>
            )}

            {comparing && <CompareDialog member={comparing} onClose={() => setComparing(null)} />}
            <TableConfirm ask={ask} onClose={() => setAsk(null)} />
        </div>
    );
}

/** A warning just came in: a line at the foot of the screen for a few
    seconds, never in the way and never taking the focus. */
export function WatchFlash() {
    const { session } = useTable();
    const flash = session.watch.view.flash;

    useEffect(() => {
        if (!flash) return;
        const t = window.setTimeout(() => session.watch.flashDone(flash.at), Math.max(0, FLASH_MS - (Date.now() - flash.at)));
        return () => clearTimeout(t);
    }, [flash, session]);

    if (!flash) return null;
    return (
        <div className="watch-flash" role="status" aria-live="polite">
            <button type="button"
                onClick={() => {
                    session.watch.flashDone(flash.at);
                    document.querySelector('[data-watch]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }}>
                <i className="fa-solid fa-user-shield"></i> {flash.text}
            </button>
        </div>
    );
}
