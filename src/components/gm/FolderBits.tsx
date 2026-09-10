import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GmFolder } from '../../gm/folders';

/* The folder chrome both the Notes panel and the roster use: the header row a
   folder gets, and the move controls an item inside one gets.

   Up/down buttons and a folder dropdown rather than drag-and-drop, and that is
   a deliberate choice, not a shortcut. HTML5 drag never fires from a finger —
   the whole reason `src/lib/touchDrag.ts` exists — and a GM screen open on a
   tablet at the table is exactly where this gets used. Buttons work the same
   under a mouse and a thumb, and they say plainly where a thing can go. */

export function FolderBar({ folder, moved, count, canUp, canDown, onToggle, onRename, onMove, onDelete }: {
    folder: GmFolder;
    /** True for the moment after an up/down press landed on this folder. */
    moved: boolean;
    count: number;
    canUp: boolean;
    canDown: boolean;
    onToggle: () => void;
    onRename: (name: string) => void;
    onMove: (dir: number) => void;
    onDelete: () => void;
}) {
    return (
        <div className={'folder-bar' + (moved ? ' just-moved' : '')}>
            <button
                className="folder-twist"
                title={folder.open ? 'Collapse this folder' : 'Expand this folder'}
                onClick={onToggle}
            >
                <i className={'fa-solid fa-chevron-' + (folder.open ? 'down' : 'right')}></i>
            </button>
            <i className={'fa-solid ' + (folder.open ? 'fa-folder-open' : 'fa-folder') + ' folder-icon'}></i>
            <input
                className="folder-name"
                type="text"
                value={folder.name}
                placeholder="Folder"
                onChange={(e) => onRename(e.currentTarget.value)}
            />
            <span className="folder-count">{count}</span>
            <div className="folder-move">
                <button disabled={!canUp} title="Move this folder up" onClick={() => onMove(-1)}>
                    <i className="fa-solid fa-chevron-up"></i>
                </button>
                <button disabled={!canDown} title="Move this folder down" onClick={() => onMove(1)}>
                    <i className="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            {/* Deleting a folder never deletes what is in it — the members come
                back out as unfiled — so this needs no confirmation. */}
            <button
                className="icon-btn danger"
                title="Delete this folder (what is inside comes back out, unfiled)"
                onClick={onDelete}
            >
                <i className="fa-solid fa-xmark"></i>
            </button>
        </div>
    );
}

export function ItemMove({ folders, folder, canUp, canDown, onMove, onSetFolder, label }: {
    folders: GmFolder[];
    folder: string | null | undefined;
    canUp: boolean;
    canDown: boolean;
    onMove: (dir: number) => void;
    onSetFolder: (gid: string) => void;
    /** Named in the button hints, so "Move up" says what is moving. */
    label: string;
}) {
    return (
        <div className="item-move" onClick={(e) => e.stopPropagation()}>
            <button disabled={!canUp} title={'Move ' + label + ' up'} onClick={() => onMove(-1)}>
                <i className="fa-solid fa-chevron-up"></i>
            </button>
            <button disabled={!canDown} title={'Move ' + label + ' down'} onClick={() => onMove(1)}>
                <i className="fa-solid fa-chevron-down"></i>
            </button>
            {/* Hidden entirely until there is somewhere to move to: a board
                with no folders should not carry a picker offering one
                choice. */}
            {folders.length > 0 && (
                <FolderMenu folders={folders} folder={folder} label={label} onSetFolder={onSetFolder} />
            )}
        </div>
    );
}

/* Where an item is filed, as a folder glyph the width of the arrows beside it
   and a menu this page draws itself.

   It WAS a native <select> laid over the glyph, and that is the thing to
   understand before changing it back. Chrome paints a select's popup from the
   select's own `background-color` and each row from that `<option>`'s `color`,
   and it will take nothing else: no border radius, no font, no accent on the
   highlighted row. So the control read correctly shut and opened as a pale
   system box with a blue selection bar — on a page that is otherwise dark red
   and rounded throughout. There is no amount of CSS on a <select> that fixes
   that; the popup is the browser's widget, not ours.

   What the native element was giving us in return was the keyboard, a
   scrolling list and a phone's own picker sheet, so those are the three things
   this has to earn back: arrows / Home / End / Enter / Escape below,
   `overflow-y: auto` with a max height in the stylesheet, and rows big enough
   for a thumb from the coarse-pointer block. */
