import { useState } from 'react';
import { IMG_BASE } from '../../data/paths';

const FALLBACK = IMG_BASE + 'ItemSprites/pokeball.png';

/** An item sprite that falls back to the Poké Ball rather than a broken image. */
export function ItemSprite({ image, className }: { image?: string; className?: string }) {
    const [src, setSrc] = useState(IMG_BASE + 'ItemSprites/' + (image || 'pokeball.png'));
    return (
        <img
            loading="lazy"
            alt=""
            className={className}
            src={src}
            onError={() => { if (src !== FALLBACK) setSrc(FALLBACK); }}
        />
    );
}
