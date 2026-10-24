/* Signing in with GitHub, so a post can be written on this page.

   The web flow with PKCE: the page sends the reader to GitHub with a random
   `state` and the hash of a random `verifier`, GitHub sends them back with a
   `code`, and contact-worker/ trades code + verifier + the App's secret for a
   user token. The token belongs to the "Pokerole Dynamic Sheets" GitHub App,
   so it can do only what the App may (issues, nothing else) and only on the
   one repository the worker names when it asks — not the reader's own repos.

   It is kept in localStorage: it has to outlive the redirect and a reload,
   and the page's CSP plus the sanitiser are what keep other script from it.
   Tokens last 8 hours and are renewed with the refresh token (6 months). */

import { apiBase, callbackUrl, canSignIn, oauthBase, workerBase } from './config';

const AUTH_KEY = 'pokerole_contact_auth';
const PENDING_KEY = 'pokerole_contact_login';

export interface Session {
    token: string;
    /** ms since epoch; 0 for a token that does not expire. */
    expiresAt: number;
    refresh?: string;
    refreshExpiresAt?: number;
    login: string;
    avatar: string;
}

interface Pending {
    state: string;
    verifier: string;
    /** The hash to return to: the tab, or the post being answered. */
    back: string;
    at: number;
}

interface TokenReply {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
}

const read = <T>(store: Storage, key: string): T | null => {
    try {
        const raw = store.getItem(key);
        return raw ? JSON.parse(raw) as T : null;
    } catch {
        return null;
    }
};

const write = (store: Storage, key: string, value: unknown) => {
    try {
        if (value === null) store.removeItem(key);
        else store.setItem(key, JSON.stringify(value));
    } catch { /* private mode: this page only */ }
};

export function savedSession(): Session | null {
    const s = read<Session>(localStorage, AUTH_KEY);
    return s && typeof s.token === 'string' && typeof s.login === 'string' ? s : null;
}

export function signOut(): void {
    write(localStorage, AUTH_KEY, null);
}

/* ---------------------------------------------------------------- worker */

export interface WorkerConfig {
    configured: boolean;
    clientId?: string;
}

let configPromise: Promise<WorkerConfig> | null = null;

/** Whether sign-in is set up: the worker holds the App's id and secret. A
    worker that does not answer means "not now", never an error page. */
export function workerConfig(): Promise<WorkerConfig> {
    if (!canSignIn()) return Promise.resolve({ configured: false });
    configPromise ??= (async () => {
        try {
            const r = await fetch(workerBase() + '/config', { signal: AbortSignal.timeout(8000) });
            if (!r.ok) return { configured: false };
            const j = await r.json() as WorkerConfig;
            return j.configured && typeof j.clientId === 'string' ? j : { configured: false };
        } catch {
            return { configured: false };
        }
    })();
    return configPromise;
}

async function askWorker(path: string, body: Record<string, string>): Promise<TokenReply> {
    const r = await fetch(workerBase() + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    let j: TokenReply = {};
    try { j = await r.json() as TokenReply; } catch { /* not JSON */ }
    if (!r.ok && !j.error) j.error = 'worker_' + r.status;
    return j;
}

/* ---------------------------------------------------------------- PKCE */

const b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(n: number): string {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return b64url(bytes);
}

async function challengeOf(verifier: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(new Uint8Array(hash));
}

/** Leaves the page for GitHub's "Authorize" screen. */
export async function startSignIn(back: string): Promise<void> {
    const cfg = await workerConfig();
    if (!cfg.configured || !cfg.clientId) throw new Error('Sign-in is not set up yet.');
    const pending: Pending = { state: randomString(24), verifier: randomString(48), back, at: Date.now() };
    write(sessionStorage, PENDING_KEY, pending);
    const q = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: callbackUrl(),
        state: pending.state,
        code_challenge: await challengeOf(pending.verifier),
        code_challenge_method: 'S256',
        allow_signup: 'true',
    });
    location.assign(oauthBase() + '/login/oauth/authorize?' + q.toString());
}

function sessionFrom(t: TokenReply, who: { login: string; avatar: string }): Session {
    const now = Date.now();
    return {
        token: t.access_token!,
        expiresAt: t.expires_in ? now + t.expires_in * 1000 : 0,
        refresh: t.refresh_token,
        refreshExpiresAt: t.refresh_token_expires_in ? now + t.refresh_token_expires_in * 1000 : undefined,
        login: who.login,
        avatar: who.avatar,
    };
}

async function whoIs(token: string): Promise<{ login: string; avatar: string }> {
    const r = await fetch(apiBase() + '/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token },
    });
    if (!r.ok) throw new Error('GitHub did not accept the sign-in (' + r.status + ').');
    const j = await r.json() as { login?: unknown; avatar_url?: unknown };
    if (typeof j.login !== 'string') throw new Error('GitHub sent no account name.');
    return { login: j.login, avatar: typeof j.avatar_url === 'string' ? j.avatar_url : '' };
}

export interface Returned {
    session: Session | null;
    /** The hash the reader left from. */
    back: string;
    error?: string;
}

/** On load: finishes a sign-in GitHub has just sent the reader back from.
    Null when this load is not one. The code is taken off the address bar
    either way, so a reload or a shared link never replays it. */
export async function finishSignIn(): Promise<Returned | null> {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    const state = q.get('state');
    const denied = q.get('error');
    if (!code && !denied) return null;

    const pending = read<Pending>(sessionStorage, PENDING_KEY);
    write(sessionStorage, PENDING_KEY, null);
    const back = pending?.back ?? location.hash;
    history.replaceState(null, '', location.pathname + back);

    if (denied) {
        return { session: null, back, error: denied === 'access_denied' ? 'Sign-in was cancelled.' : 'GitHub refused the sign-in (' + denied + ').' };
    }
    if (!pending || pending.state !== state || Date.now() - pending.at > 30 * 60 * 1000) {
        return { session: null, back, error: 'That sign-in link is stale or was not started here. Please try again.' };
    }
    try {
        const t = await askWorker('/token', { code: code!, verifier: pending.verifier, redirect_uri: callbackUrl() });
        if (!t.access_token) {
            return { session: null, back, error: 'Sign-in failed: ' + (t.error_description || t.error || 'no token') + '.' };
        }
        const session = sessionFrom(t, await whoIs(t.access_token));
        write(localStorage, AUTH_KEY, session);
        return { session, back };
    } catch (e) {
        return { session: null, back, error: e instanceof Error ? e.message : 'Sign-in failed.' };
    }
}

let refreshing: Promise<Session | null> | null = null;

/** A token good for the next minute at least, renewed if need be; null
    means signed out (and the stored session is gone). */
export async function freshSession(): Promise<Session | null> {
    const s = savedSession();
    if (!s) return null;
    if (!s.expiresAt || s.expiresAt - 60_000 > Date.now()) return s;
    if (!s.refresh || (s.refreshExpiresAt && s.refreshExpiresAt < Date.now())) {
        signOut();
        return null;
    }
    refreshing ??= (async () => {
        try {
            const t = await askWorker('/refresh', { refresh_token: s.refresh! });
            if (!t.access_token) {
                /* A refused refresh token is final; a worker that is down is not. */
                if (t.error === 'bad_refresh_token' || t.error === 'invalid_grant') signOut();
                return null;
            }
            const next = sessionFrom(t, { login: s.login, avatar: s.avatar });
            write(localStorage, AUTH_KEY, next);
            return next;
        } catch {
            return null;
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}
