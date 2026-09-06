import { FallbackImage } from './FallbackImage';
import { tileSpriteChain } from '../../lib/sprites';

/* A picker tile's sprite. Prefers the Home render and falls back Home -> Book ->
   Box -> Token (each local, then GitHub-raw) so a tile shows real art instead of
   a broken "no image" icon. The class travels with the candidate so Home
   sprites can be sized down a touch. */
export function TileSprite({ image }: { image: string }) {
    return <FallbackImage candidates={tileSpriteChain(image)} />;
}
