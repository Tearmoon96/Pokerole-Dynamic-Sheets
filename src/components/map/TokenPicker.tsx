import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../../data/AppDataContext';
import { Modal, ModalClose } from '../common/Modal';
import { PokeTileGrid } from '../common/PokeTileGrid';
import { FallbackImage } from '../common/FallbackImage';
import { pokemonTokenChain } from '../../map/sprites';
import type { PokedexEntry } from '../../data/types';

/* Choose the Pokémon a token shows. The tiles draw the token art itself — the
   small Shuffle head, or the Box sprite where there is none — rather than the
   Home renders the other pickers use: it is what will go on the map, and at
   a fraction of the memory (see PokeTileGrid on the Home sprites). */

export function TokenPicker({ open, onClose, onPick }: {
    open: boolean;
    onClose: () => void;
    onPick: (p: PokedexEntry) => void;
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

    /* Memoised: PokeTileGrid scrolls back to the top whenever its list is a
       new array, and this component re-renders on every store change. */
    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        return data.pokemon.filter((p) => !q
            || p.Name.toLowerCase().includes(q)
            || String(p.Number).includes(q)
            || (p.DexID || '').includes(q));
    }, [data.pokemon, query]);

    return (
        <Modal open={open} onClose={onClose} boxClassName="map-dialog map-picker">
            <ModalClose onClick={onClose} />
            <div className="map-dialog-title"><i className="fa-solid fa-dragon"></i> Pokémon token</div>
            <input
                ref={search}
                type="text"
                className="map-search"
                placeholder="Search by name or number…"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
            />
            {/* Keyed by Image: `_id` is not unique in the dataset (§8). */}
            <PokeTileGrid items={matches}>
                {(p) => (
                    <div className="poke-tile" key={p.Image} title={p.Name} onClick={() => onPick(p)}>
                        <FallbackImage candidates={pokemonTokenChain(p.Image)} />
                        <span className="poke-tile-name">{p.Name}</span>
                    </div>
                )}
            </PokeTileGrid>
        </Modal>
    );
}
