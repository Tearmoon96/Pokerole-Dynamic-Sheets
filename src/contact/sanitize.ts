/* The posts' text, rendered.

   GitHub turns each post's Markdown into HTML (`body_html`) and already
   sanitises it for its own site. This page puts that HTML on our origin, so
   it is filtered again here, by allowlist: only the tags and attributes
   below survive, links must be http(s) or mailto, pictures https. The CSP
   (no inline script) is the line behind this one, not instead of it. */

const TAGS = new Set([
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'del', 's', 'ins', 'sub', 'sup', 'kbd', 'mark', 'small',
    'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'details', 'summary', 'span', 'div', 'input',
]);

/* Dropped WITH their content: what is inside them is not text to read. */
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math',
    'form', 'button', 'select', 'textarea', 'noscript', 'link', 'meta', 'base', 'frame', 'frameset']);

const ATTRS: Record<string, string[]> = {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['align', 'colspan', 'rowspan'],
    td: ['align', 'colspan', 'rowspan'],
    ol: ['start'],
    details: ['open'],
    input: ['type', 'checked'],
};

/* Only absolute addresses: GitHub's own HTML always has them, and a relative
   one would resolve against this site. */
function safeUrl(raw: string, images: boolean): string | null {
    if (!/^(https?:|mailto:)/i.test(raw.trim())) return null;
    try {
        const u = new URL(raw.trim());
        if (images) return u.protocol === 'https:' ? u.href : null;
        return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' ? u.href : null;
    } catch {
        return null;
    }
}

function clean(node: Node, doc: Document): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag)) return null;

    const kids = (into: Node) => {
        for (const c of [...el.childNodes]) {
            const k = clean(c, doc);
            if (k) into.appendChild(k);
        }
    };

    if (!TAGS.has(tag)) {
        /* An unknown wrapper keeps its text. */
        const frag = doc.createDocumentFragment();
        kids(frag);
        return frag;
    }
    /* Task-list boxes only, and never ticked from here. */
    if (tag === 'input' && el.getAttribute('type') !== 'checkbox') return null;

    const out = doc.createElement(tag);
    for (const name of ATTRS[tag] ?? []) {
        const v = el.getAttribute(name);
        if (v === null) continue;
        if (name === 'href') {
            const u = safeUrl(v, false);
            if (u) out.setAttribute('href', u);
        } else if (name === 'src') {
            /* GitHub's own proxy keeps the original in data-canonical-src;
               the src it gives is already the safe copy. */
            const u = safeUrl(v, true);
            if (u) out.setAttribute('src', u);
        } else if (/^(width|height|colspan|rowspan|start)$/.test(name)) {
            if (/^\d{1,4}%?$/.test(v)) out.setAttribute(name, v);
        } else {
            out.setAttribute(name, v.slice(0, 300));
        }
    }
    if (tag === 'a') {
        /* A link whose address was refused keeps only its words. */
        if (!out.hasAttribute('href')) {
            const frag = doc.createDocumentFragment();
            kids(frag);
            return frag;
        }
        out.setAttribute('target', '_blank');
        out.setAttribute('rel', 'noopener noreferrer nofollow ugc');
    }
    if (tag === 'img') {
        out.setAttribute('loading', 'lazy');
        out.setAttribute('referrerpolicy', 'no-referrer');
        if (!out.hasAttribute('src')) return null;
    }
    if (tag === 'input') out.setAttribute('disabled', '');
    kids(out);
    return out;
}

/** HTML from GitHub, reduced to what is safe to show here. */
export function sanitizeHtml(html: string): string {
    const parsed = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    const holder = document.createElement('div');
    for (const c of [...parsed.body.childNodes]) {
        const k = clean(c, document);
        if (k) holder.appendChild(k);
    }
    return holder.innerHTML;
}
