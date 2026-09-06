import { useSheetStore } from '../../state/SheetContext';

/** Five lines with a check each. */
export function Achievements() {
    const { sheet, store } = useSheetStore();
    return (
        <div className="achievements-box">
            <div className="achievements-title">Achievements</div>
            <div id="achievements-list">
                {sheet.achievements.map((ach, i) => (
                    <div className="achievement-row" key={i}>
                        <input
                            type="text"
                            className={'achievement-input' + (ach.done ? ' done' : '')}
                            value={ach.text}
                            onChange={(e) => {
                                const text = e.currentTarget.value;
                                store.update((s) => {
                                    s.achievements = s.achievements.map((a, j) => j === i ? { ...a, text } : a);
                                });
                            }}
                        />
                        <button
                            className={'ach-check' + (ach.done ? ' done' : '')}
                            title={ach.done ? 'Achieved! Click to unset' : 'Mark as achieved'}
                            onClick={() => store.update((s) => {
                                s.achievements = s.achievements.map((a, j) => j === i ? { ...a, done: !a.done } : a);
                            })}
                        >
                            <i className="fa-solid fa-check"></i>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
