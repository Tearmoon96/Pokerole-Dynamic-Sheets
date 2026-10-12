/* What the tour says, step by step, for the GM and for a player.

   A step points at the first VISIBLE match among its `target` selectors —
   the turn strip is in the DOM twice, one copy hidden per width — and with
   none visible the card stands alone in the middle, or the step is left out
   if it is `optional`. Targets are `data-tour` attributes, never classes, so
   a restyle cannot quietly lose one. A new panel on the table wants an
   attribute and a step here. */

import type { TableSession } from '../../../table/session';
import type { TourStep } from '../../../lib/tour';
import { TourChip as Btn } from '../../common/Tour';

const T = (name: string) => '[data-tour="' + name + '"]';

function mapStatus(session: TableSession) {
    const entries = session.map.view.entries;
    const maker = entries.filter((e) => e.fromMaker).length;
    if (!entries.length) return { ok: false, text: 'No map on the table yet.' };
    const shown = session.map.view.show ? ' One is on show.' : ' None is on show yet: press Show to players.';
    return {
        ok: true,
        text: entries.length + (entries.length === 1 ? ' map' : ' maps') + ' on the table'
            + (maker ? ', ' + maker + ' from the Map Maker' : '') + '.' + shown,
    };
}

function fightStatus(session: TableSession) {
    const { linked, turns } = session.combat.view;
    if (turns) return { ok: true, text: 'On the table: ' + turns.name + '.' };
    if (linked) return { ok: true, text: 'The GM screen is connected. No fight on the table yet.' };
    return { ok: false, text: 'No GM screen open in this browser yet.' };
}

const BAR = [T('bar')];
const FEED = [T('feed')];
const TURNS = [T('turns'), T('center')];

/** The steps for the GM or a player. Rebuilt on each render, so the live
    lines read the session as it is now. */
export function tableSteps(session: TableSession, role: 'gm' | 'player'): TourStep[] {
    return role === 'gm' ? gmSteps(session) : PLAYER;
}

const gmSteps = (session: TableSession): TourStep[] => [
    {
        id: 'welcome',
        title: 'Welcome, Game Master',
        body: <>
            <p>This is your table. <strong>Your browser throws every die</strong>, the players' as well,
                so nobody can quietly improve their own roll.</p>
            <p>Keep this tab open while you play. While it is closed, players' rolls wait in a queue and
                go through the moment you are back.</p>
        </>,
    },
    {
        id: 'invite',
        title: 'Invite your players',
        target: [T('invite')],
        unfold: 'invite',
        body: <>
            <p><Btn icon="fa-paper-plane">Copy the whole invite</Btn> copies the lobby id, the password and a
                link in one go. Paste it in your group chat.</p>
            <p>The password is what keeps strangers out, so send it somewhere private. The link never
                carries it.</p>
        </>,
    },
    {
        id: 'bar',
        title: 'The top bar',
        target: BAR,
        body: <>
            <p>The dot tells you whether you are connected. <Btn icon="fa-circle-question" /> brings this tour
                back at any time.</p>
            <p>Reloading or closing the tab is fine: the page rejoins your table by itself.
                <Btn icon="fa-right-from-bracket">Leave table</Btn> forgets it on this device, so press it only
                when the campaign is done with this table.</p>
        </>,
    },
    {
        id: 'members',
        title: 'Who is at the table',
        target: [T('members')],
        unfold: 'members',
        body: <>
            <p>Everyone who joined, in the colour they picked. The <Btn icon="fa-crown" /> is you.</p>
            <p><Btn icon="fa-user-slash" /> removes someone. While music plays, a dot beside each name says
                whether their sound is in time.</p>
        </>,
    },
    {
        id: 'dice',
        title: 'Rolling dice',
        target: [T('dice')],
        view: 'rolls',
        body: <>
            <p>Pick the dice, how many, and what the roll is for, then press <Btn icon="fa-dice">Roll</Btn>.</p>
            <p>Your three switches: <strong>Hide my rolls</strong> keeps your results on your screen,
                <strong> Scripted result</strong> lets you pick the outcome in advance, and
                <strong> Successes first</strong> sorts a pool in your feed. Hover each for the details.</p>
        </>,
    },
    {
        id: 'feed',
        title: 'The feed',
        target: FEED,
        view: 'rolls',
        body: <>
            <p>Every roll at the table lands here, newest at the top, in the colour of whoever rolled it.
                A roll that just arrived glows for a moment.</p>
            <p>You can clear it for everyone from the button under the dice.</p>
        </>,
    },
    {
        id: 'map',
        title: 'Show a map from the Map Maker',
        target: [T('map-controls')],
        unfold: 'map',
        links: [{ label: 'Open the Map Maker', href: 'map-maker.html', icon: 'fa-map' }],
        status: () => mapStatus(session),
        body: <>
            <ol className="tour-steps">
                <li>Open the <strong>Map Maker</strong> in another tab of <em>this same browser</em>.</li>
                <li>Its toolbar now has a <Btn icon="fa-dice">Table</Btn> button. Choose
                    <Btn icon="fa-camera">Send a snapshot</Btn> for a picture, or
                    <Btn icon="fa-tower-broadcast">Go live</Btn> to keep it in step as you edit.</li>
                <li>Live, your edits wait until you press <Btn icon="fa-rotate">Sync</Btn> (Ctrl+Enter), or
                    tick <strong>Sync automatically</strong>.</li>
                <li>Back here, press <Btn icon="fa-eye">Show to players</Btn> beside the map.</li>
            </ol>
            <p>The fog is always drawn for players. Under <strong>What players see</strong> you can hide
                landmarks, tokens and labels. <Btn icon="fa-image">Use an image…</Btn> puts any picture up instead.</p>
        </>,
    },
    {
        id: 'fight',
        title: 'Run a fight from the GM screen',
        target: TURNS,
        links: [{ label: 'Open the GM screen', href: 'gm-screen.html', icon: 'fa-khanda' }],
        status: () => fightStatus(session),
        body: <>
            <ol className="tour-steps">
                <li>Open the <strong>GM screen</strong> in another tab of <em>this same browser</em>, and its
                    <strong> Combat</strong> panel.</li>
                <li>Add your side from the roster's <strong>Add to combat</strong> buttons.</li>
                <li>Press <Btn icon="fa-tower-broadcast">Show on table</Btn>. The turn order appears here.</li>
                <li>Players press <strong>Roll initiative</strong> on their character, and join your tracker
                    in their colour.</li>
                <li>Press <Btn icon="fa-play">Start turns</Btn>, then <Btn icon="fa-forward">Next turn</Btn>,
                    here or on the GM screen.</li>
            </ol>
            <p>A player's Accuracy, Evasion and Clash rolls light up their row in your tracker.</p>
        </>,
    },
    {
        id: 'music',
        title: 'Music',
        target: [T('music')],
        unfold: 'music',
        body: <>
            <p>Add audio files or YouTube links to your library, then put a track on the
                <strong> Background</strong> or the <strong>Scene</strong> deck and press play. It starts once
                everyone is ready, in time on every device.</p>
            <p>Titles stay hidden from players until you reveal them with the eye.</p>
        </>,
    },
    {
        id: 'done',
        title: 'That is the table',
        body: <p>Have fun. If you forget where something is, <Btn icon="fa-circle-question" /> in the top bar
            plays this tour again.</p>,
    },
];

