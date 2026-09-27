import { useMap } from '../../map/MapContext';
import { comboLabel, keyHint, useHotkeys } from '../../map/hotkeys';
import type { Tool } from '../../map/types';

/* The column of tools down the left edge, with zoom under them. Undo and redo
   are on the top bar, beside the style picker. The keys in the hints come from
   the active hotkey profile. */

export const TOOLS: { tool: Tool; icon: string; name: string }[] = [
    { tool: 'select', icon: 'fa-arrow-pointer', name: 'Select and move' },
    { tool: 'pan', icon: 'fa-hand', name: 'Pan' },
    { tool: 'paint', icon: 'fa-paintbrush', name: 'Paint terrain' },
    { tool: 'fill', icon: 'fa-fill-drip', name: 'Fill an area' },
    { tool: 'path', icon: 'fa-route', name: 'Draw a path' },
    { tool: 'stamp', icon: 'fa-mountain-city', name: 'Place a landmark' },
    { tool: 'token', icon: 'fa-chess-pawn', name: 'Place a token' },
    { tool: 'label', icon: 'fa-font', name: 'Add a label' },
    { tool: 'erase', icon: 'fa-eraser', name: 'Eraser: rub out terrain, or remove objects' },
    { tool: 'edge', icon: 'fa-bezier-curve', name: 'Borders: choose how the edges between terrains look' },
];

export function ToolRail() {
    const { store, ui } = useMap();
    const { active } = useHotkeys();
    const hold = (active.bindings['pan-hold'] || [])[0];
    const panExtra = ' — or drag with the middle mouse button' + (hold ? ', or hold ' + comboLabel(hold) : '');
    const zoom = (factor: number) => window.dispatchEvent(new CustomEvent('map-zoom', { detail: factor }));
    return (
        <nav className="map-rail" aria-label="Tools">
            {TOOLS.map((t) => (
                <button
                    key={t.tool}
                    className="icon-btn map-tool"
                    data-tool={t.tool}
                    aria-pressed={ui.tool === t.tool}
                    title={t.name + keyHint(('tool:' + t.tool) as `tool:${Tool}`) + (t.tool === 'pan' ? panExtra : '')}
                    onClick={() => store.setUi({ tool: t.tool })}
                >
                    <i className={'fa-solid ' + t.icon}></i>
                </button>
            ))}
            <span className="map-rail-sep"></span>
            <button className="icon-btn map-tool" title={'Zoom in' + keyHint('zoom-in')} onClick={() => zoom(1.25)}>
                <i className="fa-solid fa-magnifying-glass-plus"></i>
            </button>
            <button className="icon-btn map-tool" title={'Zoom out' + keyHint('zoom-out')} onClick={() => zoom(0.8)}>
                <i className="fa-solid fa-magnifying-glass-minus"></i>
            </button>
            <button className="icon-btn map-tool" title={'Fit the whole map' + keyHint('fit')} onClick={() => window.dispatchEvent(new CustomEvent('map-fit'))}>
                <i className="fa-solid fa-expand"></i>
            </button>
        </nav>
    );
}
