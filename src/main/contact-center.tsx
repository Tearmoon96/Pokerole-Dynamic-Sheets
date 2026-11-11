import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ContactApp } from '../components/contact/ContactApp';
import { installTooltips } from '../lib/tooltip';
import { initDevice } from '../lib/device';
import { registerServiceWorker } from '../pwa/register';
import { UpdatePrompt } from '../pwa/UpdatePrompt';

import '../styles/contact-center.css';
import { PageBoundary } from '../components/common/PageBoundary';

initDevice();

createRoot(document.getElementById('root')!).render(
    <StrictMode><PageBoundary page="The Contact Center"><ContactApp /></PageBoundary><UpdatePrompt /></StrictMode>,
);

installTooltips();
registerServiceWorker();
