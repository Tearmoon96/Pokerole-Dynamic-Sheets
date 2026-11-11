/* Stored sheets, made safe to draw.

   A trainer or a Pokémon's sheet reaches the pages from places that promise
   nothing about it: a .json edited by hand or written by another tool, a GM
   session file, a wild's file, and the rolling table (a shared trainer a
   player may edit, a gift). normalize.ts fills in what is missing but took
   every value's KIND on trust, and one of the wrong kind — a name that is an
   object, a list entry that is null — makes React fail while drawing. A page
   that fails to draw is a blank page, and since the value is still in storage
   it is blank again on every reload.

   So every field the pages read is checked here: a value of the right kind is
   left exactly as it is, one that can be read as the right kind (a number
   where text goes, numeric text where a number goes) is converted, and
   anything else is dropped so the usual default takes its place.

   Deliberately NOT a clean-up: nothing in range is clamped, nothing is
   trimmed, no missing field is added and no unknown one removed. A sheet that
   was fine comes out identical, which is what keeps a loaded trainer equal to
   its own file (restore.ts compares them). Pure and idempotent; fixes are made
   on the object it is given. Data from another browser goes through the
   stricter `strictSheet` / `strictTrainerFields` as well. */

type Rec = Record<string, unknown>;

export const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A number, or text that reads as one; undefined for anything else. */
function asNum(v: unknown): number | undefined {
    if (finite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

/** Text, or a number written out; undefined for anything else. */
function asStr(v: unknown): string | undefined {
    if (typeof v === 'string') return v;
    if (finite(v)) return String(v);
    return undefined;
}

/* Each fixer leaves an absent field absent and a sound one untouched.
   `fallback` is what a hopeless value becomes; left out, the field is removed
   and whoever merges defaults over the object supplies one. */

function str(o: Rec, k: string, fallback?: string): void {
    const v = o[k];
    if (v === undefined || typeof v === 'string') return;
    const s = asStr(v);
    if (s !== undefined) o[k] = s;
    else if (fallback !== undefined) o[k] = fallback;
    else delete o[k];
}

function num(o: Rec, k: string, nullable = false): void {
    const v = o[k];
    if (v === undefined || finite(v) || (nullable && v === null)) return;
    const n = asNum(v);
    if (n !== undefined) o[k] = n;
    else delete o[k];
}

function bool(o: Rec, k: string): void {
    const v = o[k];
    if (v === undefined || typeof v === 'boolean') return;
    o[k] = !!v;
}

/** A record of numbers: entries that are not numbers go. */
function numMap(o: Rec, k: string): void {
    const v = o[k];
    if (v === undefined) return;
    if (!isRec(v)) { delete o[k]; return; }
    for (const key of Object.keys(v)) {
        if (finite(v[key])) continue;
        const n = asNum(v[key]);
        if (n !== undefined) v[key] = n;
        else delete v[key];
    }
}

function boolMap(o: Rec, k: string): void {
    const v = o[k];
    if (v === undefined) return;
    if (!isRec(v)) { delete o[k]; return; }
    for (const key of Object.keys(v)) if (typeof v[key] !== 'boolean') v[key] = !!v[key];
}

/** A list of text: entries that are not text (or a number) go. */
function strList(o: Rec, k: string): void {
    const v = o[k];
    if (v === undefined) return;
    if (!Array.isArray(v)) { delete o[k]; return; }
    if (v.every((x) => typeof x === 'string')) return;
    o[k] = v.map(asStr).filter((x): x is string => x !== undefined);
}

/** A list of records: every entry is passed to `fix`, and one that is not a
    record — or that `fix` refuses — goes. */
function recList(o: Rec, k: string, fix: (e: Rec) => boolean | void): void {
    const v = o[k];
    if (v === undefined) return;
    if (!Array.isArray(v)) { delete o[k]; return; }
    let drop = false;
    for (const e of v) if (!isRec(e) || fix(e) === false) drop = true;
    if (drop) o[k] = v.filter((e) => isRec(e) && fix(e) !== false);
}

/** Offsets (lib/combatMods): a record of numbers. */
function mods(o: Rec, k: string): void {
    numMap(o, k);
}

/* ---------------------------------------------------------------- a sheet */

function fixStatus(o: Rec, k: string): void {
    const v = o[k];
    if (v === undefined) return;
    if (!isRec(v)) { delete o[k]; return; }
    if (v.major !== undefined && v.major !== null && typeof v.major !== 'string') v.major = null;
    num(v, 'burnDegree');
    num(v, 'poisonStage');
    bool(v, 'confusion');
    bool(v, 'flinch');
    bool(v, 'inLove');
}

const SHEET_TEXT = [
    'name', 'dexId', 'notes', 'heldItem', 'nature', 'gender', 'nickname', 'customImage', 'spriteType',
    'customImageFile', 'imageId', 'rank', 'themeType', 'pageTheme', 'abilityInUse', 'customAbility', 'megaFrom',
] as const;
const SHEET_NUMBERS = ['hpMaxBonus', 'willMaxBonus', 'defBonus', 'spDefBonus', 'exp', 'loyalty', 'happiness', 'disobedience'] as const;
/** These four may be null: "not set", or one of the pre-1.2 absolutes. */
const SHEET_NULLABLE = ['hp', 'will', 'hpMax', 'willMax'] as const;
const SHEET_FLAGS = ['shiny', 'socialBaseZeroMigrated', 'megaMoves'] as const;
const SHEET_NUMBER_MAPS = ['trainedStats', 'customBaseStats', 'customMaxStats', 'spriteScales', 'skills', 'categoryRatings'] as const;
const SHEET_LISTS = ['customMoves', 'activeFilters', 'moveOrder', 'pinnedMoves'] as const;

/** A move's edits: text and numbers under short keys, nothing else. */
function fixOverrides(o: Rec): void {
    const v = o.moveOverrides;
    if (v === undefined) return;
    if (!isRec(v)) { delete o.moveOverrides; return; }
    for (const name of Object.keys(v)) {
        const e = v[name];
        if (!isRec(e)) { delete v[name]; continue; }
        for (const f of Object.keys(e)) if (typeof e[f] !== 'string' && !finite(e[f])) delete e[f];
    }
}

function fixSpecialties(o: Rec): void {
    const v = o.specialties;
    if (v === undefined) return;
    if (!Array.isArray(v)) { delete o.specialties; return; }
    /* Sheets from before specialties had a value hold plain names; the card
       turns those into objects itself. */
    const ok = (e: unknown) => typeof e === 'string' || (isRec(e) && typeof e.name === 'string' && finite(e.value));
    if (v.every(ok)) return;
    o.specialties = v
        .map((e) => {
            if (typeof e === 'string') return e;
            if (!isRec(e)) return null;
            const name = asStr(e.name);
            return name === undefined ? null : { ...e, name, value: asNum(e.value) ?? 0 };
        })
        .filter((e) => e !== null);
}

function fixOffsets(o: Rec): void {
    const v = o.spriteOffsets;
    if (v === undefined) return;
    if (!isRec(v)) { delete o.spriteOffsets; return; }
    for (const key of Object.keys(v)) {
        const e = v[key];
        if (!isRec(e) || !finite(e.x) || !finite(e.y)) delete v[key];
    }
}

/** A Mega's stash of its original form (card/mega.ts `MegaStash`). */
function fixStash(o: Rec): void {
    const v = o.megaStash;
    if (v === undefined) return;
    if (!isRec(v)) { delete o.megaStash; return; }
    num(v, 'hp');
    num(v, 'will');
    num(v, 'defBonus');
    num(v, 'spDefBonus');
    fixStatus(v, 'status');
    numMap(v, 'trainedStats');
    numMap(v, 'customBaseStats');
    numMap(v, 'customMaxStats');
    mods(v, 'combatMods');
    strList(v, 'pinnedMoves');
}

function fixMegaPinned(o: Rec): void {
    const v = o.megaPinned;
    if (v === undefined) return;
    if (!isRec(v)) { delete o.megaPinned; return; }
    for (const key of Object.keys(v)) strList(v, key);
}

/** A Pokémon's sheet (card/types.ts `CardSheet`), or what a trainer's team
    slot holds of one. Null for anything that is not a sheet at all. */
export function coerceSheet<T>(raw: T): T | null {
    if (!isRec(raw)) return null;
    const s: Rec = raw;
    for (const k of SHEET_TEXT) str(s, k);
    for (const k of SHEET_NUMBERS) num(s, k);
    for (const k of SHEET_NULLABLE) num(s, k, true);
    for (const k of SHEET_FLAGS) bool(s, k);
    for (const k of SHEET_NUMBER_MAPS) numMap(s, k);
    for (const k of SHEET_LISTS) strList(s, k);
    boolMap(s, 'categoryEnabled');
    fixStatus(s, 'status');
    fixSpecialties(s);
    fixOverrides(s);
    fixOffsets(s);
    mods(s, 'combatMods');
    if (s.disabledMove !== undefined && s.disabledMove !== null && typeof s.disabledMove !== 'string') s.disabledMove = null;
    fixStash(s);
    fixMegaPinned(s);
    return raw;
}

/** The License's own framing of a team slot's sprite. */
function coercePreview(raw: unknown): Rec | null {
    if (!isRec(raw)) return null;
    for (const k of ['type', 'spriteType', 'fallbackType', 'custom']) str(raw, k);
    for (const k of ['scale', 'offsetX', 'offsetY']) num(raw, k);
    if (raw.useNickname !== undefined) bool(raw, 'useNickname');
    return raw;
}

/** One Pokémon of a trainer — a team slot or a box entry — fixed in place.
    False when it is not one at all. */
export function coerceMon(e: unknown): boolean {
    if (!isRec(e)) return false;
    for (const k of ['uid', 'dexId', 'id']) {
        if (e[k] !== undefined && typeof e[k] !== 'string') delete e[k];
    }
    if (e.sheet !== undefined) e.sheet = coerceSheet(e.sheet);
    if (e.preview !== undefined && e.preview !== null) e.preview = coercePreview(e.preview);
    return true;
}

/* -------------------------------------------------------------- a trainer */

/* Wrong, these become '' (what a new trainer has) rather than going: the GM
   screen and the table read the stored trainer as it is, with no defaults
   laid under it. */
const TRAINER_TEXT = ['name', 'player', 'gender', 'photo', 'photoFile', 'nature', 'rank', 'age', 'otherMeds', 'notes'] as const;
const TRAINER_NUMBERS = ['hp', 'will', 'hpMaxBonus', 'willMaxBonus', 'exp', 'money'] as const;

const POTIONS = ['potion', 'superPotion', 'hyperPotion'] as const;

function fixBookmarks(o: Rec): void {
    const v = o.manualBookmarks;
    if (v === undefined) return;
    if (!isRec(v)) { delete o.manualBookmarks; return; }
    for (const key of Object.keys(v)) {
        recList(v, key, (b) => {
            str(b, 'label', '');
            str(b, 'icon');
            num(b, 'page');
            return typeof b.label === 'string' && finite(b.page);
        });
        if (v[key] === undefined) delete v[key];
    }
}

/** A trainer as stored or as read from a file (state/types.ts
    `TrainerState`), fixed in place. The team and the boxes are fixed slot by
    slot, but their shape — six slots, six boxes — is normalize.ts's job. */
export function coerceTrainer<T>(raw: T): T {
    if (!isRec(raw)) return raw;
    const t: Rec = raw;
    if (t.id !== undefined && typeof t.id !== 'string') delete t.id;
    for (const k of TRAINER_TEXT) str(t, k, '');
    str(t, 'themeType');
    for (const k of TRAINER_NUMBERS) num(t, k);
    num(t, 'hpMax', true);
    num(t, 'willMax', true);
    numMap(t, 'stats');
    numMap(t, 'skills');
    numMap(t, 'potionQty');
    mods(t, 'combatMods');

    if (t.photoAdjust !== undefined) {
        if (!isRec(t.photoAdjust)) delete t.photoAdjust;
        else for (const k of ['scale', 'offsetX', 'offsetY']) num(t.photoAdjust, k);
    }
    recList(t, 'extras', (e) => { str(e, 'name', ''); num(e, 'value'); if (e.name === undefined) e.name = ''; if (e.value === undefined) e.value = 0; });
    /* Five rows, always: a broken one is an empty one, not a missing one. */
    if (Array.isArray(t.achievements)) {
        t.achievements = t.achievements.map((a) => {
            if (!isRec(a)) return { text: '', done: false };
            if (typeof a.text === 'string' && typeof a.done === 'boolean') return a;
            return { ...a, text: asStr(a.text) ?? '', done: !!a.done };
        });
    } else if (t.achievements !== undefined) delete t.achievements;
    if (Array.isArray(t.badges)) {
        for (const b of t.badges) if (isRec(b) && b.type !== undefined && typeof b.type !== 'string') b.type = '';
    } else if (t.badges !== undefined) delete t.badges;
    for (const k of ['bagOut', 'bagBattle']) {
        recList(t, k, (e) => {
            str(e, 'name');
            num(e, 'qty');
            if (e.qty === undefined) e.qty = 1;
            return typeof e.name === 'string';
        });
    }
    if (t.potionCharges !== undefined) {
        if (!isRec(t.potionCharges)) delete t.potionCharges;
        else {
            const pc = t.potionCharges;
            for (const k of POTIONS) {
                if (pc[k] === undefined) continue;
                if (!Array.isArray(pc[k])) delete pc[k];
                else if (!(pc[k] as unknown[]).every((x) => typeof x === 'boolean')) pc[k] = (pc[k] as unknown[]).map((x) => !!x);
            }
        }
    }
    fixBookmarks(t);

    if (Array.isArray(t.team)) for (const e of t.team) coerceMon(e);
    if (Array.isArray(t.boxes)) {
        for (const b of t.boxes) {
            if (!isRec(b)) continue;
            if (b.name !== undefined && typeof b.name !== 'string') delete b.name;
            if (Array.isArray(b.mons)) for (const m of b.mons) coerceMon(m);
        }
    }
    return raw;
}

/* ------------------------------------------------ from another browser */

/* What arrives over the rolling table is held to more than its kinds: only
   the fields this app knows, text free of the characters that disguise it
   and no longer than a sheet needs, lists no longer than a sheet has. */

/* The same set as table/text.ts `UNSAFE_TEXT`, less the line break and the
   tab: a sheet's notes are several lines. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

const SHORT = 400;
const LONG = 20_000;
const MAX_LIST = 64;
const MAX_KEYS = 64;

const SHEET_KNOWN = new Set<string>([
    ...SHEET_TEXT, ...SHEET_NUMBERS, ...SHEET_NULLABLE, ...SHEET_FLAGS, ...SHEET_NUMBER_MAPS, ...SHEET_LISTS,
    'categoryEnabled', 'status', 'specialties', 'moveOverrides', 'spriteOffsets', 'combatMods', 'disabledMove',
    'megaStash', 'megaPinned',
]);
const LONG_TEXT = new Set(['notes', 'otherMeds', 'effect', 'text']);

/** Text cleaned and cut, lists and records cut, to any depth. Numbers,
    booleans and null pass; anything else (there is nothing else in JSON) goes. */
function bound(v: unknown, key: string, depth: number): unknown {
    if (typeof v === 'string') return v.replace(UNSAFE, '').slice(0, LONG_TEXT.has(key) ? LONG : SHORT);
    if (v === null || typeof v === 'boolean' || finite(v)) return v;
    if (depth > 5) return undefined;
    if (Array.isArray(v)) return v.slice(0, MAX_LIST).map((x) => bound(x, key, depth + 1)).filter((x) => x !== undefined);
    if (isRec(v)) {
        const out: Rec = {};
        for (const k of Object.keys(v).slice(0, MAX_KEYS)) {
            const clean = k.replace(UNSAFE, '').slice(0, SHORT);
            const x = bound(v[k], k, depth + 1);
            if (clean && x !== undefined) out[clean] = x;
        }
        return out;
    }
    return undefined;
}

/** A sheet from another browser: a new object holding only known fields, of
    the right kinds, within bounds. Never its pictures — those travel through
    the table's file store, and a picture's address typed by someone else is
    an address this browser would go and fetch. Null for what is not a sheet. */
export function strictSheet(raw: unknown): Rec | null {
    if (!isRec(raw)) return null;
    const out: Rec = {};
    for (const k of Object.keys(raw)) {
        if (!SHEET_KNOWN.has(k) || k === 'customImage' || k === 'customImageFile') continue;
        const v = bound(raw[k], k, 0);
        if (v !== undefined) out[k] = v;
    }
    return coerceSheet(out);
}

/** A slot's framing from another browser, without its picture. */
export function strictPreview(raw: unknown): Rec | null {
    if (!isRec(raw)) return null;
    const out: Rec = {};
    for (const k of ['type', 'spriteType', 'fallbackType', 'scale', 'offsetX', 'offsetY', 'useNickname']) {
        const v = bound(raw[k], k, 0);
        if (v !== undefined) out[k] = v;
    }
    return coercePreview(out);
}

/** A trainer's own fields from another browser — `allowed` names which —
    as a new object, of the right kinds and within bounds. */
export function strictTrainerFields(raw: unknown, allowed: (key: string) => boolean): Rec {
    const out: Rec = {};
    if (!isRec(raw)) return out;
    for (const k of Object.keys(raw)) {
        if (!allowed(k)) continue;
        /* Text of the wrong kind is left out, so the trainer keeps what it
           had: here, unlike in a stored trainer, there is something to keep. */
        if ((TRAINER_TEXT as readonly string[]).includes(k) && asStr(raw[k]) === undefined) continue;
        const v = bound(raw[k], k, 0);
        if (v !== undefined) out[k] = v;
    }
    return coerceTrainer(out);
}
