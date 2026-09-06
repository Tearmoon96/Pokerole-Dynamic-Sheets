import type { CardSheet } from '../card/types';

/* The GM screen's own saved state.

   It goes to localStorage across reloads and, in fuller form, into a session
   .json the GM can keep beside the campaign. Trainers are held by id only here
   — their data lives in the shared working set the Trainer License writes — so a
   session file carries copies of them instead. */

export interface GmWild {
    gid: string;
    dexId: string;
    sheet: CardSheet;
    /** Whether this wild has been pushed to a card tab under its species key. */
    pushed?: boolean;
}

export interface GmNoteSheet {
    gid: string;
    title: string;
    body: string;
    open: boolean;
}

export interface GmNpc {
    gid: string;
    name: string;
    gender: string;
    region: string;
    note: string;
    nature?: string;
}

export interface GmCombatant {
    gid: string;
    /** How to find the live sheet: a trainer, one of their Pokémon, or a wild. */
    ref?: { kind: string; trainerId?: string; uid?: string; gid?: string };
    name?: string;
    initiative?: number;
    actions?: number;
    [key: string]: unknown;
}

export interface GmCombat {
    round: number;
    participants: GmCombatant[];
}

export interface GmDice {
    count: number;
    sides: number;
    history: unknown[];
}

export interface GmNameOpts {
    region: string;
    gender: string;
    letter: string;
    withNature: boolean;
}

/** order: the panels left to right. widths: key -> pixels for the ones pinned
    to a size of their own; a key that is absent grows and shrinks with the
    window as before. */
export interface GmLayout {
    order: string[];
    widths: Record<string, number>;
}

export interface GmState {
    /** ids shown in the roster; data lives in the shared working set */
    trainerIds: string[];
    wilds: GmWild[];
    combat: GmCombat;
    /** legacy single note; migrated into noteSheets */
    notes: string;
    noteSheets: GmNoteSheet[];
    npcs: GmNpc[];
    dice: GmDice;
    /** trainerId -> bool */
    expanded: Record<string, boolean>;
    nameOpts: GmNameOpts;
    layout: GmLayout;
}
