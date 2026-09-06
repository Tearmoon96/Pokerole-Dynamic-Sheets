import { useEffect, useRef } from 'react';

/* The contenteditable plate values on the licence.

   Kept uncontrolled: React must never rewrite the node's text while the caret
   is inside it, or every keystroke jumps to the start. The DOM is only synced
   when the incoming value differs from what is already there, which is what
   happens on a trainer switch. */

export function EditableText({ value, placeholder, id, className, title, onChange }: {
    value: string;
    placeholder?: string;
    id?: string;
    className?: string;
    title?: string;
    onChange: (next: string) => void;
}) {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (el && el.textContent !== value) el.textContent = value;
    }, [value]);

    return (
        <span
            ref={ref}
            id={id}
            className={className}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            data-placeholder={placeholder}
            title={title}
            onInput={(e) => onChange((e.currentTarget.textContent || '').replace(/\n/g, ' ').trim())}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            }}
            onPaste={(e) => {
                e.preventDefault();
                const text = (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ');
                document.execCommand('insertText', false, text);
            }}
        />
    );
}
