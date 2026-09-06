import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { ailmentSummary, moveAccuracyPenalty } from '../../card/moves';
import type { CardMove } from '../../card/moves';
import type { MoveOverride } from '../../card/types';

/* Overrides for accuracy, power, damage, target, effect and ailment.

   Only the differences from the move's own JSON are stored, so a move left at
   its defaults keeps no override at all. */

const ACC_OPTION_GROUPS = [
    { label: 'Pools', items: ['HP', 'Willpower', 'Loyalty', 'Happiness', 'Disobedience'] },
    { label: 'Stats', items: ['Strength', 'Dexterity', 'Vitality', 'Special', 'Insight'] },
    { label: 'Social', items: ['Tough', 'Cool', 'Beauty', 'Cute', 'Clever'] },
    { label: 'Skills', items: ['Fight', 'Survival', 'Social', 'Knowledge'] },
    {
        label: 'Specialties', items: ['Brawl', 'Channel', 'Clash', 'Evasion', 'Alert', 'Athletic',
            'Nature', 'Stealth', 'Charm', 'Empathy', 'Intimidate', 'Perform',
            'Craft', 'Etiquette', 'Medicine', 'Science'],
    },
];

interface Draft {
    acc1: string; acc2: string; acc3: string;
    power: string; accOffset: string; powOffset: string;
    damage: string; target: string; effect: string; ailment: string;
}

function StatSelect({ id, value, onChange, specialties }: {
    id: string; value: string; onChange: (v: string) => void; specialties: string[];
}) {
    /* Keep unlisted JSON defaults (e.g. "Tough/Cute") selectable as-is. */
    const listed = ACC_OPTION_GROUPS.flatMap((g) => g.items).concat(specialties);
    const extra = value && !listed.includes(value) ? value : '';
    return (
        <select id={id} className="move-edit-input" value={value} onChange={(e) => onChange(e.currentTarget.value)}>
            <option value="">None</option>
            {ACC_OPTION_GROUPS.map((g) => (
                <optgroup label={g.label} key={g.label}>
                    {g.items.map((n) => <option value={n} key={n}>{n}</option>)}
                </optgroup>
            ))}
            {specialties.length > 0 && (
                <optgroup label="Custom Specialties">
                    {specialties.map((n) => <option value={n} key={n}>{n}</option>)}
                </optgroup>
            )}
            {extra && <option value={extra}>{extra} (default)</option>}
        </select>
    );
}

function OffsetField({ id, label, value, onChange, hint }: {
    id: string; label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
    const step = (delta: number) => onChange(String((parseInt(value, 10) || 0) + delta));
    return (
        <label className="move-edit-field">
            <span className="move-edit-label">{label}</span>
            <div className="offset-input-wrap">
                <input
                    type="number" step="1" placeholder="0" id={id}
                    className="move-edit-input offset-input"
                    value={value}
                    onChange={(e) => onChange(e.currentTarget.value)}
                />
                <div className="offset-steppers">
                    <button type="button" className="offset-step-btn" tabIndex={-1} aria-label="Increase"
                        onClick={() => step(1)}>
                        <i className="fa-solid fa-chevron-up"></i>
                    </button>
                    <button type="button" className="offset-step-btn" tabIndex={-1} aria-label="Decrease"
                        onClick={() => step(-1)}>
                        <i className="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            {/* Without this, typing 0 here on a move that rolls at −1 looks like
                the field is broken. */}
            {hint && <span className="move-edit-hint" id="edit-move-acc-hint">{hint}</span>}
        </label>
    );
}

