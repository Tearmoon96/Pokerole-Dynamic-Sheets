/* The twelve ailments and the eight chips that toggle them.

   The colours and the round-by-round numbers are the Pokémon card's, copied
   here so the two pages say the same thing about the same condition. The status
   object itself is the card's too — for a team Pokémon these chips write into
   slot.sheet.status, the very field the card reads, so a Pokémon paralysed on
   this screen is paralysed on its card and back again. */

export interface GmAilment {
    key: string;
    name: string;
    color: string;
    modifier: 'Fixed' | 'Aggravating' | 'Volatile';
    icon: string;
    immune: string[];
}

export const AILMENTS: GmAilment[] = [
    { key: 'burn1', name: '1st Degree Burn', color: '#f15a22', modifier: 'Fixed', icon: 'fa-fire', immune: ['Fire'] },
    { key: 'burn2', name: '2nd Degree Burn', color: '#c5351c', modifier: 'Fixed', icon: 'fa-fire', immune: ['Fire'] },
    { key: 'burn3', name: '3rd Degree Burn', color: '#9e1c0f', modifier: 'Aggravating', icon: 'fa-fire', immune: ['Fire'] },
    { key: 'paralysis', name: 'Paralysis', color: '#eedc00', modifier: 'Fixed', icon: 'fa-bolt', immune: ['Electric'] },
    { key: 'poison', name: 'Poison', color: '#956597', modifier: 'Fixed', icon: 'fa-skull-crossbones', immune: ['Steel', 'Poison'] },
    { key: 'badlyPoison', name: 'Badly Poisoned', color: '#784387', modifier: 'Aggravating', icon: 'fa-skull-crossbones', immune: ['Steel', 'Poison'] },
    { key: 'frozen', name: 'Frozen', color: '#87d1d1', modifier: 'Fixed', icon: 'fa-snowflake', immune: ['Ice'] },
    { key: 'sleep', name: 'Sleep', color: '#b4b68b', modifier: 'Fixed', icon: 'fa-moon', immune: [] },
    { key: 'confusion', name: 'Confusion', color: '#00b37d', modifier: 'Volatile', icon: 'fa-arrows-spin', immune: [] },
    { key: 'flinch', name: 'Flinch', color: '#555d6a', modifier: 'Volatile', icon: 'fa-face-surprise', immune: [] },
    { key: 'inLove', name: 'In Love', color: '#f05b7d', modifier: 'Volatile', icon: 'fa-heart', immune: [] }
];

export function ailmentByKey(key: string): GmAilment | undefined {
    return AILMENTS.find((a) => a.key === key);
}

export interface GmStatusIcon {
    key: string;
    name: string;
    icon: string;
    exclusive: boolean;
    stageField?: 'burnDegree' | 'poisonStage';
    stages: string[];
}

export const STATUS_ICONS: GmStatusIcon[] = [
    { key: 'burn', name: 'Burn', icon: 'fa-fire', exclusive: true,
        stageField: 'burnDegree', stages: ['burn1', 'burn2', 'burn3'] },
    { key: 'paralysis', name: 'Paralysis', icon: 'fa-bolt', exclusive: true, stages: ['paralysis'] },
    { key: 'poison', name: 'Poison', icon: 'fa-skull-crossbones', exclusive: true,
        stageField: 'poisonStage', stages: ['poison', 'badlyPoison'] },
    { key: 'frozen', name: 'Frozen', icon: 'fa-snowflake', exclusive: true, stages: ['frozen'] },
    { key: 'sleep', name: 'Sleep', icon: 'fa-moon', exclusive: true, stages: ['sleep'] },
    { key: 'confusion', name: 'Confusion', icon: 'fa-arrows-spin', exclusive: false, stages: ['confusion'] },
    { key: 'flinch', name: 'Flinch', icon: 'fa-face-surprise', exclusive: false, stages: ['flinch'] },
    { key: 'inLove', name: 'In Love', icon: 'fa-heart', exclusive: false, stages: ['inLove'] }
];

export interface GmStatus {
    major: string | null;
    burnDegree: number;
    poisonStage: number;
    confusion: boolean;
    flinch: boolean;
    inLove: boolean;
}

export function defaultStatus(): GmStatus {
    return {
        major: null, burnDegree: 0, poisonStage: 0,
        confusion: false, flinch: false, inLove: false,
    };
}

export function normalizeStatus(raw: unknown): GmStatus {
    const s: GmStatus = Object.assign(defaultStatus(), (raw || {}) as Partial<GmStatus>);
    /* Poison used to be a plain on/off toggle before it grew a Badly Poisoned
       stage — the card migrates the same way */
    if (s.major === 'poison' && !s.poisonStage) s.poisonStage = 1;
    if (s.major === 'burn' && !s.burnDegree) s.burnDegree = 1;
    return s;
}

/** Which ailment a status is actually on, for a given chip: burn on its degree,
    poison on its stage, everything else on its only one. */
export function activeAilment(status: GmStatus, icon: GmStatusIcon): GmAilment | null {
    const on = icon.exclusive
        ? status.major === icon.key
        : !!(status as unknown as Record<string, boolean>)[icon.key];
    if (!on) return null;
    const stage = icon.stageField ? (status[icon.stageField] || 1) : 1;
    return ailmentByKey(icon.stages[Math.min(stage, icon.stages.length) - 1]) || null;
}

/** Every ailment currently on a subject, in chip order. */
export function activeAilments(status: GmStatus): GmAilment[] {
    return STATUS_ICONS.map((i) => activeAilment(status, i)).filter((a): a is GmAilment => !!a);
}
