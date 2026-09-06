import { StatusChips } from './StatusChips';
import { GmSprite } from './GmSprite';
import { monPoolMax } from '../../gm/pools';
import { normalizeStatus } from '../../gm/ailments';
import { monShownName } from '../../gm/entities';
import { TYPE_ICONS, typeColors } from '../../lib/themeTables';
import { mixHex } from '../../lib/color';
import type { PokedexEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';
import type { ReactNode } from 'react';

/* The pieces a roster row is built from: a pool bar with its ±1 buttons, the
   type chips, and the Pokémon row that carries all of it. */

export function PoolBar({ tag, cls, cur, max, onStep }: {
    tag: string;
    cls: 'hp' | 'will';
    cur: number;
    max: number;
    /** Absent for a row with nothing to write back to. */
    onStep?: (delta: number, e: React.MouseEvent) => void;
}) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
    const step = (delta: number, sign: string, klass: string) => onStep ? (
        <button
            className={'pool-step ' + klass}
            tabIndex={-1}
            title={sign + ' 1 ' + tag + ' (shift: 5)'}
            onClick={(e) => onStep(delta, e)}
        >
            {sign}
        </button>
    ) : null;

    return (
        <div className="pool-bar">
            <span className="pool-tag">{tag}</span>
            <span className="pool-track">
                <span className={'pool-fill ' + cls} style={{ width: pct + '%' }}></span>
            </span>
            <span className="pool-steps">
                {step(-1, '−', 'minus')}
                <span className="pool-num">{cur} / {max}</span>
                {step(1, '+', 'plus')}
            </span>
        </div>
    );
}

export function TypeChips({ p }: { p: PokedexEntry | null }) {
    if (!p) return null;
    return (
        <>
            {[p.Type1, p.Type2].filter(Boolean).map((t) => {
                const c = typeColors[t] || '#e5e7eb';
                return (
                    <span
                        className="type-chip"
                        key={t}
                        title={t}
                        style={{
                            background: c + '33',
                            borderColor: c,
                            color: mixHex(c, '#ffffff', 0.55),
                        }}
                    >
                        <i className={'fa-solid ' + (TYPE_ICONS[t] || 'fa-circle-question')}></i>
                    </span>
                );
            })}
        </>
    );
}

export function MonRow({ dex, dexId, sheet, token, buttons, onStep, onCycleStatus, onOpenTip }: {
    dex: PokedexEntry | null;
    dexId: string;
    sheet: Partial<CardSheet> | null;
    /** Absent on a row with nothing behind it to address. */
    token?: string;
    buttons: ReactNode;
    onStep?: (key: 'hp' | 'will', delta: number, e: React.MouseEvent) => void;
    onCycleStatus?: (key: string, e: React.MouseEvent) => void;
    onOpenTip?: () => void;
}) {
    const hpMax = monPoolMax(dex, sheet, 'hp');
    const willMax = monPoolMax(dex, sheet, 'will');
    const dexById = () => dex;

    return (
        <div className="mon-row" data-tip={token}>
            <GmSprite dex={dex} dexId={dexId} sheet={sheet} className="mon-sprite" />
            <div className="mon-main">
                <div className="mon-name">
                    <span className="name-text">{monShownName(dexById, dexId, sheet)}</span>
                    <TypeChips p={dex} />
                </div>
                <div className="pool-bars">
                    <PoolBar
                        tag="HP" cls="hp" cur={(sheet && sheet.hp) || 0} max={hpMax}
                        onStep={onStep && ((d, e) => onStep('hp', d, e))}
                    />
                    <PoolBar
                        tag="WILL" cls="will" cur={(sheet && sheet.will) || 0} max={willMax}
                        onStep={onStep && ((d, e) => onStep('will', d, e))}
                    />
                </div>
                {token && onCycleStatus && (
                    <StatusChips status={normalizeStatus(sheet && sheet.status)} onCycle={onCycleStatus} />
                )}
            </div>
            <div className="mon-actions">
                {token && onOpenTip && (
                    <button
                        className="icon-btn tip-btn"
                        data-tip-for={token}
                        title="Pinned moves, accuracy and damage"
                        onClick={onOpenTip}
                    >
                        <i className="fa-solid fa-list-ul"></i>
                    </button>
                )}
                {buttons}
            </div>
        </div>
    );
}
