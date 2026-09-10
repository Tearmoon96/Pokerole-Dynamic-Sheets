import { useCallback, useEffect, useState } from 'react';
import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { TopBar } from './TopBar';
import { RosterPanel } from './RosterPanel';
import { CombatPanel } from './CombatPanel';
import { DicePanel } from './DicePanel';
import { NpcPanel } from './NpcPanel';
import { NotesPanel } from './NotesPanel';
import { MovePanel } from './MovePanel';
import { AilmentPopover } from './AilmentPopover';
import { STATUS_ICONS } from '../../gm/ailments';
import { entityRef, writeStatus } from '../../gm/entities';
import { WORKING_KEY } from '../../state/constants';
import { ActivePanelCtx, PANEL_TABS } from '../../gm/phoneBoard';
import { useDeviceClass } from '../../lib/device';
import type { PokedexEntry } from '../../data/types';
import type { GmStatus } from '../../gm/ailments';

/* The board: five panels side by side, in whatever order and at whatever widths
   the GM has left them. */

export function GmApp({ dataOk }: { dataOk: boolean }) {
    const { state, store } = useGm();
    const { data } = useAppData();
    const [tipToken, setTipToken] = useState<string | null>(null);

    /* The phone board shows one panel at a time behind a tab bar — five
       390px panels side by side on a 412px screen means four of them are
       off-screen with nothing to say so. Every other size keeps the strip. */
    const device = useDeviceClass();
    const onPhone = device === 'phone';
    const [activeTab, setActiveTab] = useState<string>('roster');

    const dexById = useCallback((id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null, [data.pokemon]);

    /* Keeping the roster in step with the trainer sheet.

       The License page and every open Pokémon card mirror their edits into
       localStorage, so an HP or Will change there has to reach these bars.
       Three routes, because none of them covers the case on its own:

         - `storage`, which fires in this document when another tab writes.
           Immediate, and the right mechanism — but it is the one thing here that
           is not guaranteed between file:// documents.
         - `focus`, for the tab-back-and-forth case.
         - a poll, for the case this page is built for: sitting open on a second
           monitor, never focused, while the sheet is edited on the first. It
           compares the stored text and only redraws when it actually changed. */
    useEffect(() => {
        let lastSeen = localStorage.getItem(WORKING_KEY);
        const refresh = () => store.refresh();
        const onStorage = (e: StorageEvent) => {
            if (e.key === WORKING_KEY || (e.key || '').indexOf('pokerole_wild_') === 0) refresh();
        };
        const poll = window.setInterval(() => {
            const now = localStorage.getItem(WORKING_KEY);
            if (now !== lastSeen) { lastSeen = now; refresh(); }
        }, 1000);
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', refresh);
        return () => {
            clearInterval(poll);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', refresh);
        };
    }, [store]);

    /* Click a chip: the card's own cycle. An exclusive status with stages steps
       through them and then off (burn 1st → 2nd → 3rd → none, poison → badly
       poisoned → none); the others simply toggle. */
    const cycleStatus = useCallback((token: string, key: string, ev: React.MouseEvent) => {
        if (ev) ev.stopPropagation();
        const icon = STATUS_ICONS.find((i) => i.key === key);
        if (!icon) return;
        const before = entityRef(state, dexById, token);
        if (!before) return;
        if (icon.exclusive && before.status.major && before.status.major !== key) return;  // locked

        writeStatus(state, token, (st: GmStatus) => {
            if (!icon.exclusive) {
                const rec = st as unknown as Record<string, boolean>;
                rec[key] = !rec[key];
                return;
            }
            if (icon.stageField) {
                st[icon.stageField] = (st[icon.stageField] + 1) % (icon.stages.length + 1);
                st.major = st[icon.stageField] > 0 ? key : null;
            } else {
                st.major = st.major === key ? null : key;
            }
        }, () => store.save());
        store.refresh();
    }, [state, store, dexById]);

    const reorder = useCallback((from: string, to: string) => store.update((s) => {
        const order = s.layout.order.slice();
        const fi = order.indexOf(from);
        const ti = order.indexOf(to);
        if (fi < 0 || ti < 0) return;
        order.splice(fi, 1);
        order.splice(ti, 0, from);
        s.layout = { ...s.layout, order };
    }), [store]);

    const PANELS: Record<string, React.ReactNode> = {
        roster: (
            <RosterPanel key="roster" onReorder={reorder} onOpenTip={setTipToken} cycleStatus={cycleStatus} />
        ),
        combat: (
            <CombatPanel key="combat" onReorder={reorder} onOpenTip={setTipToken} cycleStatus={cycleStatus} />
        ),
        dice: (
            <DicePanel
                key="dice"
                onReorder={reorder}
                onRollDamage={(token, mi, extra) => { setTipToken(token); void mi; void extra; }}
            />
        ),
        npc: <NpcPanel key="npc" onReorder={reorder} />,
        notes: <NotesPanel key="notes" onReorder={reorder} />,
    };

    /* Tabs follow the board's own order, so dragging panels on a desktop and
       then picking the tablet up gives the same order in the bar. A panel key
       with no tab entry is skipped rather than rendering a blank button. */
    /* Hidden sections are dropped here rather than collapsed in CSS: .panel is
       `flex: 1 1 390px`, so a panel that is not in the DOM has its width shared
       out among the rest with no extra rule. */
    const shown = state.layout.order.filter((k) => !state.layout.hidden.includes(k));

    const tabs = shown
        .map((k) => PANEL_TABS.find((t) => t.key === k))
        .filter((t): t is typeof PANEL_TABS[number] => Boolean(t));

    /* Falls back to the first tab if the selected panel is not in the current
       order — otherwise a board saved without, say, the dice panel would open
       on a tab that shows nothing at all. */
    const active = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key ?? 'roster');

    return (
        <>
            <TopBar />
            <div id="data-missing" style={{ display: dataOk ? 'none' : 'block' }}>
                <i className="fa-solid fa-triangle-exclamation"></i>
                {' '}The <strong>app-data</strong> folder was not found next to this file — sprites and
                species data are unavailable. Keep gm-screen.html inside the app folder.
            </div>

            {onPhone && (
                <nav className="gm-tabs" aria-label="Board panels">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            className={'gm-tab' + (t.key === active ? ' active' : '')}
                            aria-current={t.key === active ? 'page' : undefined}
                            onClick={() => setActiveTab(t.key)}
                        >
                            <i className={'fa-solid ' + t.icon}></i>{t.label}
                        </button>
                    ))}
                </nav>
            )}

            {/* Every panel stays mounted and the unselected ones are hidden in
                CSS, rather than rendering only the active one: unmounting would
                throw away each panel's scroll position and any half-typed field
                in it every time the GM glanced at another tab. */}
            <ActivePanelCtx.Provider value={onPhone ? active : null}>
                <main className="board" id="board">
                    {shown.map((k) => PANELS[k]).filter(Boolean)}
                    {!shown.length && (
                        <div className="board-empty">
                            Every section is hidden. Switch one back on with the
                            icons beside the title.
                        </div>
                    )}
                </main>
            </ActivePanelCtx.Provider>

            <MovePanel token={tipToken} onClose={() => setTipToken(null)} />
            <AilmentPopover />
        </>
    );
}
