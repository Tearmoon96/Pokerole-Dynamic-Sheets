import type { PokedexEntry } from '../data/types';
import type { MegaRules } from '../lib/megaRules';
import { buildEvolvedSheet } from './evolution';
import { getPoolMax } from './pools';
import type { StatSource } from './pools';
import type { CardSheet, StatusState } from './types';
import type { CombatMods } from '../lib/combatMods';

/* Mega Evolving and reverting, by the rules in force (src/lib/megaRules.ts).
   Pure: (sheet, species, rules) -> sheet. The card (CardApp) and the rolling
   table's character panel both call these and write the result where the
   sheet lives.

   What the original form was when it transformed is kept on the Mega's sheet
   (`megaStash`), so the revert can give it back: its HP, Will and status when
   the original form is unaffected, and always its own attributes — a Mega's
   carried-over points may be past its limits, and must not be cut on the way
   back. A Mega that keeps its own moveset (`megaMoves`) files its pins under
   `megaPinned[<mega id>]` on revert, and finds them there next time. */

export interface MegaStash {
    hp: number;
    will: number;
    status: StatusState;
    trainedStats: Record<string, number>;
    customBaseStats: Record<string, number>;
    customMaxStats: Record<string, number>;
    defBonus: number;
    spDefBonus: number;
    /** Absent on a stash made before combat offsets existed. */
    combatMods?: CombatMods;
    pinnedMoves: string[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const freshStatus = (): StatusState => ({
    major: null, burnDegree: 0, poisonStage: 0, confusion: false, flinch: false, inLove: false,
});

/** "Charizard (Mega X Form)" -> "Mega Charizard X"; any other name as it is. */
export function megaShownName(name: string): string {
    const m = /^(.*?)\s*\(Mega(?:\s+([XYZ]))?\s+Form\)$/.exec(name || '');
    return m ? 'Mega ' + m[1] + (m[2] ? ' ' + m[2] : '') : name;
}

/** Why a Pokémon cannot Mega Evolve now under these rules, or ''. */
export function megaBlocker(sheet: Pick<CardSheet, 'will'>, rules: MegaRules): string {
    if (rules.costOn && (sheet.will || 0) < rules.cost) {
        return 'Mega Evolving costs ' + rules.cost + ' Will, and it has ' + (sheet.will || 0) + '.';
    }
    return '';
}

/** Whether the Mega form has a moveset of its own saved from last time. */
export function savedMegaMoves(sheet: Partial<CardSheet>, megaId: string): string[] | null {
    const saved = (sheet.megaPinned as Record<string, string[]> | undefined)?.[megaId];
    return Array.isArray(saved) ? saved : null;
}

/** What Mega Evolving (`into`) or reverting will do under these rules, one
    line each, for the confirmations on the card and at the table. */
export function megaEffects(rules: MegaRules, sheet: Partial<CardSheet>, into: boolean): string[] {
    const out: string[] = [];
    if (into) {
        if (rules.costOn) {
            const w = sheet.will || 0;
            out.push('Costs ' + rules.cost + ' Will (' + w + ' → ' + Math.max(0, w - rules.cost) + ').');
        }
        if (rules.hpOn) out.push(rules.hpAll ? 'Restores all its HP.' : 'Restores ' + rules.hp + ' HP.');
        if (rules.willOn) out.push(rules.willAll ? 'Restores all its Will.' : 'Restores ' + rules.will + ' Will.');
        if (rules.statusOn) out.push('Heals every status condition.');
        out.push(rules.keepBoosts
            ? 'Trained attributes (vitamins too) and Def / Sp. Def offsets carry over'
                + (rules.beyondLimit ? ', past the Mega’s limits if need be.' : ', up to the Mega’s limits.')
            : 'It starts from the Mega’s own attributes; its trained points come back on revert.');
        if (rules.lockStone) out.push('The Mega Stone cannot be taken, switched or removed while it lasts.');
    } else {
        out.push(rules.keepOriginal
            ? 'The original form comes back with the HP, Will and status it had before.'
            : 'The original form takes the Mega’s HP, Will and status'
                + (rules.lethalStays ? ', but not a knockout.' : '.'));
        out.push('Its own attributes come back as they were.');
        if (sheet.megaMoves) out.push('The Mega’s moves are kept for next time; the original moves come back.');
    }
    return out;
}

/** `src` is the original form; `target` the Mega. `ownMoves`: the Mega uses a
    moveset of its own (asked only when the rules say so). */
export function megaEvolveSheet(
    src: StatSource, target: PokedexEntry, rules: MegaRules, ownMoves: boolean,
): { sheet: CardSheet } | { error: string } {
    const blocked = megaBlocker(src.sheet, rules);
    if (blocked) return { error: blocked };

    /* The cost comes off the original form: it is what spent the Will. */
    const before: CardSheet = clone(src.sheet);
    if (rules.costOn) before.will = Math.max(0, (before.will || 0) - rules.cost);

    const stash: MegaStash = {
        hp: before.hp, will: before.will, status: clone(before.status),
        trainedStats: clone(before.trainedStats || {}),
        customBaseStats: clone(before.customBaseStats || {}),
        customMaxStats: clone(before.customMaxStats || {}),
        defBonus: before.defBonus || 0, spDefBonus: before.spDefBonus || 0,
        ...(before.combatMods ? { combatMods: clone(before.combatMods) } : {}),
        pinnedMoves: [...(before.pinnedMoves || [])],
    };

    const s = buildEvolvedSheet({ pokemon: src.pokemon, sheet: before }, target,
        { carryTrained: rules.keepBoosts, liftCap: rules.beyondLimit });
    const mega: StatSource = { pokemon: target, sheet: s };

    const heal = (key: 'hp' | 'will', on: boolean, all: boolean, n: number) => {
        if (!on) return;
        const max = getPoolMax(mega, key);
        s[key] = all ? max : Math.min(max, (s[key] || 0) + n);
    };
    heal('hp', rules.hpOn, rules.hpAll, rules.hp);
    heal('will', rules.willOn, rules.willAll, rules.will);
    if (rules.statusOn) s.status = freshStatus();

    if (rules.moves && ownMoves) {
        s.megaMoves = true;
        s.pinnedMoves = [...(savedMegaMoves(src.sheet, target._id) ?? [])];
    } else {
        delete s.megaMoves;
    }
    s.megaFrom = src.pokemon._id;
    s.megaStash = stash;
    return { sheet: s };
}

/** `src` is the Mega; `base` the form it reverts to. */
export function megaRevertSheet(src: StatSource, base: PokedexEntry, rules: MegaRules): CardSheet {
    const s = buildEvolvedSheet(src, base);
    const stash = src.sheet.megaStash as MegaStash | undefined;
    if (stash) {
        /* The original form's own attributes, exactly: nothing a Mega carried
           or had lifted belongs to it. */
        s.trainedStats = clone(stash.trainedStats);
        s.customBaseStats = clone(stash.customBaseStats);
        s.customMaxStats = clone(stash.customMaxStats);
        s.defBonus = stash.defBonus;
        s.spDefBonus = stash.spDefBonus;
        if (stash.combatMods) s.combatMods = clone(stash.combatMods);
        else delete s.combatMods;
        const back: StatSource = { pokemon: base, sheet: s };
        const hpMax = getPoolMax(back, 'hp'), willMax = getPoolMax(back, 'will');
        if (rules.keepOriginal) {
            s.hp = Math.min(stash.hp, hpMax);
            s.will = Math.min(stash.will, willMax);
            s.status = clone(stash.status);
        } else {
            const megaFull = (src.sheet.hp || 0) >= getPoolMax(src, 'hp');
            s.hp = megaFull ? hpMax : Math.min(src.sheet.hp || 0, hpMax);
            s.will = Math.min(src.sheet.will || 0, willMax);
            /* Knocked out as a Mega: the original form is not. */
            if (rules.lethalStays && (src.sheet.hp || 0) <= 0) s.hp = Math.min(stash.hp, hpMax);
        }
        if (src.sheet.megaMoves) {
            s.megaPinned = {
                ...((src.sheet.megaPinned as Record<string, string[]>) || {}),
                [src.pokemon._id]: [...(src.sheet.pinnedMoves || [])],
            };
            s.pinnedMoves = [...stash.pinnedMoves];
        }
    }
    delete s.megaStash;
    delete s.megaMoves;
    s.megaFrom = '';
    return s;
}
