/* A trainer as the sheet watch sees it, and what changed between two of them.

   The GM's table keeps the latest copy of each player's own trainer (watch.ts)
   to notice a sheet changing in the player's favour — HP or Will going up,
   money, potions or items appearing, an attribute or an offset raised — in a
   fight or out of one, and to set it beside the GM's own copy of that trainer
   when the GM asks, or when the player leaves.

   Everything here is pure. `watchSheet` cuts a trainer down to what a
   comparison reads: no pictures, no notes, no screen preferences, every text
   short and every list capped, so the copy travels in a frame or two and sits
   in the GM's storage at a few KB. `diffSheets` flattens two of them into
   paths (a bag row by its item's name, a Pokémon by its uid, so a team put in
   a new order or an item moved between pockets is no change) and rates each
   difference: a rise is a warning, a fall is information. */

import type { MonEntry, TrainerState } from '../state/types';
import { DEX_ID_RE } from './slim';

type Rec = Record<string, unknown>;
type Scalar = number | string | boolean;

export const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface WatchMon { uid: string; dexId: string; s: Rec }
export interface WatchBoxed { uid: string; dexId: string; nick: string }

export interface WatchSheet {
    id: string;
    name: string;
    t: Rec;
    team: WatchMon[];
    boxes: WatchBoxed[];
}

/** A trainer's fields that say nothing about what the character can do. */
export const T_SKIP = new Set([
    'id', 'team', 'boxes', 'activeBox', 'photo', 'photoFile', 'photoAdjust', 'themeType', 'boxSpriteType',
    'boxUseCustom', 'notes', 'manualBookmarks', 'manualVersions', 'hpMax', 'willMax',
]);
/** The same for a Pokémon's card. The Mega stash is the form it reverts to,
    not what it is now. */
export const M_SKIP = new Set([
    'customImage', 'customImageFile', 'imageId', 'spriteType', 'spriteScales', 'spriteOffsets', 'notes',
    'activeFilters', 'moveOrder', 'themeType', 'pageTheme', 'categoryEnabled', 'socialBaseZeroMigrated',
    'megaStash', 'megaPinned', 'hpMax', 'willMax', 'name', 'dexId', 'preview',
]);
/** What Will bought off pain is Will spent, already seen as Will going down. */
export const MODS_SKIP = new Set(['painOff', 'noPain']);
const POISON = new Set(['__proto__', 'constructor', 'prototype']);

export const MAX_TEXT = 120;
export const MAX_LIST = 60;
export const MAX_KEYS = 80;
const MAX_DEPTH = 4;
const MAX_BOXED = 600;
export const ID_RE = /^[A-Za-z0-9_-]{1,48}$/;

/** A JSON value cut to size: text short, lists and objects capped, nesting
    shallow. Anything else (a function, NaN) is dropped. */
export function clean(v: unknown, depth = 0): unknown {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
    if (typeof v === 'string') return v.length > MAX_TEXT ? v.slice(0, MAX_TEXT) : v;
    if (typeof v === 'boolean' || v === null) return v;
    if (depth >= MAX_DEPTH) return undefined;
    if (Array.isArray(v)) return v.slice(0, MAX_LIST).map((x) => clean(x, depth + 1)).filter((x) => x !== undefined);
    if (isRec(v)) {
        const out: Rec = {};
        for (const k of Object.keys(v).slice(0, MAX_KEYS)) {
            if (POISON.has(k)) continue;
            const x = clean(v[k], depth + 1);
            if (x !== undefined) out[k] = x;
        }
        return out;
    }
    return undefined;
}

export function cleanMods(v: unknown): Rec | undefined {
    if (!isRec(v)) return undefined;
    const out: Rec = {};
    for (const [k, x] of Object.entries(v)) if (!MODS_SKIP.has(k) && typeof x === 'number' && x !== 0) out[k] = x;
    return Object.keys(out).length ? out : undefined;
}

const str = (v: unknown, max = 40): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function safeId(v: unknown): string {
    const s = typeof v === 'string' ? v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) : '';
    return s || 'trainer';
}

