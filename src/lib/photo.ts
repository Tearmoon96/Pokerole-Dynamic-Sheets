import { deleteCustomImage, invalidateCustomImage, workingDirWritable, writeCustomImageTo } from './fileSystem';
import type { PhotoAdjust, TrainerState } from '../state/types';

/* The trainer's portrait: a downscaled JPEG lives in the JSON so the sheet
   still shows art when it is handed to someone else, and the original file is
   filed in Custom Images/Trainers so the arch can draw it at full resolution
   whenever the working folder is reachable. */

/** Keeps the embedded fallback small enough for localStorage. */
const MAX_EMBEDDED_EDGE = 520;

export function photoAdjustState(sheet: TrainerState): PhotoAdjust {
    const a = sheet.photoAdjust || ({} as Partial<PhotoAdjust>);
    return {
        scale: a.scale != null ? a.scale : 1,
        offsetX: a.offsetX != null ? a.offsetX : 0,
        offsetY: a.offsetY != null ? a.offsetY : 0,
    };
}

/** CSS variables the arch and the modal preview both frame their image with.
    `factor` scales the offsets for the smaller preview. */
export function photoAdjustVars(sheet: TrainerState, factor = 1): Record<string, string | number> {
    const a = photoAdjustState(sheet);
    return {
        '--photo-scale': a.scale,
        '--photo-x': (a.offsetX * factor) + 'px',
        '--photo-y': (a.offsetY * factor) + 'px',
    };
}

export interface PhotoUploadResult {
    /** Downscaled JPEG data-URL for the JSON. */
    photo: string;
    /** Filename of the full-res copy, when the folder accepted it. */
    photoFile: string | null;
}

function downscaleToJpeg(img: HTMLImageElement): string {
    const scale = Math.min(1, MAX_EMBEDDED_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    /* JPEG has no alpha: transparent PNGs land on the panel colour */
    ctx.fillStyle = '#0d0914';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
}

/** Read an uploaded file into both forms. Folder permission must already have
    been secured by the caller, while the click gesture is still live. */
export function readPhotoFile(
    file: File, dir: FileSystemDirectoryHandle | null, trainerId: string, previousFile: string,
): Promise<PhotoUploadResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = async () => {
                const photo = downscaleToJpeg(img);
                /* Full-res backup into the working folder, preferred on reload */
                const savedName = await writeCustomImageTo(dir, 'Trainers', trainerId, file);
                if (savedName) {
                    if (previousFile && previousFile !== savedName) {
                        deleteCustomImage('Trainers', previousFile);
                    }
                    invalidateCustomImage('Trainers', savedName);   // fresh bytes
                }
                resolve({ photo, photoFile: savedName });
            };
            img.onerror = () => reject(new Error('Could not read that image file.'));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Could not read that image file.'));
        reader.readAsDataURL(file);
    });
}

/** Secure folder permission before the async decode spends the click gesture. */
export function photoUploadDir(): Promise<FileSystemDirectoryHandle | null> {
    return workingDirWritable(true);
}
