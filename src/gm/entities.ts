import type { PokedexEntry } from '../data/types';
import type { CardSheet } from '../card/types';
import type { TrainerState } from '../state/types';
import type { GmCombatant, GmState, GmWild } from './types';
import { STATUS_ICONS, normalizeStatus } from './ailments';
import type { GmStatus } from './ailments';
import { monPoolMax, resolvePoolValue, trainerPoolMax, trainerPoolValue } from './pools';
import { mutateWorkingTrainer, workingTrainerData } from './workingSet';

/* One way to reach any subject on the screen.

   Trainers, team Pokémon, wilds and hand-typed combatants keep their status in
   four different places. Everything addresses them through one token so the
   chips, the combat rows and the ailment popover do not each need to know which
   is which.

     t:<trainerIndex>          a trainer, status in its shared record
     m:<trainerIndex>:<slot>   a team Pokémon, status in its card sheet
     w:<wildGid>               a wild, status in its wild sheet
     c:<participantId>         a name typed into the combat list

   Two spellings of the same address. A token built during a render may name its
   trainer by index — the markup is rebuilt anyway. A token STORED on a combat
   participant may not: an index goes stale the moment the roster is reordered or
   a trainer is dropped, and the row it belonged to then resolves to nothing and
   quietly loses its status strip. Stored ones therefore name the trainer by id,
   in the capitalised forms, and are translated back to an index here.

       t:<i>  m:<i>:<slot>      live, built for this render
       T:<id> M:<id>:<slot>     stored, survives the roster moving */

export function wildKey(dexId: string): string {
    return 'pokerole_wild_' + dexId + '_sheet';
}

/** A wild that has been pushed to a card tab is edited there, so the live copy
    in localStorage wins over the one loaded from file. */
export function wildLiveSheet(w: GmWild): Partial<CardSheet> {
    if (w.pushed) {
        try {
            const live = JSON.parse(localStorage.getItem(wildKey(w.dexId)) || 'null');
            if (live) return live;
        } catch { /* fall through to the loaded copy */ }
    }
    return w.sheet || {};
}

export function trainerIdAt(state: GmState, ti: number): string | null {
    return state.trainerIds[ti] || null;
}

export function monShownName(
    dexById: (id: string) => PokedexEntry | null, dexId: string, sheet: Partial<CardSheet> | null,
): string {
    const nick = ((sheet && sheet.nickname) || '').trim();
    if (nick) return nick;
    const p = dexById(dexId);
    return p ? p.Name : dexId;
}

/** Returns null when that trainer is no longer on the screen at all, so callers
    can fall back rather than render an empty row. */
export function resolveToken(state: GmState, token: string): string | null {
    const p = String(token || '').split(':');
    if (p[0] !== 'T' && p[0] !== 'M') return token;
    const i = state.trainerIds.indexOf(p[1]);
    if (i < 0) return null;
    return p[0] === 'T' ? 't:' + i : 'm:' + i + ':' + p[2];
}

export interface EntityRef {
    kind: 'trainer' | 'mon' | 'wild' | 'custom';
    token: string;
    name: string;
    status: GmStatus;
    rank: string;
    data?: TrainerState;
    dex?: PokedexEntry | null;
    sheet?: Partial<CardSheet>;
    participant?: Record<string, unknown>;
    value: (n: string) => number;
}

