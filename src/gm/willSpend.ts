/* Whose Round a roll's Will buttons are about, on the GM screen: the
   character the roll was set up for, and — when it stands in a fight — that
   fight's current Round (lib/willRound.ts). */

import { participantForToken, resolveToken } from './entities';
import { FREE } from '../lib/willRound';
import type { GmState } from './types';
import type { PokedexEntry } from '../data/types';

export function willRoundOf(
    state: GmState, dexById: (id: string) => PokedexEntry | null, token: string,
): { key: string; stamp: string } {
    const key = 'gm:' + (resolveToken(state, token) || token);
    const part = participantForToken(state, dexById, token);
    const fight = part ? state.combats.find((c) => c.participants.includes(part)) : null;
    return { key, stamp: fight ? fight.gid + ':' + fight.round : FREE };
}
