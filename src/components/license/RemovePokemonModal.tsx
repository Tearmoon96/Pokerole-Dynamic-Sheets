import { Modal } from '../common/Modal';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';

export function RemovePokemonModal({ slot, onClose }: { slot: number | null; onClose: () => void }) {
    const { sheet, store } = useSheetStore();
    const { data } = useAppData();
    const entry = slot != null ? sheet.team[slot] : null;
    const p = entry?.dexId ? (data.pokemon.find((x) => x._id === entry.dexId) || null) : null;

    return (
        <Modal open={slot != null} onClose={onClose} id="remove-poke-modal">
            <div className="modal-title">
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f43f5e' }}></i>
                {' '}Remove Pokémon
            </div>
            <p className="modal-text" id="remove-poke-text">
                Remove <strong>{p ? p.Name : 'this Pokémon'}</strong> from the team? Its whole sheet
                is deleted.
                <br /><br />
                To free the slot but keep the Pokémon, open <strong>PC Storage</strong> instead and
                drag it into a box.
            </p>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onClose}>Cancel</button>
                <button
                    className="form-btn danger"
                    onClick={() => {
                        store.update((s) => {
                            /* The canonical empty-slot shape. This used to write the
                               pre-dexId {id,rank,item,chp} one, which only read as
                               empty by accident and was repaired on the next load. */
                            s.team = s.team.map((e, i) => i === slot
                                ? { dexId: '', sheet: null, preview: null } : e);
                        });
                        onClose();
                    }}
                >
                    Remove
                </button>
            </div>
        </Modal>
    );
}
