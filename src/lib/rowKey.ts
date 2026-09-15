/** A React key for the row at `idx` of a list of named entries: the name,
    so that deleting a row above does not hand this row's element — and any
    state its children hold — to the entry that slides into its place. A
    duplicate name (a hand-edited file can carry one) gets its ordinal
    appended, so the keys stay unique without falling back to the index. */
export function rowKey(rows: readonly { name: string }[], idx: number): string {
    const name = rows[idx].name.toLowerCase();
    let ordinal = 0;
    for (let i = 0; i < idx; i++) if (rows[i].name.toLowerCase() === name) ordinal++;
    return ordinal ? name + '#' + ordinal : name;
}
