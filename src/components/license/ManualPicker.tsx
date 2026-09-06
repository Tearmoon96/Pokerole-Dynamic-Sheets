import { useEffect, useRef, useState } from 'react';
import { Modal, ModalClose } from '../common/Modal';
import { useSheetStore } from '../../state/SheetContext';
import {
    CORE_BOOK_DIR_NAME, MANUALS, MANUAL_FOLDER, MANUAL_QUICKLINK_TEMPLATE,
    manualFileFor, manualJsonFor,
} from '../../lib/manuals';
import type { Manual, ManualBookmark } from '../../lib/manuals';
import {
    deleteCoreBookVersionFile, loadCoreBookVersions, writeCoreBookVersion,
} from '../../lib/coreBook';
import type { CoreBookVersion } from '../../lib/coreBook';
import { isHostedOrigin } from '../../data/paths';

/* The rulebook picker: pick an edition, then jump straight to a page.

   Built-in editions carry the dev-provided quick links. A user-added edition
   keeps its default links in the Core Book folder, so every trainer shares them;
   a trainer's own custom bookmarks stay in that trainer's .json. */

export function ManualPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { sheet, store } = useSheetStore();

    const [versions, setVersions] = useState<CoreBookVersion[]>([]);
    const [current, setCurrent] = useState(MANUALS[0].label);
    /* A just-typed edition, shown as a button before its file exists. */
    const [pendingLabel, setPendingLabel] = useState<string | null>(null);
    const [addingVersion, setAddingVersion] = useState(false);
    const [pdfMissing, setPdfMissing] = useState(false);
    const [newVersion, setNewVersion] = useState('');
    const [addFormOpen, setAddFormOpen] = useState(false);
    const [quickLinkTarget, setQuickLinkTarget] = useState<string | null>(null);

    const versionInput = useRef<HTMLInputElement>(null);
    const labelInput = useRef<HTMLInputElement>(null);

    const allManuals = (): Manual[] => {
        const users: Manual[] = versions.map((v) => ({
            label: v.label,
            file: manualFileFor(v.label),
            bookmarks: Array.isArray(v.bookmarks) ? v.bookmarks : [],
            userAdded: true,
        }));
        if (pendingLabel
            && !users.some((u) => u.label === pendingLabel)
            && !MANUALS.some((m) => m.label === pendingLabel)) {
            users.push({
                label: pendingLabel, file: manualFileFor(pendingLabel),
                bookmarks: [], userAdded: true, pending: true,
            });
        }
        return MANUALS.concat(users);
    };

    const manual = allManuals().find((m) => m.label === current) || MANUALS[0];

    /* Built-ins appear instantly; folder-backed editions fill in once the Core
       Book folder is read. */
    useEffect(() => {
        if (!open) return;
        setPendingLabel(null);
        setAddingVersion(false);
        setAddFormOpen(false);
        let live = true;
        loadCoreBookVersions().then((v) => { if (live) setVersions(v); });
        return () => { live = false; };
    }, [open]);

    useEffect(() => {
        if (!allManuals().some((m) => m.label === current)) setCurrent(MANUALS[0].label);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versions, pendingLabel]);

    useEffect(() => {
        if (addingVersion) { setNewVersion(''); versionInput.current?.focus(); }
    }, [addingVersion]);

    /* The PDFs are the reader's own copy — they are not shipped, and on the
       hosted site they cannot be: the Core Book is not ours to redistribute. So
       on a served copy the file is normally absent, and every one of these
       buttons would open a blank 404 tab. Probe once and say so instead.

       Only over http(s): `fetch` of a sibling file:// URL is refused outright,
       so probing a local copy would report every manual missing when it is
       sitting right there. */
    useEffect(() => {
        if (!open || !isHostedOrigin()) { setPdfMissing(false); return; }
        let live = true;
        setPdfMissing(false);
        fetch(encodeURI(MANUAL_FOLDER + manual.file), { method: 'HEAD' })
            .then((r) => { if (live) setPdfMissing(!r.ok); })
            .catch(() => { if (live) setPdfMissing(true); });
        return () => { live = false; };
    }, [open, manual.file]);

    const openManualAt = (page: number) => {
        if (pdfMissing) {
            alert('"' + manual.file + '" is not part of this site — the Core Book is not ours '
                + 'to hand out.\n\nDownload the app to read it alongside your sheets: put your '
                + 'own PDF in the "' + CORE_BOOK_DIR_NAME + '" folder next to the pages, named '
                + 'exactly "' + manual.file + '".');
            return;
        }
        const url = encodeURI(MANUAL_FOLDER + manual.file) + '#page=' + (page || 1);
        window.open(url, '_blank');
        // Modal stays open so several bookmarks can be opened in a row.
    };

    const confirmAddVersion = () => {
        const label = newVersion.trim();
        if (!label) return;
        if (/[\\/:*?"<>|]/.test(label)) {
            alert('A version name can\'t contain any of \\ / : * ? " < > |');
            return;
        }
        if (allManuals().some((m) => m.label.toLowerCase() === label.toLowerCase())) {
            alert('A "v' + label + '" edition already exists.');
            return;
        }
        if (!window.showDirectoryPicker) {
            alert('This browser can\'t save new editions to the "' + CORE_BOOK_DIR_NAME
                + '" folder. New editions need the File System Access API (Chrome or Edge).');
            return;
        }
        /* Show the button now; the edition is written to disk once its quick
           links are saved. Opening the fill form collects the pages. */
        setPendingLabel(label);
        setAddingVersion(false);
        setQuickLinkTarget(label);
    };

    const removeVersion = async (label: string) => {
        // A pending (never-saved) edition is just discarded — no file to remove.
        if (pendingLabel === label && !versions.some((v) => v.label === label)) {
            setPendingLabel(null);
            return;
        }
        if (!confirm('Delete the "v' + label + '" edition? Its quick-link file '
            + '(' + manualJsonFor(label) + ') is removed from the Core Book folder.')) return;
        if (!await deleteCoreBookVersionFile(label)) {
            alert('Could not delete "' + manualJsonFor(label) + '" from the "'
                + CORE_BOOK_DIR_NAME + '" folder. Grant access to that folder and try again.');
            return;
        }
        setVersions((vs) => vs.filter((v) => v.label !== label));
        if (sheet.manualBookmarks && sheet.manualBookmarks[label]) {
            store.update((s) => {
                const next = { ...s.manualBookmarks };
                delete next[label];
                s.manualBookmarks = next;
            });
        }
        if (current === label) setCurrent(MANUALS[0].label);
    };

    const customList = (sheet.manualBookmarks && sheet.manualBookmarks[current]) || [];

    return (
        <>
            <Modal open={open} onClose={onClose} boxClassName="manual-box" id="manual-picker-modal">
                <ModalClose onClick={onClose} />
                <div className="modal-title" style={{ justifyContent: 'center', color: 'var(--text-primary)' }}>
                    <i className="fa-solid fa-book" style={{ color: 'var(--ghost-color)' }}></i> Pokerole Manual
                </div>
                <div className="manual-divider"></div>

                <div className="manual-version-bar">
                    <span className="lbl">Core Book Version</span>
                    <div className="manual-version-row" id="manual-version-row">
                        {allManuals().map((m) => (
                            <button
                                key={m.label}
                                className={'manual-ver-btn' + (m.userAdded ? ' user' : '')
                                    + (m.label === current ? ' active' : '')}
                                onClick={() => setCurrent(m.label)}
                            >
                                <span>v{m.label}</span>
                                {m.userAdded && (
                                    <span
                                        className="ver-del"
                                        title="Delete this edition"
                                        onClick={(e) => { e.stopPropagation(); void removeVersion(m.label); }}
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </span>
                                )}
                            </button>
                        ))}
                        {/* Trailing dashed "+" reveals the add-version field. */}
                        <button
                            className="manual-ver-btn manual-ver-add"
                            title="Add a Core Book version"
                            onClick={() => setAddingVersion(true)}
                        >
                            <i className="fa-solid fa-plus"></i> Version
                        </button>
                    </div>
                    <div
                        className="manual-add-version"
                        id="manual-add-version"
                        style={{ display: addingVersion ? 'flex' : 'none' }}
                    >
                        <input
                            ref={versionInput}
                            type="text"
                            className="specialty-input manual-ver-input"
                            id="manual-add-version-input"
                            placeholder="e.g. 2.0"
                            autoComplete="off"
                            value={newVersion}
                            onChange={(e) => setNewVersion(e.currentTarget.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmAddVersion(); }}
                        />
                        <button className="specialty-add-btn" onClick={confirmAddVersion}>Add</button>
                        <button
                            className="manual-ver-cancel"
                            onClick={() => setAddingVersion(false)}
                            title="Cancel"
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                {pdfMissing && (
                    <p className="modal-text" style={{
                        margin: '0 0 10px', fontSize: '0.78rem', lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                    }}>
                        <i className="fa-solid fa-circle-info"></i>{' '}
                        The Core Book PDF is not part of this site — it is not ours to hand out.
                        The quick links below still show you the page numbers; download the app to
                        read the book beside your sheets.
                    </p>
                )}

                <button className="manual-open-start" onClick={() => openManualAt(1)}>
                    <i className="fa-solid fa-book-open"></i> Open Manual from the Start
                </button>

                <div className="manual-cols">
                    {/* Left: dev-provided quick links */}
                    <div className="manual-col">
                        <div className="manual-col-head">
                            <div className="manual-col-title">
                                <i className="fa-solid fa-link" style={{ color: 'var(--ghost-color)' }}></i> Quick Links
                            </div>
                            {manual.userAdded && (
                                <button
                                    className="manual-edit-btn"
                                    id="manual-edit-ql-btn"
                                    title="Edit this edition's quick-link pages"
                                    onClick={() => setQuickLinkTarget(current)}
                                >
                                    <i className="fa-solid fa-pen"></i>
                                </button>
                            )}
                        </div>
                        <div className="manual-card-grid" id="manual-default-list">
                            {!manual.bookmarks.length
                                ? <span className="manual-empty">No quick links for this edition yet.</span>
                                : manual.bookmarks.map((b, i) => (
                                    <BookmarkCard key={i} bookmark={b} onOpen={() => openManualAt(b.page)} />
                                ))}
                        </div>
                    </div>

                    {/* Right: trainer-tied custom bookmarks */}
                    <div className="manual-col">
                        <div className="manual-col-head">
                            <div className="manual-col-title">
                                <i className="fa-solid fa-pen" style={{ color: 'var(--ghost-color)' }}></i> Custom
                            </div>
                            <button
                                className="manual-add-btn"
                                title="Add a custom bookmark"
                                onClick={() => {
                                    setAddFormOpen((v) => !v);
                                    setTimeout(() => labelInput.current?.focus(), 0);
                                }}
                            >
                                <i className="fa-solid fa-plus"></i>
                            </button>
                        </div>
                        <div className="manual-card-grid manual-custom-grid" id="manual-custom-list">
                            {!customList.length
                                ? <span className="manual-empty">No custom link yet. Click "+" to create one.</span>
                                : customList.map((b, i) => (
                                    <BookmarkCard
                                        key={i}
                                        bookmark={b}
                                        custom
                                        onOpen={() => openManualAt(b.page)}
                                        onDelete={() => store.update((s) => {
                                            const list = s.manualBookmarks[current] || [];
                                            s.manualBookmarks = {
                                                ...s.manualBookmarks,
                                                [current]: list.filter((_, j) => j !== i),
                                            };
                                        })}
                                    />
                                ))}
                        </div>
                        {/* Add form sits below the list so the custom cards stay
                            top-aligned with the Quick Links, open or not. */}
                        <AddBookmarkForm
                            open={addFormOpen}
                            labelRef={labelInput}
                            onAdd={(label, page) => store.update((s) => {
                                const list = Array.isArray(s.manualBookmarks[current])
                                    ? s.manualBookmarks[current] : [];
                                s.manualBookmarks = { ...s.manualBookmarks, [current]: [...list, { label, page }] };
                            })}
                        />
                    </div>
                </div>

                <div className="manual-note">
                    <i className="fa-solid fa-circle-info"></i>
                    <span id="manual-note-text">
                        Manuals open from the <code>{CORE_BOOK_DIR_NAME}</code> folder next to this app.
                        Put this edition’s PDF there, named exactly <code>{manual.file}</code> — otherwise
                        the browser will show a “file not found” page.
                        {manual.userAdded && (
                            <> Its quick links are saved in that folder as <code>{manualJsonFor(manual.label)}</code>.</>
                        )}
                    </span>
                </div>
            </Modal>

            <QuickLinkModal
                label={quickLinkTarget}
                versions={versions}
                onCancel={() => {
                    /* Cancelling the fill for a brand-new edition drops its
                       pending button. */
                    if (pendingLabel && pendingLabel === quickLinkTarget) setPendingLabel(null);
                    setQuickLinkTarget(null);
                }}
                onSaved={(label, bookmarks) => {
                    setVersions((vs) => {
                        const next = vs.some((v) => v.label === label)
                            ? vs.map((v) => v.label === label ? { ...v, bookmarks } : v)
                            : [...vs, { label, bookmarks }];
                        return next.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
                    });
                    setPendingLabel(null);
                    setCurrent(label);
                    setQuickLinkTarget(null);
                }}
            />
        </>
    );
}

