/* What a tab shows once the table has moved to another tab of this browser.

   Every tab of a browser is the same person at the table — the same keys,
   the same saved session — so only one of them sits there at a time
   (src/table/tabLock.ts). The newest took it; this one says so, and offers
   to take it back. */

import { useTable } from '../../table/TableContext';
import { HomeButton } from '../common/HomeButton';

export function ElsewhereNotice() {
    const { session } = useTable();
    return (
        <div className="join-screen">
            <div className="join-card">
                <HomeButton className="icon-btn join-home" />
                <h1><i className="fa-solid fa-dice"></i> Rolling Table</h1>
                <p className="lede">
                    This table is open in another tab of this browser.
                </p>
                <p className="elsewhere-id">{session.prettyLobbyId}</p>
                <p className="lede">
                    Only one tab can sit at a table, and the newest one took it over.
                    Carry on there, or bring the table back to this tab.
                </p>
                <button className="accent big" onClick={() => void session.resume()}>
                    <i className="fa-solid fa-arrow-right-to-bracket"></i> Use it here
                </button>
            </div>
        </div>
    );
}
