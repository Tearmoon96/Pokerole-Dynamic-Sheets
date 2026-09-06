/* The dice roller.

   Pokerole pools are d6 where 4-6 is a success, so d6 rolls also report
   successes; other dice just show faces and total. */

export interface RollEntry {
    label: string;
    vals: number[];
    total: number;
    /** Raw successes, null for anything that is not d6. */
    succ: number | null;
    /** Successes after pain. */
    net: number | null;
    t: number;
    who?: string;
    what?: string;
    /** The target number an accuracy roll was made against. */
    need?: number | null;
    pain?: number;
    verdict?: string;
    /** Carried so a hit can roll the damage in one more click. */
    dmg?: { token: string; mi: number; dice: number } | null;
}

export type RollMeta = Partial<Omit<RollEntry, 'label' | 'vals' | 'total' | 'succ' | 'net' | 't'>>;

export const VERDICTS: Record<string, { label: string; cls: string; icon: string }> = {
    crit: { label: 'Critical hit', cls: 'crit', icon: 'fa-burst' },
    hit: { label: 'Hit', cls: 'win', icon: 'fa-check' },
    miss: { label: 'Miss', cls: 'lose', icon: 'fa-xmark' },
    fumble: { label: 'Critical failure', cls: 'fumble', icon: 'fa-skull' },
};

export function accuracyVerdict(succ: number, need: number, critMargin: number): string {
    if (succ >= need + critMargin) return 'crit';
    if (succ <= need - critMargin) return 'fumble';
    return succ >= need ? 'hit' : 'miss';
}

/** Roll `count` dice of `sides`, and work out what it means. */
export function roll(count: number, sides: number, meta: RollMeta, critMargin: number): RollEntry {
    const vals = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = vals.reduce((a, b) => a + b, 0);
    const succ = sides === 6 ? vals.filter((v) => v >= 4).length : null;
    const entry: RollEntry = Object.assign(
        { label: count + 'd' + sides, vals, total, succ, net: null as number | null, t: Date.now() },
        meta);
    /* Pain comes off the successes, not the pool: the dice are all rolled, then
       the weakest of the ones that landed are struck out. `succ` stays the raw
       count — the ailment rolls read it and are not subject to pain — and `net`
       is what actually counts. */
    entry.net = succ == null ? null : Math.max(0, succ - (entry.pain || 0));
    /* An Accuracy roll made against a target number carries its verdict with it,
       so the history still reads as a hit or a miss later. */
    if (entry.need != null && succ != null) {
        entry.verdict = accuracyVerdict(entry.net!, entry.need, critMargin);
    }
    return entry;
}

/** Which dice the pain penalty strikes out. The weakest successes go first — a 4
    before a 5 before a 6 — so the same roll always strikes the same dice and the
    result can be checked by eye. Worked out from the faces rather than stored,
    so an old history entry renders too. */
export function painStruck(vals: number[] | undefined, pain: number | undefined): Set<number> {
    const out = new Set<number>();
    if (!pain || !vals) return out;
    vals.map((v, i) => ({ v, i }))
        .filter((x) => x.v >= 4)
        .sort((a, b) => a.v - b.v || a.i - b.i)
        .slice(0, pain)
        .forEach((x) => out.add(x.i));
    return out;
}

export const HISTORY_LIMIT = 30;
