import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { GmStore } from './store';
import type { GmState } from './types';

const Ctx = createContext<GmStore | null>(null);

export function GmStoreProvider({ store, children }: { store: GmStore; children: ReactNode }) {
    return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** The store itself, for actions. Does not subscribe on its own. */
export function useGmStore(): GmStore {
    const store = useContext(Ctx);
    if (!store) throw new Error('useGmStore must be used inside <GmStoreProvider>');
    return store;
}

/** Subscribe to the store and get the board state. */
export function useGm(): { store: GmStore; state: GmState } {
    const store = useGmStore();
    const version = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return useMemo(() => ({ store, state: store.state }), [store, version]);
}
