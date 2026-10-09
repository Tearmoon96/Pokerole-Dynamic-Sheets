/* The fight at the table: the turn strip, and players' characters in it.

   The GM runs the fight in the GM screen's combat tracker, in another tab of
   their own browser (src/lib/combatLink.ts). On the GM's table this class is
   the go-between: it shows the players the fight the GM put on the table —
   who is in it, in what order, whose turn it is, and nothing else about the
   GM's side — and carries back what players do with their own characters.

   On a player's table it holds that strip, and the player's side of being in
   the fight: which of their characters are in it, the sheets the GM's copies
   follow (sent whenever they change), and the GM's own changes to them, which
   land on the player's sheet in this browser's working set.

   Who may do what:
     - only the GM's key publishes the strip and the changes (session.ts);
     - a player may pass, delay or spend actions only for combatants the strip
       says are theirs, checked here on the GM's table and again by the GM
       screen, which also checks it is their turn. */

import { COMBAT_BEAT_MS, COMBAT_LOST_MS, openCombatLink, parseCombatLink } from '../lib/combatLink';
import type { CombatLinkMessage, PcOp } from '../lib/combatLink';
import { mutateWorkingTrainer, readWorking } from '../gm/workingSet';
import { normalizeStatus } from '../gm/ailments';
import type { TrainerState } from '../state/types';
import { slimMon, slimTrainer } from './slim';
import type { CharKey, SlimMon, SlimTrainer } from './slim';
import { randomId } from './protocol';
import type { Body, TurnOp, WireTurns } from './protocol';
import type { TableApi } from './link';

export interface CombatView {
    /** The fight on the table, or null. On the GM's table every count is in
        it; a player's carries counts on their own entries only. */
    turns: WireTurns | null;
    /** GM: the GM screen is open in this browser and answering. */
    linked: boolean;
    /** Player: the trainer whose characters are in the fight. */
    trainerId: string | null;
}

/** A player's tie to the fight, kept per lobby so a reload stays in it:
    which trainer, and which Pokémon (by uid) each team key stood for when it
    went in — the team can be rearranged on the License meanwhile. */
interface Binding {
    lobby: string;
    trainerId: string;
    uids: Record<string, string>;
    /** The last change of the GM's applied to each key, by its id. */
    acks?: Record<string, string>;
}
const BIND_KEY = 'pokerole_table_pc';

function loadBinding(lobby: string): Binding | null {
    try {
        const b = JSON.parse(localStorage.getItem(BIND_KEY) || 'null');
        return b && b.lobby === lobby && typeof b.trainerId === 'string' ? b : null;
    } catch { return null; }
}
function saveBinding(b: Binding | null): void {
    try {
        if (b) localStorage.setItem(BIND_KEY, JSON.stringify(b)); else localStorage.removeItem(BIND_KEY);
    } catch { /* private mode: the fight is forgotten on reload */ }
}

const trainerData = (id: string): TrainerState | null => {
    const w = readWorking();
    const t = w && Array.isArray(w.trainers) ? w.trainers.find((x) => x.id === id) : null;
    return t ? t.data : null;
};

/** The team slot a key names now: by the uid it had when it went in. */
function slotOf(t: TrainerState, key: string, uids: Record<string, string>): number {
    const team = Array.isArray(t.team) ? t.team : [];
    const uid = uids[key];
    if (uid) {
        const at = team.findIndex((s) => s && s.uid === uid);
        if (at >= 0) return at;
    }
    return +key;
}

/** The strip as players get it: the GM's own combatants carry no counts. */
function forPlayers(t: WireTurns | null): WireTurns | null {
    if (!t) return null;
    return {
        ...t,
        order: t.order.map((e) => (e.own ? e : {
            id: e.id, name: e.name, img: e.img, own: '', ck: '', done: e.done, out: e.out,
        })),
    };
}

export class CombatShare {
    view: CombatView = { turns: null, linked: false, trainerId: null };

    private host = false;
    private lobby = '';
    private rev = 0;
    private published = '';

    /* GM's table */
    private link: BroadcastChannel | null = null;
    private beat: number | null = null;
    private gmSeenAt = 0;
    /** member -> key -> the latest sheet they sent. */
    private sheets = new Map<string, Map<string, { player: string; trainer?: SlimTrainer; mon?: SlimMon }>>();
    /** member -> key -> the GM's latest change, under its id, until the
        player's sheet acknowledges that id. */
    private owed = new Map<string, Map<string, { oid: string; op: PcOp }>>();

