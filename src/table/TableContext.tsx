/* The React binding, in the same shape as the GM screen's GmContext: one store
   read through useSyncExternalStore, with a version counter as the snapshot. */

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { TableSession, TableState } from './session';

const Ctx = createContext<TableSession | null>(null);

export function TableProvider({ session, children }: { session: TableSession; children: ReactNode }) {
    return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useTable(): { session: TableSession; state: TableState } {
    const session = useContext(Ctx);
    if (!session) throw new Error('useTable outside a TableProvider');
    const version = useSyncExternalStore(
        session.store.subscribe, session.store.getSnapshot, session.store.getSnapshot);
    return useMemo(() => ({ session, state: session.store.state }), [session, version]);
}
