import { useState } from 'react';
import type { CSSProperties } from 'react';

/* An <img> that walks a chain of candidate URLs and, unlike FallbackImage,
   ends in something drawn rather than a broken-image icon: until the owner's
   art exists, a landmark is a coloured disc with its glyph on it.

   The src is DERIVED from the props on every render, and all that is held in
   state is which URLs have failed — see §8 on seeding state from a prop that
   can change under a reused element. The misses are also remembered for the
   whole page, so a map with forty stamps of one missing sprite asks for it
   once, not forty times. */

const missing = new Set<string>();

export interface SpriteCandidate { url: string; className?: string }

export function MapSprite({ candidates, icon, color, className, style, title }: {
    candidates: (string | SpriteCandidate)[];
    /** The placeholder's FontAwesome glyph and disc colour. */
    icon: string;
    color: string;
    className?: string;
    style?: CSSProperties;
    title?: string;
}) {
    const [, setFailures] = useState(0);
    const list = candidates.map((c) => (typeof c === 'string' ? { url: c } : c));
    const current = list.find((c) => !missing.has(c.url));

    if (!current) {
        return (
            <span className={'map-ph' + (className ? ' ' + className : '')} style={{ ...style, background: color }} title={title}>
                <i className={'fa-solid ' + icon}></i>
            </span>
        );
    }
    return (
        <img
            src={current.url}
            className={[className, current.className].filter(Boolean).join(' ')}
            style={style}
            alt=""
            title={title}
            draggable={false}
            onError={() => { missing.add(current.url); setFailures((n) => n + 1); }}
        />
    );
}
