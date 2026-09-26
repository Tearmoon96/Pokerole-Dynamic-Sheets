import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from '../../map/MapContext';
import { useToast } from '../common/Toast';
import { Popover } from './Popover';
import { TERRAINS, TERRAIN_BY_CODE } from '../../map/terrain';
import type { TerrainDef } from '../../map/terrain';
import { MAP_STYLES, styleOf } from '../../map/styles';
import { MAX_CELLS, MIN_CELLS, clampCells, resizeDoc } from '../../map/doc';
import { EDGE_KINDS, MAX_SOFT, MIN_SOFT } from '../../map/edges';
import { swatchBackground } from './SidePanel';
import type { EdgeKind } from '../../map/types';
import { exportSize, renderMapPng } from '../../map/render/exportPng';
import { exportLoader, folderReadable, pickAppFolder, readAppFolder, readsFromDisk } from '../../map/render/exportImages';

/* The map's own settings, each on the top bar with a small window of its own
   where it needs one — they used to share a Map settings dialog. */

function usePopover() {
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);
    const close = useCallback(() => setOpen(false), []);
    return { open, setOpen, anchor, close };
}

/* ------------------------------------------------------------- style */

const STYLE_HINTS: Record<string, string> = {
    handdrawn: 'Ink on parchment, like an old atlas',
    anime: 'Flat, bright colours with clean outlines',
    townmap: 'The games\' region map: blocks and routes',
    overworld: 'Top-down pixel tiles, as walked in the games',
};

