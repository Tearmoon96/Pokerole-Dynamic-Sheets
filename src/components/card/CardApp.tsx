import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { applyCardTheme } from '../../card/theme';
import { CardHeader } from './CardHeader';
import { SpritePanel } from './SpritePanel';
import { PoolsPanel } from './Trackers';
import { ConditionPanel } from './ConditionPanel';
import { StatsPanel } from './StatsPanel';
import { SkillsPanel } from './SkillsPanel';
import { MovesPanel } from './MovesPanel';
import { SideDetails } from './SideDetails';
import { TrainerBanner, WildBanner } from './Banners';
import { BlankLanding } from './BlankLanding';
import { AilmentsModal, TypeEffectivenessModal, WeatherModal } from './ReferenceModals';
import { MoveEditor } from './MoveEditor';
import { AbilityPicker, EvolveChooser, PokePicker } from './PickerModals';
import {
    DeleteMoveModal, EvolveWarnModal, HealModal, LoadWarnModal, MegaConfirmModal,
} from './ConfirmModals';
import { CloseWildModal, WildNav, WildSwitcherModal } from './WildSwitcher';
import { WildActions } from './WildActions';
import {
    buildEvolvedSheet, forwardEvolutions, isMegaForm, megaEvolutions, megaRevertTargetId,
} from '../../card/evolution';
import type { EvolutionTarget } from '../../card/evolution';
import { readWorking, trainerMonEntry } from '../../card/persistence';
import { cardStorageKey, WORKING_KEY } from '../../card/cardContext';
import {
    addWildOpen, forgetWildFileHandle, newWildId, readWildOpen, wildUrl, writeWildOpen,
} from '../../card/wild';
import { wildSheetKey } from '../../card/cardContext';
import { readSpriteFile, spriteUploadDir } from '../../card/customSprite';
import type { CardMove } from '../../card/moves';
import { HomeButton } from '../common/HomeButton';

/* The whole Pokémon card.

   The page is built around one species — the theme, the sprite chain, the move
   list and the stat caps all come off it at load — so anything that changes the
   species (evolving, mega, loading another) writes the rebased sheet and
   navigates, rather than redrawing in place. */

