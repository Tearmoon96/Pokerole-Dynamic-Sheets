/* The sheet watch's log and a comparison as text, and the file they are
   saved to. Plain text, made here; nothing of it is ever HTML. */

import { changeText } from './watchSheet';
import type { Comparison, WatchEntry } from './watch';

export const clockTime = (at: number): string =>
    new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const stamp = (at: number): string => {
    const d = new Date(at);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export function ctxText(e: WatchEntry): string {
    if (e.ctx === 'fight') return 'In a fight' + (e.fight ? ' (' + e.fight + ')' : '') + (e.round ? ', Round ' + e.round : '');
    if (e.ctx === 'away') return 'Not at the table';
    return 'Out of a fight';
}

export const KIND_TEXT: Record<WatchEntry['kind'], string> = {
    change: 'Changed',
    join: 'Arrived',
    left: 'Left',
};

/** One line for the notice that a warning came in. */
export function headline(e: WatchEntry): string {
    const warns = e.changes.filter((c) => c.sev === 'warn');
    if (e.kind !== 'change') {
        const n = e.changes.length;
        return e.player + (e.kind === 'left' ? ' left' : ' arrived') + ': ' + n + ' difference' + (n === 1 ? '' : 's') + ' from your sheet';
    }
    const c = warns[0] ?? e.changes[0];
    if (!c) return e.player + ': ' + e.trainer;
    return e.player + ': ' + c.who + ' · ' + c.field + ' ' + c.from + ' → ' + c.to
        + (warns.length > 1 ? ' (+' + (warns.length - 1) + ' more)' : '');
}

export function logText(entries: WatchEntry[]): string {
    const out: string[] = ['Sheet watch — ' + stamp(Date.now()), ''];
    for (const e of [...entries].reverse()) {
        out.push(stamp(e.at) + ' · ' + e.player + ' · ' + e.trainer + ' · ' + KIND_TEXT[e.kind] + ' · ' + ctxText(e)
            + (e.ok ? ' · marked fine' : ''));
        if (e.note) out.push('    ' + e.note);
        for (const c of e.changes) out.push('  ' + changeText(c));
        out.push('');
    }
    return out.join('\n');
}

export function comparisonText(c: Comparison): string {
    const out = [
        'Comparison — ' + stamp(Date.now()),
        'Player: ' + c.player + ', trainer "' + c.trainer + '" (their copy from ' + stamp(c.at) + ')',
        c.gm ? 'Your sheet: "' + c.gm.name + '"' : 'Your sheet: none matched',
        '',
        c.gm && !c.changes.length ? 'No differences.' : 'Your sheet → the player’s:',
    ];
    for (const ch of c.changes) out.push('  ' + changeText(ch));
    return out.join('\n');
}

export function saveText(name: string, text: string, type = 'text/plain'): void {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export const fileStamp = (): string => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
