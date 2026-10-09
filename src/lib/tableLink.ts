/* The line between the Map Maker and the rolling table, in the GM's own
   browser.

   The Map Maker renders the players' view of a map (src/map/render/playerView.ts)
   and hands the finished picture to the table tab, which uploads it and shows
   it. A BroadcastChannel only reaches pages of the same origin in the same
   browser profile, so nothing here ever crosses the network — and it is also
   why the link needs both pages opened from the same place: the hosted site,
   or both on localhost. A Map Maker opened from the disk has a different
   origin and simply never hears a table.

   The table speaks only while it is hosting. Players' tabs never open the
   channel, so a Map Maker in a player's browser finds no table to send to. */

export const TABLE_LINK_CHANNEL = 'pds-table-link';

/** How often the table says it is there, and how long silence means gone. */
export const HOST_BEAT_MS = 2000;
export const HOST_LOST_MS = 6000;

/** The kinds of map object the GM can keep off the players' picture. */
export type HideKind = 'stamp' | 'token' | 'label';
export const HIDE_KINDS: readonly HideKind[] = ['stamp', 'token', 'label'];

/** What the GM keeps off one map's players' picture: whole kinds — new ones
    included — and single objects by id. */
export interface PlayerHide { kinds: HideKind[]; ids: string[] }

/** One object on a map, as the table's GM picks from them. */
export interface MapObjectInfo {
    id: string;
    kind: HideKind;
    name: string;
    /** Under full fog, so not drawn for players anyway. */
    fogged: boolean;
}

/** Caps on what the two lists may hold. */
export const MAX_MAP_OBJECTS = 600;
const MAX_HIDE_MAPS = 24;

export type LinkMessage =
    /** Table → Map Maker: a hosted table is open. The table holds several
        maps and shows at most one: `live` names the Map Maker maps it is
        following, `active` the Map Maker map on show (null when the one on
        show is an image file, or nothing is), `shown` whether anything is. */
    | { t: 'host'; table: string; live: string[]; active: string | null; shown: boolean; hide: Record<string, PlayerHide> }
    /** Table → Map Maker: the table was closed or left. */
    | { t: 'bye' }
    /** Map Maker → table: say you are there, now. */
    | { t: 'ping' }
    /** Map Maker → table: a picture of a map, rendered for players. */
    | {
        t: 'image'; seq: number; mapId: string; title: string; live: boolean; image: Blob; w: number; h: number;
        /** Every landmark, token and label on the map, hidden or not. */
        objects: MapObjectInfo[];
    }
    /** Map Maker → table: the map stops following. */
    | { t: 'unlive'; mapId: string }
    /** Table → Map Maker: what became of an image. */
    | { t: 'ack'; seq: number; ok: boolean; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Same-origin pages only, but still checked: a message that does not have
    exactly the expected shape is ignored. */
export function parseLink(raw: unknown): LinkMessage | null {
    if (!isRecord(raw) || typeof raw.t !== 'string') return null;
    const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);
    switch (raw.t) {
        case 'host': {
            const table = str(raw.table, 80);
            const active = raw.active === null ? null : str(raw.active, 80);
            if (table === null || (raw.active !== null && active === null) || typeof raw.shown !== 'boolean') return null;
            if (!Array.isArray(raw.live) || raw.live.length > 200) return null;
            const live = raw.live.map((v) => str(v, 80));
            if (live.some((v) => v === null)) return null;
            /* Absent from a table older than hiding: nothing hidden. */
            const hide = raw.hide === undefined ? {} : parseHides(raw.hide);
            if (!hide) return null;
            return { t: 'host', table, live: live as string[], active, shown: raw.shown, hide };
        }
        case 'bye': return { t: 'bye' };
        case 'ping': return { t: 'ping' };
        case 'image': {
            const mapId = str(raw.mapId, 80), title = str(raw.title, 200);
            if (mapId === null || title === null || typeof raw.live !== 'boolean') return null;
            if (!(raw.image instanceof Blob) || typeof raw.seq !== 'number') return null;
            if (typeof raw.w !== 'number' || typeof raw.h !== 'number') return null;
            const objects = raw.objects === undefined ? [] : parseObjects(raw.objects);
            if (!objects) return null;
            return { t: 'image', seq: raw.seq, mapId, title, live: raw.live, image: raw.image, w: raw.w, h: raw.h, objects };
        }
        case 'unlive': {
            const mapId = str(raw.mapId, 80);
            return mapId === null ? null : { t: 'unlive', mapId };
        }
        case 'ack': {
            if (typeof raw.seq !== 'number' || typeof raw.ok !== 'boolean') return null;
            return { t: 'ack', seq: raw.seq, ok: raw.ok, error: str(raw.error, 300) ?? '' };
        }
        default: return null;
    }
}

const isHideKind = (v: unknown): v is HideKind => typeof v === 'string' && (HIDE_KINDS as readonly string[]).includes(v);

export function parseHide(raw: unknown): PlayerHide | null {
    if (!isRecord(raw) || !Array.isArray(raw.kinds) || !Array.isArray(raw.ids)) return null;
    if (raw.kinds.length > HIDE_KINDS.length || raw.ids.length > MAX_MAP_OBJECTS) return null;
    if (!raw.kinds.every(isHideKind)) return null;
    if (!raw.ids.every((v) => typeof v === 'string' && v.length <= 80)) return null;
    return { kinds: [...new Set(raw.kinds as HideKind[])], ids: [...new Set(raw.ids as string[])] };
}

function parseHides(raw: unknown): Record<string, PlayerHide> | null {
    if (!isRecord(raw)) return null;
    const keys = Object.keys(raw);
    if (keys.length > MAX_HIDE_MAPS) return null;
    const out: Record<string, PlayerHide> = {};
    for (const k of keys) {
        const h = parseHide(raw[k]);
        if (k.length > 80 || !h) return null;
        out[k] = h;
    }
    return out;
}

export function parseObjects(raw: unknown): MapObjectInfo[] | null {
    if (!Array.isArray(raw) || raw.length > MAX_MAP_OBJECTS) return null;
    const out: MapObjectInfo[] = [];
    for (const o of raw) {
        if (!isRecord(o) || typeof o.id !== 'string' || o.id.length > 80 || !isHideKind(o.kind)) return null;
        if (typeof o.name !== 'string' || typeof o.fogged !== 'boolean') return null;
        out.push({ id: o.id, kind: o.kind, name: o.name.slice(0, 80), fogged: o.fogged });
    }
    return out;
}

/** Whether `hide` keeps this object off the players' picture. */
export function isHidden(hide: PlayerHide | null | undefined, kind: HideKind, id: string): boolean {
    return !!hide && (hide.kinds.includes(kind) || hide.ids.includes(id));
}

export function openLink(): BroadcastChannel | null {
    try {
        return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TABLE_LINK_CHANNEL);
    } catch {
        return null;
    }
}