export function entityRef(
    state: GmState,
    dexById: (id: string) => PokedexEntry | null,
    rawToken: string,
): EntityRef | null {
    const token = resolveToken(state, rawToken);
    const p = String(token || '').split(':');

    if (p[0] === 't') {
        const id = trainerIdAt(state, +p[1]);
        const data = id ? workingTrainerData(id) : null;
        if (!data) return null;
        return {
            kind: 'trainer', token: token!, name: data.name || 'Trainer', data,
            status: normalizeStatus((data as unknown as Record<string, unknown>).status),
            rank: data.rank || '',
            value: (n) => trainerPoolValue(data, n),
        };
    }
    if (p[0] === 'm') {
        const id = trainerIdAt(state, +p[1]);
        const t = id ? workingTrainerData(id) : null;
        const slot = t && Array.isArray(t.team) ? t.team[+p[2]] : null;
        if (!slot || !slot.dexId) return null;
        const dex = dexById(slot.dexId);
        const sheet = (slot.sheet || {}) as Partial<CardSheet>;
        return {
            kind: 'mon', token: token!, name: monShownName(dexById, slot.dexId, sheet), dex, sheet,
            status: normalizeStatus(sheet.status), rank: sheet.rank || '',
            value: (n) => resolvePoolValue(dex, sheet, n) || 0,
        };
    }
    if (p[0] === 'w') {
        const w = state.wilds.find((x) => x.gid === p[1]);
        if (!w) return null;
        const sheet = wildLiveSheet(w);
        const dex = dexById(w.dexId);
        return {
            kind: 'wild', token: token!, name: monShownName(dexById, w.dexId, sheet), dex, sheet,
            status: normalizeStatus(sheet.status), rank: sheet.rank || '',
            value: (n) => resolvePoolValue(dex, sheet, n) || 0,
        };
    }
    if (p[0] === 'c') {
        const part = state.combat.participants.find(
            (x) => (x as unknown as Record<string, unknown>).pid === p[1]);
        if (!part) return null;
        return {
            kind: 'custom', token: token!,
            name: String((part as unknown as Record<string, unknown>).label || ''),
            participant: part as unknown as Record<string, unknown>,
            status: normalizeStatus((part as unknown as Record<string, unknown>).status),
            rank: '',
            /* Nothing to resolve a pool against, so a hand-typed combatant's
               cure rolls are left for the GM to size */
            value: () => 0,
        };
    }
    return null;
}

/* The address a combat row should be drawn and clicked through. Falls back to
   the participant itself when its source has gone — a row whose trainer was
   removed keeps a working status strip of its own instead of rendering none. */
export function participantToken(
    state: GmState,
    dexById: (id: string) => PokedexEntry | null,
    p: GmCombatant,
): string {
    const src = (p as unknown as Record<string, string>).src;
    if (src && resolveToken(state, src) && entityRef(state, dexById, src)) return src;
    return 'c:' + (p as unknown as Record<string, string>).pid;
}

/* Which combatant, if any, a token names. Both sides go through resolveToken
   first: a participant stores `M:<id>:<slot>` while the roster hands out
   `m:<index>:<slot>`, and the two only line up once the id has been turned back
   into an index. */
export function participantForToken(
    state: GmState,
    dexById: (id: string) => PokedexEntry | null,
    token: string,
): GmCombatant | null {
    const want = resolveToken(state, token);
    if (!want) return null;
    return state.combat.participants.find(
        (p) => resolveToken(state, participantToken(state, dexById, p)) === want) || null;
}

/** Write a subject's status back where it came from. Trainers and team Pokémon
    go into the shared working set, so an open card sees it. */
export function writeStatus(
    state: GmState,
    token: string,
    mutate: (st: GmStatus) => void,
    onWildChanged: () => void,
): void {
    const p = String(resolveToken(state, token) || '').split(':');
    if (p[0] === 't') {
        const id = trainerIdAt(state, +p[1]);
        if (!id) return;
        mutateWorkingTrainer(id, (data) => {
            const d = data as unknown as Record<string, unknown>;
            d.status = normalizeStatus(d.status);
            mutate(d.status as GmStatus);
        });
    } else if (p[0] === 'm') {
        const id = trainerIdAt(state, +p[1]);
        if (!id) return;
        mutateWorkingTrainer(id, (data) => {
            const slot = (data.team || [])[+p[2]];
            if (!slot) return;
            if (!slot.sheet) slot.sheet = {};
            slot.sheet.status = normalizeStatus(slot.sheet.status);
            mutate(slot.sheet.status as GmStatus);
        });
    } else if (p[0] === 'w') {
        const w = state.wilds.find((x) => x.gid === p[1]);
        if (!w) return;
        const sheet = wildLiveSheet(w) as Record<string, unknown>;
        sheet.status = normalizeStatus(sheet.status);
        mutate(sheet.status as GmStatus);
        if (w.pushed && localStorage.getItem(wildKey(w.dexId))) {
            try { localStorage.setItem(wildKey(w.dexId), JSON.stringify(sheet)); }
            catch { /* quota */ }
        } else {
            w.sheet = sheet as unknown as CardSheet;
            onWildChanged();
        }
    } else if (p[0] === 'c') {
        const part = state.combat.participants.find(
            (x) => (x as unknown as Record<string, unknown>).pid === p[1]);
        if (!part) return;
        const rec = part as unknown as Record<string, unknown>;
        rec.status = normalizeStatus(rec.status);
        mutate(rec.status as GmStatus);
        onWildChanged();
    }
}

