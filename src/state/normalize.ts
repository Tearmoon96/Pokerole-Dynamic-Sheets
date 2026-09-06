import { BOX_CAPACITY, BOX_COUNT, BOX_SPRITE_CYCLE, TRAINER_MARKER } from './constants';
import {
    defaultAchievements, defaultBadges, defaultEquipment, defaultState,
    derivedPoolMax, takeUid,
} from './defaults';
import type {
    Badge, BoxEntry, BoxSpriteType, MonEntry, TeamSlot, TrainerState,
} from './types';

type Loose = Record<string, any>;

export function normalizeTeam(team: unknown, pool = new Set<string>()): TeamSlot[] {
    const out: TeamSlot[] = (Array.isArray(team) ? team : []).slice(0, 6).map((e: Loose, i: number) => {
        if (!e || typeof e !== 'object') return { dexId: '', sheet: null, preview: null };
        const dexId = e.dexId !== undefined ? e.dexId : (e.id || '');
        /* An occupied slot always carries a uid; an empty one is reset to the
           canonical shape, which also clears the legacy {id,rank,item,chp}
           leftovers a cleared slot used to get. */
        if (!dexId) return { dexId: '', sheet: null, preview: null };
        /* preview = the trainer-side sprite override for this slot
           (type/scale/position), independent of the Pokémon card's sheet. */
        return {
            uid: takeUid(e.uid, 't' + i, pool),
            dexId,
            sheet: e.sheet !== undefined ? e.sheet : null,
            preview: e.preview || null,
        };
    });
    while (out.length < 6) out.push({ dexId: '', sheet: null, preview: null });
    return out;
}

/* Boxes come back from JSON that may be missing entirely (every sheet written
   before this feature), hand-edited, short, or overfull. Always returns exactly
   BOX_COUNT boxes. */
export function normalizeBoxes(boxes: unknown, pool = new Set<string>()): BoxEntry[] {
    const src: Loose[] = Array.isArray(boxes) ? boxes : [];
    const out: BoxEntry[] = Array.from({ length: BOX_COUNT }, (_, bi) => {
        const b = src[bi];
        return {
            name: (b && typeof b.name === 'string' && b.name.trim())
                ? b.name.trim() : ('Box ' + (bi + 1)),
            mons: [],
        };
    });
    /* Anything past the sixth box, or past a box's capacity, is poured into
       whatever room is left rather than dropped on the floor — losing a Pokémon
       to a stale file would be unforgivable. */
    const overflow: MonEntry[] = [];
    src.forEach((b, bi) => {
        ((b && Array.isArray(b.mons)) ? b.mons : [])
            .filter((m: Loose) => m && typeof m === 'object' && (m.dexId || m.id))
            .forEach((m: Loose, mi: number) => {
                const mon: MonEntry = {
                    uid: takeUid(m.uid, 'b' + bi + '-' + mi, pool),
                    dexId: m.dexId || m.id,
                    sheet: m.sheet !== undefined ? m.sheet : null,
                    preview: m.preview || null,
                };
                const home = bi < BOX_COUNT ? out[bi] : null;
                if (home && home.mons.length < BOX_CAPACITY) home.mons.push(mon);
                else overflow.push(mon);
            });
    });
    overflow.forEach((mon) => {
        const room = out.find((b) => b.mons.length < BOX_CAPACITY);
        if (room) room.mons.push(mon);   // all 180 full: nothing else to do
    });
    return out;
}

/** Merge a parsed object (working set, or a loaded trainer file) onto a fresh
    default so older / partial sheets get any missing keys back. */
export function normalizeState(parsed: unknown): TrainerState {
    const p: Loose = (parsed && typeof parsed === 'object') ? parsed as Loose : {};
    const defaults = defaultState();
    const s: TrainerState = { ...defaults, ...p } as TrainerState;
    (['stats', 'skills', 'potionCharges', 'potionQty'] as const).forEach((k) => {
        (s as Loose)[k] = { ...(defaults as Loose)[k], ...(p[k] || {}) };
    });
    s.id = p.id || defaults.id;
    /* One pool across both, so a Pokémon's uid stays unique to this trainer
       whether it is in the team or in a box. */
    const uidPool = new Set<string>();
    s.team = normalizeTeam(p.team, uidPool);
    s.boxes = normalizeBoxes(p.boxes, uidPool);
    s.activeBox = Math.min(Math.max(0, parseInt(p.activeBox, 10) || 0), s.boxes.length - 1);
    s.boxSpriteType = (BOX_SPRITE_CYCLE as readonly string[]).indexOf(p.boxSpriteType) !== -1
        ? p.boxSpriteType as BoxSpriteType : 'Home';
    /* Sheets written before this switch existed get it on, which is the richer
       default — uploaded art is there to be seen. */
    s.boxUseCustom = p.boxUseCustom === undefined ? true : !!p.boxUseCustom;
    if (!Array.isArray(s.achievements) || s.achievements.length !== 5) s.achievements = defaultAchievements();
    if (!Array.isArray(s.badges) || s.badges.length !== 8) {
        s.badges = defaultBadges();
    } else {
        /* Migrate old boolean badges to the {earned, type} shape */
        s.badges = (s.badges as unknown[]).map((b): Badge => {
            if (b && typeof b === 'object') {
                const o = b as Loose;
                return { earned: !!o.earned, type: o.type || '' };
            }
            return { earned: !!b, type: '' };
        });
    }
    /* Sheets saved before equipment existed (or with slots we've since renamed)
       get a full set back, keeping whatever they did have. */
    const eqDefaults = defaultEquipment();
    const eqParsed: Loose = (p.equipment && typeof p.equipment === 'object') ? p.equipment : {};
    s.equipment = {};
    Object.keys(eqDefaults).forEach((k) => {
        const e = eqParsed[k];
        s.equipment[k] = {
            name: (e && typeof e.name === 'string') ? e.name : '',
            notes: (e && typeof e.notes === 'string') ? e.notes : '',
            icon: (e && typeof e.icon === 'string') ? e.icon : '',
        };
    });
    /* Carried gear: hand-edited JSON shouldn't be able to hand the bag a
       non-array, a nameless row or a zero count. */
    s.equipBag = (Array.isArray(p.equipBag) ? p.equipBag : [])
        .map((e: Loose) => ({
            name: (e && typeof e.name === 'string') ? e.name.trim() : '',
            icon: (e && typeof e.icon === 'string') ? e.icon : '',
            qty: Math.max(1, parseInt(e && e.qty, 10) || 1),
        }))
        .filter((e) => e.name);
    if (!Array.isArray(s.extras) || !s.extras.length) {
        s.extras = [{ name: '', value: 0 }, { name: '', value: 0 }];
    }
    if (!s.manualBookmarks || typeof s.manualBookmarks !== 'object' || Array.isArray(s.manualBookmarks)) {
        s.manualBookmarks = {};
    }
    /* Pool sizes used to be stored as absolute numbers, which froze HP and Will
       the moment either was resized by hand — raising Vitality afterwards
       changed nothing. Turn an old absolute into the offset it represents,
       measured against this sheet's own attributes. */
    if (p.hpMax != null) {
        s.hpMaxBonus = p.hpMax - derivedPoolMax('hp', s);
        s.hpMax = null;
    }
    if (p.willMax != null) {
        s.willMaxBonus = p.willMax - derivedPoolMax('will', s);
        s.willMax = null;
    }
    /* Editions moved to per-file storage in the Core Book folder; drop any
       edition list left behind in older trainer JSON so the file stays clean. */
    delete s.manualVersions;
    delete (s as Loose)[TRAINER_MARKER];
    return s;
}
