/* The Contact Center: bug reports, suggestions and requests, read from the
   project's GitHub issues and written to them.

   The address says where the reader is, so the back button and a shared link
   both work:  #bug  #suggestion  #request  (a tab),  #bug/new  (writing),
   #post/12  (one post). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HomeButton } from '../common/HomeButton';
import { CATEGORIES, categoryById, categoryOf, type CategoryId } from '../../contact/categories';
import { REPO_OWNER, REPO_URL, canSignIn, usingLocalServices } from '../../contact/config';
import {
    finishSignIn, freshSession, savedSession, signOut, startSignIn, workerConfig,
    type Session, type WorkerConfig,
} from '../../contact/auth';
import { cachedList, fetchIssues, GhError, LIST_FRESH_MS, rememberIssue, type GhIssue } from '../../contact/github';
import { IssueList } from './IssueList';
import { IssueView } from './IssueView';
import { ComposeForm } from './ComposeForm';

export type Route =
    | { view: 'tab'; tab: CategoryId }
    | { view: 'new'; tab: CategoryId }
    | { view: 'post'; n: number };

export function parseRoute(hash: string): Route {
    const h = hash.replace(/^#/, '');
    const post = /^post\/(\d{1,7})$/.exec(h);
    if (post) return { view: 'post', n: Number(post[1]) };
    const [tab, sub] = h.split('/');
    const cat = categoryById(tab);
    if (!cat) return { view: 'tab', tab: 'bug' };
    return sub === 'new' ? { view: 'new', tab: cat.id } : { view: 'tab', tab: cat.id };
}

export const routeHash = (r: Route): string =>
    r.view === 'post' ? '#post/' + r.n : r.view === 'new' ? '#' + r.tab + '/new' : '#' + r.tab;

/** What the page knows about signing in, for every component that writes. */
export interface Account {
    session: Session | null;
    config: WorkerConfig | null;
    isOwner: boolean;
    /** A token good for the next minute, or null with the reason shown. */
    token: () => Promise<string | null>;
    signIn: () => void;
}

