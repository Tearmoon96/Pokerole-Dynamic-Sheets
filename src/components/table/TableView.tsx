/* The table itself, once you are in it. */

import { useTable } from '../../table/TableContext';
import { Credentials } from './Credentials';
import { MemberList } from './MemberList';
import { RollControls } from './RollControls';
import { RollFeed } from './RollFeed';
import { HomeButton } from '../common/HomeButton';

export function TableView() {
    const { session, state } = useTable();
    const { status, isHost, hostOnline, pending } = state;

    const connection = status === 'online'
        ? (isHost || hostOnline ? 'live' : 'waiting')
        : status === 'connecting' ? 'connecting' : 'offline';

    const CONNECTION_TEXT: Record<string, string> = {
        live: 'Connected',
        waiting: 'Waiting for the GM',
        connecting: 'Reconnecting…',
        offline: 'Offline',
    };

    return (
        <div className="table-page">
            <header className="table-bar">
                <h1><i className="fa-solid fa-dice"></i> Rolling Table</h1>

                <span className={'conn conn-' + connection}>
                    <i className="fa-solid fa-circle"></i> {CONNECTION_TEXT[connection]}
                </span>

                {isHost && <span className="role-badge"><i className="fa-solid fa-crown"></i> Game Master</span>}

                <div className="bar-spacer"></div>
                <HomeButton className="icon-btn" />

                <button className="danger" onClick={() => session.leave()}>
                    <i className="fa-solid fa-right-from-bracket"></i> Leave table
                </button>
            </header>

            {state.statusDetail && (
                <p className="table-banner">{state.statusDetail}</p>
            )}

            {state.notice && (
                /* Plain text child, never innerHTML — names here come from other
                   people's browsers. */
                <p className="table-notice" role="status">{state.notice}</p>
            )}

            <div className="table-body">
                <aside className="table-side">
                    <Credentials />
                    <MemberList />
                </aside>

                <main className="table-main">
                    <div className="feed-scroll">
                        <RollFeed rolls={state.rolls} myName={state.myName} />
                    </div>

                    {pending.length > 0 && (
                        <div className="pending-strip">
                            {pending.map((p) => (
                                <span key={p.rid} className="pending-chip">
                                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                                    {p.label}
                                    <button
                                        className="icon-btn"
                                        title="Cancel this request"
                                        onClick={() => session.cancelPending(p.rid)}
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <RollControls />

                    {isHost && state.rolls.length > 0 && (
                        <button className="clear-feed" onClick={() => session.clearFeed()}>
                            <i className="fa-solid fa-eraser"></i> Clear the feed for everyone
                        </button>
                    )}
                </main>
            </div>
        </div>
    );
}
