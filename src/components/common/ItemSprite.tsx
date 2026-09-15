import { useState } from 'react';
import { IMG_BASE } from '../../data/paths';

const FALLBACK = IMG_BASE + 'ItemSprites/pokeball.png';

/** An item sprite that falls back to the Poké Ball rather than a broken image.

    The src is derived from the prop on every render; only WHICH image failed
    is held in state. The first version seeded `src` into state and never
    looked at the prop again, so a row that React reused for a different item
    — the bag keys its rows by index, and deleting one slides the next into
    its place — kept showing the deleted item's sprite. */
export function ItemSprite({ image, className }: { image?: string; className?: string }) {
    const wanted = IMG_BASE + 'ItemSprites/' + (image || 'pokeball.png');
    const [failed, setFailed] = useState<string | null>(null);
    const src = failed === wanted ? FALLBACK : wanted;
    return (
        <img
            loading="lazy"
            alt=""
            className={className}
            src={src}
            onError={() => { if (src !== FALLBACK) setFailed(wanted); }}
        />
    );
}
