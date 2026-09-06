import { useEffect, useRef, useState } from 'react';
import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { MoveCard } from './MoveCard';
import { PainFlag } from './TotalFlags';
import { Suggestions } from '../common/Suggestions';
import {
    applyMoveOverrides, computeMoveTotals, getOrderedMoves,
} from '../../card/moves';
import type { CardMove } from '../../card/moves';
import { painPenalty, resolvePoolValue } from '../../card/pools';

/* The move learnset: the filter controls, the three universal rolls, and the
   list itself. */

const FILTER_RANKS = ['Starter', 'Rookie', 'Standard', 'Advanced', 'Expert', 'Ace', 'Custom'];
const MOVE_SUGGESTION_CAP = 40;

export function MovesPanel({ speciesMoves, onEditMove, onDeleteMove }: {
    speciesMoves: CardMove[];
    onEditMove: (name: string) => void;
    onDeleteMove: (name: string) => void;
}) {
    const { sheet, src, store } = useCard();
    const { data } = useAppData();

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [adderOpen, setAdderOpen] = useState(false);
    const [moveQuery, setMoveQuery] = useState('');
    const [suggestOpen, setSuggestOpen] = useState(false);
    const [addStatus, setAddStatus] = useState('');
    const dragName = useRef<string | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    /* Any click outside the picker closes it. The + button is excluded: its
       click focuses the move input, and would otherwise bubble here. */
    useEffect(() => {
        if (!filterMenuOpen) return;
        const close = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.filter-picker')) setFilterMenuOpen(false);
        };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [filterMenuOpen]);

    const customMoves: CardMove[] = sheet.customMoves
        .map((name) => data.moves.find((m) => m.Name === name))
        .filter(Boolean)
        .map((m) => ({ ...(m as CardMove), Learned: 'Custom' }));

    const allMoves = getOrderedMoves(speciesMoves, customMoves, sheet);

    /* "Pinned" is a cross-cutting filter (show only pinned moves); the rest of
       activeFilters are learn-ranks. They combine — e.g. Pinned together with
       Ace shows only pinned Ace moves. */
    const pinnedOnly = sheet.activeFilters.includes('Pinned');
    const rankFilters = sheet.activeFilters.filter((r) => r !== 'Pinned');
    const pinnedSet = new Set(sheet.pinnedMoves || []);

    let filteredMoves = allMoves;
    if (pinnedOnly) filteredMoves = filteredMoves.filter((m) => pinnedSet.has(m.Name));
    if (rankFilters.length > 0) filteredMoves = filteredMoves.filter((m) => rankFilters.includes(m.Learned || ''));

    let emptyMsg = 'No moves match the selected filters.';
    if (pinnedOnly && pinnedSet.size === 0) {
        emptyMsg = 'No pinned moves yet. Use the tack on a move to pin it to the top.';
    } else if (!pinnedOnly && rankFilters.length === 1 && rankFilters[0] === 'Custom') {
        emptyMsg = 'No custom moves yet. Use the + button above to add one.';
    }

    const toggleFilter = (rank: string) => store.update((s) => {
        if (rank === 'All') {
            /* All excludes every rank filter; unchecking the last rank below
               re-selects it implicitly. */
            s.activeFilters = [];
        } else if (s.activeFilters.includes(rank)) {
            s.activeFilters = s.activeFilters.filter((r) => r !== rank);
        } else {
            s.activeFilters = [...s.activeFilters, rank];
        }
    });

    /* Drag to rearrange. The original moved DOM nodes and read the order back
       out afterwards; here the order lives in state, so the drop writes it. */
    const commitOrder = (from: string, to: string) => {
        if (from === to) return;
        const visible = filteredMoves.map((m) => m.Name);
        const fromIdx = visible.indexOf(from);
        const toIdx = visible.indexOf(to);
        if (fromIdx < 0 || toIdx < 0) return;
        const reordered = visible.slice();
        reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, from);

        store.update((s) => {
            /* Merge the on-screen order back into the full order: visible cards
               trade positions among themselves while filtered-out moves keep
               their slots. */
            const shown = new Set(reordered);
            let k = 0;
            s.moveOrder = allMoves.map((m) => shown.has(m.Name) ? reordered[k++] : m.Name);
            /* Keep the pin order matching how the pinned cards now sit on
               screen, so dragging among pinned moves sticks. */
            const pinned = s.pinnedMoves || [];
            if (pinned.length > 0) {
                const set = new Set(pinned);
                s.pinnedMoves = reordered.filter((n) => set.has(n));
            }
        });
    };

    const moveQ = moveQuery.trim().toLowerCase();
    const known = new Set(allMoves.map((m) => m.Name));
    const moveMatches = data.moves.filter((m) => m.Name.toLowerCase().includes(moveQ));
    const moveShown = moveMatches.slice(0, MOVE_SUGGESTION_CAP);

    const addCustomMove = (name: string) => {
        const clean = name.trim();
        if (!clean) return;
        const found = data.moves.find((m) => m.Name.toLowerCase() === clean.toLowerCase());
        if (!found) { setAddStatus('No move by that name.'); return; }
        if (known.has(found.Name)) { setAddStatus('Already on this sheet.'); return; }
        store.update((s) => { s.customMoves = [...s.customMoves, found.Name]; });
        setMoveQuery('');
        setSuggestOpen(false);
        setAddStatus('');
    };

    const pain = painPenalty(src);
    const clashSkill = resolvePoolValue(src, 'Clash') || 0;
    const quick = {
        evasion: (resolvePoolValue(src, 'Dexterity') || 0) + (resolvePoolValue(src, 'Evasion') || 0),
        initiative: (resolvePoolValue(src, 'Dexterity') || 0) + (resolvePoolValue(src, 'Alert') || 0),
        clashStr: (resolvePoolValue(src, 'Strength') || 0) + clashSkill,
        clashSpe: (resolvePoolValue(src, 'Special') || 0) + clashSkill,
    };

    return (
        <div className="moves-panel">
            <div className="moves-head">
                <header className="moves-header">
                    <h2 className="moves-title">
                        <i className="fa-solid fa-wand-magic-sparkles"></i> Move Learnset
                    </h2>
                    <div className="moves-header-right">
                        <button
                            className="filter-picker-btn"
                            title="Restore default move order"
                            onClick={() => store.update((s) => { s.moveOrder = []; })}
                        >
                            <i className="fa-solid fa-rotate-left"></i>
                        </button>
                        <button
                            className="filter-picker-btn"
                            id="custom-adder-btn"
                            title="Add a custom move"
                            onClick={() => setAdderOpen((v) => !v)}
                        >
                            <i className="fa-solid fa-plus"></i>
                        </button>
                        <div className="filter-picker">
                            <button
                                className={'filter-picker-btn' + (sheet.activeFilters.length ? ' filtering' : '')}
                                id="filter-picker-btn"
                                title="Choose visible filters"
                                onClick={(e) => { e.stopPropagation(); setFilterMenuOpen((v) => !v); }}
                            >
                                <i className="fa-solid fa-filter"></i>
                            </button>
                            <div
                                className="filter-picker-menu"
                                id="filter-picker-menu"
                                style={{ display: filterMenuOpen ? 'flex' : 'none' }}
                            >
                                {['All'].concat(FILTER_RANKS).map((rank) => {
                                    const checked = rank === 'All'
                                        ? sheet.activeFilters.length === 0
                                        : sheet.activeFilters.includes(rank);
                                    return (
                                        <div
                                            className="filter-option"
                                            key={rank}
                                            /* The re-render detaches this element, which would
                                               make the outside-click handler close the menu. */
                                            onClick={(e) => { e.stopPropagation(); toggleFilter(rank); }}
                                        >
                                            <span className={'dot ' + (checked ? 'filled' : 'empty')} /> {rank}
                                        </div>
                                    );
                                })}
                                {/* "Pinned" is a separate cross-cutting filter, so it sits
                                    below the ranks with a tack icon. */}
                                <div
                                    className="filter-option pinned-filter"
                                    onClick={(e) => { e.stopPropagation(); toggleFilter('Pinned'); }}
                                >
                                    <span className={'dot ' + (pinnedOnly ? 'filled' : 'empty')} />
                                    <span className="pinned-label">
                                        <i className="fa-solid fa-thumbtack" style={{ fontSize: '0.78em' }}></i>
                                        Pinned
                                    </span>
                                </div>
                            </div>
                        </div>
                        <span className="moves-count" id="moves-count">
                            {filteredMoves.length} / {allMoves.length} Moves
                        </span>
                    </div>
                </header>

                <div
                    className="custom-move-adder"
                    id="custom-move-adder"
                    style={{ display: adderOpen ? 'flex' : 'none' }}
                >
                    <div className="move-search-wrap">
                        <input
                            type="text"
                            id="custom-move-input"
                            className="specialty-input"
                            autoComplete="off"
                            placeholder="Search the full move list..."
                            value={moveQuery}
                            onChange={(e) => { setMoveQuery(e.currentTarget.value); setSuggestOpen(true); setAddStatus(''); }}
                            onFocus={() => setSuggestOpen(true)}
                            onBlur={() => setSuggestOpen(false)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addCustomMove(moveQuery); }}
                        />
                        <Suggestions
                            id="move-suggestions"
                            open={suggestOpen}
                            hiddenCount={moveMatches.length - moveShown.length}
                            rows={moveShown.map((m) => ({
                                key: m.Name,
                                title: m.Name + '\n' + (m.Effect || ''),
                                onSelect: () => addCustomMove(m.Name),
                                content: <span className="item-suggestion-name">{m.Name}</span>,
                            }))}
                        />
                    </div>
                    <button
                        className="specialty-add-btn"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addCustomMove(moveQuery)}
                    >
                        Add
                    </button>
                    <span className="custom-move-status" id="custom-move-status">{addStatus}</span>
                </div>

                {/* Universal quick moves, always visible in every category.

                    Pain costs a success on these rolls too. The glyph sits to the
                    LEFT of the value: the number is the pool, and Pain is not in
                    it — it comes off the successes afterwards. */}
                <div className="quick-moves-stack">
                    <div className="quick-moves-row">
                        <div className="quick-move" title="Dexterity + Evasion">
                            <span className="quick-move-name">
                                <i className="fa-solid fa-person-running"></i> Evasion
                            </span>
                            <span className="quick-move-vals">
                                {!!pain && <PainFlag pain={-pain} />}
                                <span className="quick-move-val"><strong id="quick-evasion">{quick.evasion}</strong></span>
                            </span>
                        </div>
                        {/* Title on the box, like Evasion and Initiative: the two values
                            had one each, so the tooltip only appeared over the numbers. */}
                        <div className="quick-move" title="Strength or Special, + Clash">
                            <span className="quick-move-name">
                                <i className="fa-solid fa-hand-fist"></i> Clash
                            </span>
                            <span className="quick-move-vals">
                                {!!pain && <PainFlag pain={-pain} />}
                                <span className="quick-move-val" title="Strength + Clash">
                                    STR <strong id="quick-clash-str">{quick.clashStr}</strong>
                                </span>
                                <span className="quick-move-val" title="Special + Clash">
                                    SPE <strong id="quick-clash-spe">{quick.clashSpe}</strong>
                                </span>
                            </span>
                        </div>
                    </div>
                    <div className="quick-moves-row">
                        <div className="quick-move" title="Dexterity + Alert">
                            <span className="quick-move-name">
                                <i className="fa-solid fa-bolt"></i> Initiative
                            </span>
                            <span className="quick-move-vals">
                                {!!pain && <PainFlag pain={-pain} />}
                                <span className="quick-move-val"><strong id="quick-initiative">{quick.initiative}</strong></span>
                            </span>
                        </div>
                        {/* Only shown while the Pokémon is hurt enough to take the
                            penalty; it keeps its slot so Initiative stays under Evasion */}
                        <div
                            className={'quick-move pain-quick' + (pain > 0 ? ' on' : '') + (pain > 1 ? ' severe' : '')}
                            id="pain-quick"
                            title="Pain penalty. At half HP or less (rounded down) you lose 1 success on Skill, Accuracy and Damage rolls; at 1 HP you lose 2."
                        >
                            <span className="quick-move-name">
                                <i className="fa-solid fa-heart-crack"></i> Pain
                            </span>
                            {/* Plain "0", not "−0": a signed zero reads as a penalty
                                being applied, the opposite of what it means here. */}
                            <span className="quick-move-val"><strong id="pain-value">{pain ? '−' + pain : '0'}</strong></span>
                        </div>
                    </div>
                </div>
            </div>

            {/* The wrapper is what the grid stretches; the list itself is laid
                over it — see .moves-scroll. */}
            <div className="moves-scroll">
                <div
                    className="moves-grid"
                    id="moves-list-grid"
                    ref={gridRef}
                    onDragOver={(e) => { if (dragName.current) e.preventDefault(); }}
                >
                    {!filteredMoves.length ? (
                        <div className="no-moves-msg">{emptyMsg}</div>
                    ) : filteredMoves.map((base) => {
                        const move = applyMoveOverrides(sheet, base);
                        const totals = computeMoveTotals(src, move);
                        const isExpanded = expanded.has(move.Name);
                        return (
                            <MoveCard
                                key={move.Name}
                                move={move}
                                totals={totals}
                                expanded={isExpanded}
                                onToggle={() => setExpanded((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(move.Name)) next.delete(move.Name); else next.add(move.Name);
                                    return next;
                                })}
                                onEdit={() => onEditMove(move.Name)}
                                onDelete={() => onDeleteMove(move.Name)}
                                dragProps={{
                                    /* Only collapsed cards are draggable. */
                                    draggable: !isExpanded,
                                    onDragStart: (e) => {
                                        dragName.current = move.Name;
                                        (e.currentTarget as HTMLElement).classList.add('dragging');
                                        e.dataTransfer.effectAllowed = 'move';
                                        // Firefox refuses to start a drag without data attached
                                        e.dataTransfer.setData('text/plain', move.Name);
                                    },
                                    onDragEnd: (e) => {
                                        dragName.current = null;
                                        (e.currentTarget as HTMLElement).classList.remove('dragging');
                                    },
                                    onDragOver: (e) => {
                                        if (!dragName.current || dragName.current === move.Name) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    },
                                    onDrop: (e) => {
                                        e.preventDefault();
                                        const from = dragName.current;
                                        dragName.current = null;
                                        if (from) commitOrder(from, move.Name);
                                    },
                                }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
