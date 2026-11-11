import { useCard } from '../../card/CardContext';
import { PoolBar } from '../common/PoolBar';
import { StatusTracker } from './StatusTracker';
import { RankInput } from '../common/RankInput';
import {
    DEFENCE_BONUS_CAP, defenceValue, derivedPoolMax, getPoolMax, painOf,
} from '../../card/pools';
import { PainMarks } from '../common/PainMarks';
import { modOf, normalizeMods, withMod } from '../../lib/combatMods';
import type { ModKey } from '../../lib/combatMods';
import { painRuleOff, settledPainOff } from '../../lib/pain';
import type { CardSheet } from '../../card/types';
import type { PokedexEntry } from '../../data/types';

/* Health, Willpower, the two defences, Rank, EXP and the status icons. */

type PoolKey = 'hp' | 'will';

function setMod(s: CardSheet, key: ModKey, v: number): void {
    const m = withMod(s.combatMods, key, v);
    if (m) s.combatMods = m; else delete s.combatMods;
}

/* An HP that climbs back out of a pain tier takes the Will that bought the
   tier off with it: pain that comes back later is new pain (lib/pain.ts). */
function settlePain(s: CardSheet, pokemon: PokedexEntry): void {
    const mods = normalizeMods(s.combatMods);
    if (!mods.painOff) return;
    const off = settledPainOff(mods, s.hp, getPoolMax({ pokemon, sheet: s }, 'hp'));
    if (off !== mods.painOff) setMod(s, 'painOff', off);
}

/* Beside the health bar, after its label: the switch that ignores Pain
   Penalization for this one Pokémon — a small heart — and the pain marks,
   one per tier the HP is in, red while it costs successes, blue once Will
   has bought it off.

   In the label and not in the bar's own track: the track has no room to
   give, and the marks there squeezed the health bar to a stub beside a
   full-width Willpower bar. */
function PainSlot() {
    const { sheet, src, store } = useCard();
    const view = painOf(src);
    const own = !!modOf(normalizeMods(sheet.combatMods), 'noPain');
    const table = !own && painRuleOff();
    return (
        <span className="pain-slot">
            <button
                type="button" id="pain-rule-btn"
                className={'pain-rule-btn' + (own ? ' off' : '')}
                aria-pressed={own}
                title={own
                    ? 'Pain Penalization is ignored for this Pokémon. Click to bring it back.'
                    : 'Pain Penalization: −1 success at half HP, 2 more at 1 HP.'
                        + (table ? ' Switched off for the whole table right now.' : '')
                        + ' Click to ignore it for this Pokémon.'}
                onClick={() => store.update((s) => { setMod(s, 'noPain', own ? 0 : 1); })}
            >
                <i className={'fa-solid ' + (own ? 'fa-heart' : 'fa-heart-crack')}></i>
            </button>
            <PainMarks
                view={view} will={sheet.will} noIcon
                onSet={(off, cost) => store.update((s) => {
                    const max = getPoolMax({ pokemon: store.pokemon, sheet: s }, 'will');
                    s.will = Math.max(0, Math.min(max, s.will - cost));
                    setMod(s, 'painOff', off);
                })}
            />
        </span>
    );
}

function Pool({ poolKey, colorClass }: { poolKey: PoolKey; colorClass: string }) {
    const { sheet, src, store } = useCard();
    const max = getPoolMax(src, poolKey);
    return (
        <div className="pool-track" id={poolKey + '-tracker'}>
            <PoolBar
                current={Math.min(sheet[poolKey], max)}
                max={max}
                colorClass={colorClass}
                readCurrent={() => store.sheet[poolKey]}
                onSetCurrent={(value) => store.update((s) => {
                    s[poolKey] = Math.max(0, Math.min(getPoolMax({ pokemon: store.pokemon, sheet: s }, poolKey), value));
                    if (poolKey === 'hp') settlePain(s, store.pokemon);
                })}
                onSetMax={(value) => store.update((s) => {
                    const src2 = { pokemon: store.pokemon, sheet: s };
                    const bonus = Math.max(1, value) - derivedPoolMax(src2, poolKey);
                    if (poolKey === 'hp') s.hpMaxBonus = bonus; else s.willMaxBonus = bonus;
                    s[poolKey] = Math.min(s[poolKey], getPoolMax(src2, poolKey));
                    if (poolKey === 'hp') settlePain(s, store.pokemon);
                })}
            />
        </div>
    );
}

