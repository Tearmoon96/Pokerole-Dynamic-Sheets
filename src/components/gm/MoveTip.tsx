import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAppData } from '../../data/AppDataContext';
import type { RollMeta } from '../../gm/dice';
import { ROLLABLE_QUICK, computeMoveTotals, pinnedMoveObjects } from '../../gm/moves';
import { typeColors } from '../../lib/themeTables';
import type { PokedexEntry, ItemEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';

/* The move panel's parts, apart from where its subject and its rolls come
   from. The GM screen resolves a roster or combat token and rolls into its own
   dice history (MovePanel); the rolling table resolves the player's own
   character and sends the roll to the GM. Both draw the same panel. */

const CAT_COLORS: Record<string, string> = {
    Physical: '#f97316', Special: '#3b82f6', Support: '#10b981',
};

/** `quick` names a once-a-Round roll — an Evasion or a Clash — which in a
    fight with turns costs its roller an action. */
export type DoRoll = (dice: number, meta: RollMeta, quick?: 'eva' | 'clash') => void;

/** Which quick chips are spent for the round, and so drawn without a button:
    Clash and Evasion are once per Round each. Absent on the GM screen, where the
    combat row carries those marks and the GM rolls whatever they like. */
export interface QuickSpent { eva?: boolean; clash?: boolean }

/* Initiative, evasion and the two clashes: the pools that belong to the
   CHARACTER rather than to a move, which is why a trainer has them just as a
   Pokemon does and why this is a component rather than a closure inside the
   Pokemon panel. `value` is the only thing that differs between the two — a
   species-backed sheet on one side, a flat trainer .json on the other — and
   EntityRef already hands both over behind the same signature.

   Defence and Special Defence ride along as plain numbers. They are what an
   attacker rolls against; there is no roll to make with them. */
export function QuickRolls({ who, value, pain, doRoll, spent, noInit }: {
    who: string;
    value: (n: string) => number;
    pain: number;
    doRoll: DoRoll;
    spent?: QuickSpent;
    /** The table rolls initiative from its own Enter-combat dialog. */
    noInit?: boolean;
}) {
    const clash = value('Clash');
    /* Initiative is the one roll on this panel that is not a pool. It is a
       SINGLE d6 plus Dexterity + Alert, added up — not that many dice counted
       for successes, which is what this chip used to roll and what made a fast
       Pokemon roll eight dice for a number it then read off as a total. The
       pain penalty comes off successes, so it has nothing to take here. */
    const initBonus = value('Dexterity') + value('Alert');

    const chip = (key: string, label: string, dice: number, tip: string, what: string, used: boolean,
        quick: 'eva' | 'clash') => {
        const body = <>{label} <strong>{dice}</strong></>;
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
            {!noInit && (
                <button
                    key="init"
                    className="tip-roll"
                    title="Dexterity + Alert"
                    onClick={() => doRoll(1, { who, what: 'Initiative', bonus: initBonus })}
                >
                    INIT <strong>1d6+{initBonus}</strong>
                </button>
            )}
            {chip('eva', 'EVA', value('Dexterity') + value('Evasion'),
                'Dexterity + Evasion', 'Evasion', !!spent?.eva, 'eva')}
            {chip('clash-s', 'CLASH-S', value('Strength') + clash,
                'Strength + Clash', 'Clash (Strength)', !!spent?.clash, 'clash')}
            {chip('clash-sp', 'CLASH-SP', value('Special') + clash,
                'Special + Clash', 'Clash (Special)', !!spent?.clash, 'clash')}
            <span title="Defence is Vitality">DEF <strong>{value('Vitality')}</strong></span>
            <span title="Special Defence is Insight">SP.DEF <strong>{value('Insight')}</strong></span>
        </>
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

function ActionLine({ act }: { act: number | null }) {
    if (!act) return null;
    return (
        <div className="tip-action">
            Action <strong>{act}</strong> · needs{' '}
            <strong>{act}</strong> {act === 1 ? 'success' : 'successes'}
        </div>
    );
}

/** The floating box, anchored beside the row whose `data-tip` is `token`.
    Closes on Escape, on a click elsewhere, and when the row goes away. */
export function MoveTipShell({ token, onClose, children }: {
    token: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);

    /* Prefer the right of the row, fall back to its left when that would run off
       screen, then clamp vertically to the viewport. */
    useLayoutEffect(() => {
        const tip = ref.current;
        if (!tip) return;
        const place = () => {
            const row = document.querySelector('[data-tip="' + CSS.escape(token) + '"]');
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
       reopen on the same click. */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onClick = (e: MouseEvent) => {
            const el = e.target as HTMLElement;
            if (!el.closest) return;
            if (el.closest('#mon-tooltip') || el.closest('.tip-btn')) return;
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
        <div className="mon-tooltip" id="mon-tooltip" ref={ref} style={{ display: 'block' }} data-tt-avoid>
            <button className="tip-close" aria-label="Close" onClick={onClose}>
                <i className="fa-solid fa-xmark"></i>
            </button>
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
export function TrainerTipBody({ name, rank, value, pain, act, doRoll, spent, noInit }: {
    name: string;
    rank: string;
    value: (n: string) => number;
    pain: number;
    act: number | null;
    doRoll: DoRoll;
    spent?: QuickSpent;
    noInit?: boolean;
}) {
    return (
        <>
            <div className="tip-head">{name}</div>
            <div className="tip-sub">Trainer{rank ? ' · ' + rank : ''}</div>
            <div className="tip-quick">
                <QuickRolls who={name} value={value} pain={pain} doRoll={doRoll} spent={spent} noInit={noInit} />
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

export function MonTipBody({ token, dex, sheet, who, owner, value, pain, act, doRoll, spent, noInit }: {
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
}) {
    const { data } = useAppData();
    const itemByName = (name: string): ItemEntry | null => {
        const want = String(name || '').trim().toLowerCase();
        if (!want) return null;
        return data.items.find((i) => String(i.Name || '').trim().toLowerCase() === want) || null;
    };
    const need = act;
    const moves = pinnedMoveObjects(dex, sheet, data.moves);
    const types = [dex.Type1, dex.Type2].filter(Boolean).join(' / ');

    return (
        <>
            <div className="tip-head">{who}</div>
            <div className="tip-sub">{types}{owner ? ' · ' + owner : ''}</div>
            <div className="tip-quick">
                <QuickRolls who={who} value={value} pain={pain} doRoll={doRoll} spent={spent} noInit={noInit} />
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
                                        /* carried so a hit can roll the damage in one
                                           more click, and a critical already boosted */
                                        dmg: (totals.powN ?? 0) > 0
                                            ? { token, mi, dice: totals.powN!, what: move.Name + ' damage' }
                                            : null,
                                    })}
                                >
                                    ACC <strong>{accText}</strong>
                                </button>
                            ) : (
                                <span className="tip-pool acc">ACC <strong>{accText}</strong></span>
                            )}
                            {(totals.powN ?? 0) > 0 ? (
                                <button
                                    className="tip-pool dmg"
                                    onClick={() => doRoll(totals.powN!, {
                                        who, what: move.Name + ' damage', pain,
                                    })}
                                >
                                    DMG <strong>{totals.pow}</strong>
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
