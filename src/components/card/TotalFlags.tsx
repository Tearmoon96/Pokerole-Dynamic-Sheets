import { painFlagTitle } from '../../card/moves';
import { signed } from '../../card/moves';
import type { MoveTotals } from '../../card/moves';

/* The glyphs after a total, one per reason it is not the bare pool: the move's
   own modifier, the offset you typed in the editor, and Pain.

   Each carries its own title, which is the point of splitting them up — hovering
   one says what that one means, where a single worded chip could only restate
   the whole sum. */

/** Three stacked chevrons: the move's own built-in accuracy modifier. */
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
                    className={'total-flag ' + (totals.movePenalty < 0 ? 'nerfed' : 'buffed flag-up')}
                    title={'Default offset: ' + signed(totals.movePenalty)}
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
            {!!totals.pain && <PainFlag pain={totals.pain} />}
        </span>
    );
}
