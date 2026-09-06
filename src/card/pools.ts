import type { PokedexEntry } from '../data/types';
import { defaultStats } from './defaults';
import type { CardSheet, StatDefault } from './types';

/* Resolving a written pool like "Dexterity + Brawl" into a number.

   Everything the card computes — accuracy, damage, the two pool maxes, the
   defences — comes through here, so it is kept as pure functions over
   (species, sheet) rather than reading a global. */

export interface StatSource {
    pokemon: PokedexEntry;
    sheet: CardSheet;
}

export function statDefaults(p: PokedexEntry): Record<string, StatDefault> {
    return defaultStats(p);
}

export function getStatBase({ pokemon, sheet }: StatSource, key: string): number {
    return sheet.customBaseStats[key] !== undefined
        ? sheet.customBaseStats[key] : defaultStats(pokemon)[key].base;
}

export function getStatMax({ pokemon, sheet }: StatSource, key: string): number {
    return sheet.customMaxStats[key] !== undefined
        ? sheet.customMaxStats[key] : defaultStats(pokemon)[key].max;
}

const STAT_KEYS = ['strength', 'dexterity', 'vitality', 'special', 'insight',
    'tough', 'cool', 'beauty', 'cute', 'clever'];

/** One token of a pool string, or null when nothing on this sheet answers to it. */
export function resolvePoolValue(src: StatSource, name: string): number | null {
    const token = name.trim().toLowerCase();
    if (!token) return null;
    const { sheet } = src;

    if (STAT_KEYS.includes(token)) {
        return getStatBase(src, token) + (sheet.trainedStats[token] || 0);
    }
    if (token === 'will' || token === 'willpower') return getPoolMax(src, 'will');
    if (token === 'hp') return getPoolMax(src, 'hp');
    if (token === 'loyalty' || token === 'happiness' || token === 'disobedience') {
        return (sheet[token] as number) || 0;
    }
    if (token in sheet.skills) return (sheet.skills as unknown as Record<string, number>)[token] || 0;
    /* Skills (Fight / Survival / Social / Knowledge): their rating feeds accuracy
       pools whether or not the category toggle is expanded */
    if (token in sheet.categoryRatings) {
        return (sheet.categoryRatings as unknown as Record<string, number>)[token] || 0;
    }
    const spec = sheet.specialties.find((s) => s.name && s.name.toLowerCase() === token);
    if (spec) return spec.value || 0;

    return null;
}

export interface ResolvedPool { total: number; unresolved: string[] }

export function resolvePoolString(src: StatSource, str: string): ResolvedPool {
    const result: ResolvedPool = { total: 0, unresolved: [] };
    if (!str) return result;
    str.split('+').forEach((part) => {
        const token = part.trim();
        if (!token) return;
        // "Tough/Cute" style alternatives: use the best resolvable one
        const alts = token.split('/')
            .map((t) => resolvePoolValue(src, t))
            .filter((v): v is number => v !== null);
        if (alts.length > 0) result.total += Math.max(...alts);
        else result.unresolved.push(token);
    });
    return result;
}

export function formatPoolTotal(resolved: ResolvedPool, flat: number): string {
    const total = flat + resolved.total;
    if (total === 0 && resolved.unresolved.length > 0) return resolved.unresolved.join(' + ');
    let s = String(total);
    if (resolved.unresolved.length > 0) s += ' + ' + resolved.unresolved.join(' + ');
    return s;
}

export function derivedPoolMax(src: StatSource, key: 'hp' | 'will'): number {
    if (key === 'hp') return src.pokemon.BaseHP + (resolvePoolValue(src, 'Vitality') || 0);
    return (resolvePoolValue(src, 'Insight') || 0) + 3;
}

export function getPoolMax(src: StatSource, key: 'hp' | 'will'): number {
    const bonus = (key === 'hp' ? src.sheet.hpMaxBonus : src.sheet.willMaxBonus) || 0;
    return Math.max(1, derivedPoolMax(src, key) + bonus);
}

/* Def is Vitality and Sp.Def is Insight, each plus a hand-set offset.

   The offset is DISPLAY ONLY and deliberately never reaches resolvePoolValue:
   Vitality and Insight feed real dice pools (Clash, Initiative, the HP and Will
   maxes), while Def is a number the other side of the table reads off this
   sheet. Folding the offset into the attribute would quietly change every roll
   that uses it. */
export interface Defence { base: number; bonus: number; total: number }

export function defenceValue(src: StatSource, key: 'def' | 'spDef'): Defence {
    const base = resolvePoolValue(src, key === 'def' ? 'Vitality' : 'Insight') || 0;
    const bonus = (key === 'def' ? src.sheet.defBonus : src.sheet.spDefBonus) || 0;
    return { base, bonus, total: Math.max(0, base + bonus) };
}

/** +-10 is far past anything the rules produce, and stops a stuck key running away. */
export const DEFENCE_BONUS_CAP = 10;

/** A wounded Pokémon takes a success off the result of a roll. */
export function painPenalty(src: StatSource): number {
    if (src.sheet.hp <= 1) return 2;
    if (src.sheet.hp <= Math.floor(getPoolMax(src, 'hp') / 2)) return 1;
    return 0;
}
