import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { MapStore, MapUi } from './store';
import type { MapDoc } from './types';

const Ctx = createContext<MapStore | null>(null);

export function MapStoreProvider({ store, children }: { store: MapStore; children: ReactNode }) {
    return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** The store itself, for actions. Does not subscribe on its own. */
export function useMapStore(): MapStore {
    const store = useContext(Ctx);
    if (!store) throw new Error('useMapStore must be used inside <MapStoreProvider>');
    return store;
}

/** Subscribe to the store and get the active map and the editor state. */
export function useMap(): { store: MapStore; doc: MapDoc; ui: MapUi } {
    const store = useMapStore();
    const version = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return useMemo(() => ({ store, doc: store.doc, ui: store.ui }), [store, version]);
}
