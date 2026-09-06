import { Panel } from './Panel';
import { useGm } from '../../gm/GmContext';
import { CRIT_DAMAGE, CRIT_MARGIN } from '../../gm/constants';
import { HISTORY_LIMIT, VERDICTS, painStruck, roll } from '../../gm/dice';
import type { RollEntry, RollMeta } from '../../gm/dice';

/* The dice roller: quick d-chips, a count/sides stepper, the last roll in full
   and a compact history behind it. */

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

export function DicePanel({ onReorder, onRollDamage }: {
    onReorder: (from: string, to: string) => void;
    /** A hit rolls its damage from here rather than sending the GM back to the
        move panel; a critical rolls it already boosted. */
    onRollDamage: (token: string, mi: number, extra: number) => void;
}) {
    const { state, store } = useGm();
    const { count, sides, history } = state.dice;
    const latest = (history[0] as RollEntry | undefined) || null;

    const doRoll = (meta: RollMeta = {}) => store.update((s) => {
        const entry = roll(s.dice.count, s.dice.sides, meta, CRIT_MARGIN);
        s.dice = { ...s.dice, history: [entry, ...s.dice.history].slice(0, HISTORY_LIMIT) };
    });

    return (
        <Panel
            panelKey="dice"
            icon="fa-dice"
            title="Dice"
            onReorder={onReorder}
            actions={
                <button
                    className="icon-btn"
                    onClick={() => store.update((s) => { s.dice = { ...s.dice, history: [] }; })}
                    title="Clear roll history"
                >
                    <i className="fa-solid fa-eraser"></i>
                </button>
            }
        >
            <div className="panel-body">
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
                <button id="roll-btn" onClick={() => doRoll()}>Roll {count}d{sides}</button>
                <div id="roll-output">
                    {latest && <RollOutput entry={latest} onRollDamage={onRollDamage} />}
                </div>
                <div id="roll-history">
                    {(history.slice(1) as RollEntry[]).map((e, i) => (
                        <div className="roll-history-entry" key={e.t + '-' + i}>
                            <span className="h-label">{e.label}</span>
                            <span className="h-vals">{e.vals.join(' ')}</span>
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

function RollOutput({ entry, onRollDamage }: {
    entry: RollEntry;
    onRollDamage: (token: string, mi: number, extra: number) => void;
}) {
    const sides = parseInt(entry.label.split('d')[1], 10);
    const struck = painStruck(entry.vals, entry.pain);
    const time = new Date(entry.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const v = entry.verdict ? VERDICTS[entry.verdict] : null;
    const showFollowUp = entry.dmg && (entry.verdict === 'hit' || entry.verdict === 'crit');
    const extra = entry.verdict === 'crit' ? CRIT_DAMAGE : 0;

    return (
        <div className="roll-result">
            <div className="roll-label"><span>{entry.label}</span><span>{time}</span></div>
            {entry.what && (
                <div className="roll-ctx">
                    {entry.who || ''}{entry.who ? ' · ' : ''}{entry.what}
                </div>
            )}
            <div className="die-faces">
                {entry.vals.map((val, i) => {
                    const cls = entry.succ != null && val >= 4 ? 'success'
                        : val === sides ? 'max' : val === 1 ? 'one' : '';
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
                    onClick={() => onRollDamage(entry.dmg!.token, entry.dmg!.mi, extra)}
                >
                    <i className="fa-solid fa-dice"></i>
                    {' '}Roll damage {entry.dmg.dice + extra}d6{extra ? ' (+' + extra + ' critical)' : ''}
                </button>
            )}
        </div>
    );
}
