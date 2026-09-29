import { TERRAIN_BY_SLUG, TERRAINS } from './terrain';
import { LANDMARK_BY_SLUG, LANDMARKS } from './landmarks';
import { MAP_STYLES, PATH_KINDS } from './styles';
import { MAX_CELLS, MIN_CELLS } from './doc';
import { LABEL_FONTS, LABEL_WARPS } from './labelText';
import { typeColors } from '../lib/themeTables';
import type { Pt } from './geometry';
import type { LabelRole, MapLabel, PathKind, StyleId, TokenKind } from './types';

/* A map recipe: a map written as text, for a chat assistant to write from
   a description and the page to build.

   The assistant never sees the page, so a recipe describes WHAT goes where —
   a polygon of forest, a river through these points, a city here — and the
   page does the painting: raster.ts fills the shapes, brushes.ts strokes the
   lines, and the objects go in as they are. The instructions it is written
   from are generated from the same tables this file checks against
   (recipeBrief.ts), so the two can never disagree.

   Parsing is strict and says why. Nothing is guessed: an unknown terrain or
   landmark is an error naming the closest real one, and the item is left
   out, never swapped for the suggestion. The only things mended in place are
   spelling of the same word (`Deep Sea` is `deep-sea`) and numbers out of
   range, which are clamped and reported. The report is written to be pasted
   straight back to the assistant. */

export const RECIPE_FORMAT = 'pokerole-map-recipe';
export const RECIPE_VERSION = 1;

export type Outline = 'natural' | 'smooth' | 'sharp';
export const OUTLINES: Outline[] = ['natural', 'smooth', 'sharp'];

/** A terrain slug, or 'background' for bare ground (which shows the map's background). */
export type RecipeTerrain = string;

interface ShapeBase { terrain: RecipeTerrain; outline: Outline; roughness: number }

export type RecipeShape =
    | ShapeBase & { shape: 'polygon'; points: Pt[] }
    | ShapeBase & { shape: 'circle'; center: Pt; radius: number }
    | ShapeBase & { shape: 'ellipse'; center: Pt; radiusX: number; radiusY: number; rotation: number }
    | ShapeBase & { shape: 'rect'; from: Pt; to: Pt }
    | ShapeBase & { shape: 'line'; points: Pt[]; width: number }
    | { shape: 'fill'; terrain: RecipeTerrain; at: Pt };

export interface RecipePath { kind: PathKind; points: Pt[]; width: number; name?: string; route?: string }
export interface RecipeLandmark { type: string; at: Pt; size: number; rotation: number; flip: boolean; name?: string; gymType?: string }
export type RecipeLabel = Omit<MapLabel, 'id' | 'x' | 'y'> & { at: Pt };
export interface RecipeToken { kind: TokenKind; at: Pt; size: number; color: string; name: string; image?: string }

export interface RecipeMap { name: string; cols: number; rows: number; styleId: StyleId; background: string; scale: string }

export interface Recipe {
    map: RecipeMap;
    seed: number;
    terrain: RecipeShape[];
    paths: RecipePath[];
    landmarks: RecipeLandmark[];
    labels: RecipeLabel[];
    tokens: RecipeToken[];
}

export interface RecipeIssue { level: 'error' | 'warning'; where: string; message: string }

export interface ParseResult {
    /** Null only when there is no recipe to speak of: not JSON, or not an object. */
    recipe: Recipe | null;
    issues: RecipeIssue[];
}

export interface ParseOptions {
    /** 'new' builds a map from the recipe's own `map` block; 'add' draws onto
        an existing map, whose size is fixed and whose `map` block is ignored. */
    mode: 'new' | 'add';
    /** Size, style and so on for whatever the recipe's `map` block leaves out
        — the dialog's own fields — or the map being drawn onto. */
    base: RecipeMap;
    /** Species name or number -> the token's art. Absent: every species is
        taken on trust and left for the build to look up. */
    species?: (query: string) => { image: string; name: string } | null;
}

