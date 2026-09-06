import { useState } from 'react';
import { useCard } from '../../card/CardContext';
import { COMBAT_STAT_KEYS, SOCIAL_STAT_KEYS } from '../../card/defaults';
import { getPoolMax, getStatBase, getStatMax } from '../../card/pools';
import { STAT_LABELS } from '../../lib/pills';
import type { CardSheet } from '../../card/types';
import type { PokedexEntry } from '../../data/types';

/* Base stats and social attributes, and the form that rewrites their bases and
   caps. Two views of the same panel, switched by the masks button. */

const ALL_KEYS = [...COMBAT_STAT_KEYS, ...SOCIAL_STAT_KEYS];

/* Vitality and Insight feed the two pool maxes, so anything that moves them has
   to say what happens to the current value: a pool that was full stays full,
   anything below keeps the number it had. */
function withPoolsFollowingStats(p: PokedexEntry, s: CardSheet, mutate: () => void): void {
    const before = { pokemon: p, sheet: s };
    const wasFull = {
        hp: s.hp >= getPoolMax(before, 'hp'),
        will: s.will >= getPoolMax(before, 'will'),
    };
    mutate();
    (['hp', 'will'] as const).forEach((key) => {
        const max = getPoolMax({ pokemon: p, sheet: s }, key);
        s[key] = wasFull[key] ? max : Math.min(s[key], max);
    });
}

function StatRow({ statKey, totalDots }: { statKey: string; totalDots: number }) {
    const { pokemon, sheet, src, store } = useCard();
    const base = getStatBase(src, statKey);
    const maxVal = getStatMax(src, statKey);
    const trained = sheet.trainedStats[statKey] || 0;

    const toggleTrain = (trainedValue: number) => store.update((s) => {
        withPoolsFollowingStats(pokemon, s, () => {
            const currentTrained = s.trainedStats[statKey] || 0;
            const cappedTrained = Math.min(trainedValue, maxVal - base);
            const next = { ...s.trainedStats };
            next[statKey] = currentTrained === cappedTrained ? cappedTrained - 1 : cappedTrained;
            if (next[statKey] < 0) next[statKey] = 0;
            s.trainedStats = next;
        });
    });

    /* Every row in the view is as long as the group's highest cap so the rows
       line up; 11 and 12 dots shrink slightly to fit the space ten normal dots
       take. */
    const cls = 'stat-dots'
        + (totalDots === 11 ? ' dots-11' : '')
        + (totalDots >= 12 ? ' dots-12' : '');

    return (
        <div className="stat-row">
            <span className="stat-label">{STAT_LABELS[statKey]}</span>
            <div className={cls} id={'stat-' + statKey}>
                {Array.from({ length: totalDots }, (_, i) => i + 1).map((i) => {
                    if (i <= base) return <div className="dot filled" key={i} />;
                    if (i <= base + trained) {
                        return (
                            <div
                                className="dot trained"
                                key={i}
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleTrain(i - base)}
                            />
                        );
                    }
                    if (i <= maxVal) {
                        return <div className="dot empty" key={i} onClick={() => toggleTrain(i - base)} />;
                    }
                    return <div className="dot locked" key={i} />;
                })}
            </div>
        </div>
    );
}

function EditRow({ statKey, max, draft, setDraft }: {
    statKey: string;
    max: number;
    draft: Record<string, { base: string; cap: string }>;
    setDraft: (next: Record<string, { base: string; cap: string }>) => void;
}) {
    const row = draft[statKey] || { base: '', cap: '' };
    const set = (field: 'base' | 'cap', value: string) =>
        setDraft({ ...draft, [statKey]: { ...row, [field]: value } });

    return (
        <div className="edit-row">
            <span className="edit-label">{STAT_LABELS[statKey]}</span>
            <div className="edit-inputs">
                <div className="edit-input-wrapper">
                    <span className="edit-input-label">Base</span>
                    <input
                        type="number" className="edit-input" min="1" max={max}
                        id={'edit-base-' + statKey}
                        value={row.base}
                        onChange={(e) => set('base', e.currentTarget.value)}
                    />
                </div>
                <div className="edit-input-wrapper">
                    <span className="edit-input-label">Cap</span>
                    <input
                        type="number" className="edit-input" min="1" max={max}
                        id={'edit-max-' + statKey}
                        value={row.cap}
                        onChange={(e) => set('cap', e.currentTarget.value)}
                    />
                </div>
            </div>
        </div>
    );
}

