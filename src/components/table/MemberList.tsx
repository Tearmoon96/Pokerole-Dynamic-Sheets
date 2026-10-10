/* Who is at the table.

   The roster is published by the host and accepted from nobody else, so the
   crown next to a name is not decoration — it is the one member whose key
   matches the lobby id. */

import { useTable } from '../../table/TableContext';
import { CHANNELS } from '../../table/protocol';
import { FoldTitle, useFold } from './Fold';
import type { MemberMusic } from '../../table/music/music';
import { colorVars } from '../../table/colors';

/** The GM's view of one player's music: in time, catching up, or silent. */
function syncDot(stat: MemberMusic | undefined, playing: boolean): { cls: string; text: string } | null {
    if (!playing) return null;
    if (!stat || Date.now() - stat.at > 20_000) return { cls: 'unknown', text: 'No music report yet' };
    if (!stat.unlocked) return { cls: 'bad', text: 'Sound not enabled' };
    if (stat.stall.length) return { cls: 'bad', text: 'Cannot play right now (loading or buffering)' };
    const drifts = [stat.drift.bg, stat.drift.scene].filter((d): d is number => d !== null).map(Math.abs);
    if (!drifts.length) return { cls: 'unknown', text: 'Not playing yet' };
    const worst = Math.max(...drifts);
    if (worst < 50) return { cls: 'good', text: 'Music in sync (±' + worst + ' ms)' };
    if (worst < 250) return { cls: 'fair', text: 'Music catching up (' + worst + ' ms off)' };
    return { cls: 'bad', text: 'Music out of step (' + worst + ' ms off)' };
}

export function MemberList() {
    const { session, state } = useTable();
    const { members, myId, isHost } = state;
    const music = session.music.view;
    const playing = isHost && CHANNELS.some((c) => music.decks[c].playing);
    const [open, toggle] = useFold('members');

    return (
        <div className="member-list">
            <FoldTitle id="members" open={open} onToggle={toggle} icon="fa-users"
                extra={<span className="count">{members.length}</span>}>
                At the table
            </FoldTitle>

            {open && !members.length && <p className="muted">Waiting for the roster…</p>}

            {open && <ul>
                {members.map((m) => (
                    <li key={m.id} className={m.id === myId ? 'me' : ''} style={colorVars(m.color) as React.CSSProperties}>
                        <span className="who">
                            <span className="member-avatar" aria-hidden="true">
                                {(m.name.trim()[0] || '?').toUpperCase()}
                            </span>
                            {m.host && (
                                <i className="fa-solid fa-crown host-mark" title="Game Master — rolls the dice"></i>
                            )}
                            {m.name}
                            {m.id === myId && <span className="you">you</span>}
                        </span>
                        {!m.host && (() => {
                            const dot = syncDot(music.members[m.id], playing);
                            return dot && (
                                <span className={'sync-dot ' + dot.cls} role="img" aria-label={dot.text} title={dot.text}></span>
                            );
                        })()}
                        {isHost && !m.host && (
                            <button
                                className="icon-btn danger"
                                title={'Remove ' + m.name + ' from the table'}
                                onClick={() => session.kick(m.id)}
                            >
                                <i className="fa-solid fa-user-slash"></i>
                            </button>
                        )}
                    </li>
                ))}
            </ul>}

            {open && isHost && members.length > 1 && (
                <p className="muted">
                    Removing someone disconnects them, but the password is what really
                    guards the table — change it by starting a new lobby.
                </p>
            )}
        </div>
    );
}
