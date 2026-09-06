import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { MonName } from '../common/MonName';
import { MonSprite } from '../common/MonSprite';
import { openCard, teamCardUrl } from '../../lib/navigation';
import type { PokedexEntry } from '../../data/types';
import type { TeamSlot } from '../../state/types';

export function TeamGrid({ onPick, onRemove, onEditSprite }: {
    onPick: (slot: number) => void;
    onRemove: (slot: number) => void;
    onEditSprite: (slot: number) => void;
}) {
    const { sheet, store } = useSheetStore();
    const { data } = useAppData();

    const slotPokemon = (slot: TeamSlot): PokedexEntry | null =>
        slot.dexId ? (data.pokemon.find((x) => x._id === slot.dexId) || null) : null;

    const openForEdit = (idx: number) => {
        const slot = sheet.team[idx];
        if (!slot.dexId) { onPick(idx); return; }
        store.save();   // flush the working set so the card tab reads the latest
        openCard(teamCardUrl(sheet, slot.dexId, slot.uid, idx));
    };

    return (
        <div className="team-grid6" id="team-grid">
            {sheet.team.map((slot, idx) => {
                const p = slotPokemon(slot);
                const mon = slot.sheet;
                const nick = ((mon && (mon.nickname as string)) || '').trim();
                const useNick = !!(slot.preview && slot.preview.useNickname && nick);

                return (
                    <div className="team-slot" key={idx}>
                        <div className="team-slot-header">
                            {p ? (
                                <span
                                    className="team-slot-name linked"
                                    title={useNick
                                        ? nick + ' (' + p.Name + ') — opens the Pokémon card'
                                        : 'Edit ' + p.Name + ' (opens the Pokémon card)'}
                                    onClick={() => openForEdit(idx)}
                                >
                                    <MonName mon={slot} pokemon={p} />
                                </span>
                            ) : (
                                <span className="team-slot-name empty">empty slot</span>
                            )}

                            {p && (
                                <button
                                    className="team-clear-btn"
                                    title="Remove this Pokémon"
                                    onClick={() => onRemove(idx)}
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            )}

                            <button
                                className="team-edit-btn"
                                title={p ? 'Edit this Pokémon on the card page' : 'Choose a Pokémon for this slot'}
                                onClick={() => p ? openForEdit(idx) : onPick(idx)}
                            >
                                {p ? 'Edit' : 'Add'}
                            </button>
                        </div>

                        <div className="team-slot-body">
                            {p ? (
                                <div
                                    className="team-sprite-circle"
                                    title="Change this Pokémon's team sprite (size & position)"
                                    onClick={() => onEditSprite(idx)}
                                >
                                    {/* The team sprite (type/size/position) is set on the
                                        trainer sheet via the sprite modal, stored in
                                        slot.preview and kept independent of the card. */}
                                    <MonSprite pokemon={p} sheet={mon} preview={slot.preview} />
                                </div>
                            ) : (
                                <div
                                    className="team-sprite-circle"
                                    title="Choose the Pokémon for this slot"
                                    onClick={() => onPick(idx)}
                                >
                                    <i className="fa-solid fa-plus"></i>
                                </div>
                            )}

                            <div className="team-fields">
                                {([
                                    ['Rank', (mon && (mon.rank as string)) || '—'],
                                    ['Item', (mon && (mon.heldItem as string)) || '—'],
                                    ['C. HP', (mon && mon.hp != null) ? String(mon.hp) : '—'],
                                ] as [string, string][]).map(([label, val]) => (
                                    <div className="team-field" key={label}>
                                        <label>{label}:</label>
                                        <span className="team-field-val">{p ? val : '—'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
