import { WORKING_KEY } from '../state/constants';

/* How this card tab was opened, read once from the URL.

   Three modes, and the whole page keys off them:

   - Trainer-linked (?trainer=<id> plus ?uid or ?slot): edits a Pokémon stored
     inside a trainer's team or PC box, shared with the Trainer License page
     through a single localStorage "working set" so one JSON per trainer holds
     everything.
   - Wild (?wild=1): a Pokémon that belongs to no trainer. Stored under its own
     localStorage key and exportable as a wild-Pokémon JSON a trainer sheet can
     import ("capture").
   - Blank (neither, and no ?pokemon): the card opens empty with a
     Load / Create-wild landing. */

export const WILD_MARKER = '_pokeroleWild';

/* Deliberately not under the 'pokerole_wild_' prefix: the GM Screen watches
   that prefix for sheet changes, and this is bookkeeping. */
export const WILD_OPEN_KEY = 'pokerole_open_wilds';

export interface CardContext {
    trainerId: string | null;
    trainerSlot: number;
    /** The Pokémon's own id, stable as it moves between the team and the boxes.
        `slot` alone can't address a boxed Pokémon and goes stale the moment
        anything moves, so `uid` wins when both are present — `slot` stays as the
        fallback for links made before uids existed. */
    monUid: string | null;
    inTrainerMode: boolean;
    wildMode: boolean;
    isBlank: boolean;
    /** Which species the URL asked for, if any. */
    pokemonParam: string | null;
    /** Which wild sheet this tab is on (?wid=…). */
    wildId: string;
}

export function readCardContext(dexId: string, search = location.search): CardContext {
    const params = new URLSearchParams(search);
    const trainerId = params.get('trainer');
    const trainerSlot = parseInt(params.get('slot') || '', 10);
    const monUid = params.get('uid');
    const inTrainerMode = !!trainerId && (!!monUid || !isNaN(trainerSlot));
    const wildMode = params.get('wild') === '1';
    const pokemonParam = params.get('pokemon');
    return {
        trainerId,
        trainerSlot,
        monUid,
        inTrainerMode,
        wildMode,
        isBlank: !pokemonParam && !inTrainerMode && !wildMode,
        pokemonParam,
        /* The FIRST wild of a species keeps the plain species id, which makes
           the storage key byte-for-byte the one this page has always used. That
           matters twice over: a sheet saved before this change is still found,
           and the GM Screen — which pushes a wild under the species key and
           opens the card with no ?wid at all — still lands on it. Only a second
           sheet of the same species gets a suffixed id.

           The id also stops following the species, so evolving a wild keeps the
           same sheet instead of moving it to the new species' key. */
        wildId: (params.get('wid') || '').trim() || dexId,
    };
}

export function wildSheetKey(wid: string): string {
    return 'pokerole_wild_' + wid + '_sheet';
}

export function cardStorageKey(ctx: CardContext, dexId: string): string {
    return ctx.wildMode ? wildSheetKey(ctx.wildId) : 'pokerole_' + dexId + '_sheet';
}

export { WORKING_KEY };
