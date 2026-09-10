/* Who is at the table.

   The roster is published by the host and accepted from nobody else, so the
   crown next to a name is not decoration — it is the one member whose key
   matches the lobby id. */

import { useTable } from '../../table/TableContext';

export function MemberList() {
    const { session, state } = useTable();
    const { members, myId, isHost } = state;

    return (
        <div className="member-list">
            <h2 className="side-title">
                <i className="fa-solid fa-users"></i> At the table
                <span className="count">{members.length}</span>
            </h2>

            {!members.length && <p className="muted">Waiting for the roster…</p>}

            <ul>
                {members.map((m) => (
                    <li key={m.id} className={m.id === myId ? 'me' : ''}>
                        <span className="who">
                            {m.host && (
                                <i className="fa-solid fa-crown host-mark" title="Game Master — rolls the dice"></i>
                            )}
                            {m.name}
                            {m.id === myId && <span className="you">you</span>}
                        </span>
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
            </ul>

            {isHost && members.length > 1 && (
                <p className="muted">
                    Removing someone disconnects them, but the password is what really
                    guards the table — change it by starting a new lobby.
                </p>
            )}
        </div>
    );
}
