/* The GitHub REST calls the Contact Center makes, and nothing else.

   Reading is anonymous unless the reader is signed in. GitHub allows an
   address 60 anonymous calls an hour — the reader's own address, not the
   project's account — so the list is kept for a minute in localStorage and
   shown from there at once; a signed-in reader reads with their token (5000
   an hour). `full+json` makes GitHub send each body as HTML it rendered
   itself, which sanitize.ts then filters. */

import { apiBase, REPO } from './config';

export interface GhUser {
    login: string;
    avatar_url: string;
    html_url: string;
}

export interface GhIssue {
    number: number;
    title: string;
    state: 'open' | 'closed';
    state_reason?: 'completed' | 'not_planned' | 'reopened' | 'duplicate' | null;
    user: GhUser | null;
    author_association: string;
    labels: { name: string; color?: string }[];
    comments: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    body?: string | null;
    body_html?: string;
    html_url: string;
    locked: boolean;
    reactions?: { '+1'?: number; total_count?: number };
    pull_request?: unknown;
}

export interface GhComment {
    id: number;
    user: GhUser | null;
    author_association: string;
    body_html?: string;
    created_at: string;
    html_url: string;
}

export class GhError extends Error {
    constructor(message: string, readonly status: number, readonly resetAt?: number) {
        super(message);
    }
}

const ACCEPT = 'application/vnd.github.full+json';

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: ACCEPT, 'X-GitHub-Api-Version': '2022-11-28' };
    if (init.token) headers.Authorization = 'Bearer ' + init.token;
    if (init.body) headers['Content-Type'] = 'application/json';
    let r: Response;
    try {
        r = await fetch(apiBase() + path, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(20000) });
    } catch {
        throw new GhError('GitHub could not be reached. Check the connection and try again.', 0);
    }
    if (r.ok) return await r.json() as T;

    let msg = '';
    try { msg = String((await r.json() as { message?: unknown }).message ?? ''); } catch { /* not JSON */ }
    const remaining = r.headers.get('x-ratelimit-remaining');
    const reset = Number(r.headers.get('x-ratelimit-reset')) * 1000 || undefined;
    if ((r.status === 403 || r.status === 429) && (remaining === '0' || /rate limit/i.test(msg))) {
        const when = reset ? new Date(reset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'a few minutes';
        throw new GhError('GitHub\'s hourly limit for this connection is used up. It resets at ' + when
            + ' — or sign in, which has a much larger one.', r.status, reset);
    }
    if (r.status === 401) throw new GhError('GitHub no longer accepts this sign-in. Please sign in again.', 401);
    if (r.status === 410) throw new GhError('Issues are switched off on this repository.', 410);
    if (r.status === 404) throw new GhError('Not found on GitHub.', 404);
    if (r.status === 422) throw new GhError('GitHub refused it: ' + (msg || 'invalid input') + '.', 422);
    throw new GhError('GitHub answered ' + r.status + (msg ? ': ' + msg : '') + '.', r.status);
}

/* ---------------------------------------------------------------- the list */

const CACHE_KEY = 'pokerole_contact_cache';
/** How long the stored list counts as fresh enough not to ask again. */
export const LIST_FRESH_MS = 60_000;
const MAX_PAGES = 5;

export interface CachedList {
    at: number;
    issues: GhIssue[];
}

export function cachedList(): CachedList | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const j = JSON.parse(raw) as CachedList;
        return Array.isArray(j.issues) && typeof j.at === 'number' ? j : null;
    } catch {
        return null;
    }
}

function keep(issues: GhIssue[]): void {
    try {
        const raw = JSON.stringify({ at: Date.now(), issues } satisfies CachedList);
        /* A list too big for a comfortable share of the quota is simply not kept. */
        if (raw.length < 1_500_000) localStorage.setItem(CACHE_KEY, raw);
        else localStorage.removeItem(CACHE_KEY);
    } catch { /* quota or private mode */ }
}

/** Only the fields the page reads, so the stored copy stays small. */
function slim(i: GhIssue): GhIssue {
    return {
        number: i.number, title: i.title, state: i.state, state_reason: i.state_reason ?? null,
        user: i.user ? { login: i.user.login, avatar_url: i.user.avatar_url, html_url: i.user.html_url } : null,
        author_association: i.author_association,
        labels: ((i.labels ?? []) as ({ name: string; color?: string } | string)[])
            .map((l) => (typeof l === 'string' ? { name: l } : { name: l.name, color: l.color })),
        comments: i.comments, created_at: i.created_at, updated_at: i.updated_at, closed_at: i.closed_at,
        body: i.body ?? '', body_html: i.body_html ?? '', html_url: i.html_url, locked: i.locked,
        reactions: { '+1': i.reactions?.['+1'] ?? 0 },
    };
}

/** Every issue, newest first (pull requests left out), up to 500. */
export async function fetchIssues(token: string | null): Promise<GhIssue[]> {
    const all: GhIssue[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const batch = await call<GhIssue[]>(
            '/repos/' + REPO + '/issues?state=all&sort=created&direction=desc&per_page=100&page=' + page,
            { token },
        );
        for (const i of batch) if (!i.pull_request) all.push(slim(i));
        if (batch.length < 100) break;
    }
    keep(all);
    return all;
}

/** A post changed here goes into the stored list too, so a reload before
    the next fetch still shows it. */
export function rememberIssue(issue: GhIssue): void {
    const c = cachedList();
    const issues = (c?.issues ?? []).filter((i) => i.number !== issue.number);
    issues.unshift(slim(issue));
    issues.sort((a, b) => b.number - a.number);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: c?.at ?? 0, issues })); } catch { /* quota */ }
}

/* ---------------------------------------------------------------- one post */

export async function fetchIssue(n: number, token: string | null): Promise<GhIssue> {
    const i = await call<GhIssue>('/repos/' + REPO + '/issues/' + n, { token });
    if (i.pull_request) throw new GhError('That number is a pull request, not a post.', 404);
    return slim(i);
}

export async function fetchComments(n: number, token: string | null): Promise<GhComment[]> {
    const all: GhComment[] = [];
    for (let page = 1; page <= 3; page++) {
        const batch = await call<GhComment[]>('/repos/' + REPO + '/issues/' + n + '/comments?per_page=100&page=' + page, { token });
        all.push(...batch);
        if (batch.length < 100) break;
    }
    return all;
}

export async function createIssue(token: string, title: string, body: string): Promise<GhIssue> {
    return call<GhIssue>('/repos/' + REPO + '/issues', {
        method: 'POST', token, body: JSON.stringify({ title, body }),
    });
}

export async function createComment(token: string, n: number, body: string): Promise<GhComment> {
    return call<GhComment>('/repos/' + REPO + '/issues/' + n + '/comments', {
        method: 'POST', token, body: JSON.stringify({ body }),
    });
}

/** The owner's buttons: close as resolved or not planned, or reopen. GitHub
    refuses it for anyone without push access, whatever this page shows. */
export async function setIssueState(token: string, n: number, state: 'open' | 'closed',
    reason?: 'completed' | 'not_planned'): Promise<GhIssue> {
    return call<GhIssue>('/repos/' + REPO + '/issues/' + n, {
        method: 'PATCH', token,
        body: JSON.stringify(state === 'closed' ? { state, state_reason: reason ?? 'completed' } : { state }),
    });
}
