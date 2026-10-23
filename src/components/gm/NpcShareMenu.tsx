import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGm } from '../../gm/GmContext';
import { useTablePresence } from '../../gm/useCombatLink';
import { MAX_NPC_SHARES } from '../../gm/state';
import { randomId } from '../../table/protocol';
import type { CardSheet } from '../../card/types';
import type { GmNpcShare } from '../../gm/types';

/* Two roster menus for the rolling table open in this browser: which players
   see a trainer, and which of them may change it; and a wild Pokémon given to
   one of them. Both only write the GM screen's state. The table reads it from
   there and does the sending (src/table/npcShare.ts). */

/** A button and the floating panel it opens: in a portal, placed under the
    button or above it, as the folder menu is (FolderBits.tsx) — the roster
    clips its overflow, and a panel being dragged carries a transform. */
function PopButton({ icon, title, on, label, children }: {
    icon: string;
    title: string;
    on: boolean;
    label: string;
    children: (close: () => void) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const btn = useRef<HTMLButtonElement>(null);
    const pop = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const el = pop.current, b = btn.current;
            if (!el || !b) return;
            const r = b.getBoundingClientRect();
            const left = Math.min(Math.max(8, r.right - el.offsetWidth), Math.max(8, window.innerWidth - el.offsetWidth - 8));
            let top = r.bottom + 4;
            if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - el.offsetHeight - 4);
            el.style.left = left + 'px';
            el.style.top = top + 'px';
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node | null;
            if (t && (pop.current?.contains(t) || btn.current?.contains(t))) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <>
            <button
                ref={btn}
                type="button"
                className={'icon-btn' + (on ? ' on' : '')}
                title={title}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <i className={'fa-solid ' + icon}></i>
            </button>
            {open && createPortal(
                <div ref={pop} className="table-share-menu" role="dialog" aria-label={label} data-tt-avoid>
                    {children(() => setOpen(false))}
                </div>,
                document.body,
            )}
        </>
    );
}

/** Players at the table, the GM left out: the table's id is the GM's own. */
function usePlayers(): { present: boolean; players: { id: string; name: string }[] } {
    const table = useTablePresence();
    return { present: table.present, players: table.members.filter((m) => m.id !== table.table) };
}

