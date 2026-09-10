import { useEffect, useState } from 'react';
import { Panel } from './Panel';
import { StatusChips } from './StatusChips';
import { GmSprite } from './GmSprite';
import { useGm } from '../../gm/GmContext';
import { useGmConfirm } from './ConfirmDialog';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { uid } from '../../gm/state';
import { useFlash } from '../../gm/useFlash';
import { defaultStatus, ailmentByKey } from '../../gm/ailments';
import {
    MAX_ACTIONS, initOffset, roundFlags, syncRoundState,
} from '../../gm/combat';
import {
    adjustPool, entityPool, entityRef, participantToken as sharedParticipantToken, resolveToken, writeStatus,
} from '../../gm/entities';
import { PoolBar } from './RosterBits';
import type { GmCombatant } from '../../gm/types';
import type { PokedexEntry } from '../../data/types';

/* The combat tracker: initiative, five actions each, the status strip and the
   round-start flags that say what an ailment is about to cost. */

export function CombatPanel({ onReorder, onOpenTip, cycleStatus }: {
    onReorder: (from: string, to: string) => void;
    onOpenTip: (token: string) => void;
    cycleStatus: (token: string, key: string, e: React.MouseEvent) => void;
}) {
    const { state, store } = useGm();
    const { data } = useAppData();
    const confirm = useGmConfirm();
    const toast = useToast();
    const [draft, setDraft] = useState('');
    /* Same acknowledgement the roster and the notes give: the initiative list
       is the one place a mis-press is most costly to spot, since every row is
       the same shape and the order is the whole point of the panel. Flashed by
       pid, which is the row's own identity and survives the reorder. */
    const [moved, flash] = useFlash();

    const dexById = (id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null;

    const parts = state.combat.participants;
    const round = state.combat.round;

    const participantToken = (p: GmCombatant): string => sharedParticipantToken(state, dexById, p);

    /* First sight of a climbing ailment records the Round it landed on; that has
       to survive a reload or its damage restarts at base. */
    useEffect(() => {
        let changed = false;
        parts.forEach((p) => {
            const ref = entityRef(state, dexById, participantToken(p));
            if (syncRoundState(p, ref ? ref.status : defaultStatus(), round)) changed = true;
        });
        if (changed) store.save();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parts, round]);

    const addParticipant = (part: Partial<GmCombatant>) => store.update((s) => {
        s.combat = {
            ...s.combat,
            participants: [...s.combat.participants, Object.assign({
                /* `src` points back at the roster entry this came from, so the
                   move tooltip works on a combat row too; it is a plain token
                   and goes stale harmlessly if the roster is rearranged. */
                pid: uid(), label: '?', kind: 'custom', dexId: null, src: null, init: null, acted: 0,
            }, part) as GmCombatant],
        };
    });

    const patch = (pid: string, fn: (p: GmCombatant) => GmCombatant) => store.update((s) => {
        s.combat = {
            ...s.combat,
            participants: s.combat.participants.map((p) =>
                (p as unknown as Record<string, string>).pid === pid ? fn(p) : p),
        };
    });

    /* Same gesture as the roster's bars, writing to the same sheets: a combat
       row and a roster row for one Pokemon are two views of one pool, and
       either updates the other. Shift for five, so a big hit is one click. */
    const stepPool = (token: string) => (key: 'hp' | 'will', delta: number, e: React.MouseEvent) => {
        e.stopPropagation();
        adjustPool(state, dexById, token, key, e.shiftKey ? delta * 5 : delta, () => store.save());
        store.refresh();
    };

    const applyRoundDamage = (token: string, ailKey: string, dmg: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!(dmg > 0)) return;
        const ref = entityRef(state, dexById, token);
        if (!ref || ref.kind === 'custom') return;

        adjustPool(state, dexById, token, 'hp', -dmg, () => store.save());
        const want = resolveToken(state, token);
        const p = parts.find((x) => resolveToken(state, participantToken(x)) === want);
        if (p) {
            const rec = p as unknown as Record<string, Record<string, number>>;
            if (!rec.dealt) rec.dealt = {};
            rec.dealt[ailKey] = round;
        }
        store.refresh();
        store.save();
        const a = ailmentByKey(ailKey);
        toast('<i class="fa-solid fa-heart-crack"></i> ' + escapeHtml(ref.name)
            + ' takes <strong>' + dmg + '</strong> from ' + escapeHtml(a ? a.name : 'the ailment'));
    };

    return (
        <Panel
            panelKey="combat"
            icon="fa-khanda"
            title="Combat"
            onReorder={onReorder}
            actions={
                <>
                    <span className="round-pill" title="Current round">
                        <i className="fa-solid fa-rotate"></i> Round <span id="round-num">{round}</span>
                    </span>
                    <button
                        className="icon-btn"
                        title="Sort by initiative, highest first"
                        onClick={() => store.update((s) => {
                            /* Highest roll first; blank initiatives sink to the
                               bottom. Sort is kept stable so equal rolls keep
                               their manual order. On the effective roll, not the
                               typed one: a paralysed combatant acts 2 lower and
                               belongs 2 lower in the order. */
                            const eff = (p: GmCombatant) => {
                                const init = (p as unknown as Record<string, number | null>).init;
                                if (init == null) return -Infinity;
                                const ref = entityRef(s, dexById, participantToken(p));
                                return init + initOffset(ref ? ref.status : null);
                            };
                            const keyed = s.combat.participants.map((p, i) => ({ p, i }));
                            keyed.sort((a, b) => eff(b.p) - eff(a.p) || a.i - b.i);
                            s.combat = { ...s.combat, participants: keyed.map((k) => k.p) };
                        })}
                    >
                        <i className="fa-solid fa-arrow-down-wide-short"></i>
                    </button>
                    <button
                        className="icon-btn accent"
                        title="Advance to the next round (resets everyone's actions)"
                        onClick={async () => {
                            const next = round + 1;
                            const go = await confirm({
                                icon: 'fa-forward-step', confirmLabel: 'Advance',
                                title: 'Advance to round ' + next + '?',
                                text: "Everyone's actions reset to 0 / " + MAX_ACTIONS + '.',
                            });
                            if (!go) return;
                            /* Flinch lasts "until the end of the subject's next
                               turn", so the Round boundary is exactly where it
                               expires. Cleared on the subject itself, so it
                               clears on the Pokémon's card too. */
                            parts.forEach((p) => {
                                const token = participantToken(p);
                                const ref = entityRef(state, dexById, token);
                                if (ref && ref.status.flinch) {
                                    writeStatus(state, token, (st) => { st.flinch = false; }, () => store.save());
                                }
                            });
                            store.update((s) => {
                                s.combat = {
                                    round: next,
                                    participants: s.combat.participants.map((p) => ({ ...p, acted: 0 })),
                                };
                            });
                        }}
                    >
                        <i className="fa-solid fa-forward-step"></i>
                    </button>
                    <button
                        className="icon-btn danger"
                        title="End combat: clear all combatants"
                        onClick={async () => {
                            if (!parts.length && round === 1) return;
                            const go = await confirm({
                                icon: 'fa-flag-checkered', danger: true, confirmLabel: 'End combat',
                                title: 'End combat?',
                                text: 'Every combatant is cleared and the round counter goes back to 1.',
                            });
                            if (!go) return;
                            store.update((s) => { s.combat = { round: 1, participants: [] }; });
                        }}
                    >
                        <i className="fa-solid fa-flag-checkered"></i>
                    </button>
                </>
            }
        >
            <div className="panel-body">
                <div className="muted">
                    Each combatant has <strong>{MAX_ACTIONS} actions</strong> per round — click the pips
                    to track them. Enter each one's initiative roll by hand.
                </div>
                <div id="combat-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {!parts.length ? (
                        <div className="empty-note">
                            No combatants yet. Add them from the roster
                            (<i className="fa-solid fa-khanda"></i>) or by name below.
                        </div>
                    ) : parts.map((p, idx) => (
                        <CombatRow
                            key={(p as unknown as Record<string, string>).pid}
                            p={p}
                            moved={moved === (p as unknown as Record<string, string>).pid}
                            idx={idx}
                            total={parts.length}
                            round={round}
                            token={resolveToken(state, participantToken(p)) || participantToken(p)}
                            dexById={dexById}
                            onPip={(i) => patch((p as unknown as Record<string, string>).pid, (x) => ({
                                ...x, acted: ((x.acted || 0) === i + 1) ? i : i + 1,
                            }))}
                            onInit={(v) => patch((p as unknown as Record<string, string>).pid, (x) => {
                                const n = parseInt(v, 10);
                                return { ...x, init: isNaN(n) ? undefined : n };
                            })}
                            onMove={(dir) => {
                                flash((p as unknown as Record<string, string>).pid);
                                store.update((s) => {
                                    const list = s.combat.participants.slice();
                                    const j = idx + dir;
                                    if (j < 0 || j >= list.length) return;
                                    [list[idx], list[j]] = [list[j], list[idx]];
                                    s.combat = { ...s.combat, participants: list };
                                });
                            }}
                            onRemove={() => store.update((s) => {
                                s.combat = {
                                    ...s.combat,
                                    participants: s.combat.participants.filter(
                                        (x) => (x as unknown as Record<string, string>).pid
                                            !== (p as unknown as Record<string, string>).pid),
                                };
                            })}
                            onOpenTip={onOpenTip}
                            cycleStatus={cycleStatus}
                            onDeal={applyRoundDamage}
                            onPool={stepPool(resolveToken(state, participantToken(p)) || participantToken(p))}
                        />
                    ))}
                </div>
                <div className="add-row">
                    <input
                        type="text" id="combat-add-name" placeholder="Add combatant by name…"
                        value={draft}
                        onChange={(e) => setDraft(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const name = draft.trim();
                            if (!name) return;
                            setDraft('');
                            addParticipant({ label: name, kind: 'custom' });
                        }}
                    />
                    <button
                        onClick={() => {
                            const name = draft.trim();
                            if (!name) return;
                            setDraft('');
                            addParticipant({ label: name, kind: 'custom' });
                        }}
                    >
                        <i className="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
        </Panel>
    );
}

