/* The Pokémon card's own sheet, as it is written into a trainer's .json (under
   the team slot or the box entry) or into localStorage for a standalone card.

   Like the trainer sheet, this describes a serialised format people already
   have files of: adding an optional field is safe, renaming one is not. */

export type Gender = '' | 'M' | 'F';

export type MajorAilment = 'burn' | 'paralysis' | 'poison' | 'frozen' | 'sleep';

export interface StatusState {
    /** Mutually exclusive with the other majors. */
    major: MajorAilment | null;
    /** 0 none, then the burn degrees. */
    burnDegree: number;
    /** 0 none, 1 Poisoned, 2 Badly Poisoned — the icon cycles them like burn. */
    poisonStage: number;
    confusion: boolean;
    flinch: boolean;
    inLove: boolean;
}

export interface Specialty { name: string; value: number }

/** A per-sprite-type nudge in px. A missing key means dead centre. */
export interface SpriteOffset { x: number; y: number }

/** Only the differences from the move's JSON are stored, under short keys of
    their own — `applyMoveOverrides` maps them onto the real move fields. */
export interface MoveOverride {
    acc1?: string; acc2?: string; acc3?: string;
    power?: number;
    accOffset?: number;
    powOffset?: number;
    damage?: string;
    target?: string;
    effect?: string;
    ailment?: string;
}

export interface CardSkills {
    brawl: number; channel: number; clash: number; evasion: number;
    alert: number; athletic: number; nature: number; stealth: number;
    charm: number; empathy: number; intimidate: number; perform: number;
    craft: number; etiquette: number; medicine: number; science: number;
}

export type SkillCategory = 'fight' | 'survival' | 'social' | 'knowledge';

export interface CardSheet {
    hp: number;
    will: number;
    /** Manual pool resize, stored as an offset from the derived max so the pool
        keeps following Vitality (and the new species' Base HP after an
        evolution) instead of freezing. */
    hpMaxBonus: number;
    willMaxBonus: number;
    /* Hand-set offsets on the two defences, for armour, an ability or a GM
       ruling. Offsets and not absolutes for the same reason as the pools:
       Def has to keep following Vitality (and Sp.Def Insight) when a stat is
       raised or the Pokémon evolves. Display-only — see defenceValue. */
    defBonus: number;
    spDefBonus: number;
    /** Pre-1.2.0 absolute pool sizes. Migrated on load and never written again;
        kept null so an older copy of the app falls back to the derived value. */
    hpMax: number | null;
    willMax: number | null;
    exp: number;
    notes: string;
    heldItem: string;
    nature: string;
    /** '' = unset, 'M' = male, 'F' = female (not every species has one). */
    gender: Gender;
    /** Optional custom name; the trainer sheet can show it instead of the species. */
    nickname: string;
    /** User-uploaded art, shown by the "Custom" sprite tab; a downscaled PNG
        data-URL kept in the sheet so it travels with the JSON. */
    customImage: string;
    /** Which sprite tab is chosen; restored on reopen and reused for this
        Pokémon's team slot on the licence. */
    spriteType: string;
    /** Per-sprite-type zoom, keyed by tab. Card-only: the trainer sheet's team
        slot frames its sprite with its own preview and never reads these. */
    spriteScales: Record<string, number>;
    spriteOffsets: Record<string, SpriteOffset>;
    /** Full-res copy lives in Custom Images/Pokemons/<imageId>.<ext> in the
        trainer's working folder; preferred over customImage when reachable. */
    customImageFile: string;
    imageId: string;
    rank: string;
    /** The Pokédex JSONs carry no loyalty/happiness data; 2/2 are the rulebook
        starting values. */
    loyalty: number;
    happiness: number;
    disobedience: number;
    status: StatusState;
    trainedStats: Record<string, number>;
    skills: CardSkills;
    categoryEnabled: Record<SkillCategory, boolean>;
    categoryRatings: Record<SkillCategory, number>;
    specialties: Specialty[];
    /** Move names added by hand, resolved against the full move list. */
    customMoves: string[];
    /** Per-move edits keyed by move name. */
    moveOverrides: Record<string, MoveOverride>;
    /** Rank filters selected in the filter picker; empty means All. */
    activeFilters: string[];
    /** Drag-and-drop arrangement (move names); empty means the default rank
        order with Custom on top. */
    moveOrder: string[];
    /** Move names pinned to the very top, in pin order, overriding both the
        rank sort and any drag arrangement. */
    pinnedMoves: string[];
    /** The one Move currently under Disable. A single name rather than a list
        because the rules allow only one at a time. */
    disabledMove: string | null;
    customBaseStats: Record<string, number>;
    customMaxStats: Record<string, number>;
    /** New sheets already use the base-0 social model; only sheets saved before
        this flag existed get their social totals migrated. */
    socialBaseZeroMigrated: boolean;
    /** Dual-type Pokémon: which of the two types drives the theme. */
    themeType: string;
    /** A named theme from CUSTOM_THEMES, or '' when the typing above drives the
        page. The two are mutually exclusive. */
    pageTheme: string;
    abilityInUse: string;
    /** An ability picked from the full list, for a Pokémon running one outside
        its species' standard set. */
    customAbility: string;
    /** When this Pokémon is a temporary Mega form, the _id to revert to. */
    megaFrom: string;
    [key: string]: unknown;
}

export interface StatDefault { base: number; max: number }
