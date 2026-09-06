import { DEFAULT_NAME_OPTS } from './constants';
import type { GmNameOpts } from './types';

/* NPC name generation.

   Syllabic, not a lookup table: an onset, a vowel, sometimes a second syllable,
   then an ending chosen for the gender. Each language flavour brings its own
   inventory, which is what makes a Kalos name read French and an Alola name read
   Hawaiian.

   Repeats inside a pool are the weighting — a vowel listed twice comes up twice
   as often — so no separate weight table is needed. Lifted verbatim. */

export interface LangBank {
    onsets: string[];
    vowels: string[];
    codas: string[];
    ends: { m: string[]; f: string[]; n: string[] };
}

export const LANGS: Record<string, LangBank> = {
    jp: {
        onsets: ['k', 'k', 's', 't', 't', 'n', 'h', 'm', 'm', 'y', 'r', 'r', 'w', 'g', 'z', 'd', 'b', 'p',
            'ch', 'sh', 'ts', 'ky', 'ry', 'j', 'f'],
        vowels: ['a', 'a', 'i', 'i', 'u', 'e', 'o', 'o'],
        codas: ['', '', '', '', 'n'],
        ends: {
            m: ['ro', 'ta', 'ki', 'to', 'ya', 'suke', 'hei', 'ji', 'shi', 'ma', 'zo', 'hiko'],
            f: ['ko', 'mi', 'na', 'ka', 'ho', 'ri', 'e', 'yo', 'sa', 'no', 'mi', 'ne'],
            n: ['ki', 'mi', 'ka', 'to', 'ha', 'ri', 'se', 'na']
        }
    },
    en: {
        onsets: ['b', 'br', 'c', 'ch', 'cl', 'd', 'dr', 'f', 'g', 'gr', 'h', 'j', 'k', 'l', 'm', 'n',
            'p', 'r', 's', 'sh', 'st', 't', 'tr', 'v', 'w'],
        vowels: ['a', 'a', 'e', 'e', 'i', 'o', 'u', 'ay', 'ee', 'ie', 'oo'],
        codas: ['', '', '', 'n', 'r', 'l', 'm', 's', 't'],
        ends: {
            m: ['don', 'son', 'ter', 'ley', 'ard', 'vin', 'rick', 'ton', 'den', 'mon', 'nan', 'dre'],
            f: ['a', 'ie', 'lyn', 'beth', 'ra', 'na', 'sy', 'ette', 'ine', 'elle', 'ora'],
            n: ['ley', 'sey', 'rin', 'den', 'ry', 'an', 'is']
        }
    },
    uk: {
        onsets: ['b', 'br', 'c', 'cr', 'd', 'f', 'g', 'h', 'l', 'm', 'n', 'p', 'r', 's', 'st',
            't', 'th', 'w', 'wh', 'gw'],
        vowels: ['a', 'e', 'e', 'i', 'o', 'u', 'ea', 'ou', 'ei', 'y'],
        codas: ['', '', '', 'l', 'r', 'n', 'th', 'd'],
        ends: {
            m: ['wick', 'ford', 'stone', 'bert', 'wyn', 'ridge', 'ham', 'worth', 'cott', 'ley', 'mund'],
            f: ['wen', 'ora', 'ice', 'anne', 'ela', 'ith', 'ry', 'ise', 'ina', 'ary', 'wyn'],
            n: ['ley', 'bury', 'wick', 'ry', 'ell', 'in']
        }
    },
    fr: {
        onsets: ['b', 'c', 'ch', 'd', 'f', 'g', 'j', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'br', 'fl'],
        vowels: ['a', 'a', 'e', 'e', 'i', 'o', 'u', 'ou', 'ai', 'eu', 'oi'],
        codas: ['', '', '', 'r', 'l', 'n', 's'],
        ends: {
            m: ['ien', 'aud', 'ard', 'ent', 'oux', 'ain', 'el', 'ot', 'ier', 'on', 'ase'],
            f: ['elle', 'ette', 'ine', 'ise', 'ienne', 'anne', 'ance', 'ée', 'ille', 'aise', 'ore'],
            n: ['ay', 'ou', 'en', 'is', 'ry', 'el']
        }
    },
    haw: {
        /* Hawaiian syllables are open — an onset and a vowel, never a
           consonant coda — and vowel-initial names are common, which is
           what the empty onset is for */
        onsets: ['h', 'k', 'k', 'l', 'l', 'm', 'n', 'p', 'w', '', ''],
        vowels: ['a', 'a', 'a', 'e', 'i', 'o', 'u', 'ai', 'au', 'ei', 'oa', 'ua'],
        codas: [''],
        ends: {
            m: ['kai', 'noa', 'nui', 'lani', 'koa', 'hano', 'mau', 'kea', 'loa'],
            f: ['lani', 'nani', 'leia', 'maka', 'kea', 'hina', 'ula', 'moana', 'ana'],
            n: ['lani', 'kai', 'ola', 'ana', 'nui', 'mea']
        }
    },
    es: {
        onsets: ['b', 'c', 'ch', 'd', 'f', 'g', 'j', 'l', 'll', 'm', 'n', 'p', 'qu', 'r', 's', 't', 'v', 'z'],
        vowels: ['a', 'a', 'e', 'e', 'i', 'o', 'o', 'u', 'ia', 'ie', 'ue'],
        codas: ['', '', '', 'r', 'l', 'n', 's'],
        ends: {
            m: ['o', 'os', 'án', 'ez', 'ío', 'ero', 'ando', 'into', 'ón', 'ar', 'illo'],
            f: ['a', 'ita', 'ela', 'ina', 'ana', 'ora', 'ía', 'isa', 'uela', 'encia'],
            n: ['al', 'en', 'ar', 'is', 'ay']
        }
    },
    fantasy: {
        onsets: ['b', 'br', 'c', 'd', 'dr', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'q', 'r', 's',
            't', 'th', 'v', 'w', 'y', 'z', 'sel', 'ael'],
        vowels: ['a', 'e', 'i', 'o', 'u', 'ae', 'ei', 'io', 'y'],
        codas: ['', '', '', 'l', 'r', 'n', 'th', 'x'],
        ends: {
            m: ['dan', 'ric', 'ro', 'mer', 'ver', 'us', 'dor', 'ax', 'wyn', 'gar'],
            f: ['a', 'ia', 'ika', 'la', 'sa', 'eth', 'wyn', 'ara', 'lin', 'is'],
            n: ['is', 'en', 'or', 'ael', 'yr', 'an']
        }
    }
};

