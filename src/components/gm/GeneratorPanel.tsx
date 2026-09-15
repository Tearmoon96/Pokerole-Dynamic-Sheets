import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Panel } from './Panel';
import { GmSprite } from './GmSprite';
import { TypeChips } from './RosterBits';
import { TYPE_ICONS } from '../../lib/themeTables';
import { mixHex } from '../../lib/color';
import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { uid } from '../../gm/state';
import {
    ATTRIBUTE_KEYS, RECENT_ROLLS, SOCIAL_KEYS, SPECIALTY_KEYS, STAGE_KEYS, generatePokemon, heldItemsIn,
    learnset, speciesAbilities,
} from '../../gm/generator';
import { HABITATS, habitatsOf } from '../../gm/habitats';
import { monPoolMax, monStat } from '../../gm/pools';
import { isMegaForm } from '../../card/evolution';
import { RANKS, rankIndex } from '../../lib/ranks';
import { STAT_LABELS } from '../../lib/pills';
import { typeColors } from '../../lib/themeTables';
import { downloadWild } from '../../card/wild';
import type { GmGenOpts } from '../../gm/generator';
import type { GmWild } from '../../gm/types';
import type { PokedexEntry } from '../../data/types';

/* Roll a wild Pokémon: a species, a rank, and a sheet built the way the
   rulebook builds one — the rank's points spent over the species' base stats,
   its moves drawn from what it can learn by that rank, an ability, a nature,
   a gender and maybe a held item. Every setting is "random" until the GM pins
   it. A result waits here until it is kept, which moves it onto the roster as
   a wild, or discarded.

   The options sit in the body under their own expander rather than behind a
   cog in the head: they are most of what the panel is for, and a GM sets
   habitat and rank for an encounter far more often than they roll blind. */

/** How many rolls wait in the list before the oldest is dropped. */
const MAX_GENERATED = 8;

const SPECIALTY_LABELS: Record<string, string> = {
    brawl: 'Brawl', channel: 'Channel', clash: 'Clash', evasion: 'Evasion',
    alert: 'Alert', athletic: 'Athletic', nature: 'Nature', stealth: 'Stealth',
    charm: 'Charm', empathy: 'Empathy', intimidate: 'Intimidate', perform: 'Perform',
    craft: 'Craft', etiquette: 'Etiquette', medicine: 'Medicine', science: 'Science',
};

const TYPES = Object.keys(typeColors);

const TYPE_MODES: { key: string; label: string; title: string }[] = [
    { key: 'any', label: 'Any', title: 'Single or dual type' },
    { key: 'single', label: 'Single', title: 'One type only' },
    { key: 'dual', label: 'Dual', title: 'Two types' },
];

/* The three stages are toggles that can be combined — "first or second"
   for a low-rank route — and Random is what having none, or all three,
   ticked means. */
const STAGES: { key: typeof STAGE_KEYS[number]; label: string; title: string }[] = [
    { key: 'first', label: 'First', title: 'Nothing before it in its line — including a species that never evolves' },
    { key: 'second', label: 'Second', title: 'The second stage of its line, whether or not there is a third' },
    { key: 'final', label: 'Final', title: 'Evolves no further — including a species that never evolves' },
];

/** The stages actually asked for: none, or all three, is "any". */
function askedStages(stages: string[]): string[] {
    const on = STAGE_KEYS.filter((k) => stages.includes(k));
    return on.length === STAGE_KEYS.length ? [] : on;
}

const GENDERS: { key: string; icon: string; label: string }[] = [
    { key: 'random', icon: 'fa-dice', label: 'Random' },
    { key: 'M', icon: 'fa-mars', label: 'Male' },
    { key: 'F', icon: 'fa-venus', label: 'Female' },
    { key: '', icon: 'fa-genderless', label: 'None' },
];

