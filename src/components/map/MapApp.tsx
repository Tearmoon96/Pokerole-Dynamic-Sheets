import { useEffect, useState } from 'react';
import { useMap } from '../../map/MapContext';
import { useToast } from '../common/Toast';
import { MapTopBar } from './MapTopBar';
import { ToolRail, TOOLS } from './ToolRail';
import { SidePanel, deleteSelection, duplicateSelection } from './SidePanel';
import { MapCanvas } from './MapCanvas';
import { cleanSize } from '../../map/brushes';
import { MapListDialog, SpriteChecklist } from './MapDialogs';

/* The Map Maker: top bar, tool rail, the map, and the side panel. */

function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function MapApp({ dataOk }: { dataOk: boolean }) {
    const { store, doc } = useMap();
    const toast = useToast();
    const [dialog, setDialog] = useState<'maps' | 'sprites' | null>(null);
    const [spaceHeld, setSpaceHeld] = useState(false);

    useEffect(() => {
        document.title = (doc.name ? doc.name + ' – ' : '') + 'Pokerole Map Maker';
    }, [doc.name]);

    useEffect(() => { store.onToast = toast; }, [store, toast]);

    /* The store writes a moment after a change; a tab closed inside that
       moment would lose it. */
    useEffect(() => {
        const flush = () => store.flush();
        const onStorage = (e: StorageEvent) => store.syncFromStorage(e.key);
        window.addEventListener('pagehide', flush);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener('pagehide', flush);
            window.removeEventListener('storage', onStorage);
        };
    }, [store]);

    useEffect(() => {
        const onDown = (e: KeyboardEvent) => {
            if (typing(e.target) || dialog) return;
            const mod = e.ctrlKey || e.metaKey;
            if (e.code === 'Space') {
                e.preventDefault();
                if (!e.repeat) setSpaceHeld(true);
                return;
            }
            if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
            if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
            if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(store); return; }
            if (mod && e.key.toLowerCase() === 'a') {
                /* Everything on the map, under the Select tool so it can be dragged at once. */
                e.preventDefault();
                const d = store.doc;
                store.setUi({
                    tool: 'select',
                    selection: [
                        ...d.paths.map((o) => ({ kind: 'path' as const, id: o.id })),
                        ...d.stamps.map((o) => ({ kind: 'stamp' as const, id: o.id })),
                        ...d.labels.map((o) => ({ kind: 'label' as const, id: o.id })),
                        ...d.tokens.map((o) => ({ kind: 'token' as const, id: o.id })),
                    ],
                });
                return;
            }
            if (mod) return;
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(store); return; }
            if (e.key === 'Escape') { store.setUi({ selection: [] }); return; }
            if (e.key === '[') { store.setUi({ brush: cleanSize(store.ui.brush / 1.25) }); return; }
            if (e.key === ']') { store.setUi({ brush: cleanSize(store.ui.brush * 1.25) }); return; }
            if (e.key === '+' || e.key === '=') { window.dispatchEvent(new CustomEvent('map-zoom', { detail: 1.25 })); return; }
            if (e.key === '-') { window.dispatchEvent(new CustomEvent('map-zoom', { detail: 0.8 })); return; }
            if (e.key === '0') { window.dispatchEvent(new CustomEvent('map-fit')); return; }
            if (e.key === '#') { store.edit((d) => { d.grid = { ...d.grid, show: !d.grid.show }; }); return; }
            const tool = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
            if (tool) store.setUi({ tool: tool.tool });
        };
        const onUp = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false); };
        const onBlur = () => setSpaceHeld(false);
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [store, dialog]);

    return (
        <>
            <MapTopBar
                onMaps={() => setDialog('maps')}
                onSprites={() => setDialog('sprites')}
            />
            {!dataOk && (
                <div id="data-missing" style={{ display: 'block' }}>
                    <i className="fa-solid fa-triangle-exclamation"></i> The <code>app-data</code> folder was not found next
                    to this page, so Pokémon tokens cannot be chosen. Everything else works.
                </div>
            )}
            <div className="map-body">
                <ToolRail />
                <MapCanvas spaceHeld={spaceHeld} />
                <SidePanel />
            </div>
            <MapListDialog open={dialog === 'maps'} onClose={() => setDialog(null)} />
            <SpriteChecklist open={dialog === 'sprites'} onClose={() => setDialog(null)} />
        </>
    );
}
