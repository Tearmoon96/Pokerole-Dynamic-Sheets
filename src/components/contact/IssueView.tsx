/* One post and its replies, with a reply box for a signed-in reader and the
   owner's close / reopen buttons.

   The replies come in by themselves, like a chat (owner's ask, 2026-11-10):
   while the tab is visible the post is checked every 30 s, and at once when
   the tab comes back. A check is ONE call (the post); the replies are read
   again only when the post's `updated_at` or reply count moved. A reader who
   is not signed in checks every 2 minutes instead: GitHub gives an
   anonymous address 60 calls an hour, and the list needs some of them. A
   rate-limit answer pauses the checks until GitHub's reset; other failures
   are skipped quietly, the next check tries again. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryOf, categoryById, MAX_BODY } from '../../contact/categories';
import { canSignIn } from '../../contact/config';
import {
    createComment, fetchComments, fetchIssue, GhError, setIssueState, type GhComment, type GhIssue,
} from '../../contact/github';
import { sanitizeHtml } from '../../contact/sanitize';
import { ago, fullDate, readDraft, STATE_ICON, STATE_TEXT, stateOf, writeDraft } from '../../contact/format';
import type { Account } from './ContactApp';

/** How often an open post is checked for new replies. */
const POLL_SIGNED_MS = 30_000;
const POLL_ANON_MS = 120_000;

