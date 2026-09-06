import { Modal, ModalClose, ModalTitle } from '../common/Modal';
import { ThemeChip } from '../common/ThemeChip';
import { useSheetStore } from '../../state/SheetContext';
import { CUSTOM_THEMES, TYPE_ICONS, typeColors } from '../../lib/themeTables';

export function ThemePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet, store } = useSheetStore();

    const select = (key: string) => {
        store.update((s) => { s.themeType = key; });
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} boxClassName="theme-box" id="theme-picker-modal">
            <ModalClose onClick={onClose} />
            {/* Centred, to sit over the centred chip rows below it */}
            <ModalTitle icon="fa-palette">Page Theme Picker</ModalTitle>
            {/* The named License themes keep their labels and stack at equal
                width; the 18 types below are icon-only so they fit on a
                couple of rows */}
            <div className="theme-grid theme-named-row" id="theme-grid">
                {Object.entries(CUSTOM_THEMES).map(([key, theme]) => (
                    <ThemeChip
                        key={key}
                        swatch={theme.swatch!}
                        icon={theme.icon!}
                        label={theme.label!}
                        themeType={sheet.themeType}
                        onClick={() => select(key)}
                    />
                ))}
            </div>
            <div className="theme-grid theme-type-row" id="theme-type-grid">
                {Object.keys(typeColors).map((type) => (
                    <ThemeChip
                        key={type}
                        swatch={typeColors[type]}
                        icon={TYPE_ICONS[type]}
                        label={type}
                        iconOnly
                        themeType={sheet.themeType}
                        onClick={() => select(type)}
                    />
                ))}
            </div>
        </Modal>
    );
}
