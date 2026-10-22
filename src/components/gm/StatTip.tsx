import { PoolBar } from './RosterBits';
import { MOD_RANGE, BASE_CRIT_MARGIN, clampMod, isEmptyMods, modOf, signed } from '../../lib/combatMods';
import type { CombatMods, ModKey } from '../../lib/combatMods';
import type { EntityRef } from '../../gm/entities';

/* The stats popup: a character's HP and Will, and the temporary offsets a
   fight puts on its numbers — an attribute a move lowered, a Defense a move
   raised, a crit made easier, an extra Evasion. The same box as the move
   panel (MoveTipShell), opened from its own button or from the move panel's
   corner; the GM screen and the rolling table each say where the numbers are
   written (`onPool`, `onMods`).

   Every number an offset moves is printed in the offset's colour with the
   difference beside it, here and in the move panel, so a player who forgot
   one sees it and can take it off without having to remember which numbers
   were their own. */

const STATS_PREFIX = 'stats:';

/** What the open popup is keyed by: the token for the move panel, the token
    behind this prefix for the stats popup. The button that opened it carries
    the same key in `data-tip-for`, so it is the one shown held down. */
export const statsKey = (token: string): string => STATS_PREFIX + token;

export function splitTipKey(key: string | null): { stats: boolean; token: string | null } {
    if (!key) return { stats: false, token: null };
    return key.startsWith(STATS_PREFIX)
        ? { stats: true, token: key.slice(STATS_PREFIX.length) }
        : { stats: false, token: key };
}

/** The row button. It glows while any offset is on, so it is seen from the
    row without opening anything. */
export function StatsButton({ token, mods, onOpen, className = 'icon-btn' }: {
    token: string;
    mods: CombatMods | null | undefined;
    onOpen: () => void;
    className?: string;
}) {
    const on = !isEmptyMods(mods);
    return (
        <button
            className={className + ' tip-btn stats-btn' + (on ? ' has-mods' : '')}
            data-tip-for={statsKey(token)}
            data-stats-for={token}
            title={on ? 'HP, Will and combat offsets — some are on' : 'HP, Will and combat offsets'}
            onClick={onOpen}
        >
            <i className="fa-solid fa-sliders"></i>
        </button>
    );
}

interface Row {
    key: ModKey;
    label: string;
    /** The sheet's own number, and the one the offsets make of it. Absent
        for an offset that is not on a number of its own (Accuracy, Damage:
        each move has its pool). */
    base?: string;
    total?: string;
    moved?: number;
    hint: string;
    /** Said after the total, smaller: what the number counts. */
    unit?: string;
}

