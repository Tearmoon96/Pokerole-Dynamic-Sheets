import type { PokedexEntry } from '../data/types';
import type { Gender } from './types';

/* What the dex says about a species' gender. `GenderType` is '' for a species
   that comes in both, 'M' or 'F' for a single-gender one, and 'N' for the
   genderless — 203 of them, from Magnemite to every legendary. The card used
   to let all of them cycle ♂/♀ regardless. */

export type SpeciesGender = '' | 'M' | 'F' | 'N';

export function speciesGender(p: PokedexEntry): SpeciesGender {
    const t = String(p.GenderType || '').toUpperCase();
    return t === 'M' || t === 'F' || t === 'N' ? t : '';
}

/** The one gender a sheet of this species can carry, or null when it is the
    player's choice. Genderless is stored as '' — the same "unset" a sheet has
    before anyone picks — so nothing downstream needs a fourth value. */
export function lockedGender(p: PokedexEntry): Gender | null {
    const t = speciesGender(p);
    if (t === 'N') return '';
    if (t === 'M' || t === 'F') return t;
    return null;
}
