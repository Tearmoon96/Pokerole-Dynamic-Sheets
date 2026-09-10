import { createContext, useContext } from 'react';

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

/* Icon and label for each panel key, for the tab bar. Kept beside the context
   rather than in GmApp so the two lists cannot drift apart in a merge — the
   icons match the ones each panel passes to <Panel icon=...>. */
export const PANEL_TABS: { key: string; icon: string; label: string }[] = [
    { key: 'roster', icon: 'fa-users', label: 'Roster' },
    { key: 'combat', icon: 'fa-khanda', label: 'Combat' },
    { key: 'dice', icon: 'fa-dice', label: 'Dice' },
    { key: 'npc', icon: 'fa-address-book', label: 'NPCs' },
    { key: 'notes', icon: 'fa-pen-nib', label: 'Notes' },
];
