import { defaultCardSheet } from '../card/defaults';
import { isMegaForm } from '../card/evolution';
import { RANKS, RANK_BUDGET, asRank, rankIndex } from '../lib/ranks';
import { inHabitat } from './habitats';
import { monPoolMax } from './pools';
import type { AppData, ItemEntry, MoveEntry, PokedexEntry, PokemonEvolution } from '../data/types';
import type { CardSheet, CardSkills, Gender } from '../card/types';
import type { Rank, RankBudget } from '../lib/ranks';

/* The random Pokémon generator.

   Pure: (dataset, settings, a random source) in, a wild sheet out. Nothing
   here touches the store or the DOM, so `.verify/generator-test.mjs` can run
   it thousands of times and check every sheet against the rank table.

   The order of the steps is the one thing that is not obvious, and it is
   forced: the points are spent AFTER every move is known, because the points
   lean toward what the moves roll — and the move count is Insight + 2, which
   the points can raise. So the two are settled together: draw moves for the
   Insight in hand, spend the points from scratch with those moves in view,
   and if the Insight that came out opens more slots, draw those and spend
   again — until the count and the Insight agree (see `settleMovesAndPoints`). */

export interface GmGenOpts {
    /** A dex `_id`, or '' for a random species. */
    species: string;
    /** One of RANKS; '' for any rank at random; 'range' for a random rank
        between rankFrom and rankTo. The rank is a property of the ENCOUNTER,
        not of the species: any Pokémon can be met at any rank, and the rank
        decides only how many points it has and which of its moves it can
        know. */
    rank: string;
    rankFrom: string;
    rankTo: string;
    /** A habitat key, or '' for anywhere. Only consulted for a random species. */
    habitat: string;
    /** Types the species must have, or '' for any; both set means both, in
        either slot. Random species only. */
    type: string;
    type2: string;
    /** 'any', or 'single' for one type only, 'dual' for two. Random species only. */
    typeMode: string;
    /** Whether the Legendary species are in the random pool at all. */
    legendaries: boolean;
    /** Whether the Ultra Beasts — Nihilego to Blacephalon — are. */
    ultraBeasts: boolean;
    /** Whether the Mythical species — Mew, Celebi, Jirachi and the rest of
        the event-only ones — are in the random pool. */
    mythicals: boolean;
    /** Whether the Paradox Pokémon — the past and future ones out of Area
        Zero — are in the random pool. Off, a time paradox never walks in. */
    paradox: boolean;
    /** The stages of its line a random species may be at: any of 'first'
        (nothing before it), 'second' (the second stage of its line) and
        'final' (evolves no further). Empty, or all three, means any. */
    stages: string[];
    /** '' one of the species' standard abilities; 'hidden' the hidden one
        allowed too; anything else is an ability by name. */
    ability: string;
    /** 'random', or the sheet's own '' | 'M' | 'F'. */
    gender: string;
    /** A nature name, or '' for random. */
    nature: string;
    /** Chance in percent that the Pokémon holds anything at all. */
    itemChance: number;
    /** An item name, or '' for the one that boosts its own type. */
    item: string;
    /** Moves that must be among the ones it knows. Only meaningful with a
        fixed species; a name its learnset lacks, or one above its rank, is
        dropped and reported. */
    moves: string[];
    /** 'random' takes the learnset as it comes; 'ratio' aims `attackShare`
        percent of the known moves at attacks, the rest at support. */
    moveMix: string;
    /** 0..100: what share of the moves are attacks, when moveMix is 'ratio'. */
    attackShare: number;
    /** Whether the points lean toward what the chosen moves roll. */
    biasMoves: boolean;
    /** Stat and specialty keys to lean toward regardless of the moves. */
    favour: string[];
    /** How hard the lean is, 0..100. At 0 every point is a coin toss; at 100
        nothing goes anywhere the moves (or the favour list) do not point. */
    bias: number;
}

export const DEFAULT_GEN_OPTS: GmGenOpts = {
    species: '', rank: '', rankFrom: 'Rookie', rankTo: 'Advanced', habitat: '', type: '', type2: '',
    typeMode: 'any', legendaries: false, ultraBeasts: false, mythicals: false, paradox: false, stages: [],
    ability: '', gender: 'random', nature: '', itemChance: 25, item: '', moves: [],
    moveMix: 'random', attackShare: 60, biasMoves: true, favour: [], bias: 60,
};

