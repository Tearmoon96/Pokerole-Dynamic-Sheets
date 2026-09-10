import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TableProvider } from '../table/TableContext';
import { TableSession } from '../table/session';
import { TableApp } from '../components/table/TableApp';
import { isHostedOrigin } from '../data/paths';
import { cryptoAvailable } from '../table/crypto';
import { installTooltips } from '../lib/tooltip';
import { initDevice } from '../lib/device';
import { registerServiceWorker } from '../pwa/register';
import { UpdatePrompt } from '../pwa/UpdatePrompt';

import '../styles/rolling-table.css';

/* Built before React mounts, like the other pages' stores, so the first render
   already knows whether a saved session is being restored. */
const session = new TableSession();

function Root() {
    useEffect(() => {
        /* Only reconnect where a connection can exist. From the disk the page
           shows the online-only notice instead, and starting a socket behind it
           would just retry forever in the background. */
        if (isHostedOrigin() && cryptoAvailable()) void session.restore();
    }, []);

    return (
        <TableProvider session={session}>
            <TableApp />
        </TableProvider>
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
