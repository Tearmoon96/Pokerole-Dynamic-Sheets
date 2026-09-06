import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Modal, ModalClose } from '../common/Modal';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { ailInk, typeInk } from '../../card/theme';
import { inkOn, mixHex } from '../../lib/color';
import { TYPE_ICONS, typeColors } from '../../lib/themeTables';
import { TYPE_EFF_ROWS, computeTypeEffectiveness } from '../../card/typeChart';
import { AILMENTS } from '../../card/ailments';
import { ailmentText } from '../../card/ailmentText';
import {
    ENVIRONMENTS, ENV_INTRO, WEATHER_CONDITIONS, WEATHER_TABS,
} from '../../card/weather';
import type { WeatherEntry } from '../../card/weather';

/* The three read-only reference windows: the type chart, the ailment cards and
   the weather / environment cards. */

export function TypeEffectivenessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { pokemon, sheet } = useCard();
    const { data } = useAppData();
    const defTypes = [pokemon.Type1, pokemon.Type2].filter(Boolean);
    /* The ability in use grants the immunity, falling back to Ability1 — and
       both are resolved against the ability list first, so a name the database
       does not know cannot silently disable Ability1's immunity. */
    const findAbility = (name: string) =>
        name ? data.abilities.find((a) => a.Name.toLowerCase() === name.toLowerCase()) : undefined;
    const ability = findAbility(sheet.abilityInUse) || findAbility(pokemon.Ability1);
    const buckets = computeTypeEffectiveness(defTypes, ability?.Name || '');

    return (
        <Modal open={open} onClose={onClose} boxClassName="type-eff-box" id="type-eff-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-shield" style={{ color: 'var(--ghost-color)' }}></i> Type Effectiveness
            </div>
            <div className="type-eff-content" id="type-eff-content">
                {TYPE_EFF_ROWS.map((row) => (
                    <div className="type-eff-row" key={row.key}>
                        <span className="type-eff-label">{row.label}</span>
                        <div className="type-eff-chips">
                            {!buckets[row.key].length ? (
                                <span className="type-eff-none">&mdash;</span>
                            ) : buckets[row.key].map((type) => {
                                const color = typeColors[type] || '#e5e7eb';
                                return (
                                    <span
                                        className="type-eff-chip"
                                        key={type}
                                        /* The name, now that the chip is icon-only */
                                        title={type}
                                        style={{
                                            color: typeInk(sheet, color),
                                            borderColor: typeInk(sheet, color) + '66',
                                            background: color + '1f',
                                        }}
                                    >
                                        <i className={'fa-solid ' + (TYPE_ICONS[type] || 'fa-circle-question')}></i>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}

/** A tile of rulebook prose. The text is HTML from the data tables. */
function ReferenceTile({ color, headIcons, name, sub, mod, bands, sheet }: {
    color: string;
    headIcons: React.ReactNode;
    name: string;
    sub?: string;
    mod?: string;
    bands: { label: string; html: string }[];
    sheet: Parameters<typeof ailInk>[0];
}) {
    /* Weather banners use one ink for every tile; the ailments let inkOn pick
       per colour, since those run to #eedc00 and have to. */
    const ink = sub ? '#ffffff' : inkOn(color);
    return (
        <div
            className="ail-tile"
            style={{
                ['--ail' as string]: color,
                ['--ail-ink' as string]: ailInk(sheet, color),
                ['--ail-wash' as string]: mixHex(color, '#ffffff', 0.1) + '5c',
            }}
        >
            <div
                className="ail-tile-head"
                style={{ background: color, color: ink, borderBottom: '1px solid ' + ink + '1f' }}
            >
                <span className="ail-tile-icons">{headIcons}</span>
                {sub ? (
                    <span className="wx-head-text">
                        <span className="ail-tile-name">{name}</span>
                        <span className="wx-sub">{sub}</span>
                    </span>
                ) : (
                    <span className="ail-tile-name">{name}</span>
                )}
                {mod && <span className="ail-tile-mod" style={{ background: ink + '1f' }}>{mod}</span>}
            </div>
            {/* A Fragment, not a wrapper element: the tile is a subgrid and each
                band has to be a direct child of it, both to line up with the
                tiles beside it and for the row-equalising pass below to count
                the rows correctly. */}
            {bands.map((b, i) => (
                <Fragment key={i}>
                    <div className="ail-band">{b.label}</div>
                    <div className="ail-text" dangerouslySetInnerHTML={{ __html: b.html }} />
                </Fragment>
            ))}
        </div>
    );
}

export function AilmentsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { pokemon, sheet, src } = useCard();
    const types = [pokemon.Type1, pokemon.Type2].filter(Boolean);
    const text = ailmentText(src);

    return (
        <Modal open={open} onClose={onClose} boxClassName="ailments-box" id="ailments-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-kit-medical" style={{ color: '#f43f5e' }}></i> Ailments &amp; Conditions
            </div>
            <div className="ailments-content" id="ailments-content">
                {AILMENTS.map((a) => {
                    const t = text[a.key];
                    const isImmune = a.immune.some((type) => types.includes(type));
                    const immuneNote = a.immune.length > 0
                        ? `<div class="ailment-immune${isImmune ? ' active' : ''}">`
                          + '<i class="fa-solid fa-shield"></i> '
                          + a.immune.join(' and ') + '-type Pokémon are immune'
                          + (isImmune ? ' - this one is immune!' : '.') + '</div>'
                        : '';
                    return (
                        <ReferenceTile
                            key={a.key}
                            color={a.color}
                            sheet={sheet}
                            name={a.name}
                            mod={a.modifier}
                            headIcons={Array.from({ length: a.pips || 1 }, (_, i) => (
                                <i className={'fa-solid ' + a.icon} key={i}></i>
                            ))}
                            bands={[
                                { label: 'Effect', html: t.effect + immuneNote },
                                { label: 'Treatment', html: t.treatment },
                                { label: 'Duration', html: t.duration },
                            ]}
                        />
                    );
                })}
            </div>
        </Modal>
    );
}

export function WeatherModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet } = useCard();
    /* Which tab the window is on. Component state and not the sheet: that gets
       written into the trainer's .json, and where someone left a reference
       window is not something to carry around in a shared file. */
    const [tab, setTab] = useState('weather');
    const gridRef = useRef<HTMLDivElement>(null);

    const isEnv = tab === 'env';
    const entries: WeatherEntry[] = isEnv
        ? ENVIRONMENTS
        : WEATHER_CONDITIONS.filter((w) => !!w.extreme === (tab === 'extreme'));

    /* An environment tile has one band, a weather two — head included, three
       subgrid rows against five. See #weather-content.wx-rows-*. */
    const per = isEnv ? 3 : 5;

    /* Subgrid already levels the bands of the tiles sitting on one row. This
       levels one row against the next, so every tile in the window is the height
       of the tallest and an "Effects" bar lands at the same place wherever you
       look.

       The heights come off the tiles' own children rather than the grid's
       computed grid-template-rows: with subgrid a child is exactly as tall as
       its track, and browsers disagree on whether implicit tracks show up in
       that property at all. It is a layout read either way, so it runs after
       paint with the window on screen. */
    useLayoutEffect(() => {
        if (!open) return;
        const equalize = () => {
            const grid = gridRef.current;
            if (!grid) return;
            const tiles = Array.from(grid.querySelectorAll('.ail-tile'));
            // Back to content sizing, or the children measure as the last pass sized them
            grid.style.gridAutoRows = '';
            if (!tiles.length) return;
            const tallest = new Array(per).fill(0);
            for (const tile of tiles) {
                /* A tile that is not laid out, or does not carry the bands this
                   tab says it does: leave the row-by-row look rather than force
                   wrong heights onto every tile in the window. */
                if (tile.children.length !== per) return;
                Array.from(tile.children).forEach((row, i) => {
                    const h = row.getBoundingClientRect().height;
                    if (h > tallest[i]) tallest[i] = h;
                });
            }
            if (tallest.some((h) => !h)) return;
            grid.style.gridAutoRows = tallest.map((h) => `${h}px`).join(' ');
        };
        equalize();
        /* Track heights are measured, so a resize invalidates them — and the
           grid drops a column on the way, which changes what the tallest tile
           in a group is. */
        window.addEventListener('resize', equalize);
        return () => window.removeEventListener('resize', equalize);
    }, [open, tab, per]);

    return (
        <Modal open={open} onClose={onClose} boxClassName="ailments-box" id="weather-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-cloud-sun-rain" style={{ color: '#38bdf8' }}></i> Weather and Environments
            </div>
            <div className="wx-tabs" id="weather-tabs">
                {WEATHER_TABS.map((t) => (
                    <button
                        key={t.key}
                        className={'wx-tab' + (t.key === tab ? ' active' : '')}
                        onClick={() => setTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <p
                className="wx-note"
                id="weather-note"
                style={{ display: isEnv ? 'block' : 'none' }}
                dangerouslySetInnerHTML={{ __html: isEnv ? ENV_INTRO : '' }}
            />
            <div
                className={'ailments-content ' + (isEnv ? 'wx-rows-3' : 'wx-rows-5')}
                id="weather-content"
                ref={gridRef}
            >
                {entries.map((entry) => {
                    const bands: { label: string; html: string }[] = [];
                    if (entry.where) bands.push({ label: "Where It's Found", html: entry.where });
                    const mods = (entry.mods || []).length
                        ? `<p class="wx-mods">${entry.mods!.map((m) => `<strong>${m}</strong>`).join(' &middot; ')}</p>`
                        : '';
                    bands.push({
                        label: entry.effects.length > 1 ? 'Effects' : 'Effect',
                        html: (entry.effects.length > 1
                            ? `<ul class="wx-list">${entry.effects.map((e) => `<li>${e}</li>`).join('')}</ul>`
                            : entry.effects[0]) + mods,
                    });
                    return (
                        <ReferenceTile
                            key={entry.key}
                            color={entry.color}
                            sheet={sheet}
                            name={entry.name}
                            sub={entry.sub}
                            mod={entry.extreme ? 'Extreme' : undefined}
                            headIcons={<i className={'fa-solid ' + entry.icon}></i>}
                            bands={bands}
                        />
                    );
                })}
            </div>
        </Modal>
    );
}
