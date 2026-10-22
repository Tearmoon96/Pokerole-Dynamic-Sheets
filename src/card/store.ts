import { loadCardSheet, readWorking, saveCardSheet, trainerMonEntry } from './persistence';
import { cardStorageKey } from './cardContext';
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
    /** The stored text of this card's sheet as this tab last read or wrote
        it: another tab's write is told apart by it no longer matching. */
    private lastRaw: string | null = null;
    private lastDexId: string | null = null;

    pokemon: PokedexEntry;
    sheet: CardSheet;
    readonly ctx: CardContext;

    constructor(pokemon: PokedexEntry, ctx: CardContext, sheet?: CardSheet) {
        this.pokemon = pokemon;
        this.ctx = ctx;
        this.sheet = sheet ?? loadCardSheet(pokemon, ctx);
        this.remember();
    }

    private remember(): void {
        const now = this.stored();
        this.lastRaw = now.raw;
        this.lastDexId = now.dexId;
    }

    /** This card's sheet as storage has it now, and the species its trainer
        slot says it is (null for a card that is not in a trainer). */
    private stored(): { raw: string | null; dexId: string | null } {
        if (this.ctx.inTrainerMode) {
            const entry = trainerMonEntry(readWorking(), this.ctx);
            return { raw: entry && entry.sheet ? JSON.stringify(entry.sheet) : null, dexId: entry ? entry.dexId || null : null };
        }
        let raw: string | null = null;
        try { raw = localStorage.getItem(cardStorageKey(this.ctx, this.pokemon._id)); } catch { /* private mode */ }
        return { raw, dexId: null };
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
        this.remember();
    }

    /** Re-read from storage — for when another tab has written the sheet. */
    reload(): void {
        this.sheet = loadCardSheet(this.pokemon, this.ctx);
        this.remember();
        this.notify();
    }

    /** Takes in what another tab wrote to this card's sheet — the rolling
        table's or the GM screen's HP, Will, status or combat offsets. Nothing
        happens unless the stored text changed since this tab last saw it, so
        the card's own edits never bounce back. Returns the new species when
        the trainer's slot holds another one now (a Mega Evolution made at the
        table): the caller reopens the card on it, since saving here would put
        the old species back. */
    syncFromStorage(): string | null {
        const now = this.stored();
        if (now.dexId && now.dexId !== this.lastDexId && now.dexId !== this.pokemon._id) return now.dexId;
        if (now.raw === null || now.raw === this.lastRaw) return null;
        this.reload();
        return null;
    }
}
