import type { PokedexEntry } from '../data/types';
import type { CardSheet, StatDefault } from './types';

/** Where a species' attributes start, before any training or hand edit. */
export function defaultStats(p: PokedexEntry): Record<string, StatDefault> {
    return {
        strength: { base: p.Strength, max: p.MaxStrength },
        dexterity: { base: p.Dexterity, max: p.MaxDexterity },
        vitality: { base: p.Vitality, max: p.MaxVitality },
        special: { base: p.Special, max: p.MaxSpecial },
        insight: { base: p.Insight, max: p.MaxInsight },
        /* Social attributes have no source in the Pokédex JSONs; base 0 so every
           dot is user-set and a value of 0 is reachable (max 5) */
        tough: { base: 0, max: 5 },
        cool: { base: 0, max: 5 },
        beauty: { base: 0, max: 5 },
        cute: { base: 0, max: 5 },
        clever: { base: 0, max: 5 },
    };
}

export const COMBAT_STAT_KEYS = ['strength', 'dexterity', 'vitality', 'special', 'insight'] as const;
export const SOCIAL_STAT_KEYS = ['tough', 'cool', 'beauty', 'cute', 'clever'] as const;
export const ALL_STAT_KEYS = [...COMBAT_STAT_KEYS, ...SOCIAL_STAT_KEYS];

export function defaultCardSheet(p: PokedexEntry): CardSheet {
    return {
        /* Base HP is where every Pokémon starts, but the egg's is 1 of a pool of
           2 and a fresh egg is not meant to open damaged, so it starts on its
           full pool instead. */
        hp: p._id === 'egg' ? p.BaseHP + p.Vitality : p.BaseHP,
        will: 5,
        hpMaxBonus: 0,
        willMaxBonus: 0,
        defBonus: 0,
        spDefBonus: 0,
        hpMax: null,
        willMax: null,
        exp: 0,
        notes: '',
        heldItem: '',
        nature: '',
        gender: '',
        nickname: '',
        customImage: '',
        spriteType: 'Home',
        spriteScales: {},
        spriteOffsets: {},
        customImageFile: '',
        imageId: '',
        rank: '',
        loyalty: 2,
        happiness: 2,
        disobedience: 0,
        status: {
            major: null,
            burnDegree: 0,
            poisonStage: 0,
            confusion: false,
            flinch: false,
            inLove: false,
        },
        trainedStats: {},
        skills: {
            brawl: 0, channel: 0, clash: 0, evasion: 0,
            alert: 0, athletic: 0, nature: 0, stealth: 0,
            charm: 0, empathy: 0, intimidate: 0, perform: 0,
            craft: 0, etiquette: 0, medicine: 0, science: 0,
        },
        categoryEnabled: { fight: false, survival: false, social: false, knowledge: false },
        categoryRatings: { fight: 0, survival: 0, social: 0, knowledge: 0 },
        specialties: [],
        customMoves: [],
        moveOverrides: {},
        activeFilters: [],
        moveOrder: [],
        pinnedMoves: [],
        disabledMove: null,
        customBaseStats: {},
        customMaxStats: {},
        socialBaseZeroMigrated: true,
        themeType: '',
        pageTheme: '',
        abilityInUse: '',
        customAbility: '',
        megaFrom: '',
    };
}