function BookmarkCard({ bookmark, custom, onOpen, onDelete }: {
    bookmark: ManualBookmark; custom?: boolean; onOpen: () => void; onDelete?: () => void;
}) {
    return (
        <div className="manual-card">
            <span className="ic">{bookmark.icon || (custom ? '🔖' : '📄')}</span>
            {/* Full name on hover, even when the box truncates it */}
            <span className="nm" title={bookmark.label}>{bookmark.label}</span>
            <span className="pg">Pg. {bookmark.page}</span>
            <button className="manual-open-btn" title={'Open at page ' + bookmark.page} onClick={onOpen}>
                Open
            </button>
            {custom && (
                <button className="del" title="Delete bookmark" onClick={onDelete}>
                    <i className="fa-solid fa-trash"></i>
                </button>
            )}
        </div>
    );
}

function AddBookmarkForm({ open, labelRef, onAdd }: {
    open: boolean;
    labelRef: React.RefObject<HTMLInputElement>;
    onAdd: (label: string, page: number) => void;
}) {
    const [label, setLabel] = useState('');
    const [page, setPage] = useState('');

    const add = () => {
        const clean = label.trim();
        const n = parseInt(page, 10);
        if (!clean || isNaN(n) || n < 1) return;
        onAdd(clean, n);
        setLabel('');
        setPage('');
        labelRef.current?.focus();
    };

    return (
        <div className="manual-add-form" id="manual-add-form" style={{ display: open ? 'flex' : 'none' }}>
            <input
                ref={labelRef}
                type="text"
                className="specialty-input manual-label-input"
                id="manual-add-label"
                placeholder="Bookmark name..."
                autoComplete="off"
                value={label}
                onChange={(e) => setLabel(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <input
                type="number"
                min="1"
                className="specialty-input manual-page-input"
                id="manual-add-page"
                placeholder="Pg"
                autoComplete="off"
                value={page}
                onChange={(e) => setPage(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <button className="specialty-add-btn" onClick={add}>Add</button>
        </div>
    );
}

/** Fill in the quick-link pages for a user-added Core Book edition. */
function QuickLinkModal({ label, versions, onCancel, onSaved }: {
    label: string | null;
    versions: CoreBookVersion[];
    onCancel: () => void;
    onSaved: (label: string, bookmarks: ManualBookmark[]) => void;
}) {
    const [pages, setPages] = useState<string[]>([]);
    const first = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!label) return;
        const existing = versions.find((v) => v.label === label)?.bookmarks || [];
        setPages(MANUAL_QUICKLINK_TEMPLATE.map((t) => {
            const hit = existing.find((b) => b.label === t.label);
            return hit ? String(hit.page) : '';
        }));
        const id = window.setTimeout(() => first.current?.focus(), 0);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [label]);

    const save = async () => {
        if (!label) { onCancel(); return; }
        const bookmarks: ManualBookmark[] = [];
        MANUAL_QUICKLINK_TEMPLATE.forEach((t, i) => {
            const page = parseInt(pages[i], 10);
            if (!isNaN(page) && page >= 1) bookmarks.push({ icon: t.icon, label: t.label, page });
        });
        if (!await writeCoreBookVersion(label, bookmarks)) {
            alert('Could not save "' + manualJsonFor(label) + '" to the "' + CORE_BOOK_DIR_NAME
                + '" folder. Grant access to that folder and try again.');
            return;   // keep the form open so the entered pages aren't lost
        }
        onSaved(label, bookmarks);
    };

    return (
        <Modal
            open={!!label}
            onClose={onCancel}
            boxClassName="manual-quicklink-box"
            id="manual-quicklink-modal"
        >
            <ModalClose onClick={onCancel} />
            <div className="modal-title" style={{ justifyContent: 'center', color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-link" style={{ color: 'var(--ghost-color)' }}></i>
                <span id="manual-ql-title">Quick Links — v{label}</span>
            </div>
            <p className="modal-text" style={{ textAlign: 'center' }}>
                Enter the page number for each quick link in this edition. Leave a field blank to skip it.
            </p>
            <div className="manual-ql-grid" id="manual-ql-grid">
                {MANUAL_QUICKLINK_TEMPLATE.map((t, i) => (
                    <div className="manual-ql-row" key={t.label}>
                        <span className="ic">{t.icon}</span>
                        <span className="nm">{t.label}</span>
                        <input
                            ref={i === 0 ? first : undefined}
                            type="number"
                            min="1"
                            className="specialty-input manual-ql-page"
                            placeholder="Pg"
                            value={pages[i] ?? ''}
                            onChange={(e) => {
                                const v = e.currentTarget.value;
                                setPages((prev) => prev.map((p, j) => j === i ? v : p));
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
                        />
                    </div>
                ))}
            </div>
            <div className="manual-note" style={{ marginTop: '4px' }}>
                <i className="fa-solid fa-circle-info"></i>
                <span id="manual-ql-note">
                    These default links are saved as <code>{label ? manualJsonFor(label) : ''}</code> in
                    the <code>{CORE_BOOK_DIR_NAME}</code> folder — not in your trainer file — so every
                    trainer shares them. Keep that JSON beside the edition’s PDF in that folder so it
                    travels with the manual. (Your own <strong>custom</strong> links stay in this
                    trainer’s <code>.json</code>.)
                </span>
            </div>
            <div className="manual-ql-actions">
                <button className="form-btn cancel" onClick={onCancel}>Cancel</button>
                <button className="form-btn save" onClick={() => void save()}>Save Quick Links</button>
            </div>
        </Modal>
    );
}