export function MoveEditor({ moveName, speciesMoves, onClose }: {
    moveName: string | null;
    speciesMoves: CardMove[];
    onClose: () => void;
}) {
    const { sheet, store } = useCard();
    const { data } = useAppData();
    const [draft, setDraft] = useState<Draft | null>(null);

    const findBaseMove = (name: string): CardMove | null =>
        speciesMoves.find((m) => m.Name === name)
        || (data.moves.find((m) => m.Name === name) as CardMove | undefined)
        || null;

    const base = moveName ? findBaseMove(moveName) : null;

    useEffect(() => {
        if (!moveName || !base) { setDraft(null); return; }
        const o: MoveOverride = sheet.moveOverrides[moveName] || {};
        setDraft({
            acc1: o.acc1 !== undefined ? o.acc1 : (base.Accuracy1 || ''),
            acc2: o.acc2 !== undefined ? o.acc2 : (base.Accuracy2 || ''),
            acc3: o.acc3 !== undefined ? o.acc3 : (base.Accuracy3 || ''),
            power: String(o.power !== undefined ? o.power : (base.Power || 0)),
            accOffset: String(o.accOffset !== undefined ? o.accOffset : 0),
            powOffset: String(o.powOffset !== undefined ? o.powOffset : 0),
            damage: o.damage !== undefined ? o.damage : (base.Damage1 || ''),
            target: o.target !== undefined ? o.target : (base.Target || ''),
            effect: o.effect !== undefined ? o.effect : (base.Effect || ''),
            ailment: o.ailment !== undefined ? o.ailment : ailmentSummary(base),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moveName]);

    if (!moveName || !base || !draft) return null;

    const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });
    const penalty = moveAccuracyPenalty(base);
    const specialties = sheet.specialties.map((s) => s.name);

    const save = () => {
        const o: MoveOverride = {};
        const power = parseInt(draft.power, 10);
        const accOffset = parseInt(draft.accOffset, 10) || 0;
        const powOffset = parseInt(draft.powOffset, 10) || 0;
        const target = draft.target.trim();
        const effect = draft.effect.trim();
        const ailment = draft.ailment.trim();

        if (draft.acc1 !== (base.Accuracy1 || '')) o.acc1 = draft.acc1;
        if (draft.acc2 !== (base.Accuracy2 || '')) o.acc2 = draft.acc2;
        if (draft.acc3 !== (base.Accuracy3 || '')) o.acc3 = draft.acc3;
        if (!isNaN(power) && power !== (base.Power || 0)) o.power = power;
        if (accOffset !== 0) o.accOffset = accOffset;
        if (powOffset !== 0) o.powOffset = powOffset;
        if (draft.damage !== (base.Damage1 || '')) o.damage = draft.damage;
        if (target !== (base.Target || '')) o.target = target;
        if (effect !== (base.Effect || '')) o.effect = effect;
        if (ailment !== ailmentSummary(base)) o.ailment = ailment;

        store.update((s) => {
            const next = { ...s.moveOverrides };
            if (Object.keys(o).length > 0) next[moveName] = o;
            else delete next[moveName];
            s.moveOverrides = next;
        });
        onClose();
    };

    return (
        <Modal open onClose={onClose} boxClassName="move-edit-box" id="move-edit-modal">
            <div className="modal-title" style={{ color: 'var(--accent)' }}>
                <i className="fa-solid fa-pen-to-square"></i> Edit <span id="edit-move-title-name">{moveName}</span>
            </div>
            <div className="move-edit-grid">
                <label className="move-edit-field">
                    <span className="move-edit-label">Accuracy 1</span>
                    <StatSelect id="edit-move-acc1" value={draft.acc1} onChange={(v) => set('acc1', v)} specialties={specialties} />
                </label>
                <label className="move-edit-field">
                    <span className="move-edit-label">Accuracy 2</span>
                    <StatSelect id="edit-move-acc2" value={draft.acc2} onChange={(v) => set('acc2', v)} specialties={specialties} />
                </label>
                <label className="move-edit-field">
                    <span className="move-edit-label">Accuracy 3</span>
                    <StatSelect id="edit-move-acc3" value={draft.acc3} onChange={(v) => set('acc3', v)} specialties={specialties} />
                </label>
                <label className="move-edit-field">
                    <span className="move-edit-label">Base Power</span>
                    <input
                        type="text" inputMode="numeric" id="edit-move-power" className="move-edit-input"
                        value={draft.power}
                        onChange={(e) => set('power', e.currentTarget.value)}
                    />
                </label>

                <OffsetField
                    id="edit-move-acc-offset"
                    label="Accuracy Offset"
                    value={draft.accOffset}
                    onChange={(v) => set('accOffset', v)}
                    hint={penalty ? `This move already has Low Accuracy ${Math.abs(penalty)}, counted separately.` : undefined}
                />
                <OffsetField
                    id="edit-move-power-offset"
                    label="Power Offset"
                    value={draft.powOffset}
                    onChange={(v) => set('powOffset', v)}
                />

                <label className="move-edit-field">
                    <span className="move-edit-label">Damage Pool</span>
                    <select
                        id="edit-move-damage"
                        className="move-edit-input"
                        value={draft.damage}
                        onChange={(e) => set('damage', e.currentTarget.value)}
                    >
                        <option value="">None</option>
                        <option value="Strength">Strength</option>
                        <option value="Special">Special</option>
                        {draft.damage && !['Strength', 'Special'].includes(draft.damage) && (
                            <option value={draft.damage}>{draft.damage} (default)</option>
                        )}
                    </select>
                </label>
                <label className="move-edit-field">
                    <span className="move-edit-label">Target</span>
                    <input
                        type="text" id="edit-move-target" className="move-edit-input" placeholder="e.g. Foe"
                        value={draft.target}
                        onChange={(e) => set('target', e.currentTarget.value)}
                    />
                </label>
                <label className="move-edit-field span-2">
                    <span className="move-edit-label">Effect</span>
                    <textarea
                        id="edit-move-effect" className="move-edit-textarea"
                        value={draft.effect}
                        onChange={(e) => set('effect', e.currentTarget.value)}
                    />
                </label>
                <label className="move-edit-field span-2">
                    <span className="move-edit-label">Ailment</span>
                    <input
                        type="text" id="edit-move-ailment" className="move-edit-input"
                        placeholder="e.g. Burn on Targets (1 Chance Die)"
                        value={draft.ailment}
                        onChange={(e) => set('ailment', e.currentTarget.value)}
                    />
                </label>
            </div>
            <div className="modal-actions">
                <button
                    className="form-btn reset"
                    onClick={() => {
                        store.update((s) => {
                            const next = { ...s.moveOverrides };
                            delete next[moveName];
                            s.moveOverrides = next;
                        });
                        onClose();
                    }}
                >
                    Reset Defaults
                </button>
                <button className="form-btn cancel" onClick={onClose}>Cancel</button>
                <button className="form-btn save" onClick={save}>Save</button>
            </div>
        </Modal>
    );
}
