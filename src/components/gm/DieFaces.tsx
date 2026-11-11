import { canReroll, faceOrder, painStruck, struckOff } from '../../gm/dice';
import type { ReactNode } from 'react';

/* A roll's dice, as the GM screen's Dice panel and the table's feed both
   draw them: a green box for a success, a red struck one for a success that
   pain or Low Accuracy took away, a gold star for each automatic success
   bought with Pushing Fate.

   Take Your Chances: while its one reroll is still unused, every die that
   failed wears a dashed blue ring and a "Reroll 1" chip follows the row —
   the dice are the buttons, for whoever's roll it is. Once used, the die
   shows what it was, an arrow, and what it became. */

interface Faces {
    vals: number[];
    succ: number | null;
    pain?: number;
    low?: number;
    fate?: number;
    tyc?: boolean;
    rr?: [number, number];
}

export function DieFaces({ roll, sides, sorted, onesMarked, struckTitle, onReroll, children }: {
    roll: Faces;
    sides: number;
    sorted: boolean;
    /** The table's feed gives a 1 its own class; the Dice panel does not. */
    onesMarked?: boolean;
    struckTitle?: string;
    /** Present for whoever may use the reroll; absent, the cue only shows. */
    onReroll?: (i: number) => void;
    /** After the faces: a sum roll's flat bonus. */
    children?: ReactNode;
}) {
    const counted = roll.succ != null;
    const struck = painStruck(roll.vals, struckOff(roll));
    const open = canReroll(roll);
    return (
        <div className={'die-faces' + (open ? ' can-reroll' : '')}>
            {faceOrder(roll.vals, counted, sorted).map((i) => {
                const val = roll.vals[i];
                const cls = counted && val >= 4 ? 'success'
                    : val === sides ? 'max' : onesMarked && val === 1 ? 'one' : '';
                const out = struck.has(i) ? ' struck' : '';
                if (open && val < 4) {
                    return onReroll ? (
                        <button
                            key={i} type="button" className={'die-face reroll ' + cls} data-reroll={i}
                            title="Take Your Chances: roll this die again. One die only."
                            onClick={() => onReroll(i)}
                        >
                            {val}
                        </button>
                    ) : (
                        <span key={i} className={'die-face reroll ' + cls} title="Take Your Chances: one of these may be rolled again">{val}</span>
                    );
                }
                const face = (
                    <span key={i} className={'die-face ' + cls + out} title={out ? struckTitle : undefined}>{val}</span>
                );
                if (roll.rr && roll.rr[0] === i) {
                    return (
                        <span key={i} className="die-rerolled" data-rerolled="" title={'Take Your Chances: rerolled, it was a ' + roll.rr[1]}>
                            <span className="die-face was">{roll.rr[1]}</span>
                            <i className="fa-solid fa-rotate-right"></i>
                            {face}
                        </span>
                    );
                }
                return face;
            })}
            {Array.from({ length: roll.fate || 0 }, (_, k) => (
                <span key={'f' + k} className="die-face fate" data-fate="" title="Pushing Fate: an automatic success, bought with Will">
                    <i className="fa-solid fa-star"></i>
                </span>
            ))}
            {children}
            {open && (
                <span className="reroll-cue" data-reroll-cue="">
                    <i className="fa-solid fa-rotate-right"></i> Reroll 1
                </span>
            )}
        </div>
    );
}
