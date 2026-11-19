import type { PokedexEntry, PokemonEvolution } from '../data/types';
import { ALL_STAT_KEYS, COMBAT_STAT_KEYS, defaultStats } from './defaults';
import type { StatDefault } from './types';
import { getPoolMax, getStatBase, getStatMax } from './pools';
import type { StatSource } from './pools';
import type { CardSheet } from './types';

/* Reading the dex's Evolutions entries, which come in several shapes. */

const EVO_GENDER_LOCK: Record<string, string> = {
    'Snorunt>Froslass': 'Female',
    'Kirlia>Gallade': 'Male',
    'Lechonk>Oinkologne (Male Form)': 'Male',
    'Lechonk>Oinkologne (Female Form)': 'Female',
};

export const GENDER_SYMBOL: Record<string, string> = { Male: '♂', Female: '♀' };

/** Gender this evolution is locked to, or '' — the dex either tags it as
    Gender, hides it in Special (Basculegion), or omits it entirely. */
export function evoGender(p: PokedexEntry, evo: PokemonEvolution): string {
    if (evo.Gender) return evo.Gender;
    if (evo.Special === 'Male' || evo.Special === 'Female') return evo.Special;
    const self = p.Name;
    return EVO_GENDER_LOCK[(evo.From || self) + '>' + (evo.To || self)] || '';
}

/** Human label for one evolution entry, covering every shape in the dex. The
    Evolutions panel shows the gender as its own badge, so it can ask for the
    label without it. */
export function evoMethodLabel(p: PokedexEntry, evo: PokemonEvolution, skipGender?: boolean): string {
    const bits: string[] = [];
    const gender = evoGender(p, evo);
    if (evo.Kind === 'Level') bits.push(evo.Speed ? `Level (${evo.Speed})` : 'Level');
    if (evo.Kind === 'Trade') bits.push('Trade');
    if (evo.Kind === 'Form') bits.push('Form');
    /* A Mega and its stone read as one thing: "Mega Charizardite X" */
    if (evo.Kind === 'Mega') bits.push(('Mega ' + (evo.Item || '')).trim());
    else if (evo.Item) bits.push(evo.Item);
    if (evo.Stone) bits.push(evo.Stone);
    if (evo.Stat) bits.push((evo.Stat + ' ' + (evo.Value || '')).trim());
    if (evo.Move) bits.push('knows ' + evo.Move);
    if (evo.Special && evo.Special !== gender) bits.push(evo.Special);
    if (gender && !skipGender) bits.push(GENDER_SYMBOL[gender] || gender);
    if (evo.Region) bits.push(evo.Region);
    if (evo.Game) bits.push(evo.Game);
    return bits.join(', ') || evo.Kind || '?';
}

/** The dataset's #0000 placeholder entry, used for an un-hatched egg. It has no
    dex category and no real art, so parts of the card special-case it. */
export function isEgg(p: PokedexEntry): boolean {
    return p._id === 'egg';
}

export interface EvolutionTarget { id: string; name: string; method: string }

function nameToId(all: PokedexEntry[], name: string): string | null {
    const p = all.find((x) => x.Name === name);
    return p ? p._id : null;
}

export function forwardEvolutions(all: PokedexEntry[], p: PokedexEntry): EvolutionTarget[] {
    return (p.Evolutions || [])
        .filter((e) => e.To && e.Kind !== 'Mega')
        .map((e) => ({ id: nameToId(all, e.To!), name: e.To!, method: evoMethodLabel(p, e) }))
        .filter((e): e is EvolutionTarget => !!e.id);
}

export function megaEvolutions(all: PokedexEntry[], p: PokedexEntry): EvolutionTarget[] {
    return (p.Evolutions || [])
        .filter((e) => e.To && e.Kind === 'Mega')
        .map((e) => ({ id: nameToId(all, e.To!), name: e.To!, method: evoMethodLabel(p, e) }))
        .filter((e): e is EvolutionTarget => !!e.id);
}

export function isMegaForm(p: PokedexEntry): boolean {
    return (p.Evolutions || []).some((e) => e.Kind === 'Mega' && e.From);
}

