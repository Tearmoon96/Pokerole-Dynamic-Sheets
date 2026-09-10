/* Creating a table, or joining one.

   Two secrets, and they are not interchangeable. The lobby id says WHICH table
   and pins who the GM is — it is the fingerprint of the host's signing key, so
   it is safe to paste anywhere. The password is what actually keeps strangers
   out, and it never travels in a link. */

import { useEffect, useState } from 'react';
import { useTable } from '../../table/TableContext';
import { LIMITS } from '../../table/protocol';
import { formatLobbyId, normaliseLobbyId } from '../../table/encoding';
import { relayConfigured, relayReachable, usingLocalRelay } from '../../table/relay';

export function JoinScreen() {
    const { session, state } = useTable();
    const [mode, setMode] = useState<'join' | 'create'>('join');
    const [name, setName] = useState('');
    const [lobby, setLobby] = useState('');
    const [password, setPassword] = useState('');
    const [reachable, setReachable] = useState<boolean | null>(null);

    /* A link may name the table. It never carries the password. */
    useEffect(() => {
        const asked = new URLSearchParams(location.search).get('lobby');
        if (asked) {
            const id = normaliseLobbyId(asked);
            if (id.length === 16) {
                setLobby(formatLobbyId(id));
                setMode('join');
            }
        }
    }, []);

    useEffect(() => {
        if (!relayConfigured()) return;
        let live = true;
        void relayReachable().then((ok) => { if (live) setReachable(ok); });
        return () => { live = false; };
    }, []);

    const busy = state.phase === 'joining';

    if (!relayConfigured()) {
        return (
            <div className="join-screen">
                <div className="join-card">
                    <h1>Rolling Table</h1>
                    <p className="setup-warning">
                        <i className="fa-solid fa-triangle-exclamation"></i>{' '}
                        No relay has been set up for this copy yet. The shared table needs a
                        small service to pass messages between browsers — see{' '}
                        <code>worker/README.md</code> in the project, then set{' '}
                        <code>PRODUCTION_RELAY</code> in <code>src/table/relay.ts</code>.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="join-screen">
            <div className="join-card">
                <h1><i className="fa-solid fa-dice"></i> Rolling Table</h1>
                <p className="lede">
                    A shared space for dice. Everyone sees every roll, and the GM's
                    machine throws them all — so no one can quietly improve their own.
                </p>

                {usingLocalRelay() && (
                    <p className="setup-warning local">
                        <i className="fa-solid fa-flask"></i>{' '}
                        Pointed at a local relay for testing. Only browsers on this machine
                        can join.
                    </p>
                )}

                {reachable === false && (
                    <p className="setup-warning">
                        <i className="fa-solid fa-plug-circle-xmark"></i>{' '}
                        The relay is not answering. Check it is deployed and running.
                    </p>
                )}

                <div className="join-tabs">
                    <button
                        className={mode === 'join' ? 'selected' : ''}
                        onClick={() => setMode('join')}
                    >
                        Join a table
                    </button>
                    <button
                        className={mode === 'create' ? 'selected' : ''}
                        onClick={() => setMode('create')}
                    >
                        Start one
                    </button>
                </div>

                <label className="field">
                    <span>Your name</span>
                    <input
                        type="text"
                        maxLength={LIMITS.MAX_NAME}
                        placeholder="Your character's name"
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                    />
                    <em>Use your in-game name — it is what the table sees on every roll.</em>
                </label>

                {mode === 'join' ? (
                    <>
                        <label className="field">
                            <span>Lobby id</span>
                            <input
                                className="mono"
                                type="text"
                                placeholder="K7QM-3XTB-R5WE-2GHD"
                                value={lobby}
                                onChange={(e) => setLobby(e.currentTarget.value)}
                            />
                        </label>
                        <label className="field">
                            <span>Password</span>
                            <input
                                className="mono"
                                type="password"
                                placeholder="the 32-character password the GM sent you"
                                value={password}
                                onChange={(e) => setPassword(e.currentTarget.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void session.joinLobby(lobby, password, name);
                                }}
                            />
                        </label>
                        <button
                            className="accent big"
                            disabled={busy}
                            onClick={() => void session.joinLobby(lobby, password, name)}
                        >
                            {busy ? 'Joining…' : 'Join table'}
                        </button>
                    </>
                ) : (
                    <>
                        <p className="muted">
                            You will be the Game Master: your browser rolls every die at this
                            table. A lobby id and a 32-character password are generated for
                            you to share.
                        </p>
                        <button
                            className="accent big"
                            disabled={busy}
                            onClick={() => void session.createLobby(name)}
                        >
                            {busy ? 'Creating…' : 'Create the table'}
                        </button>
                    </>
                )}

                {state.error && (
                    <p className="join-error" role="alert">
                        <i className="fa-solid fa-circle-exclamation"></i> {state.error}
                    </p>
                )}

                {busy && (
                    <p className="muted">
                        Working out the room key — that takes a moment on purpose.
                    </p>
                )}
            </div>
        </div>
    );
}
