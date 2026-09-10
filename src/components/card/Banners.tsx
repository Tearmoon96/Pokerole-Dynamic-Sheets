import { useCard } from '../../card/CardContext';
import { readWorking } from '../../card/persistence';

/* The fixed strip across the top that says what kind of card this is. Both are
   inline-styled exactly as they were: they sit above everything the stylesheet
   knows about.

   They now carry a `card-banner` class as well. Nothing in the desktop CSS
   matches it — the inline style is still what paints them — but the phone
   layer needs a handle: pinned to the top of a 412px screen this strip wraps
   to two lines and lands squarely on the Pokémon's name, so on a phone it is
   taken out of `position: fixed` and put back in the flow, where it pushes the
   card down instead of covering it. */

const BANNER_STYLE: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, textAlign: 'center',
    padding: '7px 14px', fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem', fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    background: '#0b0713e6', color: '#fff',
    boxShadow: '0 2px 12px #00000080',
    backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
};

/** Makes clear this card edits a Pokémon that belongs to a trainer. */
export function TrainerBanner() {
    const { store } = useCard();
    const ctx = store.ctx;
    if (!ctx.inTrainerMode) return null;

    const w = readWorking();
    const t = w && Array.isArray(w.trainers) ? w.trainers.find((x) => x.id === ctx.trainerId) : null;
    const tname = (t && t.data && t.data.name) ? t.data.name : 'a trainer';
    /* Say where it actually lives — a stored Pokémon is not on the team */
    const inBox = !!(ctx.monUid && t && t.data && Array.isArray(t.data.boxes)
        && t.data.boxes.some((b) => b && Array.isArray(b.mons)
            && b.mons.some((m) => m && m.uid === ctx.monUid)));

    return (
        <div className="card-banner" style={{ ...BANNER_STYLE, borderBottom: '1px solid var(--border-color)' }}>
            <i className={'fa-solid ' + (inBox ? 'fa-box-archive' : 'fa-id-card')}></i>
            {' '}Editing a Pokémon in <strong>{tname}</strong>’s {inBox ? 'PC storage' : 'team'}
            {' '}— changes save to that trainer
        </div>
    );
}

export function WildBanner() {
    return (
        <div className="card-banner" style={{ ...BANNER_STYLE, borderBottom: '1px solid #22c55e66' }}>
            <i className="fa-solid fa-paw"></i> Wild Pokémon — belongs to no trainer.
            Export it, then Capture it on a trainer sheet to make it yours.
        </div>
    );
}
