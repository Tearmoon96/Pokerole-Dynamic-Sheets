/* The player's own trainer and team, with the GM screen's quick rolls.

   Built from the roster's own pieces (src/components/gm/RosterBits.tsx and the
   move panel's MoveTip.tsx), on the sheets in this browser's working set — see
   src/table/character.ts. Every roll goes to the GM as a request, like the dice
   controls' own, so the whole table sees it in the feed.

   The species, moves and items behind the pools are the app's dataset, which
   this page otherwise never loads: it is fetched here, once, the first time the
   panel is shown, so joining a table stays instant. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTable } from '../../table/TableContext';
import { AppDataProvider, useAppData } from '../../data/AppDataContext';
import { loadAppData } from '../../data/loadAppData';
import type { AppData, PokedexEntry } from '../../data/types';
import { FoldTitle, useFold } from './Fold';
import { MonRow, PoolBar } from '../gm/RosterBits';
import { StatusChips } from '../gm/StatusChips';
import { MonTipBody, MoveTipShell, TrainerTipBody, useTipButtonState } from '../gm/MoveTip';
import type { DoRoll, QuickSpent } from '../gm/MoveTip';
import { normalizeStatus } from '../../gm/ailments';
import { adjustPool, cycleStatus, entityPool, entityRef, monShownName } from '../../gm/entities';
import type { GmState } from '../../gm/types';
import type { CharKey } from '../../table/slim';
import { painFromHp, painPenalty } from '../../gm/moves';
import { resolvePoolValue, trainerPoolMax } from '../../gm/pools';
import { upsertWorkingTrainer, workingTrainerData } from '../../gm/workingSet';
import { normalizeState } from '../../state/normalize';
import { TRAINER_MARKER } from '../../state/constants';
import { teamCardUrl } from '../../lib/navigation';
import {
    TRAINER_TOKEN, chooseTrainer, chosenTrainerId, monToken, useSoloState, useWorkingSet, workingTrainers,
} from '../../table/character';
import type { CardSheet } from '../../card/types';

/** What the fight knows about one of this player's characters: its combatant
    id, the action it is on and the once-a-Round rolls already made. */
interface Seat {
    id: string;
    act: number;
    spent: QuickSpent;
}

export function CharacterPanel() {
    const [open, toggle] = useFold('character');
    const [data, setData] = useState<AppData | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let live = true;
        loadAppData()
            .then((d) => { if (live) setData(d); })
            .catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, []);

    return (
        <div className="character-panel">
            <FoldTitle id="character" open={open} onToggle={toggle} icon="fa-id-card">
                My character
            </FoldTitle>
            {open && (
                data ? (
                    <AppDataProvider data={data}>
                        <CharacterBody />
                    </AppDataProvider>
                ) : (
                    <p className="muted">
                        {failed
                            ? 'The species and move data could not be loaded. Reload the page to try again.'
                            : <><i className="fa-solid fa-circle-notch fa-spin"></i> Loading your sheets…</>}
                    </p>
                )
            )}
        </div>
    );
}

