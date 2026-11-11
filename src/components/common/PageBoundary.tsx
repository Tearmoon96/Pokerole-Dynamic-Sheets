import { Component, useState } from 'react';
import type { CSSProperties, ErrorInfo, ReactNode } from 'react';
import { coerceSheet, coerceTrainer, isRec } from '../../state/coerce';

/* What a page shows when it cannot be drawn.

   React takes the whole page down when anything throws while drawing, and
   until this existed that was all: an empty page. If the cause was something
   in the browser's storage — a damaged sheet — it was empty again on every
   reload, and the only way back was the developer tools, or clearing the
   site's data and every trainer with it.

   So each page's root sits inside this. It says what happened, and offers
   the three things that get someone out without losing anything: a copy of
   everything the browser holds, a repair of the stored sheets (the same
   checks every load now runs, state/coerce.ts), and — for when that is not
   enough — the stored entries one by one, to download and remove.

   Styled inline and built from plain elements on purpose: it has to work
   when the page's own stylesheet is what failed, and under the page's CSP. */

/** Never put in a copy someone may send on for help: the table's passwords
    and the Contact Center's sign-in. */
const PRIVATE_KEYS = new Set(['pokerole_table_session', 'pokerole_table_moved', 'pokerole_contact_auth']);
const OURS = /^pokerole_/;
const TRIED_KEY = 'pokerole_repair_tried';

function ourKeys(): string[] {
    const out: string[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && OURS.test(k)) out.push(k);
        }
    } catch { /* storage unreachable */ }
    return out.sort();
}

function save(name: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Everything of ours in this browser's storage, as one file. */
function downloadAll(): void {
    const keys: Record<string, string> = {};
    for (const k of ourKeys()) {
        if (PRIVATE_KEYS.has(k)) continue;
        try { keys[k] = localStorage.getItem(k) ?? ''; } catch { /* skipped */ }
    }
    save('pokerole-browser-data-' + today() + '.json',
        JSON.stringify({ _pokeroleBrowserData: true, savedAt: new Date().toISOString(), page: location.pathname, keys }, null, 2));
}

/** Runs the stored sheets through the checks every load runs. Returns how
    many entries it rewrote. */
function repairStored(): number {
    let fixed = 0;
    for (const k of ourKeys()) {
        let raw: string | null = null;
        try { raw = localStorage.getItem(k); } catch { continue; }
        if (!raw || (raw[0] !== '{' && raw[0] !== '[')) continue;
        let v: unknown;
        try { v = JSON.parse(raw); } catch { continue; }
        if (!isRec(v)) continue;
        if (Array.isArray(v.trainers)) {
            /* A working set: the browser's own, or a GM's shared trainer. */
            v.trainers = v.trainers.filter((t) => isRec(t) && isRec(t.data));
            for (const t of v.trainers as Record<string, unknown>[]) {
                if (typeof t.id !== 'string') t.id = '';
                if (typeof t.name !== 'string') t.name = '';
                coerceTrainer(t.data);
            }
        } else if (Array.isArray(v.wilds)) {
            /* The GM board: its wilds carry sheets. */
            v.wilds = v.wilds.filter((w) => isRec(w));
            for (const w of v.wilds as Record<string, unknown>[]) w.sheet = coerceSheet(w.sheet) ?? {};
        } else if (/sheet/i.test(k) || 'hp' in v || 'nickname' in v) {
            coerceSheet(v);
        } else continue;
        const next = JSON.stringify(v);
        if (next === raw) continue;
        try { localStorage.setItem(k, next); fixed++; } catch { /* full: left as it was */ }
    }
    return fixed;
}

const S: Record<string, CSSProperties> = {
    wrap: {
        position: 'fixed', inset: 0, overflow: 'auto', background: '#12151c', color: '#e8eaf0', zIndex: 2147483000,
        font: '15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif', padding: '24px 16px', boxSizing: 'border-box',
    },
    box: {
        maxWidth: 680, margin: '0 auto', background: '#1b202b', border: '1px solid #2e3646', borderRadius: 12,
        padding: '22px 24px',
    },
    h1: { margin: '0 0 8px', fontSize: 20 },
    p: { margin: '0 0 12px', color: '#c3c9d6' },
    pre: {
        margin: '0 0 16px', padding: '10px 12px', background: '#10131a', border: '1px solid #2e3646', borderRadius: 8,
        color: '#f3a6b0', fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
    },
    row: { display: 'flex', flexWrap: 'wrap', gap: 10, margin: '0 0 16px' },
    btn: {
        font: 'inherit', padding: '9px 14px', borderRadius: 8, border: '1px solid #3a4459', background: '#252c3a',
        color: '#e8eaf0', cursor: 'pointer',
    },
    main: { background: '#3b6fd4', borderColor: '#3b6fd4', color: '#fff' },
    danger: { background: '#5a1f2a', borderColor: '#8a2f3f', color: '#ffd9df' },
    small: { fontSize: 13, color: '#9aa3b5', margin: '0 0 10px' },
    item: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #2e3646', fontSize: 13,
    },
    key: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' },
    mini: { font: 'inherit', fontSize: 12.5, padding: '4px 9px', borderRadius: 6, border: '1px solid #3a4459', background: '#252c3a', color: '#e8eaf0', cursor: 'pointer' },
};

