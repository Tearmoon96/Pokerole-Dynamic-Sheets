/* The player's own character at the table: one trainer out of this browser's
   shared working set, the same `pokerole_working` the Trainer License and the
   Pokémon cards read and write on this origin. Nothing here crosses the network
   by itself — the panel reads the sheets in place and writes its HP, Will and
   status changes straight back, so an open License or card sees them.

   The GM screen's entity helpers (src/gm/entities.ts) address a trainer by its
   index in `GmState.trainerIds` and read nothing of the state beyond that, the
   wilds and the combats. A state holding just this one trainer lets the panel
   use them unchanged, with the tokens `t:0` and `m:0:<slot>`. */

import { useEffect, useMemo, useState } from 'react';
import { WORKING_KEY } from '../state/constants';
import { defaultGmState } from '../gm/state';
import { invalidateWorking, mutateWorkingTrainer, readWorking, workingTrainerData } from '../gm/workingSet';
import type { GmState } from '../gm/types';

/** Which trainer this browser plays at the table. Its own key: the License's
    `active` is whichever sheet was last looked at there, not a choice of
    character. */
const CHOICE_KEY = 'pokerole_table_trainer';

export const TRAINER_TOKEN = 't:0';
export const monToken = (slot: number): string => 'm:0:' + slot;

export interface TrainerChoice { id: string; name: string }

export function workingTrainers(): TrainerChoice[] {
    const w = readWorking();
    return (w && Array.isArray(w.trainers) ? w.trainers : [])
        .filter((t) => t && t.id && t.data)
        .map((t) => ({ id: t.id, name: t.data.name || t.name || 'Unnamed' }));
}

/** The saved choice while it is still in the set; otherwise the License's
    active trainer, otherwise the first. */
export function chosenTrainerId(): string | null {
    const list = workingTrainers();
    if (!list.length) return null;
    let saved = '';
    try { saved = localStorage.getItem(CHOICE_KEY) || ''; } catch { /* private mode */ }
    if (list.some((t) => t.id === saved)) return saved;
    const w = readWorking();
    const active = w && w.trainers ? w.trainers[w.active] : null;
    return active && list.some((t) => t.id === active.id) ? active.id : list[0].id;
}

export function chooseTrainer(id: string): void {
    try { localStorage.setItem(CHOICE_KEY, id); } catch { /* it just will not be remembered */ }
}

/** A GM state holding one trainer, for the entity helpers. */
export function soloState(trainerId: string): GmState {
    return { ...defaultGmState(), trainerIds: [trainerId] };
}

export function useSoloState(trainerId: string | null): GmState | null {
    return useMemo(() => (trainerId ? soloState(trainerId) : null), [trainerId]);
}

/** Re-renders whenever the working set changes, in this tab or another: the
    same three routes the GM screen keeps its roster in step with (GmApp.tsx) —
    the `storage` event, focus, and a poll for a tab that is never focused.
    The second value is for this tab's own writes, which raise no event here. */
export function useWorkingSet(): [number, () => void] {
    const [version, setVersion] = useState(0);
    const refresh = useMemo(() => () => { invalidateWorking(); setVersion((v) => v + 1); }, []);
    useEffect(() => {
        let lastSeen = localStorage.getItem(WORKING_KEY);
        const bump = () => {
            lastSeen = localStorage.getItem(WORKING_KEY);
            refresh();
        };
        const onStorage = (e: StorageEvent) => { if (e.key === WORKING_KEY || e.key === null) bump(); };
        const poll = window.setInterval(() => {
            if (localStorage.getItem(WORKING_KEY) !== lastSeen) bump();
        }, 1000);
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', bump);
        return () => {
            clearInterval(poll);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', bump);
        };
    }, [refresh]);
    return [version, refresh];
}

/* A character's Will, for the buttons beside Roll (Pushing Fate, Take Your
   Chances), which sit outside the character panel and have no species data.
   A Pokémon whose sheet never stored a Will reads as `fallback`: what the
   panel worked out when it set the roll up. */

function slotSheet(t: { team?: unknown } | null, token: string): Record<string, unknown> | null {
    const team = t && Array.isArray(t.team) ? t.team : [];
    const slot = team[+token.split(':')[2]] as { sheet?: Record<string, unknown> | null } | undefined;
    if (!slot) return null;
    if (!slot.sheet) slot.sheet = {};
    return slot.sheet;
}

export function charWill(trainerId: string, token: string, fallback: number): number {
    const t = workingTrainerData(trainerId);
    if (!t) return 0;
    if (token === TRAINER_TOKEN) return t.will || 0;
    const sheet = slotSheet(t, token);
    const v = sheet ? sheet.will : undefined;
    return typeof v === 'number' && isFinite(v) ? v : fallback;
}

export function spendCharWill(trainerId: string, token: string, n: number, fallback: number): void {
    const now = charWill(trainerId, token, fallback);
    mutateWorkingTrainer(trainerId, (t) => {
        if (token === TRAINER_TOKEN) { t.will = Math.max(0, now - n); return; }
        const sheet = slotSheet(t, token);
        if (sheet) sheet.will = Math.max(0, now - n);
    });
}
