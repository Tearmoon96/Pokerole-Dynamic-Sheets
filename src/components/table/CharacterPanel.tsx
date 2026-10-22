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
import { adjustPool, bareValue, cycleStatus, entityPool, entityRef, writeMods } from '../../gm/entities';
import { StatTipBody, StatsButton, splitTipKey, statsKey } from '../gm/StatTip';
import { modOf, modsOfTrainer } from '../../lib/combatMods';
import type { CombatMods } from '../../lib/combatMods';
import type { CharKey } from '../../table/slim';
import { painFromHp, painPenalty } from '../../gm/moves';
import { resolvePoolValue, trainerPoolMax } from '../../gm/pools';
import { mutateWorkingTrainer, upsertWorkingTrainer, workingTrainerData } from '../../gm/workingSet';
import { isMegaForm, megaEvolutions, megaRevertTargetId } from '../../card/evolution';
import { megaEvolveSheet, megaRevertSheet } from '../../card/mega';
import { normalizeCardSheet } from '../../card/persistence';
import { activeMegaRules } from '../../lib/megaRules';
import { MegaDialog } from './MegaDialog';
import type { MegaAsk } from './MegaDialog';
import { normalizeState } from '../../state/normalize';
import { TRAINER_MARKER } from '../../state/constants';
import { teamCardUrl } from '../../lib/navigation';
import {
    TRAINER_TOKEN, chooseTrainer, chosenTrainerId, monToken, useSoloState, useWorkingSet, workingTrainers,
} from '../../table/character';
import type { CardSheet } from '../../card/types';
import { actionOf } from '../../gm/turns';

/** What the fight knows about one of this player's characters: its combatant
    id, the action it is on and the once-a-Round rolls already made. */
interface Seat {
    id: string;
    act: number;
    /** Moves used this Round. */
    used: string[];
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
        <div className="character-panel" data-tour="character">
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
    /* The open popup: a token for its move panel, `statsKey(token)` for its
       stats popup. */
    const [tip, setTip] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(() => chosenTrainerId());
    const fileRef = useRef<HTMLInputElement>(null);
    const [loadNote, setLoadNote] = useState('');
    const [megaAsk, setMegaAsk] = useState<MegaAsk | null>(null);
    const closeMega = useCallback(() => setMegaAsk(null), []);
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
    const setMods = (token: string) => (next: CombatMods) => {
        writeMods(solo, token, next, () => {});
        refresh();
    };
    const toggleTip = (key: string) => setTip(tip === key ? null : key);

    /* Where a character stands in the fight on the table, if it is in it. */
    const turns = session.combat.view.turns;
    const seat = (token: string): Seat | null => {
        const key = session.combat.keyFor(trainerId, token);
        const e = key && turns ? turns.order.find((x) => x.own === state.myId && x.ck === key) : null;
        if (!e) return null;
        const acted = e.acted ?? 0;
        /* The pips are actions done; the one being played is the next. */
        return {
            id: e.id, act: actionOf(acted), used: e.used ?? [],
            spent: { eva: !!e.eva || acted >= 5, clash: !!e.clash || acted >= 5 },
        };
    };

    /* Another trainer of this browser's already holds the seats in the fight. */
    const boundElsewhere = !!session.combat.view.trainerId && session.combat.view.trainerId !== trainerId
        && session.combat.mine().size > 0;

    /* An initiative, set up: into the fight on the table when there is one
       and this character is not in it yet, an ordinary 1d6 + bonus otherwise. */
    const prepInit = (token: string, bonus: number, who: string) => {
        const note = who + ' · Initiative';
        if (turns && !seat(token)) {
            if (boundElsewhere) {
                session.notify('Another of your trainers is in this fight. Switch back to them to roll.');
                return;
            }
            const slot = token === TRAINER_TOKEN ? null : +token.split(':')[2];
            const key: CharKey = slot === null ? 't'
                : session.combat.keyFor(trainerId, token) ?? session.combat.newKeyFor(trainerId, slot);
            session.prepare(1, 6, note, { extras: { bonus }, quick: null, enter: { trainerId, key, slot } });
            return;
        }
        session.prepare(1, 6, note, { extras: { bonus }, quick: null, enter: null });
    };

