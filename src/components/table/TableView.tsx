/* The table itself, once you are in it. */

import { useState } from 'react';
import { useTable } from '../../table/TableContext';
import { Credentials } from './Credentials';
import { MemberList } from './MemberList';
import { RollControls } from './RollControls';
import { RollFeed } from './RollFeed';
import { HomeButton } from '../common/HomeButton';
import { MapStage } from './MapStage';
import { MapControls } from './MapControls';
import { MusicPanel } from './MusicPanel';
import { CharacterPanel } from './CharacterPanel';
import { TurnStrip } from './TurnStrip';
import { CHANNELS } from '../../table/protocol';

export function TableView() {
    const { session, state } = useTable();
    const { status, isHost, hostOnline, pending } = state;
    const map = session.map.view;
    const music = session.music.view;
    const mapOn = map.show && (!!map.url || map.loading !== null || !!map.error);
    /* On a phone the map and the rolls take turns; the map first. */
    const [phoneView, setPhoneView] = useState<'map' | 'rolls'>('map');
    const silenced = !music.unlocked && CHANNELS.some((c) => music.decks[c].playing);

    const connection = status === 'online'
        ? (isHost || hostOnline ? 'live' : 'waiting')
        : status === 'connecting' ? 'connecting' : 'offline';

    /* The dice always sit in the right-hand column. The feed joins them there
       while a map takes the middle, and has the middle to itself otherwise. */
    const feed = (
        <div className="feed-scroll">
            <RollFeed rolls={state.rolls} myName={state.myName} />
        </div>
    );

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

            {silenced && (
                <p className="table-sound-banner" role="status">
                    <i className="fa-solid fa-music"></i> The GM is playing music.
                    <button className="accent" onClick={() => session.music.unlock()}>
                        <i className="fa-solid fa-volume-high"></i> Enable sound
                    </button>
                </p>
            )}

            {state.notice && (
                /* Plain text child, never innerHTML — names here come from other
                   people's browsers. */
                <p className="table-notice" role="status">{state.notice}</p>
            )}

            {mapOn && (
                <div className="phone-switch" role="tablist" aria-label="Map or table">
                    <button role="tab" aria-selected={phoneView === 'map'} onClick={() => setPhoneView('map')}>
                        <i className="fa-solid fa-map"></i> Map
                    </button>
                    <button role="tab" aria-selected={phoneView === 'rolls'} onClick={() => setPhoneView('rolls')}>
                        <i className="fa-solid fa-dice"></i> Table
                    </button>
                </div>
            )}

            <div className={'table-body' + (mapOn ? ' with-map show-' + phoneView : '')}>
                {/* On a narrow screen the columns stack, and the strip at the
                    head of the middle one would come after every side panel —
                    or go with the map when the map and the rolls take turns.
                    This copy is the one shown there instead, first of all
                    (turns.css). */}
                <div className="turn-slot-narrow"><TurnStrip /></div>
                <aside className="table-side">
                    <Credentials />
                    <MemberList />
                    {!isHost && <CharacterPanel />}
                    {isHost && <MapControls />}
                    <MusicPanel />
                </aside>

                {mapOn ? (
                    <section className="table-stage" aria-label="The shared map">
                        <TurnStrip />
                        <MapStage />
                    </section>
                ) : (
                    <section className="table-center" aria-label="Rolls">
                        <TurnStrip />
                        {feed}
                    </section>
                )}

                <main className="table-main">
                    {mapOn && feed}

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
