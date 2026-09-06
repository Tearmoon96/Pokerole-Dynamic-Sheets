import { useEffect, useRef, useState } from 'react';
import { Modal, ModalClose } from '../common/Modal';
import { MonName, megaStoneOf } from '../common/MonName';
import { MonSprite } from '../common/MonSprite';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { useDragGhost } from '../../hooks/useDragGhost';
import { BOX_CAPACITY } from '../../state/constants';
import {
    activeBoxIdx, activeBoxObj, boxUseCustom, cycleBoxSprite, depositToBox, findMon,
    moveMonToBox, releaseMon, swapTeamSlots, withdrawFromBox,
} from '../../state/boxes';
import type { MoveResult } from '../../state/boxes';
import { boxSpriteType, boxTilePreview } from './boxSprite';
import { BOX_SPRITE_CYCLE } from '../../state/constants';
import { stripMegaSuffix } from '../../lib/sprites';
import { boxedCardUrl, openCard } from '../../lib/navigation';
import type { PokedexEntry } from '../../data/types';
import type { MonEntry, TrainerState } from '../../state/types';

/* PC storage: six renameable boxes, with the team strip in the same window so a
   deposit or withdrawal is one drag — or one click on a selected Pokémon. */

interface Pending { title: string; body: React.ReactNode; okLabel: string; run: () => void }

