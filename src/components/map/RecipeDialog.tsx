import { useEffect, useState } from 'react';
import { useMap } from '../../map/MapContext';
import { useToast } from '../common/Toast';
import { Modal, ModalClose } from '../common/Modal';
import { copyText } from '../table/copy';
import { MAP_STYLES } from '../../map/styles';
import { TERRAINS } from '../../map/terrain';
import { MAX_CELLS, MIN_CELLS, clampCells } from '../../map/doc';
import type { RecipeMap } from '../../map/recipe';
import { applyRecipe, buildNewMap } from '../../map/recipeBuild';
import { recipeBrief, recipeMapOf } from '../../map/recipeBrief';
import { PRESETS } from './MapDialogs';
import { RecipeCheck, useParsedRecipe } from './RecipeCheck';
import type { StyleId } from '../../map/types';

/* A map from a written description, by way of any chat assistant.

   Two steps, both here: the page writes the instructions (the description
   plus everything the assistant needs to know about the format — see
   recipeBrief.ts), the owner takes them to a chat of their choice, and
   pastes the reply back. The reply is checked as it is pasted; what cannot
   be used is listed, and the list copies back to the assistant as a request
   for a corrected recipe. Nothing is sent anywhere by the page itself. */

const DRAFT_KEY = 'pokerole_map_recipe_draft';

interface Draft {
    mode: 'new' | 'add';
    description: string;
    reply: string;
    settings: RecipeMap;
}

const DEFAULT_SETTINGS: RecipeMap = { name: '', cols: 64, rows: 44, styleId: 'handdrawn', background: 'sea', scale: '1 cell = 2 km' };

