/* The type chart, and which abilities grant an outright immunity.

   Lifted verbatim from the inline script — these are rulebook data, not
   derivations, and a transcription slip here would quietly change every
   effectiveness read-out on the card. */

// Defensive type chart, latest gen rules: TYPE_CHART[attacker][defender] = multiplier
export const ALL_TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
    'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

export const TYPE_CHART: Record<string, Record<string, number>> = {
    Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
    Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
    Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
    Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
    Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
    Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
    Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
    Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
    Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
    Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
    Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
    Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
    Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
    Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
    Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
    Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
    Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
    Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 }
};

// Type immunities granted by abilities
export const ABILITY_IMMUNITIES: Record<string, string[]> = {
    'levitate': ['Ground'],
    'flash fire': ['Fire'],
    'well-baked body': ['Fire'],
    'water absorb': ['Water'],
    'storm drain': ['Water'],
    'dry skin': ['Water'],
    'volt absorb': ['Electric'],
    'lightning rod': ['Electric'],
    'motor drive': ['Electric'],
    'sap sipper': ['Grass'],
    'earth eater': ['Ground']
};

export const TYPE_EFF_ROWS = [
    { key: '4', label: '4x' },
    { key: '2', label: '2x' },
    { key: '1', label: '1x' },
    { key: '0.5', label: '1/2x' },
    { key: '0.25', label: '1/4x' },
    { key: '0', label: 'Immune' },
];

/** Every attacking type sorted into its multiplier against this Pokémon. */
export function computeTypeEffectiveness(
    defTypes: string[], abilityName: string,
): Record<string, string[]> {
    const abilityImmune = ABILITY_IMMUNITIES[(abilityName || '').toLowerCase()] || [];
    const buckets: Record<string, string[]> = {
        '4': [], '2': [], '1': [], '0.5': [], '0.25': [], '0': [],
    };
    ALL_TYPES.forEach((attacker) => {
        let mult = 1;
        defTypes.forEach((defender) => {
            const value = (TYPE_CHART[attacker] || {})[defender];
            mult *= value !== undefined ? value : 1;
        });
        if (abilityImmune.includes(attacker)) mult = 0;
        buckets[String(mult)].push(attacker);
    });
    return buckets;
}