/* ------------------------------------------------------------ the limits */

export const LIMITS = {
    terrain: 400, paths: 200, landmarks: 300, labels: 300, tokens: 200, points: 600,
};

export const TOKEN_COLOR_NAMES: Record<string, string> = {
    red: '#e0645c', blue: '#3c6cf8', teal: '#3aa593', yellow: '#f0b429',
    purple: '#a855f7', pink: '#ec4899', white: '#f8f8f8', black: '#333333',
};

export const LABEL_FONT_IDS = LABEL_FONTS.map((f) => f.id);

export const POKEMON_TYPES = Object.keys(typeColors);

/* ----------------------------------------------------- finding the JSON */

/** The recipe out of whatever was pasted: a chat reply with prose round a
    ```json block, the block alone, or bare JSON. */
export function extractJson(text: string): string | null {
    const fences = [...text.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
    const withMarker = fences.find((f) => f.includes(RECIPE_FORMAT));
    if (withMarker) return withMarker;
    const objectFence = fences.find((f) => f.trim().startsWith('{'));
    if (objectFence) return objectFence;
    /* A block that was opened and never closed: the reply was cut off. Hand
       back what there is, so the parse error says so. */
    const open = text.match(/```[a-zA-Z]*\s*\n([\s\S]*)$/);
    if (open && open[1].trim().startsWith('{')) return open[1];
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    return a >= 0 ? text.slice(a, b > a ? b + 1 : undefined) : null;
}

/** JSON as assistants actually write it: // and /* comments and trailing
    commas are dropped, outside strings only. Everything else is strict. */
export function looseJson(src: string): unknown {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '"') {
            let j = i + 1;
            while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
            out += src.slice(i, j + 1);
            i = j + 1;
        } else if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') i++;
        } else if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            i = end < 0 ? src.length : end + 2;
        } else {
            out += c;
            i++;
        }
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/* ------------------------------------------------------------ the words */

/** Spelling only: case, spaces, underscores and accents. `Pokémon Center`
    and `pokemon_center` are both `pokemon-center`. */
export function slugify(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
        .replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function distance(a: string, b: string): number {
    const d = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = d[0];
        d[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const t = d[j];
            d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = t;
        }
    }
    return d[b.length];
}

/** The closest of `options`, if it is close enough to be what was meant. */
function closest(word: string, options: string[]): string | null {
    let best: string | null = null, score = Infinity;
    for (const o of options) {
        const d = o.includes(word) || word.includes(o) ? 1 : distance(word, o);
        if (d < score) { score = d; best = o; }
    }
    return best && score <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

const TERRAIN_SLUGS = TERRAINS.map((t) => t.slug);
/* Words an assistant reaches for that are not terrains — only ever offered
   as the suggestion in an error, never used in their place. */
const TERRAIN_SYNONYMS: Record<string, string> = {
    ocean: 'sea', water: 'sea', bay: 'sea', coast: 'shallows', reef: 'shallows', river: 'lake', pond: 'lake',
    marsh: 'swamp', bog: 'swamp', wetland: 'swamp', sand: 'beach', grass: 'grassland', plains: 'grassland',
    meadow: 'grassland', field: 'grassland', woods: 'forest', trees: 'forest', rainforest: 'jungle',
    dunes: 'desert', canyon: 'badlands', mesa: 'badlands', ice: 'snow', glacier: 'snow', mountains: 'mountain',
    hills: 'mountain', rock: 'mountain', peaks: 'snow-mountain', 'snowy-mountain': 'snow-mountain', 'snowy-peaks': 'snow-mountain', alpine: 'snow-mountain', lava: 'volcanic', volcano: 'volcanic', cave: 'cave-floor',
    town: 'town-paving', city: 'town-paving', street: 'town-paving', path: 'road', sky: 'clouds',
};
const LANDMARK_SLUGS = LANDMARKS.map((l) => l.slug);
const LANDMARK_BY_NAME = new Map(LANDMARKS.map((l) => [slugify(l.name), l.slug]));
const SHAPES = ['polygon', 'circle', 'ellipse', 'rect', 'line', 'fill'];
const ROLES: LabelRole[] = ['region', 'town', 'route', 'small'];

/* ---------------------------------------------------------------- parse */

export function parseRecipe(text: string, opts: ParseOptions): ParseResult {
    const issues: RecipeIssue[] = [];
    const err = (where: string, message: string) => { issues.push({ level: 'error', where, message }); };
    const warn = (where: string, message: string) => { issues.push({ level: 'warning', where, message }); };

    const json = extractJson(text);
    if (!json) {
        err('recipe', 'No JSON object found. The reply must contain the recipe as one JSON object in a ```json code block.');
        return { recipe: null, issues };
    }
    let raw: unknown;
    try {
        raw = looseJson(json);
    } catch (e) {
        err('recipe', 'The JSON does not parse: ' + (e as Error).message + '. It may have been cut off — the whole recipe must be in one block.');
        return { recipe: null, issues };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        err('recipe', 'The recipe must be one JSON object, { ... }.');
        return { recipe: null, issues };
    }
    const r = raw as Record<string, unknown>;
    if (r.format !== RECIPE_FORMAT) {
        warn('format', `Expected "format": "${RECIPE_FORMAT}". Read as a recipe anyway.`);
    }
    if (r.version !== undefined && r.version !== RECIPE_VERSION) {
        warn('version', `This page reads version ${RECIPE_VERSION}; the recipe says ${JSON.stringify(r.version)}.`);
    }
    unknownKeys(r, ['format', 'version', 'map', 'seed', 'terrain', 'paths', 'landmarks', 'labels', 'tokens'], 'recipe', warn);

    /* ---- map */
    const map: RecipeMap = { ...opts.base };
    if (opts.mode === 'new') {
        const m = r.map;
        if (m === undefined) {
            warn('map', `No "map" block: the map is ${map.cols} x ${map.rows}, ${map.styleId}, on ${map.background}.`);
        } else if (!isObj(m)) {
            err('map', 'Must be an object.');
        } else {
            unknownKeys(m, ['name', 'width', 'height', 'style', 'background', 'scale'], 'map', warn);
            if (typeof m.name === 'string' && m.name.trim()) map.name = m.name.trim().slice(0, 80);
            if (m.width !== undefined) map.cols = cells(m.width, 'map.width', map.cols);
            if (m.height !== undefined) map.rows = cells(m.height, 'map.height', map.rows);
            if (m.style !== undefined) {
                const s = typeof m.style === 'string' ? slugify(m.style).replace(/-/g, '') : '';
                const hit = MAP_STYLES.find((st) => st.id === s || slugify(st.name).replace(/-/g, '') === s);
                if (hit) map.styleId = hit.id;
                else err('map.style', `Unknown style ${JSON.stringify(m.style)}. Use one of: ${MAP_STYLES.map((st) => st.id).join(', ')}.`);
            }
            if (m.background !== undefined) {
                const t = terrainWord(m.background, 'map.background', false);
                if (t) map.background = t;
            }
            if (typeof m.scale === 'string') map.scale = m.scale.slice(0, 60);
        }
    }
    const W = map.cols, H = map.rows;

    function cells(v: unknown, where: string, dflt: number): number {
        if (typeof v !== 'number' || !isFinite(v)) { err(where, 'Must be a number of cells.'); return dflt; }
        const n = Math.round(v);
        if (n < MIN_CELLS || n > MAX_CELLS) {
            const c = Math.max(MIN_CELLS, Math.min(MAX_CELLS, n));
            warn(where, `${v} is outside ${MIN_CELLS}..${MAX_CELLS}; used ${c}.`);
            return c;
        }
        if (n !== v) warn(where, `Cells are whole numbers; used ${n}.`);
        return n;
    }

    /** A terrain slug, or null (with the error said). */
    function terrainWord(v: unknown, where: string, allowBackground: boolean): string | null {
        if (typeof v !== 'string') { err(where, 'Must be a terrain name (a string).'); return null; }
        const s = slugify(v);
        if (allowBackground && s === 'background') return 'background';
        if (TERRAIN_BY_SLUG.has(s)) return s;
        const near = TERRAIN_SYNONYMS[s] ?? closest(s, TERRAIN_SLUGS);
        err(where, `Unknown terrain ${JSON.stringify(v)}.` + (near ? ` Did you mean "${near}"?` : '')
            + ` Terrains: ${TERRAIN_SLUGS.join(', ')}${allowBackground ? ', background' : ''}.`);
        return null;
    }

    const seed = typeof r.seed === 'number' && isFinite(r.seed) ? Math.round(r.seed) : 1;

    /* ---- shared field readers */
    const point = (v: unknown, where: string): Pt | null => {
        if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && isFinite(n))) {
            return [v[0] as number, v[1] as number];
        }
        err(where, `Must be a point [x, y] of two numbers; got ${short(v)}.`);
        return null;
    };
    /** A point for an object that must sit on the map: clamped onto it. */
    const place = (v: unknown, where: string): Pt | null => {
        const p = point(v, where);
        if (!p) return null;
        const x = Math.max(0, Math.min(W, p[0])), y = Math.max(0, Math.min(H, p[1]));
        if (x !== p[0] || y !== p[1]) warn(where, `[${p[0]}, ${p[1]}] is off the ${W} x ${H} map; moved to [${round(x)}, ${round(y)}].`);
        return [x, y];
    };
    const points = (v: unknown, where: string, min: number): Pt[] | null => {
        if (!Array.isArray(v)) { err(where, `Must be a list of points [[x, y], ...]; got ${short(v)}.`); return null; }
        const out: Pt[] = [];
        for (let i = 0; i < v.length; i++) {
            const p = point(v[i], `${where}[${i}]`);
            if (!p) return null;
            const far = Math.max(W, H);
            if (p[0] < -far || p[1] < -far || p[0] > W + far || p[1] > H + far) {
                err(`${where}[${i}]`, `[${p[0]}, ${p[1]}] is far outside the ${W} x ${H} map. Coordinates are in cells, not pixels.`);
                return null;
            }
            out.push(p);
        }
        if (out.length < min) { err(where, `Needs at least ${min} points; has ${out.length}.`); return null; }
        if (out.length > LIMITS.points) {
            warn(where, `${out.length} points; only the first ${LIMITS.points} were used.`);
            out.length = LIMITS.points;
        }
        return out;
    };
    const number = (v: unknown, where: string, dflt: number, lo: number, hi: number): number => {
        if (v === undefined) return dflt;
        if (typeof v !== 'number' || !isFinite(v)) { warn(where, `Must be a number; used ${dflt}.`); return dflt; }
        if (v < lo || v > hi) {
            const c = Math.max(lo, Math.min(hi, v));
            warn(where, `${v} is outside ${lo}..${hi}; used ${c}.`);
            return c;
        }
        return v;
    };
    const words = (v: unknown, where: string, max: number): string | undefined => {
        if (v === undefined || v === null || v === '') return undefined;
        if (typeof v !== 'string' && typeof v !== 'number') { warn(where, 'Must be text; left out.'); return undefined; }
        return String(v).slice(0, max);
    };
    const list = (key: string, limit: number): unknown[] => {
        const v = r[key];
        if (v === undefined) return [];
        if (!Array.isArray(v)) { err(key, 'Must be a list [ ... ].'); return []; }
        if (v.length > limit) { warn(key, `${v.length} entries; only the first ${limit} were used.`); return v.slice(0, limit); }
        return v;
    };

    /* ---- terrain */
    const terrain: RecipeShape[] = [];
    list('terrain', LIMITS.terrain).forEach((s, i) => {
        const at = `terrain[${i}]`;
        if (!isObj(s)) { err(at, 'Must be an object.'); return; }
        const shape = typeof s.shape === 'string' ? s.shape.toLowerCase() : '';
        if (!SHAPES.includes(shape)) {
            err(at + '.shape', `Unknown shape ${short(s.shape)}. Use one of: ${SHAPES.join(', ')}.`);
            return;
        }
        const t = terrainWord(s.terrain, at + '.terrain', true);
        if (!t) return;
        if (shape === 'fill') {
            unknownKeys(s, ['shape', 'terrain', 'at'], at, warn);
            const p = place(s.at, at + '.at');
            if (p) terrain.push({ shape: 'fill', terrain: t, at: p });
            return;
        }
        let outline: Outline = shape === 'rect' ? 'sharp' : 'natural';
        if (s.outline !== undefined) {
            if (OUTLINES.includes(s.outline as Outline)) outline = s.outline as Outline;
            else warn(at + '.outline', `Must be one of ${OUTLINES.join(', ')}; used "${outline}".`);
        }
        const roughness = number(s.roughness, at + '.roughness', 1, 0, 3);
        const base = { terrain: t, outline, roughness };
        switch (shape) {
            case 'polygon': {
                unknownKeys(s, ['shape', 'terrain', 'points', 'outline', 'roughness'], at, warn);
                const pts = points(s.points, at + '.points', 3);
                if (pts) terrain.push({ ...base, shape: 'polygon', points: pts });
                return;
            }
            case 'circle': {
                unknownKeys(s, ['shape', 'terrain', 'center', 'radius', 'outline', 'roughness'], at, warn);
                const c = point(s.center, at + '.center');
                if (typeof s.radius !== 'number' || !(s.radius > 0)) { err(at + '.radius', 'Must be a number above 0 (cells).'); return; }
                if (c) terrain.push({ ...base, shape: 'circle', center: c, radius: Math.min(s.radius, 2 * Math.max(W, H)) });
                return;
            }
            case 'ellipse': {
                unknownKeys(s, ['shape', 'terrain', 'center', 'radiusX', 'radiusY', 'rotation', 'outline', 'roughness'], at, warn);
                const c = point(s.center, at + '.center');
                if (typeof s.radiusX !== 'number' || !(s.radiusX > 0) || typeof s.radiusY !== 'number' || !(s.radiusY > 0)) {
                    err(at, 'radiusX and radiusY must both be numbers above 0 (cells).');
                    return;
                }
                if (c) {
                    terrain.push({
                        ...base, shape: 'ellipse', center: c, radiusX: s.radiusX, radiusY: s.radiusY,
                        rotation: number(s.rotation, at + '.rotation', 0, -360, 360),
                    });
                }
                return;
            }
            case 'rect': {
                unknownKeys(s, ['shape', 'terrain', 'from', 'to', 'outline', 'roughness'], at, warn);
                const a = point(s.from, at + '.from'), b = point(s.to, at + '.to');
                if (a && b) {
                    if (a[0] === b[0] || a[1] === b[1]) { err(at, '"from" and "to" are opposite corners; this rectangle has no area.'); return; }
                    terrain.push({ ...base, shape: 'rect', from: a, to: b });
                }
                return;
            }
            case 'line': {
                unknownKeys(s, ['shape', 'terrain', 'points', 'width', 'outline', 'roughness'], at, warn);
                const pts = points(s.points, at + '.points', 2);
                if (typeof s.width !== 'number' || !(s.width > 0)) { err(at + '.width', 'Must be a number above 0 (cells).'); return; }
                if (pts) terrain.push({ ...base, shape: 'line', points: pts, width: number(s.width, at + '.width', 1, 0.1, 40) });
                return;
            }
        }
    });

    /* ---- paths */
    const kinds = PATH_KINDS.map((k) => k.kind);
    const paths: RecipePath[] = [];
    list('paths', LIMITS.paths).forEach((p, i) => {
        const at = `paths[${i}]`;
        if (!isObj(p)) { err(at, 'Must be an object.'); return; }
        unknownKeys(p, ['kind', 'points', 'width', 'name', 'route'], at, warn);
        const kind = typeof p.kind === 'string' ? slugify(p.kind) as PathKind : null;
        if (!kind || !kinds.includes(kind)) {
            err(at + '.kind', `Unknown path kind ${short(p.kind)}. Use one of: ${kinds.join(', ')}.`);
            return;
        }
        const pts = points(p.points, at + '.points', 2);
        if (!pts) return;
        const def = PATH_KINDS.find((k) => k.kind === kind)!;
        paths.push({
            kind, points: pts,
            width: number(p.width, at + '.width', def.width, 0.1, 5),
            name: words(p.name, at + '.name', 60),
            route: words(p.route, at + '.route', 8),
        });
    });

    /* ---- landmarks */
    const landmarks: RecipeLandmark[] = [];
    list('landmarks', LIMITS.landmarks).forEach((l, i) => {
        const at = `landmarks[${i}]`;
        if (!isObj(l)) { err(at, 'Must be an object.'); return; }
        unknownKeys(l, ['type', 'at', 'size', 'rotation', 'flip', 'name', 'gymType'], at, warn);
        const word = typeof l.type === 'string' ? slugify(l.type) : '';
        const slug = LANDMARK_BY_SLUG.has(word) ? word : LANDMARK_BY_NAME.get(word);
        if (!slug) {
            const near = word ? closest(word, LANDMARK_SLUGS) : null;
            err(at + '.type', `Unknown landmark ${short(l.type)}.` + (near ? ` Did you mean "${near}"?` : '') + ' See the landmark list.');
            return;
        }
        const def = LANDMARK_BY_SLUG.get(slug)!;
        const p = place(l.at, at + '.at');
        if (!p) return;
        let gymType: string | undefined;
        if (l.gymType !== undefined) {
            const g = POKEMON_TYPES.find((t) => t.toLowerCase() === String(l.gymType).toLowerCase());
            if (!def.typed) warn(at + '.gymType', `Only a gym takes a type; ignored on "${slug}".`);
            else if (!g) warn(at + '.gymType', `Unknown type ${short(l.gymType)}. Use one of: ${POKEMON_TYPES.join(', ')}.`);
            else gymType = g;
        }
        if (l.flip !== undefined && typeof l.flip !== 'boolean') warn(at + '.flip', 'Must be true or false; used false.');
        landmarks.push({
            type: slug, at: p,
            size: number(l.size, at + '.size', def.size, 0.5, 12),
            rotation: number(l.rotation, at + '.rotation', 0, -360, 360),
            flip: l.flip === true,
            name: words(l.name, at + '.name', 60),
            gymType,
        });
    });

    /* ---- labels */
    const labels: RecipeLabel[] = [];
    list('labels', LIMITS.labels).forEach((l, i) => {
        const at = `labels[${i}]`;
        if (!isObj(l)) { err(at, 'Must be an object.'); return; }
        unknownKeys(l, ['text', 'at', 'role', 'scale', 'rotation', ...LABEL_TYPE_KEYS], at, warn);
        const t = words(l.text, at + '.text', 120);
        if (!t || !t.trim()) { err(at + '.text', 'Needs the text to show.'); return; }
        const p = place(l.at, at + '.at');
        if (!p) return;
        let role: LabelRole = 'town';
        if (l.role !== undefined) {
            if (ROLES.includes(l.role as LabelRole)) role = l.role as LabelRole;
            else warn(at + '.role', `Must be one of ${ROLES.join(', ')}; used "town".`);
        }
        const out: RecipeLabel = {
            text: t, at: p, role,
            scale: number(l.scale, at + '.scale', 1, 0.3, 6),
            rotation: number(l.rotation, at + '.rotation', 0, -180, 180),
        };
        readLabelType(l, out, at, warn);
        labels.push(out);
    });

    /* ---- tokens */
    const tokens: RecipeToken[] = [];
    list('tokens', LIMITS.tokens).forEach((tk, i) => {
        const at = `tokens[${i}]`;
        if (!isObj(tk)) { err(at, 'Must be an object.'); return; }
        unknownKeys(tk, ['kind', 'species', 'name', 'at', 'size', 'color'], at, warn);
        const kind = tk.kind as TokenKind;
        if (!['pokemon', 'trainer', 'wild'].includes(kind)) {
            err(at + '.kind', `Must be one of pokemon, trainer, wild; got ${short(tk.kind)}.`);
            return;
        }
        const p = place(tk.at, at + '.at');
        if (!p) return;
        let color = kind === 'pokemon' ? TOKEN_COLOR_NAMES.blue : kind === 'trainer' ? TOKEN_COLOR_NAMES.red : TOKEN_COLOR_NAMES.teal;
        if (tk.color !== undefined) {
            const c = typeof tk.color === 'string' ? tk.color.trim().toLowerCase() : '';
            if (TOKEN_COLOR_NAMES[c]) color = TOKEN_COLOR_NAMES[c];
            else if (/^#[0-9a-f]{6}$/.test(c)) color = c;
            else warn(at + '.color', `Use one of ${Object.keys(TOKEN_COLOR_NAMES).join(', ')} or "#rrggbb"; used the default.`);
        }
        const size = number(tk.size, at + '.size', 1, 0.3, 6);
        const name = words(tk.name, at + '.name', 40);
        if (kind === 'pokemon') {
            const sp = words(tk.species, at + '.species', 60);
            if (!sp) { err(at + '.species', 'A pokemon token needs "species": the Pokémon\'s name.'); return; }
            if (opts.species) {
                const hit = opts.species(sp);
                if (!hit) { err(at + '.species', `No Pokémon called ${JSON.stringify(sp)} in the Pokédex. Use its English name, e.g. "Pikachu", "Mr. Mime", "Vulpix (Alolan Form)".`); return; }
                tokens.push({ kind, at: p, size, color, name: name ?? hit.name, image: hit.image });
                return;
            }
            tokens.push({ kind, at: p, size, color, name: name ?? sp });
            return;
        }
        if (tk.species !== undefined) warn(at + '.species', `Only a pokemon token shows a species; ignored on a ${kind} token.`);
        tokens.push({ kind, at: p, size, color, name: name ?? (kind === 'trainer' ? 'Trainer' : 'Wild') });
    });

    return { recipe: { map, seed, terrain, paths, landmarks, labels, tokens }, issues };
}