export const ATTRIBUTE_KEYS = ['strength', 'dexterity', 'vitality', 'special', 'insight'] as const;
export const SOCIAL_KEYS = ['tough', 'cool', 'beauty', 'cute', 'clever'] as const;
export const SPECIALTY_KEYS: (keyof CardSkills)[] = [
    'brawl', 'channel', 'clash', 'evasion',
    'alert', 'athletic', 'nature', 'stealth',
    'charm', 'empathy', 'intimidate', 'perform',
    'craft', 'etiquette', 'medicine', 'science',
];

/** The classic one-die boost for each type, spelled as the item list has it.
    Fairy's is "Fairy Wings" in this dataset, not the games' Fairy Feather. */
export const TYPE_ITEMS: Record<string, string> = {
    Normal: 'Silk Scarf', Fire: 'Charcoal', Water: 'Mystic Water', Grass: 'Miracle Seed',
    Electric: 'Magnet', Ice: 'Never-Melt Ice', Fighting: 'Black Belt', Poison: 'Poison Barb',
    Ground: 'Soft Sand', Flying: 'Sharp Beak', Psychic: 'Twisted Spoon', Bug: 'Silver Powder',
    Rock: 'Hard Stone', Ghost: 'Spell Tag', Dragon: 'Dragon Fang', Dark: 'Black Glasses',
    Steel: 'Metal Coat', Fairy: 'Fairy Wings',
};

export type Rng = () => number;

/** How many rolls a species sits out after it comes up. Twenty encounters
    without the same Rattata twice; keyed by dex number, so a regional form
    counts as the same Pokémon. */
export const RECENT_ROLLS = 20;

export interface GenResult {
    dex: PokedexEntry;
    sheet: CardSheet;
    rank: Rank;
    /** The moves it knows, in the order they were picked. */
    moves: string[];
    /** Anything the settings asked for that could not be honoured. */
    notes: string[];
}

/* ---- Random helpers ---- */

function pick<T>(arr: T[], rnd: Rng): T {
    return arr[Math.floor(rnd() * arr.length)];
}

/** One key drawn in proportion to its weight; uniform when every weight is 0,
    so a fully biased spend can still place a point once its targets are full. */
