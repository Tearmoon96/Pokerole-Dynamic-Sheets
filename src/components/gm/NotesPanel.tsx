import { useEffect, useRef } from 'react';
import { Panel } from './Panel';
import { useGm } from '../../gm/GmContext';
import { useGmConfirm } from './ConfirmDialog';
import { uid } from '../../gm/state';
import { FolderBar, ItemMove } from './FolderBits';
import { dropFolder, groupByFolder, moveFolder, moveWithinGroup } from '../../gm/folders';
import { useFlash } from '../../gm/useFlash';
import type { GmNoteSheet } from '../../gm/types';
import type { GmFolder } from '../../gm/folders';

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
    /* Notes and their folders share one slot: only one of them can have been
       the last thing moved. */
    const [moved, flash] = useFlash();
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

    const groups = groupByFolder(state.noteSheets, state.noteFolders, (n) => n.folder);

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
                    <button
                        className="icon-btn"
                        title="New folder"
                        onClick={() => store.update((s) => {
                            s.noteFolders = [...s.noteFolders, { gid: uid(), name: '', open: true }];
                        })}
                    >
                        <i className="fa-solid fa-folder-plus"></i>
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
                {!state.noteSheets.length && !state.noteFolders.length ? (
                    <div className="empty-note">
                        No notes yet. <strong>New</strong> starts one — each folds open and shut on its own,
                        and folders group them.
                    </div>
                ) : groups.map(({ folder, items }, gi) => {
                    /* The unfiled tail renders bare when there are no folders
                       at all, so a board that never uses them looks exactly as
                       it did before. */
                    if (!folder && !items.length && state.noteFolders.length) return null;
                    return (
                        <div className="folder-group" key={folder ? folder.gid : '__loose'}>
                            {folder && (
                                <FolderBar
                                    folder={folder}
                                    moved={moved === folder.gid}
                                    count={items.length}
                                    canUp={gi > 0}
                                    canDown={gi < state.noteFolders.length - 1}
                                    onToggle={() => store.update((s) => {
                                        s.noteFolders = s.noteFolders.map((f) =>
                                            f.gid === folder.gid ? { ...f, open: !f.open } : f);
                                    })}
                                    onRename={(name) => store.update((s) => {
                                        s.noteFolders = s.noteFolders.map((f) =>
                                            f.gid === folder.gid ? { ...f, name } : f);
                                    })}
                                    onMove={(dir) => {
                                        flash(folder.gid);
                                        store.update((s) => {
                                            s.noteFolders = moveFolder(s.noteFolders, folder.gid, dir);
                                        });
                                    }}
                                    onDelete={() => store.update((s) => {
                                        s.noteFolders = dropFolder(s.noteFolders, folder.gid);
                                        s.noteSheets = s.noteSheets.map((x) =>
                                            x.folder === folder.gid ? { ...x, folder: null } : x);
                                    })}
                                />
                            )}
                            {(!folder || folder.open) && items.map((n, i) => (
                                <NoteSheet
                                    key={n.gid}
                                    note={n}
                                    moved={moved === n.gid}
                                    nested={!!folder}
                                    folders={state.noteFolders}
                                    canUp={i > 0}
                                    canDown={i < items.length - 1}
                                    autoFocus={focusNext.current === n.gid}
                                    onFocused={() => { focusNext.current = null; }}
                                    onMove={(dir) => {
                                        flash(n.gid);
                                        store.update((s) => {
                                            const fid = folder ? folder.gid : null;
                                            s.noteSheets = moveWithinGroup(
                                                s.noteSheets, (x) => x.gid,
                                                (x) => (x.folder || null) === fid, n.gid, dir,
                                            );
                                        });
                                    }}
                                    onSetFolder={(gid) => store.update((s) => {
                                        s.noteSheets = s.noteSheets.map((x) =>
                                            x.gid === n.gid ? { ...x, folder: gid || null } : x);
                                    })}
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
                    );
                })}
            </div>
        </Panel>
    );
}

function NoteSheet({ note, moved, nested, folders, canUp, canDown, autoFocus, onFocused,
    onMove, onSetFolder, onToggle, onTitle, onBody, onRemove }: {
    note: GmNoteSheet;
    /** True for the moment after an up/down press landed on this note. */
    moved: boolean;
    nested: boolean;
    folders: GmFolder[];
    canUp: boolean;
    canDown: boolean;
    autoFocus: boolean;
    onFocused: () => void;
    onMove: (dir: number) => void;
    onSetFolder: (gid: string) => void;
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
        <div className={'note-sheet' + (note.open ? ' open' : '') + (nested ? ' nested' : '')
            + (moved ? ' just-moved' : '')}>
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
                <ItemMove
                    folders={folders}
                    folder={note.folder}
                    canUp={canUp}
                    canDown={canDown}
                    onMove={onMove}
                    onSetFolder={onSetFolder}
                    label="this note"
                />
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
