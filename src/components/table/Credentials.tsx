/* What the GM hands out.

   The password is masked by default. Not because a shoulder-surfer is the real
   threat, but because this panel sits on the screen the GM is most likely to be
   sharing when they explain the tool to their players. */

import { useState } from 'react';
import { useTable } from '../../table/TableContext';
import { formatLobbyId } from '../../table/encoding';
import { copyText } from './copy';
import { FoldTitle, useFold } from './Fold';

export function Credentials() {
    const { session, state } = useTable();
    const [shown, setShown] = useState(false);
    const [copied, setCopied] = useState('');
    const [open, toggle] = useFold('invite');

    const pretty = formatLobbyId(state.lobbyId);

    /* A copy that worked says so on the button itself — a brief glow and a
       tick — so only a failure needs a notice. */
    const copy = async (button: HTMLElement, what: string, text: string) => {
        const ok = await copyText(text);
        setCopied(ok ? what : '');
        if (ok) flash(button);
        else session.notify('Could not reach the clipboard.');
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
            <FoldTitle id="invite" open={open} onToggle={toggle} icon="fa-key">Invite</FoldTitle>

            {open && <div className="cred-row">
                <span className="cred-label">Lobby id</span>
                <code className="cred-value">{pretty}</code>
                <button
                    className="icon-btn"
                    title="Copy the lobby id"
                    onClick={(e) => void copy(e.currentTarget, 'Lobby id', state.lobbyId)}
                >
                    <i className={'fa-solid ' + (copied === 'Lobby id' ? 'fa-check' : 'fa-copy')}></i>
                </button>
            </div>}

            {open && state.isHost && (
                <>
                    <div className="cred-row">
                        <span className="cred-label">Password</span>
                        <code className={'cred-value secret' + (shown ? '' : ' masked')}>
                            {shown ? state.password : '•'.repeat(12)}
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
                            onClick={(e) => void copy(e.currentTarget, 'Password', state.password)}
                        >
                            <i className={'fa-solid ' + (copied === 'Password' ? 'fa-check' : 'fa-copy')}></i>
                        </button>
                    </div>

                    <button className="accent wide" onClick={(e) => void copy(e.currentTarget, 'Invite', invite)}>
                        <i className={'fa-solid ' + (copied === 'Invite' ? 'fa-check' : 'fa-paper-plane')}></i> Copy the whole invite
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

/** Restarts the glow even on a second click while the first is still fading. */
function flash(el: HTMLElement): void {
    el.classList.remove('copy-flash');
    void el.offsetWidth;
    el.classList.add('copy-flash');
    el.addEventListener('animationend', () => el.classList.remove('copy-flash'), { once: true });
}