function weightedPick<T>(items: T[], weight: (x: T) => number, rnd: Rng): T {
    const ws = items.map((x) => Math.max(0, weight(x)));
    const total = ws.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return pick(items, rnd);
    let r = rnd() * total;
    for (let i = 0; i < items.length; i++) {
        r -= ws[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
}

/* ---- The species pool ---- */

/* Forms a Pokémon takes DURING a battle rather than ones you meet: Aegislash
   drawn, Palafin after its swap, Eiscue with the ice knocked off, Wishiwashi
   schooling, Darmanitan in Zen, Cramorant mid-swallow, the Primal and Crowned
   and Eternamax and Ultra Burst states, the Calyrex riders, Minior's bare
   core. A wild is met in its resting form; these stay pinnable by name. */
const BATTLE_FORM = /(battle-bond|hero-form|blade-form|swarm-form|zen-form|no-ice-form|gorging-form|gulping-form|primal-form|eternamax|crown-form|ultra-burst|ice-rider|shadow-rider|unbound-form|terastal-form|stellar-form)/;

export function isBattleForm(p: PokedexEntry): boolean {
    return BATTLE_FORM.test(p._id) || p.Name === 'Minior Core';
}

/* The four tiers of "not an ordinary wild", by dex number — a form shares
   its base's number. They are listed here rather than read off the dex's
   `Legendary` flag because that flag is one bit for all of them and has
   gaps: it is unset on Type: Null, Silvally, Cosmog, Kubfu and Terapagos,
   on Phione, Meltan and Melmetal, and on Poipole. The card and the pickers
   still show the flag; only the generator's boxes go by these. */

/** The Legendaries, every generation's: the birds and Mewtwo; the beasts,
    Lugia and Ho-Oh; the Regis, the Eon duo and the weather trio; the lake
    trio, the creation trio, Heatran, Regigigas and Cresselia; the swords of
    justice, the forces of nature, the Tao trio; the aura trio; Type: Null and
    Silvally, the Tapus, the Cosmog line and Necrozma; the Galar heroes,
    Eternatus, the Kubfu line, the new Regis, the Calyrex steeds, Enamorus;
    the treasures of ruin, the loyal three, Ogerpon and Terapagos. Koraidon
    and Miraidon are Legendary too, but they are Paradox Pokémon first and
    are behind that box alone, so one tick brings them. */
export const LEGENDARY_NUMBERS: ReadonlySet<number> = new Set([
    144, 145, 146, 150,
    243, 244, 245, 249, 250,
    377, 378, 379, 380, 381, 382, 383, 384,
    480, 481, 482, 483, 484, 485, 486, 487, 488,
    638, 639, 640, 641, 642, 643, 644, 645, 646,
    716, 717, 718,
    772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800,
    888, 889, 890, 891, 892, 894, 895, 896, 897, 898, 905,
    1001, 1002, 1003, 1004, 1014, 1015, 1016, 1017, 1024,
]);

/** The eleven Ultra Beasts: the seven of Sun and Moon, Poipole and
    Naganadel, Stakataka and Blacephalon. */
export const ULTRA_BEAST_NUMBERS: ReadonlySet<number> = new Set([
    793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806,
]);

/** The Mythicals: the event-only ones, Mew to Pecharunt. */
export const MYTHICAL_NUMBERS: ReadonlySet<number> = new Set([
    151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649,
    719, 720, 721, 801, 802, 807, 808, 809, 893, 1025,
]);

export function isLegendary(p: PokedexEntry): boolean {
    return LEGENDARY_NUMBERS.has(p.Number);
}

export function isMythical(p: PokedexEntry): boolean {
    return MYTHICAL_NUMBERS.has(p.Number);
}

export function isUltraBeast(p: PokedexEntry): boolean {
    return ULTRA_BEAST_NUMBERS.has(p.Number);
}

/** The Paradox Pokémon, which the dex files under their own category —
    Koraidon and Miraidon included. */
export function isParadox(p: PokedexEntry): boolean {
    return p.DexCategory === 'Paradox Pokémon';
}

/* Where a species stands in its evolutionary line, read off the dex's
   Evolutions: `From` entries are what it evolved from, `To` entries what it
   evolves into. Megas and form changes (Rotom's appliances, Deoxys) are not
   stages of a line and are skipped. */
const isStageStep = (e: { Kind?: string }) => e.Kind !== 'Mega' && e.Kind !== 'Form';

/** 1 for a species with nothing before it, 2 for one with a single
    pre-evolution, 3 for the third stage. Follows `From` by name; a name the
    dex cannot resolve (Floette's "Flabebe") ends the walk there. */
export function evoStage(data: AppData, p: PokedexEntry): number {
    let depth = 1;
    let cur: PokedexEntry | undefined = p;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.Name)) {
        seen.add(cur.Name);
        const from: PokemonEvolution | undefined = (cur.Evolutions || []).find((e) => e.From && isStageStep(e));
        if (!from) break;
        depth++;
        cur = data.pokemon.find((x: PokedexEntry) => x.Name === from.From);
    }
    return depth;
}

/** Whether the species evolves into anything (a Mega or a form change is
    not an evolution here). */
export function evolvesFurther(p: PokedexEntry): boolean {
    return (p.Evolutions || []).some((e) => e.To && isStageStep(e));
}

export const STAGE_KEYS = ['first', 'second', 'final'] as const;

/** Does the species stand at any of these stages? A species that never
    evolves is both a first stage and a final one; 'second' is the second
    stage of its line whether or not there is a third after it. No stage
    asked for — or all three, which is the same question — is a yes. */
export function inStage(data: AppData, p: PokedexEntry, stages: readonly string[]): boolean {
    const asked = STAGE_KEYS.filter((k) => stages.includes(k));
    if (!asked.length || asked.length === STAGE_KEYS.length) return true;
    return asked.some((stage) =>
        stage === 'first' ? evoStage(data, p) === 1
        : stage === 'second' ? evoStage(data, p) === 2
        : !evolvesFurther(p));
}

