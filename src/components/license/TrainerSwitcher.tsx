import { Modal, ModalClose, ModalTitle } from '../common/Modal';
import { useSheetStore } from '../../state/SheetContext';
import { useSession } from '../../state/SessionContext';

/* Edge arrows, the indicator, and the picker behind it. All three only exist
   while more than one trainer is loaded from a folder. */

export function TrainerNav() {
    const { store } = useSheetStore();
    const session = useSession();
    const multi = store.trainers.length > 1;
    if (!multi) return null;

    const cur = store.entry;
    const label = cur.data.name || cur.fileName || 'Trainer';
    const step = (delta: number) =>
        store.setActive((store.active + delta + store.trainers.length) % store.trainers.length);

    return (
        <>
            <button
                className="trainer-arrow left"
                id="trainer-arrow-left"
                onClick={() => step(-1)}
                title="Previous trainer"
                style={{ display: 'flex' }}
            >
                <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button
                className="trainer-arrow right"
                id="trainer-arrow-right"
                onClick={() => step(1)}
                title="Next trainer"
                style={{ display: 'flex' }}
            >
                <i className="fa-solid fa-chevron-right"></i>
            </button>
            {/* Clicking the indicator reopens the picker, where trainers can be
                switched or closed one by one */}
            <div
                className="trainer-indicator clickable"
                id="trainer-indicator"
                style={{ display: 'flex' }}
                title="Switch or close loaded trainers"
                onClick={() => session.setTrainerPickerOpen(true)}
            >
                <i className="fa-solid fa-users"></i>{' '}
                <span className="ti-name">{label}</span>{' '}
                <span className="ti-count">{store.active + 1} / {store.trainers.length}</span>
            </div>
        </>
    );
}

export function TrainerPicker() {
    const { store } = useSheetStore();
    const session = useSession();
    const n = store.trainers.length;
    const close = () => session.setTrainerPickerOpen(false);

    return (
        <Modal open={session.trainerPickerOpen} onClose={close} id="trainer-picker-modal">
            <ModalClose onClick={close} />
            <ModalTitle icon="fa-users" centered={false}>Choose a Trainer</ModalTitle>
            <p className="modal-text" id="trainer-picker-text">
                {n} trainer{n === 1 ? '' : 's'} loaded. Click one to open it, or use ✕ to close
                (unload) it — its .json file on disk is never touched.
            </p>
            <div className="trainer-picker-list" id="trainer-picker-list">
                {store.trainers.map((t, i) => {
                    const nm = t.data.name || t.fileName || 'Unnamed trainer';
                    const sub = t.data.player ? 'player: ' + t.data.player : (t.fileName || 'trainer');
                    return (
                        <div
                            key={t.id || i}
                            className={'trainer-pick-row' + (i === store.active ? ' current' : '')}
                            onClick={() => { close(); store.setActive(i); }}
                        >
                            <i className="fa-solid fa-id-card"></i>
                            <span className="trainer-pick-name">{nm}</span>
                            <span className="trainer-pick-sub">
                                {sub}{store.isDirty(t) ? ' • unsaved' : ''}
                            </span>
                            <button
                                className="trainer-pick-close"
                                title="Close this trainer (unload it; the file stays on disk)"
                                onClick={(e) => { e.stopPropagation(); session.requestCloseTrainer(i); }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