function monOf(slot: MonEntry, i: number): WatchMon | null {
    if (!slot || typeof slot.dexId !== 'string' || !slot.dexId) return null;
    const s: Rec = {};
    const sheet = isRec(slot.sheet) ? slot.sheet : {};
    for (const [k, v] of Object.entries(sheet)) {
        if (M_SKIP.has(k)) continue;
        if (k === 'combatMods') { const m = cleanMods(v); if (m) s[k] = m; continue; }
        const x = clean(v, 1);
        if (x !== undefined) s[k] = x;
    }
    return { uid: safeId(slot.uid || 's' + i), dexId: slot.dexId.slice(0, 80), s };
}

/** The trainer cut down to what a comparison reads. */
export function watchSheet(t: TrainerState): WatchSheet {
    const tr: Rec = {};
    for (const [k, v] of Object.entries(t)) {
        if (T_SKIP.has(k)) continue;
        if (k === 'combatMods') { const m = cleanMods(v); if (m) tr[k] = m; continue; }
        const x = clean(v, 1);
        if (x !== undefined) tr[k] = x;
    }
    const team = (Array.isArray(t.team) ? t.team : []).slice(0, 6)
        .map((s, i) => monOf(s, i)).filter((m): m is WatchMon => !!m);
    const boxes: WatchBoxed[] = [];
    for (const box of Array.isArray(t.boxes) ? t.boxes : []) {
        for (const [i, m] of (box && Array.isArray(box.mons) ? box.mons : []).entries()) {
            if (boxes.length >= MAX_BOXED) break;
            if (!m || !m.dexId) continue;
            boxes.push({
                uid: safeId(m.uid || 'b' + boxes.length + '_' + i),
                dexId: m.dexId.slice(0, 80),
                nick: str(m.sheet && (m.sheet as Rec).nickname),
            });
        }
    }
    return { id: safeId(t.id), name: str(t.name) || 'Trainer', t: tr, team, boxes };
}

/** Another browser's copy, checked and cut to size the same way. */
export function parseWatchSheet(v: unknown): WatchSheet | null {
    if (!isRec(v) || typeof v.id !== 'string' || !ID_RE.test(v.id) || typeof v.name !== 'string') return null;
    if (!isRec(v.t) || !Array.isArray(v.team) || v.team.length > 6 || !Array.isArray(v.boxes)) return null;
    if (v.boxes.length > MAX_BOXED) return null;
    const team: WatchMon[] = [];
    for (const m of v.team) {
        if (!isRec(m) || typeof m.uid !== 'string' || !ID_RE.test(m.uid) || !isRec(m.s)) return null;
        if (typeof m.dexId !== 'string' || !DEX_ID_RE.test(m.dexId)) return null;
        if (team.some((x) => x.uid === m.uid)) return null;
        team.push({ uid: m.uid, dexId: m.dexId, s: clean(m.s, 1) as Rec });
    }
    const boxes: WatchBoxed[] = [];
    for (const b of v.boxes) {
        if (!isRec(b) || typeof b.uid !== 'string' || !ID_RE.test(b.uid)) return null;
        if (typeof b.dexId !== 'string' || !DEX_ID_RE.test(b.dexId)) return null;
        boxes.push({ uid: b.uid, dexId: b.dexId, nick: str(b.nick) });
    }
    return { id: v.id, name: v.name.slice(0, 40) || 'Trainer', t: clean(v.t, 1) as Rec, team, boxes };
}

/* ============================================================ flattening */

/** Path segments, joined by this: no item name contains it. */
const SEP = '␟';

function put(out: Map<string, Scalar>, path: string[], v: unknown): void {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
        if (v === '' ) return;
        out.set(path.join(SEP), v);
        return;
    }
    if (Array.isArray(v)) {
        /* A list of names is a set: each one there is `true`. */
        if (v.every((x) => typeof x === 'string')) {
            for (const x of v as string[]) if (x) out.set([...path, x].join(SEP), true);
            return;
        }
        v.forEach((x, i) => put(out, [...path, String(i + 1)], x));
        return;
    }
    if (isRec(v)) for (const [k, x] of Object.entries(v)) put(out, [...path, k], x);
}

