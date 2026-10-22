import { useState } from 'react';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { ItemSprite } from '../common/ItemSprite';
import { Suggestions } from '../common/Suggestions';
import { itemIdentityKey } from '../../lib/gear';
import { rowKey } from '../../lib/rowKey';
import type { BagItem, TrainerState } from '../../state/types';

type BagKey = 'bagOut' | 'bagBattle';

const BAGS: { key: BagKey; label: string }[] = [
    { key: 'bagOut', label: 'Out of battle' },
    { key: 'bagBattle', label: 'In battle' },
];

function BagColumn({ bagKey, label }: { bagKey: BagKey; label: string }) {
    const { sheet, store } = useSheetStore();
    const { data, gear } = useAppData();
    const toast = useToast();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);

    const items = sheet[bagKey];

    const writeBag = (fn: (rows: BagItem[]) => BagItem[]) =>
        store.update((s: TrainerState) => { s[bagKey] = fn(s[bagKey]); });

    const addBagItem = (name: string) => {
        const clean = name.trim();
        if (!clean) return;
        /* The bag carries Pokémon items. Free text is still welcome here, for
           the homebrew the database doesn't know, but a name lifted straight out
           of the gear catalogue is trainer equipment and belongs in a slot. */
        if (!gear.findItem(clean) && gear.gearOnlyKeys.has(itemIdentityKey(clean))) {
            toast('<i class="fa-solid fa-shield-halved"></i> '
                + escapeHtml(clean) + ' is trainer gear — equip it from the Equipment window.');
            setQuery('');
            setOpen(false);
            return;
        }
        writeBag((rows) => {
            const existing = rows.find((e) => e.name.toLowerCase() === clean.toLowerCase());
            if (existing) return rows.map((e) => e === existing ? { ...e, qty: e.qty + 1 } : e);
            /* Use the database's canonical capitalisation when it knows the item */
            const dbItem = gear.findItem(clean);
            return [...rows, { name: dbItem ? dbItem.Name : clean, qty: 1 }];
        });
        setQuery('');
        setOpen(false);
    };

    const q = query.trim().toLowerCase();
    const matches = data.items.filter((it) => it.Name.toLowerCase().includes(q));
    matches.sort((a, b) => {
        const aStarts = a.Name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.Name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.Name.localeCompare(b.Name);
    });
    const shown = matches.slice(0, 8);

    return (
        <div className="bag-col">
            {/* The column's title is its add menu: the item list opens under
                it, filtered as you type, and Enter keeps a name the list does
                not have (homebrew). */}
            <div className="bag-col-head">
                <button
                    className={'bag-col-label' + (open ? ' open' : '')}
                    aria-expanded={open}
                    title={'Add an item to ' + label.toLowerCase()}
                    /* No focus on press: it would blur the search box, which
                       closes the menu, and the click would open it again. */
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setOpen(!open); setQuery(''); }}
                >
                    {label}
                    <i className={'fa-solid ' + (open ? 'fa-caret-up' : 'fa-caret-down')}></i>
                </button>
                {open && (
                    <div className="bag-add-wrap">
                        <input
                            type="text"
                            id={'bag-input-' + bagKey}
                            className="specialty-input"
                            autoComplete="off"
                            autoFocus
                            placeholder="Search, or type your own..."
                            value={query}
                            onChange={(e) => setQuery(e.currentTarget.value)}
                            onBlur={() => setOpen(false)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') addBagItem(query);
                                else if (e.key === 'Escape') setOpen(false);
                            }}
                        />
                        <Suggestions
                            id={'bag-sugg-' + bagKey}
                            open
                            hiddenCount={matches.length - shown.length}
                            rows={shown.map((it) => ({
                                key: it._id || it.Name,
                                title: it.Description ? it.Name + '\n' + it.Description : undefined,
                                onSelect: () => addBagItem(it.Name),
                                content: (
                                    <>
                                        <ItemSprite image={it.Image} />
                                        <span className="item-suggestion-name">{it.Name}</span>
                                    </>
                                ),
                            }))}
                        />
                    </div>
                )}
            </div>
            <div className="bag-list" id={'bag-list-' + bagKey}>
                {!items.length && <span className="bag-empty">Nothing in here yet.</span>}
                {items.map((entry, idx) => {
                    const dbItem = gear.findItem(entry.name);
                    return (
                        <div
                            className="line-item"
                            key={rowKey(items, idx)}
                            title={dbItem && dbItem.Description ? dbItem.Name + '\n' + dbItem.Description : undefined}
                        >
                            <ItemSprite image={dbItem?.Image} />
                            <span className="line-item-name">{entry.name}</span>
                            <button
                                className="pool-btn"
                                title="Use one"
                                onClick={() => writeBag((rows) => rows.map((e, j) =>
                                    j === idx ? { ...e, qty: Math.max(1, e.qty - 1) } : e))}
                            >
                                <i className="fa-solid fa-minus"></i>
                            </button>
                            <span className="line-item-qty">×{entry.qty}</span>
                            <button
                                className="pool-btn"
                                title="Add one"
                                onClick={() => writeBag((rows) => rows.map((e, j) =>
                                    j === idx ? { ...e, qty: e.qty + 1 } : e))}
                            >
                                <i className="fa-solid fa-plus"></i>
                            </button>
                            <button
                                className="item-remove"
                                title="Remove item"
                                onClick={() => writeBag((rows) => rows.filter((_, j) => j !== idx))}
                            >
                                <i className="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

export function BagColumns() {
    return (
        <div className="bag-columns">
            {BAGS.map((b) => <BagColumn key={b.key} bagKey={b.key} label={b.label} />)}
        </div>
    );
}
