/* What the GM hands out.

   The password is masked by default. Not because a shoulder-surfer is the real
   threat, but because this panel sits on the screen the GM is most likely to be
   sharing when they explain the tool to their players. */

import { useState } from 'react';
import { useTable } from '../../table/TableContext';
import { formatLobbyId } from '../../table/encoding';
import { copyText } from './copy';

export function Credentials() {
    const { session, state } = useTable();
    const [shown, setShown] = useState(false);
    const [copied, setCopied] = useState('');

    const pretty = formatLobbyId(state.lobbyId);

    const copy = async (what: string, text: string) => {
        const ok = await copyText(text);
        setCopied(ok ? what : '');
        session.notify(ok ? what + ' copied.' : 'Could not reach the clipboard.');
        window.setTimeout(() => setCopied(''), 2000);
    };

    const invite = [
        'Pokerole rolling table',
        'Lobby id: ' + pretty,
        'Password: ' + state.password,
        '',
        location.origin + location.pathname + '?lobby=' + state.lobbyId,
    ].join('\n');

    return (
        <div className="credentials">
            <h2 className="side-title"><i className="fa-solid fa-key"></i> Invite</h2>

            <div className="cred-row">
                <span className="cred-label">Lobby id</span>
                <code className="cred-value">{pretty}</code>
                <button
                    className="icon-btn"
                    title="Copy the lobby id"
                    onClick={() => void copy('Lobby id', state.lobbyId)}
                >
                    <i className={'fa-solid ' + (copied === 'Lobby id' ? 'fa-check' : 'fa-copy')}></i>
                </button>
            </div>

            {state.isHost && (
                <>
                    <div className="cred-row">
                        <span className="cred-label">Password</span>
                        <code className="cred-value secret">
                            {shown ? state.password : '•'.repeat(32)}
                        </code>
                        <button
                            className="icon-btn"
                            title={shown ? 'Hide the password' : 'Show the password'}
                            onClick={() => setShown(!shown)}
                        >
                            <i className={'fa-solid ' + (shown ? 'fa-eye-slash' : 'fa-eye')}></i>
                        </button>
                        <button
                            className="icon-btn"
                            title="Copy the password"
                            onClick={() => void copy('Password', state.password)}
                        >
                            <i className={'fa-solid ' + (copied === 'Password' ? 'fa-check' : 'fa-copy')}></i>
                        </button>
                    </div>

                    <button className="accent wide" onClick={() => void copy('Invite', invite)}>
                        <i className="fa-solid fa-paper-plane"></i> Copy the whole invite
                    </button>

                    <p className="muted">
                        Send the password through something other than a public channel. Anyone
                        who has it can read the table.
                    </p>
                </>
            )}
        </div>
    );
}
