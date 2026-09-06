import { useEffect, useState } from 'react';
import { Modal, ModalClose } from '../common/Modal';
import { Suggestions } from '../common/Suggestions';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { EQUIP_SLOTS } from '../../state/constants';
import { defaultEquipment } from '../../state/defaults';
import { isMonoIcon, itemIdentityKey, normalizeIconName } from '../../lib/gear';
import type { GearIcon, GearIndex } from '../../lib/gear';
import type { EquipSlotDef } from '../../state/constants';
import type { EquipSlotEntry, TrainerState } from '../../state/types';
import { GearCatalog } from './GearCatalog';

/* Trainer equipment: the worn slots, the carried bag beside them, and an editor
   for whichever slot is picked. */

/** Armour and clothing share the same grid cell; only one is on it at a time. */
export const EQUIP_FACES = ['armor', 'clothing'];

export function equipFacePartner(key: string): string | null {
    const i = EQUIP_FACES.indexOf(key);
    return i === -1 ? null : EQUIP_FACES[1 - i];
}

export function equipSlotDef(key: string): EquipSlotDef {
    return EQUIP_SLOTS.find((s) => s.key === key) || EQUIP_SLOTS[0];
}

/** Tolerates sheets loaded before normalizeState ran over them. */
export function equipEntry(s: TrainerState, key: string): EquipSlotEntry {
    if (!s.equipment || typeof s.equipment !== 'object') s.equipment = defaultEquipment();
    if (!s.equipment[key]) s.equipment[key] = { name: '', notes: '', icon: '' };
    return s.equipment[key];
}

/** Artwork for a slot: the icon of the gear equipped there, or the slot's own
    silhouette when it's empty. */
function EquipArt({ slot, entry, gear }: { slot: EquipSlotDef; entry: EquipSlotEntry; gear: GearIndex }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [entry.icon]);

    /* A missing file (pack removed or renamed) falls back quietly */
    if (!entry.icon || broken) return <i className={'fa-solid ' + slot.icon} />;
    return (
        <img
            loading="lazy"
            alt=""
            className={'equip-art' + (isMonoIcon(entry.icon) ? ' mono-art' : '')}
            src={gear.iconUrl(entry.icon)}
            onError={() => setBroken(true)}
        />
    );
}