export function StyleControl() {
    const { store, doc } = useMap();
    const pop = usePopover();
    const current = styleOf(doc.styleId);
    return (
        <>
            <button
                ref={pop.anchor} className="icon-btn map-style-btn" aria-expanded={pop.open}
                title="How the map is drawn" onClick={() => pop.setOpen((o) => !o)}
            >
                <i className={'fa-solid ' + current.icon}></i> <span className="map-style-name">{current.name}</span> <i className="fa-solid fa-caret-down"></i>
            </button>
            <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close}>
                <div className="map-popover-title">Style</div>
                <div className="map-style-list">
                    {MAP_STYLES.map((st) => (
                        <button
                            key={st.id}
                            className="map-style-choice"
                            aria-pressed={doc.styleId === st.id}
                            onClick={() => { if (doc.styleId !== st.id) store.edit((d) => { d.styleId = st.id; }); pop.close(); }}
                        >
                            <i className={'fa-solid ' + st.icon}></i>
                            <span>
                                <strong>{st.name}</strong>
                                <span className="muted">{STYLE_HINTS[st.id]}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Popover>
        </>
    );
}

/* ------------------------------------------------------------- background */

const BG_GROUPS: { name: string; test: (t: TerrainDef) => boolean }[] = [
    { name: 'Sky', test: (t) => !!t.sky },
    { name: 'Water', test: (t) => !!t.water },
    { name: 'Land', test: (t) => !t.sky && !t.water },
];

export function BackgroundControl() {
    const { store, doc } = useMap();
    const pop = usePopover();
    const style = styleOf(doc.styleId);
    const bg = TERRAIN_BY_CODE.get(doc.background) ?? TERRAINS[0];
    return (
        <>
            <button
                ref={pop.anchor} className="icon-btn map-bg-btn" aria-expanded={pop.open}
                title={'Background: ' + bg.name + ' — shows wherever nothing is painted'} onClick={() => pop.setOpen((o) => !o)}
            >
                <span className={'map-bg-chip' + (style.pixelated ? ' pixelated' : '')} style={{ background: swatchBackground(style, bg.slug) }}></span>
                <span className="map-btn-text"> {bg.name}</span> <i className="fa-solid fa-caret-down"></i>
            </button>
            <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="map-bg-pop">
                <div className="map-popover-title">Background</div>
                <p className="map-hint">
                    The layer under everything painted. It shows wherever nothing is painted, and wherever the
                    eraser rubs terrain out.
                </p>
                {BG_GROUPS.map((g) => (
                    <div key={g.name} className="map-bg-group">
                        <div className="map-bg-group-name">{g.name}</div>
                        <div className="map-swatches">
                            {TERRAINS.filter(g.test).map((t) => (
                                <button
                                    key={t.code}
                                    className={'map-swatch' + (doc.background === t.code ? ' on' : '')}
                                    aria-pressed={doc.background === t.code}
                                    onClick={() => { if (doc.background !== t.code) store.edit((d) => { d.background = t.code; }); }}
                                >
                                    <span className={'map-swatch-chip' + (style.pixelated ? ' pixelated' : '')} style={{ background: swatchBackground(style, t.slug) }}></span>
                                    <span className="map-swatch-name">{t.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </Popover>
        </>
    );
}

/* ------------------------------------------------------------- borders */

const SOFT_STEP = 0.25;

export function BordersControl() {
    const { store, doc } = useMap();
    const pop = usePopover();
    const style = styleOf(doc.styleId);
    const b = doc.borders;
    const setBorders = (patch: Partial<typeof b>, coalesce?: string) =>
        store.edit((d) => { d.borders = { ...d.borders, ...patch }; }, coalesce);
    const setTerrain = (slug: string, kind: EdgeKind | 'map') => {
        const terrain = { ...b.terrain };
        if (kind === 'map') delete terrain[slug]; else terrain[slug] = kind;
        setBorders({ terrain });
    };
    const overrides = Object.keys(b.terrain).length;
    return (
        <>
            <button
                ref={pop.anchor} className="icon-btn map-borders-btn" aria-expanded={pop.open}
                title="Borders: how the edges between terrains are drawn" onClick={() => pop.setOpen((o) => !o)}
            >
                <i className="fa-solid fa-bezier-curve"></i><span className="map-btn-text"> Borders</span> <i className="fa-solid fa-caret-down"></i>
            </button>
            <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="map-borders-pop">
                <div className="map-popover-title">Borders</div>
                <div className="map-field">
                    <span>Every edge</span>
                    <div className="map-segmented" role="group" aria-label="Every edge">
                        {EDGE_KINDS.map((k) => (
                            <button key={k.kind} aria-pressed={b.kind === k.kind} title={k.hint} onClick={() => setBorders({ kind: k.kind })}>
                                {k.name}
                            </button>
                        ))}
                    </div>
                </div>
                <label className="map-field">
                    <span>Soft blend — {b.soft} cell{b.soft === 1 ? '' : 's'} wide</span>
                    <input
                        type="range" min={MIN_SOFT} max={MAX_SOFT} step={SOFT_STEP} value={b.soft}
                        onChange={(e) => { const v = Number(e.currentTarget.value); setBorders({ soft: v }, 'soft-width'); }}
                    />
                </label>
                <details className="map-borders-terrains" open={overrides > 0}>
                    <summary>By terrain{overrides ? ' (' + overrides + ')' : ''}</summary>
                    <p className="map-hint">A terrain's own edges, over the setting above. Where two terrains that both have one meet, the one stacked on top decides.</p>
                    <ul>
                        {TERRAINS.map((t) => (
                            <li key={t.slug}>
                                <span className={'map-swatch-chip' + (style.pixelated ? ' pixelated' : '')} style={{ background: swatchBackground(style, t.slug) }}></span>
                                <span className="map-borders-name">{t.name}</span>
                                <select
                                    value={b.terrain[t.slug] ?? 'map'}
                                    aria-label={t.name + ' edges'}
                                    onChange={(e) => setTerrain(t.slug, e.currentTarget.value as EdgeKind | 'map')}
                                >
                                    <option value="map">As above</option>
                                    {EDGE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}
                                </select>
                            </li>
                        ))}
                    </ul>
                </details>
                <p className="map-hint">
                    The Borders brush <kbd>O</kbd> paints a look onto single edges, and the terrain brush can lay
                    one down as it paints. Painted edges win over everything here.
                </p>
                {doc.edges && (
                    <button className="map-popover-go" onClick={() => store.edit((d) => { d.edges = ''; })}>
                        <i className="fa-solid fa-broom"></i> Clear the painted edges
                    </button>
                )}
            </Popover>
        </>
    );
}

/* ------------------------------------------------------------- grid */

export function GridControl() {
    const { store, doc } = useMap();
    const pop = usePopover();
    return (
        <span className="map-split">
            <button
                className="icon-btn"
                aria-pressed={doc.grid.show}
                title={doc.grid.show ? 'Hide the grid lines (#)' : 'Show the grid lines (#)'}
                onClick={() => store.edit((d) => { d.grid = { ...d.grid, show: !d.grid.show }; })}
            >
                <i className="fa-solid fa-border-all"></i><span className="map-btn-text"> Grid</span>
            </button>
            <button
                ref={pop.anchor} className="icon-btn map-split-caret" aria-expanded={pop.open}
                title="Grid line settings" onClick={() => pop.setOpen((o) => !o)}
            >
                <i className="fa-solid fa-caret-down"></i>
            </button>
            <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close}>
                <div className="map-popover-title">Grid lines</div>
                <label className="map-check">
                    <input
                        type="checkbox" checked={doc.grid.show}
                        onChange={(e) => { const v = e.currentTarget.checked; store.edit((d) => { d.grid = { ...d.grid, show: v }; }); }}
                    /> Show the grid
                </label>
                <label className="map-field">
                    <span>Line strength — {Math.round(doc.grid.opacity * 100)}%</span>
                    <input
                        type="range" min={0.05} max={1} step={0.05} value={doc.grid.opacity}
                        onChange={(e) => { const v = Number(e.currentTarget.value); store.edit((d) => { d.grid = { ...d.grid, opacity: v }; }, 'grid-opacity'); }}
                    />
                </label>
            </Popover>
        </span>
    );
}

/* ------------------------------------------------------------- snap */

export function SnapToggle() {
    const { store, doc } = useMap();
    return (
        <button
            className="icon-btn"
            aria-pressed={doc.grid.snap}
            title={(doc.grid.snap ? 'Snapping to the grid: on' : 'Snapping to the grid: off')
                + ' — for every landmark and token without a setting of its own'}
            onClick={() => store.edit((d) => { d.grid = { ...d.grid, snap: !d.grid.snap }; })}
        >
            <i className="fa-solid fa-magnet"></i><span className="map-btn-text"> Snap</span>
        </button>
    );
}

/* ------------------------------------------------------------- size */

export function SizeControl() {
    const { store, doc } = useMap();
    const pop = usePopover();
    const [cols, setCols] = useState(doc.cols);
    const [rows, setRows] = useState(doc.rows);

    useEffect(() => { if (pop.open) { setCols(doc.cols); setRows(doc.rows); } }, [pop.open, doc.cols, doc.rows]);
    const changed = clampCells(cols) !== doc.cols || clampCells(rows) !== doc.rows;

    return (
        <>
            <button
                ref={pop.anchor} className="icon-btn map-value-btn map-size-btn" aria-expanded={pop.open}
                title="Map size, in cells" onClick={() => pop.setOpen((o) => !o)}
            >
                <i className="fa-solid fa-up-right-and-down-left-from-center"></i> {doc.cols}×{doc.rows}
            </button>
            <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="map-size-pop">
                <div className="map-popover-title">Map size</div>
                <div className="map-field-row">
                    <label className="map-field">
                        <span>Columns</span>
                        <input type="number" min={MIN_CELLS} max={MAX_CELLS} value={cols} onChange={(e) => setCols(Number(e.currentTarget.value))} />
                    </label>
                    <label className="map-field">
                        <span>Rows</span>
                        <input type="number" min={MIN_CELLS} max={MAX_CELLS} value={rows} onChange={(e) => setRows(Number(e.currentTarget.value))} />
                    </label>
                </div>
                <p className="map-hint">
                    Grows or trims at the right and bottom edges; everything painted stays where it is, and new
                    cells show the background.
                </p>
                <button
                    className="accent map-popover-go" disabled={!changed}
                    onClick={() => {
                        store.edit((d) => resizeDoc(d, cols, rows));
                        pop.close();
                        window.dispatchEvent(new CustomEvent('map-fit'));
                    }}
                >
                    Resize to {clampCells(cols)}×{clampCells(rows)}
                </button>
            </Popover>
        </>
    );
}

/* ------------------------------------------------------------- scale */

export function ScaleControl() {
    const { store, doc } = useMap();
    const pop = usePopover();
    return (
        <>
            <button
                ref={pop.anchor} className="icon-btn map-value-btn map-scale-btn" aria-expanded={pop.open}
                title="What one cell means on this map" onClick={() => pop.setOpen((o) => !o)}
            >
                <i className="fa-solid fa-ruler-horizontal"></i> <span className="map-scale-text">{doc.scaleLabel || 'Scale'}</span>
            </button>
            <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close}>
                <div className="map-popover-title">Scale</div>
                <label className="map-field">
                    <span>What one cell means</span>
                    <input
                        type="text" className="map-scale-input" value={doc.scaleLabel} placeholder="e.g. 1 cell = 5 km"
                        onChange={(e) => { const v = e.currentTarget.value; store.edit((d) => { d.scaleLabel = v; }, 'scale'); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') pop.close(); }}
                    />
                </label>
                <div className="map-chips">
                    {['1 cell = 5 km', '1 cell = 1 km', '1 cell = 50 m', '1 cell = 5 m', '1 cell = 1 m'].map((v) => (
                        <button key={v} className="map-chip" aria-pressed={doc.scaleLabel === v}
                            onClick={() => store.edit((d) => { d.scaleLabel = v; })}>{v}</button>
                    ))}
                </div>
            </Popover>
        </>
    );
}

/* ------------------------------------------------------------- export */

const PX_CHOICES = [16, 24, 32, 48, 64, 96, 128];

export function ExportControl() {
    const { doc } = useMap();
    const toast = useToast();
    const pop = usePopover();
    const [px, setPx] = useState(32);
    const [grid, setGrid] = useState(doc.grid.show);
    const [tokens, setTokens] = useState(true);
    const [busy, setBusy] = useState(false);
    const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
    const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
    const disk = readsFromDisk();

    useEffect(() => {
        if (!pop.open) return;
        setGrid(doc.grid.show);
        setNote(null);
        if (disk) readAppFolder().then((h) => setFolder(h ?? null));
    }, [pop.open]);

    const size = exportSize(doc, px);

    const save = async () => {
        setBusy(true);
        setNote(null);
        try {
            /* Ask for read access first, while the click still counts as a
               gesture — the rendering below takes long enough for it not to. */
            let dir = folder;
            if (disk && dir && !(await folderReadable(dir))) dir = null;
            /* The save dialog also needs the gesture: open it before drawing. */
            const name = (doc.name.trim().replace(/[\\/:*?"<>|]+/g, '') || 'map') + '.png';
            let handle: FileSystemFileHandle | null = null;
            if (window.showSaveFilePicker) {
                try {
                    handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] });
                } catch (e) {
                    if (e && (e as DOMException).name === 'AbortError') { setBusy(false); return; }
                    throw e;
                }
            }
            const out = await renderMapPng(doc, { pxPerCell: px, grid, tokens }, exportLoader(dir));
            if (handle) {
                const w = await handle.createWritable();
                await w.write(out.blob);
                await w.close();
            } else {
                const url = URL.createObjectURL(out.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            }
            const where = handle ? handle.name : name;
            setNote({
                text: 'Saved ' + where + ' — ' + out.width + '×' + out.height + ' px.'
                    + (out.missing ? ' ' + out.missing + ' picture' + (out.missing === 1 ? '' : 's') + ' drawn as placeholders.' : ''),
                warn: false,
            });
            toast('<i class="fa-solid fa-image"></i> Map saved as a PNG.');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setNote({
                text: /tainted|insecure|SecurityError/i.test(msg)
                    ? 'The browser would not let the page read one of its pictures back. Choose the app\'s folder below and try again.'
                    : msg,
                warn: true,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button
                ref={pop.anchor} className="icon-btn" aria-expanded={pop.open}
                title="Save the map as a PNG image" onClick={() => pop.setOpen((o) => !o)}
            >
                <i className="fa-solid fa-image"></i><span className="map-btn-text"> PNG</span>
            </button>
            <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="map-export-pop">
                <div className="map-popover-title">Save as PNG</div>
                <label className="map-field">
                    <span>Pixels per cell</span>
                    <select value={px} onChange={(e) => setPx(Number(e.currentTarget.value))}>
                        {PX_CHOICES.map((p) => {
                            const s = exportSize(doc, p);
                            return <option key={p} value={p} disabled={!s.ok}>{p} px — {s.w}×{s.h}{s.ok ? '' : ' (too big)'}</option>;
                        })}
                    </select>
                </label>
                <label className="map-check">
                    <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.currentTarget.checked)} /> Grid lines
                </label>
                <label className="map-check">
                    <input type="checkbox" checked={tokens} onChange={(e) => setTokens(e.currentTarget.checked)} /> Tokens
                    <span className="muted">— off for a clean handout</span>
                </label>
                {disk && (
                    <div className="map-export-folder">
                        <p className="map-hint">
                            Opened from the disk, the browser only lets this page read its own pictures from a
                            folder you choose. Without it, landmarks and markers are drawn as their placeholders.
                        </p>
                        <button
                            onClick={async () => {
                                try {
                                    await pickAppFolder();
                                    setFolder((await readAppFolder()) ?? null);
                                    setNote(null);
                                } catch (e) {
                                    if (e && (e as DOMException).name === 'AbortError') return;
                                    setNote({ text: e instanceof Error ? e.message : String(e), warn: true });
                                }
                            }}
                        >
                            <i className="fa-solid fa-folder-open"></i> {folder ? 'App folder chosen — change' : 'Choose the app folder'}
                        </button>
                    </div>
                )}
                <button className="accent map-popover-go" disabled={busy || !size.ok} onClick={() => { void save(); }}>
                    {busy ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Drawing…</> : <><i className="fa-solid fa-download"></i> Save {size.w}×{size.h} PNG</>}
                </button>
                {note && <p className={'map-hint' + (note.warn ? ' map-warn' : '')}>{note.text}</p>}
            </Popover>
        </>
    );
}
