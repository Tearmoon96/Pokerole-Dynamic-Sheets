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

export type LinkMessage =
    /** Table → Map Maker: a hosted table is open. `live` names the map the
        table is following, if any. */
    | { t: 'host'; table: string; live: string | null; shown: boolean }
    /** Table → Map Maker: the table was closed or left. */
    | { t: 'bye' }
    /** Map Maker → table: say you are there, now. */
    | { t: 'ping' }
    /** Map Maker → table: a picture of a map, rendered for players. */
    | { t: 'image'; seq: number; mapId: string; title: string; live: boolean; image: Blob; w: number; h: number }
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
            const live = raw.live === null ? null : str(raw.live, 80);
            if (table === null || (raw.live !== null && live === null) || typeof raw.shown !== 'boolean') return null;
            return { t: 'host', table, live, shown: raw.shown };
        }
        case 'bye': return { t: 'bye' };
        case 'ping': return { t: 'ping' };
        case 'image': {
            const mapId = str(raw.mapId, 80), title = str(raw.title, 200);
            if (mapId === null || title === null || typeof raw.live !== 'boolean') return null;
            if (!(raw.image instanceof Blob) || typeof raw.seq !== 'number') return null;
            if (typeof raw.w !== 'number' || typeof raw.h !== 'number') return null;
            return { t: 'image', seq: raw.seq, mapId, title, live: raw.live, image: raw.image, w: raw.w, h: raw.h };
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

export function openLink(): BroadcastChannel | null {
    try {
        return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TABLE_LINK_CHANNEL);
    } catch {
        return null;
    }
}
