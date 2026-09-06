import type { MoveEntry } from '../data/types';
import { formatPoolTotal, painPenalty, resolvePoolString } from './pools';
import type { StatSource } from './pools';
import type { CardSheet, MoveOverride } from './types';

/* One move as the card works with it: the dataset record plus whatever the
   sheet has overridden, and the fields the card adds on top. */
export interface CardMove extends MoveEntry {
    Accuracy3?: string;
    AccuracyOffset?: number;
    PowerOffset?: number;
    AilmentOverride?: string;
    Learned?: string;
    Attributes?: { AccuracyReduction?: number;[key: string]: unknown };
    AddedEffects?: { Ailments?: { Type: string; Affects?: string; ChanceDice?: number }[];[key: string]: unknown };
}

export function applyMoveOverrides(sheet: CardSheet, move: CardMove): CardMove {
    const o: MoveOverride | undefined = sheet.moveOverrides[move.Name];
    if (!o) return move;
    const m: CardMove = { ...move };
    if (o.acc1 !== undefined) m.Accuracy1 = o.acc1;
    if (o.acc2 !== undefined) m.Accuracy2 = o.acc2;
    if (o.acc3 !== undefined) m.Accuracy3 = o.acc3;
    if (o.power !== undefined) m.Power = o.power;
    if (o.accOffset !== undefined) m.AccuracyOffset = o.accOffset;
    if (o.powOffset !== undefined) m.PowerOffset = o.powOffset;
    if (o.damage !== undefined) { m.Damage1 = o.damage; m.Damage2 = ''; }
    if (o.target !== undefined) m.Target = o.target;
    if (o.effect !== undefined) m.Effect = o.effect;
    if (o.ailment !== undefined) m.AilmentOverride = o.ailment;
    return m;
}

/* A move's own accuracy penalty — the rulebook's "Low Accuracy N".

   Always a penalty: the field is named Reduction, every Effect string in the
   dataset that mentions it says "Low Accuracy", and "High Accuracy" appears
   nowhere in Pokerole. Three records (Head Smash, Bleakwind Storm, Triple Axel)
   carry a positive number contradicting their own text, so the magnitude is what
   counts — trusting the sign would hand those three a bonus instead of the
   penalty they describe. */
export function moveAccuracyPenalty(move: CardMove): number {
    const n = move.Attributes && move.Attributes.AccuracyReduction;
    return n ? -Math.abs(n) : 0;
}

export function ailmentSummary(move: CardMove): string {
    if (!move.AddedEffects || !move.AddedEffects.Ailments) return '';
    return move.AddedEffects.Ailments.map((a) => {
        let s = a.Type;
        if (a.Affects) s += ' on ' + a.Affects;
        if (a.ChanceDice) s += ` (${a.ChanceDice} Chance Die/Dice)`;
        return s;
    }).join('; ');
}

export interface MoveTotals {
    acc: string | null;
    pow: string | null;
    accOffset: number;
    movePenalty: number;
    userOffset: number;
    /** Pain travels as a flag, never folded into the pools — see below. */
    pain: number;
    accBase: number;
    powBase: number;
    powOffset: number;
}

/** Dice pool totals: resolve stat/skill names against the sheet's current values. */
export function computeMoveTotals(src: StatSource, move: CardMove): MoveTotals {
    /* Two separate things that both move the accuracy, and they stack: the
       move's own Low Accuracy, and whatever the user typed into the move editor.
       Kept apart in the return value so the card can say which is which — the
       sum is all the arithmetic needs. */
    const movePenalty = moveAccuracyPenalty(move);
    const userOffset = move.AccuracyOffset || 0;
    /* Pain is NOT in the totals. It takes a success off the result of the roll,
       flat — it does not shrink the pool you roll, which is what these numbers
       are. So it travels with the totals only as a flag, to be drawn beside them
       and subtracted from the successes once the dice are read. */
    const pain = -painPenalty(src);
    const accOffset = movePenalty + userOffset;
    const powOffset = move.PowerOffset || 0;

    let acc: string | null = null;
    let accBase = 0;
    const accParts = [move.Accuracy1, move.Accuracy2, move.Accuracy3].filter(Boolean) as string[];
    if (accParts.length > 0 || movePenalty || userOffset) {
        /* Offset is a flat modifier added on top of the resolved stat pool,
           applied after the stat totals so it always reads as the final value. */
        const r = resolvePoolString(src, accParts.join(' + '));
        accBase = r.total;
        acc = formatPoolTotal(r, accOffset);
    }
    let pow: string | null = null;
    let powBase = 0;
    if (move.Power > 0 || move.Damage1 || move.Damage2 || powOffset) {
        const r = resolvePoolString(src, [move.Damage1, move.Damage2].filter(Boolean).join(' + '));
        powBase = r.total + (move.Power || 0);
        pow = formatPoolTotal(r, (move.Power || 0) + powOffset);
    }
    return { acc, pow, accOffset, movePenalty, userOffset, pain, accBase, powBase, powOffset };
}

