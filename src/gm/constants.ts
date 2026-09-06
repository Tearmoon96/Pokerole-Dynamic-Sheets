export const GM_KEY = 'pokerole_gm_screen';

export const DEFAULT_NAME_OPTS = { region: 'Mixed', gender: 'any', letter: '', withNature: false };

/** The panels, in the order they ship. Every id in the markup is
    `panel-<key>`, and layout.order is a permutation of this list. */
export const PANEL_KEYS = ['roster', 'combat', 'dice', 'npc', 'notes'];

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
