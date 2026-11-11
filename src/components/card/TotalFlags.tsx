import { lowAccuracyTitle, painFlagTitle } from '../../card/moves';
import { signed } from '../../card/moves';
import type { MoveTotals } from '../../card/moves';

/* The glyphs after a total, one per thing that bears on it: the move's own Low
   Accuracy and Pain, which both come off the successes once the dice are read,
   and the offset you typed in the editor, which is in the number itself.

   Each carries its own title, which is the point of splitting them up — hovering
   one says what that one means, where a single worded chip could only restate
   the whole sum. */

/** Three stacked chevrons: the move's own Low Accuracy. */
function FlagArrows() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 2l7 5 7-5" /><path d="M5 9l7 5 7-5" /><path d="M5 16l7 5 7-5" />
        </svg>
    );
}

export function PainFlag({ pain }: { pain: number }) {
    return (
        <span className={'total-flag pain' + (pain < -1 ? ' severe' : '')} title={painFlagTitle(pain)}>
            <i className="fa-solid fa-heart-crack"></i>
        </span>
    );
}

export function TotalFlags({ totals, kind }: { totals: MoveTotals; kind: 'acc' | 'pow' }) {
    const manual = kind === 'acc' ? totals.userOffset : totals.powOffset;
    return (
        <span className="total-flags">
            {kind === 'acc' && !!totals.movePenalty && (
                <span
                    className="total-flag nerfed"
                    title={lowAccuracyTitle(totals.movePenalty)}
                >
                    <FlagArrows />
                </span>
            )}
            {!!manual && (
                <span
                    className={'total-flag ' + (manual < 0 ? 'nerfed' : 'buffed')}
                    title={'Manual offset: ' + signed(manual)}
                >
                    <i className="fa-solid fa-hand"></i>
                </span>
            )}
            {kind === 'pow' && totals.bonus.parts.map((b) => (
                <span
                    key={b.label}
                    className={'total-flag buffed ' + (b.label === 'STAB' ? 'flag-stab' : 'flag-item')}
                    title={(b.label === 'STAB' ? 'Same-type attack bonus' : 'Held item: ' + b.label)
                        + ': ' + signed(b.value) + ' damage'}
                >
                    <i className={'fa-solid ' + (b.label === 'STAB' ? 'fa-star' : 'fa-gem')}></i>
                </span>
            ))}
            {!!totals.pain && <PainFlag pain={totals.pain} />}
        </span>
    );
}
