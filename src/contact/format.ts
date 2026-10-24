/* Small display helpers shared by the Contact Center's components. */

import type { GhIssue } from './github';

/** "3 days ago", "just now"; the full date is the hint. */
export function ago(iso: string): string {
    const t = Date.parse(iso);
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    const units: [string, number][] = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3600], ['minute', 60]];
    for (const [unit, size] of units) {
        if (s < size) continue;
        const n = Math.floor(s / size);
        return n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
    }
    return 'just now';
}

export const fullDate = (iso: string): string => {
    const t = Date.parse(iso);
    return t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
};

export type StateKind = 'open' | 'resolved' | 'closed';

/** Open; closed as done ("Resolved"); closed any other way. */
export function stateOf(i: GhIssue): StateKind {
    if (i.state === 'open') return 'open';
    return i.state_reason === 'not_planned' || i.state_reason === 'duplicate' ? 'closed' : 'resolved';
}

export const STATE_TEXT: Record<StateKind, string> = {
    open: 'Open',
    resolved: 'Resolved',
    closed: 'Closed',
};

export const STATE_ICON: Record<StateKind, string> = {
    open: 'fa-circle-dot',
    resolved: 'fa-circle-check',
    closed: 'fa-circle-minus',
};

/* What a draft is kept under, per form; a draft survives the trip to
   GitHub's sign-in and back. */
export const draftKey = (what: string): string => 'pokerole_contact_draft_' + what;

export function readDraft<T>(what: string): T | null {
    try {
        const raw = localStorage.getItem(draftKey(what));
        return raw ? JSON.parse(raw) as T : null;
    } catch {
        return null;
    }
}

export function writeDraft(what: string, value: unknown): void {
    try {
        if (value === null) localStorage.removeItem(draftKey(what));
        else localStorage.setItem(draftKey(what), JSON.stringify(value));
    } catch { /* quota or private mode */ }
}
