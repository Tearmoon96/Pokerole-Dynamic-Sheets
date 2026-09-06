/* Update check — asks GitHub whether a newer release exists.

   It never downloads anything; the user updates the folder by hand.

   Ground rules, because this runs on a page people open offline:
     - Failure is silent. Offline, a dead link, a rate limit, a 404 because no
       release has been published yet — all of it means "no news", never an
       error message. The app works fine without a network and must not imply
       otherwise.
     - A floor between requests, not a cache lifetime. GitHub allows 60 per hour
       per IP to anonymous callers, so back-to-back reloads have to be absorbed
       — but only those.

   UPDATE_FLOOR used to be a 24-hour TTL, and that was wrong in a way worth
   recording. The timestamp is rewritten on every check, findings or not, so
   someone who opens the sheet around the same time each evening always meets a
   cache ~23h old — still "fresh" — and the check is skipped, evening after
   evening. It only ever fired on a load that happened to land more than a day
   after the previous one, which made a new release take days to show up rather
   than a day. Whatever this number becomes, it must stay short enough that a
   normal session gap clears it. */

/* Its own key on purpose: theme lives in the sheet and gets written into
   trainers' .json files, and update bookkeeping must not travel with a shared
   trainer. */
import { isHostedOrigin } from '../data/paths';

export const UPDATE_KEY = 'pokerole_update_check';
export const UPDATE_FLOOR = 5 * 60 * 1000;

/* Whether this copy is one the user has to update by hand.

   Opened from disk it is: a new release means downloading a zip and replacing
   the folder, so the dot on the info button is the only way to find out. Served
   over http(s) it is not: the service worker fetches the new version on the next
   load, so a prompt to "update" would be telling someone already running the
   newest build to go and download it. */
export function updatesAreManual(): boolean {
    return !isHostedOrigin();
}

export interface UpdateStamp {
    lastCheck: number;
    latest?: string;
    url?: string;
    /** Did GitHub actually answer? Drives the manual check's wording. */
    ok?: boolean;
}

export function readUpdateCache(): UpdateStamp | null {
    try { return JSON.parse(localStorage.getItem(UPDATE_KEY) || 'null') || null; } catch { return null; }
}

export function writeUpdateCache(data: UpdateStamp): void {
    try { localStorage.setItem(UPDATE_KEY, JSON.stringify(data)); } catch { /* private mode / full quota */ }
}

/** Compare two dot-separated versions numerically. Returns 1 if a > b, -1 if
    a < b, 0 if equal. Tolerates a leading "v" and differing segment counts, so
    "v1.2" and "1.2.0" come out equal.

    Anything unparseable returns 0 (= "no update"). That is deliberate: a junk
    tag should leave users alone, not nag them about an update forever. */
export function compareVersions(a: unknown, b: unknown): number {
    const parse = (v: unknown) => String(v == null ? '' : v).trim().replace(/^v/i, '').split('.')
        .map((n) => parseInt(n, 10));
    const pa = parse(a), pb = parse(b);
    if (!pa.length || !pb.length || pa.some(isNaN) || pb.some(isNaN)) return 0;
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0, nb = pb[i] || 0;   // missing segment counts as 0
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

/** force=true skips the floor — that's the "Check now" button, which is a
    deliberate act and shouldn't be told to come back in five minutes. */
export async function checkForUpdate(
    appVersion: string, appRepo: string, force = false,
): Promise<UpdateStamp | null> {
    if (!appVersion || !appRepo) return null;

    const cached = readUpdateCache();
    // Asked too soon after the last one? Show what we know, stay off the network.
    if (!force && cached && (Date.now() - (cached.lastCheck || 0)) < UPDATE_FLOOR) return cached;

    /* Don't let a captive portal leave the request hanging forever */
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const stamp: UpdateStamp = { lastCheck: Date.now() };
    /* Did GitHub actually answer? Set inside the try, because a 403 rate limit
       and a 5xx are perfectly ordinary responses and never throw — catching is
       not enough to tell a real answer from a failed one. */
    let answered = false;
    try {
        const res = await fetch('https://api.github.com/repos/' + appRepo + '/releases/latest',
            { headers: { 'Accept': 'application/vnd.github+json' }, signal: ctrl.signal });
        if (res.ok) {
            const data = await res.json();
            if (data && data.tag_name) {
                stamp.latest = String(data.tag_name).replace(/^v/i, '');
                stamp.url = data.html_url;
                answered = true;
            }
        } else if (res.status === 404) {
            /* The repo has no releases at all. Perfectly normal, not an error —
               and a real answer: there is nothing to report. */
            answered = true;
        }
    } catch {
        /* Offline, DNS failure, timeout, blocked by an extension — no news. */
    } finally {
        clearTimeout(timer);
    }
    /* A failed check must not forget what the last good one found. At the old
       24h spacing that barely showed; at five minutes, one load on a dropped
       connection would clear a dot the user was looking at a minute ago. A clean
       404 is exempt — it *is* the answer. */
    if (!answered && cached && cached.latest) {
        stamp.latest = cached.latest;
        stamp.url = cached.url;
    }
    stamp.ok = answered;
    // Stamp the time even on failure, so a spell offline isn't a retry every load
    writeUpdateCache(stamp);
    return stamp;
}
