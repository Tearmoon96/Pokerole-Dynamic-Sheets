/* A player's character, as much of it as the GM's copy needs.

   When a player enters a fight, the GM screen gets a temporary copy of their
   trainer and the Pokémon they send out (src/gm/tablePcs.ts). It travels
   through the relay, so it is cut down to the fields the pools, the move panel
   and the status strip actually read — `trainerPoolValue` / `trainerPoolMax`
   for a trainer, `resolvePoolValue` / `monPoolMax` / `monPoolCur` /
   `pinnedMoveObjects` / `computeMoveTotals` for a Pokémon — and nothing else:
   no photo, no notes, no bag. A whole sheet would not fit in a frame anyway.

   The parsers follow validate.ts: exactly these fields or the message is
   dropped. Text is cleaned, numbers are bounded, every list is capped. */

import { LIMITS } from './protocol';
import { UNSAFE_TEXT } from './text';
import type { GmStatus } from '../gm/ailments';
import type { TrainerState } from '../state/types';
import type { CardSheet, MoveOverride } from '../card/types';

export interface SlimTrainer {
    name: string;
    rank: string;
    hp: number;
    will: number;
    hpMax: number | null;
    willMax: number | null;
    hpMaxBonus: number;
    willMaxBonus: number;
    stats: Record<string, number>;
    skills: Record<string, number>;
    extras: { name: string; value: number }[];
    status: GmStatus;
}

export interface SlimMonSheet {
    nickname: string;
    rank: string;
    hp: number | null;
    will: number | null;
    hpMax: number | null;
    willMax: number | null;
    hpMaxBonus: number;
    willMaxBonus: number;
    heldItem: string;
    trainedStats: Record<string, number>;
    customBaseStats: Record<string, number>;
    skills: Record<string, number>;
    categoryRatings: Record<string, number>;
    specialties: { name: string; value: number }[];
    loyalty: number;
    happiness: number;
    disobedience: number;
    pinnedMoves: string[];
    /** Only the pinned ones: nothing else is ever looked up. */
    customMoves: string[];
    moveOverrides: Record<string, MoveOverride>;
    status: GmStatus;
}

export interface SlimMon {
    dexId: string;
    sheet: SlimMonSheet;
}

/** Which of a player's characters: their trainer, or a team slot. */
export type CharKey = 't' | '0' | '1' | '2' | '3' | '4' | '5';
export const CHAR_KEYS: readonly CharKey[] = ['t', '0', '1', '2', '3', '4', '5'];
export const isCharKey = (v: unknown): v is CharKey => typeof v === 'string' && (CHAR_KEYS as readonly string[]).includes(v);

const MAX_TEXT = 40;
const MAX_MOVE_NAME = 48;
const MAX_PINNED = 12;
const MAX_ENTRIES = 40;
const MAX_LIST = 16;
const MIN_N = -99;
const MAX_N = 999;

/* ---------------------------------------------------------- projection */

const num = (v: unknown, dflt = 0): number =>
    (typeof v === 'number' && Number.isFinite(v) ? Math.max(MIN_N, Math.min(MAX_N, Math.round(v))) : dflt);
const numOrNull = (v: unknown): number | null =>
    (typeof v === 'number' && Number.isFinite(v) ? num(v) : null);
const text = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.slice(0, max) : '');

function numberMap(v: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (!v || typeof v !== 'object') return out;
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, MAX_ENTRIES)) {
        if (KEY_RE.test(k) && typeof x === 'number' && Number.isFinite(x)) out[k] = num(x);
    }
    return out;
}

function named(v: unknown): { name: string; value: number }[] {
    return (Array.isArray(v) ? v : [])
        .filter((x) => x && typeof x.name === 'string' && x.name.trim())
        .slice(0, MAX_LIST)
        .map((x) => ({ name: text(x.name), value: num(x.value) }));
}

