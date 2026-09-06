import { Modal, ModalClose } from '../common/Modal';
import { useSheetStore } from '../../state/SheetContext';
import { photoAdjustState, photoAdjustVars } from '../../lib/photo';
import { readCustomImage } from '../../lib/fileSystem';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/* Character photo: resize & reposition within the arch frame.

   The arch is up to 430px wide and this preview is 160px, so its px offsets are
   scaled by that factor to look proportional to the real frame. */
const PHOTO_PREVIEW_FACTOR = 160 / 430;

export function PhotoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet, store } = useSheetStore();
    const a = photoAdjustState(sheet);
    const [fullRes, setFullRes] = useState<string | null>(null);

    useEffect(() => {
        setFullRes(null);
        if (!open || !sheet.photoFile) return;
        let live = true;
        readCustomImage('Trainers', sheet.photoFile).then((url) => { if (live && url) setFullRes(url); });
        return () => { live = false; };
    }, [open, sheet.photoFile]);

    const set = (key: 'scale' | 'offsetX' | 'offsetY', value: string) => store.update((s) => {
        s.photoAdjust = { ...photoAdjustState(s), [key]: parseFloat(value) };
    });

    return (
        <Modal open={open} onClose={onClose} boxClassName="sprite-modal-box" id="photo-modal">
            <ModalClose onClick={onClose} />
            <div className="modal-title" style={{ color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-image" style={{ color: 'var(--ghost-color)' }}></i>
                <span>Character Photo</span>
            </div>
            <p className="modal-text" style={{ marginBottom: '4px' }}>
                Resize and nudge the photo to sit nicely in the frame.
            </p>

            <div className="photo-modal-preview">
                <img
                    id="photo-modal-img"
                    alt=""
                    src={fullRes || sheet.photo}
                    style={photoAdjustVars(sheet, PHOTO_PREVIEW_FACTOR) as CSSProperties}
                />
            </div>

            <div className="sprite-modal-sliders">
                <label className="sprite-modal-slider">
                    <span>Size</span>
                    <input
                        type="range" min="0.25" max="3" step="0.01" id="photo-modal-scale"
                        value={a.scale}
                        onChange={(e) => set('scale', e.currentTarget.value)}
                    />
                    <span className="sprite-modal-num" id="photo-modal-scale-val">{a.scale.toFixed(2)}×</span>
                </label>
                <label className="sprite-modal-slider">
                    <span>Horizontal</span>
                    <input
                        type="range" min="-50" max="50" step="1" id="photo-modal-x"
                        value={a.offsetX}
                        onChange={(e) => set('offsetX', e.currentTarget.value)}
                    />
                    <span className="sprite-modal-num" id="photo-modal-x-val">{a.offsetX}</span>
                </label>
                <label className="sprite-modal-slider">
                    <span>Vertical</span>
                    <input
                        type="range" min="-50" max="50" step="1" id="photo-modal-y"
                        value={a.offsetY}
                        onChange={(e) => set('offsetY', e.currentTarget.value)}
                    />
                    <span className="sprite-modal-num" id="photo-modal-y-val">{a.offsetY}</span>
                </label>
            </div>

            <div className="modal-actions">
                <button
                    className="form-btn reset"
                    onClick={() => store.update((s) => { s.photoAdjust = { scale: 1, offsetX: 0, offsetY: 0 }; })}
                >
                    Reset
                </button>
                <button className="form-btn save" onClick={onClose}>Done</button>
            </div>
        </Modal>
    );
}
