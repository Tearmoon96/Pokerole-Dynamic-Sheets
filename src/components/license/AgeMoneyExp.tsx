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
                        defaultValue={sheet.exp}
                        key={'exp-' + sheet.id + '-' + sheet.exp}
                        onChange={(e) => {
                            const parsed = parseInt(e.currentTarget.value, 10);
                            const exp = (isNaN(parsed) || parsed < 0) ? 0 : parsed;
                            e.currentTarget.value = String(exp);
                            store.update((s) => { s.exp = exp; });
                        }}
                    />
                </div>
            </div>
        </div>
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
                    defaultValue={sheet.age}
                    key={'age-' + sheet.id + '-' + sheet.age}
                    onChange={(e) => {
                        const age = e.currentTarget.value;
                        store.update((s) => { s.age = age; });
                    }}
                />
            </div>
            <div className="pill-field">
                <label htmlFor="money-input">Money:</label>
                <input
                    type="text"
                    inputMode="numeric"
                    id="money-input"
                    defaultValue={sheet.money}
                    key={'money-' + sheet.id + '-' + sheet.money}
                    onChange={(e) => {
                        const parsed = parseInt(String(e.currentTarget.value).replace(/[^0-9-]/g, ''), 10);
                        const money = (isNaN(parsed) || parsed < 0) ? 0 : parsed;
                        e.currentTarget.value = String(money);
                        store.update((s) => { s.money = money; });
                    }}
                />
                <span className="money-suffix">₽</span>
            </div>
        </div>
    );
}