export function BoxModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet, store } = useSheetStore();
    const { data } = useAppData();
    const toast = useToast();
    const { setCircleDragImage, clearDragGhost } = useDragGhost();

    const [selected, setSelected] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [renaming, setRenaming] = useState(false);
    const [pending, setPending] = useState<Pending | null>(null);
    /* Which Pokémon is in flight. A ref, not state: it is read inside native
       drag handlers and must never lag a render behind. */
    const dragUid = useRef<string | null>(null);
    const tabsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        setSelected(null);
        setQuery('');
        dragUid.current = null;
    }, [open]);

    const cur = activeBoxIdx(sheet);
    const box = activeBoxObj(sheet);

    /* Six fixed boxes fit the window, but a long rename can still push the strip
       past the edge — keep the open one where it can be seen. */
    useEffect(() => {
        const row = tabsRef.current;
        if (!open || !row) return;
        const active = row.children[cur] as HTMLElement | undefined;
        if (active) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
    }, [open, cur, sheet.boxes]);

    const species = (mon: MonEntry): PokedexEntry | null =>
        mon.dexId ? (data.pokemon.find((x) => x._id === mon.dexId) || null) : null;

    /** Apply a move and raise the same toast the original did when it is refused. */
    const applyMove = (fn: (s: TrainerState) => MoveResult): boolean => {
        let result: MoveResult = { ok: false };
        store.update((s) => { result = fn(s); });
        if (!result.ok && result.message) toast(result.message);
        return result.ok;
    };

    const clearDropHover = () => {
        document.querySelectorAll('#box-modal .drop-hover')
            .forEach((el) => el.classList.remove('drop-hover'));
    };

    const dropTargetProps = (onDrop: (uid: string) => void) => ({
        onDragOver: (e: React.DragEvent) => {
            if (!dragUid.current) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.classList.add('drop-hover');
        },
        onDragLeave: (e: React.DragEvent) => e.currentTarget.classList.remove('drop-hover'),
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drop-hover');
            const uid = dragUid.current;
            dragUid.current = null;
            if (uid) onDrop(uid);
        },
    });

    const dragSourceProps = (uid: string | undefined) => ({
        draggable: true,
        onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
            dragUid.current = uid || null;
            /* Before the class goes on, so the ghost is cloned at rest */
            setCircleDragImage(e, e.currentTarget);
            e.currentTarget.classList.add('dragging');
            try { e.dataTransfer.setData('text/plain', uid || ''); } catch { /* older engines */ }
            e.dataTransfer.effectAllowed = 'move';
        },
        onDragEnd: (e: React.DragEvent<HTMLDivElement>) => {
            dragUid.current = null;
            clearDragGhost();
            e.currentTarget.classList.remove('dragging');
            clearDropHover();
        },
    });

    /* A query searches every box, so a Pokémon can be found without remembering
       which one it went into; its tile then says where. */
    const q = query.trim().toLowerCase();
    const entries: { mon: MonEntry; boxIdx: number | null }[] = q
        ? sheet.boxes
            .flatMap((b, bi) => b.mons.map((m) => ({ mon: m, boxIdx: bi })))
            .filter((e) => {
                const p = species(e.mon);
                const nick = ((e.mon.sheet?.nickname as string) || '').toLowerCase();
                return (p && (p.Name.toLowerCase().includes(q) || p.DexID.includes(q)))
                    || nick.includes(q) || String(e.mon.dexId).toLowerCase().includes(q);
            })
        : box.mons.map((m) => ({ mon: m, boxIdx: null }));

    const selectedFound = selected ? findMon(sheet, selected) : null;
    const showActions = !!(selectedFound && selectedFound.inBox);

    const type = boxSpriteType(sheet);
    const next = BOX_SPRITE_CYCLE[(BOX_SPRITE_CYCLE.indexOf(type as 'Home' | 'Book') + 1) % BOX_SPRITE_CYCLE.length];
    const customOn = boxUseCustom(sheet);

    return (
        <>
            <Modal open={open} onClose={onClose} boxClassName="box-storage-box" id="box-modal">
                <ModalClose onClick={onClose} />
                <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                    <i className="fa-solid fa-box-archive" style={{ color: 'var(--ghost-color)' }}></i> PC Storage
                </div>

                <div className="box-tabs" id="box-tabs" ref={tabsRef}>
                    {sheet.boxes.map((b, bi) => (
                        <button
                            key={bi}
                            className={'box-tab' + (bi === cur ? ' active' : '')}
                            /* The count lives in the hover text, not on the chip —
                               six of them side by side turned into a row of numbers */
                            title={b.name + '\n' + b.mons.length + ' of ' + BOX_CAPACITY
                                + ' stored — drop a Pokémon here to move it in'}
                            onClick={() => {
                                setQuery('');
                                setSelected(null);
                                store.update((s) => { s.activeBox = bi; });
                            }}
                            {...dropTargetProps((uid) => applyMove((s) => moveMonToBox(s, uid, bi)))}
                        >
                            {b.name}
                        </button>
                    ))}
                </div>

                <div className="box-toolbar">
                    <input
                        type="text"
                        id="box-search"
                        className="specialty-input box-search"
                        placeholder="Search every box by name or number..."
                        value={query}
                        onChange={(e) => setQuery(e.currentTarget.value)}
                    />
                    <span className="box-count" id="box-count">{box.mons.length} / {BOX_CAPACITY}</span>
                    <button className="box-tool-btn" onClick={() => setRenaming(true)} title="Rename this box">
                        <i className="fa-solid fa-pen"></i>
                    </button>
                </div>

                <div
                    className="box-grid"
                    id="box-grid"
                    {...dropTargetProps((uid) => applyMove((s) => moveMonToBox(s, uid, activeBoxIdx(s))))}
                >
                    {!entries.length ? (
                        <div className="box-empty">
                            {q ? 'No stored Pokémon matches that.'
                                : 'This box is empty. Drag a Pokémon down from the team strip below, '
                                + 'or use the box button on a team slot.'}
                        </div>
                    ) : entries.map((e) => {
                        const p = species(e.mon);
                        return (
                            <div
                                key={e.mon.uid}
                                className={'box-tile' + (e.mon.uid === selected ? ' selected' : '')}
                                data-uid={e.mon.uid}
                                title={monTipText(sheet, e.mon, p, e.boxIdx)}
                                onClick={() => setSelected(selected === e.mon.uid ? null : e.mon.uid!)}
                                onDoubleClick={() => {
                                    if (!e.mon.dexId) return;
                                    store.save();
                                    openCard(boxedCardUrl(sheet, e.mon.dexId, e.mon.uid!));
                                }}
                                {...dragSourceProps(e.mon.uid)}
                            >
                                {p && (
                                    <MonSprite
                                        pokemon={p}
                                        sheet={e.mon.sheet}
                                        preview={boxTilePreview(sheet, e.mon, p, data.spriteFrames)}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="box-actions" id="box-actions" style={{ display: showActions ? 'flex' : 'none' }}>
                    <span className="box-actions-name" id="box-actions-name">
                        {selectedFound && <MonName mon={selectedFound.mon} pokemon={species(selectedFound.mon)} />}
                    </span>
                    <button
                        className="form-btn save"
                        onClick={() => {
                            if (selected && applyMove((s) => withdrawFromBox(s, selected, null))) setSelected(null);
                        }}
                    >
                        Withdraw
                    </button>
                    <button
                        className="form-btn cancel"
                        onClick={() => {
                            const found = selected ? findMon(sheet, selected) : null;
                            if (!found || !found.mon.dexId) return;
                            store.save();
                            openCard(boxedCardUrl(sheet, found.mon.dexId, selected!));
                        }}
                    >
                        Open card
                    </button>
                    <button
                        className="form-btn danger"
                        onClick={() => {
                            const found = selected ? findMon(sheet, selected) : null;
                            if (!found || !found.inBox) return;
                            const p = species(found.mon);
                            const uid = found.mon.uid!;
                            setPending({
                                title: 'Release Pokémon',
                                body: (
                                    <>
                                        Release <strong>{p ? p.Name : found.mon.dexId}</strong>? Its sheet —
                                        trained stats, moves, notes and all — goes with it.
                                    </>
                                ),
                                okLabel: 'Release',
                                run: () => {
                                    store.update((s) => releaseMon(s, uid));
                                    setSelected((prev) => prev === uid ? null : prev);
                                },
                            });
                        }}
                    >
                        Release
                    </button>
                </div>

                <div className="box-team-strip">
                    <span className="box-team-label">Team</span>
                    <div className="box-team-slots" id="box-team-slots">
                        {sheet.team.map((slot, i) => {
                            const p = species(slot);
                            return (
                                <div
                                    key={i}
                                    className="box-team-slot"
                                    title={p
                                        ? p.Name + '\nClick or drag to deposit into ' + box.name
                                        : 'Empty team slot — drop a stored Pokémon here to withdraw it'}
                                    onClick={p ? () => applyMove((s) => depositToBox(s, i, activeBoxIdx(s))) : undefined}
                                    {...(p ? dragSourceProps(slot.uid) : {})}
                                    {...dropTargetProps((uid) => {
                                        const found = findMon(sheet, uid);
                                        if (!found) return;
                                        if (found.inBox) applyMove((s) => withdrawFromBox(s, uid, i));
                                        else store.update((s) => swapTeamSlots(s, found.idx, i));
                                    })}
                                >
                                    {p ? (
                                        /* Same sprite set AND the same well as the tiles
                                           above, so the window reads as one board */
                                        <MonSprite
                                            pokemon={p}
                                            sheet={slot.sheet}
                                            preview={boxTilePreview(sheet, slot, p, data.spriteFrames)}
                                        />
                                    ) : (
                                        <i className="fa-solid fa-plus"></i>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {/* Both controls change how every sprite in the window is drawn,
                        team strip included, so they sit with it */}
                    <div className="box-strip-tools">
                        <button
                            className="box-sprite-btn"
                            id="box-sprite-btn"
                            onClick={() => store.update(cycleBoxSprite)}
                            /* The icon says "this cycles", the label says what it is on now */
                            title={'Sprite set\nShowing ' + type + ' art — click to switch to ' + next}
                        >
                            <i className="fa-solid fa-arrows-rotate"></i> {type}
                        </button>
                        {/* Filled = on, hollow = off, and the eye says which */}
                        <button
                            className={'box-sprite-btn box-custom-btn' + (customOn ? '' : ' off')}
                            id="box-custom-btn"
                            aria-pressed={customOn}
                            onClick={() => store.update((s) => { s.boxUseCustom = !boxUseCustom(s); })}
                            title={'Uploaded art\n' + (customOn
                                ? 'Shown ahead of the ' + type + ' set — click to hide it'
                                : 'Hidden; every Pokémon uses the ' + type + ' set — click to show it')}
                        >
                            <i className={'fa-solid fa-' + (customOn ? 'eye' : 'eye-slash')}></i> Custom
                        </button>
                    </div>
                </div>
            </Modal>

            <BoxRenameModal open={renaming} onClose={() => setRenaming(false)} />

            {/* Shared confirm for the destructive storage actions */}
            <Modal open={!!pending} onClose={() => setPending(null)} id="box-confirm-modal" zIndex={260}>
                <ModalClose onClick={() => setPending(null)} />
                <div className="modal-title" id="box-confirm-title">
                    <i className="fa-solid fa-triangle-exclamation"></i> <span>{pending?.title}</span>
                </div>
                <p className="modal-text" id="box-confirm-text">{pending?.body}</p>
                <div className="modal-actions">
                    <button className="form-btn cancel" onClick={() => setPending(null)}>Cancel</button>
                    <button
                        className="form-btn danger"
                        id="box-confirm-ok"
                        onClick={() => { const act = pending; setPending(null); act?.run(); }}
                    >
                        {pending?.okLabel}
                    </button>
                </div>
            </Modal>
        </>
    );
}

function BoxRenameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet, store } = useSheetStore();
    const [name, setName] = useState('');
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setName(activeBoxObj(sheet).name);
        const id = window.setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const confirm = () => {
        const v = name.trim();
        store.update((s) => {
            const i = activeBoxIdx(s);
            s.boxes = s.boxes.map((b, bi) => bi === i ? { ...b, name: v || ('Box ' + (i + 1)) } : b);
        });
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} id="box-rename-modal" zIndex={260}>
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-pen" style={{ color: 'var(--ghost-color)' }}></i> Rename box
            </div>
            <input
                ref={ref}
                type="text"
                id="box-rename-input"
                className="specialty-input"
                maxLength={24}
                placeholder="Box name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
            />
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onClose}>Cancel</button>
                <button className="form-btn save" onClick={confirm}>Rename</button>
            </div>
        </Modal>
    );
}

/* A stored Pokémon is drawn as its sprite and nothing else, so the name, rank
   and gender live in the hover bubble instead. The themed tooltip splits on the
   first newline: heading, then body. */
function monTipText(
    s: TrainerState, mon: MonEntry, p: PokedexEntry | null, showBoxIdx: number | null,
): string {
    const nick = ((mon.sheet?.nickname as string) || '').trim();
    const name = p ? (megaStoneOf(p) ? stripMegaSuffix(p.Name) : p.Name) : mon.dexId;
    const g = mon.sheet?.gender as string | undefined;
    const gender = g === 'M' ? '♂' : (g === 'F' ? '♀' : '');
    /* A nickname takes the heading and the species drops into the body, so a
       nicknamed Pokémon never becomes unidentifiable */
    const parts: string[] = [];
    if (nick) parts.push(name + (gender ? ' ' + gender : ''));
    else if (gender) parts.push(gender);
    if (mon.sheet?.rank) parts.push(mon.sheet.rank as string);
    if (showBoxIdx != null) parts.push('in ' + s.boxes[showBoxIdx].name);
    return (nick || name) + (parts.length ? '\n' + parts.join(' · ') : '');
}