/* Take an ailment off a subject, whichever chip owns it. A staged one goes to
   stage zero rather than down a step: this is a cure, not an undo. */
export function clearAilment(
    state: GmState,
    token: string,
    ailKey: string,
    onWildChanged: () => void,
): void {
    const icon = STATUS_ICONS.find((i) => i.stages.includes(ailKey));
    if (!icon) return;
    writeStatus(state, token, (st) => {
        if (!icon.exclusive) { (st as unknown as Record<string, boolean>)[icon.key] = false; return; }
        if (icon.stageField) st[icon.stageField] = 0;
        st.major = null;
    }, onWildChanged);
}

/** How many successes have been banked towards shaking an ailment off. */
export function cureProgress(
    state: GmState,
    dexById: (id: string) => PokedexEntry | null,
    token: string,
    ailKey: string,
): number {
    const p = participantForToken(state, dexById, token);
    if (!p) return 0;
    const cure = (p as unknown as Record<string, Record<string, number>>).cure;
    return (cure && cure[ailKey]) || 0;
}

/** Nudge an HP or Will pool, clamped to its own maximum. Trainers and team
    Pokémon go through the shared working set so an open sheet sees the change;
    a wild goes back wherever its sheet came from. */
export function adjustPool(
    state: GmState,
    dexById: (id: string) => PokedexEntry | null,
    target: string,
    key: 'hp' | 'will',
    delta: number,
    onWildChanged: () => void,
): void {
    const parts = String(target).split(':');
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

    if (parts[0] === 't') {
        const id = state.trainerIds[+parts[1]];
        if (!id) return;
        mutateWorkingTrainer(id, (data) => {
            data[key] = clamp((data[key] || 0) + delta, trainerPoolMax(data, key));
        });
    } else if (parts[0] === 'm') {
        const id = state.trainerIds[+parts[1]];
        const slotIdx = +parts[2];
        if (!id) return;
        mutateWorkingTrainer(id, (data) => {
            const slot = (data.team || [])[slotIdx];
            if (!slot) return;
            if (!slot.sheet) slot.sheet = {};
            const sheet = slot.sheet as unknown as Record<string, number>;
            const max = monPoolMax(dexById(slot.dexId), slot.sheet as Partial<CardSheet>, key);
            sheet[key] = clamp((sheet[key] || 0) + delta, max);
        });
    } else if (parts[0] === 'w') {
        const w = state.wilds.find((x) => x.gid === parts[1]);
        if (!w) return;
        const sheet = wildLiveSheet(w) as unknown as Record<string, number>;
        const max = monPoolMax(dexById(w.dexId), sheet as Partial<CardSheet>, key);
        sheet[key] = clamp((sheet[key] || 0) + delta, max);
        /* Write back wherever that sheet came from: the card's own key once the
           wild has been opened, otherwise our loaded copy */
        if (w.pushed && localStorage.getItem(wildKey(w.dexId))) {
            try { localStorage.setItem(wildKey(w.dexId), JSON.stringify(sheet)); }
            catch { /* quota: the bar below still shows the attempt */ }
        } else {
            w.sheet = sheet as unknown as CardSheet;
            onWildChanged();
        }
    }
}
