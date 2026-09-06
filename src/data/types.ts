/* Record shapes of the generated bundles under app-data/.
   These files are produced by the Python scripts on the dev-data branch, so
   the types describe them — they must never drive a change to the data. */

export interface Measure { Meters?: number; Feet?: number; Kilograms?: number; Pounds?: number }

export interface PokemonEvolution {
    Name?: string;
    Kind?: string;
    /** The two ends of the chain; absent means "this species". */
    From?: string;
    To?: string;
    Speed?: string;
    Stat?: string;
    Value?: number;
    Item?: string;
    Stone?: string;
    Move?: string;
    Gender?: string;
    Region?: string;
    Game?: string;
    Special?: string;
    [key: string]: unknown;
}

export interface PokemonLearnedMove { Learned?: string; Name?: string;[key: string]: unknown }

/** One entry of window.ALL_POKEMON. */
export interface PokedexEntry {
    Number: number;
    DexID: string;
    Name: string;
    Type1: string;
    Type2: string;
    BaseHP: number;
    Strength: number; MaxStrength: number;
    Dexterity: number; MaxDexterity: number;
    Vitality: number; MaxVitality: number;
    Special: number; MaxSpecial: number;
    Insight: number; MaxInsight: number;
    Ability1: string; Ability2: string; HiddenAbility: string; EventAbilities: string;
    RecommendedRank: string;
    GenderType: string;
    Legendary: boolean;
    GoodStarter: boolean;
    _id: string;
    DexCategory: string;
    Height: Measure;
    Weight: Measure;
    DexDescription: string;
    Evolutions: PokemonEvolution[];
    Image: string;
    Moves: PokemonLearnedMove[];
}

/** One entry of window.ALL_MOVES. */
export interface MoveEntry {
    Name: string;
    Type: string;
    Power: number;
    Damage1: string; Damage2: string;
    Accuracy1: string; Accuracy2: string;
    Target: string;
    Effect: string;
    Description?: string;
    Category?: string;
    _id?: string;
    [key: string]: unknown;
}

/** One entry of window.ALL_ITEMS. */
export interface ItemEntry {
    Name: string;
    _id: string;
    Source: string;
    PMD: boolean;
    Pocket: string;
    Category: string;
    Description: string;
    OneUse: boolean;
    TrainerPrice: string;
    ForPokemon: boolean | string;
    Image: string;
}

/** One entry of window.ALL_ABILITIES. */
export interface AbilityEntry {
    Name: string;
    Effect: string;
    Description: string;
    _id?: string;
    [key: string]: unknown;
}

/** One entry of window.ALL_NATURES. */
export interface NatureEntry {
    Name: string;
    Nature: string;
    Confidence: number;
    Keywords: string;
    Description: string;
    _id: string;
}

/** One entry of EQUIP_ICONS / EQUIP_ICONS_MONO: n = name, c = category, f = file. */
export interface EquipIcon { n: string; c: string; f: string }

/** SPRITE_FRAMES: sprite path -> [x, y, zoom] in thousandths of the well. */
export type SpriteFrames = Record<string, [number, number, number]>;

/** Everything the loader hands back once app-data has finished loading. */
export interface AppData {
    pokemon: PokedexEntry[];
    moves: MoveEntry[];
    items: ItemEntry[];
    abilities: AbilityEntry[];
    natures: NatureEntry[];
    equipIcons: EquipIcon[];
    equipIconsMono: EquipIcon[];
    equipIconDir: string;
    equipIconMonoDir: string;
    spriteFrames: SpriteFrames;
    version: string;
    repo: string;
}
