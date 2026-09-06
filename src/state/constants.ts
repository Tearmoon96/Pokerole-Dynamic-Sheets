/* Fixed shapes and tables the sheet is built around. Ported unchanged from the
   inline script — the comments explain decisions that are easy to undo by
   accident, so they travel with the constants. */

/** Legacy single-sheet key, migrated on first run. */
export const STORAGE_KEY = 'pokerole_trainer_license';
/** Shared working set (this page + Pokémon cards). */
export const WORKING_KEY = 'pokerole_working';

/** Marker written into exported trainer JSON; the folder loader keys off it. */
export const TRAINER_MARKER = '_pokeroleTrainer';
/** Marker on a wild-Pokémon JSON exported from a Pokémon card. */
export const WILD_MARKER = '_pokeroleWild';

export const BOX_CAPACITY = 30;
export const BOX_COUNT = 6;

/* Which stock sprite set the storage tiles draw from. One button in the window
   cycles it; the choice is the trainer's, so it saves into their JSON.

   The Box set was here too and was withdrawn. Its art is 68x56 pixel art, so it
   can only be enlarged by an exact pixel ratio without turning to noise, and
   those ratios are a factor of two apart while the well's usable size range is
   narrower than that. Trainers who had Box selected fall back to Home on load. */
export const BOX_SPRITE_CYCLE = ['Home', 'Book'] as const;

/* Fallback framing, one per set, used only when a sprite has no measurement of
   its own: a species with no local copy, or sprite-frames-db.js failing to
   load. Serviceable for stragglers, wrong as a blanket rule. */
export const BOX_SPRITE_FRAME: Record<string, { scale: number; offsetY: number }> = {
    Home: { scale: 0.95, offsetY: 0 },
    Book: { scale: 0.72, offsetY: 0 },
};

/* Sprite files that exist but are not the Pokémon they claim to be.
   egg.png in BookSprites is a byte-for-byte copy of Alolan Exeggutor's
   illustration, and ShuffleTokens has no egg.png at all. The art is wrong
   upstream, so the only fix is to not draw those sets for that species. */
export const SPRITE_SET_BLOCKED: Record<string, string[]> = { 'egg.png': ['Book', 'Shuffle'] };

/* How much of the well's RADIUS the art's own enclosing radius should take up.
   Just under 1 leaves a hair of room so antialiased edges do not kiss the rim. */
export const SPRITE_FIT_TARGET = 0.94;

/* Must match the CSS: the content box of .box-tile and of .box-team-slot,
   62px less the 1px border each side. */
export const BOX_WELL = 60;

export interface EquipSlotDef {
    key: string; label: string; icon: string; area: string; cat: string | null;
}

/* Equipment slots, laid out like Path of Exile 2's gear window (minus the belt
   and flasks). `area` names the grid-area the slot drops into — see the
   #equip-slots rule. `cat` is the catalogue category the slot opens on: a
   starting point only, but it saves scrolling past 800 icons. */
export const EQUIP_SLOTS: EquipSlotDef[] = [
    { key: 'helmet', label: 'Helmet', icon: 'fa-helmet-safety', area: 'helmet', cat: 'Helmets & Headwear' },
    { key: 'necklace', label: 'Necklace', icon: 'fa-gem', area: 'necklace', cat: 'Necklaces & Amulets' },
    { key: 'weapon', label: 'Weapon', icon: 'fa-hand-fist', area: 'weapon', cat: 'Weapons' },
    { key: 'offhand', label: 'Shield / Off-hand', icon: 'fa-shield-halved', area: 'offhand', cat: 'Shields' },
    { key: 'ring1', label: 'Ring I', icon: 'fa-ring', area: 'ring1', cat: 'Rings' },
    { key: 'armor', label: 'Armor', icon: 'fa-shirt', area: 'armor', cat: 'Armour' },
    /* Shares the armour cell — see EQUIP_FACES. Only one of the two is on the
       grid at a time, but each keeps its own item. */
    { key: 'clothing', label: 'Clothing', icon: 'fa-vest', area: 'armor', cat: 'Clothing' },
    { key: 'ring2', label: 'Ring II', icon: 'fa-ring', area: 'ring2', cat: 'Rings' },
    { key: 'gloves', label: 'Gloves', icon: 'fa-mitten', area: 'gloves', cat: 'Gloves & Bracers' },
    { key: 'boots', label: 'Boots', icon: 'fa-shoe-prints', area: 'boots', cat: 'Boots' },
    /* Not a worn slot — whatever the trainer keeps within reach */
    { key: 'quick', label: 'Quick Slot', icon: 'fa-bolt', area: 'quick', cat: null },
];