function CharacterBody() {
    const { session, state } = useTable();
    const { data } = useAppData();
    const [, refresh] = useWorkingSet();
    const [tip, setTip] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(() => chosenTrainerId());
    const fileRef = useRef<HTMLInputElement>(null);
    const [loadNote, setLoadNote] = useState('');
    useTipButtonState(tip);

    const list = workingTrainers();
    /* A choice that has left the working set — deleted on the License — falls
       back to whatever chosenTrainerId would pick now. */
    const trainerId = picked && list.some((t) => t.id === picked) ? picked : chosenTrainerId();
    const solo = useSoloState(trainerId);
    const t = trainerId ? workingTrainerData(trainerId) : null;

    const dexById = useCallback((id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null, [data.pokemon]);
    const closeTip = useCallback(() => setTip(null), []);

    const loadFile = async (file: File) => {
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(await file.text()); }
        catch { setLoadNote('That file is not a trainer .json.'); return; }
        const looksTrainer = parsed && parsed.id && parsed.stats && Array.isArray(parsed.team);
        if (!parsed || !(parsed[TRAINER_MARKER] || looksTrainer)) {
            setLoadNote('That file is not a trainer .json.');
            return;
        }
        const state = normalizeState(parsed);
        const res = upsertWorkingTrainer(state);
        if (res === 'quota') { setLoadNote('Browser storage is full; the trainer could not be loaded.'); return; }
        setLoadNote(res === 'exists' ? (state.name || 'That trainer') + ' was already here: showing that copy.' : '');
        chooseTrainer(state.id);
        setPicked(state.id);
        refresh();
    };

    const loader = (
        <>
            <button className="icon-btn" title="Load a trainer .json into this browser"
                onClick={() => fileRef.current?.click()}>
                <i className="fa-solid fa-file-import"></i>
            </button>
            <input
                ref={fileRef} type="file" accept=".json,application/json" hidden
                onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (f) void loadFile(f);
                }}
            />
        </>
    );

    if (!t || !solo || !trainerId) {
        return (
            <div className="character-empty">
                <p className="muted">
                    No trainer in this browser yet. Open your sheet on the Trainer License
                    of this same site, or load its .json here.
                </p>
                <div className="character-pick">{loader}</div>
                {loadNote && <p className="muted">{loadNote}</p>}
            </div>
        );
    }

    const step = (token: string) => (key: 'hp' | 'will', delta: number, e: React.MouseEvent) => {
        e.stopPropagation();
        adjustPool(solo, dexById, token, key, e.shiftKey ? delta * 5 : delta, () => {});
        refresh();
    };
    const onCycle = (token: string) => (key: string, e: React.MouseEvent) => {
        e.stopPropagation();
        cycleStatus(solo, dexById, token, key, () => {});
        refresh();
    };

    /* Where a character stands in the fight on the table, if it is in it. */
    const turns = session.combat.view.turns;
    const seat = (token: string): Seat | null => {
        const key = session.combat.keyFor(trainerId, token);
        const e = key && turns ? turns.order.find((x) => x.own === state.myId && x.ck === key) : null;
        if (!e) return null;
        const acted = e.acted ?? 0;
        return { id: e.id, act: Math.max(1, acted), spent: { eva: !!e.eva || acted >= 5, clash: !!e.clash || acted >= 5 } };
    };

    /* A roll from a sheet: the GM rolls it and the feed says whose and what
       for. In the fight, an Evasion or a Clash also spends an action. */
    const rollFrom = (token: string): DoRoll => (dice, meta, quick) => {
        if (!(dice > 0)) return;
        const note = [meta.who, meta.what].filter(Boolean).join(' · ');
        session.rollFor(dice, 6, note, {
            bonus: meta.bonus ?? undefined,
            pain: meta.pain || undefined,
            need: meta.need ?? undefined,
        });
        const s = seat(token);
        if (quick && s) session.combat.act(quick, s.id);
    };

    const team = (Array.isArray(t.team) ? t.team : [])
        .map((slot, idx) => ({ slot, idx }))
        .filter((x) => x.slot && x.slot.dexId);

    const tipBody = (() => {
        if (!tip) return null;
        const ref = entityRef(solo, dexById, tip);
        if (!ref) return null;
        const s = seat(tip);
        if (ref.kind === 'trainer') {
            const hp = entityPool(ref, 'hp');
            return (
                <TrainerTipBody
                    name={ref.name} rank={ref.rank} value={ref.value}
                    pain={hp ? painFromHp(hp.cur, hp.max) : 0}
                    act={s ? s.act : null} spent={s?.spent} doRoll={rollFrom(tip)} noInit
                />
            );
        }
        if (!ref.dex || !ref.sheet) return <div className="tip-empty">Species data unavailable.</div>;
        const dex = ref.dex, sheet = ref.sheet;
        return (
            <MonTipBody
                token={tip} dex={dex} sheet={sheet} who={ref.name} owner={t.name || ''}
                value={(n) => resolvePoolValue(dex, sheet, n) || 0}
                pain={painPenalty(dex, sheet)}
                act={s ? s.act : null} spent={s?.spent} doRoll={rollFrom(tip)} noInit
            />
        );
    })();

    return (
        <>
            {list.length > 1 && (
                <div className="character-pick">
                    <select
                        aria-label="Which trainer you play"
                        value={trainerId}
                        onChange={(e) => {
                            const id = e.currentTarget.value;
                            chooseTrainer(id);
                            setPicked(id);
                            setTip(null);
                        }}
                    >
                        {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    {loader}
                </div>
            )}
            {loadNote && <p className="muted">{loadNote}</p>}

            <div className="roster-card character-card">
                <div className="trainer-head" data-tip={TRAINER_TOKEN}>
                    {t.photo
                        ? <img className="trainer-photo" src={t.photo} alt="" />
                        : <div className="trainer-photo placeholder"><i className="fa-solid fa-user"></i></div>}
                    <div className="trainer-main">
                        <div className="trainer-name">
                            <span className="name-text">{t.name || 'Unnamed'}</span>
                            <span className="trainer-rank">{t.rank || ''}</span>
                        </div>
                        <div className="pool-bars">
                            <PoolBar tag="HP" cls="hp" cur={t.hp || 0} max={trainerPoolMax(t, 'hp')}
                                onStep={(d, e) => step(TRAINER_TOKEN)('hp', d, e)} />
                            <PoolBar tag="WILL" cls="will" cur={t.will || 0} max={trainerPoolMax(t, 'will')}
                                onStep={(d, e) => step(TRAINER_TOKEN)('will', d, e)} />
                        </div>
                        <StatusChips
                            status={normalizeStatus((t as unknown as Record<string, unknown>).status)}
                            onCycle={onCycle(TRAINER_TOKEN)}
                        />
                    </div>
                    <div className="trainer-actions">
                        <button
                            className="icon-btn tip-btn"
                            data-tip-for={TRAINER_TOKEN}
                            title="Evasion and clash rolls"
                            onClick={() => setTip(tip === TRAINER_TOKEN ? null : TRAINER_TOKEN)}
                        >
                            <i className="fa-solid fa-dice-d6"></i>
                        </button>
                        <button
                            className="icon-btn"
                            title="Open your Trainer License"
                            onClick={() => window.open(
                                'trainer-license.html?trainer=' + encodeURIComponent(trainerId), '_blank')}
                        >
                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                    </div>
                </div>

                <div className="mon-list">
                    {!team.length ? (
                        <div className="empty-note">No Pokémon on this team.</div>
                    ) : team.map((x) => {
                        const token = monToken(x.idx);
                        const sheet = (x.slot.sheet || null) as Partial<CardSheet> | null;
                        return (
                            <MonRow
                                key={x.idx}
                                dex={dexById(x.slot.dexId)}
                                dexId={x.slot.dexId}
                                sheet={sheet}
                                token={token}
                                onStep={step(token)}
                                onCycleStatus={onCycle(token)}
                                onOpenTip={() => setTip(tip === token ? null : token)}
                                buttons={
                                    <button
                                        className="icon-btn"
                                        title="Open the Pokémon card"
                                        onClick={() => window.open(
                                            teamCardUrl(t, x.slot.dexId, x.slot.uid, x.idx), '_blank')}
                                    >
                                        <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                    </button>
                                }
                            />
                        );
                    })}
                </div>
            </div>

            {turns && (
                <CombatEntry
                    trainerId={trainerId}
                    trainerName={t.name || 'Trainer'}
                    team={team.map((x) => ({
                        idx: x.idx,
                        name: monShownName(dexById, x.slot.dexId, x.slot.sheet as never),
                    }))}
                    solo={solo}
                    dexById={dexById}
                    seat={seat}
                />
            )}

            {tip && tipBody && (
                <MoveTipShell token={tip} onClose={closeTip}>{tipBody}</MoveTipShell>
            )}
        </>
    );
}

