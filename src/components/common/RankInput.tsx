import { useState } from 'react';
import { RANKS } from '../../lib/ranks';
import { Suggestions } from './Suggestions';

/* Rank field: the same themed dropdown the bag, gear and nature searches
   use, over the eight ranks. The input stays a plain text field, so a
   homebrew rank can be typed in and saved — the list is a shortcut, not a
   constraint. On focus it offers all eight and narrows only while typing,
   because a field that already reads "Rookie" would otherwise open on a
   one-row list and never let the other seven be picked.

   `autoComplete="off"` is load-bearing. Without it Chrome hangs its own
   history bubble under the field — a grey box with the last value and an
   × — and, once a row is taken, paints the input with its autofill white.
   Both looked like a broken dropdown; neither was ours. */

export function RankInput({ value, onCommit, inputClassName, suggestionsClassName }: {
    value: string;
    onCommit: (rank: string) => void;
    inputClassName?: string;
    suggestionsClassName: string;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string | null>(null);

    const shown = draft ?? value;
    const q = (draft ?? '').trim().toLowerCase();
    const matches = q ? RANKS.filter((r) => r.toLowerCase().includes(q)) : [...RANKS];

    return (
        <>
            <input
                type="text"
                id="rank-input"
                className={inputClassName}
                autoComplete="off"
                value={shown}
                onChange={(e) => { setDraft(e.currentTarget.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onBlur={() => {
                    setOpen(false);
                    if (draft != null) { onCommit(draft); setDraft(null); }
                }}
            />
            <Suggestions
                id="rank-suggestions"
                className={'move-suggestions ' + suggestionsClassName}
                open={open}
                rows={matches.map((r) => ({
                    key: r,
                    onSelect: () => {
                        setDraft(null);
                        setOpen(false);
                        onCommit(r);
                    },
                    content: (
                        <span className={'item-suggestion-name' + (r === value ? ' rank-current' : '')}>
                            {r}
                        </span>
                    ),
                }))}
            />
        </>
    );
}
