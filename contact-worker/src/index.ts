/* The Contact Center's sign-in helper.

   Three routes and no storage:

     GET  /config    whether sign-in is set up, and the App's public Client ID
     POST /token     { code, verifier, redirect_uri } -> a user token
     POST /refresh   { refresh_token }                -> a renewed one

   The page does everything else straight against api.github.com with the
   token it gets here. The App's secret never leaves this Worker; the code
   GitHub hands back is useless without it, and the PKCE verifier makes it
   useless to anyone but the browser that started the sign-in.

   Every token is asked for with `repository_id`, so it reaches the project's
   own repository and nothing else, whatever the App could do elsewhere. */

interface Env {
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    REPOSITORY_ID: string;
    /** Test seam: a mock GitHub for .verify/contact-e2e.mjs. Set only in
        .dev.vars; the deployed Worker always talks to github.com. */
    GITHUB_OAUTH?: string;
}

/* Only the site, and a page served from this machine while it is worked on.
   A browser always says which page a request comes from and the page cannot
   change it, so no other website can have its visitors sign in through here. */
const SITE_ORIGINS = ['https://tearmoon96.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

const originAllowed = (o: string | null): o is string =>
    o !== null && (SITE_ORIGINS.includes(o) || LOCAL_ORIGIN.test(o));

/* Request bodies are tiny; anything bigger is not ours. */
const MAX_BODY = 4096;

/* A loose brake per Worker instance: a sign-in is two requests, a renewal
   one, so a person never comes near it. */
const WINDOW_MS = 60_000;
const PER_WINDOW = 30;
const seen = new Map<string, { at: number; n: number }>();

function tooMany(ip: string): boolean {
    const now = Date.now();
    if (seen.size > 5000) seen.clear();
    const e = seen.get(ip);
    if (!e || now - e.at > WINDOW_MS) {
        seen.set(ip, { at: now, n: 1 });
        return false;
    }
    e.n++;
    return e.n > PER_WINDOW;
}

function cors(origin: string): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

function json(body: unknown, status: number, origin: string | null): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
            ...(origin ? cors(origin) : {}),
        },
    });
}

/* Read to the end, capped. `wrangler dev` exits if a Worker answers over a
   body it has not read, and production logs it as an error. */
async function readCapped(req: Request): Promise<string | null> {
    if (!req.body) return '';
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let over = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) over = true;
        else chunks.push(value);
    }
    if (over) return null;
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.byteLength; }
    return new TextDecoder().decode(all);
}

const isToken = (s: unknown, max = 512): s is string =>
    typeof s === 'string' && s.length > 0 && s.length <= max && /^[\w.~-]+$/.test(s);

/** Only the fields the page uses go back, whatever GitHub adds. */
function pick(r: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const k of ['access_token', 'expires_in', 'refresh_token', 'refresh_token_expires_in', 'token_type', 'error', 'error_description']) {
        if (r[k] !== undefined) out[k] = r[k];
    }
    return out;
}

async function askGitHub(env: Env, params: Record<string, string>): Promise<Record<string, unknown>> {
    const base = env.GITHUB_OAUTH || 'https://github.com';
    const r = await fetch(base + '/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'pokerole-contact' },
        body: JSON.stringify(params),
    });
    try {
        return await r.json() as Record<string, unknown>;
    } catch {
        return { error: 'github_unavailable', error_description: 'GitHub answered ' + r.status };
    }
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);
        const origin = req.headers.get('Origin');
        const allowed = originAllowed(origin) ? origin : null;
        const configured = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

        if (req.method === 'OPTIONS') {
            await readCapped(req);
            return allowed
                ? new Response(null, { status: 204, headers: cors(allowed) })
                : new Response(null, { status: 403 });
        }

        if (req.method === 'GET' && url.pathname === '/') {
            return new Response('Pokerole Contact Center sign-in helper.\n', { headers: { 'content-type': 'text/plain' } });
        }

        if (req.method === 'GET' && url.pathname === '/config') {
            return json(configured ? { configured, clientId: env.GITHUB_CLIENT_ID } : { configured }, 200, allowed);
        }

        if (req.method !== 'POST' || (url.pathname !== '/token' && url.pathname !== '/refresh')) {
            await readCapped(req);
            return json({ error: 'not_found' }, 404, allowed);
        }

        const raw = await readCapped(req);
        if (!allowed) return json({ error: 'origin_not_allowed' }, 403, null);
        if (!configured) return json({ error: 'not_configured', error_description: 'Sign-in is not set up yet' }, 503, allowed);
        if (tooMany(req.headers.get('CF-Connecting-IP') ?? 'local')) {
            return json({ error: 'slow_down', error_description: 'Too many sign-in attempts; wait a minute' }, 429, allowed);
        }
        if (raw === null) return json({ error: 'too_large' }, 413, allowed);

        let body: Record<string, unknown>;
        try {
            body = JSON.parse(raw || '{}') as Record<string, unknown>;
        } catch {
            return json({ error: 'bad_request' }, 400, allowed);
        }

        if (url.pathname === '/token') {
            const { code, verifier, redirect_uri: redirect } = body;
            if (!isToken(code, 128) || !isToken(verifier, 128) || typeof redirect !== 'string') {
                return json({ error: 'bad_request' }, 400, allowed);
            }
            /* The page can only ask to come back to itself. */
            let back: URL;
            try { back = new URL(redirect); } catch { return json({ error: 'bad_request' }, 400, allowed); }
            if (back.origin !== allowed || !back.pathname.endsWith('/contact-center.html') || back.search || back.hash) {
                return json({ error: 'bad_redirect' }, 400, allowed);
            }
            const r = await askGitHub(env, {
                client_id: env.GITHUB_CLIENT_ID!,
                client_secret: env.GITHUB_CLIENT_SECRET!,
                code,
                code_verifier: verifier,
                redirect_uri: redirect,
                repository_id: env.REPOSITORY_ID,
            });
            return json(pick(r), r.access_token ? 200 : 400, allowed);
        }

        const { refresh_token: refresh } = body;
        if (!isToken(refresh, 1024)) return json({ error: 'bad_request' }, 400, allowed);
        const r = await askGitHub(env, {
            client_id: env.GITHUB_CLIENT_ID!,
            client_secret: env.GITHUB_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: refresh,
        });
        return json(pick(r), r.access_token ? 200 : 400, allowed);
    },
};
