/* Where the Contact Center reads from and signs in through.

   The posts themselves are GitHub issues on the project's own repository:
   everyone can read them, anyone with a GitHub account can open one, and only
   the owner can edit, label, close or delete someone else's. GitHub keeps
   them, so there is no database of ours to moderate or lose.

   Reading needs nothing but the public API. Writing from this page needs a
   user token, and getting one needs a client secret that cannot live in a
   public page — that exchange is the one job of contact-worker/. */

export const REPO_OWNER = 'Tearmoon96';
export const REPO_NAME = 'Pokerole-Dynamic-Sheets';
export const REPO = REPO_OWNER + '/' + REPO_NAME;
export const REPO_URL = 'https://github.com/' + REPO;

/* The deployed contact-worker. Until its secrets are set it answers
   `configured: false` and the page offers GitHub's own forms instead. */
export const PRODUCTION_WORKER = 'https://pokerole-contact.tearmoon96.workers.dev';

const API = 'https://api.github.com';
const OAUTH = 'https://github.com';

/* ========================================================================= */
/*  LOCAL TESTING SEAM                                                       */
/*                                                                           */
/*  .verify/contact-e2e.mjs points the page at a mock GitHub and a local     */
/*  worker:                                                                  */
/*                                                                           */
/*    contact-center.html?ghapi=http://localhost:8788                        */
/*        &ghauth=http://localhost:8788&cworker=http://localhost:8789        */
/*                                                                           */
/*  Remembered per browser; an empty value clears it. Inert on a real        */
/*  origin, like the table's `?relay=`: a link must never be able to move    */
/*  someone's sign-in onto a server of the sender's choosing.                */
/* ========================================================================= */
function pageIsLocal(): boolean {
    return location.hostname === 'localhost'
        || location.hostname === '127.0.0.1'
        || location.hostname === '[::1]';
}

function override(param: string): string | null {
    if (!pageIsLocal()) return null;
    const key = 'pokerole_contact_' + param;
    const asked = new URLSearchParams(location.search).get(param);
    try {
        if (asked !== null) {
            if (/^https?:\/\/[^\s]+$/.test(asked)) localStorage.setItem(key, asked.replace(/\/+$/, ''));
            else localStorage.removeItem(key);
        }
        return localStorage.getItem(key);
    } catch {
        return asked && /^https?:\/\//.test(asked) ? asked.replace(/\/+$/, '') : null;
    }
}

export const apiBase = (): string => override('ghapi') ?? API;
export const oauthBase = (): string => override('ghauth') ?? OAUTH;
export const workerBase = (): string => override('cworker') ?? PRODUCTION_WORKER;
export const usingLocalServices = (): boolean => override('ghapi') !== null || override('cworker') !== null;

/** GitHub can only send someone back to a web address: a page opened from
    the disk reads, and links to GitHub's own forms for writing. */
export const canSignIn = (): boolean => location.protocol === 'https:' || location.protocol === 'http:';

/** The address GitHub returns to after sign-in. Always the .html name, so a
    page reached by a clean URL still matches the App's registered callback. */
export function callbackUrl(): string {
    return new URL('contact-center.html', location.href).href.split(/[?#]/)[0];
}
