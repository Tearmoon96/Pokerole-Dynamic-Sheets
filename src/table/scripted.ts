/* Predetermined rolls.

   A GM sometimes needs a roll to land on an outcome they have already decided —
   the ambush that is going to happen, the clue that has to be found — while it
   still looks to the table like any other roll.

   The important design choice is that this fabricates FACES, never numbers. The
   dice shown are real dice that genuinely produce the stated result, so every
   consistency check elsewhere still passes: validate.ts recomputes the total and
   the successes from the faces on arrival, and would throw out a roll whose
   summary did not match its dice. A scripted roll is indistinguishable from a
   fair one because, arithmetically, it is one.

   Nothing on the wire says a roll was scripted. The flag never leaves the GM's
   own browser — a field like `scripted: true` in the payload would be one
   patched client away from being displayed to the whole table. */

/** Faces for a d6 pool that lands on exactly `successes` (4, 5 or 6 counts). */
export function fabricateD6(count: number, successes: number): number[] {
    const wanted = Math.max(0, Math.min(count, successes));

    /* Choose which positions succeed, so the winning dice are scattered through
       the pool rather than sitting at the front. */
    const positions = Array.from({ length: count }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    const winners = new Set(positions.slice(0, wanted));

    return Array.from({ length: count }, (_, i) => (
        winners.has(i)
            ? 4 + Math.floor(Math.random() * 3)   // 4, 5 or 6
            : 1 + Math.floor(Math.random() * 3)   // 1, 2 or 3
    ));
}

/** Faces for a non-d6 pool that adds up to exactly `total`. */
export function fabricateTotal(count: number, sides: number, total: number): number[] {
    const target = Math.max(count, Math.min(count * sides, total));
    const vals = Array.from({ length: count }, () => 1);
    let left = target - count;

    /* Hand out the remainder a slice at a time to random dice. Taking a random
       slice rather than filling each die to the brim keeps the spread looking
       like a roll instead of a row of maximums followed by a row of ones. */
    while (left > 0) {
        const i = Math.floor(Math.random() * count);
        const room = sides - vals[i];
        if (room <= 0) continue;
        const give = 1 + Math.floor(Math.random() * Math.min(room, left));
        vals[i] += give;
        left -= give;
    }
    return vals;
}

/** The range a scripted total can legally ask for, so the UI can clamp its
    input rather than let the GM type something unreachable. */
export function totalRange(count: number, sides: number): { min: number; max: number } {
    return { min: count, max: count * sides };
}
