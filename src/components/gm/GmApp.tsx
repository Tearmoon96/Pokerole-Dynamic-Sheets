import { useCallback, useEffect, useState } from 'react';
import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { TopBar } from './TopBar';
import { RosterPanel } from './RosterPanel';
import { CombatPanel } from './CombatPanel';
import { DicePanel } from './DicePanel';
import { NpcPanel } from './NpcPanel';
import { NotesPanel } from './NotesPanel';
import { GeneratorPanel } from './GeneratorPanel';
import { MovePanel } from './MovePanel';
import { StatPanel } from './StatPanel';
import { splitTipKey, statsKey } from './StatTip';
import { useTipButtonState } from './MoveTip';
import { AilmentPopover } from './AilmentPopover';
import { cycleStatus } from '../../gm/entities';
import { useCombatLink } from '../../gm/useCombatLink';
import { useGiftResults } from '../../gm/useGiftResults';
import { WORKING_KEY } from '../../state/constants';
import { WILD_OPEN_KEY } from '../../card/cardContext';
import { ActivePanelCtx, panelTabs } from '../../gm/phoneBoard';
import { combatGidOf, isCombatPanelKey } from '../../gm/constants';
import { useDeviceClass } from '../../lib/device';
import type { PokedexEntry } from '../../data/types';
import { useTour } from '../../lib/tour';
import { GuidedTour, useFirstTimeTour } from '../common/Tour';
import { GM_STEPS, GM_TOUR_INTRO } from './tourSteps';

/* The board: six panels side by side, in whatever order and at whatever widths
   the GM has left them. */

export function GmApp({ dataOk }: { dataOk: boolean }) {
    const { state, store } = useGm();
    const { data } = useAppData();
    /* One popup at a time: a token opens its move panel, `statsKey(token)`
       its stats popup (StatTip.tsx). */
    const [tipToken, setTipToken] = useState<string | null>(null);
    const tip = splitTipKey(tipToken);
    useTipButtonState(tipToken);

    /* The phone board shows one panel at a time behind a tab bar — five
       390px panels side by side on a 412px screen means four of them are
       off-screen with nothing to say so. Every other size keeps the strip. */
    const device = useDeviceClass();
    const onPhone = device === 'phone';
    const [activeTab, setActiveTab] = useState<string>('roster');

    const dexById = useCallback((id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null, [data.pokemon]);

    /* The fight on the rolling table, when one is hosted in this browser. */
    useCombatLink(store, dexById);
    /* Wild Pokémon given to players there, and their answers. */
    useGiftResults(store);

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
            if (e.key === WORKING_KEY || e.key === WILD_OPEN_KEY || (e.key || '').indexOf('pokerole_wild_') === 0) refresh();
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

    /* Click a chip: the card's own cycle (see cycleStatus). */
    const onCycleStatus = useCallback((token: string, key: string, ev: React.MouseEvent) => {
        if (ev) ev.stopPropagation();
        cycleStatus(state, dexById, token, key, () => store.save());
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
            <RosterPanel key="roster" onReorder={reorder} onOpenTip={setTipToken} cycleStatus={onCycleStatus} />
        ),
        dice: (
            <DicePanel key="dice" onReorder={reorder} />
        ),
        npc: <NpcPanel key="npc" onReorder={reorder} />,
        generator: <GeneratorPanel key="generator" onReorder={reorder} />,
        notes: <NotesPanel key="notes" onReorder={reorder} />,
    };

    /* Tabs follow the board's own order, so dragging panels on a desktop and
       then picking the tablet up gives the same order in the bar. A panel key
       with no tab entry is skipped rather than rendering a blank button. */
    /* Hidden sections are dropped here rather than collapsed in CSS: .panel is
       `flex: 1 1 390px`, so a panel that is not in the DOM has its width shared
       out among the rest with no extra rule. */
    const shown = state.layout.order.filter((k) => !state.layout.hidden.includes(k));

    /* The combat trackers are not in PANELS: there is one per fight and the
       list is the session's, so they are built here from the key. A key naming
       a fight that is no longer there renders nothing, exactly as an unknown
       key in the order does — normalizeLayout drops both on the next load. */
    const panelFor = (k: string): React.ReactNode => {
        if (!isCombatPanelKey(k)) return PANELS[k];
        const c = state.combats.find((x) => x.gid === combatGidOf(k));
        if (!c) return null;
        return (
            <CombatPanel
                key={k}
                combat={c}
                onReorder={reorder}
                onOpenTip={setTipToken}
                cycleStatus={onCycleStatus}
            />
        );
    };

    const allTabs = panelTabs(state.combats);
    const tabs = shown
        .map((k) => allTabs.find((t) => t.key === k))
        .filter((t): t is typeof allTabs[number] => Boolean(t));

    /* Falls back to the first tab if the selected panel is not in the current
       order — otherwise a board saved without, say, the dice panel would open
       on a tab that shows nothing at all. */
    const active = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key ?? 'roster');

    useFirstTimeTour('gm');

    /* On a phone a tour step names the tab its panel is in; 'combat' is
       whichever fight comes first. */
    const tourView = useTour().view;
    useEffect(() => {
        if (!tourView) return;
        const key = tourView === 'combat' ? tabs.find((t) => isCombatPanelKey(t.key))?.key : tourView;
        if (key && tabs.some((t) => t.key === key)) setActiveTab(key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tourView]);

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
                    {shown.map(panelFor).filter(Boolean)}
                    {!shown.length && (
                        <div className="board-empty">
                            Every section is hidden. Switch one back on with the
                            icons beside the title.
                        </div>
                    )}
                </main>
            </ActivePanelCtx.Provider>

            <MovePanel token={tip.stats ? null : tip.token} onClose={() => setTipToken(null)}
                onStats={(t) => setTipToken(statsKey(t))} />
            <StatPanel token={tip.stats ? tip.token : null} onClose={() => setTipToken(null)}
                onMoves={(t) => setTipToken(t)} />
            <AilmentPopover />
            <GuidedTour id="gm" steps={GM_STEPS} intro={GM_TOUR_INTRO} />
        </>
    );
}
