import { useSheetStore } from '../../state/SheetContext';
import { isLightTheme, typeInk } from '../../lib/theme';
import { TYPE_ICONS, typeColors } from '../../lib/themeTables';

/* Gym badge case: eight slots. Earning one opens a type picker, and the badge
   takes that type's colour and icon. */

export function BadgeStrip({ onPick }: { onPick: (index: number) => void }) {
    const { sheet } = useSheetStore();
    const light = isLightTheme(sheet.themeType);

    return (
        <div className="badge-strip" id="badge-strip">
            {sheet.badges.map((badge, i) => {
                const earned = !!badge.earned;
                const type = badge.type || '';
                const icon = (earned && TYPE_ICONS[type]) ? TYPE_ICONS[type] : 'fa-medal';
                const c = typeColors[type] || '#9ca3af';
                const ink = typeInk(sheet.themeType, c);
                return (
                    <div
                        key={i}
                        className={'badge-sq' + (earned ? ' earned' : '')}
                        title={earned
                            ? (type || 'Badge') + ' badge — click to change its type or remove it'
                            : 'Click to earn badge ' + (i + 1) + ' and pick its type'}
                        style={earned ? {
                            background: c + '33',
                            borderColor: ink,
                            color: ink,
                            /* The coloured halo only reads on a dark page */
                            boxShadow: light ? 'none' : '0 0 12px ' + c + '66',
                        } : undefined}
                        onClick={() => onPick(i)}
                    >
                        <i className={'fa-solid ' + icon}></i>
                    </div>
                );
            })}
        </div>
    );
}
