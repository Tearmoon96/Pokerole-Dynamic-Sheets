import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadAppData, verifyAppData } from '../data/loadAppData';
import { AppDataProvider } from '../data/AppDataContext';
import { Booting } from '../components/common/Booting';
import { GM_TOAST, ToastProvider } from '../components/common/Toast';
import { ConfirmProvider } from '../components/gm/ConfirmDialog';
import { MapStoreProvider } from '../map/MapContext';
import { MapStore } from '../map/store';
import { TableLiveLink } from '../map/tableLive';
import { MapApp } from '../components/map/MapApp';
import { installTooltips } from '../lib/tooltip';
import { initDevice } from '../lib/device';
import { registerServiceWorker } from '../pwa/register';
import { UpdatePrompt } from '../pwa/UpdatePrompt';
import type { AppData } from '../data/types';

import '../styles/map-maker.css';

/* Built before React mounts, like the other pages' stores, so the first render
   already has the saved maps. */
const store = new MapStore();

/* The line to a rolling table open in another tab. It listens from the
   start, so the Table button appears as soon as one is. */
const tableLink = new TableLiveLink(store);
tableLink.start();
window.addEventListener('pagehide', () => tableLink.dispose());

function Root() {
    const [data, setData] = useState<AppData | null>(null);
    const [dataOk, setDataOk] = useState(true);

    useEffect(() => {
        let live = true;
        loadAppData()
            .then(async (loaded) => {
                if (!live) return;
                setData(loaded);
                /* Only the Pokédex matters here — the token picker is the one
                   thing that reads the dataset — but a missing bundle still
                   means the folder is wrong, and the banner should say so. */
                const ok = await verifyAppData(loaded);
                setDataOk(ok && loaded.pokemon.length > 0);
            })
            .catch(() => { if (live) setDataOk(false); });
        return () => { live = false; };
    }, []);

    if (!data) return <Booting />;

    return (
        <AppDataProvider data={data}>
            <MapStoreProvider store={store}>
                <ToastProvider skin={GM_TOAST}>
                    <ConfirmProvider>
                        <MapApp dataOk={dataOk} tableLink={tableLink} />
                    </ConfirmProvider>
                </ToastProvider>
            </MapStoreProvider>
        </AppDataProvider>
    );
}

/* Stamps data-device / data-pointer on <html> before the first paint, so
   the page starts in the right class instead of reflowing into it. */
initDevice();

/* UpdatePrompt sits OUTSIDE Root: it has to render while the page is still
   booting, and it reads its own store rather than any provider. */
createRoot(document.getElementById('root')!).render(
    <StrictMode><Root /><UpdatePrompt /></StrictMode>,
);

installTooltips();
registerServiceWorker();
