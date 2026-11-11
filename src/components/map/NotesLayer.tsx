import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useMap } from '../../map/MapContext';
import { Popover } from './Popover';
import { useGmConfirm } from '../gm/ConfirmDialog';
import { CELL } from '../../map/render/patterns';
import { NOTE_TEXT_MAX, NOTE_TITLE_MAX, freeBox, isEmptyNote, liveNotes, markerAt, noteBox, noteFor } from '../../map/notes';
import type { NoteHit } from '../../map/notes';
import type { Box } from '../../map/world/placed';
import { uid } from '../../map/doc';
import type { NotesShow } from '../../map/store';
import type { MapDoc, MapNote, NoteTarget } from '../../map/types';

/* The GM's notes on the map (notes.ts): a marker on the thing or the area a
   note belongs to, and a click on the marker opens the note.

   DOM only, inside `.map-world` and over the fog — the GM's own view. Nothing
   here is ever drawn into a picture of the map: the PNG export and the
   players' view at the table do not know notes exist.

   Which markers show: every one while the Note tool is out or with "Always";
   with "On hover" the one under the pointer (MapCanvas works out which, by
   geometry, under every tool); with "Hidden" none. The note whose window is
   open always keeps its marker, which the window hangs from. */

/** The marker's radius on screen, in px. */
export const NOTE_PIN_PX = 12;

export function NotesLayer({ doc, zoom, hover, draft, onGrab }: {
    doc: MapDoc;
    zoom: number;
    /** The note under the pointer, and the box its marker sits in. */
    hover: NoteHit | null;
    /** An area being dragged out with the Note tool. */
    draft: Box | null;
    /** A press on a free note's marker (move) or its area's corner
        (resize) under the Note tool: MapCanvas drags it. */
    onGrab: (e: ReactPointerEvent, note: MapNote, grab: 'move' | 'resize') => void;
}) {
    const { store, ui } = useMap();
    const anchor = useRef<HTMLButtonElement>(null);
    const open = ui.noteOpen && ui.noteOpen.doc === doc.id ? ui.noteOpen : null;
    const noteTool = ui.tool === 'note';
    const notes = liveNotes(doc);
    if (open?.draft && !notes.some((n) => n.id === open.id)) notes.push(open.draft);
    const r = NOTE_PIN_PX / (zoom * CELL);
    const all = noteTool || ui.notesShow === 'always';

    const pins: { note: MapNote; at: [number, number] }[] = [];
    for (const n of notes) {
        const isOpen = open?.id === n.id;
        const isHover = hover?.id === n.id;
        if (!all && !isOpen && !(isHover && ui.notesShow === 'hover')) continue;
        const box = isHover ? hover!.box : noteBox(doc, n);
        if (box) pins.push({ note: n, at: markerAt(box, r) });
    }
    const areas = notes.filter((n) => !n.on && (n.w ?? 0) > 0 && (n.h ?? 0) > 0
        && (noteTool || open?.id === n.id || (hover?.id === n.id && ui.notesShow !== 'hidden')));

    const toggle = (n: MapNote) => {
        if (open?.id === n.id) closeNote(store, doc, open.id);
        else store.setUi({ noteOpen: { doc: doc.id, id: n.id, edit: false } });
    };

    return (
        <div className="map-notes" aria-hidden={false}>
            {areas.map((n) => {
                const b = freeBox(n);
                return (
                    <div key={n.id} className={'map-note-area' + (noteTool ? ' tool' : '')} data-note-area={n.id}
                        style={{ left: b.x * CELL, top: b.y * CELL, width: b.w * CELL, height: b.h * CELL, borderWidth: 1.5 / zoom }}>
                        {noteTool && doc.notes?.some((o) => o.id === n.id) && (
                            <span className="map-note-corner" data-note-corner={n.id} title="Drag to resize the area"
                                style={{ transform: `translate(50%, 50%) scale(${1 / zoom})` }}
                                onPointerDown={(e) => { e.stopPropagation(); if (e.button === 0) { e.preventDefault(); onGrab(e, n, 'resize'); } }} />
                        )}
                    </div>
                );
            })}
            {draft && (
                <div className="map-note-area tool draft"
                    style={{ left: draft.x * CELL, top: draft.y * CELL, width: draft.w * CELL, height: draft.h * CELL, borderWidth: 1.5 / zoom }} />
            )}
            {pins.map(({ note, at }) => (
                <button
                    key={note.id}
                    ref={open?.id === note.id ? anchor : undefined}
                    type="button"
                    className={'map-note-pin' + (open?.id === note.id ? ' open' : '')}
                    data-note={note.id}
                    title={note.title.trim() || 'GM note'}
                    style={{ left: at[0] * CELL, top: at[1] * CELL, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0) return;
                        if (noteTool && !note.on) { e.preventDefault(); onGrab(e, note, 'move'); }
                    }}
                    onClick={() => { if (!(noteTool && !note.on)) toggle(note); }}
                >
                    <i className="fa-solid fa-note-sticky"></i>
                </button>
            ))}
            {open && (
                <Popover anchor={anchor} open onClose={() => closeNote(store, doc, open.id)} className="map-note-pop">
                    <NoteWindow key={open.id} doc={doc} />
                </Popover>
            )}
        </div>
    );
}