    /* player's table */
    private binding: Binding | null = null;
    private sent = new Map<string, string>();
    private pump: number | null = null;
    /** Keys entered but not yet on the strip. */
    private entering = new Set<string>();

    constructor(private api: TableApi) {}

    begin(isHost: boolean, lobbyId: string): void {
        this.end();
        this.host = isHost;
        this.lobby = lobbyId;
        this.rev = 0;
        this.published = '';
        this.view = { turns: null, linked: false, trainerId: null };
        if (isHost) {
            this.link = openCombatLink();
            this.link?.addEventListener('message', this.onLink);
            this.post({ t: 'want' });
            this.beatNow();
            this.beat = window.setInterval(() => this.beatNow(), COMBAT_BEAT_MS);
        } else {
            this.binding = loadBinding(lobbyId);
            this.view.trainerId = this.binding ? this.binding.trainerId : null;
            this.pump = window.setInterval(() => this.sendSheets(), 1000);
        }
        this.api.changed();
    }

    end(): void {
        if (this.beat !== null) clearInterval(this.beat);
        if (this.pump !== null) clearInterval(this.pump);
        this.beat = this.pump = null;
        if (this.link) {
            this.post({ t: 'bye' });
            this.link.removeEventListener('message', this.onLink);
            this.link.close();
            this.link = null;
        }
        this.sheets.clear();
        this.owed.clear();
        this.sent.clear();
        this.entering.clear();
        this.binding = null;
    }

    /* ======================================================== GM's table */

    private post(m: CombatLinkMessage): void {
        try { this.link?.postMessage(m); } catch { /* closed */ }
    }

    private beatNow(): void {
        this.post({ t: 'host', table: this.lobby, members: this.api.members().map((m) => ({ id: m.id, name: m.name })) });
        this.post({ t: 'want' });
        const linked = Date.now() - this.gmSeenAt < COMBAT_LOST_MS;
        if (linked !== this.view.linked) {
            this.view = { ...this.view, linked };
            this.api.changed();
        }
    }

    private onLink = (e: MessageEvent): void => {
        const m = parseCombatLink(e.data);
        if (!m) return;
        if (m.t === 'ping') {
            /* Answered from here, not from the timer: see COMBAT_LOST_MS. */
            this.post({ t: 'host', table: this.lobby, members: this.api.members().map((x) => ({ id: x.id, name: x.name })) });
            return;
        }
        if (m.t === 'turns') {
            this.gmSeenAt = Date.now();
            const first = !this.view.linked;
            /* The GM screen answers every beat with the strip; most of those
               are the same strip again, and redraw nothing. */
            const same = JSON.stringify(m.turns) === JSON.stringify(this.view.turns);
            if (same && !first) return;
            this.view = { ...this.view, turns: m.turns, linked: true };
            this.publish();
            if (first) this.resendSheets();
            this.api.changed();
            return;
        }
        if (m.t === 'op') this.onGmOp(m.member, m.key, m.op);
    };

    /** The strip to everyone, when it changed. */
    private publish(force = false): void {
        if (!this.host) return;
        const turns = forPlayers(this.view.turns);
        const text = JSON.stringify(turns);
        if (!force && text === this.published) return;
        this.published = text;
        void this.api.publish({ k: 'turns', rev: ++this.rev, turns });
    }

    /** On a player's hello and every heartbeat: the strip, and any change of
        the GM's a player has not shown back yet. */
    greet(): void {
        if (!this.host) return;
        this.publish(true);
        for (const [member, keys] of this.owed) {
            for (const [key, o] of keys) this.sendOp(member, key as CharKey, o.oid, o.op);
        }
    }

    /** The GM pressed Next on the table's strip. */
    next(): void {
        if (this.host) this.post({ t: 'next' });
    }

    forget(member: string): void {
        this.sheets.delete(member);
        this.owed.delete(member);
    }

    /** A player's sheet for one of their characters. */
    onPc(member: string, player: string, body: Extract<Body, { k: 'pc' }>): void {
        let mine = this.sheets.get(member);
        if (!mine) this.sheets.set(member, mine = new Map());
        /* Eight is a trainer and six Pokémon with room to spare. */
        if (!mine.has(body.key) && mine.size >= 8) return;
        mine.set(body.key, { player, trainer: body.trainer, mon: body.mon });
        /* Settled once the player has applied it: their sheet now says what
           it says because of it or despite it, and either way it is theirs. */
        const owed = this.owed.get(member);
        if (owed && body.ack && owed.get(body.key)?.oid === body.ack) owed.delete(body.key);
        this.post({ t: 'pc', member, player, key: body.key, trainer: body.trainer, mon: body.mon });
    }

