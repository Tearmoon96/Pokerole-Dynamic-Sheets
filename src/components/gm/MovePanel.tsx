import { useEffect, useLayoutEffect, useRef } from 'react';
import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { CRIT_MARGIN } from '../../gm/constants';
import { HISTORY_LIMIT, roll } from '../../gm/dice';
import type { RollMeta } from '../../gm/dice';
import {
    ROLLABLE_QUICK, computeMoveTotals, ordSuffix, painPenalty, pinnedMoveObjects,
} from '../../gm/moves';
import { resolvePoolValue } from '../../gm/pools';
import { participantForToken, trainerIdAt, wildLiveSheet } from '../../gm/entities';
import { workingTrainerData } from '../../gm/workingSet';
import { monShownName } from '../../gm/entities';
import { typeColors } from '../../lib/themeTables';
import type { PokedexEntry, ItemEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';

/* The move list opens on its own button and stays up until it is closed again —
   it used to follow the pointer, which meant it appeared over whatever was being
   read on the way past. One is open at a time. */

const CAT_COLORS: Record<string, string> = {
    Physical: '#f97316', Special: '#3b82f6', Support: '#10b981',
};

interface TipTarget { dexId: string; sheet: Partial<CardSheet>; owner: string }

export function MovePanel({ token, onClose }: { token: string | null; onClose: () => void }) {
    const { state, store } = useGm();
    const { data } = useAppData();
    const ref = useRef<HTMLDivElement>(null);

    const dexById = (id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null;
    const itemByName = (name: string): ItemEntry | null => {
        const want = String(name || '').trim().toLowerCase();
        if (!want) return null;
        return data.items.find((i) => String(i.Name || '').trim().toLowerCase() === want) || null;
    };

    const target = ((): TipTarget | null => {
        const parts = String(token || '').split(':');
        if (parts[0] === 'm') {
            const id = trainerIdAt(state, +parts[1]);
            const t = id ? workingTrainerData(id) : null;
            const slot = t && Array.isArray(t.team) ? t.team[+parts[2]] : null;
            if (!slot || !slot.dexId) return null;
            return { dexId: slot.dexId, sheet: (slot.sheet || {}) as Partial<CardSheet>, owner: t!.name || '' };
        }
        if (parts[0] === 'w') {
            const w = state.wilds.find((x) => x.gid === parts[1]);
            if (!w) return null;
            return { dexId: w.dexId, sheet: wildLiveSheet(w), owner: 'Wild' };
        }
        return null;
    })();

    /* Prefer the right of the row, fall back to its left when that would run off
       screen, then clamp vertically to the viewport. */
    useLayoutEffect(() => {
        const tip = ref.current;
        if (!tip || !token) return;
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

    /* The open row's button is held down, so it is obvious which of them this
       panel belongs to. */
    useEffect(() => {
        document.querySelectorAll('.tip-btn').forEach((b) => {
            b.classList.toggle('on', !!token && (b as HTMLElement).dataset.tipFor === token);
        });
    });

    /* Escape closes it, the same key that dismisses the confirm dialog; so does
       clicking away. Its own button is exempt, or the toggle would close and
       reopen on the same click. */
    useEffect(() => {
        if (!token) return;
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

    if (!token || !target) return <div className="mon-tooltip" id="mon-tooltip" style={{ display: 'none' }} />;

    const dex = dexById(target.dexId);
    const sheet = target.sheet;

    const doRoll = (dice: number, meta: RollMeta) => {
        /* An empty pool is not a roll of one die — the same rule the ailment
           rolls follow. */
        if (!(dice > 0)) return;
        store.update((s) => {
            const entry = roll(dice, 6, meta, CRIT_MARGIN);
            s.dice = { count: dice, sides: 6, history: [entry, ...s.dice.history].slice(0, HISTORY_LIMIT) };
        });
    };

    if (!dex) {
        return (
            <div className="mon-tooltip" id="mon-tooltip" ref={ref} style={{ display: 'block' }}>
                <button className="tip-close" title="Close" onClick={onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </button>
                <div className="tip-empty">Species data unavailable.</div>
            </div>
        );
    }

    const val = (n: string) => resolvePoolValue(dex, sheet, n) || 0;
    const clash = val('Clash');
    const pain = painPenalty(dex, sheet);
    const who = monShownName(dexById, target.dexId, sheet);

    /* What this round has already cost the subject. Only combatants have
       actions, so a Pokémon sitting in the roster rolls its plain Accuracy with
       no target number. */
    const participant = participantForToken(state, dexById, token);
    /* The pip is filled for the action being taken, so the count of filled pips
       IS the number of this action. Before the first pip is clicked the subject
       is on action one. */
    const act = participant ? { n: Math.max(1, (participant.acted as number) || 0) } : null;
    const need = act ? act.n : null;

    const quick = (key: string, label: string, dice: number, tip: string) => {
        const body = <>{label} <strong>{dice}</strong></>;
        if (!ROLLABLE_QUICK.includes(key) || dice <= 0) return <span title={tip}>{body}</span>;
        return (
            <button
                className="tip-roll"
                title={tip + ' — click to roll ' + dice + 'd6'}
                onClick={() => doRoll(dice, { who, what: label === 'EVA' ? 'Evasion'
                    : label === 'CLASH-S' ? 'Clash (Strength)' : 'Clash (Special)', pain })}
            >
                {body}
            </button>
        );
    };

    const moves = pinnedMoveObjects(dex, sheet, data.moves);
    const types = [dex.Type1, dex.Type2].filter(Boolean).join(' / ');

    return (
        <div className="mon-tooltip" id="mon-tooltip" ref={ref} style={{ display: 'block' }}>
            <button className="tip-close" title="Close" onClick={onClose}>
                <i className="fa-solid fa-xmark"></i>
            </button>
            <div className="tip-head">{who}</div>
            <div className="tip-sub">{types}{target.owner ? ' · ' + target.owner : ''}</div>
            <div className="tip-quick">
                <span title="Dexterity + Alert">INIT <strong>{val('Dexterity') + val('Alert')}</strong></span>
                {quick('eva', 'EVA', val('Dexterity') + val('Evasion'), 'Dexterity + Evasion')}
                {quick('clash-s', 'CLASH-S', val('Strength') + clash, 'Strength + Clash')}
                {quick('clash-sp', 'CLASH-SP', val('Special') + clash, 'Special + Clash')}
                <span title="Defence is Vitality">DEF <strong>{val('Vitality')}</strong></span>
                <span title="Special Defence is Insight">SP.DEF <strong>{val('Insight')}</strong></span>
                {!!pain && (
                    <span
                        className="tip-pain"
                        title={'At half HP or less every Skill, Accuracy and Damage roll loses a success; '
                            + 'at 1 HP it loses two. It comes off the successes, not the pool, and every roll '
                            + 'started from this panel already has it taken off — the struck-out dice in the '
                            + 'result are the ones it cost.'}
                    >
                        PAIN −{pain}
                    </span>
                )}
            </div>

            {act && (
                <div
                    className="tip-action"
                    title={`Each action in a round is harder than the last: the ${act.n}${ordSuffix(act.n)} `
                        + `needs ${need} ${need === 1 ? 'success' : 'successes'} to land. The Accuracy pool `
                        + 'itself does not change. Advancing the round resets it.'}
                >
                    Action <strong>{act.n}</strong> · needs{' '}
                    <strong>{need}</strong> {need === 1 ? 'success' : 'successes'}
                </div>
            )}

            {!moves.length ? (
                <div className="tip-empty">
                    No pinned moves. Pin them on this Pokémon's card and they show up here.
                </div>
            ) : moves.map((move, mi) => {
                const totals = computeMoveTotals(dex, sheet, move, itemByName);
                const tc = typeColors[move.Type] || '#e5e7eb';
                const cc = CAT_COLORS[move.Category || ''] || 'var(--text-secondary)';

                /* The Accuracy pool is the move's own and does not move with the
                   round; only the number of successes it has to make does. */
                const accTip = totals.accN == null ? 'This move has no Accuracy pool'
                    : act ? `Accuracy ${totals.acc} — needs ${need} `
                            + `${need === 1 ? 'success' : 'successes'} on action ${act.n}`
                          : `Accuracy ${totals.acc}`;
                const dmgTip = 'Damage ' + (totals.powN == null ? '—' : totals.powN)
                    + (totals.bonus.parts.length
                        ? ' (includes ' + totals.bonus.parts.map((b) => b.label + ' +' + b.value).join(', ') + ')'
                        : '');
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
                                    title={accTip + ' — click to roll'}
                                    onClick={() => doRoll(totals.accN!, {
                                        who, what: move.Name + ' accuracy', need, pain,
                                        /* carried so a hit can roll the damage in one
                                           more click, and a critical already boosted */
                                        dmg: (totals.powN ?? 0) > 0
                                            ? { token, mi, dice: totals.powN! } : null,
                                    })}
                                >
                                    ACC <strong>{accText}</strong>
                                </button>
                            ) : (
                                <span className="tip-pool acc" title={accTip}>ACC <strong>{accText}</strong></span>
                            )}
                            {(totals.powN ?? 0) > 0 ? (
                                <button
                                    className="tip-pool dmg"
                                    title={dmgTip + ' — click to roll'}
                                    onClick={() => doRoll(totals.powN!, {
                                        who, what: move.Name + ' damage', pain,
                                    })}
                                >
                                    DMG <strong>{totals.pow}</strong>
                                </button>
                            ) : (
                                <span className="tip-pool dmg" title={dmgTip}>
                                    DMG <strong>{totals.pow == null ? '—' : totals.pow}</strong>
                                </span>
                            )}
                            {totals.bonus.parts.map((b) => (
                                <span
                                    className="tip-bonus"
                                    key={b.label}
                                    title={b.label + ' adds ' + b.value + ' to the damage pool'}
                                >
                                    {b.label} +{b.value}
                                </span>
                            ))}
                        </div>
                        {move.Effect && <div className="tip-effect">{move.Effect}</div>}
                    </div>
                );
            })}
        </div>
    );
}
