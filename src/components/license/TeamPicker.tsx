import { useEffect, useRef, useState } from 'react';
import { Modal, ModalClose, ModalTitle } from '../common/Modal';
import { TileSprite } from '../common/TileSprite';
import { PokeTileGrid } from '../common/PokeTileGrid';
import { MegaStoneIcon, megaStoneOf } from '../common/MonName';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { genUid } from '../../state/defaults';
import { stripMegaSuffix } from '../../lib/sprites';

/** Themed Pokémon browser that fills a team slot. */
export function TeamPicker({ slot, onClose }: { slot: number | null; onClose: () => void }) {
    const { store } = useSheetStore();
    const { data } = useAppData();
    const [query, setQuery] = useState('');
    const search = useRef<HTMLInputElement>(null);
    const open = slot != null;

    useEffect(() => {
        if (!open) return;
        setQuery('');
        const id = window.setTimeout(() => search.current?.focus(), 0);
        return () => clearTimeout(id);
    }, [open]);

    const q = query.trim().toLowerCase();
    const matches = data.pokemon.filter((p) =>
        !q || p.Name.toLowerCase().includes(q) || p.DexID.includes(q));

    const choose = (dexId: string) => {
        store.update((s) => {
            s.team = s.team.map((entry, i) => {
                if (i !== slot) return entry;
                /* New species: reset the linked sheet and the sprite preview
                   (the old sprite choice/position won't fit a new Pokémon) */
                const reset = entry.dexId !== dexId;
                return {
                    /* Every owned Pokémon carries a uid so its card tab and the
                       PC box can both address it */
                    uid: entry.uid || genUid(),
                    dexId,
                    sheet: reset ? null : entry.sheet,
                    preview: reset ? null : entry.preview,
                };
            });
        });
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} boxClassName="poke-picker-box" id="team-picker-modal">
            <ModalClose onClick={onClose} />
            <ModalTitle icon="fa-paw" centered={false}>Choose a Pokémon</ModalTitle>
            <input
                ref={search}
                type="text"
                id="team-picker-search"
                className="specialty-input poke-picker-search"
                placeholder="Search by name or number..."
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
            />
            {/* Windowed, and keyed by Image — same two reasons as the card's
                browser: 1200 Home renders is about a gigabyte of decoded
                bitmap, and `_id` has a duplicate in the dataset. */}
            <PokeTileGrid items={matches} id="team-picker-grid">
                {(p) => {
                    const stone = megaStoneOf(p);
                    return (
                        <div className="poke-tile" key={p.Image} title={p.Name} onClick={() => choose(p._id)}>
                            <TileSprite image={p.Image} />
                            <span className="poke-tile-name">
                                {/* Mega forms: the base name + the stone sprite instead of
                                    the "(Mega Form)" suffix, matching the card's browser */}
                                {stone ? stripMegaSuffix(p.Name) : p.Name}
                                {stone && <MegaStoneIcon stone={stone} />}
                            </span>
                            <span className="poke-tile-num">#{p.DexID}</span>
                        </div>
                    );
                }}
            </PokeTileGrid>
        </Modal>
    );
}
