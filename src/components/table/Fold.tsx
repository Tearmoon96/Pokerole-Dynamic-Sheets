/* Every side panel folds away to its title, behind the board's caret
   (gm/expanders.css). Which are folded is this browser's own business, kept
   in localStorage: it is how this person likes their screen, not table state. */

import { useState } from 'react';
import type { ReactNode } from 'react';

const KEY = 'pokerole_table_folds';

function folded(): Record<string, true> {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

/** Whether the panel `id` is open, and the toggle. Open unless folded. */
export function useFold(id: string): [boolean, () => void] {
    const [open, setOpen] = useState(() => folded()[id] !== true);
    const toggle = () => {
        const next = !open;
        setOpen(next);
        try {
            const f = folded();
            if (next) delete f[id];
            else f[id] = true;
            localStorage.setItem(KEY, JSON.stringify(f));
        } catch { /* private mode: it folds, it just will not remember */ }
    };
    return [open, toggle];
}

/** A side panel's title as the button that folds it. `extra` sits at the
    right of the line and stays visible while folded. */
export function FoldTitle({ id, open, onToggle, icon, children, extra }: {
    id: string;
    open: boolean;
    onToggle: () => void;
    icon: string;
    children: ReactNode;
    extra?: ReactNode;
}) {
    return (
        <h2 className="side-title">
            <button type="button" className="side-fold" aria-expanded={open} data-fold={id} onClick={onToggle}>
                <i className={'fa-solid fa-caret-' + (open ? 'down' : 'right') + ' side-twist'}></i>
                <i className={'fa-solid ' + icon}></i> {children}
            </button>
            {extra}
        </h2>
    );
}
