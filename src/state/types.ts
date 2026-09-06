/* The trainer sheet, exactly as it is written to a trainer's .json file.

   These types describe a serialised on-disk format that people already have
   files of. Adding an optional field is safe; renaming or retyping one is not
   — normalize.ts is the only place allowed to reconcile older shapes. */

export type Gender = '' | 'M' | 'F';

/** Stock sprite sets the PC storage tiles can draw from. */
export type BoxSpriteType = 'Home' | 'Book';

/** Every sprite set a Pokémon can be drawn with. 'Custom' is uploaded art,
    which still names a stock set to stand in while the full-res copy loads. */
export type SpriteType = 'Home' | 'Book' | 'Box' | 'Shuffle' | 'Custom';

export interface PhotoAdjust { scale: number; offsetX: number; offsetY: number }

export interface TrainerStats {
    strength: number; dexterity: number; vitality: number; special: number; insight: number;
    tough: number; cool: number; beauty: number; cute: number; clever: number;
}

export interface TrainerSkills {
    brawl: number; channel: number; clash: number; evasion: number;
    alert: number; athletic: number; nature: number; stealth: number;
    charm: number; empathy: number; intimidate: number; perform: number;
    craft: number; lore: number; medicine: number; science: number;
}

export interface ExtraSkill { name: string; value: number }
export interface Achievement { text: string; done: boolean }
export interface Badge { earned: boolean; type: string }

/** A worn equipment slot. `icon` is a path inside the D&D icon pack's Library. */
export interface EquipSlotEntry { name: string; notes: string; icon: string }
export type Equipment = Record<string, EquipSlotEntry>;

/** A row of carried gear. */
export interface EquipBagItem { name: string; icon: string; qty: number }

/** A bag row: a Pokémon item, by name, with a count. */
export interface BagItem { name: string; qty: number }

/** The trainer-side sprite override for one slot, independent of the card sheet. */
export interface MonPreview {
    type?: SpriteType;
    scale?: number;
    offsetX?: number;
    offsetY?: number;
    custom?: string;
    [key: string]: unknown;
}

/** One Pokémon, in a team slot or in a box. `sheet` is its whole card. */
export interface MonEntry {
    uid?: string;
    dexId: string;
    sheet: PokemonSheet | null;
    preview: MonPreview | null;
}

/** An empty team slot keeps the same shape with no uid. */
export type TeamSlot = MonEntry;

export interface BoxEntry { name: string; mons: MonEntry[] }

/** The Pokémon card's own sheet. Opaque here — pokemon-card owns its shape. */
export interface PokemonSheet {
    name?: string;
    nickname?: string;
    dexId?: string;
    hp?: number;
    will?: number;
    rank?: string;
    heldItem?: string;
    gender?: string;
    [key: string]: unknown;
}

export type PotionKind = 'potion' | 'superPotion' | 'hyperPotion';

export interface TrainerState {
    id: string;
    name: string;
    player: string;
    /** '' = unset, 'M' = male, 'F' = female */
    gender: Gender;
    /** Downscaled JPEG data-URL so the whole sheet fits in localStorage */
    photo: string;
    /** Filename of the full-res copy in Custom Images/Trainers (preferred on load) */
    photoFile: string;
    /** Size / position of the photo within the arch frame */
    photoAdjust: PhotoAdjust;
    themeType: string;
    stats: TrainerStats;
    skills: TrainerSkills;
    extras: ExtraSkill[];
    achievements: Achievement[];
    nature: string;
    rank: string;
    hp: number;
    will: number;
    /** Manual pool resize, stored as an offset from the derived max so the
        pool still follows Vitality / Insight instead of freezing. */
    hpMaxBonus: number;
    willMaxBonus: number;
    /** Pre-1.2.0 absolute pool sizes. Migrated in normalize and never written
        again; kept null so an older copy of the app can still derive them. */
    hpMax: number | null;
    willMax: number | null;
    exp: number;
    age: string;
    money: number;
    team: TeamSlot[];
    /** PC storage — Pokémon owned but not carried. */
    boxes: BoxEntry[];
    activeBox: number;
    boxSpriteType: BoxSpriteType;
    /** On: a Pokémon with uploaded art shows it whatever set is picked. */
    boxUseCustom: boolean;
    bagOut: BagItem[];
    bagBattle: BagItem[];
    potionCharges: Record<PotionKind, boolean[]>;
    potionQty: Record<PotionKind, number>;
    otherMeds: string;
    badges: Badge[];
    equipment: Equipment;
    /** Carried gear; the worn slots live in `equipment`. */
    equipBag: EquipBagItem[];
    notes: string;
    /** Rulebook bookmarks, keyed by Core Book edition. */
    manualBookmarks: Record<string, { label: string; page: number }[]>;
    /** Legacy keys tolerated on read and stripped on normalize. */
    manualVersions?: unknown;
}

/** One loaded trainer in the working set. */
export interface TrainerEntry {
    id: string;
    handle: FileSystemFileHandle | null;
    fileName: string | null;
    data: TrainerState;
}
