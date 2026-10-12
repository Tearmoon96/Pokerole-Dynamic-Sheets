/* The Map Maker's guided tour: a minute, weighted towards what is easy to
   miss — the mouse and wheel shortcuts, smart painting, borders, fog, a map
   drawn from a description, the hotkey profiles, the rolling table. Targets
   are classes and `data-tool` attributes this page already has. */

import type { TourStep } from '../../lib/tour';
import { TourChip as Btn } from '../common/Tour';

export const MAP_TOUR_INTRO =
    'A one-minute tour of the Map Maker: the tools, the shortcuts that are easy to miss, fog of war, '
    + 'and showing a map to your players.';

export const MAP_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: 'The Map Maker',
        body: <>
            <p>Paint regions, towns and dungeons cell by cell, then dress them with landmarks, paths, labels
                and tokens. Every map keeps itself in this browser as you work.</p>
        </>,
    },
    {
        id: 'maps',
        title: 'Your maps',
        target: ['.map-name-btn'],
        body: <>
            <p>Keep as many maps as you like: this menu opens, creates, renames and duplicates them.</p>
            <p><Btn icon="fa-scroll" /> further along draws a map <strong>from a description</strong>: it gives
                you instructions to paste into a chat assistant, and builds the map from its reply.</p>
        </>,
    },
    {
        id: 'tools',
        title: 'The tools',
        target: ['.map-rail'],
        body: <>
            <p>Terrain, fill, paths, landmarks, tokens, labels and freehand sketches, top to bottom.</p>
            <ul className="tour-steps">
                <li>The wheel zooms. Drag with the <strong>middle mouse button</strong>, or hold
                    <kbd>Space</kbd>, to move around with any tool.</li>
                <li><kbd>Shift</kbd> + wheel makes the brush bigger or smaller.</li>
            </ul>
        </>,
    },
    {
        id: 'side',
        title: 'Brushes and smart painting',
        target: ['.map-side'],
        body: <p>Each tool's options live here: the brush's shape and size, the terrain or landmark to place.
            <strong> Smart painting</strong> paints only over the terrains you tick, and
            <strong> stay on the terrain the stroke starts on</strong> keeps a stroke inside one area, perfect
            for a coastline.</p>,
    },
    {
        id: 'look',
        title: 'The look of the map',
        target: ['.map-styles', '.map-settings'],
        union: true,
        body: <p>Four drawing styles, the background, and the <strong>borders</strong> between terrains: soft
            blends, ink lines or none, chosen per pair of terrains with the <Btn icon="fa-bezier-curve" /> tool.
            Then the grid, snapping, the size in cells and what one cell means.</p>,
    },
    {
        id: 'fog',
        title: 'Fog of war',
        target: ['[data-tool="fog"]', '[data-tool="unfog"]'],
        union: true,
        body: <p><Btn icon="fa-smog" /> paints fog over what the players have not found yet, and
            <Btn icon="fa-wind" /> clears it as they explore. Fog hides landmarks, labels and tokens too, in
            the PNG and at the Rolling Table.</p>,
    },
    {
        id: 'share',
        title: 'Saving and sharing',
        target: ['.session-actions'],
        body: <>
            <ul className="tour-steps">
                <li><Btn icon="fa-image">PNG</Btn> saves a picture; <Btn icon="fa-floppy-disk">Save</Btn> and
                    <Btn icon="fa-bolt">Quick Save</Btn> keep the map in a file.</li>
                <li>With a Rolling Table open in this browser, a <Btn icon="fa-dice">Table</Btn> button appears
                    here: send a snapshot, or go live and sync as you edit.</li>
                <li><Btn icon="fa-keyboard" /> chooses the keyboard shortcuts, left-handed ones included, and lets
                    you set your own.</li>
            </ul>
        </>,
    },
    {
        id: 'done',
        title: 'Happy mapping',
        body: <p>Hover any tool for its name and shortcut. <Btn icon="fa-circle-question" /> in the top bar
            plays this tour again.</p>,
    },
];
