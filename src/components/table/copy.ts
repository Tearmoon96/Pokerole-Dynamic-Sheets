/* Copy to clipboard, with the fallback that matters here.

   navigator.clipboard needs a secure context, which the hosted site always is —
   but a lobby password is 32 characters of punctuation and nobody should have
   to retype one because an API was unavailable. The execCommand path is
   deprecated and still works everywhere. */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fall through */ }

    try {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        return ok;
    } catch {
        return false;
    }
}
