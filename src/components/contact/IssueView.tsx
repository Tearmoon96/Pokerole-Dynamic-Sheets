/* One post and its replies, with a reply box for a signed-in reader and the
   owner's close / reopen buttons. */

import { useEffect, useMemo, useState } from 'react';
import { categoryOf, categoryById, MAX_BODY } from '../../contact/categories';
import { canSignIn } from '../../contact/config';
import {
    createComment, fetchComments, fetchIssue, setIssueState, type GhComment, type GhIssue,
} from '../../contact/github';
import { sanitizeHtml } from '../../contact/sanitize';
import { ago, fullDate, readDraft, STATE_ICON, STATE_TEXT, stateOf, writeDraft } from '../../contact/format';
import type { Account } from './ContactApp';

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
                /* The list's count may be behind what was just read. */
                if (listed && listed.comments !== c.length) onChanged({ ...listed, comments: c.length });
            } catch (e) {
                if (live) setError(e instanceof Error ? e.message : String(e));
            }
        })();
        return () => { live = false; };
    }, [n]);

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
            const c = await createComment(token, n, text);
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
            /* A reply typed before closing goes first, as on GitHub. */
            if (reply.trim()) {
                const c = await createComment(token, n, reply.trim());
                setComments((list) => [...(list ?? []), c]);
                setReply('');
            }
            const next = await setIssueState(token, n, state, reason);
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
