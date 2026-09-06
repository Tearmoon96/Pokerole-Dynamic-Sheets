import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { GITHUB_RAW, IMG_BASE } from '../../data/paths';
import { SPRITE_SET_BLOCKED } from '../../state/constants';
import { readCustomImage } from '../../lib/fileSystem';
import { MegaStoneIcon, megaStoneOf } from '../common/MonName';
import type { SpriteFrames } from '../../data/types';

/* The sprite box: the art itself, the set tabs under it, and the framing
   controls that ride on top.

   Per-sprite framing: each set (Home/Book/Box/Token/Custom) keeps its own zoom
   and nudge. All three are a transform, so the box never resizes with them. */

const SETS = [
    { type: 'Home', label: 'Home', folder: 'HomeSprites' },
    { type: 'Book', label: 'Book', folder: 'BookSprites' },
    { type: 'Box', label: 'Box', folder: 'BoxSprites' },
    /* ShuffleTokens files are lowercase like every other sprite folder; the old
       capitalisation found nothing. */
    { type: 'Shuffle', label: 'Token', folder: 'ShuffleTokens' },
] as const;

/* .sprite-stage is a square, and the image is object-fit: contain into it, so
   the sprite's longest side measures exactly this before any transform — which
   is the unit SPRITE_FRAMES stores its fractions in. Must match the CSS. */
const SPRITE_STAGE = 180;

/* Where the art sits inside its own canvas, from sprite-frames-db.js:
   [cx, cy, rr] in thousandths of the stage, cx/cy being the silhouette's centre
   measured from the middle. Negating them centres the Pokémon rather than the
   file it is stored in.

   Only Home, Book and Box are measured. Tokens are round and centred by
   construction, and a custom upload is the user's own framing, so both fall
   through to no correction. The whole thing is optional: an app-data folder
   predating the file just leaves sprites where they were. */
function spriteFrameOffset(frames: SpriteFrames, type: string, image: string) {
    const table = (frames as unknown as Record<string, Record<string, [number, number, number]>>)[type];
    const f = table && table[image];
    if (!f) return { x: 0, y: 0 };
    return { x: -f[0] / 1000 * SPRITE_STAGE, y: -f[1] / 1000 * SPRITE_STAGE };
}

