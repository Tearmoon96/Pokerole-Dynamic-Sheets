import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DATA_BASE } from '../data/paths';
import { loadAppData, verifyAppData } from '../data/loadAppData';
import { AppDataProvider } from '../data/AppDataContext';
import { SheetProvider } from '../state/SheetContext';
import { createBlankStore } from '../state/store';
import { ToastProvider } from '../components/common/Toast';
import { Booting } from '../components/common/Booting';
import { DataWarning } from '../components/common/DataWarning';
import { SessionProvider } from '../state/SessionContext';
import { LicenseApp } from '../components/license/LicenseApp';
import { registerServiceWorker } from '../pwa/register';
import { installTooltips } from '../lib/tooltip';
import type { AppData } from '../data/types';

import '../styles/trainer-license.css';

const store = createBlankStore();

function Root() {
    const [data, setData] = useState<AppData | null>(null);
    const [dataOk, setDataOk] = useState(true);

    useEffect(() => {
        let live = true;
        loadAppData()
            .then(async (loaded) => {
                if (!live) return;
                setData(loaded);
                setDataOk(await verifyAppData(loaded));
            })
            .catch(() => { if (live) setDataOk(false); });
        return () => { live = false; };
    }, []);

    if (!data) {
        return (
            <>
                {!dataOk && <DataWarning dataBase={DATA_BASE} />}
                <Booting />
            </>
        );
    }

    return (
        <AppDataProvider data={data}>
            <SheetProvider store={store}>
                <ToastProvider>
                    <SessionProvider>
                        {!dataOk && <DataWarning dataBase={DATA_BASE} />}
                        <LicenseApp />
                    </SessionProvider>
                </ToastProvider>
            </SheetProvider>
        </AppDataProvider>
    );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);

/* Replaces the browser's native title bubble everywhere on the page. DOM-level,
   so it covers whatever React renders without any component knowing about it. */
installTooltips();

registerServiceWorker();
