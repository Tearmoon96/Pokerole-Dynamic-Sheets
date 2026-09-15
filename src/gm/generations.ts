import type { PokedexEntry } from '../data/types';

/* Which generation a dex entry belongs to — the one it was introduced in.

   Not in the dataset, so it is read off the dex number, which the games
   hand out in order: the nine ranges below are the National Dex's own
   boundaries. A FORM is placed where the form appeared, not where its
   species did: an Alolan Raichu is Gen 7, a Galarian or Hisuian form Gen 8,
   a Paldean one Gen 9, every Mega and the two Primals Gen 6 — a GM asking
   for "Gen 1" wants Kanto's Pokémon, and a Galarian Zapdos is not one of
   them. A handful of forms are neither regional nor Mega and were still
   introduced later than their species; those are named in FORMS. Everything
   else — Rotom's appliances, the Therian forms, Deoxys, Oricorio, the Crown
   forms — arrived with its species or in the same generation. */

export const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** The last National Dex number of each generation. */
const LAST_NUMBER = [151, 251, 386, 493, 649, 721, 809, 905, 1025];

/** Forms introduced in a later generation than their species, by `_id`. */
const FORMS: Record<string, number> = {
    'dialga-origin-form': 8,        // Legends: Arceus
    'palkia-origin-form': 8,
    'zygarde-10': 7,                // Sun and Moon
    'zygarde-100': 7,
    'zygarde-cell': 7,
    'greninja-battle-bond-form': 7,
    'ursaluna-kitakami-form': 9,    // The Teal Mask
};

export function generationOf(p: PokedexEntry): number {
    const own = FORMS[p._id];
    if (own) return own;
    if (/\((Mega|Primal)\b/.test(p.Name)) return 6;
    if (/\(Alolan Form\)/.test(p.Name)) return 7;
    if (/\((Galarian|Hisuian)\b/.test(p.Name)) return 8;
    if (/\(Paldean Form\)/.test(p.Name)) return 9;
    const i = LAST_NUMBER.findIndex((last) => p.Number <= last);
    return i < 0 ? GENERATIONS[GENERATIONS.length - 1] : GENERATIONS[i];
}

/** Whether the entry is from any of the generations asked for. None
    asked for — or all nine — is a yes. */
export function inGeneration(p: PokedexEntry, gens: readonly number[]): boolean {
    const asked = GENERATIONS.filter((g) => gens.includes(g));
    if (!asked.length || asked.length === GENERATIONS.length) return true;
    return asked.includes(generationOf(p) as typeof GENERATIONS[number]);
}
