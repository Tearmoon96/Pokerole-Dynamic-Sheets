import { isLightTheme, typeInk } from '../../lib/theme';
import { mixHex } from '../../lib/color';

/* One type/theme chip. The theme picker's two rows and the badge picker all
   build their grids from this, so they cannot drift apart. */

export function ThemeChip({ swatch, icon, label, iconOnly, themeType, selected, onClick }: {
    swatch: string;
    icon: string;
    label: string;
    /** Icon-only circles, no label — how both type grids are drawn. */
    iconOnly?: boolean;
    /** The page's current theme, which decides how the ink is corrected. */
    themeType: string;
    selected?: boolean;
    onClick?: () => void;
}) {
    const light = isLightTheme(themeType);
    return (
        <span
            className={'type-badge theme-chip' + (iconOnly ? ' icon-only' : '')}
            title={label}
            style={{
                background: swatch + '33',
                border: '1px solid ' + typeInk(themeType, swatch),
                color: typeInk(themeType, swatch, mixHex(swatch, '#ffffff', 0.55)),
                /* The coloured halo only reads on a dark page */
                boxShadow: light ? 'none' : `0 0 10px ${swatch}26`,
                cursor: 'pointer',
                /* The white marker inverts on a light modal, or the chosen chip
                   loses it against the page. */
                ...(selected ? { outline: '2px solid ' + (light ? '#2a2020' : '#fff'), outlineOffset: '1px' } : null),
            }}
            onClick={onClick}
        >
            <i className={'fa-solid ' + icon}></i>
            {!iconOnly && <> {label}</>}
        </span>
    );
}
