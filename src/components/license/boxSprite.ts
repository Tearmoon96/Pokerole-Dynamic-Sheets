import { BOX_SPRITE_CYCLE, BOX_WELL } from '../../state/constants';
import { boxSpriteFrame, usableSpriteType } from '../../lib/sprites';
import { boxUseCustom } from '../../state/boxes';
import type { SpriteFrames } from '../../data/types';
import type { PokedexEntry } from '../../data/types';
import type { MonEntry, MonPreview, TrainerState } from '../../state/types';

export function boxSpriteType(s: TrainerState): string {
    return (BOX_SPRITE_CYCLE as readonly string[]).indexOf(s.boxSpriteType) !== -1
        ? s.boxSpriteType : 'Home';
}

/* What a storage tile draws.

   The window's controls decide, not each Pokémon's own team-side sprite choice,
   so the grid reads as one board — except that the Custom switch, when on, lets
   uploaded art win over the chosen set. Off, uploaded art is never drawn here.
   A Pokémon's per-slot zoom/offset is dropped either way: it was tuned against a
   different sprite and would sit off-centre in the round well. The one exception
   is art that was already framed AS custom on the team slot — that tuning still
   applies to the same image. */
export function boxTilePreview(
    s: TrainerState, mon: MonEntry, p: PokedexEntry | null,
    frames: SpriteFrames, well = BOX_WELL,
): MonPreview {
    const sheet = mon && mon.sheet;
    if (boxUseCustom(s) && sheet && (sheet.customImage || sheet.customImageFile)) {
        const pv = mon.preview;
        const tuned = pv && pv.spriteType === 'Custom';
        return {
            spriteType: 'Custom',
            scale: tuned ? (pv!.scale || 1) : 1,
            offsetX: tuned ? (pv!.offsetX || 0) : 0,
            offsetY: tuned ? (pv!.offsetY || 0) : 0,
            /* Boxing sheds the embedded thumbnail when a full-res copy is on
               disk, so there is a moment (or a whole session, if the folder is
               unreachable) with nothing to draw. Stand in the set the window is
               showing rather than always Home. */
            fallbackType: boxSpriteType(s),
        };
    }
    /* A species with no art in the chosen set borrows another, and has to be
       framed with that set's numbers, not the chosen set's. */
    const type = usableSpriteType(p?.Image, boxSpriteType(s));
    const frame = boxSpriteFrame(p?.Image, type, well, frames);
    return { spriteType: type, scale: frame.scale, offsetX: frame.offsetX, offsetY: frame.offsetY };
}