/* One defence row: the total in its pill, the colour that says whether it has
   been nudged, and the popup's own read-out. The popup is always in the markup
   so it keeps the pointer's :hover while you click − and + inside it. */
function DefenceRow({ which, label, iconColor }: {
    which: 'def' | 'spDef'; label: string; iconColor: string;
}) {
    const { src, store } = useCard();
    const { base, bonus, total } = defenceValue(src, which);
    const from = which === 'def' ? 'Vitality' : 'Insight';

    const setBonus = (value: number) => store.update((s) => {
        const clamped = Math.max(-DEFENCE_BONUS_CAP, Math.min(DEFENCE_BONUS_CAP, value));
        if (which === 'def') s.defBonus = clamped; else s.spDefBonus = clamped;
    });

    const mark = (bonus > 0 ? ' buffed' : bonus < 0 ? ' nerfed' : '');

    return (
        <div className="tracker-row def-row">
            <span className="tracker-label">
                <i className="fa-solid fa-shield-halved" style={{ color: iconColor }}></i> {label}
            </span>
            <span className="def-val-wrap">
                <span
                    className={'pool-static-val' + mark}
                    id={which === 'def' ? 'defense-value' : 'sp-defense-value'}
                    title={bonus
                        ? `${from} ${base} ${bonus > 0 ? '+' : '−'}${Math.abs(bonus)} = ${total}`
                        : `Equal to ${from}`}
                >
                    {total}
                </span>
                <div className="def-offset-pop">
                    <button type="button" className="def-offset-btn" title="Lower by 1"
                        onClick={() => setBonus(bonus - 1)}>
                        <i className="fa-solid fa-minus"></i>
                    </button>
                    <span
                        className={'def-offset-val' + mark}
                        id={which === 'def' ? 'def-offset-val' : 'sp-def-offset-val'}
                    >
                        {(bonus > 0 ? '+' : bonus < 0 ? '−' : '±') + Math.abs(bonus)}
                    </span>
                    <button type="button" className="def-offset-btn" title="Raise by 1"
                        onClick={() => setBonus(bonus + 1)}>
                        <i className="fa-solid fa-plus"></i>
                    </button>
                    <button type="button" className="def-offset-reset" onClick={() => setBonus(0)}>
                        Reset
                    </button>
                </div>
            </span>
        </div>
    );
}

export function PoolsPanel() {
    const { sheet, store } = useCard();
    return (
        <div className="tracker-panel pools">
            <div className="tracker-row">
                <span className="tracker-label has-pain">
                    <i className="fa-solid fa-heart-pulse pool-ink-hp"></i> Health
                    <PainSlot />
                </span>
                <Pool poolKey="hp" colorClass="health" />
            </div>
            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-star pool-ink-will"></i> Willpower
                </span>
                <Pool poolKey="will" colorClass="willpower" />
            </div>

            <DefenceRow which="def" label="Def" iconColor="#93c5fd" />
            <DefenceRow which="spDef" label="Sp.Def" iconColor="#c4b5fd" />

            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-ranking-star" style={{ color: '#f59e0b' }}></i> Rank
                </span>
                <div className="item-search-wrap">
                    <RankInput
                        value={sheet.rank}
                        onCommit={(rank) => store.update((s) => { s.rank = rank; })}
                        inputClassName="pool-text-input"
                        suggestionsClassName="nature-suggestions rank-suggestions"
                    />
                </div>
            </div>

            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-arrow-trend-up" style={{ color: '#fbbf24' }}></i> EXP
                </span>
                <input
                    type="text"
                    inputMode="numeric"
                    id="exp-input"
                    className="exp-input"
                    value={sheet.exp}
                    onChange={(e) => {
                        const parsed = parseInt(e.currentTarget.value, 10);
                        const exp = (isNaN(parsed) || parsed < 0) ? 0 : parsed;
                        store.update((s) => { s.exp = exp; });
                    }}
                />
            </div>

            <div className="tracker-row tracker-row-status">
                <span className="tracker-label">
                    <i className="fa-solid fa-kit-medical" style={{ color: '#f43f5e' }}></i> Status
                </span>
                <StatusTracker />
            </div>
        </div>
    );
}
