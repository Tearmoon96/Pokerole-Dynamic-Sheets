/* What you roll, and — if you are the GM — how.

   A player's Roll button sends a request; it does not roll. The dice are thrown
   on the host's machine and come back as a result, which is the whole reason a
   player cannot decide their own outcome. */

import { useTable } from '../../table/TableContext';
import { LIMITS } from '../../table/protocol';
import { totalRange } from '../../table/scripted';
import { saveSuccessesFirst, type PreparedRoll, type RollWill } from '../../table/session';
import type { RollExtras } from '../../table/protocol';
import { charWill, soloState, spendCharWill, useWorkingSet } from '../../table/character';
import { FREE, notePushedFate, roundWill, setTakeChances, useRoundWillVersion } from '../../lib/willRound';
import { entityPain, entityRef } from '../../gm/entities';
import { actionOf } from '../../gm/turns';
import { MAX_ACTIONS } from '../../gm/combat';
import type { AppData } from '../../data/types';
import type { TableSession } from '../../table/session';
import { WillSpend } from '../gm/WillSpend';
import { IgnorePain } from './IgnorePain';
import { useTableData } from './useTableData';

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
    /* The Will buttons: for a pool set up from a character's sheet, never a
       damage roll or an initiative (CharacterPanel leaves `will` out). */
    const [, refreshSheets] = useWorkingSet();
    const data = useTableData();
    useRoundWillVersion();
    const w = prep && sides === 6 && bonus === undefined ? prep.will || null : null;
    const will = w ? charWill(w.trainerId, w.token, w.have) : 0;
    const spent = w ? roundWill(w.key, w.stamp) : { tyc: false, fate: 0 };
    const fate = w && !w.dmg ? Math.max(0, Math.min(prep!.extras.fate || 0, will)) : 0;
    /* The pain and the target number as they are NOW, not as they were when
       the roll was set up: an Ignore pain, a blow taken or a pip filled in
       between would otherwise leave the roll a success short, or measured
       against the wrong action — and its critical with it. */
    const live = prep ? liveExtras(prep, sides, data, session, state.myId) : null;

    /* The roll just made, for Take Your Chances, which is bought after the
       throw. Only while nothing new is set up: a roll set up is the one the
       buttons are about. */
    const own = !isHost && !prep ? state.lastOwn : null;
    const ownRoll = own ? state.rolls.find((r) => r.id === own.id) || null : null;
    const turns = session.combat.view.turns;
    const after = own && ownRoll ? afterRoll(own.will, ownRoll, turns ? turns.name + ':' + turns.round : null) : null;

    /* Pushing Fate is paid as the roll is asked for; Take Your Chances, if
       it is on this Round, rides along so the GM's page lets one failed die
       go again. */
    const throwIt = () => {
        if (waiting) return;
        if (prep && live) {
            const extras = { ...live };
            delete extras.fate;
            delete extras.tyc;
            if (w && fate > 0) {
                extras.fate = fate;
                spendCharWill(w.trainerId, w.token, fate, w.have);
                notePushedFate(w.key, w.stamp, fate);
                refreshSheets();
            }
            if (w && spent.tyc) extras.tyc = true;
            session.set('prep', { ...prep, extras });
        }
        session.requestRoll();
    };

    const setBonus = (v: number) => {
        if (!prep) return;
        session.set('prep', { ...prep, extras: { ...prep.extras, bonus: Math.max(LIMITS.MIN_BONUS, Math.min(LIMITS.MAX_BONUS, v)) } });
    };

    return (
        <div className="roll-controls" data-keeps-tip="" data-tour="dice">
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
                onKeyDown={(e) => { if (e.key === 'Enter') throwIt(); }}
            />

            {isHost ? <HostOptions /> : (
                <div className="host-options player-options">
                    <div className="host-toggles"><SuccessesFirst /></div>
                </div>
            )}

            {prep && (
                <div className="dice-prep" data-dice-prep="">
                    <i className="fa-solid fa-hand-pointer"></i>
                    <span className="dice-prep-text">
                        {state.note || 'Roll set up'}
                        {live!.need !== undefined && <> · needs {live!.need}</>}
                        {live!.crit !== undefined && <> · crit at +{live!.crit}</>}
                        {!!live!.low && <> · low accuracy −{live!.low}</>}
                        {!!live!.pain && <> · pain −{live!.pain}</>}
                        {fate > 0 && <> · fate +{fate}</>}
                        {!!w && spent.tyc && <> · reroll 1</>}
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

            {w && prep ? (
                <WillSpend
                    will={will} fate={fate} roundFate={spent.fate} tyc={spent.tyc}
                    inFight={w.stamp !== FREE}
                    noFate={w.dmg ? 'Pushing Fate never goes on a damage roll.' : undefined}
                    onFate={(n) => session.set('prep', { ...prep, extras: { ...prep.extras, fate: n } })}
                    onTyc={(on) => { if (!on) setTakeChances(w.key, w.stamp, false); }}
                    bare
                />
            ) : own && after ? (
                <WillSpend
                    phase="after"
                    will={after.will} fate={0} roundFate={after.roundFate} tyc={after.tyc}
                    inFight={own.will.stamp !== FREE}
                    noReroll={after.noReroll}
                    onFate={() => {}}
                    onTyc={(on) => {
                        const ow = own.will;
                        if (!on) { setTakeChances(ow.key, ow.stamp, false); return; }
                        /* Bought for the roll just made: 1 Will, on for the
                           Round, and that roll's failed dice turn into buttons. */
                        spendCharWill(ow.trainerId, ow.token, 1, ow.have);
                        setTakeChances(ow.key, ow.stamp, true);
                        session.set('tycArmed', own.id);
                        refreshSheets();
                    }}
                    bare
                />
            ) : (
                <WillSpend
                    will={0} fate={0} roundFate={0} tyc={false} inFight={false}
                    onFate={() => {}} onTyc={() => {}}
                    idle={idleWill(isHost, prep, sides)}
                    bare
                />
            )}

            <IgnorePain onBought={refreshSheets} />

            <button
                id="roll-btn"
                className={prep ? 'primed' : ''}
                disabled={waiting}
                title={waiting ? 'The GM is not connected right now' : undefined}
                onClick={throwIt}
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

/** Why the Will buttons are greyed out. */
function idleWill(isHost: boolean, prep: PreparedRoll | null, sides: number): string {
    if (isHost) return 'Will is spent by the player whose roll it is, from their own character.';
    if (prep?.will && sides !== 6) return 'Will goes on a pool of d6 only.';
    if (prep && (prep.enter || prep.extras.bonus !== undefined)) return 'Not on an initiative.';
    if (prep) return 'Not on this roll.';
    return 'Roll from your character (its Accuracy, a skill, Evasion\u2026) to spend its Will: '
        + 'Pushing Fate before the roll, Take Your Chances after it.';
}

/** A prepared roll's extras with the pain and the target number read again
    from the sheet and the fight as they are now. While the dataset is still
    loading, the pain stays what it was when the roll was set up. */
function liveExtras(prep: PreparedRoll, sides: number, data: AppData | null, session: TableSession, myId: string): RollExtras {
    const out: RollExtras = { ...prep.extras };
    const w = prep.will;
    if (w && data && sides === 6 && out.bonus === undefined) {
        const dexById = (id: string) => data.pokemon.find((p) => p._id === id) || null;
        const pain = entityPain(entityRef(soloState(w.trainerId), dexById, w.token));
        if (pain) {
            if (pain.penalty) out.pain = pain.penalty; else delete out.pain;
        }
    }
    const q = prep.quick;
    const turns = session.combat.view.turns;
    if (q && q.op === 'acc' && out.need !== undefined && turns) {
        const e = turns.order.find((x) => x.id === q.id && x.own === myId);
        const act = e ? actionOf(e.acted ?? 0) : 0;
        if (act >= 1 && act <= MAX_ACTIONS) out.need = act;
    }
    return out;
}

/** Where Take Your Chances stands for the roll just made. `now` is the
    fight's Round as it is now, or null with no fight on the table. */
function afterRoll(
    w: RollWill, r: { tyc?: boolean; rr?: [number, number]; succ: number | null; vals: number[]; fate?: number },
    now: string | null,
): { will: number; tyc: boolean; roundFate: number; noReroll?: string } {
    const spent = roundWill(w.key, w.stamp);
    const noReroll = w.stamp !== FREE && w.stamp !== now ? 'That roll was made in an earlier Round.'
        : r.succ == null ? 'Not on this roll.'
            : r.rr ? 'A die of this roll was already thrown again.'
                : !r.vals.some((v) => v < 4) ? 'No die of this roll failed: nothing to throw again.'
                    : undefined;
    return {
        will: charWill(w.trainerId, w.token, w.have),
        tyc: spent.tyc,
        roundFate: spent.fate + (r.fate || 0),
        noReroll,
    };
}

/** Display only, this browser only: the GM and every player choose it alike. */
function SuccessesFirst() {
    const { session, state } = useTable();
    return (
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
    );
}

function HostOptions() {
    const { session, state } = useTable();
    const { sides, count } = state;
    const range = totalRange(count, sides);

    return (
        <div className="host-options" data-tour="host-options">
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

                <SuccessesFirst />

                <label className="check" title="Pain Penalization is switched off for everybody at the table: no successes lost at half HP or at 1 HP, on your GM screen too.">
                    <input
                        type="checkbox" data-pain-rule=""
                        checked={state.painOff}
                        onChange={(e) => session.setPainOff(e.currentTarget.checked)}
                    />
                    <span><i className="fa-solid fa-heart"></i> No pain rule</span>
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
