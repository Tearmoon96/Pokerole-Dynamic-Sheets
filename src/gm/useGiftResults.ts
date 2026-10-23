/* Answers to the wild Pokémon the GM gave players at the table. The table
   writes them down (src/table/npcShare.ts) and this applies them: an offer
   answered leaves the list, and a Pokémon taken leaves the roster — it is the
   player's now, on their trainer. Applying one twice changes nothing. */

import { useEffect } from 'react';
import { GIFT_RESULTS_KEY, readGiftResults } from '../table/npcShare';
import type { GmStore } from './store';
import { useToast } from '../components/common/Toast';
import { escapeHtml } from '../lib/html';

export function useGiftResults(store: GmStore): void {
    const toast = useToast();
    useEffect(() => {
        const apply = () => {
            const done = readGiftResults();
            const answered = store.state.gifts.filter((g) => done[g.oid]);
            if (!answered.length) return;
            const taken = new Set(answered.filter((g) => done[g.oid].ok).map((g) => g.gid));
            store.update((s) => {
                s.gifts = s.gifts.filter((g) => !done[g.oid]);
                s.wilds = s.wilds.filter((w) => !taken.has(w.gid));
            });
            for (const g of answered) {
                const who = escapeHtml(g.toName || 'A player');
                toast(done[g.oid].ok
                    ? '<i class="fa-solid fa-gift"></i> ' + who + ' took the Pok&eacute;mon you gave.'
                    : '<i class="fa-solid fa-gift"></i> ' + who + ' turned down the Pok&eacute;mon you offered.');
            }
        };
        apply();
        const onStorage = (e: StorageEvent) => { if (e.key === GIFT_RESULTS_KEY) apply(); };
        /* The table tab may be this browser's hidden one, whose writes still
           raise the event here; the poll is for a page that missed it. */
        const poll = window.setInterval(apply, 3000);
        window.addEventListener('storage', onStorage);
        return () => {
            clearInterval(poll);
            window.removeEventListener('storage', onStorage);
        };
    }, [store, toast]);
}
