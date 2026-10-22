/** Text made safe to splice into an HTML fragment.

    The toast takes HTML (its messages carry a FontAwesome glyph), so anything
    that came from a file — a trainer's name, a box name, a file name — goes
    through this first. A string version, not the DOM trick the components use,
    so state code with no document in reach can call it too. */
export function escapeHtml(str: unknown): string {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
