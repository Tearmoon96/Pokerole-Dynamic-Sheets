import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { CardStore } from './store';
import type { CardSheet } from './types';
import type { PokedexEntry } from '../data/types';
import type { StatSource } from './pools';

const Ctx = createContext<CardStore | null>(null);

export function CardStoreProvider({ store, children }: { store: CardStore; children: ReactNode }) {
    return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** The store itself, for actions. Does not subscribe on its own. */
export function useCardStore(): CardStore {
    const store = useContext(Ctx);
    if (!store) throw new Error('useCardStore must be used inside <CardStoreProvider>');
    return store;
}

export interface CardView {
    store: CardStore;
    sheet: CardSheet;
    pokemon: PokedexEntry;
    /** The pair every pool and move calculation takes. */
    src: StatSource;
}

/** Subscribe to the store and get everything the sheet is drawn from. */
export function useCard(): CardView {
    const store = useCardStore();
    const version = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return useMemo(
        () => ({ store, sheet: store.sheet, pokemon: store.pokemon, src: store.src }),
        [store, version],
    );
}
