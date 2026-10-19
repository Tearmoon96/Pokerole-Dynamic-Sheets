/* The GM screen's end of the combat link (src/lib/combatLink.ts): listens for
   a hosting rolling table in this browser, sends it the fight that is on the
   table whenever that fight changes, and applies what the players did. */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { COMBAT_BEAT_MS, COMBAT_LOST_MS, openCombatLink, parseCombatLink } from '../lib/combatLink';
import type { CombatLinkMessage, LinkMember } from '../lib/combatLink';
import type { PokedexEntry } from '../data/types';
import type { GmStore } from './store';
import type { CharKey } from '../table/slim';
import { buildTurns, canActIn, enterFight, ownedBy, tableCombatOf } from './tableCombat';
import { onPcEdit, pcToken, pruneTablePcs } from './tablePcs';
import { addPing } from './rollPings';
import { delayTurn, passTurn, spendRoll } from './turns';
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

/* ------------------------------------------ copies waiting to come in */

/* Players' sheets reach this page whenever they change, for every character
   the table holds a sheet of — not only the ones in a fight. The board is
   saved in localStorage, which every page of the site shares (trainers,
   maps), and a player could otherwise fill it with sheets of characters that
   never come in. So only a character in a fight has its copy on the board;
   the rest wait here, in memory, until they enter. After a reload the table
   sends every sheet again. */
type PcMessage = Extract<CombatLinkMessage, { t: 'pc' }>;
const waiting = new Map<string, Map<CharKey, PcMessage>>();
/** Members whose sheets wait here at once: a table holds 16 people. */
const MAX_WAITING = 16;

function waitIn(m: PcMessage): void {
    const mine = waiting.get(m.member) ?? new Map<CharKey, PcMessage>();
    mine.set(m.key, m);
    waiting.delete(m.member);
    waiting.set(m.member, mine);
    while (waiting.size > MAX_WAITING) {
        const oldest = waiting.keys().next().value;
        if (oldest === undefined) break;
        waiting.delete(oldest);
    }
}

function inAFight(s: GmState, member: string, key: CharKey): boolean {
    const src = pcToken(member, key);
    return s.combats.some((c) => c.participants.some((p) => (p as unknown as { src?: string }).src === src));
}

/** A player's sheet onto the board's copy of their characters. */
function keepCopy(s: GmState, m: PcMessage): void {
    const was = s.tablePcs[m.member] || { player: m.player, trainer: null, mons: {} };
    /* Their colour, as the table's roster has it. */
    const color = presence.members.find((x) => x.id === m.member)?.color ?? was.color;
    const next = m.key === 't'
        ? { ...was, player: m.player, trainer: m.trainer! }
        : { ...was, player: m.player, mons: { ...was.mons, [m.key]: m.mon! } };
    s.tablePcs = { ...s.tablePcs, [m.member]: color === undefined ? next : { ...next, color } };
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
                    /* A player who came back in another colour. */
                    if (m.members.some((x) => x.color !== undefined && store.state.tablePcs[x.id]
                        && store.state.tablePcs[x.id].color !== x.color)) {
                        store.update((s) => {
                            const pcs = { ...s.tablePcs };
                            for (const x of m.members) {
                                if (x.color !== undefined && pcs[x.id]) pcs[x.id] = { ...pcs[x.id], color: x.color };
                            }
                            s.tablePcs = pcs;
                        });
                    }
                    break;
                }
                case 'bye':
                    setPresenceLost();
                    break;
                case 'want':
                    sendTurns(true);
                    break;
                case 'pc':
                    if (!inAFight(store.state, m.member, m.key)) { waitIn(m); break; }
                    store.update((s) => keepCopy(s, m));
                    break;
                case 'enter': {
                    const staged = waiting.get(m.member);
                    onTable((c, s) => {
                        /* The sheets of the characters coming in go onto the
                           board, with the trainer's: a Pokémon's label carries
                           its trainer's name. Whatever no combatant names after
                           the entry — all of it, if the fight turned them away
                           — comes off again. */
                        if (staged) {
                            for (const ch of m.chars) { const pc = staged.get(ch.key); if (pc) keepCopy(s, pc); }
                            const trainer = staged.get('t');
                            if (trainer) keepCopy(s, trainer);
                        }
                        const next = enterFight(s, c, dexById, m.member, m.chars);
                        s.combats = s.combats.map((x) => (x.gid === c.gid ? next : x));
                        pruneTablePcs(s);
                        return next;
                    });
                    break;
                }
                case 'act': {
                    /* An attack, an Evasion or a Clash is the action done: its
                       pip fills (and the move or the mark is used for the
                       Round), and the row lights up to say who just acted. */
                    const fight = tableCombatOf(store.state);
                    if ((m.op === 'acc' || m.op === 'eva' || m.op === 'clash')
                        && fight && ownedBy(fight, m.member, m.pid)) addPing(m.pid, m.op);
                    onTable((c, s) => {
                        if (!ownedBy(c, m.member, m.pid)) return c;
                        const canAct = canActIn(s, dexById);
                        if (m.op === 'acc' || m.op === 'eva' || m.op === 'clash') return spendRoll(c, m.pid, m.op, m.move || undefined);
                        if (c.turn !== m.pid) return c;
                        return m.op === 'pass' ? passTurn(c, canAct) : delayTurn(c, m.after, canAct);
                    });
                    break;
                }
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
