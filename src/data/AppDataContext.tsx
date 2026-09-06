import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { AppData } from './types';
import { buildGearIndex } from '../lib/gear';
import type { GearIndex } from '../lib/gear';

interface AppDataValue {
    data: AppData;
    gear: GearIndex;
    /** Species by DexID, the lookup nearly every sprite path starts from. */
    dexById: Map<string, AppData['pokemon'][number]>;
    dexByName: Map<string, AppData['pokemon'][number]>;
}

const Ctx = createContext<AppDataValue | null>(null);

export function AppDataProvider({ data, children }: { data: AppData; children: ReactNode }) {
    const value = useMemo<AppDataValue>(() => ({
        data,
        gear: buildGearIndex(data),
        dexById: new Map(data.pokemon.map((p) => [p.DexID, p])),
        dexByName: new Map(data.pokemon.map((p) => [p.Name.toLowerCase(), p])),
    }), [data]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppDataValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
    return v;
}
