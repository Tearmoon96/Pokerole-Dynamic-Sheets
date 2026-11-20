/* Sync: a player's copy of their own trainer (watchSheet.ts) written into the
   GM's copy of it, so the GM can take a player's changes in one go instead of
   one by one from Compare.

   Pure: (GM's trainer, player's copy) -> the GM's trainer changed in place,
   and what could not be taken. The copy is cut down on purpose, so this
   writes only what came whole:
   - a field equal to the GM's, as the copy would show it, is not touched, so
     the GM's pictures, notes, long texts and anything else that never travels
     stay as they are;
   - a changed field whose copy may have been cut (a text at the length limit,
     a list or object at its cap, a list with an entry too deep to travel) is
     left alone and named in `skipped`;
   - a key the GM's copy has and the player's does not is deleted only when it
     would have travelled: then the player took it off.
   The team is matched by uid: a Pokémon on one team and not the other is named
   in `skipped` (adding or taking one off is the GM's to do), and boxes are not
   touched, as the copy carries only their names. */

import type { TrainerState } from '../state/types';
import type { WatchSheet } from './watchSheet';
import {
    MAX_KEYS, MAX_LIST, MAX_TEXT, MODS_SKIP, M_SKIP, T_SKIP, clean, cleanMods, isRec, monName, speciesName, words,
} from './watchSheet';

type Rec = Record<string, unknown>;

export interface SyncResult {
    /** Fields written, the trainer's and the team's. */
    changed: number;
    /** What was left as it was, and why, one line each. */
    skipped: string[];
}

const CUT = new Error('cut');
/** How deep a field sits as the GM keeps the copy: parseWatchSheet cleans the
    whole record at 1, so each field at 2 — one level shallower than sent. */
const FIELD = 2;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The GM's value with the copy's written over it, at `depth` as clean() counts. */
function merge(gm: unknown, cp: unknown, depth: number): unknown {
    if (same(clean(gm, depth), cp)) return gm;
    if (typeof cp === 'string') {
        if (cp.length >= MAX_TEXT) throw CUT;
        return cp;
    }
    if (!isRec(cp) && !Array.isArray(cp)) return cp;
    if (Array.isArray(cp)) {
        if (cp.length >= MAX_LIST) throw CUT;
        const g = Array.isArray(gm) ? gm : [];
        /* An entry that did not travel would put the rest out of step. */
        if (g.some((x) => clean(x, depth + 1) === undefined)) throw CUT;
        return cp.map((x, i) => merge(g[i], x, depth + 1));
    }
    if (Object.keys(cp).length >= MAX_KEYS) throw CUT;
    const g: Rec = isRec(gm) ? gm : {};
    const out: Rec = {};
    for (const [k, v] of Object.entries(g)) {
        if (!(k in cp) && clean(v, depth + 1) === undefined) out[k] = v;   // never travels: kept
    }
    for (const [k, v] of Object.entries(cp)) out[k] = merge(g[k], v, depth + 1);
    return out;
}

/** The combat offsets travel without what Will bought off pain: that stays the GM's. */
function mergeMods(gm: unknown, cp: unknown): Rec | undefined {
    const mine = cleanMods(gm);
    const theirs = isRec(cp) ? cp : undefined;
    if (same(mine, theirs)) return isRec(gm) ? gm : undefined;
    const out: Rec = { ...(theirs ?? {}) };
    if (isRec(gm)) for (const k of MODS_SKIP) if (k in gm) out[k] = gm[k];
    return Object.keys(out).length ? out : undefined;
}

/** One record (the trainer, or a Pokémon's sheet) taking the copy's fields. */
function syncRecord(target: Rec, copy: Rec, skip: Set<string>, who: string, res: SyncResult): void {
    for (const [k, v] of Object.entries(target)) {
        if (skip.has(k) || k in copy || k === 'combatMods') continue;
        if (clean(v, FIELD) !== undefined) { delete target[k]; res.changed++; }
    }
    for (const [k, v] of Object.entries(copy)) {
        if (skip.has(k)) continue;
        if (k === 'combatMods') {
            const m = mergeMods(target[k], v);
            if (m === target[k]) continue;
            if (m) target[k] = m; else delete target[k];
            res.changed++;
            continue;
        }
        try {
            const x = merge(target[k], v, FIELD);
            if (x !== target[k]) { target[k] = x; res.changed++; }
        } catch {
            res.skipped.push(who + ': ' + words(k) + ' (too long to travel: copy it by hand)');
        }
    }
    if (!('combatMods' in copy) && 'combatMods' in target) {
        const m = mergeMods(target.combatMods, undefined);
        if (m !== target.combatMods) {
            if (m) target.combatMods = m; else delete target.combatMods;
            res.changed++;
        }
    }
}

export function syncTrainer(gm: TrainerState, copy: WatchSheet): SyncResult {
    const res: SyncResult = { changed: 0, skipped: [] };
    const who = gm.name || copy.name;
    syncRecord(gm as unknown as Rec, copy.t, T_SKIP, who, res);

    const team = Array.isArray(gm.team) ? gm.team : [];
    const theirs = new Set(copy.team.map((m) => m.uid));
    for (const m of copy.team) {
        const slot = team.find((s) => s && s.uid === m.uid);
        if (!slot) {
            res.skipped.push(monName(m) + ': on their team, not on yours (add it by hand)');
            continue;
        }
        if (slot.dexId !== m.dexId) { slot.dexId = m.dexId; res.changed++; }
        const sheet = (isRec(slot.sheet) ? slot.sheet : {}) as Rec;
        if (typeof sheet.dexId === 'string' && sheet.dexId !== m.dexId) sheet.dexId = m.dexId;
        syncRecord(sheet, m.s, M_SKIP, monName(m), res);
        slot.sheet = sheet as typeof slot.sheet;
    }
    for (const s of team) {
        if (s && s.uid && s.dexId && !theirs.has(s.uid)) {
            const nick = isRec(s.sheet) && typeof s.sheet.nickname === 'string' ? s.sheet.nickname : '';
            res.skipped.push((nick || speciesName(s.dexId)) + ': on your team, not on theirs (take it off by hand)');
        }
    }
    return res;
}
