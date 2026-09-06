import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { FallbackImage } from './FallbackImage';
import { SPRITE_FOLDERS, defaultPreview, speciesSpriteChain, standInType } from '../../lib/sprites';
import { readCustomImage } from '../../lib/fileSystem';
import type { PokedexEntry } from '../../data/types';
import type { MonPreview, PokemonSheet } from '../../state/types';

/* One Pokémon's sprite, framed by its slot's preview.

   Uploaded art is a two-step load: the thumbnail stored in the JSON paints
   immediately, and the full-resolution copy in the working folder replaces it
   once the folder answers. Boxing a Pokémon drops the thumbnail when the
   full-res copy is on disk, so without one the species sprite stands in rather
   than leaving a broken image if the folder turns out to be unreachable. */

export function MonSprite({ pokemon, sheet, preview, className, style, title }: {
    pokemon: PokedexEntry;
    sheet: PokemonSheet | null;
    preview: MonPreview | null;
    className?: string;
    style?: CSSProperties;
    title?: string;
}) {
    const pv = preview || defaultPreview();
    const folder = SPRITE_FOLDERS[standInType(pokemon.Image, pv)] || 'HomeSprites';
    const speciesChain = speciesSpriteChain(pokemon.Image, folder);

    const wantsCustom = pv.spriteType === 'Custom' && !!sheet
        && !!(sheet.customImage || sheet.customImageFile);
    const customFile = wantsCustom ? (sheet!.customImageFile as string | undefined) : undefined;
    const [fullRes, setFullRes] = useState<string | null>(null);

    useEffect(() => {
        setFullRes(null);
        if (!customFile) return;
        let live = true;
        readCustomImage('Pokemons', customFile).then((url) => { if (live && url) setFullRes(url); });
        return () => { live = false; };
    }, [customFile]);

    const spriteStyle: CSSProperties = {
        ...style,
        ['--sprite-scale' as string]: pv.scale ?? 1,
        ['--sprite-x' as string]: (pv.offsetX || 0) + 'px',
        ['--sprite-y' as string]: (pv.offsetY || 0) + 'px',
    };

    let candidates: string[] = speciesChain;
    if (wantsCustom) {
        const thumb = sheet!.customImage as string | undefined;
        /* Full-res when it arrives, the thumbnail meanwhile, the species sprite
           if neither is reachable. */
        candidates = [fullRes, thumb, ...speciesChain].filter(Boolean) as string[];
    }

    return (
        <FallbackImage
            candidates={candidates}
            className={className}
            style={spriteStyle}
            title={title}
        />
    );
}
