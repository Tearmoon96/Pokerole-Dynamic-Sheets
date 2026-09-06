import { useSheetStore } from '../../state/SheetContext';

const EXTRA_MAX_ROWS = 4;

/** Custom dot tracks under the skills tower: a name and five dots each. */
export function ExtraPanel() {
    const { sheet, store } = useSheetStore();
    const extras = sheet.extras;

    return (
        <div className="extra-panel">
            <span className="skill-group-label">Extra</span>
            <div className="extra-rows" id="extra-rows">
                {extras.map((extra, idx) => (
                    <div className="extra-row" key={idx}>
                        <input
                            type="text"
                            className="extra-name-input"
                            placeholder="name..."
                            value={extra.name}
                            onChange={(e) => {
                                const name = e.currentTarget.value;
                                store.update((s) => {
                                    s.extras = s.extras.map((x, j) => j === idx ? { ...x, name } : x);
                                });
                            }}
                            /* Trimmed when you leave the field, not as you type:
                               the GM screen matches these names, so trailing
                               space matters — but stripping it on every
                               keystroke would eat the space in "Fire Blast"
                               before the second word could be started. */
                            onBlur={(e) => {
                                const name = e.currentTarget.value.trim();
                                if (name === extra.name) return;
                                store.update((s) => {
                                    s.extras = s.extras.map((x, j) => j === idx ? { ...x, name } : x);
                                });
                            }}
                        />
                        <div className="skill-dots" style={{ gap: '3px' }}>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className={'skill-dot' + (i <= extra.value ? ' filled' : '')}
                                    style={{ width: '10px', height: '10px' }}
                                    onClick={() => store.update((s) => {
                                        s.extras = s.extras.map((x, j) =>
                                            j === idx ? { ...x, value: (x.value === i) ? i - 1 : i } : x);
                                    })}
                                />
                            ))}
                        </div>
                        {extras.length > 1 && (
                            <i
                                className="fa-solid fa-xmark extra-remove"
                                title="Remove this track"
                                onClick={() => store.update((s) => {
                                    s.extras = s.extras.filter((_, j) => j !== idx);
                                })}
                            />
                        )}
                    </div>
                ))}
                {extras.length < EXTRA_MAX_ROWS && (
                    <button
                        className="extra-add-btn"
                        title="Add another track"
                        onClick={() => store.update((s) => { s.extras = [...s.extras, { name: '', value: 0 }]; })}
                    >
                        <i className="fa-solid fa-plus"></i>
                    </button>
                )}
            </div>
        </div>
    );
}
