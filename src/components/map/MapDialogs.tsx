import { useEffect, useState } from 'react';
import { useMap } from '../../map/MapContext';
import { Modal, ModalClose } from '../common/Modal';
import { useGmConfirm } from '../gm/ConfirmDialog';
import { MAP_STYLES } from '../../map/styles';
import { TERRAINS } from '../../map/terrain';
import { LANDMARKS } from '../../map/landmarks';
import { COMMON_FOLDER, MAP_SPRITE_BASE, imageExists, terrainTextureUrl } from '../../map/sprites';
import { MAX_CELLS, MIN_CELLS, clampCells, createDoc, uid } from '../../map/doc';
import type { MapDoc, StyleId } from '../../map/types';

/* ------------------------------------------------------------- new map */

/* Starting points, not limits: a cell means whatever the map says it does. */
const PRESETS = [
    { name: 'Region', cols: 64, rows: 44, fill: 'sea', scale: '1 cell = 2 km' },
    { name: 'Route or area', cols: 40, rows: 28, fill: 'grassland', scale: '1 cell = 50 m' },
    { name: 'Town', cols: 32, rows: 24, fill: 'grassland', scale: '1 cell = 10 m' },
    { name: 'Battle', cols: 20, rows: 14, fill: 'grassland', scale: '1 cell = 1 m' },
];

