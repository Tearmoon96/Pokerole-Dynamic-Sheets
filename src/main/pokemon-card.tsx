import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DATA_BASE } from '../data/paths';
import { loadAppData, verifyAppData } from '../data/loadAppData';
import { AppDataProvider } from '../data/AppDataContext';
import { Booting } from '../components/common/Booting';
import { DataWarning } from '../components/common/DataWarning';
import { CardStoreProvider } from '../card/CardContext';
import { CardStore } from '../card/store';
import { readCardContext } from '../card/cardContext';
import { CardApp } from '../components/card/CardApp';
import { installTooltips } from '../lib/tooltip';
import { registerServiceWorker } from '../pwa/register';
import type { AppData, PokedexEntry } from '../data/types';

import '../styles/pokemon-card.css';

/* Which species this card is for. Matched by id first, then by name, so a
   hand-typed ?pokemon=Pikachu works as well as the id the app links with.
   Misdreavus is the fallback the page has always opened on. */
function resolveSpecies(data: AppData): PokedexEntry {
    const requested = (new URLSearchParams(location.search).get('pokemon') || 'misdreavus')
        .trim().toLowerCase();
    return data.pokemon.find((p) => p._id === requested)
        || data.pokemon.find((p) => p.Name.toLowerCase() === requested)
        || data.pokemon.find((p) => p._id === 'misdreavus')
        || data.pokemon[0];
}

function Root() {
    const [data, setData] = useState<AppData | null>(null);
    const [dataOk, setDataOk] = useState(true);
    const [store, setStore] = useState<CardStore | null>(null);

    useEffect(() => {
        let live = true;
        loadAppData()
            .then(async (loaded) => {
                if (!live) return;
                const species = resolveSpecies(loaded);
                setData(loaded);
                setStore(new CardStore(species, readCardContext(species._id)));
                setDataOk(await verifyAppData(loaded));
            })
            .catch(() => { if (live) setDataOk(false); });
        return () => { live = false; };
    }, []);

    if (!data || !store) {
        return (
            <>
                {!dataOk && <DataWarning dataBase={DATA_BASE} />}
                <Booting />
            </>
        );
    }

    return (
        <AppDataProvider data={data}>
            <CardStoreProvider store={store}>
                {!dataOk && <DataWarning dataBase={DATA_BASE} />}
                <CardApp />
            </CardStoreProvider>
        </AppDataProvider>
    );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);

/* Replaces the browser's native title bubble everywhere on the page. */
installTooltips();

registerServiceWorker();
