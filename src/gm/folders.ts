/* Folders, shared by the Notes panel and the Trainers & Wilds roster.

   One model serves both, and it is deliberately the flat one: every item keeps
   its place in a single ordered list and carries the id of the folder it
   belongs to. Rendering walks the folders in their own order, taking each
   one's members out of the flat list, and finishes with whatever is unfiled.

   The alternative — a real tree, each folder holding its own array — is worse
   here for one specific reason: an item would then exist in exactly one place,
   and every operation that touches it (a status write, a pool step, the combat
   tracker resolving a token) would have to find it first. The flat list stays
   the single source of truth and folders become a view of it, so nothing
   outside this file has to learn what a folder is.

   Nothing here mutates. Every function returns a new array, because these run
   inside `store.update`, which swaps the state object wholesale. */

export interface GmFolder {
    gid: string;
    name: string;
    /** Folded shut. Kept per folder so a long campaign can collapse the parts
        it is not playing tonight. */
    open: boolean;
}

/** One rendered block: a folder and its members, or the unfiled tail when
    `folder` is null. */
export interface FolderGroup<T> {
    folder: GmFolder | null;
    items: T[];
}

/** Folders in their own order with their members, then everything unfiled.

    An item whose folder no longer exists comes back as unfiled rather than
    vanishing — deleting a folder therefore cannot take notes with it even if
    the caller forgets to reassign them. */
export function groupByFolder<T>(
    items: T[],
    folders: GmFolder[],
    folderOf: (item: T) => string | null | undefined,
): FolderGroup<T>[] {
    const live = new Set(folders.map((f) => f.gid));
    const groups: FolderGroup<T>[] = folders.map((folder) => ({
        folder,
        items: items.filter((it) => folderOf(it) === folder.gid),
    }));
    const loose = items.filter((it) => {
        const f = folderOf(it);
        return !f || !live.has(f);
    });
    /* The unfiled block is always last and always present: it is where a new
       item lands, so a board with folders but no loose items still needs
       somewhere to show one appearing. */
    groups.push({ folder: null, items: loose });
    return groups;
}

/** Move one item one step up or down AMONG ITS OWN GROUP, rewriting the flat
    list.

    The two swapped entries are neighbours within the group, which are usually
    not neighbours in the flat array — so this swaps the positions they occupy
    there. That is what keeps "up" meaning what the user sees rather than what
    the array happens to hold. */
export function moveWithinGroup<T>(
    all: T[],
    id: (item: T) => string,
    inGroup: (item: T) => boolean,
    gid: string,
    dir: number,
): T[] {
    const slots = all.map((_, i) => i).filter((i) => inGroup(all[i]));
    const at = slots.findIndex((i) => id(all[i]) === gid);
    if (at < 0) return all;
    const to = at + dir;
    if (to < 0 || to >= slots.length) return all;
    const next = all.slice();
    const a = slots[at];
    const b = slots[to];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
}

/** Move a folder one step up or down among the folders. */
export function moveFolder(folders: GmFolder[], gid: string, dir: number): GmFolder[] {
    const at = folders.findIndex((f) => f.gid === gid);
    if (at < 0) return folders;
    const to = at + dir;
    if (to < 0 || to >= folders.length) return folders;
    const next = folders.slice();
    [next[at], next[to]] = [next[to], next[at]];
    return next;
}

/** Drop a folder. Members are not deleted with it — they go back to unfiled,
    which `groupByFolder` would do anyway, but doing it here means the stored
    state does not keep pointing at something that is gone. */
export function dropFolder(folders: GmFolder[], gid: string): GmFolder[] {
    return folders.filter((f) => f.gid !== gid);
}

/** Only real folders survive a load: a stale or hand-edited file cannot leave
    an item filed under an id nothing can reach. */
export function normalizeFolders(raw: unknown): GmFolder[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
        .map((f) => ({
            gid: String(f.gid || ''),
            name: String(f.name || ''),
            open: f.open !== false,
        }))
        .filter((f) => f.gid && !seen.has(f.gid) && seen.add(f.gid));
}