/* ------------------------------------------------------ label type fields */

const LABEL_TYPE_KEYS = [
    'font', 'weight', 'italic', 'caps', 'color', 'halo', 'haloWidth', 'opacity', 'spacing', 'lineHeight',
    'align', 'direction', 'warp', 'bend', 'slant', 'stretch', 'shadow',
];

/** A label's optional type settings. A bad one is left at the style's own
    look, never guessed at. */
function readLabelType(l: Record<string, unknown>, out: RecipeLabel, at: string,
    warn: (where: string, message: string) => void): void {
    const oneOf = <K extends keyof MapLabel>(k: K, allowed: string[]) => {
        if (l[k] === undefined) return;
        if (allowed.includes(l[k] as string)) (out as unknown as Record<string, unknown>)[k] = l[k];
        else warn(`${at}.${k}`, `Must be one of ${allowed.join(', ')}; left at the default.`);
    };
    const num = (k: 'weight' | 'haloWidth' | 'opacity' | 'spacing' | 'lineHeight' | 'bend' | 'slant' | 'stretch', lo: number, hi: number) => {
        const v = l[k];
        if (v === undefined) return;
        if (typeof v !== 'number' || !isFinite(v)) { warn(`${at}.${k}`, 'Must be a number; left at the default.'); return; }
        out[k] = Math.max(lo, Math.min(hi, v));
        if (out[k] !== v) warn(`${at}.${k}`, `${v} is outside ${lo}..${hi}; used ${out[k]}.`);
    };
    const bool = (k: 'italic' | 'shadow') => {
        if (l[k] === undefined) return;
        if (typeof l[k] === 'boolean') out[k] = l[k] as boolean;
        else warn(`${at}.${k}`, 'Must be true or false; left at the default.');
    };
    const colour = (k: 'color' | 'halo') => {
        if (l[k] === undefined) return;
        if (typeof l[k] === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(l[k] as string)) out[k] = l[k] as string;
        else warn(`${at}.${k}`, 'Must be a hex colour such as "#3b2f24"; left at the default.');
    };
    oneOf('font', LABEL_FONT_IDS);
    num('weight', 100, 900);
    bool('italic');
    oneOf('caps', ['none', 'upper', 'lower', 'title']);
    colour('color');
    colour('halo');
    num('haloWidth', 0, 1);
    num('opacity', 0, 1);
    num('spacing', -0.5, 2);
    num('lineHeight', 0.5, 4);
    oneOf('align', ['left', 'center', 'right']);
    oneOf('direction', ['horizontal', 'vertical']);
    oneOf('warp', LABEL_WARPS.map((w) => w.warp));
    num('bend', -100, 100);
    num('slant', -45, 45);
    num('stretch', 0.3, 3);
    bool('shadow');
}