/** Close the open note; a free note left with no words is taken off. */
export function closeNote(store: ReturnType<typeof useMap>['store'], doc: MapDoc, id: string): void {
    store.setUi({ noteOpen: null });
    const n = doc.notes?.find((o) => o.id === id);
    if (n && !n.on && isEmptyNote(n)) store.removeNote(id);
}

function NoteWindow({ doc }: { doc: MapDoc }) {
    const { store, ui } = useMap();
    const confirm = useGmConfirm();
    const open = ui.noteOpen!;
    const note = doc.notes?.find((n) => n.id === open.id) ?? open.draft;
    const titleRef = useRef<HTMLInputElement>(null);
    const textRef = useRef<HTMLTextAreaElement>(null);
    /* Into the title of a new note, the end of the text of one with a
       title. A frame later: the window is measured hidden first, and a
       hidden field cannot take the focus. */
    useEffect(() => {
        if (!open.edit) return;
        const frame = requestAnimationFrame(() => {
            const el = note && note.title ? textRef.current : titleRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        });
        return () => cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open.edit]);
    if (!note) return null;

    const remove = async () => {
        const empty = isEmptyNote(note);
        if (!empty) {
            const ok = await confirm({
                icon: 'fa-trash', title: 'Delete this note?', text: (note.title.trim() || 'This note') + ' will be deleted. Undo brings it back.',
                confirmLabel: 'Delete', danger: true,
            });
            if (!ok) return;
        }
        store.setUi({ noteOpen: null });
        store.removeNote(note.id);
    };

    return (
        <div className="map-note-window" data-note-window={note.id}>
            <div className="map-note-private"><i className="fa-solid fa-eye-slash"></i> GM only — players never see this</div>
            {open.edit ? (
                <>
                    <input
                        ref={titleRef} type="text" className="map-note-title-field" placeholder="Title"
                        maxLength={NOTE_TITLE_MAX} value={note.title}
                        onChange={(e) => store.putNote(note, { title: e.currentTarget.value })}
                    />
                    <textarea
                        ref={textRef} className="map-note-text-field" rows={8} maxLength={NOTE_TEXT_MAX}
                        placeholder="What the place is like, who is there, what the party can find…"
                        value={note.text}
                        onChange={(e) => store.putNote(note, { text: e.currentTarget.value })}
                    />
                </>
            ) : (
                <>
                    <div className="map-note-title">{note.title.trim() || 'Untitled note'}</div>
                    {note.text.trim()
                        ? <div className="map-note-text">{note.text}</div>
                        : <div className="map-note-text empty">No description yet.</div>}
                </>
            )}
            <div className="map-note-actions">
                <button className="map-chip" data-note-delete="" onClick={() => void remove()}>
                    <i className="fa-solid fa-trash"></i> Delete
                </button>
                {open.edit ? (
                    <button className="accent" data-note-done="" onClick={() => closeNote(store, doc, note.id)}>Done</button>
                ) : (
                    <button className="accent" data-note-edit="" onClick={() => store.setUi({ noteOpen: { ...open, edit: true } })}>
                        <i className="fa-solid fa-pen"></i> Edit
                    </button>
                )}
            </div>
        </div>
    );
}

/** The inspector's "GM note" fields for a landmark, a building or a whole
    wall run: typing makes the note, emptying both fields takes it off. */
export function NoteFields({ doc, on }: { doc: MapDoc; on: NoteTarget }) {
    const { store } = useMap();
    const note = noteFor(doc, on);
    /* The id a note made here will take, kept across renders until it exists. */
    const [fresh] = useState(uid);
    const base: MapNote = note ?? { id: fresh, on, title: '', text: '' };
    return (
        <div className="map-note-fields" data-note-fields={on.kind}>
            <div className="map-note-fields-title">
                <i className="fa-solid fa-note-sticky"></i> GM note
                <span className="map-hint"> — only you see it</span>
            </div>
            <input
                type="text" placeholder="Title" maxLength={NOTE_TITLE_MAX} value={base.title}
                onChange={(e) => store.putNote(base, { title: e.currentTarget.value })}
            />
            <textarea
                rows={Math.min(10, Math.max(3, base.text.split('\n').length + 1))} maxLength={NOTE_TEXT_MAX}
                placeholder="A description to read out or keep in mind. A marker shows on the map; click it to read this."
                value={base.text}
                onChange={(e) => store.putNote(base, { text: e.currentTarget.value })}
            />
        </div>
    );
}

const SHOW_CHOICES: { v: NotesShow; icon: string; name: string; hint: string }[] = [
    { v: 'always', icon: 'fa-eye', name: 'Always', hint: 'Every note\'s marker is on the map' },
    { v: 'hover', icon: 'fa-arrow-pointer', name: 'On hover', hint: 'A marker shows while the pointer is over the place or the thing' },
    { v: 'hidden', icon: 'fa-eye-slash', name: 'Hidden', hint: 'No markers (the Note tool still shows them all)' },
];

/** Always / On hover / Hidden — this browser's choice for every map. */
export function NotesShowChoice() {
    const { store, ui } = useMap();
    return (
        <div className="map-segmented map-notes-show" role="group" aria-label="When note markers show">
            {SHOW_CHOICES.map((c) => (
                <button key={c.v} aria-pressed={ui.notesShow === c.v} data-notes-show={c.v} title={c.hint}
                    onClick={() => store.setNotesShow(c.v)}>
                    <i className={'fa-solid ' + c.icon}></i> {c.name}
                </button>
            ))}
        </div>
    );
}
