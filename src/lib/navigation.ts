import type { TrainerState } from '../state/types';

/* Links out to the Pokémon card. The card reads and writes its sheet inside
   this trainer's JSON through the shared working set, so the URL only has to
   say which Pokémon of which trainer. */

/** uid addresses the Pokémon itself, so the card still edits the right one
    after it is boxed or moved; slot stays on the URL as the fallback for a
    sheet whose uid somehow went missing. */
export function teamCardUrl(sheet: TrainerState, dexId: string, uid: string | undefined, slot: number): string {
    return 'pokemon-card.html?pokemon=' + encodeURIComponent(dexId)
        + '&trainer=' + encodeURIComponent(sheet.id)
        + (uid ? '&uid=' + encodeURIComponent(uid) : '')
        + '&slot=' + slot;
}

/** Same, for a Pokémon in a PC box: uid only, since it has no slot to fall back to. */
export function boxedCardUrl(sheet: TrainerState, dexId: string, uid: string): string {
    return 'pokemon-card.html?pokemon=' + encodeURIComponent(dexId)
        + '&trainer=' + encodeURIComponent(sheet.id)
        + '&uid=' + encodeURIComponent(uid);
}

export function openCard(url: string): void {
    window.open(url, '_blank');
}
