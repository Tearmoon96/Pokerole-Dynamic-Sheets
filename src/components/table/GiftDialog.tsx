/* A wild Pokémon the GM gives this player — one they caught. Taken, it joins
   the trainer they pick: the first empty team slot, else a PC box, as the
   License's Capture does (addMonToTrainer). */

import { useState } from 'react';
import { useTable } from '../../table/TableContext';
import { useTableData } from './useTableData';
import { chosenTrainerId, workingTrainers } from '../../table/character';
import { GmSprite } from '../gm/GmSprite';
import type { CardSheet } from '../../card/types';

export function GiftDialog() {
    const { session } = useTable();
    const data = useTableData();
    const gift = session.npcs.view.gifts[0] || null;
    const trainers = workingTrainers();
    const [picked, setPicked] = useState('');
    const [full, setFull] = useState('');
    if (!gift) return null;

    const trainerId = trainers.some((t) => t.id === picked) ? picked : (chosenTrainerId() || '');
    const dex = data?.pokemon.find((p) => p._id === gift.dexId) || null;
    const species = dex ? dex.Name : gift.dexId;

    return (
        <div className="gm-overlay open">
            <div className="gm-dialog gift-dialog" role="dialog" aria-label={'The GM gives you ' + gift.name} id="gift-dialog">
                <div className="gm-dialog-title">
                    <i className="fa-solid fa-gift"></i>
                    <span>The GM gives you {gift.name}</span>
                </div>
                <div className="gift-mon">
                    <GmSprite dex={dex} dexId={gift.dexId} sheet={gift.sheet as Partial<CardSheet> | null} className="mon-sprite" />
                    <div className="gm-dialog-text">
                        {gift.name !== species ? <>{gift.name}, a {species}. </> : null}
                        It joins your trainer&rsquo;s team, or a PC box if the team is full.
                    </div>
                </div>
                {trainers.length ? (
                    <label className="gift-trainer">
                        Trainer
                        <select value={trainerId} onChange={(e) => { setPicked(e.currentTarget.value); setFull(''); }}>
                            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </label>
                ) : (
                    <p className="gm-dialog-text">
                        Load your trainer in the character panel first: there is nowhere to put it yet.
                    </p>
                )}
                {full && <p className="gm-dialog-text gift-full">{full}</p>}
                <div className="gm-dialog-actions">
                    <button onClick={() => session.npcs.answer(gift.oid, null)}>Turn it down</button>
                    <button
                        className="go" id="gift-accept" disabled={!trainerId}
                        onClick={() => {
                            if (!session.npcs.answer(gift.oid, trainerId)) {
                                setFull('That trainer’s team and every PC box are full. Pick another, or make room first.');
                            } else setFull('');
                        }}
                    >
                        <i className="fa-solid fa-hand-sparkles"></i> Take it
                    </button>
                </div>
            </div>
        </div>
    );
}
