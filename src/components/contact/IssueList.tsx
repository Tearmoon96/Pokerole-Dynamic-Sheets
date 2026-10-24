/* One tab: the category's posts, newest first, with a filter and a search. */

import { useMemo, useState } from 'react';
import type { Category } from '../../contact/categories';
import type { GhIssue } from '../../contact/github';
import { ago, fullDate, STATE_ICON, STATE_TEXT, stateOf, type StateKind } from '../../contact/format';

type Filter = 'open' | 'done' | 'all';

const FILTERS: [Filter, string][] = [['open', 'Open'], ['done', 'Closed'], ['all', 'All']];

export function IssueList({ cat, issues, loading, error, loadedAt, onRefresh, onOpen, onWrite }: {
    cat: Category;
    issues: GhIssue[] | null;
    loading: boolean;
    error: string | null;
    loadedAt: number;
    onRefresh: () => void;
    onOpen: (n: number) => void;
    onWrite: () => void;
}) {
    const [filter, setFilter] = useState<Filter>('open');
    const [query, setQuery] = useState('');

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (issues ?? []).filter((i) => {
            if (filter === 'open' && i.state !== 'open') return false;
            if (filter === 'done' && i.state === 'open') return false;
            if (!q) return true;
            return i.title.toLowerCase().includes(q)
                || String(i.number) === q.replace(/^#/, '')
                || (i.user?.login.toLowerCase().includes(q) ?? false)
                || (i.body ?? '').toLowerCase().includes(q);
        });
    }, [issues, filter, query]);

    return (
        <section className="contact-panel" aria-label={cat.name}>
            <div className="panel-head">
                <p className="panel-lede">{cat.lede}</p>
                <button className="accent big-ish" data-write onClick={onWrite}>
                    <i className="fa-solid fa-pen"></i> Write a {cat.one}
                </button>
            </div>

            <div className="list-tools">
                <div className="seg" role="group" aria-label="Show">
                    {FILTERS.map(([f, label]) => (
                        <button
                            key={f}
                            className={filter === f ? 'selected' : ''}
                            aria-pressed={filter === f}
                            onClick={() => setFilter(f)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    className="search"
                    placeholder="Search…"
                    aria-label={'Search ' + cat.name.toLowerCase()}
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                />
                <button
                    className="icon-btn"
                    aria-label="Refresh"
                    title={loadedAt ? 'Checked ' + ago(new Date(loadedAt).toISOString()) : 'Refresh'}
                    disabled={loading}
                    onClick={onRefresh}
                >
                    <i className={'fa-solid fa-rotate' + (loading ? ' fa-spin' : '')}></i>
                </button>
            </div>

            {error && <p className="join-error" role="alert"><i className="fa-solid fa-triangle-exclamation"></i> {error}</p>}

            {issues === null ? (
                <p className="empty-note">{loading ? 'Loading posts from GitHub…' : 'The posts could not be loaded.'}</p>
            ) : shown.length === 0 ? (
                <p className="empty-note">
                    {(issues.length === 0
                        ? 'No ' + cat.name.toLowerCase() + ' yet.'
                        : query ? 'Nothing matches that search.'
                        : filter === 'open' ? 'Nothing open right now.' : 'Nothing closed yet.')}
                </p>
            ) : (
                <ul className="issue-list">
                    {shown.map((i) => <IssueRow key={i.number} issue={i} onOpen={onOpen} />)}
                </ul>
            )}
        </section>
    );
}

function IssueRow({ issue, onOpen }: { issue: GhIssue; onOpen: (n: number) => void }) {
    const st: StateKind = stateOf(issue);
    const votes = issue.reactions?.['+1'] ?? 0;
    return (
        <li>
            <button className="issue-row" data-post={issue.number} onClick={() => onOpen(issue.number)}>
                <i className={'fa-solid ' + STATE_ICON[st] + ' state-' + st} title={STATE_TEXT[st]}></i>
                <span className="issue-main">
                    <span className="issue-title">{issue.title}</span>
                    <span className="issue-meta">
                        #{issue.number} · {issue.user?.login ?? 'ghost'} ·{' '}
                        <span title={fullDate(issue.created_at)}>{ago(issue.created_at)}</span>
                        {st !== 'open' && <span className={'state-chip state-' + st}>{STATE_TEXT[st]}</span>}
                    </span>
                </span>
                <span className="issue-counts">
                    {votes > 0 && <span title={votes + ' 👍'}><i className="fa-solid fa-thumbs-up"></i> {votes}</span>}
                    {issue.comments > 0 && (
                        <span title={issue.comments + (issue.comments === 1 ? ' reply' : ' replies')}>
                            <i className="fa-regular fa-comment"></i> {issue.comments}
                        </span>
                    )}
                </span>
            </button>
        </li>
    );
}
