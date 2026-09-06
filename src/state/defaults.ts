import { BOX_COUNT, EQUIP_SLOTS } from './constants';
import type {
    Achievement, Badge, BoxEntry, Equipment, TeamSlot, TrainerState,
} from './types';

export function genId(): string {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* A Pokémon's own id, kept as it moves between the team and the PC boxes. The
   Pokémon card used to be addressed by team slot index alone, so anything that
   moved a Pokémon left an open card tab writing into whatever took its place. */
export function genUid(): string {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* Claim a uid for one Pokémon, unique within this trainer.

   Sheets written before the PC box existed carry no uids, and those get a
   *deterministic* one from where they sit ('t0', 'b1-4', …) rather than a
   random draw. normalizeState runs on both the restored session and the copy on
   disk when a restore is verified, and two random draws would make an untouched
   trainer look like it had diverged from its own file. */
export function takeUid(existing: unknown, fallback: string, pool: Set<string>): string {
    let uid = (typeof existing === 'string' && existing) ? existing : fallback;
    while (pool.has(uid)) uid = genUid();   // hand-edited duplicates only
    pool.add(uid);
    return uid;
}

/** Each slot links a species (dexId) to its full Pokémon-card sheet, stored
    right here so one JSON per trainer holds everything. */
export function defaultTeam(): TeamSlot[] {
    return Array.from({ length: 6 }, () => ({ dexId: '', sheet: null, preview: null }));
}

export function defaultBoxes(): BoxEntry[] {
    return Array.from({ length: BOX_COUNT }, (_, i) => ({ name: 'Box ' + (i + 1), mons: [] }));
}

export function defaultAchievements(): Achievement[] {
    return Array.from({ length: 5 }, () => ({ text: '', done: false }));
}

/** Each badge: earned flag + the Pokémon type chosen when earned. */
export function defaultBadges(): Badge[] {
    return Array.from({ length: 8 }, () => ({ earned: false, type: '' }));
}

/** One entry per equipment slot; '' icon = use the slot's default silhouette. */
export function defaultEquipment(): Equipment {
    const eq: Equipment = {};
    EQUIP_SLOTS.forEach((s) => { eq[s.key] = { name: '', notes: '', icon: '' }; });
    return eq;
}

export function defaultState(): TrainerState {
    return {
        id: genId(),
        name: '',
        player: '',
        gender: '',
        photo: '',
        photoFile: '',
        photoAdjust: { scale: 1, offsetX: 0, offsetY: 0 },
        themeType: 'License',
        stats: {
            strength: 1, dexterity: 1, vitality: 1, special: 1, insight: 1,
            tough: 1, cool: 1, beauty: 1, cute: 1, clever: 1,
        },
        skills: {
            brawl: 0, channel: 0, clash: 0, evasion: 0,
            alert: 0, athletic: 0, nature: 0, stealth: 0,
            charm: 0, empathy: 0, intimidate: 0, perform: 0,
            craft: 0, lore: 0, medicine: 0, science: 0,
        },
        extras: [{ name: '', value: 0 }, { name: '', value: 0 }],
        achievements: defaultAchievements(),
        nature: '',
        rank: '',
        hp: 5,
        will: 4,
        hpMaxBonus: 0,
        willMaxBonus: 0,
        hpMax: null,
        willMax: null,
        exp: 0,
        age: '',
        money: 1500,
        team: defaultTeam(),
        boxes: defaultBoxes(),
        activeBox: 0,
        boxSpriteType: 'Home',
        boxUseCustom: true,
        bagOut: [],
        bagBattle: [],
        potionCharges: {
            potion: [true, true],
            superPotion: [true, true, true, true],
            hyperPotion: Array.from({ length: 14 }, () => true),
        },
        potionQty: { potion: 0, superPotion: 0, hyperPotion: 0 },
        otherMeds: '',
        badges: defaultBadges(),
        equipment: defaultEquipment(),
        equipBag: [],
        notes: '',
        manualBookmarks: {},
    };
}

/** HP follows Vitality, Will follows Insight. */
export function derivedPoolMax(key: 'hp' | 'will', state: TrainerState): number {
    return key === 'hp' ? 4 + state.stats.vitality : state.stats.insight + 3;
}

/** The pool size actually shown: the derived max plus any manual resize. */
export function poolMax(key: 'hp' | 'will', state: TrainerState): number {
    const bonus = (key === 'hp' ? state.hpMaxBonus : state.willMaxBonus) || 0;
    return Math.max(1, derivedPoolMax(key, state) + bonus);
}
