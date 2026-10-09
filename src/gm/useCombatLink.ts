/* The GM screen's end of the combat link (src/lib/combatLink.ts): listens for
   a hosting rolling table in this browser, sends it the fight that is on the
   table whenever that fight changes, and applies what the players did. */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { COMBAT_BEAT_MS, COMBAT_LOST_MS, openCombatLink, parseCombatLink } from '../lib/combatLink';
import type { CombatLinkMessage, LinkMember } from '../lib/combatLink';
import type { PokedexEntry } from '../data/types';
import type { GmStore } from './store';
import { buildTurns, canActIn, enterFight, ownedBy, tableCombatOf } from './tableCombat';
import { onPcEdit } from './tablePcs';
import { delayTurn, passTurn, spendQuick } from './turns';
import type { GmCombat, GmState } from './types';

/* ------------------------------------------------- is a table listening */

interface Presence { present: boolean; table: string; members: LinkMember[] }

let presence: Presence = { present: false, table: '', members: [] };
const watchers = new Set<() => void>();
function setPresence(next: Presence): void {
    if (next.present === presence.present && next.table === presence.table
        && JSON.stringify(next.members) === JSON.stringify(presence.members)) return;
    presence = next;
    watchers.forEach((w) => w());
}

/** Whether a hosting table is open in this browser, and who is at it. */
export function useTablePresence(): Presence {
    return useSyncExternalStore(
        (cb) => { watchers.add(cb); return () => { watchers.delete(cb); }; },
        () => presence, () => presence,
    );
}

/* ------------------------------------------------------------ the link */

const LINK_LOCK = 'pds-combat-link';

export function useCombatLink(store: GmStore, dexById: (id: string) => PokedexEntry | null): void {
    const dexRef = useRef(dexById);
    dexRef.current = dexById;

    useEffect(() => {
        const run = linkRun(store, dexRef);
        /* One GM screen tab runs the link: two would each apply every pass
           a player sends. It is the tab the GM is USING — focusing one takes
           the link from the other, which waits its turn — or a second tab
           opened on purpose would be the one that cannot see the table. */
        const locks = (navigator as Navigator & { locks?: LockManager }).locks;
        if (!locks) return run();
        let alive = true;
        let stop: (() => void) | null = null;
        let waiting: AbortController | null = null;
        let gen = 0;
        const ask = (steal: boolean): void => {
            if (!alive || (steal && stop)) return;
            const my = ++gen;
            waiting?.abort();
            const ac = new AbortController();
            waiting = steal ? null : ac;
            let mine: (() => void) | null = null;
            locks.request(LINK_LOCK, steal ? { steal: true } : { signal: ac.signal }, () => {
                if (!alive) return Promise.resolve();
                const teardown = run();
                return new Promise<void>((resolve) => {
                    mine = () => { teardown(); resolve(); };
                    stop = mine;
                });
            }).catch(() => {
                /* Taken by another tab, or a wait this tab gave up: stand
                   down and queue behind whoever has it. */
                if (mine) { const m: () => void = mine; mine = null; if (stop === m) stop = null; m(); }
                if (alive && my === gen) ask(false);
            });
        };
        const take = () => { if (document.visibilityState === 'visible') ask(true); };
        ask(document.visibilityState === 'visible');
        window.addEventListener('focus', take);
        document.addEventListener('visibilitychange', take);
        return () => {
            alive = false;
            window.removeEventListener('focus', take);
            document.removeEventListener('visibilitychange', take);
            waiting?.abort();
            stop?.();
        };
    }, [store]);
}

/* ------------------------------------------------------------ the work */

function setPresenceLost(): void { setPresence({ present: false, table: '', members: [] }); }

function linkRun(store: GmStore, dexRef: { current: (id: string) => PokedexEntry | null }) {
    return (): (() => void) => {
        const ch = openCombatLink();
        if (!ch) return () => { /* no channel in this browser */ };
        let lastBeat = 0;
        let lastSent = '';
        let timer: number | null = null;

        const post = (m: CombatLinkMessage) => { try { ch.postMessage(m); } catch { /* closed */ } };

        const sendTurns = (force: boolean) => {
            if (!presence.present) return;
            const s = store.state;
            const c = tableCombatOf(s);
            const turns = c ? buildTurns(s, c, dexRef.current) : null;
            const text = JSON.stringify(turns);
            if (!force && text === lastSent) return;
            lastSent = text;
            post({ t: 'turns', turns });
        };
        /* Every board change comes through the store; most of them do not
           touch the fight, and the comparison above keeps those off the wire. */
        const schedule = () => {
            if (timer !== null) return;
            timer = window.setTimeout(() => { timer = null; sendTurns(false); }, 120);
        };
        const unsubscribe = store.subscribe(schedule);

        /* The fight on the table, rewritten by `fn`, with who can act. */
        const onTable = (fn: (c: GmCombat, s: GmState) => GmCombat) => store.update((s) => {
            const c = tableCombatOf(s);
            if (!c) return;
            const next = fn(c, s);
            if (next !== c) s.combats = s.combats.map((x) => (x.gid === c.gid ? next : x));
        });

        const onMessage = (e: MessageEvent) => {
            const m = parseCombatLink(e.data);
            if (!m) return;
            const dexById = dexRef.current;
            switch (m.t) {
                case 'host': {
                    const fresh = !presence.present;
                    lastBeat = Date.now();
                    setPresence({ present: true, table: m.table, members: m.members });
                    if (fresh) sendTurns(true);
                    break;
                }
                case 'bye':
                    setPresenceLost();
                    break;
                case 'want':
                    sendTurns(true);
                    break;
                case 'pc':
                    store.update((s) => {
                        const was = s.tablePcs[m.member] || { player: m.player, trainer: null, mons: {} };
                        s.tablePcs = {
                            ...s.tablePcs,
                            [m.member]: m.key === 't'
                                ? { ...was, player: m.player, trainer: m.trainer! }
                                : { ...was, player: m.player, mons: { ...was.mons, [m.key]: m.mon! } },
                        };
                    });
                    break;
                case 'enter':
                    onTable((c, s) => enterFight(s, c, dexById, m.member, m.chars));
                    break;
                case 'act':
                    onTable((c, s) => {
                        if (!ownedBy(c, m.member, m.pid)) return c;
                        const canAct = canActIn(s, dexById);
                        if (m.op === 'eva' || m.op === 'clash') return spendQuick(c, m.pid, m.op);
                        if (c.turn !== m.pid) return c;
                        return m.op === 'pass' ? passTurn(c, canAct) : delayTurn(c, m.after, canAct);
                    });
                    break;
                case 'next':
                    onTable((c, s) => passTurn(c, canActIn(s, dexById)));
                    break;
                default:
                    break;
            }
        };
        ch.addEventListener('message', onMessage);

        /* The GM changed a player's character: tell the table, which tells the
           player. */
        onPcEdit((member, key, op) => post({ t: 'op', member, key, op }));

        post({ t: 'ping' });
        const watch = window.setInterval(() => {
            post({ t: 'ping' });
            if (presence.present && Date.now() - lastBeat > COMBAT_LOST_MS) setPresenceLost();
        }, COMBAT_BEAT_MS);

        return () => {
            unsubscribe();
            onPcEdit(null);
            clearInterval(watch);
            if (timer !== null) clearTimeout(timer);
            ch.removeEventListener('message', onMessage);
            ch.close();
            setPresenceLost();
        };
    };
}
