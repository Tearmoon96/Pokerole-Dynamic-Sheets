import type { AppData, EquipIcon, ItemEntry } from '../data/types';

/* Gear and Pokémon items are separate things kept in separate places: the bag
   holds Pokémon items, the equipment slots hold worn gear. A few names sit in
   both the icon packs and items-db.js — those belong to the bag, so the
   catalogue drops them and a Pokémon item can never end up equipped. */

export const MONO_PREFIX = 'mono:';

/** Search key. Spaces come out too, unlike normalizeIconName: the two
    databases word things differently, and the pack's "Moonstone" is the same
    object as the Pokédex's "Moon Stone". */
export function itemIdentityKey(s: unknown): string {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeIconName(s: unknown): string {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isMonoIcon(file: string | undefined): boolean {
    return String(file || '').indexOf(MONO_PREFIX) === 0;
}

/** One normalised icon-pack row, ready for the catalogue's search. */
export interface GearIcon extends EquipIcon { q: string }

/** Everything derived from the two icon packs plus items-db, built once. */
export interface GearIndex {
    /** Both packs concatenated; monochrome entries carry the `mono:` prefix. */
    pack: EquipIcon[];
    /** Normalising ~950 names on every keystroke adds up; done once. */
    packNorm: GearIcon[];
    /** What the catalogue offers must not be addable to a bag of Pokémon items. */
    gearOnlyKeys: Set<string>;
    /** Icon paths hold spaces and commas, so they have to be escaped. */
    iconUrl: (file: string) => string;
    /** Canonical item lookup by name, case-insensitive. */
    findItem: (name: string) => ItemEntry | null;
    isPokemonItemName: (name: string) => boolean;
}

export function buildGearIndex(data: AppData): GearIndex {
    const pack: EquipIcon[] = ([] as EquipIcon[])
        .concat(data.equipIcons)
        .concat(data.equipIconsMono.map((ic) => ({ n: ic.n, c: ic.c, f: MONO_PREFIX + ic.f })));

    const pokeItemKeys = new Set(
        data.items.map((it) => itemIdentityKey(it && it.Name)).filter(Boolean));
    const isPokemonItemName = (name: string) => pokeItemKeys.has(itemIdentityKey(name));

    const packNorm: GearIcon[] = pack
        .filter((ic) => !isPokemonItemName(ic.n))
        .map((ic) => ({ f: ic.f, c: ic.c, n: ic.n, q: normalizeIconName(ic.n) }));

    const iconUrl = (file: string) => {
        const mono = isMonoIcon(file);
        const path = mono ? file.slice(MONO_PREFIX.length) : file;
        return (mono ? data.equipIconMonoDir : data.equipIconDir)
            + path.split('/').map(encodeURIComponent).join('/');
    };

    const byName = new Map<string, ItemEntry>();
    data.items.forEach((it) => { byName.set(it.Name.toLowerCase(), it); });

    return {
        pack,
        packNorm,
        gearOnlyKeys: new Set(packNorm.map((ic) => itemIdentityKey(ic.n))),
        iconUrl,
        findItem: (name: string) => byName.get(String(name || '').toLowerCase()) || null,
        isPokemonItemName,
    };
}