export function EquipmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet, store } = useSheetStore();
    const { gear } = useAppData();

    const [selected, setSelected] = useState(EQUIP_SLOTS[0].key);
    const [armorFace, setArmorFace] = useState('armor');
    const [catalogOpen, setCatalogOpen] = useState(false);

    /* Open on whichever face has something on it, armour first */
    useEffect(() => {
        if (!open) return;
        setSelected(EQUIP_SLOTS[0].key);
        setArmorFace(EQUIP_FACES.find((k) => (sheet.equipment?.[k]?.name || '').trim()) || 'armor');
        setCatalogOpen(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const entryOf = (key: string): EquipSlotEntry =>
        sheet.equipment?.[key] || { name: '', notes: '', icon: '' };

    const writeEntry = (key: string, patch: Partial<EquipSlotEntry>) => store.update((s) => {
        const cur = equipEntry(s, key);
        s.equipment = { ...s.equipment, [key]: { ...cur, ...patch } };
    });

    const selectSlot = (key: string) => {
        setSelected(key);
        /* An empty slot has nothing worth editing yet, so go straight to the
           catalogue rather than making you click a second button */
        if (!(entryOf(key).name || '').trim()) setCatalogOpen(true);
    };

    const slot = equipSlotDef(selected);
    const entry = entryOf(selected);
    const equipped = !!(entry.name || '').trim();

    return (
        <>
            <Modal open={open} onClose={onClose} boxClassName="equipment-box" id="equipment-modal">
                <ModalClose onClick={onClose} />
                <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                    <i className="fa-solid fa-shield-halved" style={{ color: 'var(--ghost-color)' }}></i>
                    <span>Trainer Equipment</span>
                </div>
                <p className="modal-text">
                    Click a slot to equip something from the gear catalogue. Hover a slot to see which one it is.
                </p>

                <div className="equip-layout">
                    <div id="equip-slots">
                        {EQUIP_SLOTS.map((s) => {
                            /* Armour and clothing share a cell; only the showing one is
                               drawn, or the two would stack on top of each other */
                            if (equipFacePartner(s.key) && s.key !== armorFace) return null;
                            const e = entryOf(s.key);
                            const name = (e.name || '').trim();
                            return (
                                <button
                                    key={s.key}
                                    type="button"
                                    className={'equip-slot' + (name ? ' filled' : '')
                                        + (s.key === selected ? ' selected' : '')}
                                    style={{ gridArea: s.area }}
                                    /* Nothing is labelled on the grid itself, so the tooltip
                                       is what tells you which slot this is and what's in it */
                                    title={s.label + '\n' + (name || 'empty')}
                                    onClick={() => selectSlot(s.key)}
                                >
                                    <EquipArt slot={s} entry={e} gear={gear} />
                                    {equipFacePartner(s.key) && (
                                        <FaceToggle
                                            currentKey={s.key}
                                            otherName={(entryOf(equipFacePartner(s.key)!).name || '').trim()}
                                            onFlip={() => {
                                                const other = equipFacePartner(s.key)!;
                                                setArmorFace(other);
                                                /* Keep the editor on the cell you're looking at, but
                                                   don't yank it away from some other slot you were
                                                   in the middle of */
                                                setSelected((prev) => EQUIP_FACES.includes(prev) ? other : prev);
                                            }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <EquipBag />
                </div>

                <div className="equip-editor" id="equip-editor">
                    <div className="equip-editor-head">
                        <i className={'fa-solid ' + slot.icon}></i><span>{slot.label}</span>
                    </div>

                    {!equipped ? (
                        <>
                            {/* Nothing equipped yet: one button, and no fields to fill in */}
                            <p className="modal-text">This slot is empty.</p>
                            <button
                                className="form-btn save"
                                style={{ alignSelf: 'flex-start' }}
                                onClick={() => setCatalogOpen(true)}
                            >
                                <i className="fa-solid fa-shapes"></i> Choose gear
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="equip-field-label">Item</div>
                            {/* Free text so it can be renamed for flavour, but it always
                                starts out as whatever was picked from the catalogue */}
                            <input
                                type="text"
                                id="equip-name-input"
                                className="specialty-input equip-name-input"
                                autoComplete="off"
                                placeholder="Name this piece of gear..."
                                value={entry.name || ''}
                                onChange={(e) => writeEntry(selected, { name: e.currentTarget.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                            />

                            <div className="equip-field-label" style={{ marginTop: '4px' }}>Effect / notes</div>
                            <textarea
                                className="equip-notes"
                                placeholder="What it does, where it came from, any bonus it grants..."
                                value={entry.notes || ''}
                                onChange={(e) => writeEntry(selected, { notes: e.currentTarget.value })}
                            />

                            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                                <button className="form-btn cancel" onClick={() => setCatalogOpen(true)}>
                                    <i className="fa-solid fa-shapes"></i> Change gear
                                </button>
                                <button
                                    className="form-btn cancel"
                                    onClick={() => writeEntry(selected, { name: '', notes: '', icon: '' })}
                                >
                                    Remove
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="form-btn save" onClick={onClose}>Done</button>
                </div>
            </Modal>

            <GearCatalog
                open={catalogOpen}
                slotKey={selected}
                onClose={() => setCatalogOpen(false)}
            />
        </>
    );
}

/* The armour/clothing flip, parked in the corner of whichever of the two is
   currently on the grid. A span rather than a button because it lives inside
   one, and nesting buttons is invalid. */
function FaceToggle({ currentKey, otherName, onFlip }: {
    currentKey: string; otherName: string; onFlip: () => void;
}) {
    const other = equipSlotDef(equipFacePartner(currentKey)!);
    const flip = (e: React.SyntheticEvent) => {
        /* Without this the tile underneath would take the click too and select
           the face we're leaving */
        e.stopPropagation();
        e.preventDefault();
        onFlip();
    };
    return (
        <span
            className={'equip-face-toggle' + (otherName ? ' has-other' : '')}
            role="button"
            tabIndex={0}
            title={'Show ' + other.label + ' — ' + (otherName || 'empty')}
            onClick={flip}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') flip(e); }}
        >
            <i className="fa-solid fa-right-left"></i>
        </span>
    );
}

/* Adventurer Bag: what the trainer carries rather than wears. Built like the
   sheet's own Bag panel — a lined list with quantities — but stocked from the
   gear catalogue instead of items-db.js. The two never mix: potions and
   Pokéballs go in the Bag downstairs, rope and lanterns go in here. */

const EQUIP_BAG_SUGGESTIONS = 8;

function GearArt({ file, gear }: { file: string; gear: GearIndex }) {
    const [broken, setBroken] = useState(false);
    /* Pack renamed or removed: drop the image rather than show a broken one,
       the name still says what it is */
    if (!file || broken) return null;
    return (
        <img
            loading="lazy"
            alt=""
            className={isMonoIcon(file) ? 'mono-art' : undefined}
            src={gear.iconUrl(file)}
            onError={() => setBroken(true)}
        />
    );
}

function EquipBag() {
    const { sheet, store } = useSheetStore();
    const { gear } = useAppData();
    const toast = useToast();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);

    const items = sheet.equipBag;
    const findGear = (name: string): GearIcon | null => {
        const q = itemIdentityKey(name);
        if (!q) return null;
        return gear.packNorm.find((ic) => itemIdentityKey(ic.n) === q) || null;
    };

    const addItem = (name: string) => {
        const clean = String(name || '').trim();
        if (!clean) return;
        /* Mirror of the guard on the sheet's Bag: that one turns gear away, this
           one turns Pokémon items away. Free text is still fine for homebrew
           neither database knows about. */
        if (gear.isPokemonItemName(clean)) {
            toast('<i class="fa-solid fa-briefcase-medical"></i> '
                + escapeHtml(clean) + ' is a Pokémon item — it goes in the Bag.');
            setQuery('');
            setOpen(false);
            return;
        }
        const found = findGear(clean);
        store.update((s) => {
            const rows = Array.isArray(s.equipBag) ? s.equipBag : [];
            const existing = rows.find((e) => itemIdentityKey(e.name) === itemIdentityKey(clean));
            if (existing) {
                s.equipBag = rows.map((e) => e === existing ? { ...e, qty: e.qty + 1 } : e);
            } else {
                /* Take the catalogue's spelling and artwork when it knows the
                   name, so a typed entry looks the same as a picked one */
                s.equipBag = [...rows, { name: found ? found.n : clean, icon: found ? found.f : '', qty: 1 }];
            }
        });
        setQuery('');
        setOpen(false);
    };

    const q = normalizeIconName(query);
    const matches = gear.packNorm.filter((ic) => !q || ic.q.includes(q));
    matches.sort((a, b) => {
        const aStarts = a.q.startsWith(q) ? 0 : 1;
        const bStarts = b.q.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.n.localeCompare(b.n);
    });
    const shown = matches.slice(0, EQUIP_BAG_SUGGESTIONS);

    return (
        <div className="equip-bag">
            <div className="equip-bag-label">
                <i className="fa-solid fa-suitcase"></i> Adventurer Bag
            </div>
            <div className="bag-list" id="equip-bag-list">
                {!items.length && <span className="bag-empty">Nothing packed yet.</span>}
                {items.map((entry, idx) => {
                    const found = findGear(entry.name);
                    return (
                        <div className="line-item" key={idx} title={found ? found.n + '\n' + found.c : undefined}>
                            <GearArt file={entry.icon || found?.f || ''} gear={gear} />
                            <span className="line-item-name">{entry.name}</span>
                            <button
                                className="pool-btn"
                                title="One fewer"
                                onClick={() => store.update((s) => {
                                    s.equipBag = s.equipBag.map((e, j) =>
                                        j === idx ? { ...e, qty: Math.max(1, e.qty - 1) } : e);
                                })}
                            >
                                <i className="fa-solid fa-minus"></i>
                            </button>
                            <span className="line-item-qty">×{entry.qty}</span>
                            <button
                                className="pool-btn"
                                title="One more"
                                onClick={() => store.update((s) => {
                                    s.equipBag = s.equipBag.map((e, j) => j === idx ? { ...e, qty: e.qty + 1 } : e);
                                })}
                            >
                                <i className="fa-solid fa-plus"></i>
                            </button>
                            <button
                                className="item-remove"
                                title="Drop it"
                                onClick={() => store.update((s) => {
                                    s.equipBag = s.equipBag.filter((_, j) => j !== idx);
                                })}
                            >
                                <i className="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    );
                })}
            </div>
            <div className="bag-add">
                <div className="bag-add-wrap">
                    <input
                        type="text"
                        id="equip-bag-input"
                        className="specialty-input"
                        autoComplete="off"
                        placeholder="Add gear..."
                        value={query}
                        onChange={(e) => { setQuery(e.currentTarget.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setOpen(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addItem(query); }}
                    />
                    <Suggestions
                        id="equip-bag-sugg"
                        open={open}
                        hiddenCount={matches.length - shown.length}
                        rows={shown.map((ic) => ({
                            key: ic.f,
                            title: ic.n + '\n' + ic.c,
                            onSelect: () => addItem(ic.n),
                            content: (
                                <>
                                    <GearArt file={ic.f} gear={gear} />
                                    <span className="item-suggestion-name">{ic.n}</span>
                                </>
                            ),
                        }))}
                    />
                </div>
                <button
                    className="specialty-add-btn"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addItem(query)}
                >
                    Add
                </button>
            </div>
        </div>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