/* Into the fight: which of my characters go onto the field, a modifier, and
   the GM rolls each one's initiative — 1d6 + Dexterity + Alert + modifier —
   in the feed for everyone. They join the GM's combat tracker as they land. */
function CombatEntry({ trainerId, trainerName, team, solo, dexById, seat }: {
    trainerId: string;
    trainerName: string;
    team: { idx: number; name: string }[];
    solo: GmState;
    dexById: (id: string) => PokedexEntry | null;
    seat: (token: string) => Seat | null;
}) {
    const { session, state } = useTable();
    const view = session.combat.view;
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [mod, setMod] = useState(0);

    /* One trainer per fight from each browser: the characters already in it
       follow the trainer they came from. */
    const boundElsewhere = view.trainerId && view.trainerId !== trainerId && session.combat.mine().size > 0;
    if (boundElsewhere) {
        const other = workingTrainerData(view.trainerId!);
        return (
            <p className="muted combat-entry-note">
                <i className="fa-solid fa-khanda"></i> {(other && other.name) || 'Another trainer'} is in this fight.
                Switch back to them to roll.
            </p>
        );
    }

    const rows = [{ token: TRAINER_TOKEN, name: trainerName, slot: null as number | null }]
        .concat(team.map((m) => ({ token: monToken(m.idx), name: m.name, slot: m.idx })));
    const waiting = rows.filter((r) => !seat(r.token));
    const chosen = waiting.filter((r) => picked[r.token]);
    const blocked = !state.hostOnline;

    const roll = () => {
        const used: string[] = [];
        const chars = chosen.map((r) => {
            const ref = entityRef(solo, dexById, r.token);
            const bonus = ref ? ref.value('Dexterity') + ref.value('Alert') + mod : mod;
            const key: CharKey = r.slot === null ? 't' : session.combat.newKeyFor(trainerId, r.slot, used);
            used.push(key);
            return { key, bonus, slot: r.slot };
        });
        if (!chars.length) return;
        session.enterCombat(trainerId, chars);
        setOpen(false);
        setPicked({});
        setMod(0);
    };

    if (!waiting.length) {
        return (
            <p className="muted combat-entry-note">
                <i className="fa-solid fa-khanda"></i> All of your characters are in the fight.
            </p>
        );
    }

    return (
        <div className="combat-entry">
            {!open ? (
                <button className="accent" disabled={blocked} onClick={() => setOpen(true)}
                    title={blocked ? 'The GM is not connected right now' : 'Choose who goes onto the field'}>
                    <i className="fa-solid fa-dice-d6"></i> Roll initiative
                </button>
            ) : (
                <div className="combat-entry-form">
                    <span className="combat-entry-title">
                        <i className="fa-solid fa-khanda"></i> Into {view.turns?.name || 'the fight'}
                    </span>
                    {waiting.map((r) => (
                        <label key={r.token} className="check">
                            <input
                                type="checkbox"
                                checked={!!picked[r.token]}
                                onChange={(e) => {
                                    const on = e.currentTarget.checked;
                                    setPicked((p) => ({ ...p, [r.token]: on }));
                                }}
                            />
                            <span>{r.name}</span>
                        </label>
                    ))}
                    <div className="combat-entry-mod">
                        <label htmlFor="init-mod">Modifier</label>
                        <div className="stepper">
                            <button className="icon-btn" aria-label="Modifier down" onClick={() => setMod((m) => Math.max(-10, m - 1))}>
                                <i className="fa-solid fa-minus"></i>
                            </button>
                            <input
                                id="init-mod" type="number" min={-10} max={10} value={mod}
                                onChange={(e) => {
                                    const v = parseInt(e.currentTarget.value, 10);
                                    setMod(isNaN(v) ? 0 : Math.max(-10, Math.min(10, v)));
                                }}
                            />
                            <button className="icon-btn" aria-label="Modifier up" onClick={() => setMod((m) => Math.min(10, m + 1))}>
                                <i className="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    <div className="combat-entry-go">
                        <button onClick={() => setOpen(false)}>Cancel</button>
                        <button className="accent" disabled={!chosen.length || blocked} onClick={roll}>
                            <i className="fa-solid fa-dice-d6"></i> Roll{chosen.length > 1 ? ' ' + chosen.length : ''}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
