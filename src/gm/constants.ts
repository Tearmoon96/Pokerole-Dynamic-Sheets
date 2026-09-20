export const GM_KEY = 'pokerole_gm_screen';

export const DEFAULT_NAME_OPTS = { region: 'Mixed', gender: 'any', letter: '', withNature: false };

/** The panels, in the order they ship. Every id in the markup is
    `panel-<key>`, and layout.order is a permutation of this list.

    'combat' is a PLACEHOLDER rather than a key: the board carries one combat
    panel per combat in the session, keyed `combat-<gid>`, so that a party split
    across two fights gets two trackers side by side. `combatPanelKeys` expands
    the placeholder into however many there are, and everything that validates a
    layout goes through it. */
export const PANEL_KEYS = ['roster', 'combat', 'dice', 'npc', 'generator', 'notes'];

export const COMBAT_KEY = 'combat';
const COMBAT_PREFIX = 'combat-';

export function combatPanelKey(gid: string): string {
    return COMBAT_PREFIX + gid;
}

export function isCombatPanelKey(key: string): boolean {
    return key.indexOf(COMBAT_PREFIX) === 0;
}

export function combatGidOf(key: string): string {
    return key.slice(COMBAT_PREFIX.length);
}

/** PANEL_KEYS with the 'combat' placeholder replaced by one key per combat. */
export function expandPanelKeys(combatKeys: string[]): string[] {
    const out: string[] = [];
    PANEL_KEYS.forEach((k) => {
        if (k === COMBAT_KEY) out.push(...combatKeys);
        else out.push(k);
    });
    return out;
}

/* A hand-set width is clamped into this range: below the floor a panel stops
   being usable, and the ceiling is only there so one stray drag cannot leave a
   mile-wide panel to be dragged back. */
export const PANEL_MIN_W = 260;
export const PANEL_MAX_W = 2400;

/* How far past (or short of) the target number turns a hit into a critical, or
   a miss into a fumble. */
export const CRIT_MARGIN = 3;
export const CRIT_DAMAGE = 2;

export const WORKING_KEY = 'pokerole_working';