function size(n: number): string {
    return n < 1024 ? n + ' ch' : n < 1024 * 1024 ? (n / 1024).toFixed(0) + ' K' : (n / 1024 / 1024).toFixed(2) + ' M';
}

/** The stored entries, one by one. Removing takes two presses of the same
    button rather than a question: the page that would ask it is the one that
    is down. */
function StoredList() {
    const [, redraw] = useState(0);
    const [armed, setArmed] = useState('');
    const keys = ourKeys();
    if (!keys.length) return <p style={S.small}>Nothing of this app is stored in this browser.</p>;
    return (
        <div>
            {keys.map((k) => {
                let len = 0;
                try { len = (localStorage.getItem(k) ?? '').length; } catch { /* unreadable */ }
                return (
                    <div key={k} style={S.item}>
                        <span style={S.key} title={k}>{k}</span>
                        <span style={{ color: '#9aa3b5', flex: '0 0 auto' }}>{size(len)}</span>
                        {!PRIVATE_KEYS.has(k) && (
                            <button
                                type="button" style={S.mini}
                                onClick={() => { try { save(k + '.json', localStorage.getItem(k) ?? ''); } catch { /* unreadable */ } }}
                            >
                                Download
                            </button>
                        )}
                        <button
                            type="button" style={{ ...S.mini, ...(armed === k ? S.danger : {}) }}
                            onClick={() => {
                                if (armed !== k) { setArmed(k); return; }
                                try { localStorage.removeItem(k); } catch { /* unreachable */ }
                                setArmed('');
                                redraw((n) => n + 1);
                            }}
                        >
                            {armed === k ? 'Press again to remove' : 'Remove'}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

function Recovery({ page, error }: { page: string; error: Error }) {
    const tried = (() => { try { return sessionStorage.getItem(TRIED_KEY) === '1'; } catch { return false; } })();
    const [list, setList] = useState(tried);
    return (
        <div style={S.wrap} role="alert" id="page-recovery">
            <div style={S.box}>
                <h1 style={S.h1}>{page} could not be shown</h1>
                <p style={S.p}>
                    Something on this page failed while it was being drawn. <strong>Nothing has been deleted</strong>:
                    your trainers, maps and boards are still in this browser, and your <strong>.json</strong> files
                    are untouched.
                </p>
                <pre style={S.pre}>{String(error && error.message ? error.message : error)}</pre>
                {tried && (
                    <p style={S.p}>
                        The repair did not bring the page back. Download a copy below, then remove the entry that
                        belongs to what you had open (a trainer set is <strong>pokerole_working</strong>, the GM
                        board <strong>pokerole_gm_screen</strong>, a map <strong>pokerole_map_…</strong>) and reload.
                    </p>
                )}
                <div style={S.row}>
                    <button type="button" style={{ ...S.btn, ...S.main }} id="recovery-download" onClick={downloadAll}>
                        Download a copy of this browser's data
                    </button>
                    <button
                        type="button" style={S.btn} id="recovery-repair"
                        onClick={() => {
                            repairStored();
                            try { sessionStorage.setItem(TRIED_KEY, '1'); } catch { /* private mode */ }
                            location.reload();
                        }}
                    >
                        Repair stored sheets and reload
                    </button>
                    <button type="button" style={S.btn} onClick={() => location.reload()}>Reload</button>
                </div>
                <p style={S.small}>
                    The copy holds everything this app keeps in this browser, except the rolling table's
                    passwords and your Contact Center sign-in. Keep it somewhere safe before removing anything.
                </p>
                {list
                    ? <StoredList />
                    : (
                        <button type="button" style={S.mini} id="recovery-list" onClick={() => setList(true)}>
                            Show what is stored…
                        </button>
                    )}
            </div>
        </div>
    );
}

export class PageBoundary extends Component<{ page: string; children: ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: unknown): { error: Error } {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('Page failed to draw', error, info.componentStack);
    }

    componentDidMount(): void {
        /* The page drew: a repair tried earlier is done with. A page that
           fails at once never gets here before the failure is caught. */
        window.setTimeout(() => {
            if (this.state.error) return;
            try { sessionStorage.removeItem(TRIED_KEY); } catch { /* private mode */ }
        }, 4000);
    }

    render(): ReactNode {
        if (this.state.error) return <Recovery page={this.props.page} error={this.state.error} />;
        return this.props.children;
    }
}
