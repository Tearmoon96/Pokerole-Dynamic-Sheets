/* The GM's trainers shared with this player (src/table/npcShare.ts), in the
   side column under their own character: the roster's rows, with nothing to
   click but the way into the whole sheet — the License or the card, opened
   on this browser's copy, read only unless the GM lets this player edit. */

import { useTable } from '../../table/TableContext';
import { useTableData } from './useTableData';
import { FoldTitle, useFold } from './Fold';
import { MonRow, PoolBar } from '../gm/RosterBits';
import { trainerPoolMax } from '../../gm/pools';
import type { PokedexEntry } from '../../data/types';
import type { CardSheet } from '../../card/types';

export function NpcSheets() {
    const { session } = useTable();
    const data = useTableData();
    const [open, toggle] = useFold('npcs');
    const sheets = session.npcs.view.sheets.filter((s) => s.data);
    if (!sheets.length) return null;

    const dexById = (id: string): PokedexEntry | null => data?.pokemon.find((p) => p._id === id) || null;
    const q = (id: string) => '?npc=' + encodeURIComponent(id) + '&trainer=' + encodeURIComponent(id);

    return (
        <div className="npc-sheets" data-tour="npcs">
            <FoldTitle id="npcs" open={open} onToggle={toggle} icon="fa-address-book"
                extra={<span className="count">{sheets.length}</span>}>
                The GM&rsquo;s sheets
            </FoldTitle>
            {open && sheets.map(({ id, edit, data: t }) => {
                if (!t) return null;
                const team = (t.team || []).map((slot, idx) => ({ slot, idx })).filter((x) => x.slot && x.slot.dexId);
                return (
                    <div className="roster-card character-card npc-card" key={id} data-npc={id}>
                        <div className="trainer-head">
                            {t.photo
                                ? <img className="trainer-photo" src={t.photo} alt="" />
                                : <div className="trainer-photo placeholder"><i className="fa-solid fa-user"></i></div>}
                            <div className="trainer-main">
                                <div className="trainer-name">
                                    <span className="name-text">{t.name || 'Trainer'}</span>
                                    <span className="trainer-rank">{t.rank || ''}</span>
                                </div>
                                <div className="pool-bars">
                                    <PoolBar tag="HP" cls="hp" cur={t.hp || 0} max={trainerPoolMax(t, 'hp')} />
                                    <PoolBar tag="WILL" cls="will" cur={t.will || 0} max={trainerPoolMax(t, 'will')} />
                                </div>
                                <span className={'npc-access' + (edit ? ' edit' : '')}>
                                    <i className={'fa-solid ' + (edit ? 'fa-pen-to-square' : 'fa-lock')}></i>
                                    {edit ? ' You can edit it' : ' Read only'}
                                </span>
                            </div>
                            <div className="trainer-actions">
                                <button
                                    className="icon-btn"
                                    title={edit ? 'Open this sheet' : 'Open this sheet (read only)'}
                                    onClick={() => window.open('trainer-license.html' + q(id), '_blank')}
                                >
                                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                </button>
                            </div>
                        </div>
                        <div className="mon-list">
                            {!team.length ? <div className="empty-note">No Pokémon on this team.</div> : team.map((x) => (
                                <MonRow
                                    key={x.slot.uid || x.idx}
                                    dex={dexById(x.slot.dexId)}
                                    dexId={x.slot.dexId}
                                    sheet={(x.slot.sheet || null) as Partial<CardSheet> | null}
                                    buttons={
                                        <button
                                            className="icon-btn"
                                            title="Open the Pokémon card"
                                            onClick={() => window.open('pokemon-card.html' + q(id)
                                                + '&pokemon=' + encodeURIComponent(x.slot.dexId)
                                                + (x.slot.uid ? '&uid=' + encodeURIComponent(x.slot.uid) : '')
                                                + '&slot=' + x.idx, '_blank')}
                                        >
                                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                                        </button>
                                    }
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