function CombatRow({ p, moved, idx, total, round, token, dexById, onPip, onInit, onMove, onRemove, onOpenTip, cycleStatus, onDeal, onPool }: {
    p: GmCombatant;
    /** True for the moment after an up/down press landed on this row. */
    moved: boolean;
    idx: number;
    total: number;
    round: number;
    token: string;
    dexById: (id: string) => PokedexEntry | null;
    onPip: (i: number) => void;
    onInit: (v: string) => void;
    onMove: (dir: number) => void;
    onRemove: () => void;
    onOpenTip: (token: string) => void;
    cycleStatus: (token: string, key: string, e: React.MouseEvent) => void;
    onDeal: (token: string, ailKey: string, dmg: number, e: React.MouseEvent) => void;
    onPool: (key: 'hp' | 'will', delta: number, e: React.MouseEvent) => void;
}) {
    const { state } = useGm();
    const rec = p as unknown as Record<string, unknown>;
    const ref = entityRef(state, dexById, token);
    const status = ref ? ref.status : defaultStatus();
    const acted = (p.acted as number) || 0;
    const init = rec.init as number | null | undefined;
    const dexId = rec.dexId as string | null;

    const hp = ref ? entityPool(ref, 'hp') : null;
    const will = ref ? entityPool(ref, 'will') : null;

    const mod = initOffset(status);
    /* The field carries the shifted number, because that is the one the order is
       read from; the roll itself is put back the moment it is focused. */
    const shifted = !!mod && init != null;
    const [editing, setEditing] = useState(false);
    const shown = init == null ? '' : String(editing ? init : init + mod);
    const flags = ref ? roundFlags(ref, p, round) : [];
    const kindIcon = rec.kind === 'trainer' ? 'fa-user'
        : rec.kind === 'custom' ? 'fa-masks-theater' : null;

    return (
        <div
            className={'combat-row ' + (acted >= MAX_ACTIONS ? 'spent' : '') + (moved ? ' just-moved' : '')}
            data-tip={rec.kind !== 'trainer' && ref ? token : undefined}
        >
            {dexId
                ? <GmSprite dex={dexById(dexId)} dexId={dexId} className="c-sprite" />
                : <i className={'fa-solid ' + kindIcon + ' c-icon'}></i>}
            {/* Everything but the sprite and the round flags stacks inside
                here, in three bands that each get the row's full width:
                name + initiative, the pools, then the action strip. The
                previous single flex line put all of them side by side, and
                a pool bar cannot shrink below its own min-content — so the
                moment the panel was narrower than about 550px the bars
                spilled out over the initiative field and the pips. */}
            <div className="c-main">
                <div className="c-head">
                    <div className="c-name" title={String(rec.label || '')}>{String(rec.label || '')}</div>
                    <label className="c-init-wrap">
                        <span className="init-label">Init</span>
                        <input
                            type="number"
                            className={'c-init ' + (shifted && !editing ? 'shifted' : '')}
                            value={shown}
                            title={shifted && !editing
                                ? `Rolled ${init}, ${mod} from paralysis: 2 points off Dexterity, and so off Initiative`
                                : undefined}
                            onFocus={() => setEditing(true)}
                            onBlur={() => setEditing(false)}
                            onChange={(e) => onInit(e.currentTarget.value)}
                        />
                    </label>
                </div>
                {/* Absent for a hand-typed combatant, which has no sheet behind
                    it to hold a pool. */}
                {hp && will && (
                    <div className="pool-bars c-pools">
                        <PoolBar tag="HP" cls="hp" cur={hp.cur} max={hp.max}
                            onStep={(d, e) => onPool('hp', d, e)} />
                        <PoolBar tag="WILL" cls="will" cur={will.cur} max={will.max}
                            onStep={(d, e) => onPool('will', d, e)} />
                    </div>
                )}
                <div className="c-strip">
                    {ref && (
                        <StatusChips
                            status={status}
                            twoRows
                            onCycle={(key, e) => cycleStatus(token, key, e)}
                        />
                    )}
                    <div className="pips">
                        {Array.from({ length: MAX_ACTIONS }, (_, i) => (
                            <span
                                key={i}
                                className={'pip ' + (i < acted ? 'used' : '')}
                                title={acted + '/' + MAX_ACTIONS + ' actions used'}
                                onClick={() => onPip(i)}
                            />
                        ))}
                    </div>
                </div>
                {/* A grid area of its own, so the stylesheet can put it beside
                    the strip on a mouse-sized row and up beside the name on a
                    finger-sized one, without the DOM changing under React. */}
                <div className="c-actions">
                    <div className="c-move">
                        <button disabled={idx === 0} title="Move up" onClick={() => onMove(-1)}>
                            <i className="fa-solid fa-chevron-up"></i>
                        </button>
                        <button disabled={idx === total - 1} title="Move down" onClick={() => onMove(1)}>
                            <i className="fa-solid fa-chevron-down"></i>
                        </button>
                    </div>
                    {/* A trainer used to be the one row without this: the panel
                        had nothing to show them, being built around a move
                        list. It now carries their Initiative, Evasion and Clash
                        pools, so they get the button — with the glyph and the
                        wording that say so, because a trainer still has no
                        moves of their own. */}
                    {ref && (
                        <button
                            className="c-tip tip-btn"
                            data-tip-for={token}
                            title={rec.kind === 'trainer'
                                ? 'Initiative, evasion and clash rolls'
                                : 'Pinned moves, accuracy and damage'}
                            onClick={() => onOpenTip(token)}
                        >
                            <i className={'fa-solid '
                                + (rec.kind === 'trainer' ? 'fa-dice-d6' : 'fa-list-ul')}></i>
                        </button>
                    )}
                    <button className="c-remove danger" title="Remove from combat" onClick={onRemove}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            {!!flags.length && (
                <div className="round-flags">
                    {flags.map((f) => {
                        /* Damage is dealt off a real HP pool, so a hand-typed
                           combatant gets the reminder but no button */
                        const canDeal = f.damage > 0 && ref!.kind !== 'custom';
                        const dealtMap = rec.dealt as Record<string, number> | undefined;
                        const dealt = !!(dealtMap && dealtMap[f.ail.key] === round);
                        return (
                            <span
                                key={f.ail.key}
                                className={'round-flag ' + (dealt ? 'dealt' : '')}
                                data-token={token}
                                data-ail={f.ail.key}
                                data-dmg={f.damage}
                                style={{
                                    borderColor: f.ail.color,
                                    color: f.ail.color,
                                    background: f.ail.color + '1a',
                                }}
                                title={f.ail.name + (f.damage
                                    ? ` · deal ${f.damage} damage at the end of this Round`
                                      + (dealt ? ' (already dealt)' : '') : '')}
                            >
                                <i className={'fa-solid ' + f.ail.icon}></i>{f.ail.name}
                                {!!f.damage && <span className="dmg">−{f.damage} HP</span>}
                                {canDeal && (
                                    <button
                                        className="dmg-apply"
                                        title={dealt
                                            ? 'Already dealt this Round — click to deal it again'
                                            : 'Deal ' + f.damage + ' damage to ' + ref!.name}
                                        onClick={(e) => onDeal(token, f.ail.key, f.damage, e)}
                                    >
                                        <i className={'fa-solid ' + (dealt ? 'fa-check' : 'fa-heart-crack')}></i>
                                        {f.damage}
                                    </button>
                                )}
                                {f.roll && f.roll.dice > 0 && (
                                    <i className="fa-solid fa-dice" style={{ opacity: 0.7 }}></i>
                                )}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
