import { useEffect, useRef } from 'react';
import { Panel } from './Panel';
import { useGm } from '../../gm/GmContext';
import { useGmConfirm } from './ConfirmDialog';
import { uid } from '../../gm/state';
import type { GmNoteSheet } from '../../gm/types';

/* A stack of note sheets, each folding open and shut on its own. */

function notePreview(n: GmNoteSheet): string {
    const first = (n.body || '').split('\n').find((l) => l.trim());
    return first ? first.trim() : '';
}

/** Size a note to its text. scrollHeight reads 0 on an element that has not
    been laid out, so this runs after the note is in the document. */
function autoGrow(el: HTMLTextAreaElement | null): void {
    if (!el) return;
    el.style.height = 'auto';
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = (el.scrollHeight + borders) + 'px';
}

export function NotesPanel({ onReorder }: { onReorder: (from: string, to: string) => void }) {
    const { state, store } = useGm();
    const confirm = useGmConfirm();
    /* Straight into the title of the note just made — it is the one thing a new
       note always needs and the only empty field in it. */
    const focusNext = useRef<string | null>(null);

    const setAll = (open: boolean) => store.update((s) => {
        s.noteSheets = s.noteSheets.map((n) => ({ ...n, open }));
    });

    const remove = async (n: GmNoteSheet) => {
        const label = (n.title || '').trim() || 'this note';
        /* Only ask when there is something to lose */
        if ((n.body || '').trim()) {
            const go = await confirm({
                icon: 'fa-trash-can', danger: true, confirmLabel: 'Delete',
                title: 'Delete ' + label + '?',
                text: 'Its text goes with it. This cannot be undone.',
            });
            if (!go) return;
        }
        store.update((s) => { s.noteSheets = s.noteSheets.filter((x) => x.gid !== n.gid); });
    };

    return (
        <Panel
            panelKey="notes"
            icon="fa-pen-nib"
            title="Notes"
            onReorder={onReorder}
            actions={
                <>
                    <button
                        className="icon-btn"
                        title="New note"
                        onClick={() => {
                            const gid = uid();
                            focusNext.current = gid;
                            store.update((s) => {
                                s.noteSheets = [...s.noteSheets, { gid, title: '', body: '', open: true }];
                            });
                        }}
                    >
                        <i className="fa-solid fa-plus"></i> New
                    </button>
                    <button className="icon-btn" title="Expand every note" onClick={() => setAll(true)}>
                        <i className="fa-solid fa-angles-down"></i>
                    </button>
                    <button className="icon-btn" title="Collapse every note" onClick={() => setAll(false)}>
                        <i className="fa-solid fa-angles-up"></i>
                    </button>
                </>
            }
        >
            <div className="panel-body" id="notes-body">
                {!state.noteSheets.length ? (
                    <div className="empty-note">
                        No notes yet. <strong>New</strong> starts one — each folds open and shut on its own.
                    </div>
                ) : state.noteSheets.map((n) => (
                    <NoteSheet
                        key={n.gid}
                        note={n}
                        autoFocus={focusNext.current === n.gid}
                        onFocused={() => { focusNext.current = null; }}
                        onToggle={() => store.update((s) => {
                            s.noteSheets = s.noteSheets.map((x) =>
                                x.gid === n.gid ? { ...x, open: !x.open } : x);
                        })}
                        onTitle={(title) => store.update((s) => {
                            s.noteSheets = s.noteSheets.map((x) => x.gid === n.gid ? { ...x, title } : x);
                        })}
                        onBody={(body) => store.update((s) => {
                            s.noteSheets = s.noteSheets.map((x) => x.gid === n.gid ? { ...x, body } : x);
                        })}
                        onRemove={() => { void remove(n); }}
                    />
                ))}
            </div>
        </Panel>
    );
}

function NoteSheet({ note, autoFocus, onFocused, onToggle, onTitle, onBody, onRemove }: {
    note: GmNoteSheet;
    autoFocus: boolean;
    onFocused: () => void;
    onToggle: () => void;
    onTitle: (v: string) => void;
    onBody: (v: string) => void;
    onRemove: () => void;
}) {
    const titleRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (autoFocus) { titleRef.current?.focus(); onFocused(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFocus]);

    useEffect(() => { autoGrow(bodyRef.current); }, [note.open, note.body]);

    return (
        <div className={'note-sheet' + (note.open ? ' open' : '')}>
            <div className="note-head" onClick={onToggle}>
                <i className={'fa-solid fa-chevron-' + (note.open ? 'down' : 'right') + ' note-chevron'}></i>
                <input
                    ref={titleRef}
                    className="note-title"
                    type="text"
                    value={note.title}
                    placeholder="Untitled"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onTitle(e.currentTarget.value)}
                />
                {!note.open && <span className="note-preview">{notePreview(note)}</span>}
                <button
                    className="icon-btn danger"
                    title="Delete this note"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                >
                    <i className="fa-solid fa-xmark"></i>
                </button>
            </div>
            {note.open && (
                <textarea
                    ref={bodyRef}
                    className="note-body"
                    placeholder="Write here…"
                    value={note.body}
                    onChange={(e) => onBody(e.currentTarget.value)}
                />
            )}
        </div>
    );
}
