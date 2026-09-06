import { useSheetStore } from '../../state/SheetContext';
import { EditableText } from '../common/EditableText';
import type { Gender } from '../../state/types';

const GENDER_META: Record<string, { cls: string; icon: string; title: string }> = {
    '': { cls: 'unset', icon: 'fa-venus-mars', title: 'Set gender (unset)' },
    'M': { cls: 'male', icon: 'fa-mars', title: 'Male — click for female' },
    'F': { cls: 'female', icon: 'fa-venus', title: 'Female — click to clear' },
};

const NEXT_GENDER: Record<string, Gender> = { '': 'M', 'M': 'F', 'F': '' };

export function LicensePlate() {
    const { sheet, store } = useSheetStore();
    const meta = GENDER_META[sheet.gender] || GENDER_META[''];

    return (
        <div className="license-plate">
            <div className="plate-row">
                <span className="pokeball-dot"></span>
                <span className="plate-label">Character</span>
                <EditableText
                    id="trainer-name"
                    className="plate-value"
                    placeholder="Character's name"
                    title="Click to edit"
                    value={sheet.name}
                    onChange={(name) => store.update((s) => { s.name = name; })}
                />
                <button
                    className={'gender-toggle ' + meta.cls}
                    id="trainer-gender-toggle"
                    title={meta.title}
                    onClick={() => store.update((s) => {
                        s.gender = NEXT_GENDER[s.gender] ?? 'M';
                    })}
                >
                    <i className={'fa-solid ' + meta.icon}></i>
                </button>
            </div>
            <div className="plate-row">
                <span className="pokeball-dot"></span>
                <span className="plate-label">Player</span>
                <EditableText
                    id="player-name"
                    className="plate-value"
                    placeholder="Player's name"
                    title="Click to edit"
                    value={sheet.player}
                    onChange={(player) => store.update((s) => { s.player = player; })}
                />
            </div>
        </div>
    );
}
