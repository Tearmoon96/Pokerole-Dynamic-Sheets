import { PoolBar } from '../common/PoolBar';
import { useSheetStore } from '../../state/SheetContext';
import { derivedPoolMax, poolMax } from '../../state/defaults';

type PoolKey = 'hp' | 'will';

/** HP and Will on the trainer sheet, drawn as the same bar the card uses. */
export function PoolTrack({ poolKey, colorClass }: { poolKey: PoolKey; colorClass: string }) {
    const { sheet, store } = useSheetStore();
    const max = poolMax(poolKey, sheet);

    return (
        <div className="pool-track">
            <PoolBar
                current={Math.min(sheet[poolKey], max)}
                max={max}
                colorClass={colorClass}
                readCurrent={() => store.sheet[poolKey]}
                onSetCurrent={(value) => store.update((s) => {
                    s[poolKey] = Math.max(0, Math.min(poolMax(poolKey, s), value));
                })}
                onSetMax={(value) => store.update((s) => {
                    const bonus = Math.max(1, value) - derivedPoolMax(poolKey, s);
                    if (poolKey === 'hp') s.hpMaxBonus = bonus; else s.willMaxBonus = bonus;
                    /* The current value can't outlive a pool that just shrank. */
                    s[poolKey] = Math.min(s[poolKey], poolMax(poolKey, s));
                })}
            />
        </div>
    );
}
