import { STATUS_ICONS, activeAilment } from '../../gm/ailments';
import type { GmStatus } from '../../gm/ailments';
import { inkOn } from '../../lib/color';

/* The eight condition chips, shared by the roster rows and the combat rows.
   Combat splits them the way the card's tracker does: the five exclusive
   ailments on one row, the three stackable ones on the next. */

function Chip({ status, icon, onCycle }: {
    status: GmStatus;
    icon: typeof STATUS_ICONS[number];
    onCycle: (key: string, e: React.MouseEvent) => void;
}) {
    const ail = activeAilment(status, icon);
    const locked = icon.exclusive && !!status.major && status.major !== icon.key;
    const stage = icon.stageField ? (status[icon.stageField] || 0) : 0;
    return (
        <span
            className={'status-chip ' + (ail ? 'active' : '') + ' ' + (locked ? 'locked' : '')}
            style={ail ? {
                background: ail.color,
                color: inkOn(ail.color),
                boxShadow: `0 0 5px ${ail.color}66`,
            } : undefined}
            title={ail ? ail.name : icon.name}
            onClick={(e) => onCycle(icon.key, e)}
        >
            <i className={'fa-solid ' + icon.icon}></i>
            {ail && stage > 1 && <span className="stage">{stage}</span>}
        </span>
    );
}

export function StatusChips({ status, twoRows, onCycle }: {
    status: GmStatus;
    twoRows?: boolean;
    onCycle: (key: string, e: React.MouseEvent) => void;
}) {
    if (!twoRows) {
        return (
            <div className="status-chips">
                {STATUS_ICONS.map((i) => <Chip key={i.key} status={status} icon={i} onCycle={onCycle} />)}
            </div>
        );
    }
    return (
        <div className="status-chips rows">
            {[true, false].map((keep) => (
                <div className="chip-row" key={String(keep)}>
                    {STATUS_ICONS.filter((i) => i.exclusive === keep).map((i) => (
                        <Chip key={i.key} status={status} icon={i} onCycle={onCycle} />
                    ))}
                </div>
            ))}
        </div>
    );
}
