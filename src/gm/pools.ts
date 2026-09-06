import type { PokedexEntry } from '../data/types';
import type { CardSheet } from '../card/types';
import type { TrainerState } from '../state/types';

/* Dice pools, ported from the Pokémon card.

   Everything here mirrors the card's own functions with the sheet passed in
   instead of read off a module-level `sheetState`. The card is the reference: if
   its maths changes, these have to follow or the GM screen starts quoting
   numbers the card disagrees with. */

export const COMBAT_STATS = ['strength', 'dexterity', 'vitality', 'special', 'insight'];
export const SOCIAL_STATS = ['tough', 'cool', 'beauty', 'cute', 'clever'];

/** Social attributes have no source in the Pokédex JSONs, so their base is 0 and
    every dot is user-set — same as the card's defaultStats. */
export function statBase(dex: PokedexEntry | null, sheet: Partial<CardSheet> | null, key: string): number {
    const custom = sheet && sheet.customBaseStats;
    if (custom && custom[key] !== undefined) return custom[key];
    if (SOCIAL_STATS.includes(key)) return 0;
    return (dex && (dex as unknown as Record<string, number>)[key.charAt(0).toUpperCase() + key.slice(1)]) || 0;
}

/** An attribute as the sheet has it: species base (or the card's custom
    override) plus whatever was trained into it. */
export function monStat(dex: PokedexEntry | null, sheet: Partial<CardSheet> | null, key: string): number {
    return statBase(dex, sheet, key)
        + ((sheet && sheet.trainedStats && sheet.trainedStats[key]) || 0);
}

export function monPoolMax(
    dex: PokedexEntry | null, sheet: Partial<CardSheet> | null, key: 'hp' | 'will',
): number {
    if (key === 'hp') {
        if (sheet && sheet.hpMax != null) return sheet.hpMax;
        return Math.max(1, ((dex && dex.BaseHP) || 0) + monStat(dex, sheet, 'vitality')
            + ((sheet && sheet.hpMaxBonus) || 0));
    }
    if (sheet && sheet.willMax != null) return sheet.willMax;
    return Math.max(1, monStat(dex, sheet, 'insight') + 3 + ((sheet && sheet.willMaxBonus) || 0));
}

export function trainerPoolMax(t: TrainerState, key: 'hp' | 'will'): number {
    const stats = t.stats || ({} as TrainerState['stats']);
    if (key === 'hp') {
        if (t.hpMax != null) return t.hpMax;
        return Math.max(1, 4 + (stats.vitality || 0) + (t.hpMaxBonus || 0));
    }
    if (t.willMax != null) return t.willMax;
    return Math.max(1, (stats.insight || 0) + 3 + (t.willMaxBonus || 0));
}

/** A trainer's dice pools: the sheet keeps stats and skills flat, with no
    species behind them. */
export function trainerPoolValue(data: TrainerState, name: string): number {
    const token = String(name || '').trim().toLowerCase();
    const stats = data.stats as unknown as Record<string, number> | undefined;
    const skills = data.skills as unknown as Record<string, number> | undefined;
    if (stats && token in stats) return stats[token] || 0;
    if (skills && token in skills) return skills[token] || 0;
    if (token === 'will' || token === 'willpower') return trainerPoolMax(data, 'will');
    if (token === 'hp') return trainerPoolMax(data, 'hp');
    const extra = (data.extras || []).find((e) => e && e.name && e.name.toLowerCase() === token);
    return extra ? (extra.value || 0) : 0;
}

export function resolvePoolValue(
    dex: PokedexEntry | null, sheet: Partial<CardSheet> | null, name: string,
): number | null {
    const token = String(name || '').trim().toLowerCase();
    if (!token) return null;
    const s = (sheet || {}) as Partial<CardSheet>;
    if (COMBAT_STATS.includes(token) || SOCIAL_STATS.includes(token)) {
        return statBase(dex, s, token) + ((s.trainedStats && s.trainedStats[token]) || 0);
    }
    if (token === 'will' || token === 'willpower') return monPoolMax(dex, s, 'will');
    if (token === 'hp') return monPoolMax(dex, s, 'hp');
    if (token === 'loyalty' || token === 'happiness' || token === 'disobedience') {
        return (s as unknown as Record<string, number>)[token] || 0;
    }
    const skills = s.skills as unknown as Record<string, number> | undefined;
    if (skills && token in skills) return skills[token] || 0;
    const cats = s.categoryRatings as unknown as Record<string, number> | undefined;
    if (cats && token in cats) return cats[token] || 0;
    const spec = (s.specialties || []).find((x) => x && x.name && x.name.toLowerCase() === token);
    if (spec) return spec.value || 0;
    return null;
}

export interface ResolvedPool { total: number; unresolved: string[] }

export function resolvePoolString(
    dex: PokedexEntry | null, sheet: Partial<CardSheet> | null, str: string,
): ResolvedPool {
    const result: ResolvedPool = { total: 0, unresolved: [] };
    if (!str) return result;
    String(str).split('+').forEach((part) => {
        const token = part.trim();
        if (!token) return;
        // "Tough/Cute" style alternatives: use the best resolvable one
        const alts = token.split('/')
            .map((t) => resolvePoolValue(dex, sheet, t))
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
