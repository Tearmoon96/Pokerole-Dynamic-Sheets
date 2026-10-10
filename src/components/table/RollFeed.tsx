/* The shared feed. Every roll the table can see, newest first.

   The faces and their colouring are the GM screen's, class for class, so a
   roll looks the same whether it came from the solo board or the shared table —
   see src/styles/gm/dice.css, which this page imports rather than copies. */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { LocalRoll } from '../../table/session';
import type { WireMember } from '../../table/protocol';
import { CRIT_MARGIN } from '../../gm/constants';
import { VERDICTS, accuracyVerdict, faceOrder, painStruck } from '../../gm/dice';
import { colorVars } from '../../table/colors';

/** How long a roll that just came in stays lit. */
const FRESH_MS = 3000;

export function RollFeed({ rolls, myName, members, sorted }: {
    rolls: LocalRoll[];
    myName: string;
    members: WireMember[];
    /** Successes before the other dice (the GM's choice). */
    sorted: boolean;
}) {
    if (!rolls.length) {
        return (
            <div className="empty-note">
                No rolls yet. Whatever anyone rolls appears here for the whole table.
            </div>
        );
    }

    return (
        <div className="roll-feed">
            {rolls.map((r) => {
                /* The roller's colour, by name: a roll carries who rolled it as
                   the name the roster shows. */
                const by = members.find((m) => m.name === r.who);
                return <FeedRow key={r.id} roll={r} mine={r.who === myName} color={by ? by.color : undefined} sorted={sorted} />;
            })}
        </div>
    );
}

function FeedRow({ roll, mine, color, sorted }: {
    roll: LocalRoll;
    mine: boolean;
    color: number | undefined;
    sorted: boolean;
}) {
    /* Lit once, as it arrives; a roll from a history sync never is. */
    const [fresh] = useState(() => !!roll.seenAt && Date.now() - roll.seenAt < FRESH_MS);
    const sides = parseInt(roll.label.split('d')[1], 10);
    const time = new Date(roll.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const struck = painStruck(roll.vals, roll.pain);
    /* Worked out here from the net successes rather than sent: a receiver
       recomputes `net` from the faces, so the verdict follows from those. */
    const verdict = roll.need != null && roll.net != null
        ? VERDICTS[accuracyVerdict(roll.net, roll.need, CRIT_MARGIN)] : null;
    const label = roll.label + (roll.bonus == null ? '' : (roll.bonus < 0 ? ' − ' : ' + ') + Math.abs(roll.bonus));

    return (
        <div
            className={'roll-result feed-row' + (mine ? ' mine' : '') + (roll.hidden ? ' hidden-roll' : '')
                + (color !== undefined ? ' by-color' : '') + (fresh ? ' fresh' : '')}
            style={color !== undefined ? colorVars(color) as CSSProperties : undefined}
        >
            <div className="roll-label">
                <span className="feed-who">
                    {roll.who}
                    {roll.note && <span className="feed-note">{roll.note}</span>}
                </span>
                <span className="feed-meta">
                    {roll.hidden && (
                        <span className="feed-private" title="Only you can see this roll">
                            <i className="fa-solid fa-eye-slash"></i> private
                        </span>
                    )}
                    {label} · {time}
                </span>
            </div>

            <div className="die-faces">
                {faceOrder(roll.vals, roll.succ != null, sorted).map((i) => {
                    const val = roll.vals[i];
                    const cls = roll.succ != null && val >= 4 ? 'success'
                        : val === sides ? 'max' : val === 1 ? 'one' : '';
                    const out = struck.has(i) ? ' struck' : '';
                    return <span key={i} className={'die-face ' + cls + out}>{val}</span>;
                })}
                {roll.bonus != null && (
                    <span className="die-bonus" title="Added to the dice, not rolled">
                        {roll.bonus < 0 ? '−' : '+'}{Math.abs(roll.bonus)}
                    </span>
                )}
            </div>

            <div className="roll-totals">
                <span>Total <strong>{roll.total}</strong></span>
                {roll.net != null && (
                    <span className="succ">
                        {roll.net === 1 ? 'Success' : 'Successes'} <strong>{roll.net}</strong>
                        {!!roll.pain && (
                            <> <span className="pain-sub">({roll.succ} − {roll.pain} pain)</span></>
                        )}
                    </span>
                )}
                {roll.need != null && <span className="need">Needs <strong>{roll.need}</strong></span>}
            </div>
            {verdict && (
                <div className={'roll-verdict ' + verdict.cls}>
                    <i className={'fa-solid ' + verdict.icon}></i> {verdict.label}
                </div>
            )}
        </div>
    );
}
