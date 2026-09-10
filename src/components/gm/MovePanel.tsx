import { useEffect, useLayoutEffect, useRef } from 'react';
import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { CRIT_MARGIN } from '../../gm/constants';
import { HISTORY_LIMIT, roll } from '../../gm/dice';
import type { RollMeta } from '../../gm/dice';
import {
    ROLLABLE_QUICK, computeMoveTotals, ordSuffix, painFromHp, painPenalty, pinnedMoveObjects,
} from '../../gm/moves';
import { resolvePoolValue } from '../../gm/pools';
import {
    entityPool, entityRef, participantForToken, trainerIdAt, wildLiveSheet,
} from '../../gm/entities';
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

/* Initiative, evasion and the two clashes: the pools that belong to the
   CHARACTER rather than to a move, which is why a trainer has them just as a
   Pokemon does and why this is a component rather than a closure inside the
   Pokemon panel. `value` is the only thing that differs between the two — a
   species-backed sheet on one side, a flat trainer .json on the other — and
   EntityRef already hands both over behind the same signature.

   Defence and Special Defence ride along as plain numbers. They are what an
   attacker rolls against; there is no roll to make with them. */
function QuickRolls({ who, value, pain, doRoll }: {
    who: string;
    value: (n: string) => number;
    pain: number;
    doRoll: (dice: number, meta: RollMeta) => void;
}) {
    const clash = value('Clash');

    const chip = (key: string, label: string, dice: number, tip: string, what: string) => {
        const body = <>{label} <strong>{dice}</strong></>;
        if (!ROLLABLE_QUICK.includes(key) || dice <= 0) {
            return <span key={key} title={tip}>{body}</span>;
        }
        return (
            <button
                key={key}
                className="tip-roll"
                title={tip + ' — click to roll ' + dice + 'd6'}
                onClick={() => doRoll(dice, { who, what, pain })}
            >
                {body}
            </button>
        );
    };

    return (
        <>
            {chip('init', 'INIT', value('Dexterity') + value('Alert'),
                'Dexterity + Alert', 'Initiative')}
            {chip('eva', 'EVA', value('Dexterity') + value('Evasion'),
                'Dexterity + Evasion', 'Evasion')}
            {chip('clash-s', 'CLASH-S', value('Strength') + clash,
                'Strength + Clash', 'Clash (Strength)')}
            {chip('clash-sp', 'CLASH-SP', value('Special') + clash,
                'Special + Clash', 'Clash (Special)')}
            <span title="Defence is Vitality">DEF <strong>{value('Vitality')}</strong></span>
            <span title="Special Defence is Insight">SP.DEF <strong>{value('Insight')}</strong></span>
        </>
    );
}

/* The pain badge, shown by both panels on the same terms. */
function PainChip({ pain }: { pain: number }) {
    if (!pain) return null;
    return (
        <span
            className="tip-pain"
            title={'At half HP or less every Skill, Accuracy and Damage roll loses a success; '
                + 'at 1 HP it loses two. It comes off the successes, not the pool, and every roll '
                + 'started from this panel already has it taken off — the struck-out dice in the '
                + 'result are the ones it cost.'}
        >
            PAIN −{pain}
        </span>
    );
}

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

    if (!token) return <div className="mon-tooltip" id="mon-tooltip" style={{ display: 'none' }} />;

    const doRoll = (dice: number, meta: RollMeta) => {
        /* An empty pool is not a roll of one die — the same rule the ailment
           rolls follow. */
        if (!(dice > 0)) return;
        store.update((s) => {
            const entry = roll(dice, 6, meta, CRIT_MARGIN);
            s.dice = { count: dice, sides: 6, history: [entry, ...s.dice.history].slice(0, HISTORY_LIMIT) };
        });
    };

    /* A trainer gets the same panel minus the half of it that is about moves:
       they have no learnset and no pinned list, but Initiative, Evasion and the
       two Clashes are theirs exactly as they are a Pokemon's, off the same
       attributes and skills. Resolved through EntityRef, which already reads a
       trainer's flat .json and a Pokemon's species-backed sheet the same way. */
    const asTrainer = entityRef(state, dexById, token);
    if (asTrainer && asTrainer.kind === 'trainer') {
        const hp = entityPool(asTrainer, 'hp');
        const tPain = hp ? painFromHp(hp.cur, hp.max) : 0;
        const tPart = participantForToken(state, dexById, token);
        const tAct = tPart ? Math.max(1, (tPart.acted as number) || 0) : null;
        return (
            <div className="mon-tooltip" id="mon-tooltip" ref={ref} style={{ display: 'block' }}>
                <button className="tip-close" title="Close" onClick={onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </button>
                <div className="tip-head">{asTrainer.name}</div>
                <div className="tip-sub">
                    Trainer{asTrainer.rank ? ' · ' + asTrainer.rank : ''}
                </div>
                <div className="tip-quick">
                    <QuickRolls
                        who={asTrainer.name}
                        value={asTrainer.value}
                        pain={tPain}
                        doRoll={doRoll}
                    />
                    <PainChip pain={tPain} />
                </div>
                {tAct && (
                    <div
                        className="tip-action"
                        title={`Each action in a round is harder than the last: the ${tAct}${ordSuffix(tAct)} `
                            + `needs ${tAct} ${tAct === 1 ? 'success' : 'successes'} to land. Advancing `
                            + 'the round resets it.'}
                    >
                        Action <strong>{tAct}</strong> · needs{' '}
                        <strong>{tAct}</strong> {tAct === 1 ? 'success' : 'successes'}
                    </div>
                )}
                <div className="tip-empty">
                    A trainer has no move list. Their Pokémon carry theirs — open one from the
                    roster or from the combat tracker.
                </div>
            </div>
        );
    }

    if (!target) return <div className="mon-tooltip" id="mon-tooltip" style={{ display: 'none' }} />;

    const dex = dexById(target.dexId);
    const sheet = target.sheet;

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
                <QuickRolls who={who} value={val} pain={pain} doRoll={doRoll} />
                <PainChip pain={pain} />
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
