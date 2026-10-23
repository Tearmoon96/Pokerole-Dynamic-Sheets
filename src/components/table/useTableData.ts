import { useEffect, useState } from 'react';
import { loadAppData } from '../../data/loadAppData';
import type { AppData } from '../../data/types';

/** The species and move data, outside the character panel's own provider:
    null until it has loaded. The bundles load once for the whole page. */
export function useTableData(): AppData | null {
    const [data, setData] = useState<AppData | null>(null);
    useEffect(() => {
        let live = true;
        loadAppData().then((d) => { if (live) setData(d); }).catch(() => { /* the panel says so */ });
        return () => { live = false; };
    }, []);
    return data;
}
