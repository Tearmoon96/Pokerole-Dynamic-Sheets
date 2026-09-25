/** A copy of `list` with the item at `from` taken out and put back at `to`.
    Out-of-range or no-op moves return the list unchanged. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = list.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/** `items` sorted by where their key sits in `order`; anything `order` does not
    name keeps its own relative order and goes after the ones it does. */
export function sortByOrder<T>(items: T[], key: (item: T) => string, order: string[]): T[] {
    const at = new Map(order.map((k, i) => [k, i]));
    return items
        .map((item, i) => ({ item, i, rank: at.has(key(item)) ? at.get(key(item))! : Infinity }))
        .sort((a, b) => (a.rank - b.rank) || (a.i - b.i))
        .map((x) => x.item);
}
