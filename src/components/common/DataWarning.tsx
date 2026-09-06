/* The red banner for a missing app-data folder.

   The bundles may still be in memory from an earlier load after the folder is
   deleted, so the check that raises this actively probes a known sprite. It is
   deliberately loud: everything on the page depends on that folder. */
export function DataWarning({ dataBase }: { dataBase: string }) {
    return (
        <div
            id="app-data-warning"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100000,
                background: '#7f1d1d', color: '#fff', fontFamily: 'Outfit, sans-serif',
                fontSize: '0.9rem', padding: '10px 16px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: '10px',
                textAlign: 'center', boxShadow: '0 2px 12px #000000aa',
                borderBottom: '1px solid #fca5a5',
            }}
        >
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>
                Application data not found at <strong>{dataBase}</strong> — Pokédex data and
                sprites won't load. Put the <strong>app-data</strong> folder next to this page
                (or fix the DATA_BASE line) and reload.
            </span>
        </div>
    );
}