    /* A roll from a sheet is SET UP in the dice controls, not sent: the player
       may still add or take away dice for a modifier, then presses Roll. The
       GM rolls it and the feed says whose and what for. In the fight, an
       attack, an Evasion or a Clash also spends an action: the GM screen
       fills its pip. */
    const rollFrom = (token: string): DoRoll => (dice, meta, quick, move) => {
        if (!(dice > 0)) return;
        if (quick === 'init') { prepInit(token, meta.bonus ?? 0, meta.who || ''); return; }
        const note = [meta.who, meta.what].filter(Boolean).join(' · ');
        const s = seat(token);
        session.prepare(dice, 6, note, {
            extras: {
                ...(meta.bonus != null ? { bonus: meta.bonus } : {}),
                ...(meta.pain ? { pain: meta.pain } : {}),
                ...(meta.need != null ? { need: meta.need } : {}),
                ...(meta.need != null && meta.crit != null ? { crit: meta.crit } : {}),
            },
            quick: quick && s ? { op: quick, id: s.id, ...(quick === 'acc' && move ? { move } : {}) } : null,
            enter: null,
        });
    };

    /* Mega Evolving at the table, by the GM's rules: the sheet in this
       browser's working set changes, the card and the GM's copy follow it. */
    const askMega = (idx: number, dex: PokedexEntry, sheet: Partial<CardSheet> | null) => {
        const s = (sheet || {}) as Partial<CardSheet>;
        if (isMegaForm(dex)) {
            const back = megaRevertTargetId(data.pokemon, dex, normalizeCardSheet(dex, s));
            const target = back ? dexById(back) : null;
            if (target) setMegaAsk({ idx, into: false, target, sheet: s, choices: [] });
            return;
        }
        const choices = megaEvolutions(data.pokemon, dex)
            .map((m) => dexById(m.id)).filter((p): p is PokedexEntry => !!p);
        if (choices.length) setMegaAsk({ idx, into: true, target: choices[0], sheet: s, choices });
    };
    const doMega = (ask: MegaAsk, ownMoves: boolean) => {
        setMegaAsk(null);
        const rules = activeMegaRules();
        let error = '';
        mutateWorkingTrainer(trainerId, (tt) => {
            const slot = (tt.team || [])[ask.idx];
            const dex = slot && slot.dexId ? dexById(slot.dexId) : null;
            if (!slot || !dex) return;
            const src = { pokemon: dex, sheet: normalizeCardSheet(dex, (slot.sheet || null) as Partial<CardSheet> | null) };
            if (ask.into) {
                const r = megaEvolveSheet(src, ask.target, rules, ownMoves);
                if ('error' in r) { error = r.error; return; }
                slot.sheet = r.sheet as never;
            } else {
                slot.sheet = megaRevertSheet(src, ask.target, rules) as never;
            }
            slot.dexId = ask.target._id;
        });
        if (error) session.notify(error);
        setTip(null);
        refresh();
    };

    const trainerRef = entityRef(solo, dexById, TRAINER_TOKEN);
    const trainerInitBonus = trainerRef
        ? trainerRef.value('Dexterity') + trainerRef.value('Alert') + modOf(trainerRef.mods, 'init') : 0;

    const team = (Array.isArray(t.team) ? t.team : [])
        .map((slot, idx) => ({ slot, idx }))
        .filter((x) => x.slot && x.slot.dexId);