export function SpritePanel({ onUpload }: { onUpload: () => void }) {
    const { pokemon, sheet, store } = useCard();
    const { data } = useAppData();
    const [scaleEditorOpen, setScaleEditorOpen] = useState(false);
    const [fullRes, setFullRes] = useState<string | null>(null);
    const [fellBack, setFellBack] = useState(false);

    const blocked = (type: string) => {
        const list = pokemon.Image && SPRITE_SET_BLOCKED[pokemon.Image];
        return !!list && list.indexOf(type) !== -1;
    };

    const hasCustom = !!(sheet.customImage || sheet.customImageFile);
    /* Nothing uploaded yet, or a stored set with no art for this species (which
       includes sheets saved before that check existed): fall back to Home rather
       than show a blank tab or the wrong Pokémon. */
    let type = sheet.spriteType || 'Home';
    if (type === 'Custom' && !hasCustom) type = 'Home';
    if (blocked(type)) type = 'Home';

    const showingCustom = type === 'Custom';

    useEffect(() => {
        setFullRes(null);
        if (!showingCustom || !sheet.customImageFile) return;
        let live = true;
        readCustomImage('Pokemons', sheet.customImageFile).then((url) => { if (live && url) setFullRes(url); });
        return () => { live = false; };
    }, [showingCustom, sheet.customImageFile]);

    useEffect(() => { setFellBack(false); }, [type, pokemon.Image]);

    const scale = (sheet.spriteScales && sheet.spriteScales[type]) || 1;
    const off = sheet.spriteOffsets?.[type] || { x: 0, y: 0 };
    const frame = spriteFrameOffset(data.spriteFrames, type, pokemon.Image);

    const set = SETS.find((s) => s.type === type);
    const src = showingCustom
        ? (fullRes || sheet.customImage)
        : (fellBack
            ? GITHUB_RAW + '/images/' + set!.folder + '/' + pokemon.Image
            : IMG_BASE + set!.folder + '/' + pokemon.Image);

    const spriteStyle: CSSProperties = {
        ['--sprite-frame-x' as string]: frame.x.toFixed(2) + 'px',
        ['--sprite-frame-y' as string]: frame.y.toFixed(2) + 'px',
        ['--sprite-scale' as string]: scale,
        ['--sprite-x' as string]: (off.x || 0) + 'px',
        ['--sprite-y' as string]: (off.y || 0) + 'px',
    };

    const setSpriteType = (next: string) => store.update((s) => { s.spriteType = next; });

    const adjust = (key: 'scale' | 'x' | 'y', value: number) => store.update((s) => {
        if (key === 'scale') s.spriteScales = { ...s.spriteScales, [type]: value };
        else {
            const cur = s.spriteOffsets[type] || { x: 0, y: 0 };
            s.spriteOffsets = { ...s.spriteOffsets, [type]: { ...cur, [key]: value } };
        }
    });

    const stone = megaStoneOf(pokemon);

    return (
        <div className={'sprite-panel' + (showingCustom ? ' showing-custom' : '')} id="sprite-panel">
            {/* Top-right: the mega stone (empty for anything that is not a Mega
                form) and the gender toggle */}
            <div className="sprite-top-right">
                <span className="mega-stone-slot" id="mega-stone-slot">
                    {stone && <MegaStoneIcon stone={stone} />}
                </span>
                <GenderToggle />
            </div>

            {/* Top-left, downwards: resize (on hover), then the custom-image
                controls (only while viewing an uploaded image) */}
            <div className="sprite-top-left">
                <button
                    className="sprite-scale-btn"
                    title="Resize this sprite"
                    onClick={(e) => { e.stopPropagation(); setScaleEditorOpen((v) => !v); }}
                >
                    <i className="fa-solid fa-up-right-and-down-left-from-center"></i>
                </button>
                <button className="sprite-custom-btn custom-only" title="Upload a different image" onClick={onUpload}>
                    <i className="fa-solid fa-pen"></i>
                </button>
                <button
                    className="sprite-custom-btn danger custom-only"
                    title="Remove custom image"
                    onClick={() => store.update((s) => {
                        s.customImage = '';
                        s.customImageFile = '';
                        s.spriteType = 'Home';
                    })}
                >
                    <i className="fa-solid fa-trash-can"></i>
                </button>
            </div>

            <div
                className="sprite-scale-editor"
                id="sprite-scale-editor"
                style={scaleEditorOpen ? { display: 'flex' } : undefined}
            >
                <label className="sprite-scale-row">
                    <span>Size</span>
                    <input
                        type="range" min="0.25" max="3" step="0.01"
                        id="sprite-scale-range" className="sprite-scale-range"
                        value={scale}
                        onChange={(e) => adjust('scale', parseFloat(e.currentTarget.value))}
                    />
                    <span className="sprite-scale-val" id="sprite-scale-val">{Number(scale).toFixed(2)}×</span>
                </label>
                <label className="sprite-scale-row">
                    <span>Horizontal</span>
                    <input
                        type="range" min="-50" max="50" step="1"
                        id="sprite-x-range" className="sprite-scale-range"
                        value={off.x || 0}
                        onChange={(e) => adjust('x', parseFloat(e.currentTarget.value))}
                    />
                    <span className="sprite-scale-val" id="sprite-x-val">{off.x || 0}</span>
                </label>
                <label className="sprite-scale-row">
                    <span>Vertical</span>
                    <input
                        type="range" min="-50" max="50" step="1"
                        id="sprite-y-range" className="sprite-scale-range"
                        value={off.y || 0}
                        onChange={(e) => adjust('y', parseFloat(e.currentTarget.value))}
                    />
                    <span className="sprite-scale-val" id="sprite-y-val">{off.y || 0}</span>
                </label>
                <button
                    className="sprite-scale-reset"
                    onClick={() => store.update((s) => {
                        s.spriteScales = { ...s.spriteScales, [type]: 1 };
                        s.spriteOffsets = { ...s.spriteOffsets, [type]: { x: 0, y: 0 } };
                    })}
                >
                    Reset
                </button>
            </div>

            <div className="sprite-stage">
                <img
                    id="poke-sprite"
                    className="pokemon-sprite"
                    alt={pokemon.Name + ' Sprite'}
                    src={src}
                    style={spriteStyle}
                    onError={() => { if (!showingCustom) setFellBack(true); }}
                />
            </div>

            <div className="sprite-selectors">
                {SETS.map((s) => {
                    /* Grey out a set that has no art for this species rather than
                       letting it draw the wrong Pokémon. */
                    const off2 = blocked(s.type);
                    return (
                        <button
                            key={s.type}
                            className={'sprite-btn' + (type === s.type ? ' active' : '') + (off2 ? ' disabled' : '')}
                            title={off2 ? 'No ' + s.label + ' art for this Pokémon' : ''}
                            onClick={() => { if (!off2) setSpriteType(s.type); }}
                        >
                            {s.label}
                        </button>
                    );
                })}
                <button
                    className={'sprite-btn' + (showingCustom ? ' active' : '')}
                    id="sprite-btn-custom"
                    title="View or upload a custom image"
                    onClick={() => hasCustom ? setSpriteType('Custom') : onUpload()}
                >
                    Custom
                </button>
            </div>
        </div>
    );
}

const GENDER_META: Record<string, { cls: string; icon: string; title: string }> = {
    '': { cls: 'unset', icon: 'fa-venus-mars', title: 'Set gender (unset)' },
    'M': { cls: 'male', icon: 'fa-mars', title: 'Male — click for female' },
    'F': { cls: 'female', icon: 'fa-venus', title: 'Female — click to clear' },
};

function GenderToggle() {
    const { sheet, store } = useCard();
    const meta = GENDER_META[sheet.gender] || GENDER_META[''];
    const next: Record<string, '' | 'M' | 'F'> = { '': 'M', 'M': 'F', 'F': '' };
    return (
        <button
            className={'gender-toggle ' + meta.cls}
            id="gender-toggle"
            title={meta.title}
            onClick={() => store.update((s) => { s.gender = next[s.gender] ?? 'M'; })}
        >
            <i className={'fa-solid ' + meta.icon}></i>
        </button>
    );
}

/** Kept for the upload flow, which needs a ref outside the panel. */
export function useCustomSpriteInput() {
    return useRef<HTMLInputElement>(null);
}
