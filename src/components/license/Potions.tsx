import { useSheetStore } from '../../state/SheetContext';
import type { PotionKind } from '../../state/types';

const POTION_TYPES: { key: PotionKind; label: string; color: string; charges: number }[] = [
    { key: 'potion', label: 'Potion', color: '#a855f7', charges: 2 },        // purple
    { key: 'superPotion', label: 'S. Potion', color: '#f97316', charges: 4 }, // orange
    { key: 'hyperPotion', label: 'H. Potion', color: '#f472b6', charges: 14 }, // pink
];

/** Normalise to a boolean-per-charge array of the right length. */
function chargesOf(stored: boolean[] | undefined, length: number): boolean[] {
    if (Array.isArray(stored) && stored.length === length) return stored;
    return Array.from({ length }, (_, i) =>
        (Array.isArray(stored) && stored[i] !== undefined) ? !!stored[i] : true);
}

export function PotionTallies() {
    const { sheet, store } = useSheetStore();
    return (
        <div className="potion-tallies" id="potion-tallies">
            {POTION_TYPES.map((pt) => {
                const charges = chargesOf(sheet.potionCharges[pt.key], pt.charges);
                return (
                    <div className="tally-row" key={pt.key}>
                        <span className="tally-label">{pt.label}</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            className="tally-qty-input"
                            title={'How many ' + pt.label + ' are in the bag'}
                            defaultValue={sheet.potionQty[pt.key] || 0}
                            key={'qty-' + pt.key + '-' + (sheet.potionQty[pt.key] || 0)}
                            onChange={(e) => {
                                const n = parseInt(e.currentTarget.value, 10);
                                const clean = (isNaN(n) || n < 0) ? 0 : n;
                                e.currentTarget.value = String(clean);
                                store.update((s) => {
                                    s.potionQty = { ...s.potionQty, [pt.key]: clean };
                                });
                            }}
                        />
                        <div className="tally-squares">
                            {charges.map((on, i) => (
                                <button
                                    key={i}
                                    className={'tally-sq' + (on ? ' on' : '')}
                                    title={on
                                        ? 'Charge ' + (i + 1) + ' available – click to spend'
                                        : 'Charge ' + (i + 1) + ' spent – click to restore'}
                                    style={on ? {
                                        background: pt.color,
                                        borderColor: pt.color,
                                        boxShadow: `0 0 6px ${pt.color}66`,
                                    } : undefined}
                                    onClick={() => store.update((s) => {
                                        const next = chargesOf(s.potionCharges[pt.key], pt.charges).slice();
                                        next[i] = !next[i];
                                        s.potionCharges = { ...s.potionCharges, [pt.key]: next };
                                    })}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
