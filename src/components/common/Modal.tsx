import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/* Every dialog on the sheet is the same overlay: a click on the backdrop
   closes it, a click inside does not, and Escape closes the innermost one.

   Escape is handled per-modal with a capture-phase listener rather than one
   page-level handler, so the gear catalogue over the equipment window — and the
   rename dialog over PC storage — close from the top down, one press each. */

let escStack: (() => void)[] = [];

export function Modal({ open, onClose, boxClassName, boxStyle, id, zIndex, children }: {
    open: boolean;
    onClose: () => void;
    /** Extra classes on the .modal-box, e.g. "theme-box". */
    boxClassName?: string;
    /** Inline overrides a few dialogs carry on the box itself. */
    boxStyle?: CSSProperties;
    id?: string;
    zIndex?: number;
    children: ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        escStack.push(onClose);
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const top = escStack[escStack.length - 1];
            if (top !== onClose) return;   // an inner dialog owns this press
            e.stopPropagation();
            onClose();
        };
        document.addEventListener('keydown', onKey, true);
        return () => {
            escStack = escStack.filter((fn) => fn !== onClose);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="modal-overlay"
            id={id}
            style={{ display: 'flex', ...(zIndex ? { zIndex } : null) }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className={'modal-box' + (boxClassName ? ' ' + boxClassName : '')} style={boxStyle}>
                {children}
            </div>
        </div>
    );
}

/** The × every dialog carries in its top corner. */
export function ModalClose({ onClick }: { onClick: () => void }) {
    return (
        <button className="modal-close-btn" onClick={onClick} title="Close">
            <i className="fa-solid fa-xmark"></i>
        </button>
    );
}

/** The centred title row, with its glyph in the theme's primary colour. */
export function ModalTitle({ icon, children, centered = true }: {
    icon: string; children: ReactNode; centered?: boolean;
}) {
    return (
        <div
            className="modal-title"
            style={centered ? { justifyContent: 'center', color: 'var(--text-primary)' } : undefined}
        >
            <i className={'fa-solid ' + icon} style={{ color: 'var(--ghost-color)' }}></i> {children}
        </div>
    );
}