/** Everything a wild could be: no egg, no Mega or battle-only form (a state
    of a creature, not a creature), Legendaries, Ultra Beasts, Mythicals and
    Paradox Pokémon only on request, and whatever the habitat, type and stage
    settings leave. */
export function speciesPool(
    data: AppData,
    opts: Pick<GmGenOpts, 'legendaries' | 'ultraBeasts' | 'mythicals' | 'paradox' | 'habitat' | 'type' | 'type2' | 'typeMode' | 'stages'>,
): PokedexEntry[] {
    /* Either slot answers to either asked-for type: "Fire + Flying" is
       Charizard whichever way round the dex lists them. */
    const asked = [opts.type, opts.type2].map((t) => String(t || '').toLowerCase()).filter(Boolean);
    const hasType = (p: PokedexEntry, t: string) => p.Type1.toLowerCase() === t || p.Type2.toLowerCase() === t;
    return data.pokemon.filter((p) =>
        p.Number > 0
        && !isMegaForm(p)
        && !isBattleForm(p)
        && (opts.legendaries || !isLegendary(p))
        && (opts.ultraBeasts || !isUltraBeast(p))
        && (opts.mythicals || !isMythical(p))
        && (opts.paradox || !isParadox(p))
        && (!opts.habitat || inHabitat(p, opts.habitat))
        && inStage(data, p, opts.stages)
        && asked.every((t) => hasType(p, t))
        && (opts.typeMode === 'single' ? !p.Type2 : opts.typeMode === 'dual' ? !!p.Type2 : true));
}

/** The rank the settings ask for: the one named, or one drawn flat from the
    range — every rank in it as likely as the next — or from all eight. */
export function rollRank(opts: Pick<GmGenOpts, 'rank' | 'rankFrom' | 'rankTo'>, rnd: Rng): Rank {
    const fixed = asRank(opts.rank);
    if (fixed) return fixed;
    let lo = 0, hi = RANKS.length - 1;
    if (opts.rank === 'range') {
        const a = rankIndex(opts.rankFrom), b = rankIndex(opts.rankTo);
        if (a >= 0 && b >= 0) { lo = Math.min(a, b); hi = Math.max(a, b); }
        else if (a >= 0) lo = hi = a;
        else if (b >= 0) lo = hi = b;
    }
    return RANKS[lo + Math.floor(rnd() * (hi - lo + 1))];
}

/** The pool minus the last RECENT_ROLLS rolls — unless that would empty it,
    when fewer than twenty species match the settings at all, and a repeat
    beats refusing to roll. */
function withoutRecent(pool: PokedexEntry[], recent: number[]): PokedexEntry[] {
    if (!recent.length) return pool;
    const rest = pool.filter((p) => !recent.includes(p.Number));
    return rest.length ? rest : pool;
}

/* ---- Moves ---- */

export interface LearnedMove { move: MoveEntry; learned: string }

/** The species' learnset resolved against the move list, with each move's
    rank kept beside it. Unknown names — a learnset entry the move list lacks
    — are dropped. */
export function learnset(data: AppData, p: PokedexEntry): LearnedMove[] {
    const byName = new Map(data.moves.map((m) => [m.Name, m]));
    const out: LearnedMove[] = [];
    const seen = new Set<string>();
    (p.Moves || []).forEach((lm) => {
        const move = lm.Name ? byName.get(lm.Name) : undefined;
        if (!move || seen.has(move.Name)) return;
        seen.add(move.Name);
        out.push({ move, learned: lm.Learned || '' });
    });
    return out;
}

/** The part of the learnset a Pokémon of this rank may know. */
export function learnsetUpTo(data: AppData, p: PokedexEntry, rank: Rank): LearnedMove[] {
    const ri = rankIndex(rank);
    return learnset(data, p).filter((lm) => {
        const li = rankIndex(lm.learned);
        return li >= 0 && li <= ri;
    });
}

/** How many moves a Pokémon knows: Insight + 2. */
export function moveSlots(insight: number): number {
    return Math.max(1, insight + 2);
}

/** An attack is a move that deals damage — it has a Power or a damage pool.
    Everything else is support. The dataset's Category is not used for this:
    "Physical/Special" and "Support/Physical/Special" both exist, and a move's
    damage fields are what actually decide whether it hits for anything. */
export function isAttack(m: MoveEntry): boolean {
    return (m.Power || 0) > 0 || !!m.Damage1 || !!m.Damage2;
}