export function StatsPanel() {
    const { pokemon, src, store } = useCard();
    const [statView, setStatView] = useState<'combat' | 'social'>('combat');
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Record<string, { base: string; cap: string }>>({});

    const social = statView === 'social';

    /* Rows share the length of the group's highest cap. */
    const combatDots = Math.max(5, ...COMBAT_STAT_KEYS.map((k) => getStatMax(src, k)));
    const socialDots = Math.max(5, ...SOCIAL_STAT_KEYS.map((k) => getStatMax(src, k)));

    const openEditor = () => {
        setDraft(Object.fromEntries(ALL_KEYS.map((k) => [k, {
            base: String(getStatBase(src, k)),
            cap: String(getStatMax(src, k)),
        }])));
        setEditing(true);
    };

    const save = () => {
        store.update((s) => {
            withPoolsFollowingStats(pokemon, s, () => {
                const bases: Record<string, number> = {};
                const caps: Record<string, number> = {};
                ALL_KEYS.forEach((k) => {
                    bases[k] = parseInt(draft[k]?.base ?? '', 10) || 1;
                    caps[k] = parseInt(draft[k]?.cap ?? '', 10) || 1;
                });
                // Ensure base does not exceed max cap
                ALL_KEYS.forEach((k) => { if (bases[k] > caps[k]) caps[k] = bases[k]; });
                s.customBaseStats = bases;
                s.customMaxStats = caps;
            });
        });
        setEditing(false);
    };

    const reset = () => {
        store.update((s) => {
            withPoolsFollowingStats(pokemon, s, () => {
                s.customBaseStats = {};
                s.customMaxStats = {};
                s.trainedStats = {};   // reset training too
            });
        });
        setEditing(false);
    };

    return (
        <div className="stats-panel">
            <h2
                className="stats-title"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
            >
                <span><i className="fa-solid fa-chart-simple"></i> Base Stats &amp; Social</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* Same masks icon in both views; it glows while the social view is active */}
                    <button
                        id="stat-view-btn"
                        className={'edit-stats-btn' + (social ? ' active' : '')}
                        onClick={() => setStatView(social ? 'combat' : 'social')}
                        title={social ? 'Switch to combat stats' : 'Switch to social attributes'}
                    >
                        <i className="fa-solid fa-masks-theater"></i>
                    </button>
                    <button
                        className="edit-stats-btn"
                        onClick={() => editing ? setEditing(false) : openEditor()}
                        title="Edit Base Stats and Caps"
                    >
                        <i className="fa-solid fa-pen-to-square"></i>
                    </button>
                </span>
            </h2>

            <div id="stats-edit-form" className="stats-edit-form" style={{ display: editing ? 'flex' : 'none' }}>
                <div className="edit-rows-group" id="combat-edit-rows" style={{ display: social ? 'none' : 'flex' }}>
                    {COMBAT_STAT_KEYS.map((k) => (
                        <EditRow key={k} statKey={k} max={12} draft={draft} setDraft={setDraft} />
                    ))}
                </div>
                {/* Social attribute edit rows: shown while the social view is active */}
                <div className="edit-rows-group" id="social-edit-rows" style={{ display: social ? 'flex' : 'none' }}>
                    {SOCIAL_STAT_KEYS.map((k) => (
                        <EditRow key={k} statKey={k} max={5} draft={draft} setDraft={setDraft} />
                    ))}
                </div>
                <div className="form-actions">
                    <button className="form-btn reset" onClick={reset}>Reset Defaults</button>
                    <button className="form-btn cancel" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="form-btn save" onClick={save}>Save</button>
                </div>
            </div>

            <div id="stats-display-rows" style={{ display: editing ? 'none' : 'block' }}>
                <div id="combat-stats-rows" style={{ display: social ? 'none' : 'block' }}>
                    {COMBAT_STAT_KEYS.map((k) => <StatRow key={k} statKey={k} totalDots={combatDots} />)}
                </div>
                {/* Social attributes: alternate view toggled by the switch button */}
                <div id="social-stats-rows" style={{ display: social ? 'block' : 'none' }}>
                    {SOCIAL_STAT_KEYS.map((k) => <StatRow key={k} statKey={k} totalDots={socialDots} />)}
                </div>
            </div>
        </div>
    );
}