function readDraft(): Partial<Draft> {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        return raw ? JSON.parse(raw) as Partial<Draft> : {};
    } catch { return {}; }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function download(text: string, name: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function RecipeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { store, doc } = useMap();
    const toast = useToast();
    const [draft] = useState(readDraft);
    const [mode, setMode] = useState<'new' | 'add'>(draft.mode === 'add' ? 'add' : 'new');
    const [description, setDescription] = useState(draft.description ?? '');
    const [reply, setReply] = useState(draft.reply ?? '');
    const [settings, setSettings] = useState<RecipeMap>({ ...DEFAULT_SETTINGS, ...draft.settings });
    const [copied, setCopied] = useState<'' | 'brief' | 'failed'>('');

    /* Kept between openings and reloads: a description takes a while to write. */
    useEffect(() => {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, description, reply, settings })); } catch { /* private window */ }
    }, [mode, description, reply, settings]);

    useEffect(() => { if (open) setCopied(''); }, [open]);

    const set = (patch: Partial<RecipeMap>) => setSettings((s) => ({ ...s, ...patch }));
    const base: RecipeMap = mode === 'add' ? recipeMapOf(doc) : { ...settings, name: settings.name.trim() || 'New map' };

    const { parsed, recipe, errors, empty } = useParsedRecipe(reply, mode, base);

    const brief = () => recipeBrief({
        mode, description, map: base, nameOpen: mode === 'new' && !settings.name.trim(),
        doc: mode === 'add' ? doc : undefined,
    });

    const copyBrief = async () => {
        setCopied((await copyText(brief())) ? 'brief' : 'failed');
    };

    const build = () => {
        if (!recipe) return;
        if (mode === 'new') {
            const made = buildNewMap(recipe);
            store.addMap(made);
            toast('<i class="fa-solid fa-scroll"></i> Built ' + escapeHtml(made.name) + '.');
        } else {
            store.edit((d) => applyRecipe(d, recipe));
            toast('<i class="fa-solid fa-scroll"></i> Drawn onto this map. Undo takes it back off.');
        }
        setReply('');
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} boxClassName="map-dialog map-recipe">
            <ModalClose onClick={onClose} />
            <div className="map-dialog-title"><i className="fa-solid fa-scroll"></i> Map from a description</div>
            <p className="map-recipe-intro">
                Describe the map, copy the instructions into any chat assistant, then paste its whole reply below.
                The instructions explain everything the Map Maker can draw, so the assistant does not have to guess.
            </p>

            <div className="map-dialog-sub">1 · Describe it</div>
            <div className="map-segmented map-recipe-mode" role="group" aria-label="What to make">
                <button aria-pressed={mode === 'new'} onClick={() => setMode('new')}>A new map</button>
                <button aria-pressed={mode === 'add'} onClick={() => setMode('add')}>Add to “{doc.name || 'this map'}”</button>
            </div>

            {mode === 'new' ? (
                <div className="map-recipe-settings">
                    <div className="map-chips">
                        {PRESETS.map((p) => (
                            <button
                                key={p.name} className="map-chip"
                                aria-pressed={settings.cols === p.cols && settings.rows === p.rows && settings.background === p.background}
                                onClick={() => set({ cols: p.cols, rows: p.rows, background: p.background, scale: p.scale })}
                            >
                                {p.name} <span className="muted">{p.cols}×{p.rows}</span>
                            </button>
                        ))}
                    </div>
                    <div className="map-field-row">
                        <label className="map-field grow">
                            <span>Name</span>
                            <input type="text" value={settings.name} placeholder="Left to the assistant" onChange={(e) => set({ name: e.currentTarget.value })} />
                        </label>
                        <label className="map-field">
                            <span>Style</span>
                            <select value={settings.styleId} onChange={(e) => set({ styleId: e.currentTarget.value as StyleId })}>
                                {MAP_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="map-field-row">
                        <label className="map-field">
                            <span>Columns</span>
                            <input type="number" min={MIN_CELLS} max={MAX_CELLS} value={settings.cols}
                                onChange={(e) => set({ cols: Number(e.currentTarget.value) })}
                                onBlur={() => set({ cols: clampCells(settings.cols) })} />
                        </label>
                        <label className="map-field">
                            <span>Rows</span>
                            <input type="number" min={MIN_CELLS} max={MAX_CELLS} value={settings.rows}
                                onChange={(e) => set({ rows: Number(e.currentTarget.value) })}
                                onBlur={() => set({ rows: clampCells(settings.rows) })} />
                        </label>
                        <label className="map-field">
                            <span>Background</span>
                            <select value={settings.background} onChange={(e) => set({ background: e.currentTarget.value })}>
                                {TERRAINS.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                            </select>
                        </label>
                    </div>
                    <label className="map-field">
                        <span>Scale</span>
                        <input type="text" value={settings.scale} placeholder="e.g. 1 cell = 5 km" onChange={(e) => set({ scale: e.currentTarget.value })} />
                    </label>
                </div>
            ) : (
                <p className="map-hint">
                    The assistant is told this map's size and style and shown what is already on it. What it draws goes on top,
                    in one step you can undo.
                </p>
            )}

            <label className="map-field">
                <span>Description</span>
                <textarea
                    rows={5}
                    value={description}
                    placeholder={mode === 'new'
                        ? 'e.g. A cold northern region: a volcanic island in the east, a big lake in the middle, three towns joined by Routes 1 to 3, the League on a snowy peak in the north.'
                        : 'e.g. Add a small fishing village on the south coast, with a pier and a route to the nearest town.'}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                />
            </label>
            <div className="map-recipe-actions">
                <button className="accent" onClick={() => { void copyBrief(); }}>
                    <i className="fa-solid fa-copy"></i> Copy instructions
                </button>
                <button onClick={() => download(brief(), 'map-instructions.txt')} title="The same instructions as a text file, to attach to a chat">
                    <i className="fa-solid fa-file-arrow-down"></i> Save as .txt
                </button>
            </div>
            {copied === 'brief' && <p className="map-recipe-note ok"><i className="fa-solid fa-check"></i> Copied. Paste it into a chat assistant, then paste its reply below.</p>}
            {copied === 'failed' && <p className="map-recipe-note bad">Could not reach the clipboard. Use Save as .txt instead.</p>}

            <div className="map-dialog-sub">2 · Paste the reply</div>
            <label className="map-field">
                <textarea
                    rows={6}
                    aria-label="The assistant's reply"
                    className="map-recipe-reply"
                    value={reply}
                    placeholder="Paste the whole reply here. Text around the recipe is fine."
                    spellCheck={false}
                    onChange={(e) => setReply(e.currentTarget.value)}
                />
            </label>

            {parsed && <RecipeCheck parsed={parsed} errors={errors} />}

            <button className="accent map-recipe-build" disabled={!recipe || empty} onClick={build}>
                <i className="fa-solid fa-hammer"></i>{' '}
                {mode === 'new' ? 'Build the map' : 'Draw it onto this map'}
                {errors ? ` without the ${errors} broken item${errors === 1 ? '' : 's'}` : ''}
            </button>
        </Modal>
    );
}
