/* What the offline copy shows instead of a table.

   A shared lobby needs the network by definition, and a page opened from the
   disk has no origin a relay would accept. Rather than fail somewhere deep in a
   socket handshake, the feature says plainly that it lives on the website and
   offers the way there. */

export const SITE_URL = 'https://tearmoon96.github.io/Pokerole-Dynamic-Sheets/';

export function OfflineNotice({ reason }: { reason?: string }) {
    return (
        <div className="join-screen">
            <div className="join-card offline-card">
                <h1><i className="fa-solid fa-dice"></i> Rolling Table</h1>

                <p className="lede">
                    This one is online only. Everything else in Pokerole Dynamic Sheets
                    works from your own disk, but a shared table needs everyone's browser
                    to reach the same place at the same time.
                </p>

                {reason && <p className="setup-warning">{reason}</p>}

                <a className="site-link" href={SITE_URL + 'rolling-table.html'}>
                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                    Open the rolling table on the website
                </a>

                <p className="muted">
                    Your sheets, your Pokémon and the GM screen carry on working here
                    exactly as they do now — nothing about them depends on this.
                </p>
            </div>
        </div>
    );
}
