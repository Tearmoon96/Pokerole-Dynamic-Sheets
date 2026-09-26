import { useMap } from '../../map/MapContext';
import type { Tool } from '../../map/types';

/* The column of tools down the left edge, with undo/redo and zoom under them. */

export const TOOLS: { tool: Tool; icon: string; name: string; key: string }[] = [
    { tool: 'select', icon: 'fa-arrow-pointer', name: 'Select and move', key: 'V' },
    { tool: 'paint', icon: 'fa-paintbrush', name: 'Paint terrain', key: 'B' },
    { tool: 'fill', icon: 'fa-fill-drip', name: 'Fill an area', key: 'G' },
    { tool: 'path', icon: 'fa-route', name: 'Draw a path', key: 'P' },
    { tool: 'stamp', icon: 'fa-mountain-city', name: 'Place a landmark', key: 'S' },
    { tool: 'token', icon: 'fa-chess-pawn', name: 'Place a token', key: 'T' },
    { tool: 'label', icon: 'fa-font', name: 'Add a label', key: 'L' },
    { tool: 'erase', icon: 'fa-eraser', name: 'Erase objects', key: 'E' },
    { tool: 'pan', icon: 'fa-hand', name: 'Pan (or hold Space)', key: 'H' },
];

export function ToolRail() {
    const { store, ui } = useMap();
    const zoom = (factor: number) => window.dispatchEvent(new CustomEvent('map-zoom', { detail: factor }));
    return (
        <nav className="map-rail" aria-label="Tools">
            {TOOLS.map((t) => (
                <button
                    key={t.tool}
                    className="icon-btn map-tool"
                    data-tool={t.tool}
                    aria-pressed={ui.tool === t.tool}
                    title={t.name + ' (' + t.key + ')'}
                    onClick={() => store.setUi({ tool: t.tool })}
                >
                    <i className={'fa-solid ' + t.icon}></i>
                </button>
            ))}
            <span className="map-rail-sep"></span>
            <button className="icon-btn map-tool" title="Undo (Ctrl+Z)" disabled={!store.undoStack.length} onClick={() => store.undo()}>
                <i className="fa-solid fa-rotate-left"></i>
            </button>
            <button className="icon-btn map-tool" title="Redo (Ctrl+Y)" disabled={!store.redoStack.length} onClick={() => store.redo()}>
                <i className="fa-solid fa-rotate-right"></i>
            </button>
            <span className="map-rail-sep"></span>
            <button className="icon-btn map-tool" title="Zoom in (+)" onClick={() => zoom(1.25)}>
                <i className="fa-solid fa-magnifying-glass-plus"></i>
            </button>
            <button className="icon-btn map-tool" title="Zoom out (-)" onClick={() => zoom(0.8)}>
                <i className="fa-solid fa-magnifying-glass-minus"></i>
            </button>
            <button className="icon-btn map-tool" title="Fit the whole map (0)" onClick={() => window.dispatchEvent(new CustomEvent('map-fit'))}>
                <i className="fa-solid fa-expand"></i>
            </button>
        </nav>
    );
}