function slimStatus(v: unknown): GmStatus {
    const s = (v && typeof v === 'object' ? v : {}) as Partial<GmStatus>;
    return {
        major: typeof s.major === 'string' && MAJORS.includes(s.major) ? s.major : null,
        burnDegree: Math.max(0, Math.min(3, num(s.burnDegree))),
        poisonStage: Math.max(0, Math.min(2, num(s.poisonStage))),
        confusion: !!s.confusion, flinch: !!s.flinch, inLove: !!s.inLove,
    };
}

export function slimTrainer(t: TrainerState): SlimTrainer {
    return {
        name: text(t.name) || 'Trainer',
        rank: text(t.rank),
        hp: num(t.hp),
        will: num(t.will),
        hpMax: numOrNull(t.hpMax),
        willMax: numOrNull(t.willMax),
        hpMaxBonus: num(t.hpMaxBonus),
        willMaxBonus: num(t.willMaxBonus),
        stats: numberMap(t.stats),
        skills: numberMap(t.skills),
        extras: named(t.extras),
        status: slimStatus((t as unknown as { status?: unknown }).status),
    };
}

export function slimMon(dexId: string, sheet: Partial<CardSheet> | null): SlimMon {
    const s = (sheet || {}) as Partial<CardSheet>;
    const pinned = (Array.isArray(s.pinnedMoves) ? s.pinnedMoves : [])
        .filter((m): m is string => typeof m === 'string' && m.length <= MAX_MOVE_NAME)
        .slice(0, MAX_PINNED);
    const overrides: Record<string, MoveOverride> = {};
    for (const m of pinned) {
        const o = s.moveOverrides && s.moveOverrides[m];
        if (o && typeof o === 'object') overrides[m] = slimOverride(o);
    }
    return {
        dexId: text(dexId, 80),
        sheet: {
            nickname: text(s.nickname),
            rank: text(s.rank),
            hp: numOrNull(s.hp),
            will: numOrNull(s.will),
            hpMax: numOrNull(s.hpMax),
            willMax: numOrNull(s.willMax),
            hpMaxBonus: num(s.hpMaxBonus),
            willMaxBonus: num(s.willMaxBonus),
            heldItem: text(s.heldItem, 60),
            trainedStats: numberMap(s.trainedStats),
            customBaseStats: numberMap(s.customBaseStats),
            skills: numberMap(s.skills),
            categoryRatings: numberMap(s.categoryRatings),
            specialties: named(s.specialties),
            loyalty: num(s.loyalty),
            happiness: num(s.happiness),
            disobedience: num(s.disobedience),
            pinnedMoves: pinned,
            customMoves: (Array.isArray(s.customMoves) ? s.customMoves : []).filter((m) => pinned.includes(m)),
            moveOverrides: overrides,
            status: slimStatus(s.status),
        },
    };
}

const OVERRIDE_TEXT = ['acc1', 'acc2', 'acc3', 'damage', 'target', 'effect', 'ailment'] as const;
const OVERRIDE_NUM = ['power', 'accOffset', 'powOffset'] as const;

function slimOverride(o: MoveOverride): MoveOverride {
    const out: MoveOverride = {};
    for (const k of OVERRIDE_TEXT) if (typeof o[k] === 'string') out[k] = text(o[k], k === 'effect' ? 400 : 60);
    for (const k of OVERRIDE_NUM) if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = num(o[k]);
    return out;
}

