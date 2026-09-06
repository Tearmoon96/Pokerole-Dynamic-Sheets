import type { ReactNode } from 'react';

/* The themed autocomplete panel that replaces the unstylable native datalist.
   One component for every dropdown on the page: bag items, gear, natures. */

export interface SuggestionRow {
    key: string;
    title?: string;
    onSelect: () => void;
    content: ReactNode;
}

export function Suggestions({ rows, hiddenCount, className, id, open }: {
    rows: SuggestionRow[];
    /** How many matches did not fit; renders the "keep typing" footer. */
    hiddenCount?: number;
    className?: string;
    id?: string;
    open: boolean;
}) {
    if (!open || !rows.length) {
        return <div className={className ?? 'move-suggestions'} id={id} style={{ display: 'none' }} />;
    }
    return (
        <div className={className ?? 'move-suggestions'} id={id} style={{ display: 'flex' }}>
            {rows.map((r) => (
                <div
                    className="move-suggestion"
                    key={r.key}
                    title={r.title}
                    /* mousedown, not click: the input's blur would tear the panel
                       down before a click ever landed. */
                    onMouseDown={(e) => { e.preventDefault(); r.onSelect(); }}
                >
                    {r.content}
                </div>
            ))}
            {!!hiddenCount && (
                <div className="move-suggestion-more">+ {hiddenCount} more, keep typing...</div>
            )}
        </div>
    );
}
