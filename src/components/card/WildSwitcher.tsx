import { Modal, ModalClose } from '../common/Modal';
import { TileSprite } from '../common/TileSprite';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { speciesDisplayName } from './CardHeader';
import { megaStoneOf } from '../common/MonName';
import { readWildOpen, wildUrl } from '../../card/wild';
import { wildSheetKey } from '../../card/cardContext';
import type { WildOpenEntry } from '../../card/wild';

/* Several wild Pokémon open at once.

   The Trainer License holds every loaded trainer in one page and pages through
   them with an arrow at each edge, a pill naming the current one, and a list
   behind the pill. This is the same switcher for wild Pokémon, with one
   difference forced by the page: a card is built around one species — the theme,
   the sprite chain, the move list and the stat caps all come off it at load — so
   switching reloads the page on the other sheet rather than redrawing in place.
   Nothing is lost by that: every edit already goes straight to localStorage, so
   the sheet being left is on disk before the navigation starts. */

export function useWildNames() {
    const { pokemon, sheet } = useCard();
    const { data } = useAppData();
    const ctxWildId = useCard().store.ctx.wildId;
    const wildMode = useCard().store.ctx.wildMode;

    const species = (e: WildOpenEntry) => {
        const dex = data.pokemon.find((x) => x._id === e.dexId);
        return dex ? dex.Name : e.dexId;
    };

    /** What to call an open sheet: its nickname, else the species. The one on
        screen is read live — it may have been renamed a keystroke ago. */
    const name = (e: WildOpenEntry) => {
        /* wildId falls back to the species this page happens to have loaded, so
           it only names the sheet on screen in wild mode. */
        if (wildMode && e.wid === ctxWildId) {
            return (sheet.nickname || '').trim() || speciesDisplayName(pokemon.Name, megaStoneOf(pokemon));
        }
        let nick = '';
        try {
            const saved = JSON.parse(localStorage.getItem(wildSheetKey(e.wid)) || 'null');
            nick = ((saved && saved.nickname) || '').trim();
        } catch { /* unreadable: the species name still names it */ }
        return nick || species(e);
    };

    return { name, species };
}

function switchWild(list: WildOpenEntry[], wid: string, currentWid: string): void {
    if (wid === currentWid) return;
    const e = list.find((x) => x.wid === wid);
    if (!e) return;
    location.search = wildUrl(e.dexId, e.wid);
}

/** Arrows and the pill, shown only once there is somewhere to go. */
export function WildNav({ onOpenSwitcher }: { onOpenSwitcher: () => void }) {
    const { store } = useCard();
    const { name } = useWildNames();
    if (!store.ctx.wildMode) return null;

    const list = readWildOpen();
    if (list.length <= 1) return null;

    const i = Math.max(0, list.findIndex((e) => e.wid === store.ctx.wildId));
    const step = (delta: number) =>
        switchWild(list, list[(i + delta + list.length) % list.length].wid, store.ctx.wildId);

    return (
        <>
            <button
                className="wild-arrow left"
                id="wild-arrow-left"
                style={{ display: 'flex' }}
                title="Previous wild Pokémon"
                onClick={() => step(-1)}
            >
                <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button
                className="wild-arrow right"
                id="wild-arrow-right"
                style={{ display: 'flex' }}
                title="Next wild Pokémon"
                onClick={() => step(1)}
            >
                <i className="fa-solid fa-chevron-right"></i>
            </button>
            <div
                className="wild-indicator"
                id="wild-indicator"
                style={{ display: 'flex' }}
                title="Switch or close open wild Pokémon"
                onClick={onOpenSwitcher}
            >
                <i className="fa-solid fa-paw"></i>
                <span>{name(list[i])}</span>
                <span className="wi-count">{i + 1} / {list.length}</span>
            </div>
        </>
    );
}

