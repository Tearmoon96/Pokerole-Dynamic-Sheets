/* What the GM hands out.

   The password is masked by default. Not because a shoulder-surfer is the real
   threat, but because this panel sits on the screen the GM is most likely to be
   sharing when they explain the tool to their players. */

import { useState } from 'react';
import { useTable } from '../../table/TableContext';
import { formatLobbyId } from '../../table/encoding';
import { copyText } from './copy';
import { FoldTitle, useFold } from './Fold';
import { TableConfirm } from './TableConfirm';
import type { TableAsk } from './TableConfirm';

export function Credentials() {
    const { session, state } = useTable();
    const [shown, setShown] = useState(false);
    const [copied, setCopied] = useState('');
    const [open, toggle] = useFold('invite');
    const [ask, setAsk] = useState<TableAsk | null>(null);

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

    /* The room lock: a warning first, either way, then the session's own
       three seconds before it can be flipped again. */
    const busy = state.lockBusyUntil > 0;
    const others = state.members.filter((m) => !m.host).length;
    const askLock = () => setAsk(state.locked ? {
        title: 'Unlock the room?', icon: 'fa-lock-open', ok: 'Unlock',
        text: <>Anyone with the lobby id and the password will be able to join again.</>,
        onOk: () => session.setLock(false),
    } : {
        title: 'Lock the room?', icon: 'fa-lock', ok: 'Lock',
        text: <>
            {others === 0 ? 'Nobody else is at the table: only you will be able to come back.'
                : others === 1 ? 'Only the player at the table now will be able to come back after a crash or a reload.'
                    : 'Only the ' + others + ' players at the table now will be able to come back after a crash or a reload.'}
            {' '}Anyone else is turned away, even with the password. A player kicked while it is locked stays out.
            {'\n\n'}It does not stop someone who has the password from READING the table: only a new password does that.
        </>,
        onOk: () => session.setLock(true),
        also: { label: 'Lock & change password', onClick: () => void session.changePassword(true) },
    });

    /* A new password moves the table to a new room. Everyone at it follows
       by themselves; the old password stops opening anything after an hour. */
    const askNewPassword = () => setAsk({
        title: 'Change the password?', icon: 'fa-key', ok: 'Change password',
        text: <>
            {others === 0 ? 'Nobody else is at the table yet.'
                : 'The ' + (others === 1 ? 'player' : others + ' players') + ' at the table move to the new password by themselves.'}
            {' '}Someone you removed, who still has the old password, cannot follow and cannot read the table any more.
            {'\n\n'}Players away right now get the new one when they come back within the hour. Anyone else needs the new invite.
            {state.locked ? '' : ' Lock the room as well to keep it to the people at the table.'}
        </>,
        onOk: () => void session.changePassword(false),
    });

    const lockButton = state.isHost && (
        <button
            className={'icon-btn room-lock' + (state.locked ? ' on' : '')}
            aria-pressed={state.locked}
            aria-label={state.locked ? 'Unlock the room' : 'Lock the room'}
            title={(state.locked
                ? 'Room locked: only the people who were at the table when you locked it can come back. Click to unlock.'
                : 'Lock the room: only the people at the table now will be able to come back.')
                + (busy ? '\n(Wait a moment before changing it again.)' : '')}
            disabled={busy}
            onClick={askLock}
        >
            <i className={'fa-solid ' + (state.locked ? 'fa-lock' : 'fa-lock-open')}></i>
        </button>
    );

    return (
        <div className="credentials" data-tour="invite">
            <FoldTitle id="invite" open={open} onToggle={toggle} icon="fa-key" extra={lockButton}>Invite</FoldTitle>
            <TableConfirm ask={ask} onClose={() => setAsk(null)} />

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

                    <button className="wide" id="change-password" disabled={state.moving} onClick={askNewPassword}>
                        <i className={'fa-solid ' + (state.moving ? 'fa-circle-notch fa-spin' : 'fa-rotate')}></i>
                        {state.moving ? ' Moving to the new password…' : ' Change password'}
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
