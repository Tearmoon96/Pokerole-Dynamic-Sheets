import { useSheetStore } from '../../state/SheetContext';
import { PoolTrack } from './PoolTrack';

/** HP, Will and EXP across the top of the third quadrant. */
export function PoolsRow() {
    const { sheet, store } = useSheetStore();
    return (
        <div className="hwe-row">
            <div className="hwe-box">
                <div className="hwe-label">HP</div>
                <div className="hwe-body"><PoolTrack poolKey="hp" colorClass="health" /></div>
            </div>
            <div className="hwe-box">
                <div className="hwe-label">Will</div>
                <div className="hwe-body"><PoolTrack poolKey="will" colorClass="willpower" /></div>
            </div>
            <div className="hwe-box">
                <div className="hwe-label">EXP</div>
                <div className="hwe-body">
                    <input
                        type="text"
                        inputMode="numeric"
                        id="exp-input"
                        className="hwe-exp-input"
                        value={sheet.exp}
                        onChange={(e) => {
                            const parsed = parseInt(e.currentTarget.value, 10);
                            const exp = (isNaN(parsed) || parsed < 0) ? 0 : parsed;
                            store.update((s) => { s.exp = exp; });
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

const COIN_KINDS = [
    { key: 'c', mark: 'C', name: 'Copper' },
    { key: 's', mark: 'S', name: 'Silver' },
    { key: 'g', mark: 'G', name: 'Gold' },
] as const;

function parseCount(text: string): number {
    const parsed = parseInt(String(text).replace(/[^0-9-]/g, ''), 10);
    return (isNaN(parsed) || parsed < 0) ? 0 : parsed;
}

/** Pokédollars or copper, silver and gold: both symbols always sit at the
    pill's end, the one in use lit, and a click on the other switches. Each
    purse keeps its own numbers, so flipping back and forth never converts or
    loses anything. */
function CurrencySwitch() {
    const { sheet, store } = useSheetStore();
    const medieval = sheet.currency === 'medieval';
    const pick = (currency: 'modern' | 'medieval') => store.update((s) => { s.currency = currency; });
    return (
        <span className="currency-switch" role="group" aria-label="Currency">
            <button
                type="button"
                className="currency-opt currency-modern"
                aria-pressed={!medieval}
                title="Modern money (₽)"
                onClick={() => pick('modern')}
            >
                ₽
            </button>
            <button
                type="button"
                className="currency-opt"
                aria-pressed={medieval}
                title="Copper, silver and gold coins"
                onClick={() => pick('medieval')}
            >
                <i className="fa-solid fa-coins"></i>
            </button>
        </span>
    );
}

export function AgeMoneyRow() {
    const { sheet, store } = useSheetStore();
    return (
        <div className="age-money-row">
            <div className="pill-field">
                <label htmlFor="age-input">Age:</label>
                <input
                    type="text"
                    id="age-input"
                    value={sheet.age}
                    onChange={(e) => {
                        const age = e.currentTarget.value;
                        store.update((s) => { s.age = age; });
                    }}
                />
            </div>
            {sheet.currency === 'medieval' ? (
                <div className="pill-field money-field coins">
                    {COIN_KINDS.map((k) => (
                        <label key={k.key} className={'coin coin-' + k.key} title={k.name}>
                            <span className="coin-mark">{k.mark}</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                id={'coin-' + k.key + '-input'}
                                aria-label={k.name}
                                value={sheet.coins[k.key]}
                                onChange={(e) => {
                                    const n = parseCount(e.currentTarget.value);
                                    store.update((s) => { s.coins = { ...s.coins, [k.key]: n }; });
                                }}
                            />
                        </label>
                    ))}
                    <CurrencySwitch />
                </div>
            ) : (
                <div className="pill-field money-field">
                    <label htmlFor="money-input">Money:</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        id="money-input"
                        value={sheet.money}
                        onChange={(e) => {
                            const money = parseCount(e.currentTarget.value);
                            store.update((s) => { s.money = money; });
                        }}
                    />
                    <CurrencySwitch />
                </div>
            )}
        </div>
    );
}