    /** After a reconnect to the GM screen: every sheet it may have missed. */
    private resendSheets(): void {
        for (const [member, keys] of this.sheets) {
            for (const [key, s] of keys) {
                this.post({ t: 'pc', member, player: s.player, key: key as CharKey, trainer: s.trainer, mon: s.mon });
            }
        }
    }

    /** Whether a player can bring characters in now: a fight is on the table,
        the GM screen is answering, and every one of them sent its sheet. */
    canEnter(member: string, keys: CharKey[]): boolean {
        const mine = this.sheets.get(member);
        return !!this.view.turns && this.view.linked && !!mine && keys.every((k) => mine.has(k));
    }

    /** A character's name, from the sheet its player sent, for the feed. */
    charName(member: string, key: CharKey): string {
        const s = this.sheets.get(member)?.get(key);
        if (!s) return '';
        if (s.trainer) return s.trainer.name;
        if (!s.mon) return '';
        const id = s.mon.dexId;
        return s.mon.sheet.nickname || (id.charAt(0).toUpperCase() + id.slice(1));
    }

    /** The host rolled their initiative (session.ts holds the dice). */
    entered(member: string, player: string, chars: { key: CharKey; init: number }[]): void {
        this.post({ t: 'enter', member, player, chars });
    }

    /** A player passing, delaying or spending — for a combatant of theirs. */
    onTurn(member: string, body: Extract<Body, { k: 'turn' }>): void {
        const t = this.view.turns;
        const entry = t ? t.order.find((e) => e.id === body.id) : null;
        if (!t || !entry || entry.own !== member) return;
        if ((body.op === 'pass' || body.op === 'delay') && t.cur !== body.id) return;
        this.post({ t: 'act', member, op: body.op, pid: body.id, after: body.after ?? null });
    }

    private onGmOp(member: string, key: CharKey, op: PcOp): void {
        let keys = this.owed.get(member);
        if (!keys) this.owed.set(member, keys = new Map());
        /* Merged with one not yet acknowledged, under a new id: the player
           applies the whole of it once. */
        const merged = { oid: randomId(6), op: { ...keys.get(key)?.op, ...op } };
        keys.set(key, merged);
        this.sendOp(member, key, merged.oid, merged.op);
    }

    private sendOp(to: string, key: CharKey, oid: string, op: PcOp): void {
        void this.api.publish({ k: 'pcop', to, key, oid, ...op });
    }

    /* ==================================================== player's table */

    /** The strip, from the GM. */
    onTurns(turns: WireTurns | null): void {
        if (this.host) return;
        const me = this.api.myId();
        const was = this.view.turns;
        this.view = { ...this.view, turns };
        if (turns) for (const e of turns.order) if (e.own === me) this.entering.delete(e.ck);
        /* The first strip after joining: the GM's table may have been reloaded
           and lost every sheet, so all of them go again. */
        if (!was && turns) this.sent.clear();
        this.api.changed();
    }

    /** My characters on the strip, by key, with their combatant id. */
    mine(): Map<string, string> {
        const out = new Map<string, string>();
        const me = this.api.myId();
        for (const e of this.view.turns?.order ?? []) if (e.own === me && e.ck) out.set(e.ck, e.id);
        return out;
    }

    /** The key a character of `trainerId` has in the fight — `t:0` or
        `m:0:<slot>`, the panel's tokens — or null when it is not one of the
        characters this browser brought in. */
    keyFor(trainerId: string, token: string): CharKey | null {
        const b = this.binding;
        if (!b || b.trainerId !== trainerId) return null;
        if (token === 't:0') return 't';
        const slot = +token.split(':')[2];
        const uid = trainerData(trainerId)?.team?.[slot]?.uid;
        if (uid) for (const [k, u] of Object.entries(b.uids)) if (u === uid) return k as CharKey;
        return b.uids[String(slot)] ? null : String(slot) as CharKey;
    }

