import { BOX_CAPACITY, BOX_SPRITE_CYCLE } from './constants';
import { defaultBoxes, genUid } from './defaults';
import type { BoxEntry, MonEntry, TrainerState } from './types';

/* PC storage: named boxes of Pokémon this trainer owns but isn't carrying.

   A stored Pokémon uses the same { uid, dexId, sheet, preview } shape as a team
   slot, so every operation here is a move between `team` and `boxes[n].mons` —
   nothing is converted, and a Pokémon keeps its uid (and so its open card tab)
   wherever it ends up.

   Each function takes the sheet and mutates it in place, matching how the store
   applies an update. They return a message when the move could not happen, so
   the caller can raise the same toast the original did. */

export function activeBoxIdx(s: TrainerState): number {
    if (!s.boxes || !s.boxes.length) s.boxes = defaultBoxes();
    return Math.min(Math.max(0, s.activeBox || 0), s.boxes.length - 1);
}

export function activeBoxObj(s: TrainerState): BoxEntry {
    return s.boxes[activeBoxIdx(s)];
}

export interface FoundMon {
    mon: MonEntry;
    inBox: boolean;
    boxIdx?: number;
    idx: number;
}

/** Where a Pokémon lives right now, by uid. The team and the boxes share one
    uid space, so this is the single lookup both sides use. */
export function findMon(s: TrainerState, uid: string | null | undefined): FoundMon | null {
    if (!uid) return null;
    const slot = s.team.findIndex((t) => t && t.uid === uid);
    if (slot !== -1) return { mon: s.team[slot], inBox: false, idx: slot };
    for (let b = 0; b < s.boxes.length; b++) {
        const i = s.boxes[b].mons.findIndex((m) => m && m.uid === uid);
        if (i !== -1) return { mon: s.boxes[b].mons[i], inBox: true, boxIdx: b, idx: i };
    }
    return null;
}

/* A boxed Pokémon keeps its whole card sheet, and that sheet may carry a 512px
   PNG data-URL — around 700 KB against the ~5 MB localStorage budget every
   loaded trainer shares. Where the full-res copy already sits in
   Custom Images/Pokemons the thumbnail is redundant, so drop it: tiles fall back
   to the species sprite and upgrade from disk. Never drop it without that file
   copy — then it is the only art. */
function shedBoxThumbnail(mon: MonEntry): MonEntry {
    if (mon.sheet && mon.sheet.customImage && mon.sheet.customImageFile) {
        return { ...mon, sheet: { ...mon.sheet, customImage: '' } };
    }
    return mon;
}

/** Same shape either way; a team slot that somehow lost its uid gets a fresh
    one rather than becoming unaddressable. */
function monEntry(src: MonEntry): MonEntry {
    return {
        uid: src.uid || genUid(), dexId: src.dexId,
        sheet: src.sheet || null, preview: src.preview || null,
    };
}

function firstBoxWithRoom(s: TrainerState): number {
    const start = activeBoxIdx(s);
    if (s.boxes[start].mons.length < BOX_CAPACITY) return start;
    return s.boxes.findIndex((b) => b.mons.length < BOX_CAPACITY);
}

/** What a refused move wants to say, in the same words the original used. */
export type MoveResult = { ok: true } | { ok: false; message?: string };

const full = (name: string): MoveResult => ({
    ok: false,
    message: '<i class="fa-solid fa-triangle-exclamation"></i> ' + name + ' is full.',
});

/** Team slot -> box. `boxIdx` null means the open box, or the first with room. */
export function depositToBox(s: TrainerState, slotIdx: number, boxIdx: number | null): MoveResult {
    const slot = s.team[slotIdx];
    if (!slot || !slot.dexId) return { ok: false };
    const target = (boxIdx == null) ? firstBoxWithRoom(s) : boxIdx;
    if (target == null || target === -1 || !s.boxes[target]) {
        return { ok: false, message: '<i class="fa-solid fa-triangle-exclamation"></i> Every box is full.' };
    }
    if (s.boxes[target].mons.length >= BOX_CAPACITY) return full(s.boxes[target].name);

    const mon = shedBoxThumbnail(monEntry(slot));
    s.boxes = s.boxes.map((b, i) => i === target ? { ...b, mons: [...b.mons, mon] } : b);
    s.team = s.team.map((t, i) => i === slotIdx ? { dexId: '', sheet: null, preview: null } : t);
    return { ok: true };
}

/** Box -> team. With no slot given it takes the first empty one; dropped onto an
    occupied slot the two trade places, so nothing is ever lost. */
export function withdrawFromBox(s: TrainerState, uid: string, slotIdx: number | null): MoveResult {
    const found = findMon(s, uid);
    if (!found || !found.inBox) return { ok: false };
    const target = (slotIdx == null) ? s.team.findIndex((t) => !t.dexId) : slotIdx;
    if (target == null || target === -1) {
        return {
            ok: false,
            message: '<i class="fa-solid fa-triangle-exclamation"></i> The team is full — '
                + 'drop this onto a team slot to swap instead.',
        };
    }
    const slot = s.team[target];
    const boxIdx = found.boxIdx!;
    const mons = s.boxes[boxIdx].mons.slice();
    mons.splice(found.idx, 1);
    if (slot && slot.dexId) {
        /* Swap: the displaced team member drops into the spot just vacated, so
           the box keeps its order. */
        mons.splice(found.idx, 0, shedBoxThumbnail(monEntry(slot)));
    }
    s.boxes = s.boxes.map((b, i) => i === boxIdx ? { ...b, mons } : b);
    s.team = s.team.map((t, i) => i === target ? monEntry(found.mon) : t);
    return { ok: true };
}

/** Box -> another box (or team -> a named box, which is just a deposit). */
export function moveMonToBox(s: TrainerState, uid: string, boxIdx: number): MoveResult {
    const found = findMon(s, uid);
    if (!found) return { ok: false };
    if (!found.inBox) return depositToBox(s, found.idx, boxIdx);
    if (found.boxIdx === boxIdx || !s.boxes[boxIdx]) return { ok: false };
    if (s.boxes[boxIdx].mons.length >= BOX_CAPACITY) return full(s.boxes[boxIdx].name);

    const from = found.boxIdx!;
    s.boxes = s.boxes.map((b, i) => {
        if (i === from) return { ...b, mons: b.mons.filter((_, j) => j !== found.idx) };
        if (i === boxIdx) return { ...b, mons: [...b.mons, found.mon] };
        return b;
    });
    return { ok: true };
}

export function swapTeamSlots(s: TrainerState, a: number, b: number): void {
    if (a === b) return;
    const team = s.team.slice();
    const tmp = team[a];
    team[a] = team[b];
    team[b] = tmp;
    s.team = team;
}

export function releaseMon(s: TrainerState, uid: string): void {
    const found = findMon(s, uid);
    if (!found || !found.inBox) return;
    const boxIdx = found.boxIdx!;
    s.boxes = s.boxes.map((b, i) => i === boxIdx
        ? { ...b, mons: b.mons.filter((_, j) => j !== found.idx) } : b);
}

/** Step the storage tiles through the stock sprite sets. Purely a view setting,
    but it belongs to the trainer, so it is saved. */
export function cycleBoxSprite(s: TrainerState): void {
    const cur = (BOX_SPRITE_CYCLE as readonly string[]).indexOf(s.boxSpriteType);
    s.boxSpriteType = BOX_SPRITE_CYCLE[(cur + 1) % BOX_SPRITE_CYCLE.length];
}

export function boxUseCustom(s: TrainerState): boolean {
    return s.boxUseCustom !== false;
}
