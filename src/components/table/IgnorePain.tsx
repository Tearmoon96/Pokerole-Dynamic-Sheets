/* Ignore pain, under the Will buttons: Power Through the Pain for one
   character, chosen here (lib/pain.ts has the rule).

     a player   their trainer or a Pokémon of the team, on the sheets in this
                browser — the same write as the pain marks in My character;
     the GM     one of their own combatants in the fight on the table, and
                only while there is one. The GM screen holds those, so the
                choice goes there over the combat link and is checked and
                charged there (gm/tableCombat.ts npcPainOff).

   Each character offers −1 (the first tier, 1 Will), −2 (the second, once
   the first is paid, 2 Will) and −3 (both at once, 3 Will), lit only when its
   HP is in that pain. */

import { useState } from 'react';
import { useTable } from '../../table/TableContext';
import type { PokedexEntry } from '../../data/types';
import { useTableData } from './useTableData';
import { entityPain, entityPool, entityRef, setPainOff } from '../../gm/entities';
import { painChoices } from '../../lib/pain';
import type { PainChoice } from '../../lib/pain';
import {
    TRAINER_TOKEN, chosenTrainerId, monToken, soloState, useWorkingSet,
} from '../../table/character';
import { workingTrainerData } from '../../gm/workingSet';

interface Row {
    key: string;
    name: string;
    tiers: number;
    off: number;
    will: number;
    /** `to` tiers bought off, `cost` Will. */
    buy: (to: number, cost: number) => void;
}

export function IgnorePain() {
    const { session, state } = useTable();
    const [open, setOpen] = useState(false);
    const isHost = state.isHost;
    const fight = session.combat.view.turns;

    /* The GM's button is for the fight; with none on the table there is no
       one of theirs to choose. */
    if (isHost && !fight) return null;

    const ruleOff = state.painOff;
    return (
        <div className="ignore-pain" data-ignore-pain="">
            <button
                type="button"
                className={'will-btn pain-btn' + (open ? ' on' : '')}
                aria-expanded={open}
                aria-disabled={ruleOff}
                title={ruleOff
                    ? 'Pain is switched off at this table: there is nothing to ignore.'
                    : 'Power Through the Pain: spend Will so a character ignores its pain penalty.'}
                onClick={() => { if (!ruleOff) setOpen(!open); }}
            >
                <i className="fa-solid fa-heart-crack"></i> Ignore pain
            </button>
            {open && !ruleOff && (isHost ? <GmChoices /> : <PlayerChoices />)}
        </div>
    );
}

function GmChoices() {
    const { session } = useTable();
    const rows: Row[] = session.combat.view.pains.map((p) => ({
        key: p.id, name: p.name, tiers: p.tiers, off: p.off, will: p.will,
        buy: (to) => session.combat.ignorePain(p.id, to),
    }));
    return (
        <PainList
            rows={rows}
            empty={session.combat.view.linked
                ? 'None of your combatants in this fight has HP and Will to spend.'
                : 'The GM screen is not answering: open it in this browser.'}
        />
    );
}

function PlayerChoices() {
    const { session, state } = useTable();
    const [, refresh] = useWorkingSet();
    const data = useTableData();

    if (!data) {
        return (
            <p className="muted ignore-pain-note">
                <i className="fa-solid fa-circle-notch fa-spin"></i> Loading your sheets…
            </p>
        );
    }

    const trainerId = chosenTrainerId();
    const t = trainerId ? workingTrainerData(trainerId) : null;
    if (!trainerId || !t) return <PainList rows={[]} empty="No trainer in this browser yet: load one in My character." />;

    const solo = soloState(trainerId);
    const dexById = (id: string): PokedexEntry | null => data.pokemon.find((p) => p._id === id) || null;
    const tokens = [TRAINER_TOKEN].concat(
        (Array.isArray(t.team) ? t.team : []).map((slot, i) => (slot && slot.dexId ? monToken(i) : '')).filter(Boolean),
    );

    const rows: Row[] = [];
    for (const token of tokens) {
        const ref = entityRef(solo, dexById, token);
        const pain = entityPain(ref);
        const will = ref ? entityPool(ref, 'will') : null;
        if (!ref || !pain || !will) continue;
        rows.push({
            key: token, name: ref.name || '?', tiers: pain.tiers, off: pain.off, will: will.cur,
            buy: (to, cost) => {
                setPainOff(solo, dexById, token, to, cost, () => {});
                refresh();
                /* A roll already set up for this character carries the pain it
                   had then: it loses what was just bought off. */
                const prep = state.prep;
                if (prep && prep.will && prep.will.trainerId === trainerId && prep.will.token === token && prep.extras.pain) {
                    const now = entityPain(entityRef(solo, dexById, token));
                    const left = Math.max(0, Math.min(prep.extras.pain, now ? now.penalty : 0));
                    const extras = { ...prep.extras };
                    if (left) extras.pain = left; else delete extras.pain;
                    session.set('prep', { ...prep, extras });
                }
            },
        });
    }
    return <PainList rows={rows} empty="No sheet with HP and Will to spend." />;
}

const CHOICE_TITLE: Record<PainChoice['loss'], string> = {
    1: 'the first tier (half HP or less)',
    2: 'the second tier (1 HP), the first already paid',
    3: 'both tiers at once (1 HP)',
};

function PainList({ rows, empty }: { rows: Row[]; empty: string }) {
    if (!rows.length) return <p className="muted ignore-pain-note">{empty}</p>;
    return (
        <ul className="ignore-pain-list">
            {rows.map((r) => {
                const view = { tiers: r.tiers, off: r.off, penalty: 0, ruleOff: false };
                const now = [1, 2].slice(r.off, r.tiers).reduce((a, b) => a + b, 0);
                return (
                    <li key={r.key} className="ignore-pain-row" data-pain-row={r.key}>
                        <span className="ignore-pain-name" title={r.name}>{r.name}</span>
                        <span className={'ignore-pain-now' + (now ? ' hurt' : '')}>
                            {now ? '−' + now : r.tiers ? 'ignored' : 'no pain'}
                        </span>
                        <span className="ignore-pain-choices">
                            {painChoices(view, r.will).map((c) => (
                                <button
                                    key={c.loss} type="button"
                                    className={'pain-choice ' + c.state}
                                    data-pain-choice={c.loss}
                                    aria-disabled={c.state !== 'open'}
                                    aria-pressed={c.state === 'on'}
                                    title={'Ignore ' + CHOICE_TITLE[c.loss] + ': ' + c.cost + ' Will.'
                                        + (c.state === 'on' ? ' Already ignored.'
                                            : c.state === 'none' ? ' Not in this pain now.'
                                                : c.state === 'short' ? ' Not enough Will (' + r.will + ').' : '')}
                                    onClick={() => { if (c.state === 'open') r.buy(c.to, c.cost); }}
                                >
                                    {'−' + c.loss}<span className="will-cost">{c.cost}</span>
                                </button>
                            ))}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
