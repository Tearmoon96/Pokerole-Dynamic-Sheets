import { useEffect, useState } from 'react';
import { useMap } from '../../map/MapContext';
import { useToast } from '../common/Toast';
import { MapTopBar } from './MapTopBar';
import { ToolRail } from './ToolRail';
import { SidePanel, deleteSelection, duplicateSelection } from './SidePanel';
import { MapCanvas } from './MapCanvas';
import { cleanSize } from '../../map/brushes';
import { cleanSketchWidth } from '../../map/sketch';
import { slotOf } from '../../map/store';
import { MapListDialog, SpriteChecklist } from './MapDialogs';
import { HotkeysDialog } from './HotkeysDialog';
import { RecipeDialog } from './RecipeDialog';
import { actionFor } from '../../map/hotkeys';
import type { HotkeyAction } from '../../map/hotkeys';
import type { Tool } from '../../map/types';
import type { TableLiveLink } from '../../map/tableLive';
import { TableLiveBanner } from './TableLinkControl';

/* The Map Maker: top bar, tool rail, the map, and the side panel. */

function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function MapApp({ dataOk, tableLink }: { dataOk: boolean; tableLink: TableLiveLink }) {
    const { store, doc } = useMap();
    const toast = useToast();
    const [dialog, setDialog] = useState<'maps' | 'sprites' | 'hotkeys' | 'recipe' | null>(null);
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
        /* Which key is holding the pan, so letting go of THAT key ends it. */
        let holding: string | null = null;
        const onDown = (e: KeyboardEvent) => {
            if (typing(e.target) || dialog) return;
            const action = actionFor(e);
            /* Space scrolls the page, and a bound key should do only its job. */
            if (action || e.code === 'Space') e.preventDefault();
            if (!action) return;
            if (action === 'pan-hold') {
                if (!e.repeat) { holding = e.code; setSpaceHeld(true); }
                return;
            }
            if (e.repeat && action.startsWith('tool:')) return;
            runAction(action);
        };
        const runAction = (action: HotkeyAction) => {
            if (action.startsWith('tool:')) { store.setUi({ tool: action.slice(5) as Tool }); return; }
            switch (action) {
                case 'undo': store.undo(); return;
                case 'redo': store.redo(); return;
                case 'duplicate': duplicateSelection(store); return;
                case 'select-all': {
                    /* Everything on the map, under the Select tool so it can be dragged at once. */
                    const d = store.doc;
                    store.setUi({
                        tool: 'select',
                        selection: [
                            ...d.paths.map((o) => ({ kind: 'path' as const, id: o.id })),
                            ...d.stamps.map((o) => ({ kind: 'stamp' as const, id: o.id })),
                            ...d.labels.map((o) => ({ kind: 'label' as const, id: o.id })),
                            ...d.tokens.map((o) => ({ kind: 'token' as const, id: o.id })),
                            ...d.sketches.map((o) => ({ kind: 'sketch' as const, id: o.id })),
                        ],
                    });
                    return;
                }
                case 'delete': deleteSelection(store); return;
                case 'deselect': store.setUi({ selection: [] }); return;
                case 'brush-smaller':
                case 'brush-larger': {
                    if (store.ui.tool === 'sketch') {
                        const sk = store.ui.sketch;
                        store.setUi({ sketch: { ...sk, width: cleanSketchWidth(action === 'brush-smaller' ? sk.width / 1.25 : sk.width * 1.25) } });
                        return;
                    }
                    /* The brush of whichever tool is out — the paint brush's under the bucket. */
                    const slot = slotOf(store.ui.tool) ?? 'paint';
                    const size = store.ui.brushes[slot].size;
                    store.setBrush(slot, { size: cleanSize(action === 'brush-smaller' ? size / 1.25 : size * 1.25) });
                    return;
                }
                case 'zoom-in': window.dispatchEvent(new CustomEvent('map-zoom', { detail: 1.25 })); return;
                case 'zoom-out': window.dispatchEvent(new CustomEvent('map-zoom', { detail: 0.8 })); return;
                case 'fit': window.dispatchEvent(new CustomEvent('map-fit')); return;
                case 'grid': store.edit((d) => { d.grid = { ...d.grid, show: !d.grid.show }; }); return;
                case 'table-live': tableLink.togglePause(); return;
                case 'table-sync': tableLink.syncNow(); return;
                default: return;
            }
        };
        const onUp = (e: KeyboardEvent) => {
            if (holding && e.code === holding) { holding = null; setSpaceHeld(false); }
        };
        const onBlur = () => { holding = null; setSpaceHeld(false); };
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [store, dialog, tableLink]);

    return (
        <>
            <MapTopBar
                onMaps={() => setDialog('maps')}
                onSprites={() => setDialog('sprites')}
                onHotkeys={() => setDialog('hotkeys')}
                onRecipe={() => setDialog('recipe')}
                tableLink={tableLink}
            />
            <TableLiveBanner link={tableLink} />
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
            <MapListDialog open={dialog === 'maps'} onClose={() => setDialog(null)} onRecipe={() => setDialog('recipe')} />
            <SpriteChecklist open={dialog === 'sprites'} onClose={() => setDialog(null)} />
            <HotkeysDialog open={dialog === 'hotkeys'} onClose={() => setDialog(null)} />
            <RecipeDialog open={dialog === 'recipe'} onClose={() => setDialog(null)} />
        </>
    );
}
