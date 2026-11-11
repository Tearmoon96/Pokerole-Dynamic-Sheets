/* The shared feed. Every roll the table can see, newest first.

   The faces and their colouring are the GM screen's, class for class, so a
   roll looks the same whether it came from the solo board or the shared table —
   see src/styles/gm/dice.css, which this page imports rather than copies. */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { LocalRoll } from '../../table/session';
import type { WireMember } from '../../table/protocol';
import { CRIT_MARGIN } from '../../gm/constants';
import { VERDICTS, accuracyVerdict, struckText } from '../../gm/dice';
import { DieFaces } from '../gm/DieFaces';
import { colorVars } from '../../table/colors';

/** How long a roll that just came in stays lit. */
const FRESH_MS = 3000;

export function RollFeed({ rolls, myName, members, sorted, onReroll }: {
    /** Take Your Chances on one of this player's own rolls: roll id, die. */
    onReroll?: (id: string, i: number) => void;
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
                return (
                    <FeedRow
                        key={r.id} roll={r} mine={r.who === myName} color={by ? by.color : undefined} sorted={sorted}
                        onReroll={onReroll && r.who === myName ? (i) => onReroll(r.id, i) : undefined}
                    />
                );
            })}
        </div>
    );
}

function FeedRow({ roll, mine, color, sorted, onReroll }: {
    onReroll?: (i: number) => void;
    roll: LocalRoll;
    mine: boolean;
    color: number | undefined;
    sorted: boolean;
}) {
    /* Lit once, as it arrives; a roll from a history sync never is. */
    const [fresh] = useState(() => !!roll.seenAt && Date.now() - roll.seenAt < FRESH_MS);
    const sides = parseInt(roll.label.split('d')[1], 10);
    const time = new Date(roll.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    /* Worked out here from the net successes rather than sent: a receiver
       recomputes `net` from the faces, so the verdict follows from those. */
    const verdict = roll.need != null && roll.net != null
        ? VERDICTS[accuracyVerdict(roll.net, roll.need, roll.crit ?? CRIT_MARGIN, CRIT_MARGIN)] : null;
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

            <DieFaces roll={roll} sides={sides} sorted={sorted} onesMarked onReroll={onReroll}>
                {roll.bonus != null && (
                    <span className="die-bonus" title="Added to the dice, not rolled">
                        {roll.bonus < 0 ? '−' : '+'}{Math.abs(roll.bonus)}
                    </span>
                )}
            </DieFaces>

            <div className="roll-totals">
                <span>Total <strong>{roll.total}</strong></span>
                {roll.net != null && (
                    <span className="succ">
                        {roll.net === 1 ? 'Success' : 'Successes'} <strong>{roll.net}</strong>
                        {!!struckText(roll) && (
                            <> <span className="pain-sub">{struckText(roll)}</span></>
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