export function CardApp() {
    const { pokemon, sheet, src, store } = useCard();
    const { data } = useAppData();
    const ctx = store.ctx;

    /* Paint the theme before the browser shows a frame. */
    useLayoutEffect(() => { applyCardTheme(pokemon, sheet); }, [pokemon, sheet.themeType, sheet.pageTheme]);

    const [notesTall, setNotesTall] = useState(false);
    const [typeEffOpen, setTypeEffOpen] = useState(false);
    const [ailmentsOpen, setAilmentsOpen] = useState(false);
    const [weatherOpen, setWeatherOpen] = useState(false);
    const [healOpen, setHealOpen] = useState(false);
    const [abilityOpen, setAbilityOpen] = useState(false);
    const [editingMove, setEditingMove] = useState<string | null>(null);
    const [deletingMove, setDeletingMove] = useState<string | null>(null);
    const [picker, setPicker] = useState<{ wild: boolean } | null>(null);
    const [pendingLoad, setPendingLoad] = useState<string | null>(null);
    const [evolveChooser, setEvolveChooser] = useState<{ title: string; isMega: boolean; list: EvolutionTarget[] } | null>(null);
    const [evolveWarn, setEvolveWarn] = useState<{ id: string; stage: number } | null>(null);
    const [megaPending, setMegaPending] = useState<{ id: string; into: boolean } | null>(null);
    const [wildSwitcherOpen, setWildSwitcherOpen] = useState(false);
    const [closingWild, setClosingWild] = useState<string | null>(null);

    const spriteInput = useRef<HTMLInputElement>(null);
    const wildJsonInput = useRef<HTMLInputElement>(null);
    const wildFolderInput = useRef<HTMLInputElement>(null);

    /* The species' own learnset, resolved against the full move list once. */
    const speciesMoves: CardMove[] = (pokemon.Moves || [])
        .map((m) => {
            const full = data.moves.find((x) => x.Name === m.Name);
            return full ? ({ ...full, Learned: m.Learned } as CardMove) : null;
        })
        .filter((m): m is CardMove => !!m);

    /* Take (or keep) this sheet's place in the open set. Also catches up the
       species after an evolution, since the id no longer moves with it. */
    useEffect(() => {
        if (ctx.wildMode) addWildOpen(ctx.wildId, pokemon._id);
    }, [ctx.wildMode, ctx.wildId, pokemon._id]);

    /** Navigate to another species, keeping the trainer link if present so the
        same team slot stays targeted after the reload. */
    const gotoPokemon = useCallback((id: string) => {
        const p = new URLSearchParams();
        p.set('pokemon', id);
        if (ctx.inTrainerMode) {
            p.set('trainer', ctx.trainerId!);
            /* Carry whichever addressing this card was opened with, so an
               evolve/transform reload still targets the same Pokémon whether it
               sits in the team or in a box. */
            if (ctx.monUid) p.set('uid', ctx.monUid);
            if (!isNaN(ctx.trainerSlot)) p.set('slot', String(ctx.trainerSlot));
        }
        if (ctx.wildMode) {
            p.set('wild', '1');
            /* Only when it has drifted from the species — after an evolution, or
               on a second sheet of the same species. Leaving it out otherwise
               keeps the plain ?pokemon=…&wild=1 URL the GM Screen uses. */
            if (ctx.wildId !== id) p.set('wid', ctx.wildId);
        }
        location.search = '?' + p.toString();
    }, [ctx]);

    /** Persist the rebased sheet to the target species, then load it. */
    const transformInto = useCallback((targetId: string, opts: { mega?: boolean } = {}) => {
        const targetDex = data.pokemon.find((p) => p._id === targetId);
        if (!targetDex) return;
        const adjusted = buildEvolvedSheet(src, targetDex);
        /* A normal evolve or a revert clears mega state. */
        adjusted.megaFrom = opts.mega === true ? pokemon._id : '';

        if (ctx.inTrainerMode) {
            const w = readWorking();
            const entry = trainerMonEntry(w, ctx);
            if (entry) {
                entry.sheet = adjusted;
                entry.dexId = targetId;
                try { localStorage.setItem(WORKING_KEY, JSON.stringify(w)); } catch { /* quota */ }
            }
        } else {
            try {
                /* A wild sheet keeps its own id through an evolution, so the
                   rebased sheet goes back where it already lives. Only an
                   ordinary card, still keyed by species, moves. */
                const key = ctx.wildMode
                    ? wildSheetKey(ctx.wildId)
                    : cardStorageKey({ ...ctx, wildMode: false }, targetId);
                localStorage.setItem(key, JSON.stringify(adjusted));
            } catch { /* quota */ }
            if (ctx.wildMode) addWildOpen(ctx.wildId, targetId);
        }
        gotoPokemon(targetId);
    }, [ctx, data.pokemon, gotoPokemon, pokemon._id, src]);

    /** Open a fresh wild Pokémon of this species alongside the current ones. */
    const openNewWild = useCallback(async (dexId: string) => {
        const wid = newWildId(dexId);
        /* A suffixed id can only be reached from here, so anything under it is a
           sheet that was closed earlier — start clean rather than resurrect it.
           The unsuffixed one is deliberately left alone: that is the sheet the
           user was last working on for this species. */
        if (wid !== dexId) {
            try { localStorage.removeItem(wildSheetKey(wid)); } catch { /* private mode */ }
            await forgetWildFileHandle(wid);
        }
        addWildOpen(wid, dexId);
        location.search = wildUrl(dexId, wid);
    }, []);

    const pickPokemon = (id: string) => {
        const wildPick = picker?.wild ?? ctx.wildMode;
        setPicker(null);
        /* A Pokémon is already open on this card: loading another one navigates
           away and replaces it, so confirm first. On the blank landing there is
           nothing to lose, and a wild pick opens a sheet of its own rather than
           replacing this one, so neither warns. */
        if (!wildPick && ctx.pokemonParam) { setPendingLoad(id); return; }
        if (wildPick) void openNewWild(id); else gotoPokemon(id);
    };

    const closeWild = async (wid: string) => {
        setClosingWild(null);
        const list = readWildOpen();
        const i = list.findIndex((e) => e.wid === wid);
        if (i < 0) return;
        list.splice(i, 1);
        writeWildOpen(list);
        try { localStorage.removeItem(wildSheetKey(wid)); } catch { /* private mode */ }
        await forgetWildFileHandle(wid);

        /* Closed the one on screen: step onto its neighbour, or back to the
           blank landing when it was the last one open. */
        if (wid === ctx.wildId) {
            if (!list.length) { location.search = ''; return; }
            const next = list[Math.min(i, list.length - 1)];
            location.search = wildUrl(next.dexId, next.wid);
            return;
        }
        setWildSwitcherOpen(false);
        setWildSwitcherOpen(true);   // reopen so the list redraws without it
    };

    const uploadSprite = async (file: File) => {
        /* Secure folder permission NOW, while the click gesture is still live */
        const dir = await spriteUploadDir();
        try {
            const r = await readSpriteFile(file, dir, sheet);
            store.update((s) => {
                s.customImage = r.customImage;
                s.imageId = r.imageId;
                if (r.customImageFile) s.customImageFile = r.customImageFile;
                s.spriteType = 'Custom';
            });
        } catch (e) {
            alert((e as Error).message);
        }
    };

    const isMega = isMegaForm(pokemon);
    const forward = forwardEvolutions(data.pokemon, pokemon);
    const megas = megaEvolutions(data.pokemon, pokemon);

    const evolveControls = (
        <>
            {isMega ? (
                <button
                    className="evolve-btn revert"
                    title="Revert this temporary Mega evolution"
                    onClick={() => {
                        const id = megaRevertTargetId(data.pokemon, pokemon, sheet);
                        if (id) setMegaPending({ id, into: false });
                    }}
                >
                    <i className="fa-solid fa-rotate-left"></i> Revert Mega
                </button>
            ) : (
                <>
                    {forward.length > 0 && (
                        <button
                            className="evolve-btn"
                            title="Evolve — trained points and everything else carry over"
                            onClick={() => {
                                if (forward.length === 1) setEvolveWarn({ id: forward[0].id, stage: 1 });
                                else setEvolveChooser({ title: 'Evolve into…', isMega: false, list: forward });
                            }}
                        >
                            <i className="fa-solid fa-arrow-up-from-bracket"></i> Evolve
                        </button>
                    )}
                    {megas.length > 0 && (
                        <button
                            className="evolve-btn mega"
                            title="Mega Evolve (temporary, can be reverted)"
                            onClick={() => {
                                if (megas.length === 1) setMegaPending({ id: megas[0].id, into: true });
                                else setEvolveChooser({ title: 'Mega Evolve into…', isMega: true, list: megas });
                            }}
                        >
                            <i className="fa-solid fa-atom"></i> Mega Evolve
                        </button>
                    )}
                </>
            )}
        </>
    );

    const wildImportButtons = (
        <>
            <button
                className="pokemon-picker-btn"
                title={'Pick a folder and open every wild Pokémon .json in it, each as its own sheet.\n'
                    + 'Trainers and the Pokémon on their teams are left alone.'}
                onClick={() => wildFolderInput.current?.click()}
            >
                <i className="fa-solid fa-folder-open"></i> Import a folder
            </button>
            <button
                className="pokemon-picker-btn"
                title="Open one wild Pokémon .json you saved earlier"
                onClick={() => wildJsonInput.current?.click()}
            >
                <i className="fa-solid fa-file-import"></i> One file
            </button>
            <span className="wild-import-hint">or pick a species below to create a fresh one</span>
        </>
    );

    /* Each tool button once, so the two orders below cannot drift apart. */
    const toolHome = <HomeButton key="home" className="type-eff-btn" />;

    const toolTypeEff = (
        <button key="type" className="type-eff-btn" onClick={() => setTypeEffOpen(true)} title="Type Effectiveness">
            <i className="fa-solid fa-shield"></i>
        </button>
    );

    const toolAilments = (
        <button key="ail" className="type-eff-btn" onClick={() => setAilmentsOpen(true)} title="Ailments & Conditions">
            <i className="fa-solid fa-kit-medical"></i>
        </button>
    );

    const toolWeather = (
        <button key="wx" className="type-eff-btn" onClick={() => setWeatherOpen(true)} title="Weather and Environments">
            <i className="fa-solid fa-cloud-sun-rain"></i>
        </button>
    );

    const toolHeal = (
        <button
            key="heal"
            className="type-eff-btn heal-btn"
            onClick={() => setHealOpen(true)}
            title="Heal: full HP and Will, every status cleared"
        >
            <i className="fa-solid fa-heart-circle-plus"></i>
        </button>
    );

    /* A team member's slot is fixed, so this is hidden in trainer mode. */
    const toolLoad = ctx.inTrainerMode ? null : (
        <button
            key="load"
            className="type-eff-btn"
            id="load-picker"
            onClick={() => setPicker({ wild: ctx.wildMode })}
            /* On a wild card the magnifier opens another wild sheet
               rather than replacing this one. */
            title={ctx.wildMode ? 'Open another wild Pokémon' : 'Load another Pokémon'}
        >
            <i className="fa-solid fa-magnifying-glass"></i>
        </button>
    );

    const toolWildSheets = !ctx.wildMode ? null : (
        <button
            key="sheets"
            className="type-eff-btn"
            id="wild-sheets-btn"
            onClick={() => setWildSwitcherOpen(true)}
            title="Open wild Pokémon sheets"
        >
            <i className="fa-solid fa-layer-group"></i>
        </button>
    );

    /* A wild sheet carries all seven of these, and as one wrapping row they
       broke wherever the window happened to put them. Split by what they do
       instead: the first row moves you between sheets (and heals the one you
       are on), the second opens the three reference tables. Only wild mode has
       enough buttons for the split to be worth making — the other two modes
       are five or six and stay a single centred row. */
    const tools = ctx.wildMode ? (
        <>
            <div className="tool-row">{toolHome}{toolWildSheets}{toolLoad}{toolHeal}</div>
            <div className="tool-row">{toolTypeEff}{toolAilments}{toolWeather}</div>
        </>
    ) : (
        <>{toolHome}{toolTypeEff}{toolAilments}{toolWeather}{toolHeal}{toolLoad}</>
    );

    return (
        <>
            {ctx.inTrainerMode && <TrainerBanner />}
            {ctx.wildMode && <WildBanner />}
            <WildNav onOpenSwitcher={() => setWildSwitcherOpen(true)} />

            {/* Wild-only layout tweaks hang off .wild-card, so the ordinary card
                and a trainer's team card are untouched by them. */}
            <main
                className={'card-container' + (ctx.wildMode ? ' wild-card' : '') + (notesTall ? ' notes-tall' : '')}
                id="pokerole-card"
            >
                <section className="left-column">
                    <CardHeader
                        wildMode={ctx.wildMode}
                        tools={tools}
                        /* On a wild sheet the Evolve control sits below the
                           Save / Export / Import row instead, so the order reads:
                           Load another Pokémon, Save, Export, Import, then Evolve. */
                        evolveControls={ctx.wildMode ? null : evolveControls}
                        wildActions={
                            <WildActions
                                speciesMoves={speciesMoves}
                                onImportFolder={() => wildFolderInput.current?.click()}
                                evolveControls={evolveControls}
                            />
                        }
                    />
                    <SpritePanel onUpload={() => spriteInput.current?.click()} />
                    <PoolsPanel />
                    <ConditionPanel />
                    <StatsPanel />
                    <SkillsPanel />
                </section>

                <section className="right-column">
                    <MovesPanel
                        speciesMoves={speciesMoves}
                        onEditMove={setEditingMove}
                        onDeleteMove={setDeletingMove}
                    />

                    {/* The notes take one grid row by default, level with the
                        condition box. Expanded they take a second, which reaches
                        the bottom of Base Stats & Social. In memory only, like
                        the skills collapse: it is a view, not sheet data. */}
                    <div className="notepad-panel">
                        <h2
                            className="stats-title"
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
                        >
                            <span><i className="fa-solid fa-note-sticky"></i> Notes</span>
                            <button
                                className="edit-stats-btn"
                                id="notes-expand-btn"
                                onClick={() => setNotesTall((v) => !v)}
                                title={notesTall ? 'Back to the normal size' : 'Make the notes taller'}
                            >
                                <i className={'fa-solid ' + (notesTall ? 'fa-angles-up' : 'fa-angles-down')}></i>
                            </button>
                        </h2>
                        <textarea
                            id="notes-area"
                            className="notepad-textarea"
                            placeholder="Freely write your notes here..."
                            value={sheet.notes}
                            onChange={(e) => {
                                const notes = e.currentTarget.value;
                                store.update((s) => { s.notes = notes; });
                            }}
                        />
                    </div>

                    <SideDetails onPickAbility={() => setAbilityOpen(true)} />
                </section>
            </main>

            {/* Hidden inputs the buttons above drive. */}
            <input
                ref={spriteInput}
                type="file"
                id="custom-sprite-input"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (file) void uploadSprite(file);
                }}
            />
            <input
                ref={wildJsonInput}
                type="file"
                id="wild-json-input"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (!file) return;
                    const { importOneWildFile } = await import('../../card/wildImport');
                    await importOneWildFile(file);
                }}
            />
            {/* Fallback for browsers without showDirectoryPicker: this hands over
                the folder's files (recursively) but no folder handle. */}
            <input
                ref={wildFolderInput}
                type="file"
                id="wild-folder-input"
                {...{ webkitdirectory: '', directory: '' }}
                multiple
                style={{ display: 'none' }}
                onChange={async (e) => {
                    const files = Array.from(e.currentTarget.files || [])
                        .filter((f) => f.name.toLowerCase().endsWith('.json'));
                    e.currentTarget.value = '';
                    const { openWildFilesAndGo } = await import('../../card/wildImport');
                    await openWildFilesAndGo(files);
                }}
            />

            <TypeEffectivenessModal open={typeEffOpen} onClose={() => setTypeEffOpen(false)} />
            <AilmentsModal open={ailmentsOpen} onClose={() => setAilmentsOpen(false)} />
            <WeatherModal open={weatherOpen} onClose={() => setWeatherOpen(false)} />
            <HealModal open={healOpen} onClose={() => setHealOpen(false)} />
            <AbilityPicker open={abilityOpen} onClose={() => setAbilityOpen(false)} />

            <MoveEditor
                moveName={editingMove}
                speciesMoves={speciesMoves}
                onClose={() => setEditingMove(null)}
            />
            <DeleteMoveModal
                moveName={deletingMove}
                onCancel={() => setDeletingMove(null)}
                onConfirm={(name) => {
                    store.update((s) => { s.customMoves = s.customMoves.filter((n) => n !== name); });
                    setDeletingMove(null);
                }}
            />

            <PokePicker
                open={!!picker}
                wildMode={picker?.wild ?? ctx.wildMode}
                onClose={() => setPicker(null)}
                onPick={pickPokemon}
                wildImport={wildImportButtons}
            />
            <LoadWarnModal
                targetId={pendingLoad}
                onCancel={() => setPendingLoad(null)}
                onConfirm={(id) => { setPendingLoad(null); gotoPokemon(id); }}
            />

            <EvolveChooser
                chooser={evolveChooser}
                onClose={() => setEvolveChooser(null)}
                onChoose={(id, mega) => {
                    setEvolveChooser(null);
                    /* Mega is reversible, so one confirm; regular evolution warns twice */
                    if (mega) setMegaPending({ id, into: true });
                    else setEvolveWarn({ id, stage: 1 });
                }}
            />
            <EvolveWarnModal
                targetId={evolveWarn?.id ?? null}
                stage={evolveWarn?.stage ?? 1}
                onCancel={() => setEvolveWarn(null)}
                onAdvance={() => setEvolveWarn((w) => w && { ...w, stage: 2 })}
                onConfirm={(id) => { setEvolveWarn(null); transformInto(id, {}); }}
            />
            <MegaConfirmModal
                pending={megaPending}
                onCancel={() => setMegaPending(null)}
                onConfirm={(id, into) => { setMegaPending(null); transformInto(id, { mega: into }); }}
            />

            <WildSwitcherModal
                open={wildSwitcherOpen}
                onClose={() => setWildSwitcherOpen(false)}
                onNewWild={() => { setWildSwitcherOpen(false); setPicker({ wild: true }); }}
                onImportFolder={() => wildFolderInput.current?.click()}
                onImportFile={() => wildJsonInput.current?.click()}
                onRequestClose={setClosingWild}
            />
            <CloseWildModal
                wid={closingWild}
                onClose={() => setClosingWild(null)}
                onConfirm={(wid) => { void closeWild(wid); }}
            />

            {ctx.isBlank && (
                <BlankLanding
                    onLoad={() => setPicker({ wild: false })}
                    onWild={() => setPicker({ wild: true })}
                />
            )}
        </>
    );
}
