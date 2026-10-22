/* The table itself, once you are in it. */

import { useEffect, useState } from 'react';
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
import { useTour } from '../../lib/tour';
import { GuidedTour, TourButton, useFirstTimeTour } from '../common/Tour';
import { tableSteps } from './tour/steps';
import { TableConfirm } from './TableConfirm';
import type { TableAsk } from './TableConfirm';

export function TableView() {
    const { session, state } = useTable();
    const { status, isHost, hostOnline, pending } = state;
    const map = session.map.view;
    const music = session.music.view;
    const mapOn = map.show && (!!map.url || map.loading !== null || !!map.error);
    /* On a phone the map and the rolls take turns; the map first. */
    const [phoneView, setPhoneView] = useState<'map' | 'rolls'>('map');
    const [ask, setAsk] = useState<TableAsk | null>(null);
    const silenced = !music.unlocked && CHANNELS.some((c) => music.decks[c].playing);
    const tourId = isHost ? 'table-gm' : 'table-player';

    /* A step of the tour may need the other half of a phone's screen. */
    const tourView = useTour().view;
    useEffect(() => { if (tourView === 'map' || tourView === 'rolls') setPhoneView(tourView); }, [tourView]);

    /* First time in this role on this browser: offer the tour. */
    useFirstTimeTour(tourId);

    const connection = status === 'online'
        ? (isHost || hostOnline ? 'live' : 'waiting')
        : status === 'connecting' ? 'connecting' : 'offline';

    /* The name the GM's roster gives me: a name someone else already had
       comes back with a number after it, and rolls carry that one. */
    const shownName = state.members.find((m) => m.id === state.myId)?.name ?? state.myName;

    /* The dice always sit in the right-hand column. The feed joins them there
       while a map takes the middle, and has the middle to itself otherwise. */
    const feed = (
        <div className="feed-scroll" data-tour="feed">
            <RollFeed rolls={state.rolls} myName={shownName} members={state.members} sorted={state.successesFirst} />
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
            <header className="table-bar" data-tour="bar">
                <h1><i className="fa-solid fa-dice"></i> Rolling Table</h1>

                <span className={'conn conn-' + connection}>
                    <i className="fa-solid fa-circle"></i> {CONNECTION_TEXT[connection]}
                </span>

                {isHost && <span className="role-badge"><i className="fa-solid fa-crown"></i> Game Master</span>}

                <div className="bar-spacer"></div>
                <TourButton id={tourId} className="icon-btn" />
                <HomeButton className="icon-btn" />

                {isHost ? (
                    <button className="danger" id="close-table" onClick={() => setAsk({
                        title: 'Close the table?', icon: 'fa-door-closed', ok: 'Close table', danger: true,
                        text: <>
                            This browser forgets the table: the roll history is deleted, and so is the room lock.
                            {' '}Players stay in a table with no GM until they leave.
                            {'\n\n'}To open it again, create it from the same lobby id and password.
                        </>,
                        onOk: () => session.leave(),
                    })}>
                        <i className="fa-solid fa-door-closed"></i> Close table
                    </button>
                ) : (
                    <button className="danger" onClick={() => session.leave()}>
                        <i className="fa-solid fa-right-from-bracket"></i> Leave table
                    </button>
                )}
                <TableConfirm ask={ask} onClose={() => setAsk(null)} />
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
                    <section className="table-center" aria-label="Rolls" data-tour="center">
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

            <GuidedTour
                id={tourId}
                steps={tableSteps(session, isHost ? 'gm' : 'player')}
                intro={isHost
                    ? 'A one-minute tour of the Game Master\u2019s side: the table itself, and how to bring maps from the Map Maker and fights from the GM screen onto it.'
                    : 'A one-minute tour of the table: your character, the dice, the feed and fights.'}
            />
        </div>
    );
}
