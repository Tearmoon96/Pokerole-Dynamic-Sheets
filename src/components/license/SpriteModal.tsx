import { Modal, ModalClose } from '../common/Modal';
import { MonSprite } from '../common/MonSprite';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { defaultPreview, usableSpriteType } from '../../lib/sprites';
import type { MonPreview } from '../../state/types';

/* The team sprite editor.

   Everything it sets lives in slot.preview on the trainer sheet and is fully
   independent of the Pokémon card. Only the Custom image data (uploaded on the
   card) is read from the sheet, since that art lives with the Pokémon. */

const SPRITE_TABS = [
    { type: 'Home', label: 'Home' },
    { type: 'Book', label: 'Book' },
    { type: 'Box', label: 'Box' },
    { type: 'Shuffle', label: 'Token' },
    { type: 'Custom', label: 'Custom' },
] as const;

export function SpriteModal({ slot, onClose }: { slot: number | null; onClose: () => void }) {
    const { sheet, store } = useSheetStore();
    const { data } = useAppData();

    const entry = slot != null ? sheet.team[slot] : null;
    const open = !!(entry && entry.dexId);
    const p = entry?.dexId ? (data.pokemon.find((x) => x._id === entry.dexId) || null) : null;
    const pv: MonPreview = entry?.preview || defaultPreview();

    const nickname = ((entry?.sheet?.nickname as string) || '').trim();
    const hasCustom = !!(entry?.sheet && (entry.sheet.customImage || entry.sheet.customImageFile));

    const writePreview = (patch: Partial<MonPreview>) => store.update((s) => {
        s.team = s.team.map((e, i) => i === slot
            ? { ...e, preview: { ...(e.preview || defaultPreview()), ...patch } } : e);
    });

    if (!open || !entry) return null;

    const scale = (pv.scale as number) || 1;
    const x = (pv.offsetX as number) || 0;
    const y = (pv.offsetY as number) || 0;

    return (
        <Modal open onClose={onClose} boxClassName="sprite-modal-box" id="sprite-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-image" style={{ color: 'var(--ghost-color)' }}></i>
                <span id="sprite-modal-title">{p ? p.Name + ' — Team Sprite' : 'Team Sprite'}</span>
            </div>
            <p className="modal-text" style={{ marginBottom: '4px' }}>
                Choose the sprite for this team slot, then resize and nudge it to sit nicely in the
                circle. This only affects the trainer sheet.
            </p>

            <div className="team-sprite-circle sprite-modal-preview">
                {p && <MonSprite pokemon={p} sheet={entry.sheet} preview={pv} />}
            </div>

            <div className="sprite-selectors" id="sprite-modal-tabs">
                {SPRITE_TABS.map((tab) => {
                    /* Sets with no usable art for this species — see
                       SPRITE_SET_BLOCKED. Offering a tab that silently draws a
                       different Pokémon is worse than not offering it. */
                    const missing = tab.type === 'Custom'
                        ? !hasCustom
                        : usableSpriteType(p?.Image, tab.type) !== tab.type;
                    return (
                        <button
                            key={tab.type}
                            className={'sprite-btn'
                                + (pv.spriteType === tab.type ? ' active' : '')
                                + (missing ? ' disabled' : '')}
                            data-type={tab.type}
                            title={!missing ? '' : tab.type === 'Custom'
                                ? "No custom image uploaded on this Pokémon's card"
                                : 'No ' + tab.label + ' art for ' + (p ? p.Name : 'this Pokémon')}
                            onClick={() => { if (!missing) writePreview({ spriteType: tab.type }); }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="sprite-modal-sliders">
                <label className="sprite-modal-slider">
                    <span>Size</span>
                    <input
                        type="range" min="0.25" max="3" step="0.01" id="sprite-modal-scale"
                        value={scale}
                        onChange={(e) => writePreview({ scale: parseFloat(e.currentTarget.value) })}
                    />
                    <span className="sprite-modal-num" id="sprite-modal-scale-val">{scale.toFixed(2)}×</span>
                </label>
                <label className="sprite-modal-slider">
                    <span>Horizontal</span>
                    <input
                        type="range" min="-50" max="50" step="1" id="sprite-modal-x"
                        value={x}
                        onChange={(e) => writePreview({ offsetX: parseFloat(e.currentTarget.value) })}
                    />
                    <span className="sprite-modal-num" id="sprite-modal-x-val">{x}</span>
                </label>
                <label className="sprite-modal-slider">
                    <span>Vertical</span>
                    <input
                        type="range" min="-50" max="50" step="1" id="sprite-modal-y"
                        value={y}
                        onChange={(e) => writePreview({ offsetY: parseFloat(e.currentTarget.value) })}
                    />
                    <span className="sprite-modal-num" id="sprite-modal-y-val">{y}</span>
                </label>
            </div>

            {/* Nickname toggle: only usable when the Pokémon card set a nickname */}
            <label
                className={'sprite-modal-nickname' + (nickname ? '' : ' disabled')}
                id="sprite-modal-nickname-row"
                title={nickname ? '' : "Set a nickname on this Pokémon's card first"}
            >
                <input
                    type="checkbox"
                    id="sprite-modal-nickname"
                    disabled={!nickname}
                    checked={!!(nickname && pv.useNickname)}
                    onChange={(e) => writePreview({ useNickname: e.currentTarget.checked })}
                />
                <span>Nickname</span>
                <span className="sprite-modal-nickname-val" id="sprite-modal-nickname-val">{nickname}</span>
            </label>

            <div className="modal-actions">
                <button
                    className="form-btn reset"
                    onClick={() => store.update((s) => {
                        s.team = s.team.map((e, i) => i === slot ? { ...e, preview: defaultPreview() } : e);
                    })}
                >
                    Reset
                </button>
                <button className="form-btn save" onClick={onClose}>Done</button>
            </div>
        </Modal>
    );
}
