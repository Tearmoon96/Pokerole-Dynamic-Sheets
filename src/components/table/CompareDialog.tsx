/* The GM's Compare: a player's own trainer, as their browser last sent it,
   beside the GM's copy of it in the GM screen's roster. Read only — nothing
   is written to either sheet; the GM decides what to do about a difference.
   Mounted only while open (a role="dialog" in the DOM tells the tours one is
   up). */

import { useEffect, useState } from 'react';
import { useTable } from '../../table/TableContext';
import { gmTrainers } from '../../table/watch';
import { clockTime, comparisonText, fileStamp, saveText } from '../../table/watchText';
import { ChangeLine } from './WatchList';
import type { Change } from '../../table/watchSheet';

export function CompareDialog({ member, onClose }: { member: string; onClose: () => void }) {
    const { session } = useTable();
    const [tid, setTid] = useState<string | undefined>(undefined);
    const [, bump] = useState(0);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const player = session.watch.view.players.find((p) => p.member === member);
    const c = session.watch.compare(member, tid);
    const roster = gmTrainers();
    const warns = c ? c.changes.filter((x) => x.sev === 'warn').length : 0;

    /* Grouped by character, in the order they come (trainer, team, boxes). */
    const groups: { who: string; list: Change[] }[] = [];
    for (const ch of c?.changes ?? []) {
        const g = groups.find((x) => x.who === ch.who);
        if (g) g.list.push(ch); else groups.push({ who: ch.who, list: [ch] });
    }

    return (
        <div className="gm-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="gm-dialog compare-dialog" role="dialog" aria-label="Compare sheets" id="compare-dialog">
                <div className="gm-dialog-title">
                    <i className="fa-solid fa-scale-balanced"></i>
                    <span>Compare: {player?.player ?? 'player'}</span>
                </div>

                {!c ? (
                    <p className="gm-dialog-text">
                        No sheet from this player yet. It comes by itself a few seconds after they join
                        (they need the latest version of the site).
                    </p>
                ) : (
                    <>
                        <div className="compare-pick">
                            {player && player.trainers.length > 1 && (
                                <label>
                                    <span>Their trainer</span>
                                    <select value={c.tid} onChange={(e) => setTid(e.currentTarget.value)}>
                                        {player.trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </label>
                            )}
                            <label>
                                <span>Your sheet</span>
                                <select value={c.gm?.id ?? ''} data-compare-gm
                                    onChange={(e) => { session.watch.pick(member, c.tid, e.currentTarget.value || null); bump((n) => n + 1); }}>
                                    <option value="">— none —</option>
                                    {roster.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </label>
                        </div>

                        <p className="compare-meta">
                            Their copy of <b>{c.trainer}</b>, as sent at {clockTime(c.at)}.
                            {c.by === 'id' && ' Matched to yours by the trainer’s id.'}
                            {c.by === 'name' && ' Matched to yours by name.'}
                        </p>

                        {!c.gm ? (
                            <p className="gm-dialog-text">
                                None of your trainers matches it. Pick yours above: it is remembered for this
                                player.
                            </p>
                        ) : !c.changes.length ? (
                            <p className="compare-same"><i className="fa-solid fa-circle-check"></i> Same as your sheet.</p>
                        ) : (
                            <>
                                <p className="compare-meta">
                                    {c.changes.length} difference{c.changes.length === 1 ? '' : 's'}, from your sheet to
                                    theirs{warns ? '; ' + warns + ' in their favour' : ''}.
                                </p>
                                <div className="compare-scroll">
                                    {groups.map((g) => (
                                        <section key={g.who} className="compare-group">
                                            <h3>{g.who}</h3>
                                            <ul className="watch-changes">
                                                {g.list.map((ch, i) => <ChangeLine key={i} c={{ ...ch, who: '' }} />)}
                                            </ul>
                                        </section>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                <div className="gm-dialog-actions">
                    {c && (
                        <button onClick={() => saveText('compare-' + (c.player || 'player') + '-' + fileStamp() + '.txt', comparisonText(c))}>
                            <i className="fa-solid fa-file-arrow-down"></i> Save as text
                        </button>
                    )}
                    <button onClick={() => bump((n) => n + 1)} title="Compare again with the latest copies">
                        <i className="fa-solid fa-rotate"></i> Refresh
                    </button>
                    <button className="go" autoFocus onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
