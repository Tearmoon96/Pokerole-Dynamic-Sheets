import { useEffect, useState } from 'react';
import { NPC_ID } from '../../state/constants';
import { npcName, npcReadOnly } from '../../state/npcMode';

/* What a License or card opened on a GM's shared trainer says about it: whose
   it is, and whether this player may change it — which the GM can switch
   while the page is open, so it is read again every second. */

export function useNpcMode(): { on: boolean; readOnly: boolean; name: string } {
    const read = () => ({ on: !!NPC_ID, readOnly: npcReadOnly(), name: npcName() });
    const [mode, setMode] = useState(read);
    useEffect(() => {
        if (!NPC_ID) return;
        const poll = window.setInterval(() => {
            const next = read();
            setMode((m) => (m.readOnly === next.readOnly && m.name === next.name ? m : next));
        }, 1000);
        return () => clearInterval(poll);
    }, []);
    return mode;
}

export function npcBannerText(readOnly: boolean): string {
    return readOnly
        ? 'Shared by the GM at the rolling table — read only'
        : 'Shared by the GM at the rolling table — your changes go back to the GM';
}

/** The License's strip across the top, the card's banner in all but name
    (Banners.tsx): pinned in the body's top padding on a desktop, back in the
    flow on a phone through the same `card-banner` class. The card's own is
    its trainer banner. */
export function NpcBanner() {
    const mode = useNpcMode();
    if (!mode.on) return null;
    return (
        <div
            className={'card-banner npc-banner' + (mode.readOnly ? ' read-only' : '')}
            role="status"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px', padding: '7px 14px', textAlign: 'center',
                fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem', fontWeight: 600,
                background: '#0b0713e6', color: '#fff', boxShadow: '0 2px 12px #00000080',
                borderBottom: '1px solid ' + (mode.readOnly ? '#f59e0b88' : '#22c55e88'),
            }}
        >
            <i className={'fa-solid ' + (mode.readOnly ? 'fa-lock' : 'fa-pen-to-square')}></i>
            <span><strong>{mode.name}</strong> · {npcBannerText(mode.readOnly)}</span>
        </div>
    );
}
