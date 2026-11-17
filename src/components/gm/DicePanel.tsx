import { Panel } from './Panel';
import { useGm } from '../../gm/GmContext';
import { CRIT_DAMAGE, CRIT_MARGIN } from '../../gm/constants';
import { HISTORY_LIMIT, VERDICTS, faceOrder, rerollEntry, roll, struckOff, struckText } from '../../gm/dice';
import { useAppData } from '../../data/AppDataContext';
import { adjustPool, entityPain, entityPool, entityRef } from '../../gm/entities';
import { willRoundOf } from '../../gm/willSpend';
import { FREE, notePushedFate, roundWill, setTakeChances, useRoundWillVersion } from '../../lib/willRound';
import { PAIN_OFF_KEY, readGmPainOff, writeGmPainOff } from '../../lib/pain';
import { WillSpend } from './WillSpend';
import { DieFaces } from './DieFaces';
import { useEffect, useState } from 'react';
import type { PokedexEntry } from '../../data/types';
import type { RollEntry, RollMeta } from '../../gm/dice';
import { actionOf, pidOf, spendRoll } from '../../gm/turns';
import { MAX_ACTIONS } from '../../gm/combat';
import type { GmState } from '../../gm/types';

/* The dice roller: quick d-chips, a count/sides stepper, the last roll in full
   and a compact history behind it. */

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