export function GeneratorPanel({ onReorder }: { onReorder: (from: string, to: string) => void }) {
    const { state, store } = useGm();
    const { data } = useAppData();
    const toast = useToast();
    const [optionsOpen, setOptionsOpen] = useState(true);
    /** What the last roll could not honour, shown under the results. */
    const [notes, setNotes] = useState<string[]>([]);

    const o = state.genOpts;
    const stagesOn = askedStages(o.stages);
    const dexById = (id: string): PokedexEntry | null => data.pokemon.find((p) => p._id === id) || null;
    const chosen = o.species ? dexById(o.species) : null;

    const setOpt = (patch: Partial<GmGenOpts>) => store.update((s) => {
        s.genOpts = { ...s.genOpts, ...patch };
    });

    /* Every roll, pinned or not, goes on the recent list — the list is what
       a random draw skips, and a species the GM just asked for by name is as
       "seen" as one the dice turned up. */
    const roll = (over?: Partial<GmGenOpts>): GmWild | null => {
        const asked = { ...o, ...over };
        /* A second type under Single would empty the pool; it is greyed in
           the row, and ignored here so the stored value survives a switch
           back to Any or Dual. */
        if (asked.typeMode === 'single') asked.type2 = '';
        const res = generatePokemon(data, asked, Math.random, state.genRecent);
        if (!res) {
            toast('<i class="fa-solid fa-triangle-exclamation"></i> No species matches those settings.');
            return null;
        }
        setNotes(res.notes);
        return { gid: uid(), dexId: res.dex._id, sheet: res.sheet, pushed: false };
    };

    const remember = (s: typeof state, w: GmWild) => {
        const n = dexById(w.dexId)?.Number || 0;
        if (n > 0) s.genRecent = [n, ...s.genRecent.filter((x) => x !== n)].slice(0, RECENT_ROLLS);
    };

    const generate = () => {
        const w = roll();
        if (!w) return;
        store.update((s) => {
            s.generated = [w, ...s.generated].slice(0, MAX_GENERATED);
            remember(s, w);
        });
    };

    /* Same species, same rank, everything else fresh: "another one of those". */
    const reroll = (w: GmWild) => {
        const next = roll({ species: w.dexId, rank: w.sheet.rank });
        if (!next) return;
        store.update((s) => {
            s.generated = s.generated.map((x) => x.gid === w.gid ? next : x);
            remember(s, next);
        });
    };

    const keep = (w: GmWild) => {
        store.update((s) => {
            s.generated = s.generated.filter((x) => x.gid !== w.gid);
            s.wilds = [...s.wilds, w];
        });
        const name = (w.sheet.nickname || '').trim() || (dexById(w.dexId)?.Name ?? w.dexId);
        toast('<i class="fa-solid fa-users"></i> ' + escapeHtml(name) + ' joins the roster as a wild.');
    };

    const discard = (w: GmWild) => store.update((s) => {
        s.generated = s.generated.filter((x) => x.gid !== w.gid);
    });

    /* The moves the GM can pin: the species' learnset, narrowed to the rank
       when one is set — the top of the range, for a range. With the rank
       left random every move is offered and the ones above the rolled rank
       are dropped at roll time, with a note. */
    const rankIdx = o.rank === 'range'
        ? Math.max(rankIndex(o.rankFrom), rankIndex(o.rankTo))
        : rankIndex(o.rank);
    const pinnable = chosen
        ? learnset(data, chosen).filter((lm) => rankIdx < 0 || rankIndex(lm.learned) <= rankIdx)
        : [];

    const abilityChoices = chosen ? speciesAbilities(chosen, true) : [];
    const heldItems = heldItemsIn(data);

    const toggleIn = (list: string[], key: string) =>
        list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

    const favourGroup = (title: string, keys: readonly string[], labels: Record<string, string>) => (
        <div className="gen-chip-group">
            <span className="gen-chip-title">{title}</span>
            <div className="gen-chips">
                {keys.map((k) => (
                    <button
                        key={k}
                        type="button"
                        className={'gen-chip' + (o.favour.includes(k) ? ' on' : '')}
                        aria-pressed={o.favour.includes(k)}
                        onClick={() => setOpt({ favour: toggleIn(o.favour, k) })}
                    >
                        {labels[k] || k}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <Panel
            panelKey="generator"
            icon="fa-paw"
            title="Pokémon Generator"
            onReorder={onReorder}
            actions={
                <button className="icon-btn" id="gen-generate" onClick={generate} title="Roll a wild Pokémon">
                    <i className="fa-solid fa-wand-magic-sparkles"></i> Generate
                </button>
            }
        >
            <div className="panel-body">
                <div className="muted">
                    Roll a wild Pokémon built by the rank rules. Everything is random until you pin it;
                    keep a result to put it on the roster. A species sits out the next {RECENT_ROLLS} rolls.
                </div>

                <div className={'gen-options' + (optionsOpen ? ' open' : '')} id="gen-options">
                    <div
                        className="gen-options-head"
                        role="button"
                        tabIndex={0}
                        aria-expanded={optionsOpen}
                        aria-controls="gen-settings"
                        onClick={() => setOptionsOpen((v) => !v)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOptionsOpen((v) => !v); }
                        }}
                    >
                        <i className={'fa-solid fa-caret-' + (optionsOpen ? 'down' : 'right') + ' gen-twist'}></i>
                        <span className="gen-options-title">Options</span>
                        {!optionsOpen && <span className="gen-options-summary">{summarize(o, chosen)}</span>}
                    </div>
                    <div className="gen-settings" id="gen-settings" hidden={!optionsOpen}>
                    <div className="set-row">
                        <label htmlFor="gen-species">Species</label>
                        <SpeciesField value={o.species} onPick={(id) => setOpt({ species: id, moves: [], ability: '' })} />
                    </div>
                    {/* The rank belongs to the encounter, not the species: any
                        Pokémon can be met at any rank. Random, one rank, or a
                        random rank from a range. */}
                    <div className="set-row">
                        <label htmlFor="gen-rank">Rank</label>
                        {/* Two groups, so the two random entries do not read as
                            ranks called "Random": a native popup takes group
                            labels and an option's colour, and nothing else. */}
                        <select id="gen-rank" value={o.rank} className={o.rank === '' || o.rank === 'range' ? 'gen-random-on' : ''} onChange={(e) => setOpt({ rank: e.currentTarget.value })}>
                            <optgroup label="Random">
                                <option value="" className="gen-opt-random">🎲 Any rank</option>
                                <option value="range" className="gen-opt-random">🎲 Within a range…</option>
                            </optgroup>
                            <optgroup label="Fixed rank">
                                {RANKS.map((r) => <option value={r} key={r}>{r}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    {o.rank === 'range' && (
                        <div className="set-row gen-rank-range">
                            <label htmlFor="gen-rank-from">from</label>
                            <select id="gen-rank-from" value={o.rankFrom} onChange={(e) => setOpt({ rankFrom: e.currentTarget.value })}>
                                {RANKS.map((r) => <option value={r} key={r}>{r}</option>)}
                            </select>
                            <span className="gen-range-to">to</span>
                            <select id="gen-rank-to" value={o.rankTo} aria-label="to" onChange={(e) => setOpt({ rankTo: e.currentTarget.value })}>
                                {RANKS.map((r) => <option value={r} key={r}>{r}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="set-row">
                        <label htmlFor="gen-habitat">Habitat</label>
                        <select
                            id="gen-habitat"
                            value={o.habitat}
                            disabled={!!chosen}
                            title={chosen ? 'Only used when the species is random' : undefined}
                            onChange={(e) => setOpt({ habitat: e.currentTarget.value })}
                        >
                            <option value="">Anywhere</option>
                            {HABITATS.map((h) => <option value={h.key} key={h.key}>{h.label}</option>)}
                        </select>
                    </div>
                    {/* Two type selects: one for a single-typed ask, both for
                        "Fire + Flying". The second is off under Single, where
                        there is no second type to ask for. */}
                    <div className="set-row">
                        <label htmlFor="gen-type">Type</label>
                        <TypeSelect
                            id="gen-type"
                            value={o.type}
                            types={TYPES}
                            disabled={!!chosen}
                            title={chosen ? 'Only used when the species is random' : 'Type'}
                            onPick={(t) => setOpt({ type: t })}
                        />
                        <TypeSelect
                            id="gen-type2"
                            value={o.typeMode === 'single' ? '' : o.type2}
                            types={TYPES.filter((t) => t !== o.type)}
                            disabled={!!chosen || o.typeMode === 'single'}
                            title={o.typeMode === 'single' ? 'A single-typed Pokémon has no second type' : 'Second type'}
                            onPick={(t) => setOpt({ type2: t })}
                        />
                    </div>
                    <div className="set-row">
                        <label></label>
                        <div className="seg gen-type-mode" id="gen-type-mode">
                            {TYPE_MODES.map((m) => (
                                <button
                                    key={m.key}
                                    className={o.typeMode === m.key ? 'on' : ''}
                                    disabled={!!chosen}
                                    onClick={() => setOpt({ typeMode: m.key })}
                                    title={m.title}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Where in its line the species stands: toggles, so two can
                        be on together. Random is the state of none — ticking the
                        third clears the lot, since all three IS random. */}
                    <div className="set-row">
                        <label>Stage</label>
                        <div className="seg gen-stage" id="gen-stage">
                            <button
                                className={stagesOn.length ? '' : 'on'}
                                disabled={!!chosen}
                                onClick={() => setOpt({ stages: [] })}
                                title={chosen ? 'Only used when the species is random' : 'Any stage of its line'}
                            >
                                Random
                            </button>
                            {STAGES.map((m) => (
                                <button
                                    key={m.key}
                                    className={stagesOn.includes(m.key) ? 'on' : ''}
                                    disabled={!!chosen}
                                    onClick={() => setOpt({
                                        stages: askedStages(stagesOn.includes(m.key)
                                            ? stagesOn.filter((k) => k !== m.key)
                                            : [...stagesOn, m.key]),
                                    })}
                                    title={chosen ? 'Only used when the species is random' : m.title}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="gen-checks">
                        <label className="set-check" title="The Legendary Pokémon of every generation, and the Ultra Beasts with them.">
                            <input
                                type="checkbox" id="gen-legendaries"
                                checked={!!o.legendaries}
                                disabled={!!chosen}
                                onChange={(e) => setOpt({ legendaries: e.currentTarget.checked })}
                            />
                            Legendaries may appear
                        </label>
                        <label className="set-check" title="The event-only Pokémon: Mew, Celebi, Jirachi, Arceus and the rest, Meltan to Pecharunt.">
                            <input
                                type="checkbox" id="gen-mythicals"
                                checked={!!o.mythicals}
                                disabled={!!chosen}
                                onChange={(e) => setOpt({ mythicals: e.currentTarget.checked })}
                            />
                            Mythicals may appear
                        </label>
                        <label className="set-check" title="The past and future Pokémon out of Area Zero. Koraidon and Miraidon are Legendary as well and need both boxes.">
                            <input
                                type="checkbox" id="gen-paradox"
                                checked={!!o.paradox}
                                disabled={!!chosen}
                                onChange={(e) => setOpt({ paradox: e.currentTarget.checked })}
                            />
                            Time paradoxes may appear
                        </label>
                    </div>

                    <div className="set-row">
                        <label htmlFor="gen-ability">Ability</label>
                        <select id="gen-ability" value={o.ability} onChange={(e) => setOpt({ ability: e.currentTarget.value })}>
                            <option value="">Random</option>
                            <option value="hidden">Random, hidden ability too</option>
                            {abilityChoices.map((a) => <option value={a} key={a}>{a}</option>)}
                        </select>
                    </div>
                    <div className="set-row">
                        <label>Gender</label>
                        <div className="seg" id="gen-gender">
                            {GENDERS.map((g) => (
                                <button
                                    key={g.key || 'none'}
                                    className={o.gender === g.key ? 'on' : ''}
                                    onClick={() => setOpt({ gender: g.key })}
                                    title={g.label}
                                >
                                    <i className={'fa-solid ' + g.icon}></i>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="set-row">
                        <label htmlFor="gen-nature">Nature</label>
                        <select id="gen-nature" value={o.nature} onChange={(e) => setOpt({ nature: e.currentTarget.value })}>
                            <option value="">Random</option>
                            {data.natures.map((n) => <option value={n.Name} key={n.Name}>{n.Name}</option>)}
                        </select>
                    </div>

                    <div className="set-row">
                        <label htmlFor="gen-item-chance">Held item</label>
                        <input
                            type="range" id="gen-item-chance" min={0} max={100} step={5}
                            value={o.itemChance}
                            onChange={(e) => setOpt({ itemChance: Number(e.currentTarget.value) })}
                            title="How likely it is to hold anything"
                        />
                        <span className="gen-pct">{o.itemChance}%</span>
                    </div>
                    <div className="set-row">
                        <label htmlFor="gen-item"></label>
                        <select id="gen-item" value={o.item} className={o.item ? '' : 'gen-random-on'} onChange={(e) => setOpt({ item: e.currentTarget.value })}>
                            <optgroup label="Automatic">
                                <option value="" className="gen-opt-random">🎲 Matches its type (Charcoal for Fire…)</option>
                            </optgroup>
                            <optgroup label="One item">
                                {heldItems.map((it) => <option value={it.Name} key={it.Name}>{it.Name}</option>)}
                            </optgroup>
                        </select>
                    </div>

                    <div className="gen-chip-group">
                        <span className="gen-chip-title">
                            Moves
                            {chosen && o.moves.length > 0 && (
                                <button type="button" className="gen-link" onClick={() => setOpt({ moves: [] })}>
                                    clear
                                </button>
                            )}
                        </span>
                        <label className="set-check" title="Take the moves as the learnset gives them">
                            <input
                                type="checkbox" id="gen-mix-random"
                                checked={o.moveMix !== 'ratio'}
                                onChange={(e) => setOpt({ moveMix: e.currentTarget.checked ? 'random' : 'ratio' })}
                            />
                            Attack and support moves in whatever mix comes up
                        </label>
                        {o.moveMix === 'ratio' && (
                            <div className="set-row" title="How many of its moves deal damage. A learnset short of one kind fills from the other.">
                                <label htmlFor="gen-attack-share">Attacks</label>
                                <input
                                    type="range" id="gen-attack-share" min={0} max={100} step={5}
                                    value={o.attackShare}
                                    onChange={(e) => setOpt({ attackShare: Number(e.currentTarget.value) })}
                                />
                                <span className="gen-pct">{o.attackShare}%</span>
                            </div>
                        )}
                        {!chosen ? (
                            <div className="gen-hint">
                                Rolled from the species' learnset, up to its rank. Pin a species to pick them.
                            </div>
                        ) : (
                            <>
                                <div className="gen-hint">
                                    Pinned moves are always known; the rest of its slots are rolled.
                                    {(rankIdx < 0 || o.rank === 'range') && ' A pinned move above the rolled rank is left out.'}
                                </div>
                                <div className="gen-chips gen-moves-pick">
                                    {pinnable.map((lm) => (
                                        <button
                                            key={lm.move.Name}
                                            type="button"
                                            className={'gen-chip' + (o.moves.includes(lm.move.Name) ? ' on' : '')}
                                            aria-pressed={o.moves.includes(lm.move.Name)}
                                            title={lm.move.Type + ' · ' + lm.learned}
                                            onClick={() => setOpt({ moves: toggleIn(o.moves, lm.move.Name) })}
                                        >
                                            {lm.move.Name}<small>{lm.learned}</small>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="gen-chip-group">
                        <span className="gen-chip-title">Points</span>
                        <label className="set-check" title="Attributes and specialties the moves roll with get the points first">
                            <input
                                type="checkbox" id="gen-bias-moves"
                                checked={!!o.biasMoves}
                                onChange={(e) => setOpt({ biasMoves: e.currentTarget.checked })}
                            />
                            Lean toward what its moves use
                        </label>
                        <div className="set-row">
                            <label htmlFor="gen-bias">Lean</label>
                            <input
                                type="range" id="gen-bias" min={0} max={100} step={5}
                                value={o.bias}
                                onChange={(e) => setOpt({ bias: Number(e.currentTarget.value) })}
                                title="0: every point lands anywhere. 100: only where the moves and the favoured list point."
                            />
                            <span className="gen-pct">{o.bias}%</span>
                        </div>
                        <div className="gen-hint">
                            Favour, regardless of the moves{o.favour.length > 0 && (
                                <button type="button" className="gen-link" onClick={() => setOpt({ favour: [] })}>
                                    clear
                                </button>
                            )}
                        </div>
                        {favourGroup('Attributes', ATTRIBUTE_KEYS, STAT_LABELS)}
                        {favourGroup('Social', SOCIAL_KEYS, STAT_LABELS)}
                        {favourGroup('Specialties', SPECIALTY_KEYS, SPECIALTY_LABELS)}
                    </div>
                    </div>
                </div>

                {notes.length > 0 && (
                    <div className="set-warn" id="gen-notes">
                        {notes.map((n, i) => <div key={i}>{n}</div>)}
                    </div>
                )}

                <div id="gen-list" className="gen-list">
                    {!state.generated.length ? (
                        <div className="empty-note">Nothing rolled yet.</div>
                    ) : state.generated.map((w) => (
                        <GenCard
                            key={w.gid}
                            wild={w}
                            dex={dexById(w.dexId)}
                            onKeep={() => keep(w)}
                            onReroll={() => reroll(w)}
                            onDownload={() => { const d = dexById(w.dexId); if (d) downloadWild(d, w.sheet); }}
                            onDiscard={() => discard(w)}
                        />
                    ))}
                </div>
            </div>
        </Panel>
    );
}

/** What is pinned, for the collapsed options row: "Charmander · Standard" or
    "Cave · Fire · Dual", or "everything random". */
function summarize(o: GmGenOpts, chosen: PokedexEntry | null): string {
    const bits: string[] = [];
    if (chosen) bits.push(chosen.Name);
    else {
        if (o.habitat) bits.push(HABITATS.find((h) => h.key === o.habitat)?.label || o.habitat);
        if (o.type || (o.type2 && o.typeMode !== 'single')) {
            bits.push([o.type, o.typeMode !== 'single' ? o.type2 : ''].filter(Boolean).join(' + '));
        }
        if (o.typeMode !== 'any') bits.push(o.typeMode === 'single' ? 'single type' : 'dual type');
        const st = askedStages(o.stages);
        if (st.length) bits.push(st.join(' or ') + ' stage');
    }
    if (o.rank === 'range') bits.push(o.rankFrom + '–' + o.rankTo);
    else if (o.rank) bits.push(o.rank);
    if (o.moves.length) bits.push(o.moves.length + ' move' + (o.moves.length === 1 ? '' : 's') + ' pinned');
    return bits.length ? bits.join(' · ') : 'everything random';
}

/* One rolled Pokémon, with everything the roll decided on show. The stats
   name the species' base and, where the rank's points landed, the +n on top
   — the arithmetic the sheet will show is the sum. */
function GenCard({ wild, dex, onKeep, onReroll, onDownload, onDiscard }: {
    wild: GmWild;
    dex: PokedexEntry | null;
    onKeep: () => void;
    onReroll: () => void;
    onDownload: () => void;
    onDiscard: () => void;
}) {
    const { data } = useAppData();
    const sheet = wild.sheet;
    const trained = sheet.trainedStats || {};
    const gender = sheet.gender === 'M' ? 'fa-mars' : sheet.gender === 'F' ? 'fa-venus' : 'fa-genderless';
    const genderTitle = sheet.gender === 'M' ? 'Male' : sheet.gender === 'F' ? 'Female' : 'No gender';
    const moves = sheet.pinnedMoves || [];
    const moveType = (name: string) => data.moves.find((m) => m.Name === name)?.Type || '';
    const specs = SPECIALTY_KEYS.filter((k) => (sheet.skills[k] || 0) > 0);
    const habitats = dex ? habitatsOf(dex).map((k) => HABITATS.find((h) => h.key === k)?.label || k) : [];

    const stat = (k: string, label: string) => {
        const plus = trained[k] || 0;
        return (
            <span className="gen-stat" key={k} title={STAT_LABELS[k] || k}>
                <span className="gen-stat-k">{label}</span>
                <span className="gen-stat-v">{monStat(dex, sheet, k)}</span>
                {plus > 0 && <span className="gen-stat-plus">+{plus}</span>}
            </span>
        );
    };

    return (
        <div className="gen-card">
            <div className="gen-head">
                <GmSprite dex={dex} dexId={wild.dexId} sheet={sheet} className="mon-sprite" />
                <div className="gen-title">
                    <div className="gen-name-line">
                        <span className="name-text">{dex ? dex.Name : wild.dexId}</span>
                        <span className="trainer-rank">{sheet.rank}</span>
                        <TypeChips p={dex} />
                    </div>
                    <div className="gen-line">
                        <i className={'fa-solid ' + gender + ' g-icon'} title={genderTitle}></i>
                        {sheet.nature && <span title="Nature">{sheet.nature}</span>}
                        {sheet.abilityInUse && <span title="Ability">{sheet.abilityInUse}</span>}
                        <span title="Held item" className={sheet.heldItem ? '' : 'gen-dim'}>
                            <i className="fa-solid fa-hand-holding"></i> {sheet.heldItem || 'nothing'}
                        </span>
                    </div>
                </div>
                <div className="gen-actions">
                    <button className="icon-btn accent" title="Keep: put it on the roster as a wild" onClick={onKeep}>
                        <i className="fa-solid fa-check"></i>
                    </button>
                    <button className="icon-btn" title="Reroll this species at this rank" onClick={onReroll}>
                        <i className="fa-solid fa-rotate"></i>
                    </button>
                    <button className="icon-btn" title="Download as a wild-Pokémon .json" onClick={onDownload}>
                        <i className="fa-solid fa-download"></i>
                    </button>
                    <button className="icon-btn danger" title="Discard" onClick={onDiscard}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div className="gen-stats">
                {stat('strength', 'STR')}
                {stat('dexterity', 'DEX')}
                {stat('vitality', 'VIT')}
                {stat('special', 'SPE')}
                {stat('insight', 'INS')}
                <span className="gen-stat gen-pool" title="HP">
                    <span className="gen-stat-k">HP</span>
                    <span className="gen-stat-v">{monPoolMax(dex, sheet, 'hp')}</span>
                </span>
                <span className="gen-stat gen-pool" title="Will">
                    <span className="gen-stat-k">WILL</span>
                    <span className="gen-stat-v">{monPoolMax(dex, sheet, 'will')}</span>
                </span>
            </div>
            <div className="gen-stats gen-social">
                {stat('tough', 'TOU')}
                {stat('cool', 'COO')}
                {stat('beauty', 'BEA')}
                {stat('cute', 'CUT')}
                {stat('clever', 'CLE')}
            </div>
            <div className="gen-specs">
                {specs.length ? specs.map((k) => (
                    <span className="gen-spec" key={k}>
                        {SPECIALTY_LABELS[k]} <b>{sheet.skills[k]}</b>
                    </span>
                )) : <span className="gen-dim">No specialties</span>}
            </div>
            <div className="gen-chips gen-moves">
                {moves.map((m) => (
                    <span className="gen-move" key={m} title={moveType(m)}>{m}</span>
                ))}
            </div>
            {habitats.length > 0 && (
                <div className="gen-habitats" title="Where this species can be met">
                    <i className="fa-solid fa-location-dot"></i> {habitats.join(' · ')}
                </div>
            )}
        </div>
    );
}

/* The species field: type a name, pick from the matches. A text field with
   the same themed dropdown the folder picker draws — in a portal, because the
   panel body clips its overflow and a list of twelve rows would be cut at the
   panel's edge. Cleared, it reads "Random", which is what it means. */
function SpeciesField({ value, onPick }: { value: string; onPick: (id: string) => void }) {
    const { data } = useAppData();
    const chosen = value ? data.pokemon.find((p) => p._id === value) || null : null;
    const [draft, setDraft] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const text = draft ?? (chosen ? chosen.Name : '');
    const q = text.trim().toLowerCase();
    /* Megas are not wilds and the egg is not a species; neither is offered.
       Names that START with what was typed come first — "char" wants
       Charmander before Pecharunt — and dex order settles the rest. */
    const matches = q
        ? data.pokemon
            .filter((p) => p.Number > 0 && !isMegaForm(p) && p.Name.toLowerCase().includes(q))
            .sort((a, b) => Number(b.Name.toLowerCase().startsWith(q)) - Number(a.Name.toLowerCase().startsWith(q)))
            .slice(0, 12)
        : [];
    const showing = open && matches.length > 0;

    const pick = (p: PokedexEntry) => {
        onPick(p._id);
        setDraft(null);
        setOpen(false);
    };

    /* Under the field, as wide as the field, clamped to the viewport, and
       re-placed when the panel under it scrolls. */
    useLayoutEffect(() => {
        if (!showing) return;
        const el = menuRef.current;
        const input = inputRef.current;
        if (!el || !input) return;
        const place = () => {
            const r = input.getBoundingClientRect();
            const w = Math.max(r.width, 220);
            const h = el.offsetHeight;
            let left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
            let top = r.bottom + 4;
            if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            el.style.width = w + 'px';
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [showing, matches.length]);

    useEffect(() => { setActive(0); }, [q]);

    const onKey = (e: React.KeyboardEvent) => {
        if (!showing) {
            if (e.key === 'Escape') { setDraft(null); (e.currentTarget as HTMLInputElement).blur(); }
            return;
        }
        const n = matches.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % n); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i + n - 1) % n); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(matches[Math.min(active, n - 1)]); }
        else if (e.key === 'Escape') { e.preventDefault(); setDraft(null); setOpen(false); }
    };

    return (
        <div className="gen-species">
            <input
                ref={inputRef}
                type="text"
                id="gen-species"
                placeholder="Random"
                value={text}
                autoComplete="off"
                onChange={(e) => { setDraft(e.currentTarget.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKey}
                /* A name that matches nothing goes back to what was chosen: the
                   field never holds a species the roll would not use. */
                onBlur={() => { setDraft(null); setOpen(false); }}
            />
            {chosen && (
                <button
                    type="button"
                    className="icon-btn gen-species-clear"
                    title="Back to a random species"
                    onClick={() => { onPick(''); setDraft(null); }}
                >
                    <i className="fa-solid fa-xmark"></i>
                </button>
            )}
            {showing && createPortal(
                <div ref={menuRef} className="folder-menu gen-species-menu" role="listbox">
                    {matches.map((p, i) => (
                        <button
                            key={p.Image}
                            type="button"
                            role="option"
                            aria-selected={p._id === value}
                            className={'folder-menu-item' + (i === active ? ' active' : '') + (p._id === value ? ' on' : '')}
                            onMouseEnter={() => setActive(i)}
                            /* mousedown, not click: the field's blur would close
                               the list before a click ever landed. */
                            onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                        >
                            <GmSprite dex={p} dexId={p._id} className="gen-pick-sprite" />
                            <span className="fname">{p.Name}</span>
                            <TypeChips p={p} />
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
}

/* A type picker drawn by the page: a native <select> cannot put an icon
   beside an option, and the type chips are what the roster and the species
   list already use to say "Fire" at a glance. Same box as the folder menu,
   in a portal, under the button. */
function TypeSelect({ id, value, types, disabled, title, onPick }: {
    id: string;
    value: string;
    types: string[];
    disabled?: boolean;
    title?: string;
    onPick: (t: string) => void;
}) {
    const choices = ['', ...types];
    const chosen = Math.max(0, choices.indexOf(value));
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(chosen);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = (refocus = true) => {
        setOpen(false);
        if (refocus) btnRef.current?.focus();
    };
    const pick = (t: string) => { onPick(t); close(); };

    useLayoutEffect(() => {
        if (!open) return;
        const el = menuRef.current;
        const btn = btnRef.current;
        if (!el || !btn) return;
        const place = () => {
            const r = btn.getBoundingClientRect();
            const w = Math.max(el.offsetWidth, r.width);
            const h = el.offsetHeight;
            const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
            let top = r.bottom + 4;
            if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            el.style.minWidth = r.width + 'px';
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        setActive(chosen);
        menuRef.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && t.closest && (t.closest('.gen-type-menu') || t === btnRef.current || btnRef.current?.contains(t))) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const onKey = (e: React.KeyboardEvent) => {
        const n = choices.length;
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % n); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i + n - 1) % n); return; }
        if (e.key === 'Home') { e.preventDefault(); setActive(0); return; }
        if (e.key === 'End') { e.preventDefault(); setActive(n - 1); return; }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(choices[active]); }
    };

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                id={id}
                className={'gen-type-btn' + (open ? ' on' : '') + (value ? '' : ' random')}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                title={title}
                onClick={() => setOpen((v) => !v)}
            >
                <TypeGlyph type={value} />
                <span className="fname">{value || 'Random'}</span>
                <i className="fa-solid fa-caret-down gen-type-caret"></i>
            </button>
            {open && createPortal(
                <div
                    ref={menuRef}
                    className="folder-menu gen-type-menu"
                    role="listbox"
                    tabIndex={-1}
                    aria-label={title || 'Type'}
                    onKeyDown={onKey}
                >
                    {choices.map((t, i) => (
                        <button
                            key={t || '__random'}
                            type="button"
                            role="option"
                            aria-selected={i === chosen}
                            className={'folder-menu-item'
                                + (i === active ? ' active' : '')
                                + (i === chosen ? ' on' : '')
                                + (t ? '' : ' folder-menu-none')}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => pick(t)}
                        >
                            <TypeGlyph type={t} />
                            <span className="fname">{t || 'Random'}</span>
                            {i === chosen && <i className="fa-solid fa-check tick"></i>}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}

/** One type's chip — the roster's, for a type named rather than read off a
    species — or a die for "random". */
function TypeGlyph({ type }: { type: string }) {
    if (!type) return <span className="type-chip gen-type-dice"><i className="fa-solid fa-dice"></i></span>;
    const c = typeColors[type] || '#e5e7eb';
    return (
        <span
            className="type-chip"
            style={{ background: c + '33', borderColor: c, color: mixHex(c, '#ffffff', 0.55) }}
        >
            <i className={'fa-solid ' + (TYPE_ICONS[type] || 'fa-circle-question')}></i>
        </span>
    );
}

function escapeHtml(str: string): string {
    return str.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c] as string);
}
