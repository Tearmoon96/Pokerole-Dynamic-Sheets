import { useCard } from '../../card/CardContext';
import { AILMENTS, STATUS_ICONS, ailmentByKey } from '../../card/ailments';
import { inkOn } from '../../lib/color';
import type { StatusState } from '../../card/types';

/** The eight condition icons under the pools. */
export function StatusTracker() {
    const { sheet, store } = useCard();
    const st = sheet.status;

    const toggle = (key: string) => store.update((s) => {
        const status: StatusState = { ...s.status };
        const def = STATUS_ICONS.find((a) => a.key === key)!;
        if (def.exclusive) {
            if (status.major && status.major !== key) return;
            if (def.stageField) {
                /* Cycles through its stages and then off: burn 1st -> 2nd -> 3rd
                   -> none, poison -> badly poisoned -> none */
                status[def.stageField] = (status[def.stageField] + 1) % (def.stages.length + 1);
                status.major = status[def.stageField] > 0 ? (key as StatusState['major']) : null;
            } else {
                status.major = status.major === key ? null : (key as StatusState['major']);
            }
        } else {
            (status as unknown as Record<string, boolean>)[key] =
                !(status as unknown as Record<string, boolean>)[key];
        }
        s.status = status;
    });

    const rows: [typeof STATUS_ICONS, typeof STATUS_ICONS] = [
        STATUS_ICONS.filter((s) => s.exclusive),
        STATUS_ICONS.filter((s) => !s.exclusive),
    ];

    return (
        <div className="status-track" id="status-tracker">
            {rows.map((row, ri) => (
                <div className="status-track-row" key={ri}>
                    {row.map((s) => {
                        const active = s.exclusive
                            ? st.major === s.key
                            : !!(st as unknown as Record<string, boolean>)[s.key];
                        const locked = s.exclusive && !!st.major && st.major !== s.key;
                        /* Which stage is showing, 1-based; the single-stage
                           statuses are simply on their only one */
                        const stage = s.stageField ? st[s.stageField] : (active ? 1 : 0);
                        const ailment = ailmentByKey(s.stages[Math.max(0, stage - 1)]) || AILMENTS[0];
                        return (
                            <div
                                key={s.key}
                                className={'status-icon' + (active ? ' active' : '') + (locked ? ' locked' : '')}
                                title={active ? ailment.name : s.name}
                                /* Filled chip in the ailment's own colour, the same
                                   fill its tile header uses, with the glyph inked
                                   to read on it */
                                style={active ? {
                                    background: ailment.color,
                                    boxShadow: `0 0 6px ${ailment.color}66`,
                                } : undefined}
                                onClick={() => toggle(s.key)}
                            >
                                <i
                                    className={'fa-solid ' + s.icon}
                                    style={active ? { color: inkOn(ailment.color) } : undefined}
                                />
                                {active && s.numbered && (
                                    <span className="status-burn-degree" style={{ color: ailment.color }}>
                                        {stage}
                                    </span>
                                )}
                                {active && ailment.modifier === 'Aggravating' && (
                                    <span
                                        className="status-aggravating-pip"
                                        style={{ background: inkOn(ailment.color) }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
