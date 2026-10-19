import { useEffect, useState } from 'react';
import {
    DEFAULT_MEGA_RULES, MAX_RULE_AMOUNT, readGmMegaRules, sameMegaRules, writeGmMegaRules,
} from '../../lib/megaRules';
import type { MegaRules } from '../../lib/megaRules';

/* The GM screen's Settings, behind the cog in the top bar. One section so far:
   the Mega-Evolution rules (src/lib/megaRules.ts), the Core Book's by default.
   Every change is saved at once; a rolling table hosted in this browser sends
   them to its players, whose cards and character panels Mega Evolve by them. */

type BoolKey = {
    [K in keyof MegaRules]: MegaRules[K] extends boolean ? K : never
}[keyof MegaRules];
type NumKey = 'cost' | 'hp' | 'will';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [rules, setRules] = useState<MegaRules>(readGmMegaRules);

    useEffect(() => {
        if (!open) return;
        setRules(readGmMegaRules());
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const set = (next: MegaRules) => { setRules(next); writeGmMegaRules(next); };
    const flip = (k: BoolKey) => set({ ...rules, [k]: !rules[k] });
    const amount = (k: NumKey, v: string) => {
        const n = parseInt(v, 10);
        set({ ...rules, [k]: Math.max(1, Math.min(MAX_RULE_AMOUNT, isNaN(n) ? 1 : n)) });
    };

    const toggle = (k: BoolKey, label: string, hint: string, extra?: React.ReactNode) => (
        <div className={'rule-row' + (rules[k] ? '' : ' off')} data-rule={k}>
            <label className="rule-switch">
                <input type="checkbox" checked={rules[k]} onChange={() => flip(k)} />
                <span className="rule-label">{label}</span>
            </label>
            {extra && <div className="rule-extra">{extra}</div>}
            <div className="rule-hint">{hint}</div>
        </div>
    );

    /* "All", or a number of points, for the two restoring rules. */
    const poolAmount = (allKey: 'hpAll' | 'willAll', numKey: 'hp' | 'will', unit: string) => (
        <>
            <select
                aria-label={unit + ' restored'}
                value={rules[allKey] ? 'all' : 'some'}
                disabled={!rules[allKey === 'hpAll' ? 'hpOn' : 'willOn']}
                onChange={(e) => set({ ...rules, [allKey]: e.currentTarget.value === 'all' })}
            >
                <option value="all">All of it</option>
                <option value="some">Up to…</option>
            </select>
            {!rules[allKey] && (
                <input
                    type="number" min={1} max={MAX_RULE_AMOUNT} aria-label={unit + ' points restored'}
                    value={rules[numKey]}
                    disabled={!rules[allKey === 'hpAll' ? 'hpOn' : 'willOn']}
                    onChange={(e) => amount(numKey, e.currentTarget.value)}
                />
            )}
            <span className="muted">{rules[allKey] ? '' : unit}</span>
        </>
    );

    const isBook = sameMegaRules(rules, DEFAULT_MEGA_RULES);
    /* Not in the DOM while closed: a role=dialog on the page reads as "a
       dialog is open" to the tours, which then never ask. */
    if (!open) return null;

    return (
        <div
            className="gm-overlay open"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="gm-dialog settings-dialog" role="dialog" aria-label="Settings" id="gm-settings">
                <div className="gm-dialog-title">
                    <i className="fa-solid fa-gear"></i>
                    <span>Settings</span>
                    <button className="icon-btn settings-close" aria-label="Close settings" onClick={onClose}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <section className="settings-section" id="mega-rules">
                    <div className="settings-head">
                        <h3><i className="fa-solid fa-atom"></i> Mega-Evolution rules</h3>
                        <button
                            className="icon-btn"
                            disabled={isBook}
                            title="Put back the Core Book's rules"
                            onClick={() => set({ ...DEFAULT_MEGA_RULES })}
                        >
                            <i className="fa-solid fa-rotate-left"></i> Core Book
                        </button>
                    </div>
                    <p className="muted settings-note">
                        Your rolling table sends these to every player: their cards and character
                        panels Mega Evolve by them. Saved at once.
                    </p>

                    {toggle('moves', 'Different moveset',
                        'On Mega Evolving, ask whether the Mega form uses moves of its own. Its pins are kept for the next time; the original pins come back on revert.')}
                    {toggle('costOn', 'Costs Will',
                        'Undergoing Mega-Evolution costs Will, paid by the original form.',
                        <>
                            <input
                                type="number" min={1} max={MAX_RULE_AMOUNT} aria-label="Will it costs"
                                value={rules.cost} disabled={!rules.costOn}
                                onChange={(e) => amount('cost', e.currentTarget.value)}
                            />
                            <span className="muted">Will</span>
                        </>)}
                    {toggle('hpOn', 'Restores HP',
                        'Mega-Evolution restores the Mega form’s HP.', poolAmount('hpAll', 'hp', 'HP'))}
                    {toggle('willOn', 'Restores Will',
                        'Mega-Evolution restores the Mega form’s Will.', poolAmount('willAll', 'will', 'Will'))}
                    {toggle('statusOn', 'Heals status conditions',
                        'Mega-Evolution heals every status condition.')}
                    {toggle('keepOriginal', 'Original form unaffected',
                        'When it reverts, the original form keeps the damage, spent Will and status it had before.')}
                    {toggle('keepBoosts', 'Vitamins, buffs and debuffs carry over',
                        'Trained attributes (vitamins included) and the Def / Sp. Def offsets remain on the Mega form. Off: it starts from the Mega’s own attributes.')}
                    {toggle('beyondLimit', 'Attributes past the limit',
                        'Carried-over attributes may go past the Mega form’s limits, beyond 10 too. Off: they are cut to fit.')}
                    {toggle('lockStone', 'Mega Stone locked',
                        'Mega Stones cannot be stolen, switched or removed during battle: the held item is locked while Mega Evolved.')}
                    {toggle('lethalStays', 'Lethal damage stays',
                        'Lethal damage dealt to a Mega-Evolution does not pass to its original form. Matters only when the original form is not unaffected.')}
                </section>

                <div className="gm-dialog-actions">
                    <button className="go" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
}
