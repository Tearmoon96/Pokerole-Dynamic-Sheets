import { useEffect, useRef } from 'react';
import { useCard } from '../../card/CardContext';
import { TypesRow } from './TypeBadges';
import { useFitName } from '../../hooks/useFitName';
import { isEgg } from '../../card/evolution';
import { megaStoneOf } from '../common/MonName';

/* The name, the dex line, the typing row and the tool buttons. */

export function speciesDisplayName(name: string, stone: string | null): string {
    return stone ? name.replace(/\s*\(Mega[^)]*\)/, '') : name;
}

export function CardHeader({ wildMode, tools, evolveControls, wildActions }: {
    wildMode: boolean;
    tools: React.ReactNode;
    evolveControls: React.ReactNode;
    wildActions: React.ReactNode;
}) {
    const { pokemon: p, sheet, store } = useCard();
    const stone = megaStoneOf(p);
    const shownName = speciesDisplayName(p.Name, stone);
    /* Non-wild cards show the nickname (if any) in place of the species, and let
       you edit it inline; wild cards stay as the species name. */
    const displayName = (!wildMode && sheet.nickname) ? sheet.nickname : shownName;
    const nameRef = useRef<HTMLSpanElement>(null);

    useEffect(() => { document.title = 'Pokerole Card - ' + displayName; }, [displayName]);
    useFitName([displayName, p._id]);

    useEffect(() => {
        const el = nameRef.current;
        if (el && el.textContent !== displayName) el.textContent = displayName;
    }, [displayName]);

    /* Inline rename: the displayed name is editable and, when changed, kept as a
       nickname — only the shown name changes, never the species. */
    const commitName = (el: HTMLSpanElement) => {
        let v = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20);
        if (v === shownName) v = '';
        store.update((s) => { s.nickname = v; });
        el.textContent = v || shownName;   // collapse whitespace / restore species when cleared
    };

    const dexNo = '#' + (p.DexID || p.Number);
    const egg = isEgg(p);

    return (
        <header className="pokemon-header">
            <div className="pokemon-title-row">
                <h1 className="pokemon-name" id="pokemon-name">
                    {wildMode ? (
                        <span className="pokemon-name-text">{shownName}</span>
                    ) : (
                        <span
                            ref={nameRef}
                            className="pokemon-name-text editable"
                            id="pokemon-name-text"
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck={false}
                            title="Click to rename (shows a nickname instead of the species name)"
                            onBlur={(e) => commitName(e.currentTarget)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                            }}
                        />
                    )}
                </h1>
                {/* Egg only: it has no dex category, so the subline below would be
                    a blank line with a lone #0000 hanging off it. */}
                <span
                    className="pokemon-number"
                    id="pokedex-number-title"
                    style={{ display: egg ? '' : 'none' }}
                >
                    {dexNo}
                </span>
            </div>

            {/* The separate nickname field is only for wild cards; elsewhere the
                Pokémon's name itself is edited inline above. */}
            {wildMode && (
                <input
                    type="text"
                    id="nickname-input"
                    className="nickname-input"
                    maxLength={20}
                    placeholder="Give it a nickname…"
                    defaultValue={sheet.nickname}
                    key={'nick-' + sheet.nickname}
                    onChange={(e) => {
                        const nickname = e.currentTarget.value.trim();
                        store.update((s) => { s.nickname = nickname; });
                    }}
                />
            )}

            <div className="pokemon-subline" style={{ display: egg ? 'none' : '' }}>
                {/* Keeps the category centred */}
                <span className="pokemon-number mirror" id="pokedex-number-mirror" aria-hidden="true">{dexNo}</span>
                <span className="pokemon-category" id="pokemon-category">{p.DexCategory || ''}</span>
                <span className="pokemon-number" id="pokedex-number">{dexNo}</span>
            </div>

            <TypesRow />

            <div className="header-tools">{tools}</div>
            <div className="evolve-controls" id="evolve-controls">{evolveControls}</div>
            {wildMode && (
                <div className="pokemon-picker" id="wild-export-wrap">{wildActions}</div>
            )}
        </header>
    );
}
