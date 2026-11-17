/* The two Will buttons beside Roll, on the GM screen's Dice panel and on the
   table's dice controls alike (lib/willRound.ts has the rules):

     Take Your Chances   bought AFTER a roll (2026-11-17, the owner's rule),
                         1 Will: one failed die of that roll is thrown again,
                         and for the rest of the Round every roll of that
                         character — damage included — may throw one again.
     Pushing Fate        set BEFORE a roll, 1 Will, and paid when the roll
                         is thrown: one automatic success, never more than
                         one on a roll (the owner's rule, 2026-11-17).

   So the buttons have two phases. `before`: a roll is set up and not thrown;
   Take Your Chances only shows whether it is already on this Round, and
   Pushing Fate can be switched on (click again to switch it off). `after`: the character has just rolled;
   Take Your Chances lights up (`ready`) when it can be bought for that roll,
   and Pushing Fate is over for it.

   They spend the Will of a roll from a character's sheet, never an
   initiative's; Pushing Fate never goes on a damage roll (`noFate`). The
   table shows them all the same, greyed out with `idle` saying why, so they
   are always where a player looks for them. The two exclude each other
   within a Round, and each says so on the other. `children` follows them on
   the same row. */

import type { ReactNode } from 'react';

/** Automatic successes Pushing Fate may put on one roll. */
export const MAX_FATE = 1;

/** What a Will button costs: the Will star with the number inside it, the
    way a burn's degree sits inside its flame. Also the table's Ignore pain. */
export function WillCost({ n }: { n: number | string }) {
    return (
        <span className="will-cost" data-cost={n}>
            <i className="fa-solid fa-star" aria-hidden="true"></i>
            <span className="will-cost-n">{n}</span>
        </span>
    );
}

export function WillSpend({ will, fate, roundFate, tyc, inFight, onFate, onTyc, idle, bare, phase = 'before', noReroll, noFate, children }: {
    /** Will the character has now. */
    will: number;
    /** Pushing Fates set on this roll, not yet paid. */
    fate: number;
    /** Pushing Fates already used this Round, or on the roll just made. */
    roundFate: number;
    /** Take Your Chances is on. */
    tyc: boolean;
    /** In a fight the Round ends it; outside one it is clicked off. */
    inFight: boolean;
    onFate: (n: number) => void;
    onTyc: (on: boolean) => void;
    /** No Will to spend on this roll: both buttons off, and this is why. */
    idle?: string;
    /** No Will count in front: the buttons fill the row (the table's). */
    bare?: boolean;
    /** `before`: a roll set up, not thrown. `after`: the roll just made. */
    phase?: 'before' | 'after';
    /** After a roll: why its die cannot be thrown again (nothing failed, a
        die already was), or undefined when it can. */
    noReroll?: string;
    /** Why Pushing Fate cannot go on this roll (a damage roll), if it cannot. */
    noFate?: string;
    children?: ReactNode;
}) {
    if (idle) {
        return (
            <div className={'will-spend' + (bare ? ' bare' : '')} data-will-spend="idle">
                {!bare && (
                    <span className="will-have idle" title={idle}>
                        <i className="fa-solid fa-star"></i> –
                    </span>
                )}
                <button type="button" data-will="tyc" className="will-btn tyc" aria-disabled title={idle}>
                    <i className="fa-solid fa-rotate-right"></i> Take your chances
                    <WillCost n={1} />
                </button>
                <span className="will-fate">
                    <button type="button" data-will="fate" className="will-btn fate" aria-disabled title={idle}>
                        <i className="fa-solid fa-wand-sparkles"></i> Pushing fate
                        <WillCost n={1} />
                    </button>
                </span>
                {children}
            </div>
        );
    }
    const after = phase === 'after';
    const left = will - fate;
    const fateBlocked = tyc;
    const tycBlocked = !tyc && (fate > 0 || roundFate > 0);
    /* Pushing Fate is set before the dice are thrown, never after. */
    const canAdd = !after && !noFate && !fateBlocked && left >= 1 && fate < MAX_FATE;
    /* Take Your Chances is bought for a roll already made. */
    const ready = after && !tyc && !tycBlocked && !noReroll && will >= 1;

    const tycTitle = tyc
        ? (inFight
            ? 'Take Your Chances is on until this Round ends: one failed die of each roll may be rolled again.'
            : 'Take Your Chances is on: one failed die of each roll may be rolled again. Click to end it.')
        : tycBlocked ? 'Not in the same Round as Pushing Fate.'
            : !after ? 'Take Your Chances is bought after the roll: roll first, then click it to throw one failed die again.'
                : noReroll ? noReroll
                    : will < 1 ? 'Take Your Chances needs 1 Will.'
                        : 'Take Your Chances: 1 Will, taken now. Click a failed die of this roll to throw it again; for the rest of this Round each roll may throw one again.';
    const fateTitle = fateBlocked ? 'Not in the same Round as Take Your Chances.'
        : after ? 'Pushing Fate is set before the roll.'
            : noFate ? noFate
                : !canAdd && !fate ? 'Pushing Fate needs 1 Will.'
                    : fate ? 'Pushing Fate is on: 1 Will, taken when you roll. Click to take it off.'
                        : 'Pushing Fate: 1 Will, taken when you roll. One automatic success that pain and Low Accuracy cannot remove.';

    return (
        <div className={'will-spend' + (bare ? ' bare' : '')} data-will-spend={phase}>
            {!bare && (
                <span className="will-have" title="Will this character has">
                    <i className="fa-solid fa-star"></i> {will}
                </span>
            )}
            <button
                type="button" data-will="tyc"
                className={'will-btn tyc' + (tyc ? ' on' : ready ? ' ready' : '')}
                aria-pressed={tyc}
                aria-disabled={tyc ? inFight : !ready}
                title={tycTitle}
                onClick={() => {
                    if (tyc) { if (!inFight) onTyc(false); return; }
                    if (ready) onTyc(true);
                }}
            >
                <i className="fa-solid fa-rotate-right"></i> Take your chances
                {!tyc && <WillCost n={1} />}
            </button>
            <span className={'will-fate' + (fate ? ' on' : '')}>
                <button
                    type="button" data-will="fate"
                    className={'will-btn fate' + (fate ? ' on' : '')}
                    aria-pressed={fate > 0}
                    aria-disabled={!canAdd && !fate}
                    title={fateTitle}
                    onClick={() => { if (fate) onFate(0); else if (canAdd) onFate(1); }}
                >
                    <i className="fa-solid fa-wand-sparkles"></i> Pushing fate
                    <WillCost n={1} />
                </button>
            </span>
            {children}
        </div>
    );
}
