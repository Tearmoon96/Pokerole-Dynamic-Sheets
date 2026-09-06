import { loadCardSheet, saveCardSheet } from './persistence';
import type { CardContext } from './cardContext';
import type { CardSheet } from './types';
import type { PokedexEntry } from '../data/types';
import type { StatSource } from './pools';

/* One mutable store behind the card, in the same shape as the trainer sheet's.

   The species can change under it — evolving, mega-evolving or loading another
   Pokémon all replace `pokemon` — so the store owns both halves and hands them
   out together as the StatSource every calculation takes. */

type Listener = () => void;

export class CardStore {
    private listeners = new Set<Listener>();
    private version = 0;

    pokemon: PokedexEntry;
    sheet: CardSheet;
    readonly ctx: CardContext;

    constructor(pokemon: PokedexEntry, ctx: CardContext, sheet?: CardSheet) {
        this.pokemon = pokemon;
        this.ctx = ctx;
        this.sheet = sheet ?? loadCardSheet(pokemon, ctx);
    }

    subscribe = (cb: Listener): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    getSnapshot = (): number => this.version;

    notify(): void {
        this.version++;
        this.listeners.forEach((l) => l());
    }

    /** The pair every pool and move calculation takes. */
    get src(): StatSource {
        return { pokemon: this.pokemon, sheet: this.sheet };
    }

    /** Apply a mutation to the sheet, persist it and re-render. */
    update(mutate: (s: CardSheet) => void): void {
        const next = { ...this.sheet };
        mutate(next);
        this.sheet = next;
        this.save();
        this.notify();
    }

    /** Swap the species — evolution, mega, or loading another Pokémon. */
    setPokemon(pokemon: PokedexEntry, sheet?: CardSheet): void {
        this.pokemon = pokemon;
        if (sheet) this.sheet = sheet;
        this.save();
        this.notify();
    }

    save(): void {
        saveCardSheet(this.pokemon, this.ctx, this.sheet);
    }

    /** Re-read from storage — for when another tab has written the sheet. */
    reload(): void {
        this.sheet = loadCardSheet(this.pokemon, this.ctx);
        this.notify();
    }
}
