import { WORKING_KEY, cardStorageKey } from './cardContext';
import type { CardContext } from './cardContext';
import { defaultCardSheet } from './defaults';
import { derivedPoolMax } from './pools';
import type { CardSheet, Specialty } from './types';
import type { PokedexEntry } from '../data/types';
import type { MonEntry, TrainerState } from '../state/types';

/* Where a card sheet is read from and written to: inside the trainer's working
   set when the card was opened from a licence, else its own localStorage key. */

interface WorkingSetShape {
    trainers: { id: string; name: string; fileName: string | null; data: TrainerState }[];
    active: number;
}

export function readWorking(): WorkingSetShape | null {
    try { return JSON.parse(localStorage.getItem(WORKING_KEY) || 'null') || null; }
    catch { return null; }
}

function workingTrainer(w: WorkingSetShape | null, trainerId: string | null) {
    return (w && Array.isArray(w.trainers)) ? w.trainers.find((t) => t.id === trainerId) : null;
}

/** Locate this card's Pokémon inside the trainer, wherever it now sits: by uid
    across the team and every PC box, else by the legacy slot index. Returns the
    live object out of `w`, so callers mutate it and write `w` back. */
export function trainerMonEntry(w: WorkingSetShape | null, ctx: CardContext): MonEntry | null {
    const t = workingTrainer(w, ctx.trainerId);
    if (!t || !t.data) return null;
    const team = Array.isArray(t.data.team) ? t.data.team : [];
    if (ctx.monUid) {
        const hit = team.find((s) => s && s.uid === ctx.monUid);
        if (hit) return hit;
        const boxes = Array.isArray(t.data.boxes) ? t.data.boxes : [];
        for (const b of boxes) {
            const mon = ((b && Array.isArray(b.mons)) ? b.mons : [])
                .find((m) => m && m.uid === ctx.monUid);
            if (mon) return mon;
        }
        /* Released while this tab was open: fall through to the slot index only
           if the URL carried one, otherwise write nothing rather than clobber
           whoever holds that slot now. */
        if (isNaN(ctx.trainerSlot)) return null;
    }
    return team[ctx.trainerSlot] || null;
}

/** Merge a saved sheet onto a fresh default, running every migration the page
    has accumulated. */
export function normalizeCardSheet(p: PokedexEntry, parsed: Partial<CardSheet> | null): CardSheet {
    const base = defaultCardSheet(p);
    if (!parsed) return base;

    const sheet: CardSheet = { ...base, ...parsed };
    /* Sheets saved before the status tracker existed have no status object;
       partial ones get the missing keys back. */
    sheet.status = { ...base.status, ...(parsed.status || {}) };
    /* Poison used to be a plain on/off toggle; it now cycles through Poisoned
       and Badly Poisoned, so a sheet saved poisoned before that has no stage. */
    if (sheet.status.major === 'poison' && !sheet.status.poisonStage) sheet.status.poisonStage = 1;
    /* Disable used to sit among the status icons, but it afflicts a Move rather
       than the Pokémon; it is now a toggle on the move card. An old sheet has no
       way to say which Move it meant, so the flag is simply dropped. */
    delete (sheet.status as unknown as Record<string, unknown>).disable;

    // Migrate old string-based specialties to object-based
    if (sheet.specialties && sheet.specialties.length > 0) {
        sheet.specialties = (sheet.specialties as unknown[]).map((spec): Specialty => {
            if (typeof spec === 'string') return { name: spec, value: 1 };   // default to 1 filled dot
            return spec as Specialty;
        });
    }

    /* Social attributes used to start at a base of 1; they now start at 0 so a
       value of 0 is possible. Older sheets get +1 trained on each social stat
       (unless the base was customised) so their existing totals are preserved. */
    if (!parsed.socialBaseZeroMigrated) {
        sheet.trainedStats = sheet.trainedStats || {};
        (['tough', 'cool', 'beauty', 'cute', 'clever'] as const).forEach((key) => {
            if (sheet.customBaseStats[key] === undefined) {
                sheet.trainedStats[key] = (sheet.trainedStats[key] || 0) + 1;
            }
        });
    }
    sheet.socialBaseZeroMigrated = true;

    /* Pool sizes used to be stored as absolute numbers, which froze HP and Will
       the moment either was resized by hand — raising Vitality (or evolving)
       then changed nothing. Turn an old absolute into the offset it represents,
       measured against the pool the current attributes derive. */
    const src = { pokemon: p, sheet };
    if (parsed.hpMax != null) {
        sheet.hpMaxBonus = parsed.hpMax - derivedPoolMax(src, 'hp');
        sheet.hpMax = null;
    }
    if (parsed.willMax != null) {
        sheet.willMaxBonus = parsed.willMax - derivedPoolMax(src, 'will');
        sheet.willMax = null;
    }
    return sheet;
}

export function loadCardSheet(p: PokedexEntry, ctx: CardContext): CardSheet {
    let saved: string | null = null;
    if (ctx.inTrainerMode) {
        const entry = trainerMonEntry(readWorking(), ctx);
        saved = (entry && entry.sheet) ? JSON.stringify(entry.sheet) : null;
    } else {
        saved = localStorage.getItem(cardStorageKey(ctx, p._id));
    }
    if (!saved) return defaultCardSheet(p);
    try {
        return normalizeCardSheet(p, JSON.parse(saved));
    } catch (e) {
        console.error('Error parsing saved state:', e);
        return defaultCardSheet(p);
    }
}

export function saveCardSheet(p: PokedexEntry, ctx: CardContext, sheet: CardSheet): void {
    if (ctx.inTrainerMode) {
        const w = readWorking();
        const entry = trainerMonEntry(w, ctx);
        if (entry) {
            entry.sheet = sheet;
            /* Keep the trainer's species in sync if it was changed */
            entry.dexId = p._id;
            try { localStorage.setItem(WORKING_KEY, JSON.stringify(w)); } catch { /* quota */ }
        }
    } else {
        try { localStorage.setItem(cardStorageKey(ctx, p._id), JSON.stringify(sheet)); }
        catch { /* private mode / full quota */ }
    }
}