    /** A free key for a team slot coming in: its own number, unless an
        earlier arrival from a since-rearranged team already holds it. */
    newKeyFor(trainerId: string, slot: number, also: string[] = []): CharKey {
        const b = this.binding && this.binding.trainerId === trainerId ? this.binding : null;
        const taken = (k: string) => also.includes(k) || (!!b && !!b.uids[k]);
        if (!taken(String(slot))) return String(slot) as CharKey;
        return (['0', '1', '2', '3', '4', '5'] as CharKey[]).find((k) => !taken(k)) ?? String(slot) as CharKey;
    }

    /** Puts characters of `trainerId` into the fight. `bonus` is each one's
        Dexterity + Alert plus the player's modifier; the GM rolls the die.
        `slot` is where a Pokémon sits on the team now. */
    enter(trainerId: string, chars: { key: CharKey; bonus: number; slot: number | null }[]): string | null {
        if (this.host || !chars.length) return null;
        const t = trainerData(trainerId);
        if (!t) return null;
        if (!this.binding || this.binding.trainerId !== trainerId) {
            this.binding = { lobby: this.lobby, trainerId, uids: {} };
        }
        for (const c of chars) {
            if (c.key === 't' || c.slot === null) continue;
            const slot = (t.team || [])[c.slot];
            if (slot && slot.uid) this.binding.uids[c.key] = slot.uid;
        }
        saveBinding(this.binding);
        this.view = { ...this.view, trainerId };
        chars.forEach((c) => this.entering.add(c.key));
        this.sendSheets(chars.map((c) => c.key));
        const rid = randomId(8);
        void this.api.publish({ k: 'enter', rid, chars: chars.map((c) => ({ key: c.key, bonus: c.bonus })) });
        this.api.changed();
        return rid;
    }

    /** Out of the fight on this side: the GM removes the combatants. */
    unbind(): void {
        this.binding = null;
        saveBinding(null);
        this.entering.clear();
        this.view = { ...this.view, trainerId: null };
        this.api.changed();
    }

    act(op: TurnOp, id: string, after?: string): void {
        if (this.host) return;
        void this.api.publish({ k: 'turn', op, id, ...(after ? { after } : {}) });
    }

    /** Every character of mine in the fight (or on its way in) whose sheet
        changed since it was last sent. `force` sends these keys regardless. */
    private sendSheets(force: string[] = []): void {
        const b = this.binding;
        if (this.host || !b) return;
        const t = trainerData(b.trainerId);
        if (!t) return;
        const keys = new Set<string>([...this.mine().keys(), ...this.entering, ...force]);
        for (const key of keys) {
            let body: Body | null = null;
            const ack = b.acks && b.acks[key] ? { ack: b.acks[key] } : {};
            if (key === 't') body = { k: 'pc', key: 't', ...ack, trainer: slimTrainer(t) };
            else {
                const slot = (t.team || [])[slotOf(t, key, b.uids)];
                if (slot && slot.dexId) {
                    body = { k: 'pc', key: key as CharKey, ...ack, mon: slimMon(slot.dexId, slot.sheet as never) };
                }
            }
            if (!body) continue;
            const text = JSON.stringify(body);
            if (!force.includes(key) && this.sent.get(key) === text) continue;
            this.sent.set(key, text);
            void this.api.publish(body);
        }
    }

    /** The GM changed one of my characters: onto my own sheet it goes. */
    onPcop(body: Extract<Body, { k: 'pcop' }>): void {
        if (this.host || body.to !== this.api.myId() || !this.binding) return;
        const b = this.binding;
        /* A resend of one already applied: the sheet may have moved on since,
           and applying it again would undo the player's own change. */
        if (b.acks && b.acks[body.key] === body.oid) return;
        mutateWorkingTrainer(b.trainerId, (t) => {
            const target = body.key === 't'
                ? t as unknown as Record<string, unknown>
                : (() => {
                    const slot = (t.team || [])[slotOf(t, body.key, b.uids)];
                    if (!slot || !slot.dexId) return null;
                    if (!slot.sheet) slot.sheet = {};
                    return slot.sheet as unknown as Record<string, unknown>;
                })();
            if (!target) return;
            if (body.hp !== undefined) target.hp = body.hp;
            if (body.will !== undefined) target.will = body.will;
            if (body.status !== undefined) target.status = normalizeStatus(body.status);
        });
        b.acks = { ...b.acks, [body.key]: body.oid };
        saveBinding(b);
        /* The acknowledgement goes with the next sheet, which goes now. */
        this.sent.delete(body.key);
        this.sendSheets();
        this.api.changed();
    }
}
