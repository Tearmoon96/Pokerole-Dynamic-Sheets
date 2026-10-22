import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAppData } from '../../data/AppDataContext';
import type { RollMeta } from '../../gm/dice';
import { MAX_ACTIONS } from '../../gm/combat';
import { ROLLABLE_QUICK, computeMoveTotals, pinnedMoveObjects } from '../../gm/moves';
import { typeColors } from '../../lib/themeTables';
import type { PokedexEntry, ItemEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';
import { BASE_CRIT_MARGIN, modOf, signed } from '../../lib/combatMods';
import type { CombatMods } from '../../lib/combatMods';

/* The move panel's parts, apart from where its subject and its rolls come
   from. The GM screen resolves a roster or combat token and rolls into its own
   dice history (MovePanel); the rolling table resolves the player's own
   character and sends the roll to the GM. Both draw the same panel. */

const CAT_COLORS: Record<string, string> = {
    Physical: '#f97316', Special: '#3b82f6', Support: '#10b981',
};

/** `quick` says what kind of roll it is, where that matters: an Evasion or a
    Clash (once a Round, and an action in a fight with turns), an attack's
    accuracy (the GM screen flags the action), or the initiative (which the
    rolling table turns into a way into the fight). */
export type RollKind = 'eva' | 'clash' | 'acc' | 'init';
/** `move`: the move an Accuracy is for, so the fight can mark it used. */
export type DoRoll = (dice: number, meta: RollMeta, quick?: RollKind, move?: string) => void;

/** Which quick chips are spent for the round, and so drawn without a button:
    Clash and Evasion are once per Round each. Absent on the GM screen, where the
    combat row carries those marks and the GM rolls whatever they like. */
export interface QuickSpent {
    eva?: boolean;
    clash?: boolean;
    /** Already in the fight: no second initiative. */
    init?: boolean;
}

/* Initiative, evasion and the two clashes: the pools that belong to the
   CHARACTER rather than to a move, which is why a trainer has them just as a
   Pokemon does and why this is a component rather than a closure inside the
   Pokemon panel. `value` is the only thing that differs between the two — a
   species-backed sheet on one side, a flat trainer .json on the other — and
   EntityRef already hands both over behind the same signature.

   Defence and Special Defence ride along as plain numbers. They are what an
   attacker rolls against; there is no roll to make with them. */
export function QuickRolls({ who, value, pain, doRoll, spent, noInit, mods, bare }: {
    who: string;
    value: (n: string) => number;
    pain: number;
    doRoll: DoRoll;
    spent?: QuickSpent;
    /** The table's trainer rolls initiative from the panel's own button. */
    noInit?: boolean;
    /** Temporary combat offsets. `value` already carries the attributes';
        the pools' own (Evasion, Clash, Initiative, the defences) are added
        here. `bare` is `value` without any, to show what they changed. */
    mods?: CombatMods;
    bare?: (n: string) => number;
}) {
    const raw = bare || value;
    const clash = value('Clash');
    /* Initiative is the one roll on this panel that is not a pool. It is a
       SINGLE d6 plus Dexterity + Alert, added up — not that many dice counted
       for successes, which is what this chip used to roll and what made a fast
       Pokemon roll eight dice for a number it then read off as a total. The
       pain penalty comes off successes, so it has nothing to take here. */
    const initBonus = value('Dexterity') + value('Alert') + modOf(mods, 'init');
    const initBare = raw('Dexterity') + raw('Alert');

    const chip = (key: string, label: string, dice: number, base: number, tip: string, what: string,
        used: boolean, quick: 'eva' | 'clash') => {
        const body = <>{label} <ModNum value={dice} base={base} /></>;
        if (!ROLLABLE_QUICK.includes(key) || dice <= 0) {
            return <span key={key} title={tip}>{body}</span>;
        }
        if (used) {
            return <span key={key} className="tip-used" title="Already used this Round">{body}</span>;
        }
        return (
            <button
                key={key}
                className="tip-roll"
                title={tip}
                onClick={() => doRoll(dice, { who, what, pain }, quick)}
            >
                {body}
            </button>
        );
    };

    return (
        <>
            {!noInit && (spent?.init ? (
                <span key="init" className="tip-used" title="Already in the fight">
                    INIT <ModNum value={initBonus} base={initBare} prefix="1d6+" />
                </span>
            ) : (
                <button
                    key="init"
                    className="tip-roll"
                    title="Dexterity + Alert"
                    onClick={() => doRoll(1, { who, what: 'Initiative', bonus: initBonus }, 'init')}
                >
                    INIT <ModNum value={initBonus} base={initBare} prefix="1d6+" />
                </button>
            ))}
            {chip('eva', 'EVA', value('Dexterity') + value('Evasion') + modOf(mods, 'evasion'),
                raw('Dexterity') + raw('Evasion'),
                'Dexterity + Evasion', 'Evasion', !!spent?.eva, 'eva')}
            {chip('clash-s', 'CLASH-S', value('Strength') + clash + modOf(mods, 'clash'),
                raw('Strength') + raw('Clash'),
                'Strength + Clash', 'Clash (Strength)', !!spent?.clash, 'clash')}
            {chip('clash-sp', 'CLASH-SP', value('Special') + clash + modOf(mods, 'clash'),
                raw('Special') + raw('Clash'),
                'Special + Clash', 'Clash (Special)', !!spent?.clash, 'clash')}
            <span title="Defence is Vitality">
                DEF <ModNum value={Math.max(0, value('Vitality') + modOf(mods, 'def'))} base={raw('Vitality')} />
            </span>
            <span title="Special Defence is Insight">
                SP.DEF <ModNum value={Math.max(0, value('Insight') + modOf(mods, 'spDef'))} base={raw('Insight')} />
            </span>
        </>
    );
}

/** A number that temporary combat offsets may have moved: in their colour,
    with the difference beside it, so a forgotten offset is seen on every
    roll it touches and can be taken off. */
export function ModNum({ value, base, prefix = '' }: { value: number; base: number; prefix?: string }) {
    const d = value - base;
    if (!d) return <strong>{prefix}{value}</strong>;
    return (
        <strong className={'mod-num ' + (d > 0 ? 'up' : 'down')} data-mod={d}>
            {prefix}{value}<span className="mod-delta">{signed(d)}</span>
        </strong>
    );
}

/** A move's pool as text ("5", or "3 + Clever" with a part that did not
    resolve), marked like ModNum when offsets are part of it. */
function ModText({ text, delta }: { text: string; delta: number }) {
    if (!delta) return <strong>{text}</strong>;
    return (
        <strong className={'mod-num ' + (delta > 0 ? 'up' : 'down')} data-mod={delta}>
            {text}<span className="mod-delta">{signed(delta)}</span>
        </strong>
    );
}

/** A move that crits at fewer than the usual three successes over the
    target: High Critical, a crit offset, or both; 0 always crits. */
function CritBadge({ margin }: { margin: number }) {
    if (margin === BASE_CRIT_MARGIN) return null;
    return (
        <span
            className="tip-crit" data-crit={margin}
            title={margin === 0 ? 'Every hit is a critical'
                : 'A critical at ' + margin + (margin === 1 ? ' success' : ' successes') + ' over the target'}
        >
            {margin === 0 ? 'ALWAYS CRIT' : 'CRIT +' + margin}
        </span>
    );
}

/* The pain badge, shown by both panels on the same terms. */
export function PainChip({ pain }: { pain: number }) {
    if (!pain) return null;
    return (
        <span
            className="tip-pain"
            title="Half HP or less: −1 success on every roll, −2 at 1 HP. Already taken off rolls made here."
        >
            PAIN −{pain}
        </span>
    );
}

/* `act` is the action being played, one past the pips already filled. */
function ActionLine({ act }: { act: number | null }) {
    if (!act) return null;
    if (act > MAX_ACTIONS) {
        return <div className="tip-action">No actions left this Round</div>;
    }
    return (
        <div className="tip-action">
            Action <strong>{act}</strong> · needs{' '}
            <strong>{act}</strong> {act === 1 ? 'success' : 'successes'}
        </div>
    );
}

/** The floating box, anchored beside the row whose `data-tip` is `token`.
    Closes on Escape, on a click elsewhere, and when the row goes away. */
export function MoveTipShell({ token, onClose, children, id = 'mon-tooltip', switchTo }: {
    token: string;
    onClose: () => void;
    children: ReactNode;
    /** The stats popup is the same box under its own id. */
    id?: string;
    /** The button in the corner that swaps this popup for the other one. */
    switchTo?: { label: string; icon: string; onClick: () => void };
}) {
    const ref = useRef<HTMLDivElement>(null);

    /* Prefer the right of the row, fall back to its left when that would run off
       screen, then clamp vertically to the viewport. */
    useLayoutEffect(() => {
        const tip = ref.current;
        if (!tip) return;
        const place = () => {
            /* The row; else the button that opened it — a trainer's combat
               row is no anchor (its roster card is), and a player's trainer
               copied in from the table has no roster card at all. */
            const t = CSS.escape(token);
            const row = document.querySelector('[data-tip="' + t + '"]')
                || document.querySelector('[data-tip-for="' + t + '"], [data-stats-for="' + t + '"]');
            if (!row) { onClose(); return; }
            const r = row.getBoundingClientRect();
            const w = tip.offsetWidth, h = tip.offsetHeight;
            const gap = 10;
            let left = r.right + gap;
            if (left + w > window.innerWidth - 8) left = r.left - w - gap;
            if (left < 8) left = Math.max(8, window.innerWidth - w - 8);
            let top = r.top + r.height / 2 - h / 2;
            top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
        };
        place();
        /* Scrolling moves the anchor row out from under a fixed panel. */
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    });

    /* Escape closes it, the same key that dismisses the confirm dialog; so does
       clicking away. Its own button is exempt, or the toggle would close and
       reopen on the same click — and so are the dice controls, where a roll it
       set up is adjusted and thrown with the panel still open for the next. */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onClick = (e: MouseEvent) => {
            const el = e.target as HTMLElement;
            if (!el.closest) return;
            if (el.closest('.mon-tooltip') || el.closest('.tip-btn') || el.closest('[data-keeps-tip]')) return;
            onClose();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', onClick);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onClick);
        };
    }, [token, onClose]);

    return (
        <div className="mon-tooltip" id={id} ref={ref} style={{ display: 'block' }} data-tt-avoid>
            <button className="tip-close" aria-label="Close" onClick={onClose}>
                <i className="fa-solid fa-xmark"></i>
            </button>
            {switchTo && (
                <button className="tip-switch" data-tip-switch="" onClick={switchTo.onClick}>
                    <i className={'fa-solid ' + switchTo.icon}></i> {switchTo.label}
                </button>
            )}
            {children}
        </div>
    );
}

