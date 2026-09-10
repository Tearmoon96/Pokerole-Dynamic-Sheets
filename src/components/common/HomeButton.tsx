/* Back to the chooser — the landing page that offers the four pages.

   A plain <button> doing a location assignment rather than an <a>: every
   surface this drops into (`type-eff-btn` on the sheets, `icon-btn` on the GM
   screen and the table) is styled for a button, and an anchor would need each
   of those rules taught about a new element to sit on the same baseline.

   The href is relative on purpose. index.html sits beside the four pages both
   in the folder people double-click and at the root of the hosted site, so the
   same string works from `file://` and from GitHub Pages with no branch on
   isHostedOrigin(). */

export function HomeButton({ className, label }: {
    /** The host page's own button class, so it matches its neighbours. */
    className: string;
    /** GM screen and table bars label their buttons; the sheets are icon-only. */
    label?: string;
}) {
    return (
        <button
            className={className}
            onClick={() => { window.location.href = 'index.html'; }}
            title="Back to the page chooser"
        >
            <i className="fa-solid fa-house"></i>{label ? ' ' + label : ''}
        </button>
    );
}