export function megaRevertTargetId(
    all: PokedexEntry[], p: PokedexEntry, sheet: CardSheet,
): string | null {
    if (sheet.megaFrom) return sheet.megaFrom;
    const e = (p.Evolutions || []).find((x) => x.Kind === 'Mega' && x.From);
    return e ? nameToId(all, e.From!) : null;
}

/** How a Mega Evolution carries the attributes over (src/card/mega.ts). An
    ordinary evolution passes neither: trained points carry, cut to fit the
    new species' limits. */
export interface EvolveOpts {
    /** false: the trained attributes and the Def / Sp. Def offsets stay
        behind, and the new form starts at its species' own values. */
    carryTrained?: boolean;
    /** true: carried points are never cut to fit; a limit they pass is
        raised to where they land. */
    liftCap?: boolean;
}

const isCombat = (key: string) => (COMBAT_STAT_KEYS as readonly string[]).includes(key);

/** A hand-edited base or limit is an offset from the species' own, and belongs
    to the Pokémon in every form: Dexterity 5 raised to 7 is +2, so a form
    whose Dexterity limit is 6 gets 8. Social attributes have no base. */
export function offsetLimits(
    def: StatDefault, baseOff: number, capOff: number, combat: boolean,
): { base: number; max: number } {
    const base = combat ? Math.max(1, def.base + baseOff) : 0;
    return { base, max: Math.max(1, base, def.max + capOff) };
}

/* Build the sheet for the target form: clone everything, then rebase the stats
   and pick the right ability. The hand-edited bases and limits carry over as
   offsets (offsetLimits); the trained points carry on top of them. */
export function buildEvolvedSheet(src: StatSource, targetDex: PokedexEntry, opts: EvolveOpts = {}): CardSheet {
    const s: CardSheet = JSON.parse(JSON.stringify(src.sheet));
    s.trainedStats = s.trainedStats || {};
    /* Read before the stats are rebased: a Pokémon evolving at full health comes
       out of it at full health, one that was hurt keeps exactly the HP it had.
       Same for Will. */
    const wasFull = {
        hp: src.sheet.hp >= getPoolMax(src, 'hp'),
        will: src.sheet.will >= getPoolMax(src, 'will'),
    };

    const from = defaultStats(src.pokemon), to = defaultStats(targetDex);
    const bases: Record<string, number> = {}, caps: Record<string, number> = {};
    ALL_STAT_KEYS.forEach((key) => {
        const combat = isCombat(key);
        const { base, max } = offsetLimits(to[key],
            getStatBase(src, key) - from[key].base, getStatMax(src, key) - from[key].max, combat);
        let trained = Math.max(0, src.sheet.trainedStats?.[key] || 0);
        let cap = max;
        if (combat && opts.carryTrained === false) trained = 0;
        /* A limit the carried points are let past is raised to where they land. */
        else if (combat && opts.liftCap) cap = Math.max(max, base + trained);
        else trained = Math.min(trained, max - base);
        s.trainedStats[key] = trained;
        if (base !== to[key].base) bases[key] = base;
        if (cap !== to[key].max) caps[key] = cap;
    });
    s.customBaseStats = bases;
    s.customMaxStats = caps;
    if (opts.carryTrained === false) { s.defBonus = 0; s.spDefBonus = 0; delete s.combatMods; }

    /* Keep the chosen ability if the new form still has it, or if it is a custom
       ability (which is not tied to the species), else default */
    const evoAbilities = [targetDex.Ability1, targetDex.Ability2, targetDex.HiddenAbility].filter(Boolean);
    const keepAbility = evoAbilities.includes(src.sheet.abilityInUse)
        || (!!src.sheet.customAbility && src.sheet.abilityInUse === src.sheet.customAbility);
    s.abilityInUse = keepAbility ? src.sheet.abilityInUse : '';

    /* The pools are derived, so the new form's Base HP and rebased Vitality /
       Insight resize them on their own; only the current values need deciding. */
    const after: StatSource = { pokemon: targetDex, sheet: s };
    const newHpMax = getPoolMax(after, 'hp'), newWillMax = getPoolMax(after, 'will');
    s.hp = wasFull.hp ? newHpMax : Math.min(s.hp, newHpMax);
    s.will = wasFull.will ? newWillMax : Math.min(s.will, newWillMax);
    return s;
}
