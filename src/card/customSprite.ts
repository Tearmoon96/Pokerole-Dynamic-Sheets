import {
    deleteCustomImage, invalidateCustomImage, workingDirWritable, writeCustomImageTo,
} from '../lib/fileSystem';
import type { CardSheet } from './types';

/* The Custom sprite tab: art the user uploads for this Pokémon.

   A downscaled copy is embedded in the sheet so it travels with the JSON, and
   the original is filed in Custom Images/Pokemons when a working folder is
   open — preferred on load whenever that folder is reachable. */

/** Downscale for the embedded fallback in localStorage; PNG (not JPEG) so a
    transparent sprite background survives. */
const MAX_EMBEDDED_EDGE = 512;

export function genImgId(): string {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export interface SpriteUploadResult {
    customImage: string;
    imageId: string;
    /** Filename of the full-res copy, when the folder accepted it. */
    customImageFile: string | null;
}

function downscaleToPng(img: HTMLImageElement): string {
    const scale = Math.min(1, MAX_EMBEDDED_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
}

/** Secure folder permission before the async decode spends the click gesture. */
export function spriteUploadDir(): Promise<FileSystemDirectoryHandle | null> {
    return workingDirWritable(true);
}

export function readSpriteFile(
    file: File, dir: FileSystemDirectoryHandle | null, sheet: CardSheet,
): Promise<SpriteUploadResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = async () => {
                const customImage = downscaleToPng(img);
                const imageId = sheet.imageId || genImgId();
                let savedName: string | null = null;
                /* Full-res backup into the trainer's working folder */
                if (dir) {
                    savedName = await writeCustomImageTo(dir, 'Pokemons', imageId, file);
                    if (savedName) {
                        if (sheet.customImageFile && sheet.customImageFile !== savedName) {
                            deleteCustomImage('Pokemons', sheet.customImageFile);
                        }
                        invalidateCustomImage('Pokemons', savedName);   // fresh bytes
                    }
                }
                resolve({ customImage, imageId, customImageFile: savedName });
            };
            img.onerror = () => reject(new Error('Could not read that image file.'));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Could not read that image file.'));
        reader.readAsDataURL(file);
    });
}
