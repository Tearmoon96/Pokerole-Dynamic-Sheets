import { createContext, useContext } from 'react';
import { COMBAT_KEY, combatPanelKey } from './constants';
import type { GmCombat } from './types';

/* Which board panel the phone tab bar has selected — or null on any screen
   wide enough to show them all side by side, which is every screen but a
   phone's.

   A context rather than a prop threaded down through the five panel
   components: `Panel` is the only thing that needs the answer, and it already
   reaches into the GM store the same way. It also means a sixth panel added
   later joins the tab bar without anyone remembering to wire it up.

   Deliberately NOT part of GmStore: that is the session, and it is serialised
   to the .json the GM saves. Which tab a phone happened to be on is not
   something to write into a shared session file. */
export const ActivePanelCtx = createContext<string | null>(null);

export function useActivePanel(): string | null {
    return useContext(ActivePanelCtx);
}

export interface PanelTab { key: string; icon: string; label: string }

/* Icon and label for each panel key, for the tab bar. Kept beside the context
   rather than in GmApp so the two lists cannot drift apart in a merge — the
   icons match the ones each panel passes to <Panel icon=...>.

   'combat' is the placeholder PANEL_KEYS uses: a board carries one tracker per
   fight, so `panelTabs()` below expands it into one entry per combat, each
   labelled with that fight's own name. */
export const PANEL_TABS: PanelTab[] = [
    { key: 'roster', icon: 'fa-users', label: 'Roster' },
    { key: COMBAT_KEY, icon: 'fa-khanda', label: 'Combat' },
    { key: 'dice', icon: 'fa-dice', label: 'Dice' },
    { key: 'npc', icon: 'fa-address-book', label: 'NPCs' },
    { key: 'generator', icon: 'fa-paw', label: 'Generator' },
    { key: 'notes', icon: 'fa-pen-nib', label: 'Notes' },
];

/** The tabs a given session's board has: PANEL_TABS with the combat
    placeholder expanded into one entry per fight. The order matches
    `expandPanelKeys`, so the toggles in the top bar and the phone's tab bar
    are the same list read the same way. */
export function panelTabs(combats: GmCombat[]): PanelTab[] {
    const out: PanelTab[] = [];
    PANEL_TABS.forEach((t) => {
        if (t.key !== COMBAT_KEY) { out.push(t); return; }
        combats.forEach((c) => out.push({
            key: combatPanelKey(c.gid), icon: t.icon, label: c.name || 'Combat',
        }));
    });
    return out;
}
