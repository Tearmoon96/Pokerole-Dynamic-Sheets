/* Shown while the Pokédex and the other bundles load. The old page loaded them
   with document.write, which blocked until they were there; fetching them
   instead means there is a moment to fill, and an empty themed page reads
   better than a half-drawn sheet. */
export function Booting() {
    return (
        <div
            style={{
                position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '14px',
                color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif',
            }}
        >
            <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '1.8rem', color: 'var(--ghost-color)' }}></i>
            <span>Loading Pokédex data…</span>
        </div>
    );
}
