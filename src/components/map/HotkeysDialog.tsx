import { useEffect, useState } from 'react';
import { Modal, ModalClose } from '../common/Modal';
import { useGmConfirm } from '../gm/ConfirmDialog';
import {
    HOTKEY_ACTIONS, actionUsing, comboLabel, copyProfile, deleteProfile, eventCombo,
    renameProfile, setActiveProfile, setBindings, useHotkeys,
} from '../../map/hotkeys';
import type { HotkeyAction } from '../../map/hotkeys';

/* Choosing and editing the keyboard shortcuts.

   A built-in profile is shown but not edited: the first change to one makes
   a custom copy, switches to it and edits that, so Classic and Left hand are
   always there to go back to. */

const GROUPS = [...new Set(HOTKEY_ACTIONS.map((a) => a.group))];

export function HotkeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { active, profiles } = useHotkeys();
    const confirm = useGmConfirm();
    /* The action waiting for a key press, and whether it replaces the first
       key or adds another beside it. */
    const [recording, setRecording] = useState<{ action: HotkeyAction; replace: number | null } | null>(null);
    const [note, setNote] = useState('');
    const [renaming, setRenaming] = useState(false);

    useEffect(() => { if (!open) { setRecording(null); setNote(''); setRenaming(false); } }, [open]);

    /* The profile to write to: this one if it is custom, a fresh copy of it if
       it is built in. */
    const editable = (): string => (active.builtin ? copyProfile(active.id) : active.id);

    useEffect(() => {
        if (!recording) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) { setRecording(null); return; }
            const combo = eventCombo(e);
            if (!combo) return;   // a bare modifier: wait for the key it goes with
            const id = editable();
            const profile = { ...active, id };
            const had = active.bindings[recording.action] || [];
            const next = recording.replace == null ? [...had, combo]
                : had.map((c, i) => (i === recording.replace ? combo : c));
            const taken = actionUsing(profile, combo);
            setBindings(id, recording.action, next);
            const takenName = taken && taken !== recording.action
                ? HOTKEY_ACTIONS.find((a) => a.action === taken)?.name : null;
            setNote(takenName ? comboLabel(combo) + ' was taken from “' + takenName + '”.' : '');
            setRecording(null);
        };
        /* Capture, so neither the map's own shortcuts nor the dialog's Escape
           see the key being recorded. */
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [recording, active]);

    const remove = (action: HotkeyAction, index: number) => {
        const id = editable();
        setBindings(id, action, (active.bindings[action] || []).filter((_, i) => i !== index));
        setNote('');
    };

    return (
        <Modal open={open} onClose={onClose} boxClassName="map-dialog map-hotkeys">
            <ModalClose onClick={onClose} />
            <div className="map-dialog-title"><i className="fa-solid fa-keyboard"></i> Keyboard shortcuts</div>

            <div className="map-field-row map-hotkey-profile">
                <label className="map-field grow">
                    <span>Profile</span>
                    {renaming && !active.builtin ? (
                        <input
                            type="text"
                            autoFocus
                            value={active.name}
                            onChange={(e) => renameProfile(active.id, e.currentTarget.value)}
                            onBlur={() => setRenaming(false)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); setRenaming(false); } }}
                        />
                    ) : (
                        <select value={active.id} onChange={(e) => { setActiveProfile(e.currentTarget.value); setNote(''); }}>
                            <optgroup label="Built in">
                                {profiles.filter((p) => p.builtin).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </optgroup>
                            {profiles.some((p) => !p.builtin) && (
                                <optgroup label="Yours">
                                    {profiles.filter((p) => !p.builtin).map((p) => <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>)}
                                </optgroup>
                            )}
                        </select>
                    )}
                </label>
                <div className="map-hotkey-profile-actions">
                    <button className="icon-btn" title="New profile: a copy of this one" onClick={() => { copyProfile(active.id); setRenaming(true); }}>
                        <i className="fa-solid fa-plus"></i>
                    </button>
                    <button className="icon-btn" title="Rename this profile" disabled={!!active.builtin} onClick={() => setRenaming(true)}>
                        <i className="fa-solid fa-pen"></i>
                    </button>
                    <button
                        className="icon-btn danger" title="Delete this profile" disabled={!!active.builtin}
                        onClick={async () => {
                            const ok = await confirm({
                                icon: 'fa-trash', danger: true, confirmLabel: 'Delete',
                                title: 'Delete ' + (active.name || 'this profile') + '?',
                                text: 'The page goes back to the Classic keys.',
                            });
                            if (ok) deleteProfile(active.id);
                        }}
                    >
                        <i className="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>

            <p className="map-hint">
                {active.builtin
                    ? 'A built-in profile. Change any key and a copy of it is made for you to edit.'
                    : 'Click a key to change it, + to add another, × to remove one.'}
                {' '}The middle mouse button pans in every profile. {note && <strong className="map-hotkey-note">{note}</strong>}
            </p>

            <div className="map-hotkey-scroll">
                {GROUPS.map((g) => (
                    <div key={g} className="map-hotkey-group">
                        <h4 className="map-dialog-sub">{g}</h4>
                        {HOTKEY_ACTIONS.filter((a) => a.group === g).map((a) => {
                            const keys = active.bindings[a.action] || [];
                            const rec = recording && recording.action === a.action ? recording : null;
                            return (
                                <div key={a.action} className="map-hotkey-row">
                                    <span className="map-hotkey-name">{a.name}</span>
                                    <span className="map-hotkey-keys">
                                        {keys.map((k, i) => (
                                            <span key={k} className="map-keycap-wrap">
                                                <button
                                                    className={'map-keycap' + (rec && rec.replace === i ? ' recording' : '')}
                                                    title="Click, then press the new key"
                                                    onClick={() => { setRecording({ action: a.action, replace: i }); setNote(''); }}
                                                >
                                                    {rec && rec.replace === i ? 'Press a key…' : comboLabel(k)}
                                                </button>
                                                <button className="map-keycap-x" title={'Remove ' + comboLabel(k)} onClick={() => remove(a.action, i)}>
                                                    <i className="fa-solid fa-xmark"></i>
                                                </button>
                                            </span>
                                        ))}
                                        {rec && rec.replace == null ? (
                                            <span className="map-keycap recording">Press a key…</span>
                                        ) : (
                                            <button
                                                className="map-keycap add"
                                                title="Add a key for this"
                                                onClick={() => { setRecording({ action: a.action, replace: null }); setNote(''); }}
                                            >
                                                <i className="fa-solid fa-plus"></i>
                                            </button>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </Modal>
    );
}