/* ----------------------------------------------------------------- bits */

function isObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function unknownKeys(o: Record<string, unknown>, known: string[], at: string, warn: (w: string, m: string) => void): void {
    for (const k of Object.keys(o)) if (!known.includes(k)) warn(`${at}.${k}`, 'Not a field this page knows; ignored.');
}

function short(v: unknown): string {
    const s = JSON.stringify(v);
    return s === undefined ? 'nothing' : s.length > 40 ? s.slice(0, 37) + '...' : s;
}

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

/** The issues, written for the assistant that wrote the recipe. */
export function issuesForAssistant(issues: RecipeIssue[]): string {
    const lines = issues.map((i) => `- ${i.level === 'error' ? 'ERROR' : 'warning'} at ${i.where}: ${i.message}`);
    return 'The Map Maker checked your recipe and found these problems. ERROR items were left out of the map; '
        + 'warnings were adjusted as described.\n\n' + lines.join('\n')
        + '\n\nReply with the whole corrected recipe as one ```json code block, following the same instructions as before.';
}

/** "12 terrain shapes, 3 paths, ..." */
export function recipeSummary(r: Recipe): string {
    const parts: string[] = [];
    const n = (count: number, one: string, many: string) => { if (count) parts.push(count + ' ' + (count === 1 ? one : many)); };
    n(r.terrain.length, 'terrain shape', 'terrain shapes');
    n(r.paths.length, 'path', 'paths');
    n(r.landmarks.length, 'landmark', 'landmarks');
    n(r.labels.length, 'label', 'labels');
    n(r.tokens.length, 'token', 'tokens');
    return parts.join(', ') || 'nothing to draw';
}

/** The species lookup the parser takes: exact name, then the name with
    punctuation and accents ignored, then a dex number. */
export function speciesFinder(pokemon: { Name: string; Image: string; Number: number }[]) {
    const key = (s: string) => slugify(s).replace(/-/g, '');
    const exact = new Map<string, { image: string; name: string }>();
    const loose = new Map<string, { image: string; name: string }>();
    const byNumber = new Map<number, { image: string; name: string }>();
    for (const p of pokemon) {
        const hit = { image: p.Image, name: p.Name };
        if (!exact.has(p.Name.toLowerCase())) exact.set(p.Name.toLowerCase(), hit);
        if (!loose.has(key(p.Name))) loose.set(key(p.Name), hit);
        if (!byNumber.has(p.Number)) byNumber.set(p.Number, hit);
    }
    return (q: string) => {
        const s = q.trim();
        if (/^#?\d+$/.test(s)) return byNumber.get(Number(s.replace('#', ''))) ?? null;
        return exact.get(s.toLowerCase()) ?? loose.get(key(s)) ?? null;
    };
}
