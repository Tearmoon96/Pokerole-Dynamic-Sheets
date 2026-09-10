import { useRef } from 'react';
import { Panel } from './Panel';
import { MonRow, PoolBar } from './RosterBits';
import { FolderBar, ItemMove } from './FolderBits';
import { dropFolder, groupByFolder, moveFolder, moveWithinGroup } from '../../gm/folders';
import { useFlash } from '../../gm/useFlash';
import { StatusChips } from './StatusChips';
import { GmSprite } from './GmSprite';
import { useGm } from '../../gm/GmContext';
import { useGmConfirm } from './ConfirmDialog';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { uid } from '../../gm/state';
import { normalizeStatus } from '../../gm/ailments';
import { trainerPoolMax } from '../../gm/pools';
import { adjustPool, monShownName, wildKey, wildLiveSheet } from '../../gm/entities';
import { readWorking, upsertWorkingTrainer, workingTrainerData } from '../../gm/workingSet';
import { TRAINER_MARKER } from '../../state/constants';
import { WILD_MARKER } from '../../card/cardContext';
import type { GmCombatant } from '../../gm/types';
import type { PokedexEntry } from '../../data/types';
import type { ReactNode } from 'react';
import type { GmWild } from '../../gm/types';

/* Trainers and wild Pokémon: their pools, their status, and the way into their
   sheets. Trainer data lives in the shared working set, so what is stored here
   is only the id — an HP nudge made on this screen shows up on the licence. */