/** `[{name, value}]` rows as name -> value, the empty ones left out. */
function named(out: Map<string, Scalar>, path: string[], v: unknown, field: string): void {
    if (!Array.isArray(v)) return;
    const sums = new Map<string, number>();
    for (const row of v) {
        if (!isRec(row)) continue;
        const name = str(row.name, MAX_TEXT).trim();
        if (!name) continue;
        const n = typeof row[field] === 'number' ? row[field] as number : 0;
        sums.set(name, (sums.get(name) ?? 0) + n);
    }
    for (const [name, n] of sums) out.set([...path, name].join(SEP), n);
}

function flatTrainer(t: Rec): Map<string, Scalar> {
    const out = new Map<string, Scalar>();
    for (const [k, v] of Object.entries(t)) {
        if (k === 'bagOut' || k === 'bagBattle') continue;
        if (k === 'equipBag') { named(out, ['equipBag'], v, 'qty'); continue; }
        if (k === 'extras') { named(out, ['extras'], v, 'value'); continue; }
        if (k === 'potionCharges') {
            if (isRec(v)) for (const [kind, list] of Object.entries(v)) {
                if (Array.isArray(list)) out.set(['potionCharges', kind].join(SEP), list.filter((x) => x === true).length);
            }
            continue;
        }
        if (k === 'equipment') {
            if (isRec(v)) for (const [slot, e] of Object.entries(v)) {
                const name = isRec(e) ? str(e.name, MAX_TEXT) : '';
                if (name) out.set(['equipment', slot].join(SEP), name);
            }
            continue;
        }
        if (k === 'achievements') {
            if (Array.isArray(v)) v.forEach((a, i) => {
                if (isRec(a) && a.done === true) out.set(['achievements', str(a.text, MAX_TEXT) || String(i + 1)].join(SEP), true);
            });
            continue;
        }
        if (k === 'badges') {
            if (Array.isArray(v)) v.forEach((b, i) => {
                if (isRec(b) && b.earned === true) out.set(['badges', String(i + 1)].join(SEP), str(b.type) || 'earned');
            });
            continue;
        }
        put(out, [k], v);
    }
    /* Both pockets are one bag: moving an item between them is no change. */
    const bag = [...(Array.isArray(t.bagOut) ? t.bagOut : []), ...(Array.isArray(t.bagBattle) ? t.bagBattle : [])];
    named(out, ['bag'], bag, 'qty');
    return out;
}

function flatMon(m: WatchMon): Map<string, Scalar> {
    const out = new Map<string, Scalar>();
    for (const [k, v] of Object.entries(m.s)) {
        if (k === 'specialties') { named(out, ['specialties'], v, 'value'); continue; }
        put(out, [k], v);
    }
    return out;
}

/* ============================================================== rating */

export type Severity = 'warn' | 'info';

export interface Change {
    /** The character: its trainer's name, a Pokémon's nickname or species. */
    who: string;
    /** 't' the trainer, 'm' a team Pokémon, 'b' the PC boxes. */
    ct: 't' | 'm' | 'b';
    field: string;
    /** The first segment of the path, for the explanations (watch.ts). */
    key: string;
    /** The second, when there is one: which potion, which attribute. */
    sub?: string;
    from: string;
    to: string;
    sev: Severity;
    /** Why a rise is not a warning: the GM's own change, a potion, a gift. */
    why?: string;
    /** Numbers only: to minus from. */
    delta?: number;
}

/** Text that matters to what a character can do: a change is a warning. */
const WARN_TEXT = new Set(['rank', 'heldItem', 'nature', 'customAbility', 'abilityInUse', 'equipment', 'badges', 'currency']);
/** Text that is only a name or a mark. */
const INFO_KEYS = new Set(['name', 'player', 'gender', 'age', 'nickname', 'shiny', 'otherMeds', 'disabledMove',
    'achievements', 'megaFrom', 'megaMoves']);