export function IssueView({ n, listed, account, onBack, onChanged }: {
    n: number;
    listed: GhIssue | null;
    account: Account;
    onBack: () => void;
    onChanged: (issue: GhIssue) => void;
}) {
    const [issue, setIssue] = useState<GhIssue | null>(listed);
    const [comments, setComments] = useState<GhComment[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reply, setReply] = useState(() => readDraft<string>('reply_' + n) ?? '');
    const [busy, setBusy] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);

    const signedToken = account.session?.token ?? null;

    /** What is on screen, as "updated_at|replies": a check that finds the same skips the replies. */
    const shown = useRef('');
    /** Bumped by every reply or state change sent from here: a check that
        started before one must not put back an older list over it. */
    const edits = useRef(0);
    const changed = useRef(onChanged);
    changed.current = onChanged;

    useEffect(() => {
        let live = true;
        (async () => {
            try {
                const [i, c] = await Promise.all([
                    listed ? Promise.resolve(listed) : fetchIssue(n, signedToken),
                    fetchComments(n, signedToken),
                ]);
                if (!live) return;
                setIssue(i);
                setComments(c);
                shown.current = i.updated_at + '|' + c.length;
                /* The list's count may be behind what was just read. */
                if (listed && listed.comments !== c.length) onChanged({ ...listed, comments: c.length });
            } catch (e) {
                if (live) setError(e instanceof Error ? e.message : String(e));
            }
        })();
        return () => { live = false; };
    }, [n]);

    /* New replies, a close or a reopen, picked up by themselves. */
    useEffect(() => {
        let live = true, running = false, last = Date.now(), pausedUntil = 0;
        const check = async () => {
            if (running || document.visibilityState !== 'visible' || Date.now() < pausedUntil) return;
            running = true;
            last = Date.now();
            const at = edits.current;
            try {
                const i = await fetchIssue(n, signedToken);
                const key = i.updated_at + '|' + i.comments;
                if (!live || at !== edits.current || key === shown.current) return;
                const c = await fetchComments(n, signedToken);
                if (!live || at !== edits.current) return;
                setIssue(i);
                setComments(c);
                shown.current = i.updated_at + '|' + c.length;
                changed.current({ ...i, comments: c.length });
            } catch (e) {
                if (e instanceof GhError && e.resetAt) pausedUntil = e.resetAt;
            } finally {
                running = false;
            }
        };
        const timer = window.setInterval(() => void check(), signedToken ? POLL_SIGNED_MS : POLL_ANON_MS);
        /* Back to the tab: look now, unless a check has only just run. */
        const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - last > 10_000) void check(); };
        document.addEventListener('visibilitychange', onVis);
        return () => { live = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
    }, [n, signedToken]);

    useEffect(() => { writeDraft('reply_' + n, reply.trim() ? reply : null); }, [n, reply]);

    const bodyHtml = useMemo(() => sanitizeHtml(issue?.body_html ?? ''), [issue?.body_html]);

    if (!issue) {
        return (
            <section className="contact-panel">
                <button className="icon-btn back" onClick={onBack}><i className="fa-solid fa-arrow-left"></i> Back</button>
                {error ? <p className="join-error" role="alert">{error}</p> : <p className="empty-note">Loading post #{n}…</p>}
            </section>
        );
    }

    const st = stateOf(issue);
    const cat = categoryById(categoryOf(issue.labels.map((l) => l.name), issue.body) ?? '');
    const author = issue.user?.login ?? 'ghost';

    const send = async () => {
        const text = reply.trim();
        if (!text || busy) return;
        setBusy(true);
        setSendError(null);
        try {
            const token = await account.token();
            if (!token) return;
            edits.current++;
            const c = await createComment(token, n, text);
            edits.current++;
            setComments((list) => [...(list ?? []), c]);
            setReply('');
            onChanged({ ...issue, comments: issue.comments + 1, updated_at: c.created_at });
        } catch (e) {
            setSendError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const changeState = async (state: 'open' | 'closed', reason?: 'completed' | 'not_planned') => {
        setBusy(true);
        setSendError(null);
        try {
            const token = await account.token();
            if (!token) return;
            edits.current++;
            /* A reply typed before closing goes first, as on GitHub. */
            if (reply.trim()) {
                const c = await createComment(token, n, reply.trim());
                setComments((list) => [...(list ?? []), c]);
                setReply('');
            }
            const next = await setIssueState(token, n, state, reason);
            edits.current++;
            const merged: GhIssue = { ...issue, ...next, body_html: next.body_html ?? issue.body_html };
            setIssue(merged);
            onChanged(merged);
        } catch (e) {
            setSendError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="contact-panel issue-view" aria-label={'Post #' + n}>
            <div className="view-top">
                <button className="icon-btn back" onClick={onBack}><i className="fa-solid fa-arrow-left"></i> Back</button>
                <a className="gh-link" href={issue.html_url} target="_blank" rel="noopener noreferrer">
                    <i className="fa-brands fa-github"></i> Open on GitHub
                </a>
            </div>

            <h2 className="view-title">
                {issue.title} <span className="num">#{issue.number}</span>
            </h2>
            <div className="view-meta">
                <span className={'state-pill state-' + st}>
                    <i className={'fa-solid ' + STATE_ICON[st]}></i> {STATE_TEXT[st]}
                </span>
                {cat && <span className="cat-chip"><i className={'fa-solid ' + cat.icon}></i> {cat.one}</span>}
                <span>
                    <b>{author}</b> posted <span title={fullDate(issue.created_at)}>{ago(issue.created_at)}</span>
                </span>
                {issue.locked && <span className="state-chip"><i className="fa-solid fa-lock"></i> Locked</span>}
            </div>

            <Post
                who={issue.user}
                assoc={issue.author_association}
                at={issue.created_at}
                html={bodyHtml}
                isAuthor
            />

            {error && <p className="join-error" role="alert">{error}</p>}
            {comments === null && !error && <p className="empty-note">Loading replies…</p>}
            {comments?.map((c) => (
                <Post
                    key={c.id}
                    who={c.user}
                    assoc={c.author_association}
                    at={c.created_at}
                    html={sanitizeHtml(c.body_html ?? '')}
                    isAuthor={c.user?.login === issue.user?.login}
                />
            ))}

            <div className="reply-box">
                {issue.locked && !account.isOwner ? (
                    <p className="muted"><i className="fa-solid fa-lock"></i> This conversation is locked; no more replies.</p>
                ) : account.session ? (
                    <>
                        <label className="field">
                            <span>Reply as {account.session.login}</span>
                            <textarea
                                rows={4}
                                maxLength={MAX_BODY}
                                value={reply}
                                placeholder="Write a reply… (Markdown works, as on GitHub)"
                                onChange={(e) => setReply(e.currentTarget.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(); }}
                            />
                        </label>
                        {sendError && <p className="join-error" role="alert">{sendError}</p>}
                        <div className="reply-actions">
                            {account.isOwner && (
                                issue.state === 'open' ? (
                                    <>
                                        <button disabled={busy} data-owner="resolve" onClick={() => void changeState('closed', 'completed')}>
                                            <i className="fa-solid fa-circle-check"></i> {reply.trim() ? 'Reply and resolve' : 'Mark resolved'}
                                        </button>
                                        <button disabled={busy} data-owner="decline" onClick={() => void changeState('closed', 'not_planned')}>
                                            <i className="fa-solid fa-circle-minus"></i> Close, not planned
                                        </button>
                                    </>
                                ) : (
                                    <button disabled={busy} data-owner="reopen" onClick={() => void changeState('open')}>
                                        <i className="fa-solid fa-rotate-left"></i> Reopen
                                    </button>
                                )
                            )}
                            <button className="accent" data-send-reply disabled={busy || !reply.trim()} onClick={() => void send()}>
                                <i className={'fa-solid ' + (busy ? 'fa-spinner fa-spin' : 'fa-paper-plane')}></i> Reply
                            </button>
                        </div>
                    </>
                ) : (
                    <p className="muted">
                        {account.config?.configured ? (
                            <>
                                <button className="accent" onClick={account.signIn}>
                                    <i className="fa-brands fa-github"></i> Sign in with GitHub
                                </button>{' '}
                                to reply here, or{' '}
                            </>
                        ) : !canSignIn() ? 'Sign-in works on the website; ' : null}
                        <a href={issue.html_url} target="_blank" rel="noopener noreferrer">reply on GitHub</a>.
                    </p>
                )}
            </div>
        </section>
    );
}

function Post({ who, assoc, at, html, isAuthor }: {
    who: GhComment['user'];
    assoc: string;
    at: string;
    html: string;
    isAuthor: boolean;
}) {
    const owner = assoc === 'OWNER';
    return (
        <article className={'post' + (owner ? ' owner' : '')}>
            <header>
                {who?.avatar_url && <img className="avatar" src={who.avatar_url} alt="" loading="lazy" />}
                <b>{who?.login ?? 'ghost'}</b>
                {owner && <span className="role owner">Owner</span>}
                {!owner && isAuthor && <span className="role">Author</span>}
                <span className="when" title={fullDate(at)}>{ago(at)}</span>
            </header>
            {html.trim()
                ? <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />
                : <div className="post-body muted"><em>No description.</em></div>}
        </article>
    );
}
