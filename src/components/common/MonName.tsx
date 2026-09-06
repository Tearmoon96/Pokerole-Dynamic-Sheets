import { FallbackImage } from './FallbackImage';
import { megaStoneUrl, stripMegaSuffix } from '../../lib/sprites';
import type { PokedexEntry } from '../../data/types';
import type { MonEntry } from '../../state/types';

/* Mega forms: the picker and name previews drop the "(Mega ...)" suffix and
   show the mega stone's sprite instead, matching the Pokémon card's browser. */
export function megaStoneOf(p: PokedexEntry | null): string | null {
    if (!p || !p.Name || !p.Name.includes('(Mega')) return null;
    const evo = (p.Evolutions || []).find((e) => e.Kind === 'Mega' && e.From && e.Item);
    return evo ? (evo.Item as string) : null;
}

export function MegaStoneIcon({ stone }: { stone: string }) {
    const { local, remote } = megaStoneUrl(stone);
    return (
        <FallbackImage
            candidates={[local, remote]}
            className="mega-stone-icon"
            alt={stone}
            title={stone}
        />
    );
}

export function GenderGlyph({ gender }: { gender?: string }) {
    if (gender === 'M') return <i className="fa-solid fa-mars team-gender male" title="Male" />;
    if (gender === 'F') return <i className="fa-solid fa-venus team-gender female" title="Female" />;
    return null;
}

/** Shared by the team slots and the storage tiles: the nickname when the
    preview asks for one and the card set one, else the species — mega forms
    show the stone beside the base name instead of a "(Mega …)" suffix. */
export function MonName({ mon, pokemon }: { mon: MonEntry | null; pokemon: PokedexEntry | null }) {
    const sheet = (mon && mon.sheet) || null;
    const nick = ((sheet && (sheet.nickname as string)) || '').trim();
    const useNick = !!(mon && mon.preview && mon.preview.useNickname && nick);
    if (!pokemon) return <>{useNick ? nick : ((mon && mon.dexId) || 'Unknown')}</>;
    const stone = megaStoneOf(pokemon);
    const shown = useNick ? nick : (stone ? stripMegaSuffix(pokemon.Name) : pokemon.Name);
    return (
        <>
            {shown}
            {!useNick && stone ? <MegaStoneIcon stone={stone} /> : null}
            <GenderGlyph gender={sheet?.gender as string | undefined} />
        </>
    );
}
