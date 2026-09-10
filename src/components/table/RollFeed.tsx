/* The shared feed. Every roll the table can see, newest first.

   The faces and their colouring are the GM screen's, class for class, so a
   roll looks the same whether it came from the solo board or the shared table —
   see src/styles/gm/dice.css, which this page imports rather than copies. */

import type { LocalRoll } from '../../table/session';

export function RollFeed({ rolls, myName }: { rolls: LocalRoll[]; myName: string }) {
    if (!rolls.length) {
        return (
            <div className="empty-note">
                No rolls yet. Whatever anyone rolls appears here for the whole table.
            </div>
        );
    }

    return (
        <div className="roll-feed">
            {rolls.map((r) => <FeedRow key={r.id} roll={r} mine={r.who === myName} />)}
        </div>
    );
}

function FeedRow({ roll, mine }: { roll: LocalRoll; mine: boolean }) {
    const sides = parseInt(roll.label.split('d')[1], 10);
    const time = new Date(roll.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className={'roll-result feed-row' + (mine ? ' mine' : '') + (roll.hidden ? ' hidden-roll' : '')}>
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
                    {roll.label} · {time}
                </span>
            </div>

            <div className="die-faces">
                {roll.vals.map((val, i) => {
                    const cls = roll.succ != null && val >= 4 ? 'success'
                        : val === sides ? 'max' : val === 1 ? 'one' : '';
                    return <span key={i} className={'die-face ' + cls}>{val}</span>;
                })}
            </div>

            <div className="roll-totals">
                <span>Total <strong>{roll.total}</strong></span>
                {roll.succ != null && (
                    <span className="succ">
                        {roll.succ === 1 ? 'Success' : 'Successes'} <strong>{roll.succ}</strong>
                    </span>
                )}
            </div>
        </div>
    );
}
