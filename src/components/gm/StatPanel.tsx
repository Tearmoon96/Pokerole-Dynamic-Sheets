import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { adjustPool, bareValue, entityPool, entityRef, writeMods } from '../../gm/entities';
import { parsePcToken } from '../../gm/tablePcs';
import { MoveTipShell } from './MoveTip';
import { StatTipBody } from './StatTip';
import type { CombatMods } from '../../lib/combatMods';
import type { PokedexEntry } from '../../data/types';

/* The GM screen's side of the stats popup (StatTip.tsx): any trainer, team
   Pokémon, wild or player's character on the board. A player's character
   is the copy the table sent; a change to it goes back to that player's own
   sheet, as an HP step from the combat row does. */

export function StatPanel({ token, onClose, onMoves }: {
    token: string | null;
    onClose: () => void;
    /** Swap to the move panel of the same subject. */
    onMoves: (token: string) => void;
}) {
    const { state, store } = useGm();
    const { data } = useAppData();
    if (!token) return null;

    const dexById = (id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null;
    const ref = entityRef(state, dexById, token);
    if (!ref || ref.kind === 'custom') return null;

    const pc = parsePcToken(token);
    const owner = pc ? (state.tablePcs[pc.member]?.player || 'Player') + ' · at the table'
        : ref.kind === 'wild' ? 'Wild' : ref.kind === 'trainer' ? 'Trainer' : '';
    const types = ref.dex ? [ref.dex.Type1, ref.dex.Type2].filter(Boolean).join(' / ') : '';

    const onPool = (key: 'hp' | 'will', delta: number, e: React.MouseEvent) => {
        adjustPool(state, dexById, token, key, e.shiftKey ? delta * 5 : delta, () => store.save());
        store.refresh();
    };
    const onMods = (next: CombatMods) => {
        writeMods(state, token, next, () => store.save());
        store.refresh();
    };

    return (
        <MoveTipShell
            token={token} onClose={onClose} id="stat-tooltip"
            switchTo={{ label: ref.kind === 'trainer' ? 'Rolls' : 'Moves', icon: ref.kind === 'trainer' ? 'fa-dice-d6' : 'fa-list-ul', onClick: () => onMoves(token) }}
        >
            <StatTipBody
                subject={ref}
                bare={bareValue(ref)}
                sub={[types, owner].filter(Boolean).join(' · ')}
                hp={entityPool(ref, 'hp')}
                will={entityPool(ref, 'will')}
                onPool={onPool}
                onMods={onMods}
            />
        </MoveTipShell>
    );
}
