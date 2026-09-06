import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/* An <img> that walks a list of candidate URLs, moving on whenever one fails.

   Every sprite in the app has a fallback chain — the local copy, then the
   Pokerole dataset on GitHub, and for tiles the other sprite packs after that.
   The original code wired this up by reassigning img.onerror; this is the same
   walk, held in state so React owns the element. */

export interface ImageCandidate { url: string; className?: string }

export function FallbackImage({ candidates, className, style, alt = '', title, loading = 'lazy', onClick }: {
    candidates: (string | ImageCandidate)[];
    className?: string;
    style?: CSSProperties;
    alt?: string;
    title?: string;
    loading?: 'lazy' | 'eager';
    onClick?: () => void;
}) {
    const list: ImageCandidate[] = candidates.map((c) => typeof c === 'string' ? { url: c } : c);
    const key = list.map((c) => c.url).join('|');
    const [index, setIndex] = useState(0);

    /* A new chain (a different Pokémon in the same slot) restarts the walk. */
    useEffect(() => { setIndex(0); }, [key]);

    const current = list[Math.min(index, list.length - 1)];
    if (!current) return null;

    return (
        <img
            src={current.url}
            className={current.className ?? className}
            style={style}
            alt={alt}
            title={title}
            loading={loading}
            onClick={onClick}
            /* Exhausted: stop, and leave the broken icon exactly as before. */
            onError={() => { if (index < list.length - 1) setIndex(index + 1); }}
        />
    );
}
