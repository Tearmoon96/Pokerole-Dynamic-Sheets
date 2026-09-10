import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadAppData, verifyAppData } from '../data/loadAppData';
import { AppDataProvider } from '../data/AppDataContext';
import { Booting } from '../components/common/Booting';
import { GM_TOAST, ToastProvider } from '../components/common/Toast';
import { ConfirmProvider } from '../components/gm/ConfirmDialog';
import { GmStoreProvider } from '../gm/GmContext';
import { GmStore } from '../gm/store';
import { GmApp } from '../components/gm/GmApp';
import { installTooltips } from '../lib/tooltip';
import { initDevice } from '../lib/device';
import { registerServiceWorker } from '../pwa/register';
import type { AppData } from '../data/types';

import '../styles/gm-screen.css';

const store = new GmStore();

function Root() {
    const [data, setData] = useState<AppData | null>(null);
    const [dataOk, setDataOk] = useState(true);

    useEffect(() => {
        let live = true;
        loadAppData()
            .then(async (loaded) => {
                if (!live) return;
                setData(loaded);
                /* Moves and natures feed the move panel and the NPC temperaments;
                   both degrade to an empty list rather than an error, but a missing
                   bundle means the folder is wrong and the banner should say so. */
                const ok = await verifyAppData(loaded);
                setDataOk(ok && loaded.moves.length > 0 && loaded.natures.length > 0);
            })
            .catch(() => { if (live) setDataOk(false); });
        return () => { live = false; };
    }, []);

    if (!data) return <Booting />;

    return (
        <AppDataProvider data={data}>
            <GmStoreProvider store={store}>
                <ToastProvider skin={GM_TOAST}>
                    <ConfirmProvider>
                        <GmApp dataOk={dataOk} />
                    </ConfirmProvider>
                </ToastProvider>
            </GmStoreProvider>
        </AppDataProvider>
    );
}

/* Stamps data-device / data-pointer on <html> before the first paint, so
   the page starts in the right class instead of reflowing into it. */
initDevice();

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);

installTooltips();
registerServiceWorker();
