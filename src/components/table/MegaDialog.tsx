import { useEffect, useState } from 'react';
import type { PokedexEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';
import { megaBlocker, megaEffects, megaShownName, savedMegaMoves } from '../../card/mega';
import { activeMegaRules, megaRulesSource } from '../../lib/megaRules';

/* Mega Evolving, or reverting, from the character panel — the card's own
   confirmation in the table's dialog: what the rules in force will do, and
   whether the Mega keeps a moveset of its own. The panel does the writing. */

export interface MegaAsk {
    /** The slot on the team. */
    idx: number;
    into: boolean;
    /** The Mega to become, or the form to go back to. */
    target: PokedexEntry;
    sheet: Partial<CardSheet>;
    /** Several Megas (Charizard X / Y): the others to choose between. */
    choices: PokedexEntry[];
}

export function MegaDialog({ ask, onCancel, onConfirm }: {
    ask: MegaAsk | null;
    onCancel: () => void;
    onConfirm: (ask: MegaAsk, ownMoves: boolean) => void;
}) {
    const [own, setOwn] = useState(false);
    const [pick, setPick] = useState<PokedexEntry | null>(null);
    const target = pick ?? ask?.target ?? null;

    useEffect(() => {
        if (!ask) return;
        setPick(null);
        setOwn(!!(ask.into && savedMegaMoves(ask.sheet, ask.target._id)));
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [ask, onCancel]);

    if (!ask || !target) return <div className="gm-overlay" />;

    const rules = activeMegaRules();
    const source = megaRulesSource();
    const blocked = ask.into ? megaBlocker(ask.sheet as CardSheet, rules) : '';
    const saved = ask.into ? savedMegaMoves(ask.sheet, target._id) : null;

    return (
        <div className="gm-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="gm-dialog mega-dialog" role="dialog" id="table-mega-dialog"
                aria-label={ask.into ? 'Mega Evolve' : 'Revert Mega Evolution'}>
                <div className="gm-dialog-title">
                    <i className="fa-solid fa-atom"></i>
                    <span>{ask.into ? 'Mega Evolve?' : 'Revert Mega Evolution?'}</span>
                </div>
                <div className="gm-dialog-text">
                    {ask.into
                        ? <>Into <strong>{megaShownName(target.Name)}</strong> — temporary, revert it at any time.</>
                        : <>Back to <strong>{megaShownName(target.Name)}</strong>.</>}
                </div>
                {ask.into && ask.choices.length > 1 && (
                    <div className="mega-choices" role="radiogroup" aria-label="Which Mega">
                        {ask.choices.map((c) => (
                            <button
                                key={c.Name}
                                className={c._id === target._id ? 'on' : ''}
                                aria-pressed={c._id === target._id}
                                onClick={() => { setPick(c); setOwn(!!savedMegaMoves(ask.sheet, c._id)); }}
                            >
                                {megaShownName(c.Name)}
                            </button>
                        ))}
                    </div>
                )}
                <ul className="mega-effects">
                    {megaEffects(rules, ask.sheet, ask.into).map((line) => <li key={line}>{line}</li>)}
                </ul>
                {ask.into && rules.moves && !blocked && (
                    <fieldset className="mega-moves">
                        <legend>A different moveset for the Mega form?</legend>
                        <label>
                            <input type="radio" name="table-mega-moves" checked={!own} onChange={() => setOwn(false)} />
                            <span>No — keep its current moves</span>
                        </label>
                        <label>
                            <input type="radio" name="table-mega-moves" checked={own} onChange={() => setOwn(true)}
                                data-mega-own="" />
                            <span>
                                Yes — {saved
                                    ? <>its Mega moves from last time ({saved.length} pinned)</>
                                    : <>start with none pinned; pin the Mega&rsquo;s own on its card</>}.
                                {' '}The current pins come back when it reverts.
                            </span>
                        </label>
                    </fieldset>
                )}
                {blocked && <p className="mega-blocked">{blocked}</p>}
                <p className="mega-source">
                    {source === 'table' ? 'Rules set by the GM of this table.'
                        : source === 'gm' ? 'Rules from your GM screen’s Settings.'
                            : 'The Core Book’s rules.'}
                </p>
                <div className="gm-dialog-actions">
                    <button onClick={onCancel}>Cancel</button>
                    <button className="go" id="table-mega-ok" disabled={!!blocked}
                        onClick={() => onConfirm({ ...ask, target }, own)}>
                        {ask.into ? 'Mega Evolve' : 'Revert'}
                    </button>
                </div>
            </div>
        </div>
    );
}
