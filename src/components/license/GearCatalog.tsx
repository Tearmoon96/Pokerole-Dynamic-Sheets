import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ModalClose } from '../common/Modal';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { isMonoIcon, itemIdentityKey, normalizeIconName } from '../../lib/gear';
import type { GearIcon } from '../../lib/gear';
import { equipEntry, equipFacePartner, equipSlotDef } from './EquipmentModal';
import type { EquipSlotDef } from '../../state/constants';

/* Gear catalogue over the two bundled icon packs — the only place gear comes
   from. Picking an entry equips it into whichever slot the editor is pointed at,
   name and artwork together. Both db files list only the pieces that suit a
   Pokémon setting and that a trainer could actually wear or carry, so magic
   items, spell foci, potions, siege engines and vehicles never show up here —
   nor does anything that is a Pokémon item, which belongs in the bag instead. */

const GEAR_CAT_ALL = 'All';

export function GearCatalog({ open, slotKey, onClose }: {
    open: boolean; slotKey: string; onClose: () => void;
}) {
    const { sheet, store } = useSheetStore();
    const { gear } = useAppData();
    const toast = useToast();

    const [cat, setCat] = useState(GEAR_CAT_ALL);
    const [query, setQuery] = useState('');
    const catRow = useRef<HTMLDivElement>(null);

    const categories = useMemo(() => {
        const seen: string[] = [];
        gear.packNorm.forEach((ic) => { if (!seen.includes(ic.c)) seen.push(ic.c); });
        return [GEAR_CAT_ALL].concat(seen.sort());
    }, [gear]);

    const slot = equipSlotDef(slotKey);

    useEffect(() => {
        if (!open) return;
        setQuery('');
        /* Land on the slot's own category. If a pack edit ever removes that
           category the chip would be gone, so fall back to the whole library
           rather than filtering everything out. */
        setCat(slot.cat && categories.indexOf(slot.cat) !== -1 ? slot.cat : GEAR_CAT_ALL);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, slotKey]);

    /* The strip scrolls sideways, and a slot's category can sit well off the
       right edge — centre it so you can see what you're looking at */
    useEffect(() => {
        const row = catRow.current;
        if (!open || !row) return;
        const i = categories.indexOf(cat);
        const active = row.children[i] as HTMLElement | undefined;
        if (active) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
    }, [open, cat, categories]);

    /** Is this exact piece already on the other half of the armour cell?
        Matched on artwork first, then on name, so a renamed piece still counts
        as the same thing. */
    const equippedOnPartner = (ic: GearIcon): EquipSlotDef | null => {
        const otherKey = equipFacePartner(slotKey);
        if (!otherKey) return null;
        const other = sheet.equipment?.[otherKey] || { name: '', icon: '' };
        const sameIcon = !!other.icon && other.icon === ic.f;
        const sameName = !!(other.name || '').trim()
            && itemIdentityKey(other.name) === itemIdentityKey(ic.n);
        return (sameIcon || sameName) ? equipSlotDef(otherKey) : null;
    };

    /** Name and artwork arrive together; rename afterwards in the editor. */
    const equipGear = (ic: GearIcon) => {
        /* The catalogue never lists Pokémon items, so this only trips if
           something managed to call in from outside it */
        if (gear.isPokemonItemName(ic.n)) return;
        /* Armour and clothing are worn at the same time, so the same piece
           can't fill both */
        const clash = equippedOnPartner(ic);
        if (clash) {
            toast('<i class="fa-solid fa-right-left"></i> '
                + escapeHtml(ic.n) + ' is already in the ' + clash.label + ' slot.');
            return;
        }
        store.update((s) => {
            const cur = equipEntry(s, slotKey);
            s.equipment = { ...s.equipment, [slotKey]: { ...cur, icon: ic.f, name: ic.n } };
        });
        onClose();
    };

    const q = normalizeIconName(query);
    const current = sheet.equipment?.[slotKey]?.icon;
    const matches = gear.packNorm.filter((ic) =>
        (cat === GEAR_CAT_ALL || ic.c === cat) && (!q || ic.q.includes(q)));
    /* Names that start with the query read as the better match */
    if (q) {
        matches.sort((a, b) => {
            const aStarts = a.q.startsWith(q) ? 0 : 1;
            const bStarts = b.q.startsWith(q) ? 0 : 1;
            return aStarts - bStarts || a.n.localeCompare(b.n);
        });
    }

    const note = !gear.pack.length
        ? 'Gear packs not found in app-data — check that dnd-item-icons-by-gwill-main '
          + 'and dnd-monochrome-icons are still there.'
        : !matches.length
            ? 'No gear matches that.'
            : matches.length + ' item' + (matches.length === 1 ? '' : 's');

    return (
        <Modal open={open} onClose={onClose} boxClassName="gear-catalog-box" id="gear-catalog-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-shapes" style={{ color: 'var(--ghost-color)' }}></i>
                <span id="gear-catalog-title">Gear — {slot.label}</span>
            </div>
            <input
                type="text"
                id="gear-catalog-search"
                className="specialty-input"
                autoComplete="off"
                placeholder="Search gear..."
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <div className="gear-cat-row" id="gear-cat-row" ref={catRow}>
                {categories.map((c) => (
                    <button
                        key={c}
                        className={'gear-cat-chip' + (c === cat ? ' active' : '')}
                        onClick={() => setCat(c)}
                    >
                        {c}
                    </button>
                ))}
            </div>
            {/* Every match is drawn, "All" included — the whole catalogue is meant
                to be browsable by scrolling, not only by searching. The tiles are
                cheap and their images load lazily. */}
            <div className="gear-grid" id="gear-grid">
                {matches.map((ic) => {
                    /* Greyed out rather than hidden: it's clearer to show the piece
                       and say where it already is than to have it vanish */
                    const clash = equippedOnPartner(ic);
                    return (
                        <button
                            key={ic.f}
                            className={'gear-choice' + (ic.f === current ? ' active' : '')
                                + (clash ? ' taken' : '')}
                            title={clash ? ic.n + '\nAlready in the ' + clash.label + ' slot'
                                : ic.n + '\n' + ic.c}
                            /* Left clickable on purpose: a disabled button shows no
                               tooltip in Chrome, so the click falls through to
                               equipGear and says why nothing happened */
                            onClick={() => equipGear(ic)}
                        >
                            <img
                                loading="lazy"
                                alt={ic.n}
                                className={isMonoIcon(ic.f) ? 'mono-art' : undefined}
                                src={gear.iconUrl(ic.f)}
                            />
                        </button>
                    );
                })}
            </div>
            <div className="gear-grid-note" id="gear-grid-note">{note}</div>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