function rate(path: string[], from: Scalar | undefined, to: Scalar | undefined): Severity {
    const key = path[0];
    if (INFO_KEYS.has(key)) return 'info';
    /* Ailments: one taken off is in the character's favour. */
    if (key === 'status') {
        if (typeof from === 'number' || typeof to === 'number') return ((to as number) ?? 0) < ((from as number) ?? 0) ? 'warn' : 'info';
        if (typeof from === 'boolean' || typeof to === 'boolean') return to === true ? 'info' : 'warn';
        return to === undefined || to === null || to === '' ? 'warn' : 'info';
    }
    if (key === 'disobedience') return ((to as number) ?? 0) < ((from as number) ?? 0) ? 'warn' : 'info';
    if (to === undefined) return 'info';
    if (from === undefined) {
        if (to === 0 || to === false) return 'info';
        return 'warn';
    }
    if (typeof from === 'number' && typeof to === 'number') return to > from ? 'warn' : 'info';
    if (typeof to === 'boolean') return to ? 'warn' : 'info';
    return WARN_TEXT.has(key) ? 'warn' : 'info';
}

/* ============================================================== labels */

const NAMES: Record<string, string> = {
    hp: 'HP', will: 'Will', hpMaxBonus: 'Max HP bonus', willMaxBonus: 'Max Will bonus', exp: 'Experience',
    money: 'Money', coins: 'Coins', c: 'copper', s: 'silver', g: 'gold', rank: 'Rank', nature: 'Nature',
    stats: 'Attribute', skills: 'Skill', extras: 'Extra skill', bag: 'Bag', equipBag: 'Gear bag',
    equipment: 'Equipped', potionQty: 'Potions in the bag', potionCharges: 'Potion charges left',
    potion: 'Potion', superPotion: 'Super Potion', hyperPotion: 'Hyper Potion', badges: 'Badge',
    achievements: 'Achievement done', combatMods: 'Combat offset', defBonus: 'Defense offset',
    spDefBonus: 'Sp. Defense offset', heldItem: 'Held item', trainedStats: 'Trained attribute',
    customBaseStats: 'Base attribute', customMaxStats: 'Max attribute', categoryRatings: 'Social rating',
    specialties: 'Specialty', loyalty: 'Loyalty', happiness: 'Happiness', disobedience: 'Disobedience',
    customMoves: 'Move added', pinnedMoves: 'Move pinned', moveOverrides: 'Move edited', status: 'Status',
    nickname: 'Nickname', abilityInUse: 'Ability', customAbility: 'Custom ability', currency: 'Currency',
    player: 'Player', gender: 'Gender', age: 'Age', otherMeds: 'Other medicine', shiny: 'Shiny',
    disabledMove: 'Disabled move', megaFrom: 'Mega form of', name: 'Name', dexId: 'Species',
    acc: 'Accuracy', dmg: 'Damage', crit: 'Crit', def: 'Defense', spDef: 'Sp. Defense', eva: 'Evasion',
    clash: 'Clash', init: 'Initiative', extraEva: 'Extra Evasions', extraClash: 'Extra Clashes',
    power: 'power', accOffset: 'accuracy offset', powOffset: 'power offset',
};

export const words = (k: string): string => NAMES[k]
    ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function label(path: string[]): string {
    const [head, ...rest] = path;
    if (!rest.length) return words(head);
    /* Item names, move names and the like stay as written. */
    const free = ['bag', 'equipBag', 'extras', 'specialties', 'customMoves', 'pinnedMoves', 'achievements'].includes(head);
    if (head === 'moveOverrides') return 'Move ' + rest[0] + (rest[1] ? ': ' + words(rest[1]) : '');
    return words(head) + ': ' + rest.map((r, i) => (free && i === 0 ? r : words(r))).join(' ');
}

const show = (v: Scalar | undefined): string => (v === undefined ? '—' : v === true ? 'yes' : v === false ? 'no' : String(v));

export const speciesName = (dexId: string): string =>
    dexId.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

export function monName(m: WatchMon | WatchBoxed): string {
    const nick = 's' in m ? str(m.s.nickname) : m.nick;
    return nick || speciesName(m.dexId);
}

