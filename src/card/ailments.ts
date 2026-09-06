/* Status ailments and the icon row that toggles them.

   Lifted verbatim from the inline script: the colours are the ones the tiles,
   the chips and the move cards all share, and the immunity lists come straight
   from the rulebook. */

export interface Ailment {
    key: string;
    name: string;
    color: string;
    modifier: 'Fixed' | 'Aggravating' | 'Volatile';
    icon: string;
    /** Burn draws its degree as a number on the chip. */
    pips?: number;
    immune: string[];
}

export const AILMENTS: Ailment[] = [
    { key: 'burn1', name: '1st Degree Burn', color: '#f15a22', modifier: 'Fixed', icon: 'fa-fire', pips: 1, immune: ['Fire'] },
    { key: 'burn2', name: '2nd Degree Burn', color: '#c5351c', modifier: 'Fixed', icon: 'fa-fire', pips: 2, immune: ['Fire'] },
    { key: 'burn3', name: '3rd Degree Burn', color: '#9e1c0f', modifier: 'Aggravating', icon: 'fa-fire', pips: 3, immune: ['Fire'] },
    { key: 'paralysis', name: 'Paralysis', color: '#eedc00', modifier: 'Fixed', icon: 'fa-bolt', immune: ['Electric'] },
    { key: 'poison', name: 'Poison', color: '#956597', modifier: 'Fixed', icon: 'fa-skull-crossbones', immune: ['Steel', 'Poison'] },
    { key: 'badlyPoison', name: 'Badly Poisoned', color: '#784387', modifier: 'Aggravating', icon: 'fa-skull-crossbones', immune: ['Steel', 'Poison'] },
    { key: 'frozen', name: 'Frozen', color: '#87d1d1', modifier: 'Fixed', icon: 'fa-snowflake', immune: ['Ice'] },
    { key: 'sleep', name: 'Sleep', color: '#b4b68b', modifier: 'Fixed', icon: 'fa-moon', immune: [] },
    { key: 'confusion', name: 'Confusion', color: '#00b37d', modifier: 'Volatile', icon: 'fa-arrows-spin', immune: [] },
    { key: 'disable', name: 'Disable', color: '#292829', modifier: 'Volatile', icon: 'fa-ban', immune: [] },
    { key: 'flinch', name: 'Flinch', color: '#555d6a', modifier: 'Volatile', icon: 'fa-face-surprise', immune: [] },
    { key: 'inLove', name: 'In Love', color: '#f05b7d', modifier: 'Volatile', icon: 'fa-heart', immune: [] }
];

export function ailmentByKey(key: string): Ailment | undefined {
    return AILMENTS.find((a) => a.key === key);
}

export interface StatusIcon {
    key: string;
    name: string;
    icon: string;
    exclusive: boolean;
    /** Burn shows its degree as a numeral on the chip. */
    numbered?: boolean;
    /** Which status field holds the stage, for the multi-stage ailments. */
    stageField?: 'burnDegree' | 'poisonStage';
    stages: string[];
}

/* The eight icons under the HP bar: the exclusive ailments on the first row,
   the freely stackable conditions on the second. Disable is not among them — it
   afflicts one Move, so it lives on the move card instead. A status with more
   than one stage cycles through them on click and takes its colour from
   whichever stage it is on. */
export const STATUS_ICONS: StatusIcon[] = [
    { key: 'burn', name: 'Burn', icon: 'fa-fire', exclusive: true, numbered: true,
        stageField: 'burnDegree', stages: ['burn1', 'burn2', 'burn3'] },
    { key: 'paralysis', name: 'Paralysis', icon: 'fa-bolt', exclusive: true, stages: ['paralysis'] },
    { key: 'poison', name: 'Poison', icon: 'fa-skull-crossbones', exclusive: true,
        stageField: 'poisonStage', stages: ['poison', 'badlyPoison'] },
    { key: 'frozen', name: 'Frozen', icon: 'fa-snowflake', exclusive: true, stages: ['frozen'] },
    { key: 'sleep', name: 'Sleep', icon: 'fa-moon', exclusive: true, stages: ['sleep'] },
    { key: 'confusion', name: 'Confusion', icon: 'fa-arrows-spin', exclusive: false, stages: ['confusion'] },
    { key: 'flinch', name: 'Flinch', icon: 'fa-face-surprise', exclusive: false, stages: ['flinch'] },
    { key: 'inLove', name: 'In Love', icon: 'fa-heart', exclusive: false, stages: ['inLove'] },
];
