import { FallbackImage } from '../common/FallbackImage';
import { tileSpriteChain } from '../../lib/sprites';
import type { PokedexEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';

/* A species sprite on the board. Uploaded art wins when the sheet has it;
   otherwise it walks the same Home -> Book -> Box -> Token chain (local, then
   GitHub-raw) the two sheets use. */

export function GmSprite({ dex, dexId, sheet, className }: {
    dex: PokedexEntry | null;
    dexId: string;
    sheet?: Partial<CardSheet> | null;
    className: string;
}) {
    const alt = dex ? dex.Name : dexId;
    const custom = sheet && sheet.spriteType === 'Custom' && sheet.customImage;
    if (custom) return <img className={className} src={sheet.customImage} alt={alt} />;
    if (!dex) return <img className={className} alt={alt} />;
    return (
        <FallbackImage
            candidates={tileSpriteChain(dex.Image).map((c) => ({
                url: c.url,
                /* The board's own class stays; the chain adds the per-set one. */
                className: (className + ' ' + c.className.replace('tile-sprite ', '')).trim(),
            }))}
            alt={alt}
        />
    );
}