export function DicePanel({ onReorder }: {
    onReorder: (from: string, to: string) => void;
}) {
    const { state, store } = useGm();
    const { count, sides, history } = state.dice;
    const sorted = !!state.dice.sortResults;
    const latest = (history[0] as RollEntry | undefined) || null;
    const prep = (state.dice.prep || null) as RollMeta | null;

    const { data } = useAppData();
    const dexById = (id: string): PokedexEntry | null => data.pokemon.find((p) => p._id === id) || null;
    useRoundWillVersion();

    /* Pain Penalization off for everybody: the GM's switch, shared with the
       rolling table in this browser, which sends it on to the players. */
    const [painOff, setPainOff] = useState(readGmPainOff);
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === PAIN_OFF_KEY) { setPainOff(readGmPainOff()); store.refresh(); }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [store]);

    /* The Will buttons: only for a pool set up from a character's sheet, and
       never for a sum (an initiative). A damage roll takes Take Your Chances,
       never Pushing Fate. */
    const src = prep && sides === 6 && prep.bonus == null ? prep.src || null : null;
    const subject = src ? entityRef(state, dexById, src) : null;
    const willPool = subject ? entityPool(subject, 'will') : null;
    const round = src ? willRoundOf(state, dexById, src) : null;
    const spent = round ? roundWill(round.key, round.stamp) : { tyc: false, fate: 0 };
    const fate = src && willPool && !prep!.isDmg ? Math.max(0, Math.min(prep!.fate || 0, willPool.cur)) : 0;
    /* The pain and the target number as they are now, not when the roll was
       set up (see liveMeta). */
    const live = prep ? liveMeta(state, dexById, prep, sides, state.dice.prepUse) : null;

    /* Take Your Chances is bought AFTER the roll: with nothing set up, the
       buttons are about the roll just made, if it came from a sheet. */
    const lastSrc = !prep && latest && latest.src && latest.succ != null && latest.bonus == null ? latest.src : null;
    const lastSubject = lastSrc ? entityRef(state, dexById, lastSrc) : null;
    const lastWill = lastSubject ? entityPool(lastSubject, 'will') : null;
    const lastRound = lastSrc ? willRoundOf(state, dexById, lastSrc) : null;
    const lastSpent = lastRound ? roundWill(lastRound.key, lastRound.stamp) : { tyc: false, fate: 0 };

    /* Rolls whatever is set up — a move panel's roll, with its count as the GM
       may have changed it — or plain dice. */
    const doRoll = () => {
        /* Pushing Fate is paid as the dice leave the hand. */
        if (src && round && fate > 0) {
            adjustPool(state, dexById, src, 'will', -fate, () => store.save());
            notePushedFate(round.key, round.stamp, fate);
        }
        const tyc = !!src && spent.tyc;
        store.update((s) => {
        const prepNow = (s.dice.prep || {}) as RollMeta;
        const meta: RollMeta = s.dice.prep ? liveMeta(s, dexById, prepNow, s.dice.sides, s.dice.prepUse) : { ...prepNow };
        delete meta.fate;
        if (fate > 0) meta.fate = fate;
        if (tyc) meta.tyc = true;
        const entry = roll(s.dice.count, s.dice.sides, meta, CRIT_MARGIN);
        /* An Accuracy, an Evasion or a Clash is the action done: the pip
           fills, and the move or the mark is used for the Round. A set-up
           saved before `op` existed was always an Accuracy. */
        const use = s.dice.prep ? s.dice.prepUse : null;
        if (use) s.combats = s.combats.map((c) => spendRoll(c, use.pid, use.op || 'acc', use.move));
        s.dice = { ...s.dice, prep: null, prepUse: null, history: [entry, ...s.dice.history].slice(0, HISTORY_LIMIT) };
        });
    };

    /* Take Your Chances, bought for the roll just made: 1 Will, on for the
       rest of the Round, and that roll's failed dice turn into buttons. */
    const buyChances = () => {
        if (!lastSrc || !lastRound) return;
        adjustPool(state, dexById, lastSrc, 'will', -1, () => store.save());
        setTakeChances(lastRound.key, lastRound.stamp, true);
        store.update((s) => {
            const first = s.dice.history[0] as RollEntry | undefined;
            if (first) s.dice = { ...s.dice, history: [{ ...first, tyc: true }, ...s.dice.history.slice(1)] };
        });
    };

    /* Take Your Chances: one failed die of the roll just made, thrown again. */
    const reroll = (i: number) => store.update((s) => {
        const first = s.dice.history[0] as RollEntry | undefined;
        const next = first ? rerollEntry(first, i, CRIT_MARGIN) : null;
        if (next) s.dice = { ...s.dice, history: [next, ...s.dice.history.slice(1)] };
    });

    /* A hit rolls its damage from here rather than sending the GM back to the
       move panel; a critical rolls it already boosted. Everything the damage
       roll needs rode along on the accuracy entry — the pool, who rolled it
       and the pain penalty, which strikes damage successes just the same.
       The move's Low Accuracy stays behind: it is about the accuracy roll. */
    const rollDamage = (from: RollEntry, extra: number) => {
        const d = from.dmg;
        if (!d || !(d.dice + extra > 0)) return;
        const what = d.what || (from.what || '').replace(/ accuracy$/, '') + ' damage';
        /* Set up, like every roll from a move: Roll throws it. */
        store.update((s) => {
            s.dice = { ...s.dice, count: d.dice + extra, sides: 6,
                /* The pain is read again from the sheet when Roll is pressed
                   (liveMeta); an entry with no sheet behind it keeps its own. */
                prep: { who: from.who, what: what + (extra ? ' (critical)' : ''),
                    ...(from.src ? { src: from.src } : { pain: from.pain }),
                    isDmg: true },
                prepUse: null };
        });
    };

    return (
        <Panel
            panelKey="dice"
            icon="fa-dice"
            title="Dice"
            onReorder={onReorder}
            actions={
                <>
                    <label
                        className="dice-sort"
                        title="Show a pool's successes first and the other dice after them"
                    >
                        <input
                            type="checkbox"
                            aria-label="Successes first"
                            checked={sorted}
                            onChange={(e) => {
                                const on = e.currentTarget.checked;
                                store.update((s) => { s.dice = { ...s.dice, sortResults: on }; });
                            }}
                        />
                        <span className="dice-sort-track" aria-hidden="true"></span>
                        <span className="dice-sort-text">Successes first</span>
                    </label>
                    <button
                        className={'icon-btn pain-rule' + (painOff ? ' off' : '')}
                        data-pain-rule={painOff ? 'off' : 'on'}
                        aria-pressed={painOff}
                        title={painOff
                            ? 'Pain Penalization is OFF for everybody, here and at the rolling table. Click to bring it back.'
                            : 'Pain Penalization is on. Click to ignore it for everybody, here and at the rolling table.'}
                        onClick={() => { writeGmPainOff(!painOff); setPainOff(!painOff); store.refresh(); }}
                    >
                        <i className={'fa-solid ' + (painOff ? 'fa-heart' : 'fa-heart-crack')}></i>
                    </button>
                    <button
                        className="icon-btn"
                        onClick={() => store.update((s) => { s.dice = { ...s.dice, history: [] }; })}
                        title="Clear roll history"
                    >
                        <i className="fa-solid fa-eraser"></i>
                    </button>
                </>
            }
        >
            <div className="panel-body" data-keeps-tip="">
                <div className="dice-chips" id="dice-chips">
                    {QUICK_DICE.map((s) => (
                        <button
                            key={s}
                            className={'dice-chip ' + (sides === s ? 'selected' : '')}
                            onClick={() => store.update((st) => { st.dice = { ...st.dice, sides: s }; })}
                        >
                            d{s}
                        </button>
                    ))}
                </div>
                <div className="dice-config">
                    <label>Dice</label>
                    <div className="stepper">
                        <button
                            className="icon-btn"
                            onClick={() => store.update((s) => {
                                s.dice = { ...s.dice, count: Math.max(1, Math.min(99, s.dice.count - 1)) };
                            })}
                        >
                            <i className="fa-solid fa-minus"></i>
                        </button>
                        <input
                            type="number" id="dice-count" min="1" max="99"
                            value={count}
                            onChange={(e) => {
                                const c = parseInt(e.currentTarget.value, 10);
                                store.update((s) => {
                                    s.dice = { ...s.dice, count: isNaN(c) ? 1 : Math.max(1, Math.min(99, c)) };
                                });
                            }}
                        />
                        <button
                            className="icon-btn"
                            onClick={() => store.update((s) => {
                                s.dice = { ...s.dice, count: Math.max(1, Math.min(99, s.dice.count + 1)) };
                            })}
                        >
                            <i className="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <label>Sides</label>
                    <div className="stepper">
                        <input
                            type="number" id="dice-sides" min="2" max="1000"
                            value={sides}
                            onChange={(e) => {
                                const v = parseInt(e.currentTarget.value, 10);
                                store.update((s) => {
                                    s.dice = { ...s.dice, sides: isNaN(v) ? 6 : Math.max(2, Math.min(1000, v)) };
                                });
                            }}
                        />
                    </div>
                </div>
                {prep && (
                    <div className="dice-prep" data-dice-prep="">
                        <i className="fa-solid fa-hand-pointer"></i>
                        <span className="dice-prep-text">
                            {[prep.who, prep.what].filter(Boolean).join(' · ') || 'Roll set up'}
                            {live!.need != null && <> · needs {live!.need}</>}
                            {live!.need != null && live!.crit != null && <> · crit at +{live!.crit}</>}
                            {!!live!.low && <> · low accuracy −{live!.low}</>}
                            {!!live!.pain && <> · pain −{live!.pain}</>}
                            {fate > 0 && <> · fate +{fate}</>}
                            {!!src && spent.tyc && <> · reroll 1</>}
                        </span>
                        <button
                            className="icon-btn"
                            aria-label="Cancel the roll that is set up"
                            onClick={() => store.update((s) => { s.dice = { ...s.dice, prep: null, prepUse: null }; })}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}
                {src && round && willPool && (
                    <WillSpend
                        will={willPool.cur} fate={fate} roundFate={spent.fate} tyc={spent.tyc}
                        inFight={round.stamp !== FREE}
                        noFate={prep!.isDmg ? 'Pushing Fate never goes on a damage roll.' : undefined}
                        onFate={(n) => store.update((s) => {
                            s.dice = { ...s.dice, prep: { ...(s.dice.prep || {}), fate: n } };
                        })}
                        onTyc={(on) => {
                            if (!on) { setTakeChances(round.key, round.stamp, false); store.refresh(); }
                        }}
                    />
                )}
                {lastSrc && lastRound && lastWill && latest && (
                    <WillSpend
                        phase="after"
                        will={lastWill.cur} fate={0} roundFate={lastSpent.fate + (latest.fate || 0)} tyc={lastSpent.tyc}
                        inFight={lastRound.stamp !== FREE}
                        noReroll={latest.rr ? 'A die of this roll was already thrown again.'
                            : !latest.vals.some((v) => v < 4) ? 'No die of this roll failed: nothing to throw again.'
                                : undefined}
                        onFate={() => {}}
                        onTyc={(on) => {
                            if (on) { buyChances(); return; }
                            setTakeChances(lastRound.key, lastRound.stamp, false);
                            store.refresh();
                        }}
                    />
                )}
                <button id="roll-btn" className={prep ? 'primed' : ''} onClick={() => doRoll()}>
                    Roll {count}d{sides}{prep && prep.bonus != null ? (prep.bonus < 0 ? ' − ' : ' + ') + Math.abs(prep.bonus) : ''}
                </button>
                <div id="roll-output">
                    {latest && <RollOutput key={latest.t} entry={latest} sorted={sorted} onRollDamage={rollDamage} onReroll={reroll} />}
                </div>
                <div id="roll-history">
                    {(history.slice(1) as RollEntry[]).map((e, i) => (
                        <div className="roll-history-entry" key={e.t + '-' + i}>
                            <span className="h-label">{e.label}</span>
                            <span className="h-vals">
                                {faceOrder(e.vals, e.succ != null, sorted).map((i) => e.vals[i]).join(' ')}
                                {e.bonus != null && (e.bonus < 0 ? ' − ' + Math.abs(e.bonus) : ' + ' + e.bonus)}
                            </span>
                            <span className="h-total">
                                = {e.total}
                                {e.succ != null && (
                                    <> · {e.net != null ? e.net : e.succ}✓{struckOff(e) ? ' (−' + struckOff(e) + ')' : ''}{e.fate ? ' (+' + e.fate + ' fate)' : ''}</>
                                )}
                            </span>
                            {e.verdict && (
                                <span
                                    className={'h-verdict ' + VERDICTS[e.verdict].cls}
                                    title={(e.who ? e.who + ' — ' : '') + (e.what || '')}
                                >
                                    {VERDICTS[e.verdict].label}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Panel>
    );
}

function RollOutput({ entry, sorted, onRollDamage, onReroll }: {
    entry: RollEntry;
    sorted: boolean;
    onRollDamage: (from: RollEntry, extra: number) => void;
    onReroll: (i: number) => void;
}) {
    const sides = parseInt(entry.label.split('d')[1], 10);
    const time = new Date(entry.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const v = entry.verdict ? VERDICTS[entry.verdict] : null;
    /* After a hit — or after an accuracy roll with no target number to judge
       it by, from outside a fight, where the GM makes the call. Never after a
       miss. */
    const showFollowUp = entry.dmg && (entry.verdict === 'hit' || entry.verdict === 'crit' || !entry.verdict);
    const extra = entry.verdict === 'crit' ? CRIT_DAMAGE : 0;
    /* Keyed by its time, so a new roll mounts afresh and lights up once. */
    const fresh = Date.now() - entry.t < 3000;

    return (
        <div className={'roll-result' + (fresh ? ' fresh' : '')}>
            <div className="roll-label"><span>{entry.label}</span><span>{time}</span></div>
            {entry.what && (
                <div className="roll-ctx">
                    {entry.who || ''}{entry.who ? ' · ' : ''}{entry.what}
                </div>
            )}
            {/* A sum roll's flat part sits in the row of faces as a chip of
                its own, so what was rolled and what was added read as one
                sentence rather than the total appearing from nowhere. A 1 is
                one of the misses and nothing more: no border of its own, and
                nothing anywhere counts ones. */}
            <DieFaces
                roll={entry} sides={sides} sorted={sorted} onReroll={onReroll}
                struckTitle={'Struck out by ' + (entry.low ? (entry.pain ? 'Low Accuracy or the pain penalty' : 'Low Accuracy') : 'the pain penalty')}
            >
                {entry.bonus != null && (
                    <span className="die-bonus" title="Added to the dice, not rolled">
                        {entry.bonus < 0 ? '−' : '+'}{Math.abs(entry.bonus)}
                    </span>
                )}
            </DieFaces>
            <div className="roll-totals">
                <span>Total <strong>{entry.total}</strong></span>
                {entry.succ != null && (
                    <span className="succ">
                        Successes <strong>{entry.net}</strong>
                        {!!struckText(entry) && (
                            <> <span className="pain-sub">{struckText(entry)}</span></>
                        )}
                    </span>
                )}
                {entry.need != null && <span className="need">Needs <strong>{entry.need}</strong></span>}
            </div>
            {v && (
                <div className={'roll-verdict ' + v.cls}>
                    <i className={'fa-solid ' + v.icon}></i> {v.label}
                    {entry.verdict === 'crit' && <span className="sub">+{CRIT_DAMAGE} damage dice</span>}
                    {entry.verdict === 'fumble' && <span className="sub">the GM decides what it costs</span>}
                </div>
            )}
            {showFollowUp && entry.dmg && (
                <button
                    className="roll-followup"
                    onClick={() => onRollDamage(entry, extra)}
                >
                    <i className="fa-solid fa-dice"></i>
                    {' '}Roll damage {entry.dmg.dice + extra}d6{extra ? ' (+' + extra + ' critical)' : ''}
                </button>
            )}
        </div>
    );
}

/** A set-up roll's meta with the pain and the target number read again from
    the sheet and the fight as they are now: an Ignore pain, a blow taken or
    a pip filled after the roll was set up would otherwise leave it a success
    short, or measured against the wrong action — and its critical with it. */
function liveMeta(
    state: GmState, dexById: (id: string) => PokedexEntry | null, prep: RollMeta, sides: number,
    use: { pid: string; op?: string } | null | undefined,
): RollMeta {
    const out: RollMeta = { ...prep };
    if (prep.src && sides === 6 && prep.bonus == null) {
        const pain = entityPain(entityRef(state, dexById, prep.src));
        if (pain) {
            if (pain.penalty) out.pain = pain.penalty; else delete out.pain;
        }
    }
    if (use && (use.op || 'acc') === 'acc' && out.need != null) {
        for (const c of state.combats) {
            const p = c.participants.find((x) => pidOf(x) === use.pid);
            if (!p) continue;
            const act = actionOf((p.acted as number) || 0);
            if (act <= MAX_ACTIONS) out.need = act;
            break;
        }
    }
    return out;
}
