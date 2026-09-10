import { useEffect, useRef, useState } from 'react';
import { Modal, ModalClose, ModalTitle } from '../common/Modal';
import { useSession, createTrainerFile } from '../../state/SessionContext';
import { useStore } from '../../state/SheetContext';
import { useToast } from '../common/Toast';
import { adoptLoadedTrainers } from '../../state/trainerIO';
import type { WorkingTrainer } from '../../state/workingSet';

/* Every dialog that belongs to the session rather than to the sheet: the
   landing, the disk-conflict prompt, the guards before a destructive load, and
   the new-trainer file dialog. */

export function SessionDialogs() {
    const s = useSession();
    const store = useStore();

    return (
        <>
            <LandingModal />

            {/* Restore conflict: browser session disagrees with the files on disk */}
            <Modal
                open={!!s.dialogs.conflict}
                onClose={() => s.setDialogs({ ...s.dialogs, conflict: null })}
                id="restore-conflict-modal"
            >
                <ModalTitle icon="fa-triangle-exclamation" centered={false}>Session differs from disk</ModalTitle>
                <p className="modal-text">Your last browser session doesn't match the files in the working folder:</p>
                <ul className="modal-text" id="restore-conflict-list" style={{ margin: '0 0 4px 0', paddingLeft: '20px' }}>
                    {s.dialogs.conflict?.conflicts.map((c, i) => (
                        <li key={i}><strong>{c.name}</strong> — {c.reason}</li>
                    ))}
                </ul>
                <p className="modal-text">
                    Keep the browser version (Save All will overwrite the files), or reload everything
                    from disk and discard the browser copy?
                </p>
                <div className="modal-actions">
                    {/* Differing trainers simply stay dirty. */}
                    <button className="form-btn cancel" onClick={() => s.setDialogs({ ...s.dialogs, conflict: null })}>
                        Keep browser version
                    </button>
                    <button
                        className="form-btn danger"
                        onClick={() => {
                            const disk = s.dialogs.conflict?.disk || [];
                            s.setDialogs({ ...s.dialogs, conflict: null });
                            const loaded: WorkingTrainer[] = disk.map((d) => ({
                                id: '', handle: d.entry, fileName: d.fileName, data: d.data,
                            }));
                            if (loaded.length) store.setTrainers(adoptLoadedTrainers(loaded), 0);
                            else store.startBlank();
                        }}
                    >
                        Reload from disk
                    </button>
                </div>
            </Modal>

            {/* Discard warning before replacing the working set with a new folder */}
            <Modal
                open={s.dialogs.discardOpen}
                onClose={() => s.setDialogs({ ...s.dialogs, discardOpen: false })}
                id="discard-open-modal"
            >
                <ModalTitle icon="fa-triangle-exclamation" centered={false}>Unsaved changes</ModalTitle>
                <p className="modal-text">
                    Some trainers have changes that aren't written to their <strong>.json</strong> files
                    yet. Opening a different folder replaces what's loaded and those changes will be lost.
                </p>
                <div className="modal-actions">
                    <button className="form-btn cancel" onClick={() => s.setDialogs({ ...s.dialogs, discardOpen: false })}>
                        Cancel
                    </button>
                    <button
                        className="form-btn save"
                        onClick={async () => {
                            s.setDialogs({ ...s.dialogs, discardOpen: false });
                            await s.saveAll();
                            /* Only proceed if the save actually stuck. */
                            if (!store.anyDirty()) s.openWorkingFolder();
                        }}
                    >
                        Save All, then open
                    </button>
                    <button
                        className="form-btn danger"
                        onClick={() => {
                            s.setDialogs({ ...s.dialogs, discardOpen: false });
                            /* The guard has been answered; go straight to the picker. */
                            store.trainers.forEach((t) => { t.savedJson = store.json(t); });
                            s.openWorkingFolder();
                        }}
                    >
                        Discard &amp; open
                    </button>
                </div>
            </Modal>

            <NewTrainerModal />

            {/* Closing a trainer that still has unsaved changes (sits above the picker) */}
            <Modal
                open={s.dialogs.closeTrainer != null}
                onClose={() => s.setDialogs({ ...s.dialogs, closeTrainer: null })}
                id="close-trainer-modal"
                zIndex={300}
            >
                <ModalTitle icon="fa-triangle-exclamation" centered={false}>Close trainer?</ModalTitle>
                <p className="modal-text">
                    <strong id="close-trainer-name">
                        {s.dialogs.closeTrainer != null
                            ? (store.trainers[s.dialogs.closeTrainer]?.data.name
                                || store.trainers[s.dialogs.closeTrainer]?.fileName || 'Unnamed')
                            : ''}
                    </strong> has changes that aren't written to its <strong>.json</strong> file yet.
                    Closing it here only unloads it from this session — the file on disk is untouched,
                    but those unsaved changes are lost.
                </p>
                <div className="modal-actions">
                    <button className="form-btn cancel" onClick={() => s.setDialogs({ ...s.dialogs, closeTrainer: null })}>
                        Cancel
                    </button>
                    <button
                        className="form-btn save"
                        onClick={async () => {
                            const index = s.dialogs.closeTrainer!;
                            s.setDialogs({ ...s.dialogs, closeTrainer: null });
                            await s.saveAll();
                            store.removeTrainer(index);
                        }}
                    >
                        Save All, then close
                    </button>
                    <button
                        className="form-btn danger"
                        onClick={() => {
                            const index = s.dialogs.closeTrainer!;
                            s.setDialogs({ ...s.dialogs, closeTrainer: null });
                            store.removeTrainer(index);
                        }}
                    >
                        Close anyway
                    </button>
                </div>
            </Modal>

            {/* Friendly replacement for the "no trainers found" browser alert */}
            <Modal
                open={!!s.dialogs.noTrainers}
                onClose={() => s.setDialogs({ ...s.dialogs, noTrainers: null })}
                id="no-trainers-modal"
            >
                <ModalTitle icon="fa-folder-open" centered={false}>No trainers in that folder</ModalTitle>
                <p className="modal-text">
                    The folder doesn't contain any trainer. Open the folder that
                    {' '}<strong>directly contains your trainer <strong>.json</strong> files</strong> — normally the
                    {' '}<strong>Trainers and Pokemons</strong> folder that came with the app. If it's the first time
                    using this app or you never created a trainer select <strong>Close</strong> and
                    then <strong>New Trainer</strong>.
                </p>
                <p className="modal-text" id="no-trainers-detail" style={{ opacity: 0.7, fontSize: '0.8rem' }}>
                    {noTrainersDetail(s.dialogs.noTrainers)}
                </p>
                <div className="modal-actions">
                    <button className="form-btn cancel" onClick={() => s.setDialogs({ ...s.dialogs, noTrainers: null })}>
                        Close
                    </button>
                    <button
                        className="form-btn save"
                        onClick={() => {
                            s.setDialogs({ ...s.dialogs, noTrainers: null });
                            s.openWorkingFolder();
                        }}
                    >
                        Open the Trainers and Pokemons folder
                    </button>
                </div>
            </Modal>
        </>
    );

}