/** Signed number with a real minus sign, for anything the reader has to add up. */
export function signed(n: number): string {
    return (n > 0 ? '+' : '\u2212') + Math.abs(n);
}

export const RANK_ORDER: Record<string, number> = {
    Custom: 0, Starter: 1, Rookie: 2, Standard: 3, Advanced: 4, Expert: 5, Ace: 6,
};

export const ATTR_ICONS: Record<string, string> = {
    SoundMove: 'fa-volume-high',
    IgnoreDefenses: 'fa-shield-halved',
    NeverMiss: 'fa-crosshairs',
    UserFaints: 'fa-skull',
    Duration: 'fa-clock',
    ProjectileMove: 'fa-meteor',
    WindMove: 'fa-wind',
};

/** The move list in the order it is drawn: rank order, then any saved drag
    arrangement, then pinned moves floated to the very top. */
export function getOrderedMoves(
    speciesMoves: CardMove[], customMoves: CardMove[], sheet: CardSheet,
): CardMove[] {
    const allMoves = speciesMoves.concat(customMoves);
    const sorted = allMoves.slice().sort((a, b) =>
        (RANK_ORDER[a.Learned ?? ''] ?? 99) - (RANK_ORDER[b.Learned ?? ''] ?? 99));
    let ordered = sorted;
    if (sheet.moveOrder.length > 0) {
        /* A saved drag arrangement wins; names not in it (moves added after the
           last drag) sort first, like the Custom-on-top default. */
        const pos = new Map(sheet.moveOrder.map((n, i) => [n, i]));
        ordered = sorted.sort((a, b) => (pos.get(a.Name) ?? -1) - (pos.get(b.Name) ?? -1));
    }
    /* Pinned moves float to the very top, in pin order; the sort is stable so
       everything else keeps its relative position. */
    const pinned = sheet.pinnedMoves || [];
    if (pinned.length > 0) {
        const pinPos = new Map(pinned.map((n, i) => [n, i]));
        ordered = ordered.slice().sort((a, b) =>
            (pinPos.has(a.Name) ? pinPos.get(a.Name)! : Infinity)
            - (pinPos.has(b.Name) ? pinPos.get(b.Name)! : Infinity));
    }
    return ordered;
}

export function painFlagTitle(pain: number): string {
    return pain < -1 ? 'Severe Pain: \u22122 successes' : 'Pain: \u22121 success';
}

/* Spells the sum out on hover of the badge itself, so no glyph has to carry the
   whole story. A title on a child wins over this one, which is exactly what we
   want: on a glyph you get that glyph\u2019s meaning, anywhere else in the badge
   you get the arithmetic. */
export function totalTitle(totals: MoveTotals, kind: 'acc' | 'pow'): string {
    const acc = kind === 'acc';
    const own = acc ? totals.movePenalty : 0;
    const manual = acc ? totals.userOffset : totals.powOffset;
    if (!own && !manual) return '';
    const base = acc ? totals.accBase : totals.powBase;
    const bits = [(acc ? 'Accuracy pool ' : 'Power ') + base];
    if (own) bits.push('default offset ' + signed(own));
    if (manual) bits.push('manual offset ' + signed(manual));
    /* Pain is absent on purpose: it is not part of this sum. Its own glyph says
       what it costs, off the successes rather than the pool. */
    return bits.join(' \u00b7 ') + ' = ' + (base + own + manual);
}
