import { useState } from 'react';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { Suggestions } from '../common/Suggestions';
import { ItemSprite } from '../common/ItemSprite';

/* Loyalty / Happiness / Disobedience, the held item and the nature.

   Both searches are shortcuts, not constraints: the inputs stay plain text so a
   homebrew item or nature can simply be typed in. */

const MOVE_SUGGESTION_CAP = 40;

function MiniTracker({ track }: { track: 'loyalty' | 'happiness' | 'disobedience' }) {
    const { sheet, store } = useCard();
    const value = sheet[track] || 0;
    return (
        <div className="stat-dots mini-tracker" data-track={track}>
            {[1, 2, 3, 4, 5].map((i) => (
                <div
                    key={i}
                    className={'dot ' + (i <= value ? 'filled' : 'empty')}
                    style={{ cursor: 'pointer' }}
                    onClick={() => store.update((s) => { s[track] = (value === i) ? i - 1 : i; })}
                />
            ))}
        </div>
    );
}

export function ConditionPanel() {
    const { sheet, store } = useCard();
    const { data } = useAppData();

    /* Only one dropdown is ever open — the original closed the other on every
       keystroke — so a single piece of state names which. */
    const [open, setOpen] = useState<'item' | 'nature' | null>(null);
    const [itemDraft, setItemDraft] = useState<string | null>(null);
    const [natureDraft, setNatureDraft] = useState<string | null>(null);

    const itemValue = itemDraft ?? sheet.heldItem;
    const natureValue = natureDraft ?? sheet.nature;

    const itemQ = itemValue.trim().toLowerCase();
    const itemMatches = data.items.filter((it) => it.Name.toLowerCase().includes(itemQ));
    const itemShown = itemMatches.slice(0, MOVE_SUGGESTION_CAP);

    const natureQ = natureValue.trim().toLowerCase();
    const natureMatches = data.natures.filter((n) => n.Name.toLowerCase().includes(natureQ)
        || (n.Keywords || '').toLowerCase().includes(natureQ));

    return (
        <div className="tracker-panel condition">
            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-shield-heart" style={{ color: '#f472b6' }}></i> Loyalty
                </span>
                <MiniTracker track="loyalty" />
            </div>
            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-face-smile" style={{ color: '#facc15' }}></i> Happiness
                </span>
                <MiniTracker track="happiness" />
            </div>
            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-face-angry" style={{ color: '#f87171' }}></i> Disobedience
                </span>
                <MiniTracker track="disobedience" />
            </div>

            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-gem" style={{ color: '#67e8f9' }}></i> Held Item
                </span>
                <div className="item-search-wrap">
                    <input
                        type="text"
                        id="held-item-input"
                        className="pool-text-input"
                        autoComplete="off"
                        value={itemValue}
                        onChange={(e) => { setItemDraft(e.currentTarget.value); setOpen('item'); }}
                        onFocus={() => setOpen('item')}
                        onClick={() => setOpen('item')}
                        onBlur={() => {
                            setOpen(null);
                            if (itemDraft != null) { store.update((s) => { s.heldItem = itemDraft; }); setItemDraft(null); }
                        }}
                    />
                    <Suggestions
                        id="item-suggestions"
                        className="move-suggestions item-suggestions"
                        open={open === 'item'}
                        hiddenCount={itemMatches.length - itemShown.length}
                        rows={itemShown.map((it) => ({
                            key: it._id || it.Name,
                            /* The newline is what the themed tooltip splits on:
                               name becomes the heading, description the body. */
                            title: it.Description ? it.Name + '\n' + it.Description : undefined,
                            onSelect: () => {
                                setItemDraft(null);
                                setOpen(null);
                                store.update((s) => { s.heldItem = it.Name; });
                            },
                            content: (
                                <>
                                    <ItemSprite image={it.Image} />
                                    <span className="item-suggestion-name">{it.Name}</span>
                                </>
                            ),
                        }))}
                    />
                </div>
            </div>

            <div className="tracker-row">
                <span className="tracker-label">
                    <i className="fa-solid fa-leaf" style={{ color: '#22c55e' }}></i> Nature
                </span>
                <div className="item-search-wrap">
                    <input
                        type="text"
                        id="nature-input"
                        className="pool-text-input"
                        autoComplete="off"
                        value={natureValue}
                        onChange={(e) => { setNatureDraft(e.currentTarget.value); setOpen('nature'); }}
                        onFocus={() => setOpen('nature')}
                        onClick={() => setOpen('nature')}
                        onBlur={() => {
                            setOpen(null);
                            if (natureDraft != null) { store.update((s) => { s.nature = natureDraft; }); setNatureDraft(null); }
                        }}
                    />
                    <Suggestions
                        id="nature-suggestions"
                        className="move-suggestions nature-suggestions"
                        open={open === 'nature'}
                        rows={natureMatches.map((n) => ({
                            key: n._id || n.Name,
                            title: n.Name + '\n' + [n.Keywords, n.Description].filter(Boolean).join('\n\n'),
                            onSelect: () => {
                                setNatureDraft(null);
                                setOpen(null);
                                store.update((s) => { s.nature = n.Name; });
                            },
                            content: <span className="item-suggestion-name">{n.Name}</span>,
                        }))}
                    />
                </div>
            </div>
        </div>
    );
}
