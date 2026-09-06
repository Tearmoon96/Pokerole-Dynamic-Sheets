import { useCard } from '../../card/CardContext';
import { typeInk } from '../../card/theme';
import { mixHex } from '../../lib/color';
import { typeColors } from '../../lib/themeTables';
import { ATTR_ICONS, totalTitle } from '../../card/moves';
import { TotalFlags } from './TotalFlags';
import type { CardMove, MoveTotals } from '../../card/moves';

/* One move card: collapsed it is a header, expanded it opens its pools, its
   effect text and everything the dataset adds on top. */

interface AddedEffects {
    StatChanges?: { Stages: number; Stats: string[]; ChanceDice?: number; Affects?: string }[];
    Ailments?: { Type: string; Affects?: string; ChanceDice?: number }[];
    Heal?: { Type: string; Percentage?: number; Target?: string };
    FixedDamage?: { Value: number | string; Type: string; Target: string };
    TerrainEffect?: string;
    IgnoreShield?: boolean;
}

function EffectRows({ move }: { move: CardMove }) {
    const ae = (move.AddedEffects || {}) as AddedEffects;
    const rows: React.ReactNode[] = [];

    // An ailment override replaces the JSON ailment lines entirely
    if (move.AilmentOverride !== undefined && move.AilmentOverride) {
        rows.push(
            <div className="effect-detail ailment" key="override">
                <i className="fa-solid fa-skull-crossbones" style={{ color: '#ec4899' }}></i>
                <span><strong>Ailment:</strong> {move.AilmentOverride}</span>
            </div>,
        );
    }

    if (move.AddedEffects) {
        (ae.StatChanges || []).forEach((change, i) => {
            const sign = change.Stages > 0 ? '+' : '';
            const stats = change.Stats.join(', ');
            const chance = change.ChanceDice ? ` (${change.ChanceDice} Chance Die/Dice)` : '';
            const target = change.Affects ? ` on ${change.Affects}` : '';
            rows.push(
                <div className="effect-detail stat-change" key={'sc' + i}>
                    <i className="fa-solid fa-angles-up"
                        style={{ color: change.Stages > 0 ? '#10b981' : '#f43f5e' }}></i>
                    <span><strong>Stat Change:</strong> {sign}{change.Stages} {stats}{target}{chance}</span>
                </div>,
            );
        });

        // Ailments (skipped when an override is set for this move)
        if (move.AilmentOverride === undefined) {
            (ae.Ailments || []).forEach((ailment, i) => {
                const chance = ailment.ChanceDice ? ` (${ailment.ChanceDice} Chance Die/Dice)` : '';
                const target = ailment.Affects ? ` on ${ailment.Affects}` : '';
                rows.push(
                    <div className="effect-detail ailment" key={'ail' + i}>
                        <i className="fa-solid fa-skull-crossbones" style={{ color: '#ec4899' }}></i>
                        <span><strong>Ailment:</strong> {ailment.Type}{target}{chance}</span>
                    </div>,
                );
            });
        }

        if (ae.Heal) {
            const percentage = ae.Heal.Percentage ? ` (${ae.Heal.Percentage * 100}% HP)` : '';
            rows.push(
                <div className="effect-detail heal" key="heal">
                    <i className="fa-solid fa-heart" style={{ color: '#10b981' }}></i>
                    <span><strong>Heal:</strong> {ae.Heal.Type} heal{percentage} on {ae.Heal.Target || 'User'}</span>
                </div>,
            );
        }

        if (ae.FixedDamage) {
            rows.push(
                <div className="effect-detail fixed-damage" key="fd">
                    <i className="fa-solid fa-burst" style={{ color: '#f97316' }}></i>
                    <span><strong>Fixed Damage:</strong> {ae.FixedDamage.Value} {ae.FixedDamage.Type} on {ae.FixedDamage.Target}</span>
                </div>,
            );
        }

        if (ae.TerrainEffect) {
            rows.push(
                <div className="effect-detail terrain" key="terrain">
                    <i className="fa-solid fa-mountain" style={{ color: '#eab308' }}></i>
                    <span><strong>Terrain:</strong> Creates {ae.TerrainEffect}</span>
                </div>,
            );
        }

        if (ae.IgnoreShield === true) {
            rows.push(
                <div className="effect-detail shield" key="shield">
                    <i className="fa-solid fa-shield-slash" style={{ color: '#38bdf8' }}></i>
                    <span><strong>Shield:</strong> Ignores Protection Shields</span>
                </div>,
            );
        }
    }

    if (!rows.length) return null;
    return <div className="move-effects-list">{rows}</div>;
}

function AttrTags({ move }: { move: CardMove }) {
    if (!move.Attributes) return null;
    const tags = Object.entries(move.Attributes).flatMap(([key, val]) => {
        /* Skipped: the Total Accuracy line states this properly now. Left in, it
           would print the raw JSON value, so the three records with the wrong
           sign would show "Accuracy Reduction: 2" directly under a
           "Low Accuracy 2" chip and contradict it. */
        if (key === 'AccuracyReduction' || !val) return [];
        const icon = ATTR_ICONS[key] || 'fa-tag';
        const formatted = key.replace(/([A-Z])/g, ' $1').trim();
        return [(
            <span className="move-attr-tag" key={key}>
                <i className={'fa-solid ' + icon}></i> {formatted}{val === true ? '' : ': ' + val}
            </span>
        )];
    });
    if (!tags.length) return null;
    return <div className="move-attr-tags">{tags}</div>;
}

