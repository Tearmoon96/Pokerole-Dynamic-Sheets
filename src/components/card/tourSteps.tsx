/* The Pokémon card's guided tour: a minute, weighted towards what is easy to
   miss — the nickname, shiny and custom art, the social view, pinned and
   reordered moves, the wild sheet's own file. Targets are classes and ids
   this page already has; the tour lights the first visible match
   (components/common/Tour.tsx). Offered only once a Pokémon is on the card. */

import type { TourStep } from '../../lib/tour';
import { TourChip as Btn } from '../common/Tour';

export const CARD_TOUR_INTRO =
    'A one-minute tour of the Pokémon card, including the things that are easy to miss: '
    + 'nicknames, shiny and custom art, pinned moves and the reference tables.';

export const CARD_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: 'The Pokémon card',
        body: <>
            <p>One Pokémon's sheet. Opened from a trainer's team it edits that team member, and the changes
                flow back to the License. Opened on its own it is a wild Pokémon, with a file of its own.</p>
            <p>The banner at the top always says which.</p>
        </>,
    },
    {
        id: 'header',
        title: 'Name, tools and evolution',
        target: ['.pokemon-header'],
        body: <>
            <ul className="tour-steps">
                <li>Click the name to give it a nickname.</li>
                <li><Btn icon="fa-shield" /> <Btn icon="fa-kit-medical" /> <Btn icon="fa-cloud-sun-rain" /> open
                    the type chart, the ailments and the weather rules.</li>
                <li><Btn icon="fa-heart-circle-plus" /> heals fully and clears every status.</li>
                <li><strong>Evolve</strong> keeps every point you trained. <strong>Mega Evolve</strong> can be
                    undone after the fight.</li>
            </ul>
        </>,
    },
    {
        id: 'sprite',
        title: 'Picture, shiny and gender',
        target: ['.sprite-panel'],
        body: <p>The <Btn icon="fa-star" /> marks it shiny and the symbol beside it sets the gender. You can
            upload your own picture for it and resize it to fit.</p>,
    },
    {
        id: 'pools',
        title: 'HP, Will and how it feels',
        target: ['.tracker-panel.pools', '.tracker-panel.condition'],
        union: true,
        body: <p>Step HP and Will up and down here. Under them, loyalty, happiness and disobedience are dots
            you click, and the held item and nature take any name you type, homebrew ones too.</p>,
    },
    {
        id: 'stats',
        title: 'Stats, and the social side',
        target: ['.stats-panel'],
        body: <>
            <p><Btn icon="fa-masks-theater" /> switches between the combat attributes and the social ones
                (Tough, Cool, Beauty, Cute, Clever).</p>
            <p><Btn icon="fa-pen-to-square" /> edits the species' base stats and caps, for a homebrew or an
                unusual specimen.</p>
        </>,
    },
    {
        id: 'skills',
        title: 'Skills',
        target: ['.skills-panel'],
        body: <p>Click the dots to train specialties. The <Btn icon="fa-chevron-up" /> folds the section down to
            only the specialties that have points.</p>,
    },
    {
        id: 'moves',
        title: 'Moves',
        target: ['.moves-panel .moves-head'],
        body: <>
            <ul className="tour-steps">
                <li>Evasion, Clash and Initiative are worked out for you. Pain appears when it is hurt.</li>
                <li><Btn icon="fa-filter" /> filters the learnset by rank, or to the <strong>Pinned</strong> moves
                    only. Pin a move with the <Btn icon="fa-thumbtack" /> on its card.</li>
                <li>Drag moves to reorder them; <Btn icon="fa-rotate-left" /> puts the order back.</li>
                <li><Btn icon="fa-plus" /> adds any move from the full list, and the pencil on a move adjusts its
                    numbers.</li>
            </ul>
        </>,
    },
    {
        id: 'notes',
        title: 'Notes and abilities',
        target: ['.notepad-panel', '.side-details'],
        union: true,
        body: <p>Free notes, with <Btn icon="fa-angles-down" /> to make them taller. Below, its abilities:
            add any ability from the full list if it learned another.</p>,
    },
    {
        id: 'wild',
        title: 'A wild Pokémon’s file',
        target: ['#wild-export-wrap'],
        optional: true,
        body: <p>A wild Pokémon is saved to its own <strong>.json</strong>: <strong>Save</strong> writes it back
            to the same file. Download a copy to <em>capture</em> it on a trainer's License, and
            <Btn icon="fa-layer-group" /> keeps several wild sheets open at once.</p>,
    },
    {
        id: 'done',
        title: 'That is the card',
        body: <p>Hover any number or button for what it means. <Btn icon="fa-circle-question" /> at the top
            plays this tour again.</p>,
    },
];