function noTrainersDetail(diag: { json: number; marked: number; skipped: string[] } | null): string {
    if (!diag) return '';
    return 'That folder held ' + diag.json + ' .json file'
        + (diag.json === 1 ? '' : 's')
        + (diag.json && !diag.marked ? ', but none were trainer files' : '')
        + (diag.skipped && diag.skipped.length
            ? ' (couldn\u2019t read: ' + diag.skipped.join('; ') + ')' : '') + '.';
}

/* These two live at module scope, not inside SessionDialogs, and that is
   load-bearing rather than stylistic.

   A component declared inside another is a NEW function identity on every
   render of the parent, so React treats it as a different component type,
   unmounts the old tree and mounts a fresh one. For NewTrainerModal that meant
   the filename box lost focus — and its useState went back to
   "trainer-new.json" — any time anything else on the sheet caused a re-render
   while someone was still typing the name. */

function NewTrainerModal() {
    const s = useSession();
    const store = useStore();
    const toast = useToast();
    /* The BASE name only — the extension is not in here and cannot be typed
       over. It used to be part of one plain text field, which let you delete
       it: `createTrainerFile` then quietly put it back, so the box said one
       thing and the folder got another. */
    const [base, setBase] = useState('trainer-new');
    const ref = useRef<HTMLInputElement>(null);
    const open = s.dialogs.newTrainerName != null;

    const stripExt = (v: string) => v.replace(/\.json$/i, '');

    useEffect(() => {
        if (!open) return;
        setBase(stripExt(s.dialogs.newTrainerName || 'trainer-new.json'));
        const id = window.setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const fileName = base.trim() + '.json';

    return (
        <Modal
            open={open}
            onClose={() => s.setDialogs({ ...s.dialogs, newTrainerName: null })}
            id="new-trainer-save-modal"
        >
            <ModalTitle icon="fa-file-circle-plus" centered={false}>Save new trainer</ModalTitle>
            <p className="modal-text">
                A new trainer needs its own <strong>.json</strong> file before it can auto-save.
                Name the file, then it's saved into your working folder. The trainer starts
                out named after the file — you can rename either one afterwards.
            </p>
            {/* The extension sits outside the field as a label, so there is
                nothing there to select or delete. */}
            <div className="filename-field">
                <input
                    ref={ref}
                    type="text"
                    id="new-trainer-filename"
                    className="specialty-input"
                    placeholder="trainer-name"
                    value={base}
                    /* Paste of a full "ash.json" still does the right thing. */
                    onChange={(e) => setBase(stripExt(e.currentTarget.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
                <span className="filename-ext">.json</span>
            </div>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={() => s.setDialogs({ ...s.dialogs, newTrainerName: null })}>
                    Cancel
                </button>
                <button
                    className="form-btn save"
                    onClick={async () => {
                        const entry = await createTrainerFile(fileName, toast);
                        if (!entry) return;
                        store.addTrainer(entry);
                        s.setDialogs({ ...s.dialogs, newTrainerName: null });
                    }}
                >
                    Create file
                </button>
            </div>
        </Modal>
    );
}

function LandingModal() {
    const s = useSession();
    const n = s.pendingRestore?.trainers.length || 0;
    return (
        <Modal open={s.landingOpen} onClose={s.closeLanding} id="license-landing-modal">
            <ModalClose onClick={s.closeLanding} />
            <ModalTitle icon="fa-id-card" centered={false}>Trainer's License</ModalTitle>
            <p className="modal-text">
                Your trainers live in a working folder of <strong>.json</strong> files
                called <strong>Trainers</strong>. Open that folder to load them — your edits are kept
                there whenever you <strong>Save All</strong>.
            </p>
            <div className="modal-actions" style={{ flexDirection: 'column', gap: '10px' }}>
                <button
                    className="form-btn save"
                    style={{ width: '100%' }}
                    onClick={() => { s.closeLanding(); s.openWorkingFolder(); }}
                >
                    <i className="fa-solid fa-folder-open"></i> Open working folder
                </button>
                {n > 0 && (
                    <button
                        className="form-btn cancel"
                        id="landing-restore-btn"
                        style={{ width: '100%', flexDirection: 'column', gap: '2px' }}
                        onClick={() => s.restoreLastSession()}
                    >
                        <span><i className="fa-solid fa-clock-rotate-left"></i> Restore last session</span>
                        {' '}
                        <span id="landing-restore-sub" style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                            {n} trainer{n === 1 ? '' : 's'} from your last session
                        </span>
                    </button>
                )}
                <button
                    className="form-btn cancel"
                    style={{ width: '100%' }}
                    onClick={() => { s.closeLanding(); s.newTrainer(); }}
                >
                    <i className="fa-solid fa-file-circle-plus"></i> Start a new trainer
                </button>
            </div>
        </Modal>
    );
}
