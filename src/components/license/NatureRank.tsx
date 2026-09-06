import { useState } from 'react';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { Suggestions } from '../common/Suggestions';

/* Nature search: a dropdown over the 25 book natures. The input stays a plain
   text field, so a homebrew nature can just be typed in and saved — the list is
   a shortcut, not a constraint. */

export function NatureRank() {
    const { sheet, store } = useSheetStore();
    const { data } = useAppData();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string | null>(null);

    const value = draft ?? sheet.nature;
    const q = value.trim().toLowerCase();
    const matches = data.natures.filter((n) => n.Name.toLowerCase().includes(q)
        || (n.Keywords || '').toLowerCase().includes(q));

    return (
        <div className="nature-rank">
            <div className="pill-field nature-field">
                <label htmlFor="nature-input">Nature:</label>
                <input
                    type="text"
                    id="nature-input"
                    autoComplete="off"
                    value={value}
                    onChange={(e) => { setDraft(e.currentTarget.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onBlur={() => {
                        setOpen(false);
                        if (draft != null) { store.update((s) => { s.nature = draft; }); setDraft(null); }
                    }}
                />
                <Suggestions
                    id="nature-suggestions"
                    className="move-suggestions nature-suggestions"
                    open={open}
                    rows={matches.map((n) => ({
                        key: n._id || n.Name,
                        title: [n.Name, n.Keywords, n.Description].filter(Boolean).join('\n\n'),
                        onSelect: () => {
                            setDraft(null);
                            setOpen(false);
                            store.update((s) => { s.nature = n.Name; });
                        },
                        content: <span className="item-suggestion-name">{n.Name}</span>,
                    }))}
                />
            </div>
            <div className="pill-field">
                <label htmlFor="rank-input">Rank:</label>
                <input
                    type="text"
                    id="rank-input"
                    value={sheet.rank}
                    onChange={(e) => {
                        const rank = e.currentTarget.value;
                        store.update((s) => { s.rank = rank; });
                    }}
                />
            </div>
        </div>
    );
}
