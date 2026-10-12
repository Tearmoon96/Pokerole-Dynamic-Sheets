/* The GM screen's guided tour: a minute across the board, weighted towards
   what is easy to miss — rearranging the board, the License link, Shift on
   the pool steps, the generator's Keep, a second fight. Panels are found by
   their `data-panel-kind`; on a phone each step's `view` is the tab to show
   (GmApp switches to it). */

import type { TourStep } from '../../lib/tour';
import { TourChip as Btn } from '../common/Tour';

export const GM_TOUR_INTRO =
    'A one-minute tour of the GM screen: the board, your roster, fights, the dice and the Pokémon '
    + 'generator, and the shortcuts that are easy to miss.';

const panel = (kind: string) => '[data-panel-kind="' + kind + '"]';

export const GM_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: 'Your GM screen',
        body: <>
            <p>A board of panels for running a session. It keeps itself in this browser as you work.</p>
            <p>A minute's look round, and the tricks that are easy to miss.</p>
        </>,
    },
    {
        id: 'bar',
        title: 'The top bar',
        target: ['.topbar'],
        body: <>
            <ul className="tour-steps">
                <li>The icons beside the title switch whole panels on and off.</li>
                <li><Btn icon="fa-floppy-disk">Save</Btn> keeps the whole session in a file, and
                    <Btn icon="fa-bolt">Quick Save</Btn> overwrites that file with no questions.
                    <Btn icon="fa-folder-open">Load</Btn> brings one back.</li>
                <li><Btn icon="fa-table-columns">Reset tabs</Btn> gives every panel its normal width.</li>
            </ul>
        </>,
    },
    {
        id: 'arrange',
        title: 'Arrange the board',
        target: ['.panel .panel-head'],
        body: <p>Hold <Btn icon="fa-grip-vertical" /> and drag to move a panel, and drag a panel's right edge to
            make it wider or narrower. On a phone the panels are tabs instead.</p>,
    },
    {
        id: 'roster',
        title: 'Trainers and wild Pokémon',
        target: [panel('roster')],
        view: 'roster',
        body: <>
            <ul className="tour-steps">
                <li><Btn icon="fa-id-card">From License</Btn> brings in every trainer open in the Trainer License
                    in this browser, and stays in step with it. <Btn icon="fa-folder-open">Load</Btn> takes
                    .json files.</li>
                <li>HP and Will: <kbd>Shift</kbd>-click a step to move it by 5. Click a status chip to cycle it.</li>
                <li><Btn icon="fa-list-ul" /> on a Pokémon shows its moves, with Accuracy and damage ready to roll.</li>
                <li>Group the roster into folders with <Btn icon="fa-folder-plus" />.</li>
            </ul>
        </>,
    },
    {
        id: 'combat',
        title: 'Fights',
        target: [panel('combat')],
        view: 'combat',
        body: <>
            <ul className="tour-steps">
                <li>Add combatants from the roster, roll each one's initiative, then
                    <Btn icon="fa-arrow-down-wide-short" /> sorts them.</li>
                <li><Btn icon="fa-play">Start turns</Btn> hands out turns and counts actions;
                    <Btn icon="fa-forward-step" /> starts a new round.</li>
                <li><Btn icon="fa-plus" /> opens a second fight beside this one, and
                    <Btn icon="fa-tower-broadcast" /> shows a fight to your players on the Rolling Table.</li>
            </ul>
        </>,
    },
    {
        id: 'dice',
        title: 'Dice',
        target: [panel('dice')],
        view: 'dice',
        body: <p>Roll any pool and keep a history. <strong>Successes first</strong> sorts a pool so you can
            count at a glance.</p>,
    },
    {
        id: 'generator',
        title: 'The Pokémon generator',
        target: [panel('generator')],
        view: 'generator',
        body: <>
            <p>Rolls a wild Pokémon by rank, habitat, type and more, with its points spent and its moves picked.</p>
            <p><Btn icon="fa-check" /> keeps it on the roster as a wild, <Btn icon="fa-rotate" /> rerolls it, and
                <Btn icon="fa-download" /> saves it as a file a player can capture.</p>
        </>,
    },
    {
        id: 'npc',
        title: 'Names and notes',
        target: [panel('npc'), panel('notes')],
        view: 'npc',
        body: <p><strong>NPC Names</strong> suggests names by region, with a nature if you want one.
            <strong> Notes</strong> holds your session notes, in folders.</p>,
    },
    {
        id: 'done',
        title: 'That is the board',
        body: <p>Hover any button for a hint. <Btn icon="fa-circle-question" /> in the top bar plays this tour
            again.</p>,
    },
];
