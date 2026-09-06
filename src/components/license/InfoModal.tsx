import { Modal, ModalClose } from '../common/Modal';
import type { UpdateState } from '../../hooks/useUpdateCheck';

/* How saving, loading and the folder work — plus the version line and the
   update check, which is the only interactive part of this dialog. */

export function InfoModal({ open, onClose, update }: {
    open: boolean; onClose: () => void; update: UpdateState;
}) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            id="info-modal"
            boxStyle={{ maxWidth: '580px', maxHeight: '85vh', overflowY: 'auto' }}
        >
            <ModalClose onClick={onClose} />

            {/* Version line. Always shows what you're running (handy to quote in
                a bug report); the update half stays hidden until a newer release
                is actually found on GitHub.

                justify-content: flex-start (not space-between) on purpose — the
                close button sits absolutely positioned top-right of the modal,
                and right-aligning this row pushed "View on GitHub" straight
                under it. */}
            <div style={{
                marginBottom: '14px', paddingBottom: '14px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                flexWrap: 'wrap', gap: '18px',
            }}>
                <span className="modal-text" style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7 }}>
                    Version <strong id="info-version">{update.current}</strong>
                </span>

                {/* Forces a check past the every-few-minutes floor. .cancel, not
                    .save: bare .form-btn is shape only, and .save is what "View on
                    GitHub" wears — two accent buttons in one short row compete.

                    Hidden on a hosted copy: it updates itself, so there is
                    nothing here for the reader to do. */}
                {update.enabled && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        type="button"
                        id="update-check-btn"
                        className="form-btn cancel"
                        style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                        disabled={update.checking}
                        onClick={() => { void update.checkNow(); }}
                    >
                        Check now
                    </button>
                    <span id="update-status" className="modal-text"
                        style={{ margin: 0, fontSize: '0.78rem', opacity: 0.7 }}>
                        {update.status === 'up-to-date' ? (
                            <>
                                {/* #16a34a rather than a brighter green: the check mark has to
                                    read on the light theme too, where #22c55e drops to ~2:1. */}
                                <i className="fa-solid fa-circle-check" style={{ color: '#16a34a' }}></i>
                                {' '}You’re up to date!
                            </>
                        ) : update.status}
                    </span>
                </span>
                )}

                {update.newer && (
                    <span id="update-available"
                        style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <span className="modal-text"
                            style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ghost-color)' }}>
                            <i className="fa-solid fa-circle-arrow-up"></i>
                            {' '}<strong id="update-latest">{update.latest}</strong> is available
                        </span>
                        {/* .save supplies the fill: bare .form-btn is shape only, so on its
                            own the link renders as default-blue text and vanishes on a dark panel */}
                        <a
                            id="update-link"
                            href={update.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="form-btn save"
                            style={{
                                textDecoration: 'none', fontSize: '0.78rem', padding: '5px 12px',
                                display: 'inline-block', lineHeight: 1.4,
                            }}
                        >
                            View on GitHub
                        </a>
                    </span>
                )}
            </div>

            <div className="modal-title">
                <i className="fa-solid fa-circle-info" style={{ color: 'var(--ghost-color)' }}></i>
                {' '}How saving, loading &amp; the folder work
            </div>

            <p className="modal-text">
                <strong style={{ color: 'var(--text-primary)' }}>🗂️ Trainers — saving &amp; loading</strong><br />
                Your trainers live as <strong>.json</strong> files in a <em>working folder</em>. Click the
                {' '}<i className="fa-solid fa-folder-open"></i> button and pick that folder (the
                {' '}<strong>Trainers and Pokemons</strong> folder) — every trainer in it loads at once, and the
                edge arrows switch between them.
            </p>
            <ul className="modal-text"
                style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <li>
                    Edits are kept live in your browser, but only written to disk when you press
                    {' '}<i className="fa-solid fa-floppy-disk"></i> <strong>Save All</strong>. That button glows
                    {' '}<span style={{ color: '#fbbf24' }}>amber</span> while you have unsaved changes, and the app
                    warns you before you close the tab or open a different folder with unsaved work.
                </li>
                <li>
                    <i className="fa-solid fa-file-circle-plus"></i> <strong>New trainer</strong> asks for a file
                    name and saves it into the folder right away, so it's backed up from the start.
                </li>
                <li>
                    Next time you open the page it starts blank and offers to <strong>Restore last session</strong>
                    {' '}(and checks it against the files on disk).
                </li>
            </ul>

            <p className="modal-text">
                <strong style={{ color: 'var(--text-primary)' }}>🐾 Pokémon</strong><br />
                A trainer's team Pokémon are stored <strong>inside that trainer's own .json</strong> — one file
                holds the trainer and all six Pokémon. Click a team slot to open its <strong>Pokémon card</strong>
                {' '}in a new tab; changes there flow back to the trainer, and <strong>Save All</strong> on the
                license writes them to disk. Wild Pokémon you build can be exported to the
                {' '}<strong>Wild Pokemons</strong> folder and <em>Captured</em> onto a trainer later.
            </p>

            <p className="modal-text">
                <strong style={{ color: 'var(--text-primary)' }}>📦 PC Storage</strong><br />
                Pokémon a trainer owns but isn't carrying live in the <i className="fa-solid fa-box-archive"></i>
                {' '}<strong>PC Storage</strong> window — <strong>six boxes</strong> of 30, renameable, one set per
                trainer. The team strip sits in the same window, so depositing or withdrawing is one drag — or
                click a team slot to store it, and <strong>double-click</strong> a stored Pokémon to open its card.
                Boxes are saved <strong>inside the same trainer .json</strong> as the team, and a stored Pokémon
                stays fully editable.
            </p>

            <p className="modal-text">
                <strong style={{ color: 'var(--text-primary)' }}>🖼️ Custom images</strong><br />
                A small copy of each trainer photo / Pokémon art is embedded in the .json (so a shared file still
                shows a picture). When a working folder is open, the full-resolution original is also saved under
                {' '}<strong>Custom Images/</strong> (a <strong>Trainers</strong> and a <strong>Pokemons</strong>
                {' '}subfolder) and preferred on load. Keep that folder with your trainers when you share them.
            </p>

            <p className="modal-text">
                <strong style={{ color: 'var(--text-primary)' }}>📁 What the app folder must contain</strong><br />
                For everything to work, keep these together:
            </p>
            <ul className="modal-text"
                style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <li><strong>trainer-license.html</strong> &amp; <strong>pokemon-card.html</strong> — the two pages you open.</li>
                <li>
                    <strong>app-data/</strong> — the game data &amp; sprites. <em>Required</em>: without it you'll
                    see a red warning bar and Pokédex data won't load.
                </li>
                <li>
                    <strong>Trainers and Pokemons/</strong> — your working folder of trainer .json files (the app
                    also creates <strong>Custom Images/</strong> and <strong>Wild Pokemons/</strong> inside it).
                </li>
                <li><strong>Pokerole Core Book/</strong> — the rulebook PDFs (reference, optional).</li>
            </ul>
            <p className="modal-text" style={{ opacity: 0.7, fontSize: '0.8rem' }}>
                Tip: works best in Google Chrome, and if you ever rename the <strong>app-data</strong> folder,
                update the one <code>DATA_BASE</code> line inside both HTML files.
            </p>
        </Modal>
    );
}