function FolderMenu({ folders, folder, label, onSetFolder }: {
    folders: GmFolder[];
    folder: string | null | undefined;
    label: string;
    onSetFolder: (gid: string) => void;
}) {
    const filed = folders.find((f) => f.gid === folder) || null;
    const choices = [
        { gid: '', name: '— no folder —' },
        ...folders.map((f) => ({ gid: f.gid, name: f.name || 'Folder' })),
    ];
    const chosen = Math.max(0, choices.findIndex((c) => c.gid === (folder || '')));

    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(chosen);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = (refocus = true) => {
        setOpen(false);
        if (refocus) btnRef.current?.focus();
    };

    const pick = (gid: string) => {
        onSetFolder(gid);
        close();
    };

    /* Under the trigger when there is room, above it when there is not, and
       clamped to the viewport either way — the same placement the move panel
       and the ailment popover use. It is `position: fixed` in a portal
       because the panel it is opened from clips its own overflow, and a
       panel being drag-reordered carries a transform, which would make even
       a fixed child clip to it. */
    useLayoutEffect(() => {
        if (!open) return;
        const el = menuRef.current;
        const btn = btnRef.current;
        if (!el || !btn) return;
        const place = () => {
            const r = btn.getBoundingClientRect();
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            let left = r.right - w;
            left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - w - 8));
            let top = r.bottom + 4;
            if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
            el.style.left = left + 'px';
            el.style.top = top + 'px';
        };
        place();
        /* The panel scrolls under a fixed menu, so the anchor moves. */
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);

    /* Opening starts on the row that is already chosen, so Enter alone is a
       no-op rather than a silent refile to the top of the list. */
    useEffect(() => {
        if (!open) return;
        setActive(chosen);
        menuRef.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /* Clicking away closes it. mousedown rather than click: the row this sits
       in stops click from propagating so a press cannot toggle the card open,
       and that would swallow the dismissal too. */
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && t.closest && (t.closest('.folder-menu') || t.closest('.item-folder-pick'))) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const onKey = (e: React.KeyboardEvent) => {
        const n = choices.length;
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % n); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i + n - 1) % n); return; }
        if (e.key === 'Home') { e.preventDefault(); setActive(0); return; }
        if (e.key === 'End') { e.preventDefault(); setActive(n - 1); return; }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(choices[active].gid); }
    };

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={'item-folder-pick' + (filed ? ' filed' : '') + (open ? ' on' : '')}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={'Which folder ' + label + ' is filed under'}
                title={filed
                    ? label + ' is filed under “' + (filed.name || 'Folder') + '”'
                    : 'File ' + label + ' in a folder'}
                onClick={() => setOpen((v) => !v)}
            >
                <i className={'fa-solid ' + (filed ? 'fa-folder-open' : 'fa-folder')}></i>
            </button>
            {open && createPortal(
                <div
                    ref={menuRef}
                    className="folder-menu"
                    role="listbox"
                    tabIndex={-1}
                    aria-label={'Folder for ' + label}
                    onKeyDown={onKey}
                >
                    {choices.map((c, i) => (
                        <button
                            key={c.gid || '__none'}
                            type="button"
                            role="option"
                            aria-selected={i === chosen}
                            className={'folder-menu-item'
                                + (i === active ? ' active' : '')
                                + (i === chosen ? ' on' : '')
                                + (c.gid ? '' : ' folder-menu-none')}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => pick(c.gid)}
                        >
                            <i className={'fa-solid ' + (c.gid ? 'fa-folder' : 'fa-ban')}></i>
                            <span className="fname">{c.name}</span>
                            {i === chosen && <i className="fa-solid fa-check tick"></i>}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}
