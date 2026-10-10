import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import type { RollMeta } from '../../gm/dice';
import { painFromHp, painPenalty } from '../../gm/moves';
import { resolvePoolValue } from '../../gm/pools';
import {
    entityPool, entityRef, participantForToken, trainerIdAt, wildLiveSheet,
} from '../../gm/entities';
import { workingTrainerData } from '../../gm/workingSet';
import { parsePcToken } from '../../gm/tablePcs';
import { monShownName } from '../../gm/entities';
import { MonTipBody, MoveTipShell, TrainerTipBody, useTipButtonState } from './MoveTip';
import type { PokedexEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';

/* The move list opens on its own button and stays up until it is closed again —
   it used to follow the pointer, which meant it appeared over whatever was being
   read on the way past. One is open at a time. The panel itself is MoveTip.tsx;
   this is the GM screen's side of it: which subject a token names, and a dice
   history to roll into. */

interface TipTarget { dexId: string; sheet: Partial<CardSheet>; owner: string }

const HIDDEN = <div className="mon-tooltip" id="mon-tooltip" style={{ display: 'none' }} />;

export function MovePanel({ token, onClose }: { token: string | null; onClose: () => void }) {
    const { state, store } = useGm();
    const { data } = useAppData();
    useTipButtonState(token);

    if (!token) return HIDDEN;

    const dexById = (id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null;

    const target = ((): TipTarget | null => {
        const parts = String(token || '').split(':');
        if (parts[0] === 'm') {
            const id = trainerIdAt(state, +parts[1]);
            const t = id ? workingTrainerData(id) : null;
            const slot = t && Array.isArray(t.team) ? t.team[+parts[2]] : null;
            if (!slot || !slot.dexId) return null;
            return { dexId: slot.dexId, sheet: (slot.sheet || {}) as Partial<CardSheet>, owner: t!.name || '' };
        }
        if (parts[0] === 'w') {
            const w = state.wilds.find((x) => x.gid === parts[1]);
            if (!w) return null;
            return { dexId: w.dexId, sheet: wildLiveSheet(w), owner: 'Wild' };
        }
        const pc = parsePcToken(token);
        if (pc && pc.key !== 't') {
            const copy = state.tablePcs[pc.member];
            const mon = copy && copy.mons[pc.key];
            if (!mon) return null;
            const trainer = copy.trainer ? copy.trainer.name : '';
            return {
                dexId: mon.dexId, sheet: mon.sheet as unknown as Partial<CardSheet>,
                owner: (trainer ? trainer + ' · ' : '') + copy.player,
            };
        }
        return null;
    })();

    /* Sets the roll up in the Dice panel rather than throwing it: the GM may
       still add or take away dice for a modifier, and then presses Roll. An
       empty pool is not a roll of one die — the same rule the ailment rolls
       follow. */
    const doRoll = (dice: number, meta: RollMeta) => {
        if (!(dice > 0)) return;
        store.update((s) => {
            s.dice = { ...s.dice, count: dice, sides: 6, prep: { ...meta } };
        });
    };

    /* What this round has already cost the subject. Only combatants have
       actions, so a subject sitting in the roster rolls its plain Accuracy with
       no target number. The pip is filled for the action being taken, so the
       count of filled pips IS the number of this action. Before the first pip
       is clicked the subject is on action one. */
    const part = participantForToken(state, dexById, token);
    const act = part ? Math.max(1, (part.acted as number) || 0) : null;

    /* A trainer resolves through EntityRef, which already reads a trainer's flat
       .json and a Pokemon's species-backed sheet the same way. */
    const asTrainer = entityRef(state, dexById, token);
    if (asTrainer && asTrainer.kind === 'trainer') {
        const hp = entityPool(asTrainer, 'hp');
        return (
            <MoveTipShell token={token} onClose={onClose}>
                <TrainerTipBody
                    name={asTrainer.name}
                    rank={asTrainer.rank}
                    value={asTrainer.value}
                    pain={hp ? painFromHp(hp.cur, hp.max) : 0}
                    act={act}
                    doRoll={doRoll}
                />
            </MoveTipShell>
        );
    }

    if (!target) return HIDDEN;

    const dex = dexById(target.dexId);
    if (!dex) {
        return (
            <MoveTipShell token={token} onClose={onClose}>
                <div className="tip-empty">Species data unavailable.</div>
            </MoveTipShell>
        );
    }

    const sheet = target.sheet;
    return (
        <MoveTipShell token={token} onClose={onClose}>
            <MonTipBody
                token={token}
                dex={dex}
                sheet={sheet}
                who={monShownName(dexById, target.dexId, sheet)}
                owner={target.owner}
                value={(n) => resolvePoolValue(dex, sheet, n) || 0}
                pain={painPenalty(dex, sheet)}
                act={act}
                doRoll={doRoll}
            />
        </MoveTipShell>
    );
}