/* -------------------------------------------------------------- parsing */

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9]{0,23}$/;
/** A Pokédex `_id`: `pikachu`, `farfetch'd`, `tauros-paldea`. */
export const DEX_ID_RE = /^[a-z0-9][a-z0-9_.'-]{0,79}$/i;
/** A Pokédex `Image`, a bare file name: never a path. */
export const IMAGE_RE = /^[a-z0-9][a-z0-9 ._()'%&+-]{0,79}\.(png|webp|gif|jpe?g)$/i;
const MAJORS = ['burn', 'paralysis', 'poison', 'frozen', 'sleep'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const exactly = (o: Rec, allowed: readonly string[]) => Object.keys(o).every((k) => allowed.includes(k));
const intIn = (v: unknown, min = MIN_N, max = MAX_N): number | null =>
    (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

function cleanStr(v: unknown, max: number): string | null {
    if (typeof v !== 'string' || v.length > max) return null;
    return v.normalize('NFC').replace(UNSAFE_TEXT, '');
}

function parseNumMap(v: unknown): Record<string, number> | null {
    if (!isRec(v)) return null;
    const keys = Object.keys(v);
    if (keys.length > MAX_ENTRIES) return null;
    const out: Record<string, number> = {};
    for (const k of keys) {
        const n = intIn(v[k]);
        if (!KEY_RE.test(k) || n === null) return null;
        out[k] = n;
    }
    return out;
}

function parseNamed(v: unknown): { name: string; value: number }[] | null {
    if (!Array.isArray(v) || v.length > MAX_LIST) return null;
    const out: { name: string; value: number }[] = [];
    for (const x of v) {
        if (!isRec(x) || !exactly(x, ['name', 'value'])) return null;
        const name = cleanStr(x.name, MAX_TEXT);
        const value = intIn(x.value);
        if (!name || value === null) return null;
        out.push({ name, value });
    }
    return out;
}

export function parseStatus(v: unknown): GmStatus | null {
    if (!isRec(v) || !exactly(v, ['major', 'burnDegree', 'poisonStage', 'confusion', 'flinch', 'inLove'])) return null;
    const major = v.major === null ? null : (typeof v.major === 'string' && MAJORS.includes(v.major) ? v.major : undefined);
    const burnDegree = intIn(v.burnDegree, 0, 3);
    const poisonStage = intIn(v.poisonStage, 0, 2);
    if (major === undefined || burnDegree === null || poisonStage === null) return null;
    if (typeof v.confusion !== 'boolean' || typeof v.flinch !== 'boolean' || typeof v.inLove !== 'boolean') return null;
    return { major, burnDegree, poisonStage, confusion: v.confusion, flinch: v.flinch, inLove: v.inLove };
}

const nullableInt = (v: unknown): number | null | undefined => (v === null ? null : (intIn(v) ?? undefined));

export function parseSlimTrainer(v: unknown): SlimTrainer | null {
    if (!isRec(v) || !exactly(v, ['name', 'rank', 'hp', 'will', 'hpMax', 'willMax', 'hpMaxBonus',
        'willMaxBonus', 'stats', 'skills', 'extras', 'status'])) return null;
    const name = cleanStr(v.name, MAX_TEXT);
    const rank = cleanStr(v.rank, MAX_TEXT);
    const hp = intIn(v.hp), will = intIn(v.will);
    const hpMax = nullableInt(v.hpMax), willMax = nullableInt(v.willMax);
    const hpMaxBonus = intIn(v.hpMaxBonus), willMaxBonus = intIn(v.willMaxBonus);
    const stats = parseNumMap(v.stats), skills = parseNumMap(v.skills);
    const extras = parseNamed(v.extras);
    const status = parseStatus(v.status);
    if (!name || rank === null || hp === null || will === null || hpMax === undefined || willMax === undefined
        || hpMaxBonus === null || willMaxBonus === null || !stats || !skills || !extras || !status) return null;
    return { name, rank, hp, will, hpMax, willMax, hpMaxBonus, willMaxBonus, stats, skills, extras, status };
}

function parseMoveNames(v: unknown, max: number): string[] | null {
    if (!Array.isArray(v) || v.length > max) return null;
    const out: string[] = [];
    for (const x of v) {
        const s = cleanStr(x, MAX_MOVE_NAME);
        if (!s) return null;
        out.push(s);
    }
    return out;
}

function parseOverride(v: unknown): MoveOverride | null {
    if (!isRec(v) || !exactly(v, [...OVERRIDE_TEXT, ...OVERRIDE_NUM])) return null;
    const out: MoveOverride = {};
    for (const k of OVERRIDE_TEXT) {
        if (v[k] === undefined) continue;
        const s = cleanStr(v[k], k === 'effect' ? 400 : 60);
        if (s === null) return null;
        out[k] = s;
    }
    for (const k of OVERRIDE_NUM) {
        if (v[k] === undefined) continue;
        const n = intIn(v[k]);
        if (n === null) return null;
        out[k] = n;
    }
    return out;
}

const SHEET_FIELDS = ['nickname', 'rank', 'hp', 'will', 'hpMax', 'willMax', 'hpMaxBonus', 'willMaxBonus',
    'heldItem', 'trainedStats', 'customBaseStats', 'skills', 'categoryRatings', 'specialties', 'loyalty',
    'happiness', 'disobedience', 'pinnedMoves', 'customMoves', 'moveOverrides', 'status'] as const;

export function parseSlimMon(v: unknown): SlimMon | null {
    if (!isRec(v) || !exactly(v, ['dexId', 'sheet'])) return null;
    if (typeof v.dexId !== 'string' || !DEX_ID_RE.test(v.dexId)) return null;
    const s = v.sheet;
    if (!isRec(s) || !exactly(s, SHEET_FIELDS)) return null;
    const nickname = cleanStr(s.nickname, MAX_TEXT), rank = cleanStr(s.rank, MAX_TEXT);
    const heldItem = cleanStr(s.heldItem, 60);
    const hp = nullableInt(s.hp), will = nullableInt(s.will);
    const hpMax = nullableInt(s.hpMax), willMax = nullableInt(s.willMax);
    const hpMaxBonus = intIn(s.hpMaxBonus), willMaxBonus = intIn(s.willMaxBonus);
    const loyalty = intIn(s.loyalty), happiness = intIn(s.happiness), disobedience = intIn(s.disobedience);
    const trainedStats = parseNumMap(s.trainedStats), customBaseStats = parseNumMap(s.customBaseStats);
    const skills = parseNumMap(s.skills), categoryRatings = parseNumMap(s.categoryRatings);
    const specialties = parseNamed(s.specialties);
    const pinnedMoves = parseMoveNames(s.pinnedMoves, MAX_PINNED);
    const customMoves = parseMoveNames(s.customMoves, MAX_PINNED);
    const status = parseStatus(s.status);
    if (nickname === null || rank === null || heldItem === null || hp === undefined || will === undefined
        || hpMax === undefined || willMax === undefined || hpMaxBonus === null || willMaxBonus === null
        || loyalty === null || happiness === null || disobedience === null || !trainedStats || !customBaseStats
        || !skills || !categoryRatings || !specialties || !pinnedMoves || !customMoves || !status) return null;
    if (!isRec(s.moveOverrides) || Object.keys(s.moveOverrides).length > MAX_PINNED) return null;
    const moveOverrides: Record<string, MoveOverride> = {};
    for (const [k, o] of Object.entries(s.moveOverrides)) {
        const parsed = parseOverride(o);
        if (!parsed || !pinnedMoves.includes(k)) return null;
        moveOverrides[k] = parsed;
    }
    return {
        dexId: v.dexId,
        sheet: {
            nickname, rank, hp, will, hpMax, willMax, hpMaxBonus, willMaxBonus, heldItem, trainedStats,
            customBaseStats, skills, categoryRatings, specialties, loyalty, happiness, disobedience,
            pinnedMoves, customMoves, moveOverrides, status,
        },
    };
}

/** A copy as JSON text stays well inside a frame: checked before it is sent. */
export function fitsOnWire(v: unknown): boolean {
    return JSON.stringify(v).length < LIMITS.MAX_WIRE_CHARS - 2048;
}
