/* The two Will buttons beside Roll, on the GM screen's Dice panel and on the
   table's dice controls alike (lib/willRound.ts has the rules):

     Take Your Chances   bought here and now, 1 Will, for the Round: each
                         action roll may then throw one failed die again.
     Pushing Fate        counted up here, 1 Will each, and paid when the roll
                         is thrown: that many automatic successes on it.

   Shown only for a roll set up from a character's sheet — it is that
   character's Will — and never for a damage roll or an initiative. The two
   exclude each other within a Round, and each says so on the other. */

export const MAX_FATE = 5;

export function WillSpend({ will, fate, roundFate, tyc, inFight, onFate, onTyc }: {
    /** Will the character has now. */
    will: number;
    /** Pushing Fates set on this roll, not yet paid. */
    fate: number;
    /** Pushing Fates already used this Round. */
    roundFate: number;
    /** Take Your Chances is on. */
    tyc: boolean;
    /** In a fight the Round ends it; outside one it is clicked off. */
    inFight: boolean;
    onFate: (n: number) => void;
    onTyc: (on: boolean) => void;
}) {
    const left = will - fate;
    const fateBlocked = tyc;
    const tycBlocked = !tyc && (fate > 0 || roundFate > 0);
    const canAdd = !fateBlocked && left >= 1 && fate < MAX_FATE;

    const tycTitle = tyc
        ? (inFight
            ? 'Take Your Chances is on until this Round ends: one failed die of each action roll may be rolled again.'
            : 'Take Your Chances is on: one failed die of each action roll may be rolled again. Click to end it.')
        : tycBlocked ? 'Not in the same Round as Pushing Fate.'
            : will < 1 ? 'Take Your Chances needs 1 Will.'
                : 'Take Your Chances: 1 Will, taken now. For this Round, one failed die of each action roll may be rolled again.';
    const fateTitle = fateBlocked ? 'Not in the same Round as Take Your Chances.'
        : !canAdd && !fate ? 'Pushing Fate needs 1 Will.'
            : 'Pushing Fate: 1 Will each, taken when you roll. An automatic success that pain and Low Accuracy cannot remove.';

    return (
        <div className="will-spend" data-will-spend="">
            <span className="will-have" title="Will this character has">
                <i className="fa-solid fa-star"></i> {will}
            </span>
            <button
                type="button" data-will="tyc"
                className={'will-btn tyc' + (tyc ? ' on' : '')}
                aria-pressed={tyc}
                aria-disabled={tyc ? inFight : tycBlocked || will < 1}
                title={tycTitle}
                onClick={() => {
                    if (tyc) { if (!inFight) onTyc(false); return; }
                    if (!tycBlocked && will >= 1) onTyc(true);
                }}
            >
                <i className="fa-solid fa-rotate-right"></i> Take your chances
                {!tyc && <span className="will-cost">1</span>}
            </button>
            <span className={'will-fate' + (fate ? ' on' : '')}>
                <button
                    type="button" data-will="fate"
                    className={'will-btn fate' + (fate ? ' on' : '')}
                    aria-disabled={!canAdd}
                    title={fateTitle}
                    onClick={() => { if (canAdd) onFate(fate + 1); }}
                >
                    <i className="fa-solid fa-wand-sparkles"></i> Pushing fate
                    {fate ? <span className="will-count">+{fate}</span> : <span className="will-cost">1</span>}
                </button>
                {fate > 0 && (
                    <button
                        type="button" className="will-btn will-less" data-will="fate-less"
                        aria-label="One Pushing Fate fewer" onClick={() => onFate(fate - 1)}
                    >
                        <i className="fa-solid fa-minus"></i>
                    </button>
                )}
            </span>
        </div>
    );
}
