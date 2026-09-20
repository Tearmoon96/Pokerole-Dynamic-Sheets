import { useEffect, useState } from 'react';
import { Panel } from './Panel';
import { StatusChips } from './StatusChips';
import { GmSprite } from './GmSprite';
import { useGm } from '../../gm/GmContext';
import { useGmConfirm } from './ConfirmDialog';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { newCombat, uid } from '../../gm/state';
import { combatPanelKey } from '../../gm/constants';
import { useFlash } from '../../gm/useFlash';
import { defaultStatus, ailmentByKey } from '../../gm/ailments';
import {
    MAX_ACTIONS, initOffset, roundFlags, syncRoundState,
} from '../../gm/combat';
import {
    adjustPool, entityPool, entityRef, participantToken as sharedParticipantToken, resolveToken, writeStatus,
} from '../../gm/entities';
import { PoolBar } from './RosterBits';
import type { GmCombat, GmCombatant } from '../../gm/types';
import type { PokedexEntry } from '../../data/types';

/* The combat tracker: initiative, five actions each, the status strip and the
   round-start flags that say what an ailment is about to cost.

   One of these per fight. A party that splits up is running two initiative
   orders and two round counters at once, so each gets its own board panel with
   its own head and its own name, rather than one tracker the GM has to empty
   and refill on every cut between the two. `combat` is the fight this panel
   shows; every write goes through `mutate`, which finds it again by gid. */