export function MoveCard({ move, totals, expanded, onToggle, onEdit, onDelete, dragProps }: {
    move: CardMove;
    totals: MoveTotals;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
    dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}) {
    const { sheet, store } = useCard();

    const isPinned = (sheet.pinnedMoves || []).includes(move.Name);
    const isDisabled = sheet.disabledMove === move.Name;
    const tc = typeColors[move.Type] || '#e5e7eb';

    const accNames = [move.Accuracy1, move.Accuracy2, move.Accuracy3].filter(Boolean);
    const accuracyStr = accNames.length > 0 ? accNames.join(' + ') : 'None';
    let damageStr = 'None';
    if (move.Damage1) {
        damageStr = move.Damage1;
        if (move.Damage2) damageStr += ` + ${move.Damage2}`;
    }

    return (
        <div
            className={`move-card ${move.Category}${isPinned ? ' pinned' : ''}`
                + (isDisabled ? ' disabled' : '') + (expanded ? ' expanded' : '')}
            data-move-name={move.Name}
            style={{ ['--type-color' as string]: typeInk(sheet, tc) }}
            onClick={onToggle}
            {...dragProps}
        >
            <div className="move-card-header">
                <div className="move-meta">
                    <div className="move-name-row">
                        <span className="move-name">{move.Name}</span>
                    </div>
                    <div className="move-badges">
                        <span className={'badge category-' + move.Category}>{move.Category}</span>
                        <span
                            className="badge type"
                            style={{
                                background: tc + '26',
                                borderColor: typeInk(sheet, tc) + '4c',
                                color: typeInk(sheet, tc, mixHex(tc, '#ffffff', 0.6)),
                            }}
                        >
                            {move.Type}
                        </span>
                    </div>
                </div>
                <div className="move-header-right">
                    <button
                        className="move-disable-btn"
                        title={isDisabled ? 'Re-enable this move' : 'Disable this move'}
                        onClick={(e) => {
                            e.stopPropagation();
                            /* Only one Move can be disabled at a time, so
                               disabling another just moves the mark off the first. */
                            store.update((s) => {
                                s.disabledMove = s.disabledMove === move.Name ? null : move.Name;
                            });
                        }}
                    >
                        <i className="fa-solid fa-ban"></i>
                    </button>
                    <button
                        className="move-pin-btn"
                        title={isPinned ? 'Unpin from top' : 'Pin to top'}
                        onClick={(e) => {
                            e.stopPropagation();
                            store.update((s) => {
                                const pinned = s.pinnedMoves || [];
                                s.pinnedMoves = pinned.includes(move.Name)
                                    ? pinned.filter((n) => n !== move.Name)
                                    : [...pinned, move.Name];
                            });
                        }}
                    >
                        <i className="fa-solid fa-thumbtack"></i>
                    </button>
                    <button
                        className="move-edit-btn"
                        title="Edit move values"
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    >
                        <i className="fa-solid fa-pen-to-square"></i>
                    </button>
                    {move.Learned === 'Custom' && (
                        <button
                            className="move-trash-btn"
                            title="Delete custom move"
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        >
                            <i className="fa-solid fa-trash-can"></i>
                        </button>
                    )}
                    <span className="move-rank-badge">{move.Learned}</span>
                    <i className="fa-solid fa-chevron-down move-chevron"></i>
                </div>
            </div>

            <div className="move-card-content">
                <div className="move-stats-grid">
                    <div className="move-stat-box">
                        <span className="m-lbl">Accuracy</span>
                        <span className="m-val">{accuracyStr}</span>
                    </div>
                    <div className="move-stat-box">
                        <span className="m-lbl">Power</span>
                        <span className="m-val">{move.Power || 0}</span>
                    </div>
                    <div className="move-stat-box">
                        <span className="m-lbl">Damage Pool</span>
                        <span className="m-val">{damageStr}</span>
                    </div>
                    <div className="move-stat-box">
                        <span className="m-lbl">Target</span>
                        <span className="m-val">{move.Target || 'User'}</span>
                    </div>
                </div>

                {(totals.acc !== null || totals.pow !== null) && (
                    <div className="move-totals">
                        {totals.acc !== null && (
                            <div className="move-total accuracy" title={totalTitle(totals, 'acc')}>
                                <i className="fa-solid fa-crosshairs"></i> Total Accuracy:{' '}
                                <strong>{totals.acc}</strong>
                                <TotalFlags totals={totals} kind="acc" />
                            </div>
                        )}
                        {totals.pow !== null && (
                            <div className="move-total power" title={totalTitle(totals, 'pow')}>
                                <i className="fa-solid fa-burst"></i> Total Power:{' '}
                                <strong>{totals.pow}</strong>
                                <TotalFlags totals={totals} kind="pow" />
                            </div>
                        )}
                    </div>
                )}

                <div className="move-desc-block">
                    <p className="move-effect"><strong>Effect:</strong> {move.Effect}</p>
                    <p className="move-desc">"{move.Description as string}"</p>
                </div>

                <EffectRows move={move} />
                <AttrTags move={move} />
            </div>
        </div>
    );
}
