import { useCard } from '../../card/CardContext';
import { currentThemeTypes, isLightTheme, typeInk } from '../../card/theme';
import { mixHex } from '../../lib/color';
import { TYPE_ICONS, typeColors } from '../../lib/themeTables';

/* The typing chips, and the light/dark controls across the divider from them.

   Together they form one set with exactly one member lit: whichever theme is
   actually driving the page. */

function TypeBadge({ type }: { type: string }) {
    const { pokemon, sheet, store } = useCard();
    const c = typeColors[type] || '#e5e7eb';
    const icon = TYPE_ICONS[type] || 'fa-circle-question';
    const dual = !!pokemon.Type2;
    /* No badge is the active one while a License theme is on: the page is not
       being themed from the typing at all. */
    const active = !sheet.pageTheme && currentThemeTypes(pokemon, sheet).primary === type;
    /* A License theme makes even a single-type badge a switch — it is the click
       that hands the page back to the typing. */
    const switchable = dual || !!sheet.pageTheme;

    return (
        <span
            className={'type-badge' + (switchable ? ' type-switch' : '') + (active ? ' theme-active' : '')}
            /* The chip is icon-only, so the name has to be in the tooltip: a
               switchable one already says it, a fixed one gets it alone. */
            title={switchable ? 'Use ' + type + ' as the page theme' : type}
            onClick={switchable ? () => store.update((s) => { s.themeType = type; s.pageTheme = ''; }) : undefined}
            style={{
                background: c + '33',
                border: '1px solid ' + typeInk(sheet, c),
                color: typeInk(sheet, c, mixHex(c, '#ffffff', 0.55)),
                boxShadow: isLightTheme(sheet) ? 'none' : `0 0 10px ${c}26`,
            }}
        >
            <i className={'fa-solid ' + icon}></i>
        </span>
    );
}

/* A single-type Pokémon gets one toggle — the glyph says which page you are on,
   a sun under the Light License and a moon everywhere else. A dual-type one gets
   the two as separate buttons. On a type theme neither is lit. */
export function ThemeSwitches() {
    const { pokemon, sheet, store } = useCard();
    const setPageTheme = (theme: string) => store.update((s) => { s.pageTheme = theme; });

    const Btn = ({ theme, icon, label, extra }: {
        theme: string; icon: string; label: string; extra: string;
    }) => (
        <button
            className={'theme-switch-btn' + extra}
            onClick={() => setPageTheme(theme)}
            title={label}
        >
            <i className={'fa-solid ' + icon}></i>
        </button>
    );

    if (!pokemon.Type2) {
        const light = isLightTheme(sheet);
        /* Lit only while a License theme is the one driving the page. On the
           type theme the glyph still says which page you are looking at, but the
           chip across the divider is what is on, so this dims with the set. */
        const extra = sheet.pageTheme ? ' pick theme-active' : ' pick';
        return (
            <Btn
                theme={light ? 'License' : 'LicenseLight'}
                icon={light ? 'fa-sun' : 'fa-moon'}
                label={light ? 'Switch to the dark theme' : 'Switch to the light theme'}
                extra={extra}
            />
        );
    }
    const on = (t: string) => sheet.pageTheme === t ? ' pick theme-active' : ' pick';
    return (
        <>
            <Btn theme="LicenseLight" icon="fa-sun" label="Light theme" extra={on('LicenseLight')} />
            <Btn theme="License" icon="fa-moon" label="Dark theme" extra={on('License')} />
        </>
    );
}

export function TypesRow() {
    const { pokemon } = useCard();
    return (
        <div className="types-row">
            <span className="theme-switch-group" id="theme-switches"><ThemeSwitches /></span>
            <span className="types-divider" aria-hidden="true"></span>
            <span className="type-badge-group" id="type-badges">
                {[pokemon.Type1, pokemon.Type2].filter(Boolean).map((t) => (
                    <TypeBadge key={t} type={t} />
                ))}
            </span>
        </div>
    );
}
