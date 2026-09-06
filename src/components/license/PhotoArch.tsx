import { useEffect, useRef, useState } from 'react';
import { useSheetStore } from '../../state/SheetContext';
import { photoAdjustVars, photoUploadDir, readPhotoFile } from '../../lib/photo';
import { deleteCustomImage, readCustomImage } from '../../lib/fileSystem';
import { EQUIP_SLOTS } from '../../state/constants';
import type { TrainerState } from '../../state/types';

/** Worn slots plus carried gear — what puts the dot on the Equipment pill. */
export function equippedCount(sheet: TrainerState): number {
    const worn = !sheet.equipment ? 0 : EQUIP_SLOTS.filter((s) => {
        const e = sheet.equipment[s.key];
        return e && (e.name || '').trim();
    }).length;
    return worn + sheet.equipBag.length;
}

export function PhotoArch({ onAdjust, onOpenEquipment }: {
    onAdjust: () => void;
    onOpenEquipment: () => void;
}) {
    const { sheet, store } = useSheetStore();
    const inputRef = useRef<HTMLInputElement>(null);
    /* The thumbnail paints instantly; the full-res copy in Custom Images
       replaces it whenever the working folder is reachable. */
    const [fullRes, setFullRes] = useState<string | null>(null);

    useEffect(() => {
        setFullRes(null);
        if (!sheet.photoFile) return;
        let live = true;
        readCustomImage('Trainers', sheet.photoFile).then((url) => { if (live && url) setFullRes(url); });
        return () => { live = false; };
    }, [sheet.photoFile]);

    const upload = async (file: File) => {
        /* Secure folder permission NOW, while the click gesture is still live
           (before the async decode below would spend it). */
        const dir = await photoUploadDir();
        try {
            const { photo, photoFile } = await readPhotoFile(file, dir, sheet.id, sheet.photoFile);
            store.update((s) => {
                s.photo = photo;
                /* A fresh image starts centred at 1x (old offsets won't fit) */
                s.photoAdjust = { scale: 1, offsetX: 0, offsetY: 0 };
                if (photoFile) s.photoFile = photoFile;
            });
        } catch (e) {
            alert((e as Error).message);
        }
    };

    const removePhoto = () => {
        const oldFile = sheet.photoFile;
        store.update((s) => { s.photo = ''; s.photoFile = ''; });
        if (oldFile) deleteCustomImage('Trainers', oldFile);
    };

    return (
        <>
            <div
                className={'photo-arch' + (sheet.photo ? ' has-photo' : '')}
                id="photo-arch"
                title="Click to upload a photo"
                onClick={() => inputRef.current?.click()}
            >
                {sheet.photo ? (
                    <>
                        <button
                            className="photo-adjust-btn"
                            title="Resize & reposition photo"
                            onClick={(e) => { e.stopPropagation(); onAdjust(); }}
                        >
                            <i className="fa-solid fa-up-right-and-down-left-from-center"></i>
                        </button>
                        <button
                            className="photo-remove-btn"
                            title="Remove photo"
                            onClick={(e) => { e.stopPropagation(); removePhoto(); }}
                        >
                            <i className="fa-solid fa-trash-can"></i>
                        </button>
                        <img
                            id="photo-arch-img"
                            src={fullRes || sheet.photo}
                            alt="Character photo"
                            style={photoAdjustVars(sheet) as React.CSSProperties}
                        />
                    </>
                ) : (
                    <div className="photo-placeholder">
                        <i className="fa-solid fa-user-large"></i>
                        <span>Click to add photo</span>
                    </div>
                )}

                {/* Equipment has nothing to do with the portrait, so its button
                    rides on the arch whether or not a photo has been set */}
                <button
                    className={'photo-equip-btn' + (equippedCount(sheet) ? ' has-gear' : '')}
                    title="Open the trainer equipment window"
                    onClick={(e) => { e.stopPropagation(); onOpenEquipment(); }}
                >
                    <i className="fa-solid fa-shield-halved"></i><span>Equipment</span>
                </button>
            </div>

            <input
                ref={inputRef}
                type="file"
                id="photo-input"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (file) upload(file);
                }}
            />
        </>
    );
}