/** `count` more moves from `available`, none already in `have`. The rank a
    move was learned at is its weight, plus one — a Standard Pokémon should
    mostly be running Standard and Rookie moves, not four Starter ones.

    With a mix set, `attackTarget` is how many attacks the whole set should
    hold: each slot is drawn from the attack or the support half depending on
    which is behind its share, and from the other half only when its own is
    empty — a species with two support moves to its name cannot be made to
    run four. */
function drawMoves(
    available: LearnedMove[], have: string[], count: number, rnd: Rng,
    attackTarget: number | null = null,
): string[] {
    const chosen = have.slice();
    let left = available.filter((lm) => !chosen.includes(lm.move.Name));
    const byName = new Map(available.map((lm) => [lm.move.Name, lm.move]));
    const weight = (x: LearnedMove) => 1 + Math.max(0, rankIndex(x.learned));
    for (let i = 0; i < count && left.length; i++) {
        let from = left;
        if (attackTarget !== null) {
            const total = have.length + count;
            const attacks = chosen.filter((n) => { const m = byName.get(n); return m && isAttack(m); }).length;
            const supports = chosen.length - attacks;
            const needA = attackTarget - attacks;
            const needS = (total - attackTarget) - supports;
            /* The half that is further behind its share gets this slot. */
            let wantAttack: boolean;
            if (needA <= 0) wantAttack = false;
            else if (needS <= 0) wantAttack = true;
            else wantAttack = needA / attackTarget >= needS / (total - attackTarget);
            const half = left.filter((lm) => isAttack(lm.move) === wantAttack);
            if (half.length) from = half;
        }
        const lm = weightedPick(from, weight, rnd);
        chosen.push(lm.move.Name);
        left = left.filter((x) => x !== lm);
    }
    return chosen;
}

