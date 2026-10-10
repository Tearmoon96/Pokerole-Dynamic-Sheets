import { Panel } from './Panel';
import { useGm } from '../../gm/GmContext';
import { CRIT_DAMAGE, CRIT_MARGIN } from '../../gm/constants';
import { HISTORY_LIMIT, VERDICTS, faceOrder, painStruck, roll } from '../../gm/dice';
import type { RollEntry, RollMeta } from '../../gm/dice';

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

    /* Rolls whatever is set up — a move panel's roll, with its count as the GM
       may have changed it — or plain dice. */
    const doRoll = () => store.update((s) => {
        const meta = (s.dice.prep || {}) as RollMeta;
        const entry = roll(s.dice.count, s.dice.sides, meta, CRIT_MARGIN);
        s.dice = { ...s.dice, prep: null, history: [entry, ...s.dice.history].slice(0, HISTORY_LIMIT) };
    });

    /* A hit rolls its damage from here rather than sending the GM back to the
       move panel; a critical rolls it already boosted. Everything the damage
       roll needs rode along on the accuracy entry — the pool, who rolled it
       and the pain penalty, which strikes damage successes just the same. */
    const rollDamage = (from: RollEntry, extra: number) => {
        const d = from.dmg;
        if (!d || !(d.dice + extra > 0)) return;
        const what = d.what || (from.what || '').replace(/ accuracy$/, '') + ' damage';
        /* Set up, like every roll from a move: Roll throws it. */
        store.update((s) => {
            s.dice = { ...s.dice, count: d.dice + extra, sides: 6,
                prep: { who: from.who, what: what + (extra ? ' (critical)' : ''), pain: from.pain } };
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
                            {prep.need != null && <> · needs {prep.need}</>}
                            {!!prep.pain && <> · pain −{prep.pain}</>}
                        </span>
                        <button
                            className="icon-btn"
                            aria-label="Cancel the roll that is set up"
                            onClick={() => store.update((s) => { s.dice = { ...s.dice, prep: null }; })}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}
                <button id="roll-btn" className={prep ? 'primed' : ''} onClick={() => doRoll()}>
                    Roll {count}d{sides}{prep && prep.bonus != null ? (prep.bonus < 0 ? ' − ' : ' + ') + Math.abs(prep.bonus) : ''}
                </button>
                <div id="roll-output">
                    {latest && <RollOutput key={latest.t} entry={latest} sorted={sorted} onRollDamage={rollDamage} />}
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
                                    <> · {e.net != null ? e.net : e.succ}✓{e.pain ? ' (−' + e.pain + ')' : ''}</>
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

function RollOutput({ entry, sorted, onRollDamage }: {
    entry: RollEntry;
    sorted: boolean;
    onRollDamage: (from: RollEntry, extra: number) => void;
}) {
    const sides = parseInt(entry.label.split('d')[1], 10);
    const struck = painStruck(entry.vals, entry.pain);
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
            <div className="die-faces">
                {/* A sum roll's flat part sits in the row of faces as a chip of
                    its own, so what was rolled and what was added read as one
                    sentence rather than the total appearing from nowhere. */}
                {/* A 1 is one of the misses and nothing more: no border of its
                    own, and nothing anywhere counts ones. */}
                {faceOrder(entry.vals, entry.succ != null, sorted).map((i) => {
                    const val = entry.vals[i];
                    const cls = entry.succ != null && val >= 4 ? 'success'
                        : val === sides ? 'max' : '';
                    const out = struck.has(i) ? ' struck' : '';
                    return (
                        <span
                            key={i}
                            className={'die-face ' + cls + out}
                            title={out ? 'Struck out by the pain penalty' : undefined}
                        >
                            {val}
                        </span>
                    );
                })}
                {entry.bonus != null && (
                    <span className="die-bonus" title="Added to the dice, not rolled">
                        {entry.bonus < 0 ? '−' : '+'}{Math.abs(entry.bonus)}
                    </span>
                )}
            </div>
            <div className="roll-totals">
                <span>Total <strong>{entry.total}</strong></span>
                {entry.succ != null && (
                    <span className="succ">
                        Successes <strong>{entry.net}</strong>
                        {!!entry.pain && (
                            <> <span className="pain-sub">({entry.succ} − {entry.pain} pain)</span></>
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