function NewMapForm({ onCreate }: { onCreate: (d: MapDoc) => void }) {
    const { doc } = useMap();
    const [name, setName] = useState('');
    const [cols, setCols] = useState(40);
    const [rows, setRows] = useState(28);
    const [fill, setFill] = useState('sea');
    const [styleId, setStyleId] = useState<StyleId>(doc.styleId);
    const [scale, setScale] = useState('');

    return (
        <div className="map-new">
            <div className="map-chips">
                {PRESETS.map((p) => (
                    <button key={p.name} className="map-chip" onClick={() => { setCols(p.cols); setRows(p.rows); setFill(p.fill); setScale(p.scale); }}>
                        {p.name} <span className="muted">{p.cols}×{p.rows}</span>
                    </button>
                ))}
            </div>
            <div className="map-field-row">
                <label className="map-field grow">
                    <span>Name</span>
                    <input type="text" value={name} placeholder="New map" onChange={(e) => setName(e.currentTarget.value)} />
                </label>
                <label className="map-field">
                    <span>Style</span>
                    <select value={styleId} onChange={(e) => setStyleId(e.currentTarget.value as StyleId)}>
                        {MAP_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
            </div>
            <div className="map-field-row">
                <label className="map-field">
                    <span>Columns</span>
                    <input type="number" min={MIN_CELLS} max={MAX_CELLS} value={cols} onChange={(e) => setCols(Number(e.currentTarget.value))} />
                </label>
                <label className="map-field">
                    <span>Rows</span>
                    <input type="number" min={MIN_CELLS} max={MAX_CELLS} value={rows} onChange={(e) => setRows(Number(e.currentTarget.value))} />
                </label>
                <label className="map-field">
                    <span>Start as</span>
                    <select value={fill} onChange={(e) => setFill(e.currentTarget.value)}>
                        {TERRAINS.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                    </select>
                </label>
            </div>
            <label className="map-field">
                <span>Scale</span>
                <input type="text" value={scale} placeholder="e.g. 1 cell = 5 km" onChange={(e) => setScale(e.currentTarget.value)} />
            </label>
            <button
                className="accent"
                onClick={() => onCreate(createDoc({ name, cols: clampCells(cols), rows: clampCells(rows), fill, styleId, scaleLabel: scale }))}
            >
                <i className="fa-solid fa-plus"></i> Create map
            </button>
        </div>
    );
}

export function MapListDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { store } = useMap();
    const confirm = useGmConfirm();
    const [renaming, setRenaming] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    useEffect(() => { if (open) { setRenaming(null); setCreating(false); } }, [open]);

    const maps = [...store.maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return (
        <Modal open={open} onClose={onClose} boxClassName="map-dialog">
            <ModalClose onClick={onClose} />
            <div className="map-dialog-title"><i className="fa-solid fa-layer-group"></i> Your maps</div>
            {creating ? (
                <NewMapForm onCreate={(d) => { store.addMap(d); onClose(); }} />
            ) : (
                <button className="accent map-new-btn" onClick={() => setCreating(true)}>
                    <i className="fa-solid fa-plus"></i> New map
                </button>
            )}
            <ul className="map-list">
                {maps.map((m) => (
                    <li key={m.id} className={m.id === store.activeId ? 'active' : ''}>
                        {renaming === m.id ? (
                            <input
                                type="text"
                                className="map-list-rename"
                                autoFocus
                                value={m.name}
                                onChange={(e) => store.renameMap(m.id, e.currentTarget.value)}
                                onBlur={() => setRenaming(null)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenaming(null); }}
                            />
                        ) : (
                            <button className="map-list-open" onClick={() => { store.switchTo(m.id); onClose(); }} title="Open this map">
                                <span className="map-list-name">{m.name || 'Untitled map'}</span>
                                <span className="muted">
                                    {m.cols}×{m.rows} · {MAP_STYLES.find((s) => s.id === m.styleId)?.name}
                                    {' · '}{new Date(m.updatedAt).toLocaleDateString()}
                                </span>
                            </button>
                        )}
                        <button className="icon-btn" title="Rename" onClick={() => setRenaming(m.id)}><i className="fa-solid fa-pen"></i></button>
                        <button
                            className="icon-btn" title="Duplicate"
                            onClick={() => store.addMap({ ...m, id: uid(), name: m.name + ' (copy)', updatedAt: new Date().toISOString() })}
                        >
                            <i className="fa-solid fa-clone"></i>
                        </button>
                        <button
                            className="icon-btn danger" title="Delete"
                            onClick={async () => {
                                const ok = await confirm({
                                    icon: 'fa-trash', danger: true, confirmLabel: 'Delete',
                                    title: 'Delete ' + (m.name || 'this map') + '?',
                                    text: 'It is removed from this browser. A copy you saved to a file is not touched.',
                                });
                                if (ok) store.deleteMap(m.id);
                            }}
                        >
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </li>
                ))}
            </ul>
        </Modal>
    );
}

/* ------------------------------------------------------------- sprite checklist */

type Found = Record<string, boolean | undefined>;

/* What art is linked: every file name the Map Maker looks for, against every
   style folder, ticked where a file answered. The owner draws the art, so
   this is the one place to see which of it the page has actually found. */
export function SpriteChecklist({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [found, setFound] = useState<Found>({});
    const [filter, setFilter] = useState<'all' | 'missing' | 'found'>('all');

    const folders = [...MAP_STYLES.map((s) => s.folder), COMMON_FOLDER];
    const rows = [
        ...LANDMARKS.map((l) => ({ slug: l.slug, name: l.name, sub: '' })),
        { slug: 'trainer', name: 'Trainer marker', sub: '' },
        { slug: 'wild-pokemon', name: 'Wild Pokémon marker', sub: '' },
    ];

    useEffect(() => {
        if (!open) return;
        let live = true;
        const urls: string[] = [];
        for (const r of rows) for (const f of folders) urls.push(MAP_SPRITE_BASE + f + '/' + r.slug + '.png');
        for (const t of TERRAINS) for (const s of MAP_STYLES) urls.push(terrainTextureUrl(s, t.slug));
        /* A few at a time: 500 probes at once is a burst of 404s the hosted
           site does not need. */
        let i = 0;
        const next = async (): Promise<void> => {
            while (live && i < urls.length) {
                const url = urls[i++];
                const ok = await imageExists(url);
                if (live) setFound((f) => ({ ...f, [url]: ok }));
            }
        };
        void Promise.all([next(), next(), next(), next(), next(), next()]);
        return () => { live = false; };
    }, [open]);

    const mark = (url: string) => {
        const v = found[url];
        return v === undefined ? <span className="muted">…</span>
            : v ? <i className="fa-solid fa-check map-ok"></i> : <span className="map-miss">—</span>;
    };
    const anyFound = (slug: string) => folders.some((f) => found[MAP_SPRITE_BASE + f + '/' + slug + '.png']);
    const shown = rows.filter((r) => filter === 'all' || (filter === 'found') === anyFound(r.slug));
    const total = rows.length;
    const linked = rows.filter((r) => anyFound(r.slug)).length;

    return (
        <Modal open={open} onClose={onClose} boxClassName="map-dialog map-checklist">
            <ModalClose onClick={onClose} />
            <div className="map-dialog-title"><i className="fa-solid fa-images"></i> Sprite checklist</div>
            <p className="map-hint">
                Drop a PNG named <code>&lt;file name&gt;.png</code> into <code>app-data/images/MapSprites/&lt;Style&gt;/</code>,
                or into <code>Common/</code> to use it in every style, and reload. Missing art is drawn as a placeholder.
                {' '}{linked} of {total} have art.
            </p>
            <div className="map-chips">
                {(['all', 'missing', 'found'] as const).map((f) => (
                    <button key={f} className="map-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                        {f === 'all' ? 'All' : f === 'missing' ? 'No art yet' : 'Has art'}
                    </button>
                ))}
            </div>
            <div className="map-checklist-scroll">
                <table className="map-checklist-table">
                    <thead>
                        <tr><th>Landmark</th><th>File name</th>{folders.map((f) => <th key={f}>{f}</th>)}</tr>
                    </thead>
                    <tbody>
                        {shown.map((r) => (
                            <tr key={r.slug}>
                                <td>{r.name}</td>
                                <td><code>{r.slug}.png</code></td>
                                {folders.map((f) => <td key={f}>{mark(MAP_SPRITE_BASE + f + '/' + r.slug + '.png')}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <h4 className="map-dialog-sub">Terrain textures <span className="muted">(optional — one seamless cell, in &lt;Style&gt;/terrain/)</span></h4>
                <table className="map-checklist-table">
                    <thead>
                        <tr><th>Terrain</th><th>File name</th>{MAP_STYLES.map((s) => <th key={s.id}>{s.folder}</th>)}</tr>
                    </thead>
                    <tbody>
                        {TERRAINS.map((t) => (
                            <tr key={t.slug}>
                                <td>{t.name}</td>
                                <td><code>terrain/{t.slug}.png</code></td>
                                {MAP_STYLES.map((s) => <td key={s.id}>{mark(terrainTextureUrl(s, t.slug))}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
}