export function RosterPanel({ onReorder, onOpenTip, cycleStatus }: {
    onReorder: (from: string, to: string) => void;
    onOpenTip: (token: string) => void;
    cycleStatus: (token: string, key: string, e: React.MouseEvent) => void;
}) {
    const { state, store } = useGm();
    const { data } = useAppData();
    const confirm = useGmConfirm();
    const toast = useToast();
    const fileInput = useRef<HTMLInputElement>(null);
    /* Cards and folders share one slot: only one of them can have been the
       last thing moved. Cards are flashed by their roster key ("t:<id>" /
       "w:<gid>"), folders by their gid, and the two cannot collide. */
    const [moved, flash] = useFlash();

    const dexById = (id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null;

    const step = (token: string) => (key: 'hp' | 'will', delta: number, e: React.MouseEvent) => {
        e.stopPropagation();
        adjustPool(state, dexById, token, key, e.shiftKey ? delta * 5 : delta, () => store.save());
        store.refresh();
    };

    const addParticipant = (part: Partial<GmCombatant>) => store.update((s) => {
        s.combat = {
            ...s.combat,
            participants: [...s.combat.participants, Object.assign({
                pid: uid(), label: '?', kind: 'custom', dexId: null, src: null, init: null, acted: 0,
            }, part) as GmCombatant],
        };
    });

    const loadFiles = async (files: File[]) => {
        let added = 0, skipped = 0;
        const wilds: typeof state.wilds = [];
        const ids: string[] = [];
        for (const file of files) {
            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(await file.text()); }
            catch { skipped++; continue; }

            if (parsed && parsed[WILD_MARKER] && parsed.dexId) {
                wilds.push({
                    gid: uid(), dexId: parsed.dexId as string,
                    sheet: (parsed.sheet || {}) as never, pushed: false,
                });
                added++;
                continue;
            }
            const looksTrainer = parsed && parsed.id && parsed.stats && Array.isArray(parsed.team);
            if (parsed && (parsed[TRAINER_MARKER] || looksTrainer)) {
                const res = upsertWorkingTrainer(parsed as never);
                if (res === 'quota') {
                    toast('<i class="fa-solid fa-triangle-exclamation"></i> Browser storage is full '
                        + '&mdash; could not load ' + escapeHtml(String(parsed.name || file.name)) + '.');
                    continue;
                }
                if (!state.trainerIds.includes(parsed.id as string) && !ids.includes(parsed.id as string)) {
                    ids.push(parsed.id as string);
                }
                if (res === 'exists') {
                    toast('<i class="fa-solid fa-id-card"></i> ' + escapeHtml(String(parsed.name || 'Trainer'))
                        + ' is already open in the License page &mdash; showing that live copy.');
                }
                added++;
                continue;
            }
            skipped++;
        }
        if (skipped) {
            toast('<i class="fa-solid fa-circle-info"></i> ' + skipped
                + ' file(s) skipped &mdash; not trainer or wild-Pok&eacute;mon JSON.');
        }
        if (added) {
            store.update((s) => {
                s.wilds = [...s.wilds, ...wilds];
                s.trainerIds = [...s.trainerIds, ...ids];
            });
        }
    };

    const hasAny = state.trainerIds.length > 0 || state.wilds.length > 0;

    /* The display order, worked out at render rather than kept in step by every
       add and remove. rosterOrder holds only what the GM has actually
       rearranged; anything it does not mention is appended, and anything it
       mentions that is no longer loaded falls out. Loading three trainers and
       deleting one therefore needs no bookkeeping at all, and a stale entry can
       never strand a card off the board. */
    const keys = [
        ...state.trainerIds.map((id) => 't:' + id),
        ...state.wilds.map((w) => 'w:' + w.gid),
    ];
    const ordered = [
        ...state.rosterOrder.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !state.rosterOrder.includes(k)),
    ];
    const groups = groupByFolder(ordered, state.rosterFolders, (k) => state.rosterFolderOf[k]);

    /* The card's class is worked out here rather than inside the two renderers:
       this is the level that knows the entry's key, and so whether the last
       up/down press was this card's. */
    const renderEntry = (key: string, move: ReactNode) => {
        const cls = 'roster-card' + (moved === key ? ' just-moved' : '');
        if (key.startsWith('t:')) return renderTrainer(key.slice(2), move, cls);
        const w = state.wilds.find((x) => x.gid === key.slice(2));
        return w ? renderWild(w, move, cls) : null;
    };

    /* One roster card, extracted so the ordered/foldered list below can place
       it anywhere. `ti` is looked up rather than passed: the display order is
       its own array now, while `m:<ti>:<slot>` tokens still address a trainer
       by its position in state.trainerIds — the two must not be confused. */
    const renderTrainer = (id: string, move: ReactNode, cls: string) => {
        const ti = state.trainerIds.indexOf(id);
                const t = workingTrainerData(id);
                if (!t) {
                    return (
                        <div className={cls} key={id}>
                            <div className="roster-stale">
                                {move}
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                {' '}Trainer <strong>{id}</strong> is no longer in the shared working set
                                {' '}— load its .json again.
                                <button
                                    className="icon-btn danger"
                                    style={{ marginLeft: '0.4rem' }}
                                    onClick={() => store.update((s) => {
                                        s.trainerIds = s.trainerIds.filter((x) => x !== id);
                                    })}
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>
                    );
                }
                const open = !!state.expanded[id];
                const team = (Array.isArray(t.team) ? t.team : [])
                    .map((slot, idx) => ({ slot, idx }))
                    .filter((x) => x.slot && x.slot.dexId);
                const tToken = 't:' + ti;

                return (
                    <div className={cls} key={id}>
                        <div className="card-move-strip">{move}</div>
                        <div
                            className="trainer-head"
                            /* The roll panel anchors against this row, not the
                               whole card: a trainer's card is as tall as their
                               team and a popover centred on that lands nowhere
                               near the button that opened it. */
                            data-tip={tToken}
                            onClick={() => store.update((s) => {
                                s.expanded = { ...s.expanded, [id]: !s.expanded[id] };
                            })}
                        >
                            {t.photo
                                ? <img className="trainer-photo" src={t.photo} alt="" />
                                : <div className="trainer-photo placeholder"><i className="fa-solid fa-user"></i></div>}
                            <div className="trainer-main">
                                {/* The name needs its own element to truncate in.
                                    As a bare text node it was an anonymous flex
                                    item, and those cannot ellipsise — see the
                                    note on .trainer-name. */}
                                <div className="trainer-name">
                                    <span className="name-text">{t.name || 'Unnamed'}</span>
                                    <span className="trainer-rank">{t.rank || ''}</span>
                                </div>
                                <div className="pool-bars">
                                    <PoolBar tag="HP" cls="hp" cur={t.hp || 0}
                                        max={trainerPoolMax(t, 'hp')} onStep={(d, e) => step(tToken)('hp', d, e)} />
                                    <PoolBar tag="WILL" cls="will" cur={t.will || 0}
                                        max={trainerPoolMax(t, 'will')} onStep={(d, e) => step(tToken)('will', d, e)} />
                                </div>
                                <StatusChips
                                    status={normalizeStatus((t as unknown as Record<string, unknown>).status)}
                                    onCycle={(key, e) => cycleStatus(tToken, key, e)}
                                />
                            </div>
                            <div className="trainer-actions" onClick={(e) => e.stopPropagation()}>
                                {/* Initiative, evasion and the two clashes — the
                                    pools a trainer rolls in a fight. The team's
                                    Pokemon have carried this button all along;
                                    the trainer holding them had nowhere to roll
                                    from. */}
                                <button
                                    className="icon-btn tip-btn"
                                    data-tip-for={tToken}
                                    title="Initiative, evasion and clash rolls"
                                    onClick={() => onOpenTip(tToken)}
                                >
                                    <i className="fa-solid fa-dice-d6"></i>
                                </button>
                                <button
                                    className="icon-btn"
                                    title="Add trainer to combat"
                                    onClick={() => {
                                        /* By id, not by index: this outlives the render that made it */
                                        addParticipant({ label: t.name || 'Trainer', kind: 'trainer', src: 'T:' + id } as never);
                                        toast('<i class="fa-solid fa-khanda"></i> '
                                            + escapeHtml(t.name || 'Trainer') + ' joins the fight.');
                                    }}
                                >
                                    <i className="fa-solid fa-khanda"></i>
                                </button>
                                <button
                                    className="icon-btn"
                                    title="Open this trainer's sheet"
                                    onClick={() => window.open(
                                        'trainer-license.html?trainer=' + encodeURIComponent(id), '_blank')}
                                >
                                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                </button>
                                <button
                                    className="icon-btn danger"
                                    title="Remove from GM screen"
                                    onClick={async () => {
                                        const go = await confirm({
                                            icon: 'fa-user-minus', danger: true, confirmLabel: 'Remove',
                                            title: 'Remove ' + (t.name || id) + '?',
                                            text: 'Only from this screen. The trainer stays in the shared working set, and saving to '
                                                + 'disk is still done from the Trainer License page.',
                                        });
                                        if (!go) return;
                                        store.update((s) => {
                                            s.trainerIds = s.trainerIds.filter((x) => x !== id);
                                            const expanded = { ...s.expanded };
                                            delete expanded[id];
                                            s.expanded = expanded;
                                        });
                                    }}
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                            <i
                                className={'fa-solid fa-chevron-' + (open ? 'up' : 'down') + ' trainer-toggle'}
                                title={(open ? 'Hide' : 'Show') + " this trainer's Pokémon"}
                            />
                        </div>

                        {!open && (
                            <div className="team-strip">
                                {team.map((x) => (
                                    <GmSprite
                                        key={x.idx}
                                        dex={dexById(x.slot.dexId)}
                                        dexId={x.slot.dexId}
                                        sheet={x.slot.sheet as never}
                                        className=""
                                    />
                                ))}
                            </div>
                        )}

                        {open && (
                            <div className="mon-list">
                                {!team.length ? (
                                    <div className="empty-note">No Pokémon on this team.</div>
                                ) : team.map((x) => {
                                    const mToken = 'm:' + ti + ':' + x.idx;
                                    return (
                                        <MonRow
                                            key={x.idx}
                                            dex={dexById(x.slot.dexId)}
                                            dexId={x.slot.dexId}
                                            sheet={x.slot.sheet as never}
                                            token={mToken}
                                            onStep={step(mToken)}
                                            onCycleStatus={(key, e) => cycleStatus(mToken, key, e)}
                                            onOpenTip={() => onOpenTip(mToken)}
                                            buttons={
                                                <>
                                                    <button
                                                        className="icon-btn"
                                                        title="Add to combat"
                                                        onClick={() => {
                                                            /* Trainer first, then the Pokémon: in a turn
                                                               order read aloud, the name that tells the
                                                               table whose side it is on comes first. */
                                                            const label = (t.name ? t.name + ' - ' : '')
                                                                + monShownName(dexById, x.slot.dexId, x.slot.sheet as never);
                                                            addParticipant({
                                                                label, kind: 'mon', dexId: x.slot.dexId,
                                                                src: 'M:' + id + ':' + x.idx,
                                                            } as never);
                                                            toast('<i class="fa-solid fa-khanda"></i> '
                                                                + escapeHtml(label) + ' joins the fight.');
                                                        }}
                                                    >
                                                        <i className="fa-solid fa-khanda"></i>
                                                    </button>
                                                    <button
                                                        className="icon-btn"
                                                        title="Open the Pokémon card"
                                                        onClick={() => {
                                                            const url = 'pokemon-card.html?pokemon='
                                                                + encodeURIComponent(x.slot.dexId)
                                                                + '&trainer=' + encodeURIComponent(id)
                                                                + (x.slot.uid ? '&uid=' + encodeURIComponent(x.slot.uid) : '')
                                                                + '&slot=' + x.idx;
                                                            window.open(url, '_blank');
                                                        }}
                                                    >
                                                        <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                                    </button>
                                                </>
                                            }
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
    };

    const renderWild = (w: GmWild, move: ReactNode, cls: string) => {
                const sheet = wildLiveSheet(w);
                const wToken = 'w:' + w.gid;
                return (
                    <div className={cls} key={w.gid}>
                        <div className="card-move-strip">{move}</div>
                        <MonRow
                            dex={dexById(w.dexId)}
                            dexId={w.dexId}
                            sheet={sheet}
                            token={wToken}
                            onStep={step(wToken)}
                            onCycleStatus={(key, e) => cycleStatus(wToken, key, e)}
                            onOpenTip={() => onOpenTip(wToken)}
                            buttons={
                                <>
                                    <span className="wild-tag">wild</span>
                                    <button
                                        className="icon-btn"
                                        title="Add to combat"
                                        onClick={() => {
                                            const label = monShownName(dexById, w.dexId, sheet) + ' (wild)';
                                            addParticipant({
                                                label, kind: 'wild', dexId: w.dexId, src: 'w:' + w.gid,
                                            } as never);
                                            toast('<i class="fa-solid fa-khanda"></i> '
                                                + escapeHtml(label) + ' joins the fight.');
                                        }}
                                    >
                                        <i className="fa-solid fa-khanda"></i>
                                    </button>
                                    <button
                                        className="icon-btn"
                                        title="Open the Pokémon card (wild mode)"
                                        onClick={() => {
                                            if (!w.pushed || !localStorage.getItem(wildKey(w.dexId))) {
                                                try {
                                                    localStorage.setItem(wildKey(w.dexId),
                                                        JSON.stringify(w.sheet || {}));
                                                } catch { /* quota: the card will open on defaults */ }
                                                store.update((s) => {
                                                    s.wilds = s.wilds.map((x) =>
                                                        x.gid === w.gid ? { ...x, pushed: true } : x);
                                                });
                                            }
                                            window.open('pokemon-card.html?pokemon='
                                                + encodeURIComponent(w.dexId) + '&wild=1', '_blank');
                                        }}
                                    >
                                        <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                    </button>
                                    <button
                                        className="icon-btn danger"
                                        title="Remove"
                                        onClick={() => store.update((s) => {
                                            s.wilds = s.wilds.filter((x) => x.gid !== w.gid);
                                        })}
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                </>
                            }
                        />
                    </div>
                );
    };

    return (
        <Panel
            panelKey="roster"
            icon="fa-users"
            title="Trainers &amp; Wilds"
            onReorder={onReorder}
            actions={
                <>
                    <button
                        className="icon-btn"
                        title="Load trainer or wild-Pokémon .json files"
                        onClick={() => fileInput.current?.click()}
                    >
                        <i className="fa-solid fa-folder-open"></i> Load
                    </button>
                    <button
                        className="icon-btn"
                        title="New folder"
                        onClick={() => store.update((s) => {
                            s.rosterFolders = [...s.rosterFolders, { gid: uid(), name: '', open: true }];
                        })}
                    >
                        <i className="fa-solid fa-folder-plus"></i>
                    </button>
                    <button
                        className="icon-btn"
                        title="Add every trainer currently open in the Trainer License page"
                        onClick={() => {
                            const w = readWorking();
                            const list = (w && Array.isArray(w.trainers)) ? w.trainers : [];
                            const fresh = list
                                .filter((t) => t && t.id && !state.trainerIds.includes(t.id))
                                .map((t) => t.id);
                            if (!fresh.length) {
                                toast('<i class="fa-solid fa-circle-info"></i> No new trainers found in the shared set. '
                                    + 'Open them in the Trainer License page first, or load their .json here.');
                                return;
                            }
                            store.update((s) => { s.trainerIds = [...s.trainerIds, ...fresh]; });
                        }}
                    >
                        <i className="fa-solid fa-id-card"></i> From License
                    </button>
                </>
            }
        >
            <div className="panel-body" id="roster-body">
                {groups.map(({ folder, items }, gi) => {
                    if (!folder && !items.length) return null;
                    return (
                        <div className="folder-group" key={folder ? folder.gid : '__loose'}>
                            {folder && (
                                <FolderBar
                                    folder={folder}
                                    moved={moved === folder.gid}
                                    count={items.length}
                                    canUp={gi > 0}
                                    canDown={gi < state.rosterFolders.length - 1}
                                    onToggle={() => store.update((s) => {
                                        s.rosterFolders = s.rosterFolders.map((f) =>
                                            f.gid === folder.gid ? { ...f, open: !f.open } : f);
                                    })}
                                    onRename={(name) => store.update((s) => {
                                        s.rosterFolders = s.rosterFolders.map((f) =>
                                            f.gid === folder.gid ? { ...f, name } : f);
                                    })}
                                    onMove={(dir) => {
                                        flash(folder.gid);
                                        store.update((s) => {
                                            s.rosterFolders = moveFolder(s.rosterFolders, folder.gid, dir);
                                        });
                                    }}
                                    onDelete={() => store.update((s) => {
                                        s.rosterFolders = dropFolder(s.rosterFolders, folder.gid);
                                        const filed = { ...s.rosterFolderOf };
                                        Object.keys(filed).forEach((k) => {
                                            if (filed[k] === folder.gid) delete filed[k];
                                        });
                                        s.rosterFolderOf = filed;
                                    })}
                                />
                            )}
                            {(!folder || folder.open) && items.map((key, i) => renderEntry(key, (
                                <ItemMove
                                    folders={state.rosterFolders}
                                    folder={state.rosterFolderOf[key]}
                                    canUp={i > 0}
                                    canDown={i < items.length - 1}
                                    label={key.startsWith('t:') ? 'this trainer' : 'this wild'}
                                    onMove={(dir) => {
                                        flash(key);
                                        store.update((s) => {
                                            const fid = folder ? folder.gid : null;
                                            s.rosterOrder = moveWithinGroup(
                                                ordered, (k) => k,
                                                (k) => (s.rosterFolderOf[k] || null) === fid, key, dir,
                                            );
                                        });
                                    }}
                                    onSetFolder={(gid) => store.update((s) => {
                                        const filed = { ...s.rosterFolderOf };
                                        if (gid) filed[key] = gid; else delete filed[key];
                                        s.rosterFolderOf = filed;
                                        /* Pin the order as it stands, or the entry
                                           would jump to the end of its new folder
                                           only because nothing had written it yet. */
                                        s.rosterOrder = ordered;
                                    })}
                                />
                            )))}
                        </div>
                    );
                })}

                {!hasAny && (
                    <div className="empty-note">
                        Load trainer .json files (team only — boxed Pokémon stay home) or wild-Pokémon
                        files exported from a card.<br /><br />
                        <strong>Load</strong> picks files · <strong>From License</strong> adopts trainers
                        already open in the Trainer License page.
                    </div>
                )}
            </div>

            <input
                ref={fileInput}
                type="file"
                id="roster-file"
                accept=".json,application/json"
                multiple
                hidden
                onChange={(e) => {
                    const files = Array.from(e.currentTarget.files || []);
                    e.currentTarget.value = '';
                    void loadFiles(files);
                }}
            />
        </Panel>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
