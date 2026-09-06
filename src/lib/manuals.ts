/* Pokerole Core Book manual picker.

   The PDFs live in the "Pokerole Core Book/" folder; a bookmark opens its
   edition's PDF in a new tab at a page via the #page=N URL fragment that the
   Chrome/Edge PDF viewer honours. MANUALS is the single source of truth for the
   editions and their DEV-PROVIDED default bookmarks — edit the `bookmarks`
   arrays to change the built-in jump points. Users add their own "custom"
   bookmarks per edition; those live on the trainer and are saved in the
   trainer's JSON. */

export interface ManualBookmark { icon?: string; label: string; page: number }

export interface Manual {
    label: string;
    file: string;
    bookmarks: ManualBookmark[];
    userAdded?: boolean;
    /** A just-typed edition, shown as a button before its file exists. */
    pending?: boolean;
}

export const MANUAL_FOLDER = 'Pokerole Core Book/';
export const CORE_BOOK_DIR_NAME = MANUAL_FOLDER.replace(/\/$/, '');   // folder-handle name
export const MANUALS: Manual[] = [
    {
        label: '1.25',
        file: 'Pokerole Core Book 1.25.pdf',
        bookmarks: [
            { icon: '🧑', label: 'Trainer Creation', page: 18 },
            { icon: '🐣', label: 'Pokémon Creation', page: 21 },
            { icon: '💪', label: 'Attributes', page: 23 },
            { icon: '🧬', label: 'Nature', page: 40 },
            { icon: '⚔️', label: 'Pokémon Battles', page: 44 },
            { icon: '🏹', label: 'Catching a Pokémon', page: 64 },
            { icon: '🎓', label: 'Pokémon Training', page: 68 },
            { icon: '🎒', label: 'Items', page: 72 },
            { icon: '📖', label: 'Pokédex', page: 83 },
            { icon: '🔥', label: 'Pokémon Moves', page: 298 },
            { icon: '⭐', label: 'Pokémon Abilities', page: 371 },
        ],
    },
    {
        label: '3.0',
        file: 'Pokerole Core Book 3.0.pdf',
        bookmarks: [
            { icon: '🧑', label: 'Trainer Creation', page: 40 },
            { icon: '🐣', label: 'Pokémon Creation', page: 44 },
            { icon: '💪', label: 'Attributes', page: 44 },
            { icon: '🧬', label: 'Nature', page: 46 },
            { icon: '⚔️', label: 'Pokémon Battles', page: 52 },
            { icon: '🏹', label: 'Catching a Pokémon', page: 96 },
            { icon: '🎓', label: 'Pokémon Training', page: 104 },
            { icon: '🎒', label: 'Items', page: 116 },
            { icon: '📖', label: 'Pokédex', page: 132 },
            { icon: '🔥', label: 'Pokémon Moves', page: 434 },
            { icon: '⭐', label: 'Pokémon Abilities', page: 534 },
        ],
    },
];

// Same set of quick links as the built-in editions (1.25 / 3.0). A
// user-added edition reuses these icons + labels; the user supplies only
// the page numbers, so every edition offers the same jump points.
export const MANUAL_QUICKLINK_TEMPLATE: { icon: string; label: string }[] = [
    { icon: '🧑', label: 'Trainer Creation' },
    { icon: '🐣', label: 'Pokémon Creation' },
    { icon: '💪', label: 'Attributes' },
    { icon: '🧬', label: 'Nature' },
    { icon: '⚔️', label: 'Pokémon Battles' },
    { icon: '🏹', label: 'Catching a Pokémon' },
    { icon: '🎓', label: 'Pokémon Training' },
    { icon: '🎒', label: 'Items' },
    { icon: '📖', label: 'Pokédex' },
    { icon: '🔥', label: 'Pokémon Moves' },
    { icon: '⭐', label: 'Pokémon Abilities' },
];

export function manualFileFor(label: string): string {
    return 'Pokerole Core Book ' + label + '.pdf';
}

export function manualJsonFor(label: string): string {
    return 'Pokerole Core Book ' + label + '.json';
}