    const open = splitTipKey(tip);
    const tipBody = (() => {
        const token = open.token;
        if (!token) return null;
        const ref = entityRef(solo, dexById, token);
        if (!ref) return null;
        if (open.stats) {
            const types = ref.dex ? [ref.dex.Type1, ref.dex.Type2].filter(Boolean).join(' / ') : '';
            return (
                <StatTipBody
                    subject={ref} bare={bareValue(ref)}
                    sub={ref.kind === 'trainer' ? 'Trainer' + (ref.rank ? ' · ' + ref.rank : '') : types}
                    hp={entityPool(ref, 'hp')} will={entityPool(ref, 'will')}
                    onPool={(key, delta, e) => step(token)(key, delta, e)}
                    onMods={setMods(token)}
                />
            );
        }
        const tip = token;
        const s = seat(tip);
        if (ref.kind === 'trainer') {
            const hp = entityPool(ref, 'hp');
            return (
                <TrainerTipBody
                    mods={ref.mods} bare={bareValue(ref)}
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
                mods={ref.mods} bare={bareValue(ref)}
                token={tip} dex={dex} sheet={sheet} who={ref.name} owner={t.name || ''}
                value={(n) => resolvePoolValue(dex, sheet, n) || 0}
                pain={painPenalty(dex, sheet)}
                act={s ? s.act : null} spent={s ? { ...s.spent, init: true } : undefined} doRoll={rollFrom(tip)}
                used={s ? s.used : undefined}
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

            {/* At the top: below a full team it was off the screen. */}
            <TrainerInit
                name={t.name || 'Trainer'}
                bonus={trainerInitBonus}
                seated={!!seat(TRAINER_TOKEN)}
                boundElsewhere={boundElsewhere && !!turns}
                onPrepare={() => prepInit(TRAINER_TOKEN, trainerInitBonus, t.name || 'Trainer')}
            />

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
                            onClick={() => toggleTip(TRAINER_TOKEN)}
                        >
                            <i className="fa-solid fa-dice-d6"></i>
                        </button>
                        <StatsButton token={TRAINER_TOKEN} mods={modsOfTrainer(t)}
                            onOpen={() => toggleTip(statsKey(TRAINER_TOKEN))} />
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
                        const dex = dexById(x.slot.dexId);
                        const isMega = !!dex && isMegaForm(dex);
                        const canMega = !!dex && !isMega && megaEvolutions(data.pokemon, dex).length > 0;
                        return (
                            <MonRow
                                key={x.idx}
                                dex={dex}
                                dexId={x.slot.dexId}
                                sheet={sheet}
                                token={token}
                                onStep={step(token)}
                                onCycleStatus={onCycle(token)}
                                onOpenTip={() => toggleTip(token)}
                                onOpenStats={() => toggleTip(statsKey(token))}
                                buttons={
                                    <>
                                        {(canMega || isMega) && (
                                            <button
                                                className={'icon-btn mega-btn' + (isMega ? ' on' : '')}
                                                data-mega={isMega ? 'revert' : 'evolve'}
                                                title={isMega ? 'Revert the Mega Evolution' : 'Mega Evolve'}
                                                onClick={() => dex && askMega(x.idx, dex, sheet)}
                                            >
                                                <i className={'fa-solid ' + (isMega ? 'fa-rotate-left' : 'fa-atom')}></i>
                                            </button>
                                        )}
                                        <button
                                            className="icon-btn"
                                            title="Open the Pokémon card"
                                            onClick={() => window.open(
                                                teamCardUrl(t, x.slot.dexId, x.slot.uid, x.idx), '_blank')}
                                        >
                                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                        </button>
                                    </>
                                }
                            />
                        );
                    })}
                </div>
            </div>

            {open.token && tipBody && (
                <MoveTipShell
                    token={open.token} onClose={closeTip} id={open.stats ? 'stat-tooltip' : 'mon-tooltip'}
                    switchTo={open.stats
                        ? { label: open.token === TRAINER_TOKEN ? 'Rolls' : 'Moves',
                            icon: open.token === TRAINER_TOKEN ? 'fa-dice-d6' : 'fa-list-ul',
                            onClick: () => setTip(open.token) }
                        : { label: 'Stats', icon: 'fa-sliders', onClick: () => setTip(statsKey(open.token!)) }}
                >
                    {tipBody}
                </MoveTipShell>
            )}
            <MegaDialog ask={megaAsk} onCancel={closeMega} onConfirm={doMega} />
        </>
    );
}

/* The trainer's own initiative: the one button left at the top of the panel
   (each Pokémon has its own INIT in its move list). Pressing it sets the roll
   up in the dice controls — 1d6 + Dexterity + Alert, the bonus adjustable for
   a modifier — and Roll sends it: into the fight on the table when there is
   one, an ordinary roll otherwise. */
function TrainerInit({ name, bonus, seated, boundElsewhere, onPrepare }: {
    name: string;
    bonus: number;
    seated: boolean;
    boundElsewhere: boolean;
    onPrepare: () => void;
}) {
    const { session, state } = useTable();
    const view = session.combat.view;

    if (boundElsewhere) {
        const other = workingTrainerData(view.trainerId!);
        return (
            <p className="muted combat-entry-note">
                <i className="fa-solid fa-khanda"></i> {(other && other.name) || 'Another trainer'} is in this fight.
                Switch back to them to roll.
            </p>
        );
    }
    if (seated) {
        return (
            <p className="muted combat-entry-note" data-in-fight="">
                <i className="fa-solid fa-khanda"></i> {name} is in {view.turns?.name || 'the fight'}.
            </p>
        );
    }
    return (
        <div className="combat-entry">
            <button
                className="accent" data-trainer-init=""
                disabled={!state.hostOnline}
                title={!state.hostOnline ? 'The GM is not connected right now' : 'Dexterity + Alert'}
                onClick={onPrepare}
            >
                <i className="fa-solid fa-dice-d6"></i> Roll initiative · {name} <span className="muted">1d6+{bonus}</span>
            </button>
            {!view.turns && state.hostOnline && (
                <p className="muted combat-entry-note" data-no-fight="">
                    No fight on the table yet: an ordinary roll.
                </p>
            )}
        </div>
    );
}
