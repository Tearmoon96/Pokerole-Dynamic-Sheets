import { readWildOpen, wildUrl } from '../../card/wild';
import { useAppData } from '../../data/AppDataContext';
import { wildSheetKey } from '../../card/cardContext';

/* Covers the card when it is opened with no Pokémon loaded. */

export function BlankLanding({ onLoad, onWild }: { onLoad: () => void; onWild: () => void }) {
    const { data } = useAppData();
    const open = readWildOpen();

    /* Wild sheets left open by an earlier visit are otherwise only reachable
       from inside one of them, so offer the way back in. */
    const nameOf = (wid: string, dexId: string) => {
        let nick = '';
        try {
            const saved = JSON.parse(localStorage.getItem(wildSheetKey(wid)) || 'null');
            nick = ((saved && saved.nickname) || '').trim();
        } catch { /* unreadable: the species name still names it */ }
        if (nick) return nick;
        const dex = data.pokemon.find((x) => x._id === dexId);
        return dex ? dex.Name : dexId;
    };

    return (
        <div className="blank-landing" id="blank-landing" style={{ display: 'flex' }}>
            <div className="blank-landing-icon"><i className="fa-solid fa-id-badge"></i></div>
            <h1>Pokémon Card</h1>
            <p>
                No Pokémon loaded yet. Load one to view or build its sheet, or manage a wild Pokémon —
                create a new one or import a saved wild Pokémon file — that you can later capture on a
                trainer's sheet. Several wild Pokémon can be open at once, with arrows at the edges of
                the page to switch between them.
            </p>
            <div className="blank-landing-actions">
                <button className="blank-btn" onClick={onLoad}>
                    <i className="fa-solid fa-magnifying-glass"></i> Load a Pokémon
                </button>
                <button className="blank-btn wild" onClick={onWild}>
                    <i className="fa-solid fa-paw"></i> Manage a Wild Pokémon
                </button>
                {open.length > 0 && (
                    <button
                        className="blank-btn wild"
                        id="resume-wild-btn"
                        onClick={() => { location.search = wildUrl(open[0].dexId, open[0].wid); }}
                    >
                        <i className="fa-solid fa-layer-group"></i>{' '}
                        {open.length === 1
                            ? 'Back to ' + nameOf(open[0].wid, open[0].dexId)
                            : 'Back to ' + open.length + ' open wild Pokémon'}
                    </button>
                )}
            </div>
        </div>
    );
}