export function CombatPanel({ combat, onReorder, onOpenTip, cycleStatus }: {
    combat: GmCombat;
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

    const gid = combat.gid;
    const parts = combat.participants;
    const round = combat.round;
    const many = state.combats.length > 1;
    const focused = state.combatFocus === gid;

    /* Every write this panel makes lands on ITS fight and no other. The gid is
       looked up again inside the update rather than closed over as an index,
       so a fight removed from another panel in between cannot make this one
       write to its neighbour. */
    const mutate = (fn: (c: GmCombat) => GmCombat) => store.update((s) => {
        s.combats = s.combats.map((c) => (c.gid === gid ? fn(c) : c));
    });

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

    const addParticipant = (part: Partial<GmCombatant>) => mutate((c) => ({
        ...c,
        participants: [...c.participants, Object.assign({
            /* `src` points back at the roster entry this came from, so the
               move tooltip works on a combat row too; it is a plain token
               and goes stale harmlessly if the roster is rearranged. */
            pid: uid(), label: '?', kind: 'custom', dexId: null, src: null, init: null, acted: 0,
        }, part) as GmCombatant],
    }));

    const patch = (pid: string, fn: (p: GmCombatant) => GmCombatant) => mutate((c) => ({
        ...c,
        participants: c.participants.map((p) =>
            (p as unknown as Record<string, string>).pid === pid ? fn(p) : p),
    }));

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

    /* A second fight lands directly after this one on the board rather than
       past the notes at the far right: two simultaneous fights read as a pair,
       and the GM who just asked for one is looking here. */
    const addCombat = () => store.update((s) => {
        const made = newCombat('Combat ' + (s.combats.length + 1));
        s.combats = [...s.combats, made];
        s.combatFocus = made.gid;
        const order = s.layout.order.slice();
        const at = order.indexOf(combatPanelKey(gid));
        order.splice(at < 0 ? order.length : at + 1, 0, combatPanelKey(made.gid));
        s.layout = { ...s.layout, order };
    });

    const removeCombat = async () => {
        const go = await confirm({
            icon: 'fa-trash', danger: true, confirmLabel: 'Remove',
            title: 'Remove ' + (combat.name || 'this combat') + '?',
            text: parts.length
                ? 'Its ' + parts.length + (parts.length === 1 ? ' combatant goes' : ' combatants go')
                  + ' with it. The roster and their sheets are untouched.'
                : 'The panel goes off the board.',
        });
        if (!go) return;
        store.update((s) => {
            /* The board always offers a tracker: the last one is emptied by
               the flag button, never removed, and its Remove is not rendered. */
            if (s.combats.length < 2) return;
            const key = combatPanelKey(gid);
            s.combats = s.combats.filter((c) => c.gid !== gid);
            if (!s.combats.some((c) => c.gid === s.combatFocus)) s.combatFocus = s.combats[0].gid;
            const widths = { ...s.layout.widths };
            delete widths[key];
            s.layout = {
                order: s.layout.order.filter((k) => k !== key),
                hidden: s.layout.hidden.filter((k) => k !== key),
                widths,
            };
        });
    };

    return (
        <Panel
            panelKey={combatPanelKey(gid)}
            kind="combat"
            icon="fa-khanda"
            title={
                <input
                    className="panel-title-edit"
                    value={combat.name}
                    title="Rename this combat"
                    aria-label="Combat name"
                    onChange={(e) => {
                        const name = e.currentTarget.value;
                        mutate((c) => ({ ...c, name }));
                    }}
                />
            }
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
                            s.combats = s.combats.map((c) => {
                                if (c.gid !== gid) return c;
                                const keyed = c.participants.map((p, i) => ({ p, i }));
                                keyed.sort((a, b) => eff(b.p) - eff(a.p) || a.i - b.i);
                                return { ...c, participants: keyed.map((k) => k.p) };
                            });
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
                                text: "Everyone's actions reset to 0 / " + MAX_ACTIONS
                                    + ', and the clash and evasion marks are cleared.',
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
                            /* Clash and Evasion are once per Round each, so the
                               Round boundary is what clears their marks — the
                               same boundary and the same gesture as the action
                               pips going back to zero. */
                            mutate((c) => ({
                                ...c,
                                round: next,
                                participants: c.participants.map((p) => ({
                                    ...p, acted: 0, usedClash: false, usedEva: false,
                                })),
                            }));
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
                            mutate((c) => ({ ...c, round: 1, participants: [] }));
                        }}
                    >
                        <i className="fa-solid fa-flag-checkered"></i>
                    </button>
                    {/* Which fight the roster's join buttons drop into. Only
                        worth a control once there are two of them to choose
                        between — with one, every addition can only go here. */}
                    {many && (
                        <button
                            className={'icon-btn' + (focused ? ' accent' : '')}
                            aria-pressed={focused}
                            title={focused
                                ? 'The roster adds to this fight'
                                : 'Send the roster\u2019s join buttons to this fight'}
                            onClick={() => store.update((s) => { s.combatFocus = gid; })}
                        >
                            <i className="fa-solid fa-crosshairs"></i>
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        title="Add a second fight: another tracker beside this one, with its own round"
                        onClick={addCombat}
                    >
                        <i className="fa-solid fa-plus"></i>
                    </button>
                    {many && (
                        <button
                            className="icon-btn danger"
                            title="Remove this fight from the board"
                            onClick={() => { void removeCombat(); }}
                        >
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    )}
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
                            onUsed={(key) => patch((p as unknown as Record<string, string>).pid,
                                (x) => ({ ...x, [key]: !x[key] }))}
                            onMove={(dir) => {
                                flash((p as unknown as Record<string, string>).pid);
                                mutate((c) => {
                                    const list = c.participants.slice();
                                    const j = idx + dir;
                                    if (j < 0 || j >= list.length) return c;
                                    [list[idx], list[j]] = [list[j], list[idx]];
                                    return { ...c, participants: list };
                                });
                            }}
                            onRemove={() => mutate((c) => ({
                                ...c,
                                participants: c.participants.filter(
                                    (x) => (x as unknown as Record<string, string>).pid
                                        !== (p as unknown as Record<string, string>).pid),
                            }))}
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

/* Clash and Evasion are once per Round each — and one Clash, whether it was
   rolled off Strength or off Special — so what the row needs is a mark, not a
   counter. Kept here beside the component that draws them so a third one is
   added in one place. */
const USED_MARKS: { key: 'usedClash' | 'usedEva'; label: string; icon: string; tip: string }[] = [
    {
        key: 'usedClash', label: 'CLASH', icon: 'fa-hand-fist',
        tip: 'Clash — once per Round, whichever of the two pools it was rolled off. '
            + 'Click when it is used; advancing the Round clears it.',
    },
    {
        key: 'usedEva', label: 'EVA', icon: 'fa-person-running',
        tip: 'Evasion — once per Round. Click when it is used; advancing the Round clears it.',
    },
];

function CombatRow({ p, moved, idx, total, round, token, dexById, onPip, onInit, onUsed, onMove, onRemove, onOpenTip, cycleStatus, onDeal, onPool }: {
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
    onUsed: (key: 'usedClash' | 'usedEva') => void;
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
                    {/* Not pips: an action is one of five and reads as a
                        count, while these two are each a yes or a no and a
                        row of one pip would say nothing. A hand-typed
                        combatant gets them as well — an NPC with no sheet
                        behind it still clashes once a Round. */}
                    <div className="c-used">
                        {USED_MARKS.map((m) => {
                            const on = !!p[m.key];
                            return (
                                <button
                                    key={m.key}
                                    className={'used-mark' + (on ? ' on' : '')}
                                    aria-pressed={on}
                                    title={m.tip + (on ? ' — used this Round.' : '')}
                                    onClick={() => onUsed(m.key)}
                                >
                                    <i className={'fa-solid ' + m.icon}></i>{m.label}
                                </button>
                            );
                        })}
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
