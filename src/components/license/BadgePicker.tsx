import { Modal, ModalClose, ModalTitle } from '../common/Modal';
import { ThemeChip } from '../common/ThemeChip';
import { useSheetStore } from '../../state/SheetContext';
import { TYPE_ICONS, typeColors } from '../../lib/themeTables';

export function BadgePicker({ index, onClose }: { index: number | null; onClose: () => void }) {
    const { sheet, store } = useSheetStore();
    const badge = index == null ? null : sheet.badges[index];

    const set = (earned: boolean, type: string) => {
        store.update((s) => {
            s.badges = s.badges.map((b, i) => i === index ? { earned, type } : b);
        });
        onClose();
    };

    return (
        <Modal open={index != null} onClose={onClose} boxClassName="theme-box" id="badge-picker-modal">
            <ModalClose onClick={onClose} />
            {/* Centred, because the type chips below are a centred wrapping
                row: left-aligned the heading sat off to one side of them. */}
            <ModalTitle icon="fa-medal">Gym Badge Picker</ModalTitle>
            <div className="theme-grid theme-type-row" id="badge-type-grid">
                {Object.keys(typeColors).map((type) => (
                    <ThemeChip
                        key={type}
                        swatch={typeColors[type]}
                        icon={TYPE_ICONS[type]}
                        label={type}
                        iconOnly
                        themeType={sheet.themeType}
                        selected={!!badge?.earned && badge.type === type}
                        onClick={() => set(true, type)}
                    />
                ))}
            </div>
            <div className="modal-actions">
                {badge?.earned && (
                    <button className="form-btn danger" id="badge-remove-btn" onClick={() => set(false, '')}>
                        Remove badge
                    </button>
                )}
            </div>
        </Modal>
    );
}
