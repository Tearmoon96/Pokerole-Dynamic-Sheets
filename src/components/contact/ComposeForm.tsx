/* Writing a new post. The draft is kept as it is typed, so the trip to
   GitHub's sign-in screen and back (or a closed tab) loses nothing. */

import { useEffect, useState } from 'react';
import {
    browserGuess, buildBody, MAX_BODY, MAX_TITLE, templateUrl, type Category,
} from '../../contact/categories';
import { canSignIn, REPO_URL } from '../../contact/config';
import { createIssue, type GhIssue } from '../../contact/github';
import { readDraft, writeDraft } from '../../contact/format';
import type { Account } from './ContactApp';

interface Draft {
    title: string;
    values: Record<string, string>;
}

function startingDraft(cat: Category): Draft {
    const saved = readDraft<Draft>(cat.id);
    if (saved && typeof saved.title === 'string' && saved.values && typeof saved.values === 'object') return saved;
    const values: Record<string, string> = {};
    for (const f of cat.fields) {
        if (f.id === 'browser') values[f.id] = browserGuess();
    }
    return { title: '', values };
}

export function ComposeForm({ cat, account, onCancel, onPosted }: {
    cat: Category;
    account: Account;
    onCancel: () => void;
    onPosted: (issue: GhIssue) => void;
}) {
    const [draft, setDraft] = useState<Draft>(() => startingDraft(cat));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tried, setTried] = useState(false);

    useEffect(() => { writeDraft(cat.id, draft); }, [cat.id, draft]);

    const setValue = (id: string, v: string) => setDraft((d) => ({ ...d, values: { ...d.values, [id]: v } }));

    const missing = [
        ...(draft.title.trim() ? [] : ['Title']),
        ...cat.fields.filter((f) => f.required && !(draft.values[f.id] ?? '').trim()).map((f) => f.label),
    ];
    const body = buildBody(cat, draft.values);
    const tooLong = body.length > MAX_BODY;

    const send = async () => {
        setTried(true);
        if (missing.length || tooLong || busy) return;
        setBusy(true);
        setError(null);
        try {
            const token = await account.token();
            if (!token) return;
            const issue = await createIssue(token, draft.title.trim().slice(0, MAX_TITLE), body);
            writeDraft(cat.id, null);
            onPosted(issue);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const discard = () => {
        writeDraft(cat.id, null);
        onCancel();
    };

    const signedIn = !!account.session;
    const canHere = account.config?.configured === true;

    return (
        <section className="contact-panel compose" aria-label={'Write a ' + cat.one}>
            <div className="view-top">
                <button className="icon-btn back" onClick={onCancel}><i className="fa-solid fa-arrow-left"></i> Back</button>
                <a className="gh-link" href={templateUrl(REPO_URL, cat)} target="_blank" rel="noopener noreferrer">
                    <i className="fa-brands fa-github"></i> Write it on GitHub instead
                </a>
            </div>
            <h2 className="view-title"><i className={'fa-solid ' + cat.icon}></i> New {cat.one}</h2>
            <p className="panel-lede">
                {cat.lede} It will be public, under your GitHub name. Please check the list first —
                if someone has posted the same thing, a reply or a 👍 there helps more than a copy.
            </p>

            <label className="field">
                <span>Title <b className="req">*</b></span>
                <input
                    type="text"
                    name="title"
                    maxLength={MAX_TITLE}
                    placeholder={cat.titleHint}
                    value={draft.title}
                    onChange={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, title: v })); }}
                />
            </label>

            {cat.fields.map((f) => (
                <label className="field" key={f.id}>
                    <span>{f.label}{f.required && <> <b className="req">*</b></>}</span>
                    {f.kind === 'select' ? (
                        <select
                            name={f.id}
                            value={draft.values[f.id] ?? ''}
                            onChange={(e) => setValue(f.id, e.currentTarget.value)}
                        >
                            <option value="">Choose…</option>
                            {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : f.kind === 'textarea' ? (
                        <textarea
                            name={f.id}
                            rows={f.required ? 6 : 4}
                            placeholder={f.placeholder}
                            value={draft.values[f.id] ?? ''}
                            onChange={(e) => setValue(f.id, e.currentTarget.value)}
                        />
                    ) : (
                        <input
                            type="text"
                            name={f.id}
                            placeholder={f.placeholder}
                            value={draft.values[f.id] ?? ''}
                            onChange={(e) => setValue(f.id, e.currentTarget.value)}
                        />
                    )}
                    {f.hint && <em>{f.hint}</em>}
                </label>
            ))}
            <p className="muted">Markdown works, as on GitHub. To add a screenshot, post first, then use “Open on GitHub” and drop it into a reply.</p>

            {tried && missing.length > 0 && (
                <p className="join-error" role="alert">Still needed: {missing.join(', ')}.</p>
            )}
            {tooLong && <p className="join-error" role="alert">That is longer than GitHub accepts; please shorten it.</p>}
            {error && <p className="join-error" role="alert">{error}</p>}

            <div className="compose-actions">
                <button className="danger" onClick={discard}>Discard</button>
                {signedIn ? (
                    <button className="accent big-ish" data-send disabled={busy} onClick={() => void send()}>
                        <i className={'fa-solid ' + (busy ? 'fa-spinner fa-spin' : 'fa-paper-plane')}></i> Post as {account.session!.login}
                    </button>
                ) : canHere ? (
                    <button className="accent big-ish" data-sign-in onClick={account.signIn}>
                        <i className="fa-brands fa-github"></i> Sign in with GitHub to post
                    </button>
                ) : (
                    <a className="button-link accent" href={templateUrl(REPO_URL, cat)} target="_blank" rel="noopener noreferrer">
                        <i className="fa-brands fa-github"></i> Continue on GitHub
                    </a>
                )}
            </div>
            {!signedIn && (
                <p className="muted sign-note">
                    {canHere
                        ? 'You need a free GitHub account. Signing in only lets this page post and reply here for you — nothing else in your account. What you have written stays here while you sign in.'
                        : !canSignIn()
                            ? 'This copy was opened from the disk, where sign-in cannot work. Your text is kept here; copy it into the GitHub form.'
                            : 'Posting from this page is not switched on yet. Your text is kept here; copy it into the GitHub form.'}
                </p>
            )}
        </section>
    );
}