/** The open row's button is held down, so it is obvious which of them the
    panel belongs to. */
export function useTipButtonState(token: string | null): void {
    useEffect(() => {
        document.querySelectorAll('.tip-btn').forEach((b) => {
            b.classList.toggle('on', !!token && (b as HTMLElement).dataset.tipFor === token);
        });
    });
}

/* A trainer gets the same panel minus the half of it that is about moves: they
   have no learnset and no pinned list, but Initiative, Evasion and the two
   Clashes are theirs exactly as they are a Pokemon's, off the same attributes
   and skills. */
export function TrainerTipBody({ name, rank, value, pain, act, doRoll, spent, noInit, mods, bare }: {
    name: string;
    rank: string;
    value: (n: string) => number;
    pain: number;
    act: number | null;
    doRoll: DoRoll;
    spent?: QuickSpent;
    noInit?: boolean;
    mods?: CombatMods;
    bare?: (n: string) => number;
}) {
    return (
        <>
            <div className="tip-head">{name}</div>
            <div className="tip-sub">Trainer{rank ? ' · ' + rank : ''}</div>
            <div className="tip-quick">
                <QuickRolls who={name} value={value} pain={pain} doRoll={doRoll} spent={spent} noInit={noInit}
                    mods={mods} bare={bare} />
                <PainChip pain={pain} />
            </div>
            <ActionLine act={act} />
            <div className="tip-empty">
                A trainer has no move list. Their Pokémon carry theirs — open one from the
                roster or from the combat tracker.
            </div>
        </>
    );
}