const PLAYER: TourStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to the table',
        body: <>
            <p>Everyone here sees every roll. <strong>The GM's browser throws all the dice</strong>, yours
                included, so a roll cannot be quietly improved.</p>
            <p>A quick look round takes a minute.</p>
        </>,
    },
    {
        id: 'bar',
        title: 'The top bar',
        target: BAR,
        body: <>
            <p>The dot tells you whether the GM is there. While it says <strong>Waiting for the GM</strong>,
                anything you roll waits in a queue and goes through when they are back.</p>
            <p><Btn icon="fa-circle-question" /> brings this tour back. Reloading is fine, you rejoin by yourself.</p>
        </>,
    },
    {
        id: 'members',
        title: 'Who is at the table',
        target: [T('members')],
        unfold: 'members',
        body: <p>Everyone who joined, in their colour. The <Btn icon="fa-crown" /> marks the GM. Your rolls
            and characters wear your colour too.</p>,
    },
    {
        id: 'character',
        title: 'Your character',
        target: [T('character')],
        unfold: 'character',
        view: 'rolls',
        body: <>
            <p>Your trainer and team, from your Trainer License on this same site in this browser. Or load
                your trainer's <strong>.json</strong> with <Btn icon="fa-file-import" />.</p>
            <p><Btn icon="fa-dice-d6" /> opens the quick rolls. A quick roll sets the dice up for you and
                the Roll button glows: you can still change the count for a modifier before pressing it.</p>
        </>,
    },
    {
        id: 'dice',
        title: 'Rolling dice',
        target: [T('dice')],
        view: 'rolls',
        body: <>
            <p>Pick the dice and how many, say what the roll is for, and press
                <Btn icon="fa-dice">Ask to roll</Btn>.</p>
            <p>The GM's browser throws it and everyone sees the result. A request still on its way shows
                as a small chip you can cancel.</p>
        </>,
    },
    {
        id: 'feed',
        title: 'The feed',
        target: FEED,
        view: 'rolls',
        body: <p>Every roll at the table, newest at the top, in the colour of whoever rolled it. A roll
            that just arrived glows for a moment.</p>,
    },
    {
        id: 'fight',
        title: 'Fights and turns',
        target: TURNS,
        body: <>
            <p>When the GM starts a fight, the turn order appears here.</p>
            <ul className="tour-steps">
                <li>Press <strong>Roll initiative</strong> on your character to join it.</li>
                <li>On your turn, <Btn icon="fa-forward">End turn</Btn> when you are done, or
                    <Btn icon="fa-hourglass-half">Delay</Btn> to act later in the pass.</li>
                <li>The pips under a portrait are the actions taken this Round.</li>
            </ul>
        </>,
    },
    {
        id: 'map',
        title: 'The map',
        target: [T('map-stage')],
        optional: true,
        view: 'map',
        body: <p>The map the GM is showing. Drag to move it, and scroll or pinch to zoom. On a phone the
            <strong> Map</strong> and <strong>Table</strong> tabs switch between the map and the dice.</p>,
    },
    {
        id: 'music',
        title: 'Music',
        target: [T('music')],
        unfold: 'music',
        body: <p>When the GM plays music, press <Btn icon="fa-volume-high">Enable sound</Btn> once:
            browsers stay silent until you do. Your volume only changes it on your device.</p>,
    },
    {
        id: 'done',
        title: 'You are ready',
        body: <p>Have fun. <Btn icon="fa-circle-question" /> in the top bar plays this tour again.</p>,
    },
];

