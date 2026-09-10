/* Which relay this page talks to.

   The relay is a Cloudflare Worker deployed from worker/ in this repo. It only
   ever sees ciphertext and a room address, so pointing at a different one
   changes who can DROP messages, never who can read them. */

/* ------------------------------------------------------------------------ */
/*  SET THIS AFTER THE FIRST `wrangler deploy`.                              */
/*                                                                           */
/*  `wrangler deploy` prints the URL it published to. Paste it here with the  */
/*  scheme changed from https:// to wss:// and no trailing slash.            */
/* ------------------------------------------------------------------------ */
export const PRODUCTION_RELAY = 'wss://pokerole-rolling-table.YOUR-SUBDOMAIN.workers.dev';

/* A local override counts as configured, or testing against `wrangler dev`
   before the first deploy would hit the "no relay set up" notice instead of the
   join form — which is precisely the moment someone needs the join form. */
export function relayConfigured(): boolean {
    return localOverride() !== null || !PRODUCTION_RELAY.includes('YOUR-SUBDOMAIN');
}

/* ========================================================================= */
/*  LOCAL TESTING SEAM — safe to delete once the relay is deployed.          */
/*                                                                           */
/*  Lets `wrangler dev` (http://localhost:8787) stand in for the deployed     */
/*  Worker while the feature is being tried out:                             */
/*                                                                           */
/*      http://localhost:5173/rolling-table.html?relay=ws://localhost:8787    */
/*                                                                           */
/*  The choice is remembered, so the query string is only needed once per     */
/*  browser. `?relay=` on its own clears it again.                            */
/*                                                                           */
/*  It is deliberately INERT on a real origin. Without that check, a link     */
/*  like `...github.io/rolling-table.html?relay=wss://attacker.example` would */
/*  quietly move somebody's table onto a relay of the sender's choosing —     */
/*  which still could not decrypt a single roll, but could drop or stall      */
/*  messages at will. A local override is a debugging tool, so it is only     */
/*  honoured on a local page.                                                 */
/* ========================================================================= */
const OVERRIDE_KEY = 'pokerole_table_relay';

function pageIsLocal(): boolean {
    return location.protocol === 'file:'
        || location.hostname === 'localhost'
        || location.hostname === '127.0.0.1'
        || location.hostname === '[::1]';
}

function validRelayUrl(raw: string): string | null {
    try {
        const u = new URL(raw);
        if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
        return raw.replace(/\/+$/, '');
    } catch {
        return null;
    }
}

function localOverride(): string | null {
    if (!pageIsLocal()) return null;

    const asked = new URLSearchParams(location.search).get('relay');
    if (asked !== null) {
        const url = validRelayUrl(asked);
        try {
            if (url) localStorage.setItem(OVERRIDE_KEY, url);
            else localStorage.removeItem(OVERRIDE_KEY);
        } catch { /* private mode: this session only */ }
        return url;
    }

    try {
        const saved = localStorage.getItem(OVERRIDE_KEY);
        return saved ? validRelayUrl(saved) : null;
    } catch {
        return null;
    }
}

/** True when the page is pointed at a hand-set relay, so the UI can say so
    rather than let a developer forget and wonder why nobody else can join. */
export function usingLocalRelay(): boolean {
    return localOverride() !== null;
}
/* ====================== end of the local testing seam ==================== */

export function relayBase(): string {
    return localOverride() ?? PRODUCTION_RELAY;
}

/** The socket URL for one room. The address is the only thing the relay is
    ever told, and it cannot be turned back into a lobby id or a password. */
export function roomUrl(addr: string): string {
    return relayBase() + '/room/' + addr;
}

/** True when a relay is reachable at all — used by the join screen to say
    "the relay is not answering" instead of failing silently later. */
export async function relayReachable(): Promise<boolean> {
    const http = relayBase().replace(/^ws/, 'http');
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(http + '/health', { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
    } catch {
        return false;
    }
}
