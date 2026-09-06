import { Modal } from '../common/Modal';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { megaStoneOf } from '../common/MonName';
import { getPoolMax } from '../../card/pools';

/* The confirmations: evolve (twice, because it is permanent), mega (once,
   because it is not), loading another species, deleting a custom move, and the
   trip to the Pokémon Center. */

export function EvolveWarnModal({ targetId, stage, onCancel, onAdvance, onConfirm }: {
    targetId: string | null;
    /** 1 = first warning, 2 = the "absolutely sure" one. */
    stage: number;
    onCancel: () => void;
    onAdvance: () => void;
    onConfirm: (id: string) => void;
}) {
    const { data } = useAppData();
    const target = targetId ? data.pokemon.find((p) => p._id === targetId) : null;
    const tname = target ? target.Name : 'its evolution';

    return (
        <Modal open={!!targetId} onClose={onCancel} id="evolve-warn-modal">
            <div className="modal-title">
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f43f5e' }}></i> Evolve Pokémon
            </div>
            <p className="modal-text" id="evolve-warn-text">
                {stage === 1 ? (
                    <>
                        Your <strong>trained stat distribution</strong> and everything else on the sheet
                        carry over — only the base stats, caps and ability change to the new form.
                        <br /><br />
                        Evolving into <strong>{tname}</strong> is <strong>permanent and cannot be
                        reversed</strong>. This Pokémon will not be able to return to its current stage —
                        the only way back would be to build a brand-new Pokémon from scratch. Continue?
                    </>
                ) : (
                    <>
                        Are you absolutely sure? This is a <strong>one-way change with no undo</strong> —
                        the current form is lost for good and you would have to recreate it from scratch
                        to get it back.
                    </>
                )}
            </p>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onCancel}>Cancel</button>
                <button
                    className="form-btn danger"
                    id="evolve-warn-confirm-btn"
                    onClick={() => stage === 1 ? onAdvance() : (targetId && onConfirm(targetId))}
                >
                    {stage === 1 ? 'Evolve' : 'Yes, evolve permanently'}
                </button>
            </div>
        </Modal>
    );
}

export function MegaConfirmModal({ pending, onCancel, onConfirm }: {
    pending: { id: string; into: boolean } | null;
    onCancel: () => void;
    onConfirm: (id: string, into: boolean) => void;
}) {
    const { data } = useAppData();
    const target = pending ? data.pokemon.find((p) => p._id === pending.id) : null;
    const tname = target ? target.Name.replace(/\s*\(Mega[^)]*\)/, '') : 'its base form';
    const stone = (target && pending?.into) ? megaStoneOf(target) : null;
    const into = !!pending?.into;

    return (
        <Modal open={!!pending} onClose={onCancel} id="mega-confirm-modal">
            <div className="modal-title">
                <i className="fa-solid fa-atom" style={{ color: 'var(--ghost-color)' }}></i>
                <span id="mega-confirm-title">{into ? 'Mega Evolve?' : 'Revert Mega Evolution?'}</span>
            </div>
            <p className="modal-text" id="mega-confirm-text">
                {into ? (
                    <>
                        Mega Evolve <strong>{tname}</strong>
                        {stone && <> with its <strong>{stone}</strong></>}. Base stats, caps and ability
                        change to the Mega form; everything you have filled in on the sheet carries over.
                        This is <strong>temporary</strong> — you can revert it at any time.
                    </>
                ) : (
                    <>
                        Return to <strong>{tname}</strong>, the form it Mega Evolved from. Everything on
                        the sheet carries over.
                    </>
                )}
            </p>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onCancel}>Cancel</button>
                <button
                    className="form-btn save"
                    id="mega-confirm-btn"
                    onClick={() => pending && onConfirm(pending.id, pending.into)}
                >
                    {into ? 'Mega Evolve' : 'Revert'}
                </button>
            </div>
        </Modal>
    );
}

export function LoadWarnModal({ targetId, onCancel, onConfirm }: {
    targetId: string | null;
    onCancel: () => void;
    onConfirm: (id: string) => void;
}) {
    return (
        <Modal open={!!targetId} onClose={onCancel} id="load-warn-modal">
            <div className="modal-title">
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f43f5e' }}></i>
                {' '}Load another Pokémon
            </div>
            <p className="modal-text" id="load-warn-text">
                Loading another Pokémon replaces the one currently on this card with a different
                species. Continue?
            </p>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onCancel}>Cancel</button>
                <button className="form-btn danger" onClick={() => targetId && onConfirm(targetId)}>
                    Load anyway
                </button>
            </div>
        </Modal>
    );
}

export function DeleteMoveModal({ moveName, onCancel, onConfirm }: {
    moveName: string | null;
    onCancel: () => void;
    onConfirm: (name: string) => void;
}) {
    return (
        <Modal open={!!moveName} onClose={onCancel} id="delete-move-modal">
            <div className="modal-title"><i className="fa-solid fa-trash-can"></i> Delete Move</div>
            <p className="modal-text">
                Are you sure you want to delete <strong id="delete-move-name">{moveName}</strong>?
            </p>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onCancel}>Cancel</button>
                <button className="form-btn danger" onClick={() => moveName && onConfirm(moveName)}>
                    Delete
                </button>
            </div>
        </Modal>
    );
}

/* A visit to the Pokémon Center. The status object is rewritten whole rather
   than key by key, so a stray flag left by an older sheet cannot survive the
   cure. Disable goes too: out of battle it lasts five minutes, long expired by
   the walk to the counter. Def/Sp.Def offsets reset too — a hand-set nudge from
   armour or an ability shouldn't outlive the fight that prompted it. */
export function HealModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { store } = useCard();
    return (
        <Modal open={open} onClose={onClose} id="heal-modal">
            <div className="modal-title">
                <i className="fa-solid fa-heart-circle-plus" style={{ color: '#10b981' }}></i> Heal Pokémon
            </div>
            <p className="modal-text">
                A visit to the Pokémon Center: Health and Willpower go back to full, every status is
                cleared, the Disable is lifted off whichever Move carries it, and any hand-set
                Def/Sp.Def offset resets to ±0.
            </p>
            <div className="modal-actions">
                <button className="form-btn cancel" onClick={onClose}>Cancel</button>
                <button
                    className="form-btn save"
                    onClick={() => {
                        store.update((s) => {
                            const src = { pokemon: store.pokemon, sheet: s };
                            s.hp = getPoolMax(src, 'hp');
                            s.will = getPoolMax(src, 'will');
                            s.status = {
                                major: null,
                                burnDegree: 0,
                                poisonStage: 0,
                                confusion: false,
                                flinch: false,
                                inLove: false,
                            };
                            s.disabledMove = null;
                            s.defBonus = 0;
                            s.spDefBonus = 0;
                        });
                        onClose();
                    }}
                >
                    Heal
                </button>
            </div>
        </Modal>
    );
}