/* A move used this Round. On the GM screen it is a button: a mark set by a
   roll the GM threw away comes off, and one can be set by hand; on the table
   it only shows. */
function UsedMark({ used, onToggle }: { used: boolean; onToggle?: () => void }) {
    if (onToggle) {
        return (
            <button
                type="button" className={'tip-move-used' + (used ? ' on' : '')} aria-pressed={used} data-used-mark=""
                title={used ? 'Used this Round — click to clear' : 'Mark as used this Round'}
                onClick={onToggle}
            >
                <i className={'fa-solid ' + (used ? 'fa-circle-check' : 'fa-circle')}></i>{used && ' Used'}
            </button>
        );
    }
    if (!used) return null;
    return (
        <span className="tip-move-used on" data-used-mark="" title="Used this Round: a move is once a Round">
            <i className="fa-solid fa-circle-check"></i> Used
        </span>
    );
}

export function MonTipBody({ token, dex, sheet, who, owner, value, pain, act, doRoll, spent, noInit, used, onToggleUsed, mods, bare }: {
    token: string;
    dex: PokedexEntry;
    sheet: Partial<CardSheet>;
    who: string;
    owner: string;
    value: (n: string) => number;
    pain: number;
    /** The action this round is on, or null outside a fight. */
    act: number | null;
    doRoll: DoRoll;
    spent?: QuickSpent;
    noInit?: boolean;
    /** Moves already used this Round (once each), by name. */
    used?: string[];
    /** The GM may clear a mark, or set one, by hand. */
    onToggleUsed?: (move: string) => void;
    mods?: CombatMods;
    bare?: (n: string) => number;
}) {
    const { data } = useAppData();
    const itemByName = (name: string): ItemEntry | null => {
        const want = String(name || '').trim().toLowerCase();
        if (!want) return null;
        return data.items.find((i) => String(i.Name || '').trim().toLowerCase() === want) || null;
    };
    /* An Accuracy needs as many successes as the number of the action. */
    const need = act && act <= MAX_ACTIONS ? act : null;
    const moves = pinnedMoveObjects(dex, sheet, data.moves);
    const types = [dex.Type1, dex.Type2].filter(Boolean).join(' / ');

    return (
        <>
            <div className="tip-head">{who}</div>
            <div className="tip-sub">{types}{owner ? ' · ' + owner : ''}</div>
            <div className="tip-quick">
                <QuickRolls who={who} value={value} pain={pain} doRoll={doRoll} spent={spent} noInit={noInit}
                    mods={mods} bare={bare} />
                <PainChip pain={pain} />
            </div>

            <ActionLine act={act} />

            {!moves.length ? (
                <div className="tip-empty">
                    No pinned moves. Pin them on this Pokémon's card and they show up here.
                </div>
            ) : moves.map((move, mi) => {
                const totals = computeMoveTotals(dex, sheet, move, itemByName);
                const tc = typeColors[move.Type] || '#e5e7eb';
                const cc = CAT_COLORS[move.Category || ''] || 'var(--text-secondary)';

                /* No hints on the pools or the bonus chips. The action line
                   above already says how many successes this round needs, and
                   the chips beside DMG are what it includes — the hints only
                   repeated both, drawn over the move above. */
                const accText = totals.acc == null ? '—' : totals.acc;

                return (
                    <div className="tip-move" key={move.Name + mi}>
                        <div className="tip-move-head">
                            <span className="tip-move-name">{move.Name}</span>
                            <UsedMark used={!!used?.includes(move.Name)} onToggle={onToggleUsed ? () => onToggleUsed(move.Name) : undefined} />
                            <CritBadge margin={totals.crit} />
                            <span className="tip-badge"
                                style={{ color: tc, borderColor: tc + '66', background: tc + '1a' }}>
                                {move.Type}
                            </span>
                            <span className="tip-badge"
                                style={{ color: cc, borderColor: cc + '66', background: cc + '1a' }}>
                                {move.Category || ''}
                            </span>
                        </div>
                        <div className="tip-pools">
                            {(totals.accN ?? 0) > 0 ? (
                                <button
                                    className="tip-pool acc"
                                    onClick={() => doRoll(totals.accN!, {
                                        who, what: move.Name + ' accuracy', need, pain,
                                        /* High Critical and the crit offset: the
                                           verdict is measured against this. */
                                        ...(totals.crit !== BASE_CRIT_MARGIN ? { crit: totals.crit } : {}),
                                        /* carried so a hit can roll the damage in one
                                           more click, and a critical already boosted */
                                        dmg: (totals.powN ?? 0) > 0
                                            ? { token, mi, dice: totals.powN!, what: move.Name + ' damage' }
                                            : null,
                                    }, 'acc', move.Name)}
                                >
                                    ACC <ModText text={accText} delta={totals.accMod} />
                                </button>
                            ) : (
                                <span className="tip-pool acc">ACC <ModText text={accText} delta={totals.accMod} /></span>
                            )}
                            {(totals.powN ?? 0) > 0 ? (
                                <button
                                    className="tip-pool dmg"
                                    onClick={() => doRoll(totals.powN!, {
                                        who, what: move.Name + ' damage', pain,
                                    })}
                                >
                                    DMG <ModText text={totals.pow || ''} delta={totals.powMod} />
                                </button>
                            ) : (
                                <span className="tip-pool dmg">
                                    DMG <strong>{totals.pow == null ? '—' : totals.pow}</strong>
                                </span>
                            )}
                            {totals.bonus.parts.map((b) => (
                                <span className="tip-bonus" key={b.label}>
                                    {b.label} +{b.value}
                                </span>
                            ))}
                        </div>
                        {move.Effect && <div className="tip-effect">{move.Effect}</div>}
                    </div>
                );
            })}
        </>
    );
}
