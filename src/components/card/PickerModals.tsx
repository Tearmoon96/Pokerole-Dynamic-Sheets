import { useEffect, useRef, useState } from 'react';
import { Modal, ModalClose } from '../common/Modal';
import { TileSprite } from '../common/TileSprite';
import { MegaStoneIcon, megaStoneOf } from '../common/MonName';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import type { PokedexEntry } from '../../data/types';
import type { EvolutionTarget } from '../../card/evolution';

/* The two search windows — species and abilities — and the evolve chooser that
   shares their grid. */

function speciesShownName(p: PokedexEntry): string {
    const stone = megaStoneOf(p);
    return stone ? p.Name.replace(/\s*\(Mega[^)]*\)/, '') : p.Name;
}

export function PokePicker({ open, wildMode, onClose, onPick, wildImport }: {
    open: boolean;
    /** On a wild card even the plain "load another Pokémon" tool means "open
        another wild Pokémon" — there is nowhere else for it to go. */
    wildMode: boolean;
    onClose: () => void;
    onPick: (id: string) => void;
    wildImport: React.ReactNode;
}) {
    const { data } = useAppData();
    const [query, setQuery] = useState('');
    const search = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setQuery('');
        const id = window.setTimeout(() => search.current?.focus(), 0);
        return () => clearTimeout(id);
    }, [open]);

    const q = query.trim().toLowerCase();
    const matches = data.pokemon.filter((p) => !q
        || p.Name.toLowerCase().includes(q)
        || String(p.Number).includes(q)
        || (p.DexID || '').includes(q));

    return (
        <Modal open={open} onClose={onClose} boxClassName="poke-picker-box" id="poke-picker-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--ghost-color)' }}></i>
                <span id="poke-picker-title">{wildMode ? 'Manage a Wild Pokémon' : 'Load Pokémon'}</span>
            </div>
            {/* Wild mode only: import a saved wild-Pokémon file instead of a fresh one */}
            {wildMode && <div className="wild-import-row" id="picker-wild-import">{wildImport}</div>}
            <input
                ref={search}
                type="text"
                id="poke-picker-search"
                className="specialty-input poke-picker-search"
                placeholder="Search by name or number..."
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <div className="poke-picker-grid" id="poke-picker-grid">
                {matches.map((p) => {
                    const stone = megaStoneOf(p);
                    return (
                        <div className="poke-tile" key={p._id} data-id={p._id} title={p.Name} onClick={() => onPick(p._id)}>
                            <TileSprite image={p.Image} />
                            <span className="poke-tile-name">
                                {speciesShownName(p)}
                                {stone && <MegaStoneIcon stone={stone} />}
                            </span>
                            <span className="poke-tile-num">#{p.DexID || p.Number}</span>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}

export function AbilityPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet, store } = useCard();
    const { data } = useAppData();
    const [query, setQuery] = useState('');
    const search = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setQuery('');
        const id = window.setTimeout(() => search.current?.focus(), 0);
        return () => clearTimeout(id);
    }, [open]);

    const q = query.trim().toLowerCase();
    const matches = data.abilities.filter((a) => !q
        || a.Name.toLowerCase().includes(q)
        || (a.Effect && a.Effect.toLowerCase().includes(q)));
    const current = (sheet.customAbility || '').toLowerCase();

    return (
        <Modal open={open} onClose={onClose} boxClassName="poke-picker-box" id="ability-picker-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-star-of-life" style={{ color: 'var(--ghost-color)' }}></i> Choose an Ability
            </div>
            <input
                ref={search}
                type="text"
                id="ability-picker-search"
                className="specialty-input poke-picker-search"
                placeholder="Search abilities by name or effect..."
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <div className="ability-picker-list" id="ability-picker-list">
                {!matches.length ? (
                    <div className="ability-pick-empty">No abilities match your search.</div>
                ) : matches.map((a) => (
                    <div
                        key={a.Name}
                        className={'ability-pick-row' + (a.Name.toLowerCase() === current ? ' selected' : '')}
                        data-ability={a.Name}
                        title="Use this ability"
                        onClick={() => {
                            store.update((s) => {
                                s.customAbility = a.Name;
                                s.abilityInUse = a.Name;   // the chosen ability becomes the one in use
                            });
                            onClose();
                        }}
                    >
                        <div className="ability-pick-name"><i className="fa-solid fa-star-of-life"></i> {a.Name}</div>
                        {a.Effect && <div className="ability-pick-effect">{a.Effect}</div>}
                    </div>
                ))}
            </div>
        </Modal>
    );
}

export function EvolveChooser({ chooser, onClose, onChoose }: {
    chooser: { title: string; isMega: boolean; list: EvolutionTarget[] } | null;
    onClose: () => void;
    onChoose: (id: string, isMega: boolean) => void;
}) {
    const { data } = useAppData();
    return (
        <Modal open={!!chooser} onClose={onClose} boxClassName="poke-picker-box" id="evolve-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-dna" style={{ color: 'var(--ghost-color)' }}></i>
                <span id="evolve-modal-title">{chooser?.title}</span>
            </div>
            <p className="modal-text">
                Your trained points and everything else on the sheet carry over; only the base stats,
                caps and ability change to the new form.
            </p>
            <div className="poke-picker-grid" id="evolve-grid">
                {(chooser?.list || []).map((e) => {
                    const p = data.pokemon.find((x) => x._id === e.id);
                    const stone = p ? megaStoneOf(p) : null;
                    const shownName = (p && stone) ? p.Name.replace(/\s*\(Mega[^)]*\)/, '') : e.name;
                    return (
                        <div
                            className="poke-tile"
                            key={e.id}
                            data-id={e.id}
                            title={e.name}
                            onClick={() => onChoose(e.id, !!chooser?.isMega)}
                        >
                            <TileSprite image={p ? p.Image : ''} />
                            <span className="poke-tile-name">
                                {shownName}
                                {stone && <MegaStoneIcon stone={stone} />}
                            </span>
                            <span className="poke-tile-num">{e.method}</span>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
