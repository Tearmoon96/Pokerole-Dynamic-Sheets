/* The eight ranks, in order, and what each one is worth.

   A Pokémon created fresh at a rank gets these totals to spend — attribute
   points on top of the species' base stats (each capped at the species'
   maximum for that stat), social points on the five social attributes (capped
   at 5), and specialty points on the sixteen specialties, none of which may
   rise above `specialtyMax`. The table is cumulative: advancing one rank earns
   only the difference between the two rows. */

export const RANKS = [
    'Starter', 'Rookie', 'Standard', 'Advanced', 'Expert', 'Ace', 'Master', 'Champion',
] as const;

export type Rank = typeof RANKS[number];

export interface RankBudget {
    attributes: number;
    social: number;
    specialties: number;
    specialtyMax: number;
}

export const RANK_BUDGET: Record<Rank, RankBudget> = {
    Starter:  { attributes: 0,  social: 0,  specialties: 5,  specialtyMax: 1 },
    Rookie:   { attributes: 2,  social: 2,  specialties: 10, specialtyMax: 2 },
    Standard: { attributes: 4,  social: 4,  specialties: 14, specialtyMax: 3 },
    Advanced: { attributes: 6,  social: 6,  specialties: 17, specialtyMax: 4 },
    Expert:   { attributes: 8,  social: 8,  specialties: 19, specialtyMax: 5 },
    Ace:      { attributes: 10, social: 10, specialties: 20, specialtyMax: 5 },
    Master:   { attributes: 10, social: 10, specialties: 22, specialtyMax: 5 },
    Champion: { attributes: 14, social: 14, specialties: 25, specialtyMax: 5 },
};

/** Position in RANKS, case-insensitively; -1 for anything that is not one of
    the eight (a homebrew rank typed on a sheet, or an empty field). */
export function rankIndex(name: string | undefined | null): number {
    const q = String(name || '').trim().toLowerCase();
    return RANKS.findIndex((r) => r.toLowerCase() === q);
}

/** The canonical spelling of a rank, or null when it is not one of the eight. */
export function asRank(name: string | undefined | null): Rank | null {
    const i = rankIndex(name);
    return i < 0 ? null : RANKS[i];
}
