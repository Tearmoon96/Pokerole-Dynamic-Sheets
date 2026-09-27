/* Back to the chooser — the landing page that offers the four pages.

   A plain <button> doing a location assignment rather than an <a>: every
   surface this drops into (`type-eff-btn` on the sheets, `icon-btn` on the GM
   screen and the table) is styled for a button, and an anchor would need each
   of those rules taught about a new element to sit on the same baseline.

   Being a button, it gets none of a link's new-tab gestures for free, so it
   does them itself: a middle click, or Ctrl/Cmd-click, opens the chooser in a
   new tab and leaves this page as it is. The middle press is swallowed on the
   way down, or Linux would start autoscroll (or paste) instead.

   The href is relative on purpose. index.html sits beside the four pages both
   in the folder people double-click and at the root of the hosted site, so the
   same string works from `file://` and from GitHub Pages with no branch on
   isHostedOrigin(). */

const HOME = 'index.html';

export function HomeButton({ className, label }: {
    /** The host page's own button class, so it matches its neighbours. */
    className: string;
    /** GM screen and table bars label their buttons; the sheets are icon-only. */
    label?: string;
}) {
    return (
        <button
            className={className}
            onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) { window.open(HOME, '_blank'); return; }
                window.location.href = HOME;
            }}
            onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
            onAuxClick={(e) => {
                if (e.button !== 1) return;
                e.preventDefault();
                window.open(HOME, '_blank');
            }}
            title="Back to the page chooser (middle-click for a new tab)"
        >
            <i className="fa-solid fa-house"></i>{label ? ' ' + label : ''}
        </button>
    );
}
