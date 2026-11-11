import { PAIN_LOSS, painCost } from '../../lib/pain';
import type { PainView } from '../../lib/pain';

/* The pain marks beside a health bar: one chip per tier the HP is in — "−1"
   at half HP or less, "−2" more at 1 HP.

   A red chip is a penalty in force. Clicking it is "Power Through the Pain":
   it spends the Will (1 for the first tier, 2 for the second, 3 for both at
   once) and the chip turns blue and struck through — the penalty is ignored,
   and the chip stays to say there is one. Clicking a blue chip takes that
   back and returns the Will, for the click that was a mistake.

   Nothing is drawn while the HP is above half, or while Pain is switched
   off for this character or for the table. */

const WHEN = ['half HP or less', '1 HP'];

export function PainMarks({ view, will, onSet, noIcon }: {
    /** The card draws its own heart: the switch for the rule. */
    noIcon?: boolean;
    view: PainView;
    /** Will the character has now. */
    will: number;
    /** `off`: tiers bought off after the click; `cost`: Will to take (negative:
        to give back). Absent on a read-only row. */
    onSet?: (off: number, cost: number) => void;
}) {
    if (view.ruleOff || !view.tiers) return null;
    const marks = [];
    for (let i = 0; i < view.tiers; i++) {
        const purged = i < view.off;
        const to = purged ? i : i + 1;
        const cost = painCost(view.off, to);
        const loss = PAIN_LOSS[i];
        const what = 'Pain, ' + WHEN[i] + ': −' + loss + (loss === 1 ? ' success' : ' more successes') + ' on every roll.';
        const short = !purged && will < cost;
        const title = purged
            ? 'Powered through with Will: this −' + loss + ' is ignored.'
                + (onSet ? ' Click to take it back (' + -cost + ' Will returns).' : '')
            : what + (onSet
                ? (short ? ' Power Through the Pain needs ' + cost + ' Will.'
                    : ' Click to Power Through the Pain: ' + cost + ' Will'
                        + (to - view.off > 1 ? ', both tiers.' : '.'))
                : '');
        const body = <span className="pain-mark-n">{'\u2212' + loss}</span>;
        const cls = 'pain-mark' + (purged ? ' purged' : '') + (short ? ' short' : '');
        marks.push(onSet ? (
            <button
                key={i} type="button" className={cls} title={title}
                data-pain-tier={i + 1} data-purged={purged ? '1' : '0'}
                aria-disabled={short}
                onClick={(e) => { e.stopPropagation(); if (!short) onSet(to, cost); }}
            >
                {body}
            </button>
        ) : (
            <span key={i} className={cls} title={title} data-pain-tier={i + 1} data-purged={purged ? '1' : '0'}>{body}</span>
        ));
    }
    /* One heart for the row, then the numbers: two full chips with an icon
       each took a third of a roster row's health bar. */
    return (
        <span className={'pain-marks' + (view.off >= view.tiers ? ' all-off' : '')}>
            {!noIcon && <i className="fa-solid fa-heart-crack pain-marks-ico"></i>}
            {marks}
        </span>
    );
}