export function WildSwitcherModal({ open, onClose, onNewWild, onImportFolder, onImportFile, onRequestClose }: {
    open: boolean;
    onClose: () => void;
    onNewWild: () => void;
    onImportFolder: () => void;
    onImportFile: () => void;
    onRequestClose: (wid: string) => void;
}) {
    const { store } = useCard();
    const { data } = useAppData();
    const { name, species } = useWildNames();
    const list = readWildOpen();

    return (
        <Modal open={open} onClose={onClose} boxClassName="wild-switch-box" id="wild-switch-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-paw" style={{ color: '#22c55e' }}></i> Wild Pokémon sheets
            </div>
            <p className="modal-text" id="wild-switch-text">
                {list.length > 1
                    ? list.length + ' wild Pokémon open. Click one to edit it, or ✕ to close it. '
                      + 'They all stay in this browser until you save or export them.'
                    : 'One wild Pokémon open. Add another and the two sit side by side — '
                      + 'arrows at the edges of the page switch between them.'}
            </p>
            <div className="wild-switch-actions">
                <button
                    className="pokemon-picker-btn"
                    title="Pick a species and open it as a new wild Pokémon alongside this one"
                    onClick={onNewWild}
                >
                    <i className="fa-solid fa-plus"></i> New wild Pokémon
                </button>
                <button
                    className="pokemon-picker-btn"
                    title={'Pick a folder and open every wild Pokémon .json in it, each as its own sheet.\n'
                        + 'Trainers and the Pokémon on their teams are left alone.'}
                    onClick={onImportFolder}
                >
                    <i className="fa-solid fa-folder-open"></i> Import a folder
                </button>
                <button
                    className="pokemon-picker-btn"
                    title="Open one wild Pokémon .json you saved earlier, alongside this one"
                    onClick={onImportFile}
                >
                    <i className="fa-solid fa-file-import"></i> One file
                </button>
            </div>
            <div className="wild-pick-list" id="wild-pick-list">
                {list.map((e) => {
                    const dex = data.pokemon.find((x) => x._id === e.dexId);
                    const current = e.wid === store.ctx.wildId;
                    return (
                        <div
                            key={e.wid}
                            className={'wild-pick-row' + (current ? ' current' : '')}
                            title={(current ? 'This is the sheet on screen' : 'Open this one')
                                + (e.file ? ' — imported from ' + e.file : '')}
                            onClick={() => { onClose(); switchWild(list, e.wid, store.ctx.wildId); }}
                        >
                            <TileSprite image={dex ? dex.Image : ''} />
                            <span className="wild-pick-name">{name(e)}</span>
                            <span className="wild-pick-sub">{current ? 'on screen' : species(e)}</span>
                            <button
                                className="wild-pick-close"
                                title="Close this wild Pokémon"
                                onClick={(ev) => { ev.stopPropagation(); onRequestClose(e.wid); }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}

/* A wild belongs to no trainer and no working folder, so its sheet is only ever
   in this browser: closing it really does throw it away. */
export function CloseWildModal({ wid, onClose, onConfirm }: {
    wid: string | null;
    onClose: () => void;
    onConfirm: (wid: string) => void;
}) {
    const { name } = useWildNames();
    const entry = wid ? readWildOpen().find((e) => e.wid === wid) : null;

    return (
        <Modal open={!!wid} onClose={onClose} id="close-wild-modal">
            <div className="modal-title"><i className="fa-solid fa-xmark"></i> Close wild Pokémon</div>
            <p className="modal-text">
                Close <strong id="close-wild-name">{entry ? name(entry) : ''}</strong>?<br /><br />
                Its sheet is thrown away — a wild Pokémon lives in this browser only, so
                {' '}<strong>Save</strong> or <strong>Export</strong> it first if you want to keep it.
                Any .json you already wrote is untouched.
            </p>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onClose}>Cancel</button>
                <button className="form-btn danger" onClick={() => wid && onConfirm(wid)}>Close it</button>
            </div>
        </Modal>
    );
}