export function StatTipBody({ subject, bare, sub, hp, will, onPool, onMods }: {
    subject: EntityRef;
    /** `ref.value` without the offsets (`bareValue`). */
    bare: (n: string) => number;
    sub: string;
    hp: { cur: number; max: number } | null;
    will: { cur: number; max: number } | null;
    onPool?: (key: 'hp' | 'will', delta: number, e: React.MouseEvent) => void;
    onMods: (next: CombatMods) => void;
}) {
    const mods = subject.mods;
    const value = subject.value;
    const m = (k: ModKey) => modOf(mods, k);

    const set = (key: ModKey, delta: number, e: React.MouseEvent) => {
        const next = { ...mods, [key]: clampMod(key, m(key) + (e.shiftKey ? delta * 5 : delta)) };
        onMods(next);
    };

    const attrs: Row[] = (['Strength', 'Dexterity', 'Vitality', 'Special', 'Insight'] as const).map((name) => {
        const key = name.toLowerCase() as ModKey;
        const b = bare(name), t = value(name);
        return { key, label: name, base: String(b), total: String(t), moved: t - b, hint: '' };
    });

    const evaBase = bare('Dexterity') + bare('Evasion');
    const eva = value('Dexterity') + value('Evasion') + m('evasion');
    const clashS = value('Strength') + value('Clash') + m('clash');
    const clashSp = value('Special') + value('Clash') + m('clash');
    const clashSB = bare('Strength') + bare('Clash'), clashSpB = bare('Special') + bare('Clash');
    const initB = bare('Dexterity') + bare('Alert');
    const init = value('Dexterity') + value('Alert') + m('init');
    const defB = bare('Vitality'), def = Math.max(0, value('Vitality') + m('def'));
    const spDefB = bare('Insight'), spDef = Math.max(0, value('Insight') + m('spDef'));
    const crit = Math.max(1, BASE_CRIT_MARGIN - m('crit'));
    const critHigh = Math.max(1, BASE_CRIT_MARGIN - 1 - m('crit'));

    const defences: Row[] = [
        { key: 'def', label: 'Defense', base: String(defB), total: String(def), moved: def - defB, hint: 'Vitality' },
        { key: 'spDef', label: 'Sp. Defense', base: String(spDefB), total: String(spDef), moved: spDef - spDefB, hint: 'Insight' },
    ];

    const combat: Row[] = [
        { key: 'accuracy', label: 'Accuracy', moved: m('accuracy'), hint: 'Dice on every move’s accuracy' },
        { key: 'damage', label: 'Damage', moved: m('damage'), hint: 'Dice on every move’s damage' },
        {
            /* A lower margin is the gain here: coloured as one. */
            key: 'crit', label: 'Critical', base: '+' + BASE_CRIT_MARGIN, total: '+' + crit, moved: m('crit'),
            hint: 'Successes over the target for a critical. High Critical moves: +' + critHigh,
        },
        { key: 'evasion', label: 'Evasion', base: String(evaBase), total: String(eva), moved: eva - evaBase, hint: 'Dexterity + Evasion' },
        {
            key: 'clash', label: 'Clash', base: clashSB + ' / ' + clashSpB, total: clashS + ' / ' + clashSp,
            moved: clashS - clashSB, hint: 'Strength + Clash / Special + Clash',
        },
        { key: 'init', label: 'Initiative', base: '1d6+' + initB, total: '1d6+' + init, moved: init - initB, hint: 'Dexterity + Alert' },
    ];

    /* How many of each a Round allows: apart from the Evasion and Clash
       pools above, which are dice, and in words, so "2" is not read as one. */
    const rounds: Row[] = [
        {
            key: 'extraEva', label: 'Evasions', total: String(1 + m('extraEva')), unit: 'per round',
            moved: m('extraEva'), hint: 'Evasions allowed each Round (normally 1)',
        },
        {
            key: 'extraClash', label: 'Clashes', total: String(1 + m('extraClash')), unit: 'per round',
            moved: m('extraClash'), hint: 'Clashes allowed each Round (normally 1)',
        },
    ];

    const line = (r: Row) => {
        const off = m(r.key);
        const [lo, hi] = MOD_RANGE[r.key];
        const dir = !r.moved ? '' : r.moved > 0 ? ' up' : ' down';
        return (
            <div className={'stat-row' + dir} key={r.key} data-mod-key={r.key}>
                <span className="stat-label" title={r.hint || undefined}>{r.label}</span>
                <span className="stat-base">{r.base ?? ''}</span>
                <span className="stat-step">
                    <button
                        className="stat-btn" aria-label={'Lower ' + r.label} disabled={off <= lo}
                        title="Shift-click: 5" onClick={(e) => set(r.key, -1, e)}
                    >−</button>
                    <span className={'stat-off' + (off ? ' on' : '')}>{off ? signed(off) : '0'}</span>
                    <button
                        className="stat-btn" aria-label={'Raise ' + r.label} disabled={off >= hi}
                        title="Shift-click: 5" onClick={(e) => set(r.key, 1, e)}
                    >+</button>
                </span>
                <span className="stat-total">
                    {r.total ?? (off ? signed(off) : '')}
                    {r.unit && <span className="stat-unit"> {r.unit}</span>}
                </span>
            </div>
        );
    };

    const empty = isEmptyMods(mods);
    return (
        <div className="stat-tip">
            <div className="tip-head">{subject.name}</div>
            <div className="tip-sub">{sub}</div>
            {/* Two columns, two bands: HP and Will beside the defences, then
                the attributes and the per-Round counts beside the rest of the
                combat numbers. A phone
                stacks the four (stat-panel.css). */}
            <div className="stat-cols">
                <div className="stat-area stat-area-pools">
                    {(hp || will) && (
                        <div className="pool-bars stat-pools">
                            {hp && <PoolBar tag="HP" cls="hp" cur={hp.cur} max={hp.max}
                                onStep={onPool && ((d, e) => onPool('hp', d, e))} />}
                            {will && <PoolBar tag="WILL" cls="will" cur={will.cur} max={will.max}
                                onStep={onPool && ((d, e) => onPool('will', d, e))} />}
                        </div>
                    )}
                </div>
                <div className="stat-area stat-area-defs">
                    <div className="stat-grid">{defences.map(line)}</div>
                </div>
                <div className="stat-area stat-area-attrs">
                    <div className="stat-section">Attributes</div>
                    <div className="stat-grid">{attrs.map(line)}</div>
                    <div className="stat-section">Per Round</div>
                    <div className="stat-grid">{rounds.map(line)}</div>
                </div>
                <div className="stat-area stat-area-combat">
                    <div className="stat-section">Combat</div>
                    <div className="stat-grid">{combat.map(line)}</div>
                </div>
            </div>
            <div className="stat-foot">
                <span className="stat-note">
                    {empty ? 'No offsets on.' : 'Offsets stay until taken off.'}
                </span>
                <button className="stat-reset" disabled={empty} onClick={() => onMods({})}>
                    <i className="fa-solid fa-rotate-left"></i> Reset all
                </button>
            </div>
        </div>
    );
}
