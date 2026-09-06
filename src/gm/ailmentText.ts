import type { EntityRef } from './entities';

/* The Ailments & Conditions reference, as the popover shows it.

   The Pokémon card carries the same text in src/card/ailmentText.ts, but this
   copy is not that one: it is sized against a GM-screen subject rather than an
   open sheet, and the two climbing ailments quote the damage THIS Round rather
   than the rule in the abstract. Transcribed verbatim from the original
   gm-screen script. */

export interface GmAilmentText {
    effect: string;
    treatment: string;
    duration: string;
}

export function ailmentText(
    ref: EntityRef, ailKey: string, damage: number,
): GmAilmentText | null {
    const v = ref.value;
    const heal = v('Dexterity') + v('Athletic');
    const ins = v('Insight');
    const burnCure = (need: number) => `On the subject's turn roll <strong>Dexterity + Athletic
                = ${heal} dice</strong> until it reaches <strong>${need}</strong> successes. This roll
                costs an action. Out of battle others can help put the fire out. Being inside a
                Poké Ball prevents the damage.`;
    const poisonCure = `This effect cannot be resisted. It is treated with items or berries.
                Out of battle, if the subject lies down and doesn't move, damage will be dealt once
                per hour instead of each Round. Being inside a Poké Ball does NOT prevent the damage.`;
    const T: Record<string, GmAilmentText> = {
        burn1: { effect: `Deal <strong>1</strong> point of damage at the end of each Round.`,
            treatment: burnCure(4), duration: `Until the affected faints or is fully treated.` },
        burn2: { effect: `Deal <strong>2</strong> points of lethal damage at the end of each Round.`,
            treatment: burnCure(6), duration: `Until the affected faints, dies or is fully treated.` },
        burn3: { effect: `Deal <strong>3</strong> points of lethal damage at the end of each Round,
                    increasing by <strong>1</strong> each Round that passes — <strong>${damage}</strong>
                    this Round.`, treatment: burnCure(8), duration: `Until the affected faints or dies.` },
        paralysis: { effect: `The subject loses <strong>2</strong> points in Dexterity, so
                    <strong>2</strong> off its Initiative. Narratively it moves at half its speed or can
                    barely move.`, treatment: `This effect cannot be resisted. In battle it can be healed
                    with items or berries. Out of battle <u>others</u> can roll <strong>Strength +
                    Medicine</strong> (not the subject's) to massage its muscles. Each success reduces
                    the duration by <strong>1</strong> hour.`, duration: `Lasts <strong>12</strong> hours.` },
        poison: { effect: `Deals <strong>2</strong> points of damage at the end of each turn.`,
            treatment: poisonCure, duration: `Lasts for <strong>8</strong> hours or until the
                    affected faints.` },
        badlyPoison: { effect: `Deals <strong>2</strong> points of damage at the end of each turn,
                    increasing by <strong>2</strong> each Round that passes — <strong>${damage}</strong>
                    this Round.`, treatment: poisonCure, duration: `Lasts until the affected faints or
                    dies. If fainted, it takes <strong>1</strong> lethal damage per hour.` },
        frozen: { effect: `The subject cannot perform any action, as it is inside a block of ice.
                    The block has <strong>5 HP</strong> with a <strong>Def/Sp.Def</strong> score of
                    <strong>2</strong>.`, treatment: `At the end of the Round the subject or an ally may
                    try to break the block with a Move. This Move costs an action. Super-effective Moves
                    break the ice instantly.`, duration: `Until the ice block is destroyed.` },
        sleep: { effect: `The subject falls into a deep slumber and cannot perform any action
                    until it wakes up.`, treatment: `In battle or under stress roll <strong>Insight =
                    ${ins} dice</strong> at the start of the subject's turn until it reaches
                    <strong>5</strong> successes. This roll costs an action.`, duration: `Out of battle it
                    lasts a few hours, unless the subject is under stress or aware of danger.` },
        confusion: { effect: `The subject removes successes from all action rolls by Rank:
                    Starter to Standard <strong>1</strong>, Advanced to Ace <strong>2</strong>, Master or
                    higher <strong>3</strong>. If the action fails, the subject is dealt
                    <strong>1</strong> damage.`, treatment: `At the beginning of all the next Rounds the
                    subject rolls <strong>Insight = ${ins} dice</strong>, affected by the confusion malus.
                    With <strong>2</strong> successes it can act normally that Round.`, duration: `Until
                    treated with items or the Pokémon is switched out.` },
        flinch: { effect: `The subject cannot use actions or reactions until the end of its next
                    turn. Only one Flinch can be inflicted per subject each Round.`,
            treatment: `This effect cannot be treated.`,
            duration: `Until the end of the subject's next turn — cleared here when the Round advances.` },
        inLove: { effect: `The subject falls in heavy infatuation, and will “Hold Back” against
                    the beloved.`, treatment: `The subject rolls <strong>Loyalty</strong> or
                    <strong>Insight</strong>. If it scores <strong>3</strong> or higher it can attack the
                    beloved at full power.`, duration: `In battle it is treated with a <strong>Full
                    Heal</strong> only.` },
    };
    return T[ailKey] || null;
}