export function ContactApp() {
    const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
    const [session, setSession] = useState<Session | null>(savedSession);
    const [config, setConfig] = useState<WorkerConfig | null>(null);
    const [issues, setIssues] = useState<GhIssue[] | null>(() => cachedList()?.issues ?? null);
    const [loadedAt, setLoadedAt] = useState<number>(() => cachedList()?.at ?? 0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
    const [returning, setReturning] = useState(() => new URLSearchParams(location.search).has('code'));

    const go = useCallback((r: Route) => {
        const h = routeHash(r);
        if (location.hash !== h) history.pushState(null, '', h);
        setRoute(r);
        window.scrollTo({ top: 0 });
    }, []);

    useEffect(() => {
        const onHash = () => setRoute(parseRoute(location.hash));
        window.addEventListener('popstate', onHash);
        window.addEventListener('hashchange', onHash);
        return () => {
            window.removeEventListener('popstate', onHash);
            window.removeEventListener('hashchange', onHash);
        };
    }, []);

    /* Back from GitHub's sign-in screen, perhaps. */
    useEffect(() => {
        void finishSignIn().then((r) => {
            setReturning(false);
            if (!r) return;
            setRoute(parseRoute(r.back));
            if (r.session) {
                setSession(r.session);
                setNotice({ text: 'Signed in as ' + r.session.login + '.' });
            } else if (r.error) {
                setNotice({ text: r.error, bad: true });
            }
        });
        void workerConfig().then(setConfig);
    }, []);

    /* Another tab signed in or out. */
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'pokerole_contact_auth') setSession(savedSession());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const token = useCallback(async () => {
        const s = await freshSession();
        setSession(s);
        if (!s) setNotice({ text: 'Your GitHub sign-in has ended. Sign in again to send this — what you wrote is kept.', bad: true });
        return s?.token ?? null;
    }, []);

    const load = useCallback(async (force = false) => {
        if (!force && Date.now() - (cachedList()?.at ?? 0) < LIST_FRESH_MS) return;
        setLoading(true);
        try {
            const s = await freshSession();
            const list = await fetchIssues(s?.token ?? null);
            setIssues(list);
            setLoadedAt(Date.now());
            setError(null);
        } catch (e) {
            if (e instanceof GhError && e.status === 401) {
                /* A revoked token: read anonymously instead. */
                signOut();
                setSession(null);
                try {
                    setIssues(await fetchIssues(null));
                    setLoadedAt(Date.now());
                    setError(null);
                } catch (e2) {
                    setError(e2 instanceof Error ? e2.message : String(e2));
                }
            } else {
                setError(e instanceof Error ? e.message : String(e));
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    /* Coming back to the tab after a while is the natural moment to look again. */
    useEffect(() => {
        const onVis = () => { if (document.visibilityState === 'visible') void load(); };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, [load]);

    const signIn = useCallback(() => {
        void startSignIn(routeHash(route)).catch((e) => setNotice({ text: String(e.message ?? e), bad: true }));
    }, [route]);

    const account: Account = {
        session,
        config,
        isOwner: !!session && session.login.toLowerCase() === REPO_OWNER.toLowerCase(),
        token,
        signIn,
    };

    /** A post this page has just written or changed, put in the list at once. */
    const upsert = useCallback((issue: GhIssue) => {
        rememberIssue(issue);
        setIssues((list) => {
            const rest = (list ?? []).filter((i) => i.number !== issue.number);
            return [issue, ...rest].sort((a, b) => b.number - a.number);
        });
    }, []);

    const byTab = useMemo(() => {
        const m: Record<CategoryId, GhIssue[]> = { bug: [], suggestion: [], request: [] };
        for (const i of issues ?? []) {
            const c = categoryOf(i.labels.map((l) => l.name), i.body);
            if (c) m[c].push(i);
        }
        return m;
    }, [issues]);

    const tab = route.view === 'post'
        ? (() => {
            const i = issues?.find((x) => x.number === route.n);
            return i ? categoryOf(i.labels.map((l) => l.name), i.body) ?? 'bug' : 'bug';
        })()
        : route.tab;

    return (
        <div className="contact-page">
            <header className="contact-head">
                <HomeButton className="icon-btn" label="Home" />
                <h1><i className="fa-solid fa-headset"></i> Contact Center</h1>
                <div className="contact-account">
                    {session ? (
                        <>
                            {session.avatar && <img className="avatar" src={session.avatar} alt="" />}
                            <span className="who" title={'Signed in to GitHub as ' + session.login}>{session.login}</span>
                            <button
                                className="icon-btn"
                                onClick={() => { signOut(); setSession(null); setNotice({ text: 'Signed out.' }); }}
                            >
                                Sign out
                            </button>
                        </>
                    ) : config?.configured ? (
                        <button className="accent sign-in" onClick={signIn}>
                            <i className="fa-brands fa-github"></i> Sign in with GitHub
                        </button>
                    ) : null}
                </div>
            </header>

            <main className="contact-main">
                <p className="contact-lede">
                    Found a bug, have an idea, or want something new? Write it here. Every post is
                    public and kept on GitHub: anyone can read it, and only the author of the tools
                    can edit, answer as the owner or close it.
                </p>

                {usingLocalServices() && (
                    <p className="setup-warning local">
                        <i className="fa-solid fa-flask"></i> Pointed at local test services.
                    </p>
                )}
                {returning && <p className="contact-notice"><i className="fa-solid fa-spinner fa-spin"></i> Finishing sign-in…</p>}
                {notice && (
                    <p className={'contact-notice' + (notice.bad ? ' bad' : '')} role="status">
                        <span>{notice.text}</span>
                        <button className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </p>
                )}

                <nav className="contact-tabs" role="tablist">
                    {CATEGORIES.map((c) => {
                        const open = byTab[c.id].filter((i) => i.state === 'open').length;
                        return (
                            <button
                                key={c.id}
                                role="tab"
                                aria-selected={tab === c.id}
                                className={tab === c.id ? 'selected' : ''}
                                data-tab={c.id}
                                onClick={() => go({ view: 'tab', tab: c.id })}
                            >
                                <i className={'fa-solid ' + c.icon}></i> {c.name}
                                {issues && <span className="count" title={open + ' open'}>{open}</span>}
                            </button>
                        );
                    })}
                </nav>

                {route.view === 'post' ? (
                    <IssueView
                        key={route.n}
                        n={route.n}
                        listed={issues?.find((i) => i.number === route.n) ?? null}
                        account={account}
                        onBack={() => go({ view: 'tab', tab })}
                        onChanged={upsert}
                    />
                ) : route.view === 'new' ? (
                    <ComposeForm
                        key={route.tab}
                        cat={categoryById(route.tab)!}
                        account={account}
                        onCancel={() => go({ view: 'tab', tab: route.tab })}
                        onPosted={(issue) => {
                            upsert(issue);
                            setNotice({ text: 'Posted as #' + issue.number + '. Thank you!' });
                            go({ view: 'post', n: issue.number });
                        }}
                    />
                ) : (
                    <IssueList
                        key={route.tab}
                        cat={categoryById(route.tab)!}
                        issues={issues ? byTab[route.tab] : null}
                        loading={loading}
                        error={error}
                        loadedAt={loadedAt}
                        onRefresh={() => void load(true)}
                        onOpen={(n) => go({ view: 'post', n })}
                        onWrite={() => go({ view: 'new', tab: route.tab })}
                    />
                )}
            </main>

            <footer className="contact-foot">
                <a href={REPO_URL + '/issues'} target="_blank" rel="noopener noreferrer">
                    <i className="fa-brands fa-github"></i> All posts on GitHub
                </a>
                {!canSignIn() && <span> · Opened from the disk: sign-in works on the website.</span>}
            </footer>
        </div>
    );
}