/* Region -> language flavour. The four Japanese-inspired regions share one
   inventory rather than pretending to differ, which is the honest reading of the
   source material. */
export interface RegionDef { label: string; lang: string | null; note?: string }

export const REGIONS: Record<string, RegionDef> = {
    Mixed: { label: 'Mixed (all regions)', lang: null },
    Kanto: { label: 'Kanto / Johto / Hoenn / Sinnoh', lang: 'jp', note: 'Japanese' },
    Unova: { label: 'Unova', lang: 'en', note: 'American English' },
    Galar: { label: 'Galar', lang: 'uk', note: 'British English' },
    Kalos: { label: 'Kalos', lang: 'fr', note: 'French' },
    Alola: { label: 'Alola', lang: 'haw', note: 'Hawaiian' },
    Paldea: { label: 'Paldea', lang: 'es', note: 'Spanish' },
    Fantasy: { label: 'Fantasy', lang: 'fantasy', note: 'no region' }
};

export const GENDERS = [
    { key: 'any', label: 'Any', icon: 'fa-shuffle' },
    { key: 'f', label: 'Fem', icon: 'fa-venus' },
    { key: 'm', label: 'Masc', icon: 'fa-mars' },
    { key: 'n', label: 'Neutral', icon: 'fa-genderless' }
];

export function genderIcon(g: string): string {
    const e = GENDERS.find((x) => x.key === g);
    return e ? e.icon : 'fa-genderless';
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** A requested starting letter narrows the onsets; when no onset in the flavour
    starts with it, a vowel-initial name is tried before giving up, so "starts
    with A" works in every language. */
export function startOptions(lang: LangBank, letter: string) {
    if (!letter) return { onsets: lang.onsets, vowels: lang.vowels, ok: true };
    const l = letter.toLowerCase();
    const on = lang.onsets.filter((o) => o && o.toLowerCase().startsWith(l));
    if (on.length) return { onsets: on, vowels: lang.vowels, ok: true };
    const vw = lang.vowels.filter((v) => v.toLowerCase().startsWith(l));
    if (vw.length) return { onsets: [''], vowels: vw, ok: true };
    return { onsets: lang.onsets, vowels: lang.vowels, ok: false };
}

export interface GeneratedName {
    name: string;
    gender: string;
    region: string;
    /** False when the requested starting letter could not be honoured. */
    letterOk: boolean;
}

export function randomName(opts?: Partial<GmNameOpts>): GeneratedName {
    const o = Object.assign({}, DEFAULT_NAME_OPTS, opts || {});
    const regionKey = o.region === 'Mixed' || !REGIONS[o.region]
        ? pick(Object.keys(REGIONS).filter((k) => k !== 'Mixed'))
        : o.region;
    const lang = LANGS[REGIONS[regionKey].lang!];
    const gender = o.gender && o.gender !== 'any' ? o.gender : pick(['m', 'f', 'n']);
    const start = startOptions(lang, o.letter);

    let n = pick(start.onsets) + pick(start.vowels);
    if (Math.random() < 0.5) n += pick(lang.codas) + pick(lang.onsets) + pick(lang.vowels);
    n += pick((lang.ends as unknown as Record<string, string[]>)[gender] || lang.ends.n);

    /* Cleanups: a trebled letter from an ending that repeats the vowel before
       it, and vowel pileups the syllable joins can produce */
    n = n.replace(/(.)\1{2,}/g, '$1$1').replace(/[aeiou]{4,}/g, (m) => m.slice(0, 2));
    if (n.length > 12) n = n.slice(0, 12);
    return {
        name: n.charAt(0).toUpperCase() + n.slice(1),
        gender, region: regionKey, letterOk: start.ok,
    };
}
