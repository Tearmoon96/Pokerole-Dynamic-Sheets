import { useEffect } from 'react';
import type { ReactNode } from 'react';

/* A yes/no warning in the table's own dialog (the GM screen's confirm look,
   gm/confirm-dialog.css), never the browser's grey confirm(). Mounted only
   while asking: a role="dialog" in the DOM tells the tours one is up. */

export interface TableAsk {
    title: string;
    icon: string;
    text: ReactNode;
    /** The confirming button's label. */
    ok: string;
    /** Red: it throws something away. */
    danger?: boolean;
    onOk: () => void;
}

export function TableConfirm({ ask, onClose }: { ask: TableAsk | null; onClose: () => void }) {
    useEffect(() => {
        if (!ask) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [ask, onClose]);

    if (!ask) return null;
    return (
        <div className="gm-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={'gm-dialog' + (ask.danger ? ' danger' : '')} role="dialog" aria-label={ask.title}
                id="table-confirm">
                <div className="gm-dialog-title">
                    <i className={'fa-solid ' + ask.icon}></i>
                    <span>{ask.title}</span>
                </div>
                <div className="gm-dialog-text">{ask.text}</div>
                <div className="gm-dialog-actions">
                    <button onClick={onClose}>Cancel</button>
                    <button className="go" id="table-confirm-ok" autoFocus
                        onClick={() => { onClose(); ask.onOk(); }}>
                        {ask.ok}
                    </button>
                </div>
            </div>
        </div>
    );
}
