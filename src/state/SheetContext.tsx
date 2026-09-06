import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { SheetStore } from './store';
import type { TrainerState } from './types';

const StoreContext = createContext<SheetStore | null>(null);

export function SheetProvider({ store, children }: { store: SheetStore; children: ReactNode }) {
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The store itself, for actions. Does not subscribe on its own. */
export function useStore(): SheetStore {
    const store = useContext(StoreContext);
    if (!store) throw new Error('useStore must be used inside <SheetProvider>');
    return store;
}

/** Subscribe to the store and get the sheet being edited. */
export function useSheet(): TrainerState {
    const store = useStore();
    useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return store.sheet;
}

/** Subscribe and get both, for the many components that need to write back. */
export function useSheetStore(): { sheet: TrainerState; store: SheetStore } {
    const store = useStore();
    const version = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return useMemo(() => ({ sheet: store.sheet, store }), [store, version]);
}
