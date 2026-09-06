import { formatPoolTotal, monPoolMax, resolvePoolString } from './pools';
import type { PokedexEntry, ItemEntry, MoveEntry } from '../data/types';
import type { CardSheet } from '../card/types';

/* Move totals for the board's move panel.

   Mirrors the Pokémon card's maths with the sheet passed in, and adds the two
   things the card leaves to the player: STAB, and whatever a type-boosting held
   item contributes. */

export interface GmMove extends MoveEntry {
    Accuracy3?: string;
    AccuracyOffset?: number;
    PowerOffset?: number;
    Learned?: string;
    Attributes?: { AccuracyReduction?: number;[key: string]: unknown };
}

/* Types that name no real type: a move listed as Typeless or Varies never gets
   STAB and never matches a plate. */
const VAGUE_TYPES = ['', 'typeless', 'varies', 'any', 'none'];

const PLATE_RE = /adds? (\d+) damage dic?e? to (\w+)[- ]type moves/i;

export function sameType(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) return false;
    const x = String(a).trim().toLowerCase();
    if (VAGUE_TYPES.includes(x)) return false;
    return x === String(b).trim().toLowerCase();
}

export function isStab(dex: PokedexEntry | null, move: GmMove | null): boolean {
    if (!dex || !move) return false;
    return sameType(move.Type, dex.Type1) || sameType(move.Type, dex.Type2);
}

/** What this item adds to a move's damage pool, or null. */
export function typeBoost(
    item: ItemEntry | null, dex: PokedexEntry | null, move: GmMove | null,
): { value: number; name: string } | null {
    if (!item || !move || item.Category !== 'TypeBoosting') return null;

    const rec = item as unknown as Record<string, unknown>;
    let types = String(rec.ForTypes || '').trim().split(/\s+/).filter(Boolean);
    let value = Number(rec.Value);
    if (!types.length || !(value > 0)) {
        const m = PLATE_RE.exec(item.Description || '');
        if (!m) return null;
        if (!types.length) types = [m[2]];
        if (!(value > 0)) value = Number(m[1]);
    }
    if (!(value > 0)) return null;

    /* A few orbs only work for one species — the Adamant Orb does nothing
       outside Dialga's hands. */
    if (item.ForPokemon) {
        const only = String(item.ForPokemon).trim().toLowerCase().split(/\s+/);
        if (!dex || !only.includes(String(dex._id || '').toLowerCase())) return null;
    }
    if (!types.some((t) => sameType(t, move.Type))) return null;
    return { value, name: item.Name };
}

export interface DamageBonus { parts: { label: string; value: number }[]; total: number }

export function damageBonuses(
    dex: PokedexEntry | null,
    sheet: Partial<CardSheet> | null,
    move: GmMove,
    itemByName: (name: string) => ItemEntry | null,
): DamageBonus {
    const parts: { label: string; value: number }[] = [];
    if (isStab(dex, move)) parts.push({ label: 'STAB', value: 1 });
    const boost = typeBoost(itemByName((sheet && sheet.heldItem) || ''), dex, move);
    if (boost) parts.push({ label: boost.name, value: boost.value });
    return { parts, total: parts.reduce((a, b) => a + b.value, 0) };
}

export function moveAccuracyPenalty(move: GmMove): number {
    const n = move.Attributes && move.Attributes.AccuracyReduction;
    return n ? -Math.abs(n) : 0;
}

export function applyMoveOverrides(sheet: Partial<CardSheet> | null, move: GmMove): GmMove {
    const o = sheet && sheet.moveOverrides && sheet.moveOverrides[move.Name];
    if (!o) return move;
    const m: GmMove = { ...move };
    if (o.acc1 !== undefined) m.Accuracy1 = o.acc1;
    if (o.acc2 !== undefined) m.Accuracy2 = o.acc2;
    if (o.acc3 !== undefined) m.Accuracy3 = o.acc3;
    if (o.power !== undefined) m.Power = o.power;
    if (o.accOffset !== undefined) m.AccuracyOffset = o.accOffset;
    if (o.powOffset !== undefined) m.PowerOffset = o.powOffset;
    if (o.damage !== undefined) { m.Damage1 = o.damage; m.Damage2 = ''; }
    if (o.target !== undefined) m.Target = o.target;
    if (o.effect !== undefined) m.Effect = o.effect;
    return m;
}

export interface GmMoveTotals {
    acc: string | null;
    pow: string | null;
    /** The rollable numbers, when the pool resolved to one. */
    accN: number | null;
    powN: number | null;
    bonus: DamageBonus;
}

export function computeMoveTotals(
    dex: PokedexEntry | null,
    sheet: Partial<CardSheet> | null,
    move: GmMove,
    itemByName: (name: string) => ItemEntry | null,
): GmMoveTotals {
    const accOffset = moveAccuracyPenalty(move) + (move.AccuracyOffset || 0);
    const powOffset = move.PowerOffset || 0;

    let acc: string | null = null, accN: number | null = null;
    const accParts = [move.Accuracy1, move.Accuracy2, move.Accuracy3].filter(Boolean) as string[];
    if (accParts.length > 0 || accOffset) {
        const r = resolvePoolString(dex, sheet, accParts.join(' + '));
        acc = formatPoolTotal(r, accOffset);
        accN = r.total + accOffset;
    }

    let pow: string | null = null, powN: number | null = null;
    const bonus = damageBonuses(dex, sheet, move, itemByName);
    if (move.Power > 0 || move.Damage1 || move.Damage2 || powOffset) {
        const r = resolvePoolString(dex, sheet,
            [move.Damage1, move.Damage2].filter(Boolean).join(' + '));
        const flat = (move.Power || 0) + powOffset + bonus.total;
        pow = formatPoolTotal(r, flat);
        powN = r.total + flat;
    }
    return { acc, pow, accN, powN, bonus };
}

export function painPenalty(dex: PokedexEntry | null, sheet: Partial<CardSheet> | null): number {
    const hp = (sheet && sheet.hp) || 0;
    if (hp <= 1) return 2;
    if (hp <= Math.floor(monPoolMax(dex, sheet, 'hp') / 2)) return 1;
    return 0;
}

/** Every move this Pokémon knows: its learnset plus anything added by hand. */
export function allMoveObjects(
    dex: PokedexEntry | null, sheet: Partial<CardSheet> | null, allMoves: MoveEntry[],
): GmMove[] {
    const learned = ((dex && dex.Moves) || [])
        .map((m) => {
            const full = allMoves.find((x) => x.Name === m.Name);
            return full ? ({ ...full, Learned: m.Learned } as GmMove) : null;
        })
        .filter((m): m is GmMove => !!m);
    const custom = ((sheet && sheet.customMoves) || [])
        .map((name) => allMoves.find((m) => m.Name === name))
        .filter((m): m is MoveEntry => !!m)
        .map((m) => ({ ...m, Learned: 'Custom' } as GmMove));
    return learned.concat(custom);
}

export function pinnedMoveObjects(
    dex: PokedexEntry | null, sheet: Partial<CardSheet> | null, allMoves: MoveEntry[],
): GmMove[] {
    const pinned = (sheet && sheet.pinnedMoves) || [];
    if (!pinned.length) return [];
    const all = allMoveObjects(dex, sheet, allMoves);
    return pinned
        .map((name) => all.find((m) => m.Name === name))
        .filter((m): m is GmMove => !!m)
        .map((m) => applyMoveOverrides(sheet, m));
}

export const ROLLABLE_QUICK = ['eva', 'clash-s', 'clash-sp'];

export function ordSuffix(n: number): string {
    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
    return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}