/* ================================================================ diff */

function diffMaps(a: Map<string, Scalar>, b: Map<string, Scalar>, who: string, ct: Change['ct']): Change[] {
    const out: Change[] = [];
    const keys = new Set([...a.keys(), ...b.keys()]);
    for (const k of keys) {
        const from = a.get(k), to = b.get(k);
        if (from === to) continue;
        const path = k.split(SEP);
        const c: Change = { who, ct, field: label(path), key: path[0], from: show(from), to: show(to), sev: rate(path, from, to) };
        if (path[1]) c.sub = path[1];
        if (typeof from === 'number' || typeof to === 'number') {
            const d = (typeof to === 'number' ? to : 0) - (typeof from === 'number' ? from : 0);
            if (d) c.delta = d;
        }
        out.push(c);
    }
    return out;
}

/** Every difference from `a` to `b`, the trainer first, then the team by
    uid, then the PC boxes. A Pokémon that only moved between the team and a
    box is one line of information, not a Pokémon lost and one found. */
export function diffSheets(a: WatchSheet, b: WatchSheet): Change[] {
    const out = diffMaps(flatTrainer(a.t), flatTrainer(b.t), b.name, 't');
    const teamA = new Map(a.team.map((m) => [m.uid, m]));
    const teamB = new Map(b.team.map((m) => [m.uid, m]));
    const boxA = new Map(a.boxes.map((m) => [m.uid, m]));
    const boxB = new Map(b.boxes.map((m) => [m.uid, m]));
    const line = (who: string, ct: Change['ct'], field: string, from: string, to: string, sev: Severity): Change =>
        ({ who, ct, field, key: 'dexId', from, to, sev });

    for (const [uid, mb] of teamB) {
        const ma = teamA.get(uid);
        const who = monName(mb);
        if (!ma) {
            out.push(boxA.has(uid)
                ? line(who, 'm', 'Taken out of a PC box', '—', speciesName(mb.dexId), 'info')
                : line(who, 'm', 'New Pokémon on the team', '—', speciesName(mb.dexId), 'warn'));
            continue;
        }
        if (ma.dexId !== mb.dexId) {
            const mega = str(ma.s.megaFrom) !== str(mb.s.megaFrom);
            if (mega) {
                /* The Mega's rules set its numbers (card/mega.ts): one line. */
                out.push({ ...line(who, 'm', mb.s.megaFrom ? 'Mega Evolved' : 'Reverted from Mega', speciesName(ma.dexId), speciesName(mb.dexId), 'info'), why: 'Mega Evolution' });
                continue;
            }
            out.push(line(who, 'm', 'Species', speciesName(ma.dexId), speciesName(mb.dexId), 'warn'));
        }
        out.push(...diffMaps(flatMon(ma), flatMon(mb), who, 'm'));
    }
    for (const [uid, ma] of teamA) {
        if (teamB.has(uid)) continue;
        out.push(boxB.has(uid)
            ? line(monName(ma), 'm', 'Put in a PC box', speciesName(ma.dexId), '—', 'info')
            : line(monName(ma), 'm', 'Gone from the team', speciesName(ma.dexId), '—', 'info'));
    }
    for (const [uid, mb] of boxB) {
        if (boxA.has(uid) || teamA.has(uid)) continue;
        out.push(line(monName(mb), 'b', 'New Pokémon in a PC box', '—', speciesName(mb.dexId), 'warn'));
    }
    for (const [uid, ma] of boxA) {
        if (boxB.has(uid) || teamB.has(uid)) continue;
        out.push(line(monName(ma), 'b', 'Gone from the PC boxes', speciesName(ma.dexId), '—', 'info'));
    }
    return out;
}

/** One line of a change, for the exported text. */
export function changeText(c: Change): string {
    const d = c.delta !== undefined ? ' (' + (c.delta > 0 ? '+' : '') + c.delta + ')' : '';
    return (c.sev === 'warn' ? '[!] ' : '    ') + c.who + ' · ' + c.field + ': ' + c.from + ' → ' + c.to + d
        + (c.why ? ' — ' + c.why : '');
}