export function NpcShareMenu({ trainerId, name }: { trainerId: string; name: string }) {
    const { state, store } = useGm();
    const { present, players } = usePlayers();
    const share = state.npcShares[trainerId] || null;
    if (!present && !share) return null;

    const put = (next: GmNpcShare | null) => store.update((s) => {
        const all = { ...s.npcShares };
        if (next) all[trainerId] = next; else delete all[trainerId];
        s.npcShares = all;
    });
    const full = !share && Object.keys(state.npcShares).length >= MAX_NPC_SHARES;
    /* Everyone the share names, at the table now or not: an absent player
       can still be taken off it. */
    const rows = [...players];
    for (const id of [...(share?.to ?? []), ...(share?.edit ?? [])]) {
        if (!rows.some((p) => p.id === id)) rows.push({ id, name: 'Away from the table' });
    }
    const sees = (id: string) => !!share && (share.to === null || share.to.includes(id));
    const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

    return (
        <PopButton
            icon="fa-share-nodes" on={!!share} label={'Share ' + name + ' at the table'}
            title={share ? name + ' is shared at the rolling table' : 'Share this trainer at the rolling table'}
        >
            {() => (
                <>
                    <div className="tsm-head"><i className="fa-solid fa-share-nodes"></i> {name} at the table</div>
                    <label className="tsm-check">
                        <input
                            type="checkbox" checked={!!share} disabled={full}
                            onChange={(e) => put(e.currentTarget.checked ? { to: null, edit: [] } : null)}
                        />
                        {full ? 'Shared trainers are at their limit (' + MAX_NPC_SHARES + ')' : 'Shared with players'}
                    </label>
                    {share && (
                        <>
                            <div className="tsm-seg" role="radiogroup" aria-label="Who sees it">
                                <button type="button" role="radio" aria-checked={share.to === null}
                                    className={share.to === null ? 'on' : ''}
                                    onClick={() => put({ ...share, to: null })}>Whole table</button>
                                <button type="button" role="radio" aria-checked={share.to !== null}
                                    className={share.to !== null ? 'on' : ''}
                                    onClick={() => put({ ...share, to: share.to ?? [] })}>Chosen players</button>
                            </div>
                            {!rows.length ? <p className="tsm-note">No players at the table yet.</p> : (
                                <div className="tsm-grid">
                                    <span className="tsm-col">Player</span>
                                    <span className="tsm-col">Sees</span>
                                    <span className="tsm-col">Edits</span>
                                    {rows.map((p) => (
                                        <div className="tsm-row" key={p.id}>
                                            <span className="tsm-name">{p.name}</span>
                                            <input
                                                type="checkbox" aria-label={p.name + ' sees it'}
                                                checked={sees(p.id)} disabled={share.to === null}
                                                onChange={() => put({
                                                    to: toggle(share.to ?? [], p.id),
                                                    edit: sees(p.id) ? share.edit.filter((x) => x !== p.id) : share.edit,
                                                })}
                                            />
                                            <input
                                                type="checkbox" aria-label={p.name + ' may change it'}
                                                checked={share.edit.includes(p.id)} disabled={!sees(p.id)}
                                                onChange={() => put({ ...share, edit: toggle(share.edit, p.id) })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="tsm-note">
                                Players see the whole sheet and its team, read only unless Edits is on.
                                PC boxes and bookmarks stay yours. Everyone at the table receives what is sent,
                                so a page someone modified could still read a sheet not chosen for them.
                            </p>
                        </>
                    )}
                </>
            )}
        </PopButton>
    );
}

/** Give a wild Pokémon to a player who caught it. Their answer comes back
    through the table; accepted, the wild leaves the roster (useGiftResults). */
export function GiftMenu({ gid, dexId, sheet, name }: { gid: string; dexId: string; sheet: CardSheet; name: string }) {
    const { state, store } = useGm();
    const { present, players } = usePlayers();
    const gift = state.gifts.find((g) => g.gid === gid) || null;
    if (!present && !gift) return null;

    return (
        <PopButton
            icon="fa-gift" on={!!gift} label={'Give ' + name + ' to a player'}
            title={gift ? 'Offered to ' + (gift.toName || 'a player') + ', waiting for an answer' : 'Give it to a player who caught it'}
        >
            {(close) => gift ? (
                <>
                    <div className="tsm-head"><i className="fa-solid fa-gift"></i> {name}</div>
                    <p className="tsm-note">Offered to <strong>{gift.toName || 'a player'}</strong>, waiting for their answer.</p>
                    <button type="button" className="tsm-wide" onClick={() => {
                        store.update((s) => { s.gifts = s.gifts.filter((g) => g.oid !== gift.oid); });
                        close();
                    }}>
                        <i className="fa-solid fa-rotate-left"></i> Take the offer back
                    </button>
                </>
            ) : (
                <>
                    <div className="tsm-head"><i className="fa-solid fa-gift"></i> Give {name} to…</div>
                    {!players.length && <p className="tsm-note">No players at the table yet.</p>}
                    {players.map((p) => (
                        <button
                            key={p.id} type="button" className="tsm-wide"
                            disabled={state.gifts.length >= 6}
                            onClick={() => {
                                store.update((s) => {
                                    s.gifts = [...s.gifts, {
                                        oid: randomId(8), gid, to: p.id, toName: p.name, dexId, sheet, at: Date.now(),
                                    }];
                                });
                                close();
                            }}
                        >
                            <i className="fa-solid fa-user"></i> {p.name}
                        </button>
                    ))}
                    <p className="tsm-note">They choose which of their trainers takes it: the team, or a PC box if the team is full.</p>
                </>
            )}
        </PopButton>
    );
}
