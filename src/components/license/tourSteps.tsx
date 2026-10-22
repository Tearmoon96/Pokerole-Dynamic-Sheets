/* The Trainer License's guided tour: a minute, weighted towards what is easy
   to miss — the equipment on the photo, the coin purse, PC storage, the extra
   tracks. Targets are ids and classes this page already has; the tour lights
   the first visible match (components/common/Tour.tsx). */

import type { TourStep } from '../../lib/tour';
import { TourChip as Btn } from '../common/Tour';

export const LICENSE_TOUR_INTRO =
    'A one-minute tour of the Trainer’s License, including the things that are easy to miss: '
    + 'equipment, coins, PC storage and saving your trainer.';

export const LICENSE_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: 'Your Trainer’s License',
        body: <>
            <p>Everything on this sheet is typed straight in, and this browser keeps it as you go.</p>
            <p>A short look at the parts that are easy to miss.</p>
        </>,
    },
    {
        id: 'tools',
        title: 'Saving your trainer',
        target: ['.license-tools'],
        body: <>
            <p>Trainers live as <strong>.json</strong> files in a folder of your choice.</p>
            <ul className="tour-steps">
                <li><Btn icon="fa-folder-open" /> opens that folder and loads <em>every</em> trainer in it. With
                    more than one, arrows at the screen's edges switch between them.</li>
                <li><Btn icon="fa-floppy-disk" /> saves them all back. It glows while something is unsaved.</li>
                <li><Btn icon="fa-download" /> downloads a backup, <Btn icon="fa-file-circle-plus" /> starts a new trainer.</li>
                <li><Btn icon="fa-palette" /> changes the sheet's colours, <Btn icon="fa-circle-info" /> explains all this in detail.</li>
            </ul>
        </>,
    },
    {
        id: 'photo',
        title: 'Photo and equipment',
        target: ['#photo-arch'],
        body: <>
            <p>Click the arch to add a photo, then <Btn icon="fa-up-right-and-down-left-from-center" /> to resize and
                move it.</p>
            <p><Btn icon="fa-shield-halved">Equipment</Btn> opens the gear your trainer wears and carries:
                armour, clothes, weapons, tools. Handy for a classic fantasy or a mixed campaign. Pick from a catalogue
                of hundreds of illustrated items.</p>
        </>,
    },
    {
        id: 'money',
        title: 'Money or coins',
        target: ['.money-field'],
        union: true,
        body: <>
            <p>The two symbols at the end of the money field switch the currency: <Btn>₽</Btn> for Pokédollars,
                <Btn icon="fa-coins" /> for copper, silver and gold.</p>
            <p>Each keeps its own amounts, so switching back and forth never converts or loses anything.</p>
        </>,
    },
    {
        id: 'extra',
        title: 'Your own specialties, and badges',
        target: ['.extra-panel', '.badge-case'],
        union: true,
        body: <>
            <p>Under the skills, <strong>Extra</strong> holds tracks you name yourself: a homebrew skill,
                a trade, anything your campaign needs. Add a row with <Btn icon="fa-plus" />.</p>
            <p>Click a slot in the badge case to award a badge and pick its type.</p>
        </>,
    },
    {
        id: 'team',
        title: 'Team and PC storage',
        target: ['.team-capture-row', '#team-grid'],
        union: true,
        body: <>
            <ul className="tour-steps">
                <li>Click an empty slot to choose a Pokémon. A Pokémon's name opens its <strong>card</strong> in a
                    new tab, and its sprite sets the picture's size and position.</li>
                <li><Btn icon="fa-hand-sparkles">Capture Wild Pokémon</Btn> brings in a wild Pokémon saved from its
                    card or the GM screen.</li>
                <li><Btn icon="fa-box-archive">PC Storage</Btn> has six boxes you can rename. Drag Pokémon between
                    team and boxes; double-click one to open its card.</li>
            </ul>
        </>,
    },
    {
        id: 'bag',
        title: 'Bag',
        target: ['[data-tour="bag"]'],
        body: <>
            <p>Click <strong>Out of battle</strong> or <strong>In battle</strong> to add an item: pick it from
                the list, or type a name of your own and press Enter.</p>
            <p>Items in the bag have <Btn icon="fa-minus" /> to use one and <Btn icon="fa-plus" /> to add one.
                The <strong>Healing Item</strong> value works itself out from Clever + Medicine.</p>
        </>,
    },
    {
        id: 'manual',
        title: 'Cards and the rulebook',
        target: ['.license-footer'],
        body: <>
            <p><Btn icon="fa-paw">Open a Pokémon card</Btn> opens any Pokémon's sheet.</p>
            <p><Btn icon="fa-book">Open Pokerole Manual</Btn> jumps to a page of the Core Book. Point it once
                at the folder with your PDFs, and add your own bookmarks.</p>
        </>,
    },
    {
        id: 'done',
        title: 'That is the License',
        body: <p>Hover any button for a hint. <Btn icon="fa-circle-question" /> at the top of the sheet plays
            this tour again.</p>,
    },
];
