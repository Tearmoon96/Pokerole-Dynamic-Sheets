import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ContactApp } from '../components/contact/ContactApp';
import { installTooltips } from '../lib/tooltip';
import { initDevice } from '../lib/device';
import { registerServiceWorker } from '../pwa/register';
import { UpdatePrompt } from '../pwa/UpdatePrompt';

import '../styles/contact-center.css';

initDevice();

createRoot(document.getElementById('root')!).render(
    <StrictMode><ContactApp /><UpdatePrompt /></StrictMode>,
);

installTooltips();
registerServiceWorker();
