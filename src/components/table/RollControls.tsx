/* What you roll, and — if you are the GM — how.

   A player's Roll button sends a request; it does not roll. The dice are thrown
   on the host's machine and come back as a result, which is the whole reason a
   player cannot decide their own outcome. */

import { useTable } from '../../table/TableContext';
import { LIMITS } from '../../table/protocol';
import { totalRange } from '../../table/scripted';
import { saveSuccessesFirst } from '../../table/session';

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

export function RollControls() {
    const { session, state } = useTable();
    const { count, sides, isHost, hostOnline } = state;

    const clampCount = (v: number) =>
        session.set('count', Math.max(LIMITS.MIN_COUNT, Math.min(LIMITS.MAX_COUNT, v)));

    const waiting = !isHost && !hostOnline;
    const range = totalRange(count, sides);
    /* A roll set up from the character panel: the button glows until it is
       pressed, and the dice can still be changed for a modifier — except an
       initiative, which is always one d6 and takes its modifier as a bonus. */
    const prep = isHost ? null : state.prep;
    const fixed = !!prep?.enter;
    const bonus = prep?.extras.bonus;
    const setBonus = (v: number) => {
        if (!prep) return;
        session.set('prep', { ...prep, extras: { ...prep.extras, bonus: Math.max(LIMITS.MIN_BONUS, Math.min(LIMITS.MAX_BONUS, v)) } });
    };

    return (
        <div className="roll-controls" data-keeps-tip="">
            <div className="dice-chips">
                {QUICK_DICE.map((s) => (
                    <button
                        key={s}
                        className={'dice-chip ' + (sides === s ? 'selected' : '')}
                        disabled={fixed}
                        onClick={() => session.set('sides', s)}
                    >
                        d{s}
                    </button>
                ))}
            </div>

            <div className="dice-config">
                <label htmlFor="table-count">Dice</label>
                <div className="stepper">
                    <button className="icon-btn" disabled={fixed} onClick={() => clampCount(count - 1)} title="One fewer die">
                        <i className="fa-solid fa-minus"></i>
                    </button>
                    <input
                        id="table-count" type="number"
                        min={LIMITS.MIN_COUNT} max={LIMITS.MAX_COUNT}
                        value={count}
                        disabled={fixed}
                        onChange={(e) => {
                            const v = parseInt(e.currentTarget.value, 10);
                            clampCount(isNaN(v) ? LIMITS.MIN_COUNT : v);
                        }}
                    />
                    <button className="icon-btn" disabled={fixed} onClick={() => clampCount(count + 1)} title="One more die">
                        <i className="fa-solid fa-plus"></i>
                    </button>
                </div>

                <label htmlFor="table-sides">Sides</label>
                <div className="stepper">
                    <input
                        id="table-sides" type="number"
                        min={LIMITS.MIN_SIDES} max={LIMITS.MAX_SIDES}
                        value={sides}
                        disabled={fixed}
                        onChange={(e) => {
                            const v = parseInt(e.currentTarget.value, 10);
                            session.set('sides', isNaN(v) ? 6
                                : Math.max(LIMITS.MIN_SIDES, Math.min(LIMITS.MAX_SIDES, v)));
                        }}
                    />
                </div>
            </div>

            <input
                className="roll-note" type="text"
                placeholder="What for? (Insight, Clash, Brawl…)"
                maxLength={LIMITS.MAX_NOTE}
                value={state.note}
                onChange={(e) => session.set('note', e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !waiting) session.requestRoll(); }}
            />

            {isHost && <HostOptions />}

            {prep && (
                <div className="dice-prep" data-dice-prep="">
                    <i className="fa-solid fa-hand-pointer"></i>
                    <span className="dice-prep-text">
                        {state.note || 'Roll set up'}
                        {prep.extras.need !== undefined && <> · needs {prep.extras.need}</>}
                        {!!prep.extras.pain && <> · pain −{prep.extras.pain}</>}
                    </span>
                    {bonus !== undefined && (
                        <div className="stepper prep-bonus" title="Dexterity + Alert, plus or minus any modifier">
                            <button className="icon-btn" aria-label="Bonus down" onClick={() => setBonus(bonus - 1)}>
                                <i className="fa-solid fa-minus"></i>
                            </button>
                            <span className="prep-bonus-value">{bonus < 0 ? '−' + Math.abs(bonus) : '+' + bonus}</span>
                            <button className="icon-btn" aria-label="Bonus up" onClick={() => setBonus(bonus + 1)}>
                                <i className="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    )}
                    <button className="icon-btn" aria-label="Cancel the roll that is set up" onClick={() => session.set('prep', null)}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            )}

            <button
                id="roll-btn"
                className={prep ? 'primed' : ''}
                disabled={waiting}
                title={waiting ? 'The GM is not connected right now' : undefined}
                onClick={() => session.requestRoll()}
            >
                <i className="fa-solid fa-dice"></i>{' '}
                {isHost ? 'Roll' : 'Ask to roll'} {count}d{sides}
                {bonus !== undefined && (bonus < 0 ? ' − ' + Math.abs(bonus) : ' + ' + bonus)}
            </button>

            {waiting && (
                <p className="muted waiting-note">
                    Waiting for the GM to reconnect. Anything you roll is queued and sent
                    the moment they are back.
                </p>
            )}

            {isHost && state.scripted && (
                <p className="muted scripted-note">
                    <i className="fa-solid fa-wand-magic-sparkles"></i>{' '}
                    The next roll will land on {sides === 6
                        ? state.scriptSuccesses + (state.scriptSuccesses === 1 ? ' success' : ' successes')
                        : 'a total of ' + state.scriptTotal}. The table sees ordinary dice —
                    nothing marks it as arranged.
                </p>
            )}

            {isHost && state.scripted && sides !== 6 && (
                <p className="muted">Reachable totals for {count}d{sides}: {range.min}–{range.max}.</p>
            )}
        </div>
    );
}

function HostOptions() {
    const { session, state } = useTable();
    const { sides, count } = state;
    const range = totalRange(count, sides);

    return (
        <div className="host-options">
            {/* One line each; what they do is in the hint. */}
            <div className="host-toggles">
                <label className="check" title="Your results stay on this screen. Untick for a roll the table should see.">
                    <input
                        type="checkbox"
                        checked={state.hideMyRolls}
                        onChange={(e) => session.set('hideMyRolls', e.currentTarget.checked)}
                    />
                    <span><i className="fa-solid fa-eye-slash"></i> Hide my rolls</span>
                </label>

                <label className="check" title="Decide the outcome in advance. The dice shown are real dice that add up to it.">
                    <input
                        type="checkbox"
                        checked={state.scripted}
                        onChange={(e) => session.set('scripted', e.currentTarget.checked)}
                    />
                    <span><i className="fa-solid fa-wand-magic-sparkles"></i> Scripted result</span>
                </label>

                <label className="check" title="Show a pool's successes first and the other dice after them, in your feed.">
                    <input
                        type="checkbox"
                        checked={state.successesFirst}
                        onChange={(e) => {
                            const on = e.currentTarget.checked;
                            session.set('successesFirst', on);
                            saveSuccessesFirst(on);
                        }}
                    />
                    <span><i className="fa-solid fa-arrow-down-wide-short"></i> Successes first</span>
                </label>
            </div>

            {state.scripted && (
                <div className="script-target">
                    {sides === 6 ? (
                        <>
                            <label htmlFor="script-succ">Successes</label>
                            <input
                                id="script-succ" type="number" min={0} max={count}
                                value={state.scriptSuccesses}
                                onChange={(e) => {
                                    const v = parseInt(e.currentTarget.value, 10);
                                    session.set('scriptSuccesses',
                                        Math.max(0, Math.min(count, isNaN(v) ? 0 : v)));
                                }}
                            />
                            <span className="muted">out of {count}</span>
                        </>
                    ) : (
                        <>
                            <label htmlFor="script-total">Total</label>
                            <input
                                id="script-total" type="number" min={range.min} max={range.max}
                                value={state.scriptTotal}
                                onChange={(e) => {
                                    const v = parseInt(e.currentTarget.value, 10);
                                    session.set('scriptTotal',
                                        Math.max(range.min, Math.min(range.max, isNaN(v) ? range.min : v)));
                                }}
                            />
                            <span className="muted">{range.min}–{range.max}</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