/** One pool field's tokens, lower-cased: "Tough/Cute" is two. */
function fieldTokens(field: string | undefined): string[] {
    return String(field || '').split('/').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

/** The four pool fields a move rolls with. */
function poolFields(m: MoveEntry): (string | undefined)[] {
    return [m.Accuracy1, m.Accuracy2, m.Damage1, m.Damage2];
}

/* ---- Bias ---- */

/** How often each stat and specialty appears in the pools these moves roll,
    scaled so the most-used one is 1. "Tough/Cute" alternatives split the
    credit; tokens that are not a stat or specialty (Will, SameAsBaseMove,
    Varies) count for nothing. */
export function moveWeights(moves: MoveEntry[]): Record<string, number> {
    const counts: Record<string, number> = {};
    const known = new Set<string>([...ATTRIBUTE_KEYS, ...SOCIAL_KEYS, ...SPECIALTY_KEYS]);
    moves.forEach((m) => {
        poolFields(m).forEach((field) => {
            const hits = fieldTokens(field).filter((t) => known.has(t));
            hits.forEach((t) => { counts[t] = (counts[t] || 0) + 1 / hits.length; });
        });
    });
    const max = Math.max(0, ...Object.values(counts));
    const out: Record<string, number> = {};
    if (max > 0) Object.keys(counts).forEach((k) => { out[k] = counts[k] / max; });
    return out;
}

/** The lean for one key, 0..1, from the moves and the favour list together. */
function leanOf(key: string, weights: Record<string, number>, opts: GmGenOpts): number {
    const fromMoves = opts.biasMoves ? (weights[key] || 0) : 0;
    const favoured = opts.favour.includes(key) ? 1 : 0;
    return Math.max(fromMoves, favoured);
}

/** A point's weight for a key. `b` is the bias 0..1: the flat share shrinks
    as it rises and the lean's share grows, and the 4 is what makes 100% mean
    "nowhere else" — a key with no lean is at 0 there, not merely unlikely. */
function pointWeight(lean: number, b: number): number {
    return (1 - b) + b * 4 * lean;
}

/** Spend `points` one at a time over `keys`, never past `cap`, into `into`. */
function spend(
    points: number, keys: readonly string[], cap: (k: string) => number,
    into: Record<string, number>, lean: (k: string) => number, b: number, rnd: Rng,
): void {
    for (let i = 0; i < points; i++) {
        const open = keys.filter((k) => (into[k] || 0) < cap(k));
        if (!open.length) return;
        const k = weightedPick(open, (x) => pointWeight(lean(x), b), rnd);
        into[k] = (into[k] || 0) + 1;
    }
}

/* ---- The rest of the sheet ---- */

function rollGender(p: PokedexEntry, opts: GmGenOpts, rnd: Rng): Gender {
    if (opts.gender !== 'random') return (opts.gender === 'M' || opts.gender === 'F') ? opts.gender : '';
    const t = String(p.GenderType || '').toUpperCase();
    if (t === 'M') return 'M';
    if (t === 'F') return 'F';
    if (t === 'N') return '';
    return rnd() < 0.5 ? 'M' : 'F';
}

export function speciesAbilities(p: PokedexEntry, hidden: boolean): string[] {
    const out = [p.Ability1, p.Ability2].filter(Boolean);
    if (hidden && p.HiddenAbility) out.push(p.HiddenAbility);
    return out;
}

function rollAbility(p: PokedexEntry, opts: GmGenOpts, rnd: Rng): { inUse: string; custom: string } {
    if (opts.ability && opts.ability !== 'hidden') {
        const own = speciesAbilities(p, true).some((a) => a.toLowerCase() === opts.ability.toLowerCase());
        return { inUse: opts.ability, custom: own ? '' : opts.ability };
    }
    const choices = speciesAbilities(p, opts.ability === 'hidden');
    return { inUse: choices.length ? pick(choices, rnd) : '', custom: '' };
}

export function heldItemsIn(data: AppData): ItemEntry[] {
    return data.items.filter((it) => it.Pocket === 'HeldItems');
}

/** The item, or '' for empty hands. Type-matched by default: a dual type is
    a coin toss between the two, at the same overall chance. An item the list
    does not carry is not handed out. */
function rollItem(data: AppData, p: PokedexEntry, opts: GmGenOpts, rnd: Rng): string {
    const chance = Math.max(0, Math.min(100, Number(opts.itemChance) || 0));
    if (rnd() * 100 >= chance) return '';
    if (opts.item) return opts.item;
    const types = [p.Type1, p.Type2].filter((t) => t && TYPE_ITEMS[t]);
    if (!types.length) return '';
    const name = TYPE_ITEMS[pick(types, rnd)];
    return data.items.some((it) => it.Name === name) ? name : '';
}

/* ---- Moves and points, together ---- */

/** How many of `slots` moves should be attacks under the mix setting, or null
    for "as they come". */
function attackTargetFor(opts: GmGenOpts, slots: number): number | null {
    if (opts.moveMix !== 'ratio') return null;
    const share = Math.max(0, Math.min(100, Number(opts.attackShare) || 0)) / 100;
    return Math.round(slots * share);
}

/** Draw the moves, then spend the points with every move in view; if the
    Insight that came out opens more slots, draw those and spend AGAIN with
    the whole set in view — keeping only the Insight points already placed,
    since they are what opened the slots. Insight therefore never falls
    between rounds, the count catches it within the species' own maximum,
    and the points that stand were spent knowing every move. */
function settleMovesAndPoints(
    data: AppData, dex: PokedexEntry, budget: RankBudget, allowed: LearnedMove[],
    wanted: string[], opts: GmGenOpts, rnd: Rng,
): { moves: string[]; trained: Record<string, number>; social: Record<string, number>; skills: Record<string, number>; insight: number } {
    const b = Math.max(0, Math.min(1, (Number(opts.bias) || 0) / 100));
    const byName = new Map(data.moves.map((m) => [m.Name, m]));
    const maxOf = (k: string) => {
        const rec = dex as unknown as Record<string, number>;
        const cap = k.charAt(0).toUpperCase() + k.slice(1);
        return Math.max(0, (rec['Max' + cap] || 0) - (rec[cap] || 0));
    };

    /* Every pinned move is kept, even past the slot count — the GM asked for
       them by name — and only the slots left over are rolled. */
    const first = Math.max(moveSlots(dex.Insight), wanted.length);
    let moves = drawMoves(allowed, wanted, first - wanted.length, rnd, attackTargetFor(opts, first));
    let trained: Record<string, number> = {}, social: Record<string, number> = {}, skills: Record<string, number> = {};
    let insight = dex.Insight;
    let keptInsight = 0;

    for (;;) {
        const weights = moveWeights(moves.map((n) => byName.get(n)).filter((m): m is MoveEntry => !!m));
        const lean = (k: string) => leanOf(k, weights, opts);
        trained = keptInsight ? { insight: keptInsight } : {};
        social = {}; skills = {};
        spend(budget.attributes - keptInsight, ATTRIBUTE_KEYS, maxOf, trained, lean, b, rnd);
        spend(budget.social, SOCIAL_KEYS, () => 5, social, lean, b, rnd);
        spend(budget.specialties, SPECIALTY_KEYS, () => budget.specialtyMax, skills, lean, b, rnd);
        insight = dex.Insight + (trained.insight || 0);

        const need = Math.max(moveSlots(insight), wanted.length);
        if (need <= moves.length || allowed.length <= moves.length) break;
        moves = drawMoves(allowed, moves, need - moves.length, rnd, attackTargetFor(opts, need));
        keptInsight = trained.insight || 0;
    }
    return { moves, trained, social, skills, insight };
}

/* ---- The whole thing ---- */

/**
 * @param recent dex numbers of the last rolls, newest first; a random draw
 *   skips them (see RECENT_ROLLS). A pinned species is never skipped — it was
 *   asked for by name.
 */
export function generatePokemon(
    data: AppData, opts: GmGenOpts, rnd: Rng = Math.random, recent: number[] = [],
): GenResult | null {
    const notes: string[] = [];

    /* Species and rank, independently: nothing about the one narrows the
       other. */
    let dex: PokedexEntry | null = null;
    if (opts.species) {
        dex = data.pokemon.find((p) => p._id === opts.species) || null;
        if (!dex) notes.push('Species “' + opts.species + '” is not in the Pokédex; rolled one instead.');
    }
    if (!dex) {
        const pool = speciesPool(data, opts);
        if (!pool.length) return null;
        dex = pick(withoutRecent(pool, recent), rnd);
    }
    const rank = rollRank(opts, rnd);
    const budget = RANK_BUDGET[rank];

    /* Which moves it may know, and which of those the GM insisted on. */
    const allowed = learnsetUpTo(data, dex, rank);
    const wanted: string[] = [];
    opts.moves.forEach((name) => {
        if (allowed.some((lm) => lm.move.Name === name)) { if (!wanted.includes(name)) wanted.push(name); }
        else if (learnset(data, dex!).some((lm) => lm.move.Name === name)) {
            notes.push(name + ' is above ' + rank + ' rank for ' + dex!.Name + ' and was left out.');
        } else notes.push(dex!.Name + ' cannot learn ' + name + '; left out.');
    });

    const { moves, trained, social, skills, insight } = settleMovesAndPoints(data, dex, budget, allowed, wanted, opts, rnd);
    if (moves.length < moveSlots(insight)) {
        notes.push(dex.Name + ' has only ' + moves.length + ' move' + (moves.length === 1 ? '' : 's')
            + ' to learn by ' + rank + ' rank.');
    }

    /* The sheet. */
    const sheet = defaultCardSheet(dex);
    sheet.rank = rank;
    sheet.trainedStats = { ...trained, ...social };
    SPECIALTY_KEYS.forEach((k) => { sheet.skills[k] = skills[k] || 0; });
    sheet.pinnedMoves = moves.slice();
    /* Pinned + the Pinned filter is how the card says "these are the moves it
       knows": the rest of the learnset stays a filter click away. */
    sheet.activeFilters = ['Pinned'];
    sheet.gender = rollGender(dex, opts, rnd);
    const ability = rollAbility(dex, opts, rnd);
    sheet.abilityInUse = ability.inUse;
    sheet.customAbility = ability.custom;
    if (opts.nature) sheet.nature = opts.nature;
    else if (data.natures.length) sheet.nature = pick(data.natures, rnd).Name;
    sheet.heldItem = rollItem(data, dex, opts, rnd);
    /* Full pools: the sheet is a fresh creature, not one mid-fight. */
    sheet.hp = monPoolMax(dex, sheet, 'hp');
    sheet.will = monPoolMax(dex, sheet, 'will');

    return { dex, sheet, rank, moves, notes };
}
