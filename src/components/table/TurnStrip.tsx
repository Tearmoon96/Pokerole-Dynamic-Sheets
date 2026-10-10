/* The turn order, left to right, above the map: who is in the fight and whose
   turn it is, the way Baldur's Gate 3 draws it. Nothing about the GM's side
   but names and faces — no initiative, no HP. A player's own characters also
   show the actions they have spent this Round.

   The player whose turn it is ends it here, or delays it to later in the
   pass; the GM hands any turn on with Next. The GM screen decides what each
   of those does (src/gm/turns.ts) — this only asks. */

import { useEffect, useRef, useState } from 'react';
import { useTable } from '../../table/TableContext';
import { FallbackImage } from '../common/FallbackImage';
import { tileSpriteChain } from '../../lib/sprites';
import type { WireTurnEntry } from '../../table/protocol';
import { colorVars } from '../../table/colors';
import type { CSSProperties } from 'react';

const MAX_ACTIONS = 5;

function initials(name: string): string {
    const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}

function Face({ e }: { e: WireTurnEntry }) {
    if (e.img) {
        return (
            <FallbackImage
                candidates={tileSpriteChain(e.img).map((c) => ({ url: c.url, className: 'turn-sprite' }))}
                alt=""
            />
        );
    }
    return <span className="turn-initials">{initials(e.name)}</span>;
}

export function TurnStrip() {
    const { session, state } = useTable();
    const { turns, linked } = session.combat.view;
    const rail = useRef<HTMLDivElement>(null);
    const [delaying, setDelaying] = useState(false);

    const cur = turns && turns.cur ? turns.order.find((e) => e.id === turns.cur) || null : null;
    const mineNow = !!cur && cur.own === state.myId;

    /* The current portrait kept in view. By scrollLeft on the rail itself:
       scrollIntoView would scroll the page too. */
    useEffect(() => {
        const el = rail.current;
        const at = el?.querySelector<HTMLElement>('.turn-entry.now');
        if (!el || !at) return;
        const left = at.offsetLeft - el.clientWidth / 2 + at.offsetWidth / 2;
        el.scrollLeft = Math.max(0, left);
    }, [turns?.cur, turns?.order.length]);

    useEffect(() => { if (!mineNow) setDelaying(false); }, [mineNow]);

    if (!turns) {
        /* The GM screen is there and has no fight on the table: say how to
           put one on, since the players can roll no initiative until then. */
        if (!state.isHost || !linked) return null;
        return (
            <section className="turn-strip turn-strip-idle" aria-label="Turn order" data-no-fight="">
                <span className="muted">
                    <i className="fa-solid fa-khanda"></i> No fight on the table. In the GM screen,
                    press <i className="fa-solid fa-tower-broadcast" aria-label="Show on the table"></i> on
                    a fight to show it here and let the players roll initiative.
                </span>
            </section>
        );
    }

    const curIndex = cur ? turns.order.indexOf(cur) : -1;
    /* Where a delay may go: later in this pass, behind somebody still to act. */
    const later = turns.order.filter((e, i) => i > curIndex && !e.done && !e.out);

    return (
        <section className="turn-strip" aria-label="Turn order">
            <div className="turn-head">
                <span className="turn-title">
                    <i className="fa-solid fa-khanda"></i> {turns.name}
                </span>
                <span className="turn-round">Round {turns.round} · Pass {turns.pass}</span>
                <span className="bar-spacer"></span>
                {state.isHost && !linked && (
                    <span className="turn-warn" role="status">
                        <i className="fa-solid fa-link-slash"></i> GM screen not answering
                    </span>
                )}
                {mineNow && (
                    <>
                        <button className="accent" onClick={() => session.combat.act('pass', cur!.id)}>
                            <i className="fa-solid fa-forward"></i> End turn
                        </button>
                        <button
                            aria-expanded={delaying}
                            title="Act later in this pass instead. Costs no action."
                            onClick={() => setDelaying((d) => !d)}
                        >
                            <i className="fa-solid fa-hourglass-half"></i> Delay
                        </button>
                    </>
                )}
                {state.isHost && cur && (
                    <button className="accent" title="End this turn and hand it on" onClick={() => session.combat.next()}>
                        <i className="fa-solid fa-forward"></i> Next turn
                    </button>
                )}
            </div>

            {mineNow && delaying && (
                <div className="turn-delay" role="menu" data-tt-avoid>
                    <span className="muted">Act again…</span>
                    {later.map((e) => (
                        <button
                            key={e.id}
                            role="menuitem"
                            onClick={() => { setDelaying(false); session.combat.act('delay', cur!.id, e.id); }}
                        >
                            after {e.name}
                        </button>
                    ))}
                    <button
                        role="menuitem"
                        onClick={() => { setDelaying(false); session.combat.act('delay', cur!.id); }}
                    >
                        at the end of this pass
                    </button>
                </div>
            )}

            <div className="turn-rail" ref={rail}>
                {turns.order.map((e) => {
                    const mine = !!e.own && e.own === state.myId;
                    /* A player's character wears that player's colour. */
                    const owner = e.own ? state.members.find((m) => m.id === e.own) : null;
                    const colored = !!owner && owner.color !== undefined;
                    const cls = 'turn-entry'
                        + (e.id === turns.cur ? ' now' : '')
                        + (e.done ? ' done' : '')
                        + (e.out ? ' out' : '')
                        + (e.own ? ' ally' : ' foe')
                        + (mine ? ' mine' : '')
                        + (colored ? ' by-color' : '');
                    return (
                        <div
                            key={e.id} className={cls} aria-current={e.id === turns.cur ? 'step' : undefined}
                            style={colored ? colorVars(owner!.color) as CSSProperties : undefined}
                        >
                            <div className="turn-face"><Face e={e} /></div>
                            <span className="turn-name">{e.name}</span>
                            {e.acted !== undefined && (
                                <span className="turn-pips" aria-label={e.acted + ' of ' + MAX_ACTIONS + ' actions used'}>
                                    {Array.from({ length: MAX_ACTIONS }, (_, i) => (
                                        <span key={i} className={'turn-pip' + (i < e.acted! ? ' used' : '')}></span>
                                    ))}
                                </span>
                            )}
                        </div>
                    );
                })}
                {!turns.order.length && <p className="muted turn-empty">Nobody is in the fight yet.</p>}
            </div>

            {!cur && turns.order.length > 0 && (
                <p className="muted turn-wait">
                    {turns.run
                        ? 'Everyone has spent their actions. The GM starts the next round.'
                        : 'Initiative is being rolled. The GM starts the turns.'}
                </p>
            )}
        </section>
    );
}
