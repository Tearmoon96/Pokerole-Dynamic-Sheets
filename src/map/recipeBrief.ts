import { TERRAINS, TERRAIN_BY_CODE, terrainOf } from './terrain';
import { LANDMARKS, LANDMARK_GROUPS, landmarkOf } from './landmarks';
import { MAP_STYLES, PATH_KINDS, styleOf } from './styles';
import { LABEL_FONTS, LABEL_WARPS } from './labelText';
import { resolvedOf } from './raster';
import { LIMITS, POKEMON_TYPES, RECIPE_FORMAT, RECIPE_VERSION, TOKEN_COLOR_NAMES } from './recipe';
import type { RecipeMap } from './recipe';
import type { MapDoc } from './types';

/* The instructions a chat assistant writes a recipe from.

   Everything the parser accepts is spelled out here, generated from the same
   tables it checks against, so the assistant has nothing to guess: the
   coordinate system, the painting order, every terrain, shape, path kind,
   landmark, label field and token field, the limits, and a complete example
   (which the harness parses to be sure it is valid). The owner's
   description goes at the top; drawing onto an existing map adds a picture
   of what is already there. */

export interface BriefOptions {
    mode: 'new' | 'add';
    description: string;
    /** New: the settings the assistant must copy. Add: the map drawn onto. */
    map: RecipeMap;
    /** Add: the map itself, so its contents can be described. */
    doc?: MapDoc;
    /** New: the name was left blank, so the assistant chooses one. */
    nameOpen?: boolean;
}

const TERRAIN_USE: Record<string, string> = {
    'clouds': 'open sky; the background for floating sky islands',
    'deep-sea': 'dark open ocean, far from any shore',
    'sea': 'ocean, bays and straits',
    'shallows': 'pale coastal water: a band along coasts, reefs, sandbars',
    'lake': 'inland fresh water: lakes, ponds, wide rivers painted as areas',
    'swamp': 'marsh, bog, wetland',
    'beach': 'sand along a coast or lake shore',
    'grassland': 'plain open land, meadows, fields: the usual land',
    'flower-field': 'meadows full of flowers',
    'tall-grass': 'tall grass where wild Pokémon hide',
    'forest': 'temperate woods',
    'jungle': 'tropical rainforest',
    'desert': 'sand desert and dunes',
    'badlands': 'dry rocky scrub, mesas, canyon country',
    'tundra': 'cold barren plains',
    'snow': 'snowfields and ice caps (for snow-capped mountains use snow-mountain)',
    'mountain': 'mountains and rocky highlands',
    'snow-mountain': 'snow-capped mountains, high peaks above the snowline',
    'volcanic': 'lava fields and volcanic rock',
    'cave-floor': 'cave interiors and underground areas',
    'road': 'a paved or dirt surface painted as an area: plazas, wide roads (for an ordinary road use a path instead)',
    'town-paving': 'streets and squares inside a town',
};

const PATH_USE: Record<string, string> = {
    'river': 'a river or stream; it tapers, thin at its first point and full width at its last, so list the points from the SOURCE to the MOUTH',
    'road': 'a road between places',
    'route': 'a numbered Pokémon route, drawn dotted; give "route" its number',
    'trail': 'a footpath or mountain trail',
    'border': 'a political or regional border',
    'sea-route': 'a ferry or surfing lane across water',
};

const n2 = (n: number) => String(Math.round(n * 100) / 100);

export function recipeBrief(o: BriefOptions): string {
    const m = o.map;
    const W = m.cols, H = m.rows;
    const style = styleOf(m.styleId);
    const bgName = m.background;
    const out: string[] = [];
    const say = (...lines: string[]) => out.push(...lines);

    say(
        '# Pokerole Map Maker: map recipe instructions',
        '',
        'You are designing a map for the Pokerole Map Maker, a tool for drawing maps for a Pokémon tabletop role-playing game. '
        + 'You do not draw the map yourself. You write a MAP RECIPE, a JSON description of what goes where, and the Map Maker paints it.',
        '',
        'Follow these instructions exactly. They list everything the Map Maker understands. Anything not listed is ignored or rejected, '
        + 'so never invent field names, terrain names, path kinds or landmark types, and never leave out a required field.',
        '',
        '## What to draw',
        '',
        o.description.trim() || '(No description was given: design an interesting, coherent map that suits the settings below.)',
        '',
        '## Your reply',
        '',
        'Reply with the recipe as ONE ```json code block holding ONE JSON object. A single short sentence before the block is allowed; '
        + 'nothing after it. No comments inside the JSON and no trailing commas. The whole recipe must be in that one block: '
        + 'if it risks being too long, draw fewer, simpler shapes rather than let it be cut off.',
        '',
    );

    if (o.mode === 'new') {
        say(
            '## The map block',
            '',
            'Start the object with these fields, using exactly these values:',
            '',
            '```json',
            `"format": "${RECIPE_FORMAT}",`,
            `"version": ${RECIPE_VERSION},`,
            `"map": { "name": ${o.nameOpen ? '"<a short fitting name you choose>"' : JSON.stringify(m.name)}, "width": ${W}, "height": ${H}, `
            + `"style": "${m.styleId}", "background": "${bgName}"${m.scale ? `, "scale": ${JSON.stringify(m.scale)}` : ''} },`,
            '```',
            '',
            `- width and height: the size of the map in cells: ${W} columns by ${H} rows.`,
            `- style: how the map is drawn, "${m.styleId}" (${style.name}). The other styles (${MAP_STYLES.filter((s) => s.id !== m.styleId).map((s) => `"${s.id}"`).join(', ')}) exist, but use the one given.`,
            `- background: the terrain the whole map starts as, "${bgName}".`,
            m.scale ? `- scale: what one cell means, "${m.scale}". Size everything to it.` : '- No scale was given: decide what a cell means from the description and size everything consistently.',
            '',
        );
    } else {
        say(
            '## The existing map',
            '',
            `You are ADDING to a map that already exists, "${m.name}": ${W} columns by ${H} rows of cells, `
            + `style "${m.styleId}" (${style.name}), background "${bgName}"${m.scale ? `, where ${m.scale}` : ''}.`,
            'Everything in your recipe is drawn ON TOP of what is already there; nothing already on the map is removed. '
            + 'Start the object with these two fields and do NOT include a "map" block:',
            '',
            '```json',
            `"format": "${RECIPE_FORMAT}",`,
            `"version": ${RECIPE_VERSION},`,
            '```',
            '',
        );
        if (o.doc) say(...describeDoc(o.doc), '');
    }

    say(
        '## Coordinates',
        '',
        `- The map is a grid of ${W} columns by ${H} rows of cells. Every position is a point [x, y] measured in CELLS, never pixels.`,
        `- x runs from 0 at the left edge to ${W} at the right edge. y runs from 0 at the TOP edge to ${H} at the BOTTOM edge. `
        + `[0, 0] is the top-left corner, [${W}, ${H}] the bottom-right, [${n2(W / 2)}, ${n2(H / 2)}] the centre. North is up.`,
        '- Decimals are allowed (use at most 2). The centre of the cell in column 3, row 5 is [3.5, 5.5].',
        '- Terrain shapes may reach past the edges (up to one map-width beyond): the part outside is simply cut off. '
        + 'Use that for land or water that runs off the edge of the map.',
        `- Landmarks, labels and tokens must be inside the map: 0 <= x <= ${W}, 0 <= y <= ${H}.`,
        '',
        '## How the map is painted',
        '',
        `1. The whole map starts as the background terrain, "${bgName}".`,
        '2. The "terrain" list is painted in order, first to last. Every shape covers whatever is already under it, completely. '
        + 'So paint the biggest areas first and the details last: for example the land, then the forests, deserts and mountains on it, '
        + 'then snow on the highest peaks, then lakes, then town paving.',
        '3. Then the "paths" are drawn on top of the terrain, then the "landmarks", then the "labels", then the "tokens".',
        'Only the order of the "terrain" list matters for which terrain ends up on top; the terrains have no built-in order.',
        '',
        '## The recipe object',
        '',
        'Top-level fields (all lists are optional; leave a list out rather than send it empty):',
        '',
        `- "format": always "${RECIPE_FORMAT}"`,
        `- "version": always ${RECIPE_VERSION}`,
        ...(o.mode === 'new' ? ['- "map": the map block above'] : []),
        '- "seed": optional whole number (default 1). It changes the random wandering of natural edges and nothing else.',
        '- "terrain": list of terrain shapes',
        '- "paths": list of paths',
        '- "landmarks": list of landmarks',
        '- "labels": list of labels',
        '- "tokens": list of tokens',
        '',
        '## Terrains',
        '',
        'Use these names exactly, in lowercase, as the "terrain" of a shape:',
        '',
        ...TERRAINS.map((t) => `- "${t.slug}": ${TERRAIN_USE[t.slug] ?? t.name}`),
        '- "background": not a terrain but an eraser: it returns the area to the map\'s background.',
        '',
        '## Terrain shapes',
        '',
        'Every entry of "terrain" has "shape" and "terrain", plus the fields of its shape:',
        '',
        '- "polygon": "points": [[x, y], ...], at least 3 points going round the outline in order. Do not repeat the first point at the end, '
        + 'and do not let the outline cross itself. Use about 8 to 40 points for a coastline or region: the outline gives the overall shape, '
        + 'and a natural outline adds the fine detail itself.',
        '- "circle": "center": [x, y], "radius": a number of cells.',
        '- "ellipse": "center": [x, y], "radiusX" and "radiusY": numbers of cells, and optional "rotation" in degrees clockwise (default 0).',
        '- "rect": "from": [x, y] one corner, "to": [x, y] the opposite corner.',
        '- "line": "points": at least 2 points, "width": a number of cells. A band of terrain along a smooth curve through the points, '
        + '"width" cells across: a mountain ridge, a strip of beach, a canyon, a wide river painted as "lake".',
        '- "fill": "at": [x, y]. A paint bucket: repaints the whole connected patch that looks the same as the ground at that point, '
        + 'as painted so far. Only use it on a patch that is fully enclosed, or it spreads everywhere that terrain touches.',
        '',
        'Optional on every shape except "fill":',
        '',
        '- "outline": how the edge is drawn.',
        '  - "natural" (the default, except for "rect"): the edge wanders like a real coastline or forest edge. You give the rough shape; '
        + 'the Map Maker adds bays, headlands and crinkles. It moves the edge by about 7% of the shape\'s size (at least 0.35, at most 3.5 cells).',
        '  - "smooth": rounded and clean, no wandering; a polygon\'s corners are rounded off.',
        '  - "sharp" (the default for "rect"): exactly as given, straight edges and hard corners: buildings, walls, fields, rooms, arenas.',
        '- "roughness": 0 to 3 (default 1): how far a natural edge wanders. 0.5 is gentle, 2 is very jagged.',
        '',
        '## Paths',
        '',
        'Lines drawn over the terrain as smooth curves through their points. Every entry of "paths" has:',
        '',
        '- "kind": one of the kinds below',
        '- "points": [[x, y], ...], at least 2. The curve passes through every point.',
        '- "width": optional, in cells (0.1 to 5); the default is given per kind.',
        '- "name": optional text written along the path.',
        '- "route": optional route number shown as a badge halfway along, for kind "route", e.g. "1" or "12".',
        '',
        ...PATH_KINDS.map((k) => `- "${k.kind}" (default width ${k.width}): ${PATH_USE[k.kind] ?? k.name}`),
        '',
        '## Landmarks',
        '',
        'Pictures stamped on the map. Every entry of "landmarks" has:',
        '',
        '- "type": one of the types below',
        '- "at": [x, y], the centre of the picture',
        '- "size": optional width in cells (0.5 to 12); the default is given per type. The picture is square.',
        '- "rotation": optional, degrees clockwise (default 0). Leave it out unless the picture must turn.',
        '- "flip": optional true to mirror it left to right.',
        '- "name": optional short caption drawn just under the picture, e.g. the town\'s name.',
        `- "gymType": for "gym" only, optional: the gym's Pokémon type, one of ${POKEMON_TYPES.map((t) => `"${t}"`).join(', ')}.`,
        '',
        ...LANDMARK_GROUPS.flatMap((g) => [
            `${g.label}: ` + LANDMARKS.filter((l) => l.group === g.key).map((l) => `"${l.slug}" (${n2(l.size)})`).join(', '),
            '',
        ]),
        '## Labels',
        '',
        'Text on the map. Every entry of "labels" has:',
        '',
        '- "text": what it says. "\\n" starts a new line.',
        '- "at": [x, y], the centre of the text',
        '- "role": what kind of name it is, which sets its size and look (default "town"):',
        ...(['region', 'town', 'route', 'small'] as const).map((role) => {
            const h = style.label[role].size;
            const use = { region: 'a region, sea, mountain range or other large area', town: 'a town, city or notable place', route: 'a route, road, river or small area', small: 'a minor detail or note' }[role];
            return `  - "${role}": ${use}. About ${n2(h)} cells tall at scale 1${style.label[role].upper ? ', always in capitals' : ''}.`;
        }),
        '- "scale": optional size multiplier (0.3 to 6, default 1).',
        '- "rotation": optional, degrees clockwise (-180 to 180, default 0), to lay a name along a coast or range.',
        '',
        'A line of text is roughly (0.55 x its height x the number of characters) cells wide. Use that to keep labels inside the map '
        + 'and off each other and off the landmarks.',
        '',
        'Optional typesetting. Leave all of these out to use the map style\'s own look, which is usually best:',
        '',
        `- "font": one of ${LABEL_FONTS.map((f) => `"${f.id}" (${f.name})`).join(', ')}`,
        '- "weight": 100 to 900. "italic": true or false. "caps": "none", "upper", "lower" or "title".',
        '- "color" and "halo": hex colours such as "#3b2f24" for the letters and the outline round them. "haloWidth": 0 to 1 (default 0.2). "opacity": 0 to 1.',
        '- "spacing": extra letter spacing in ems, -0.5 to 2. "lineHeight": 0.5 to 4 (default 1.15). "align": "left", "center" or "right".',
        '- "direction": "horizontal" or "vertical" (letters stacked downwards).',
        `- "warp": ${LABEL_WARPS.map((w) => `"${w.warp}"`).join(', ')}; "bend": -100 to 100 (default 50), how strongly it warps.`,
        '- "slant": -45 to 45 degrees of lean. "stretch": 0.3 to 3, horizontal scale. "shadow": true or false.',
        '',
        '## Tokens',
        '',
        'Round counters for creatures and people, as on a battle map. Every entry of "tokens" has:',
        '',
        '- "kind": "pokemon", "trainer" or "wild" (a wild encounter marker)',
        '- "species": for "pokemon" only, required: the Pokémon\'s English name as the Pokédex writes it, e.g. "Pikachu", "Mr. Mime", '
        + '"Nidoran F", "Vulpix (Alolan Form)", "Meowth (Galarian Form)". A number such as "25" also works.',
        '- "at": [x, y], the centre of the token',
        '- "name": optional text shown with it (default: the species, "Trainer" or "Wild")',
        '- "size": optional diameter in cells (0.3 to 6, default 1)',
        `- "color": optional ring colour: ${Object.keys(TOKEN_COLOR_NAMES).map((c) => `"${c}"`).join(', ')}, or a hex colour "#rrggbb". `
        + 'Use the ring to show sides: one colour for the players\' side, another for opponents.',
        '',
        '## Limits',
        '',
        `At most ${LIMITS.terrain} terrain shapes, ${LIMITS.paths} paths, ${LIMITS.landmarks} landmarks, ${LIMITS.labels} labels and `
        + `${LIMITS.tokens} tokens, and ${LIMITS.points} points in any one polygon, line or path. Far fewer is normal: a good region `
        + 'map is often 20 to 60 terrain shapes.',
        '',
        '## Making a good map',
        '',
        '- Plan the geography before writing anything: where the land and water are, where the high ground is, which way rivers run. '
        + 'Rivers start in mountains, hills or lakes and run downhill to a lake or the sea; they do not cross mountains or start at the coast.',
        '- Build coasts in layers from the outside in: a "shallows" polygon a little bigger than the land, then a "beach" polygon slightly '
        + 'bigger than the land, then the land itself. The beach and shallows then show as bands round the coast.',
        '- Put features on the right ground: forests and grassland on land, snow on the highest mountains, a port or lighthouse on the coast, '
        + 'a cave in or beside mountains, towns by rivers, coasts and crossroads.',
        '- Unless land is meant to run off the edge, keep it at least 2 cells away from the edges of the map.',
        '- Name places either with the landmark\'s own "name" or with a separate label about 1 to 2 cells below it, never both. '
        + 'Use "region" labels for large areas, "town" for settlements, "route" for routes and rivers.',
        '- Connect towns with routes, roads or trails, each ending at or next to the landmarks it links, and number the routes.',
        '- Use the whole map. Spread things out; do not crowd one corner and leave the rest empty.',
        '- Match what the description asks for, and keep every name the description gives.',
        '',
        '## Check before you answer',
        '',
        '- The JSON parses: double quotes, no comments, no trailing commas, one object in one ```json block.',
        '- Every "terrain", "shape", "kind", "type" and "role" is spelled exactly as listed here.',
        '- Every position is [x, y] in cells, and every landmark, label and token is inside the map.',
        '- The "terrain" list goes from the biggest areas to the smallest details.',
        ...(o.mode === 'new' ? ['- The "map" block has exactly the values given above.'] : ['- There is no "map" block.']),
        '',
        '## Example',
        '',
        'A small complete recipe, only to show the format. It is not the map you were asked for; your map, its size and its settings come from the sections above.',
        '',
        '```json',
        EXAMPLE_RECIPE,
        '```',
    );
    return out.join('\n');
}

/** A complete, valid recipe using every part of the format. The harness
    parses it and requires no issues at all. */
export const EXAMPLE_RECIPE = `{
  "format": "${RECIPE_FORMAT}",
  "version": ${RECIPE_VERSION},
  "map": { "name": "Driftwood Isle", "width": 40, "height": 28, "style": "handdrawn", "background": "sea", "scale": "1 cell = 500 m" },
  "terrain": [
    { "shape": "polygon", "terrain": "shallows", "points": [[6, 6], [18, 3], [32, 5], [36, 14], [31, 24], [17, 25], [5, 19]] },
    { "shape": "polygon", "terrain": "beach", "points": [[8, 7], [18, 4.5], [30.5, 6.5], [34, 14], [29.5, 22.5], [17.5, 23.5], [7, 18]] },
    { "shape": "polygon", "terrain": "grassland", "points": [[9, 8], [18, 5.5], [29.5, 7.5], [33, 14], [28.5, 21.5], [18, 22.5], [8, 17.5]], "roughness": 1.2 },
    { "shape": "polygon", "terrain": "forest", "points": [[11, 9], [17, 7.5], [20, 11], [16, 15], [11, 14]] },
    { "shape": "line", "terrain": "mountain", "points": [[23, 8.5], [27, 11], [29, 15]], "width": 3.5 },
    { "shape": "circle", "terrain": "snow", "center": [27, 11], "radius": 1.2, "outline": "smooth" },
    { "shape": "circle", "terrain": "lake", "center": [20, 17], "radius": 1.8 },
    { "shape": "rect", "terrain": "town-paving", "from": [12, 17], "to": [15, 19.5] }
  ],
  "paths": [
    { "kind": "river", "points": [[26, 13], [23, 15.5], [21, 17]] },
    { "kind": "route", "points": [[15, 18], [18, 19.5], [23, 20], [27, 17.5]], "route": "1" },
    { "kind": "sea-route", "points": [[9, 20], [4, 24], [1, 27]] }
  ],
  "landmarks": [
    { "type": "town", "at": [13.5, 18.2], "name": "Driftwood Town" },
    { "type": "pokemon-center", "at": [16, 16.5] },
    { "type": "gym", "at": [11, 16], "gymType": "Water" },
    { "type": "cave", "at": [28, 17] },
    { "type": "lighthouse", "at": [8.5, 19.5], "size": 1.5 },
    { "type": "compass-rose", "at": [36, 24.5], "size": 2.5 }
  ],
  "labels": [
    { "text": "Driftwood Isle", "at": [20, 2], "role": "region" },
    { "text": "Mt. Ember", "at": [26, 6.8], "role": "route" },
    { "text": "Whisper Wood", "at": [15, 11], "role": "small", "italic": true }
  ],
  "tokens": [
    { "kind": "pokemon", "species": "Wingull", "at": [5, 12], "color": "teal" },
    { "kind": "trainer", "name": "Rival", "at": [22, 20.5], "color": "red" }
  ]
}`;

/* ------------------------------------------------- what the map already has */

/** A text picture of an existing map: the ground on a coarse grid, and every
    object with its position, so the assistant can build round them. */
function describeDoc(doc: MapDoc): string[] {
    const { cols, rows } = doc;
    const ras = resolvedOf(doc);
    const step = Math.max(1, Math.ceil(Math.max(cols / 80, rows / 60)));
    const gw = Math.ceil(cols / step), gh = Math.ceil(rows / step);
    const used = new Set<string>();
    const lines: string[] = [];
    for (let gy = 0; gy < gh; gy++) {
        let line = '';
        for (let gx = 0; gx < gw; gx++) {
            /* The most common ground in the block, from a few samples of it. */
            const count = new Map<number, number>();
            for (let k = 0; k < 9; k++) {
                const cx = Math.min(cols - 0.01, (gx + ((k % 3) + 0.5) / 3) * step);
                const cy = Math.min(rows - 0.01, (gy + (Math.floor(k / 3) + 0.5) / 3) * step);
                const v = ras.data[Math.floor(cy * ras.res) * ras.w + Math.floor(cx * ras.res)];
                count.set(v, (count.get(v) ?? 0) + 1);
            }
            let best = 0, most = -1;
            for (const [v, c] of count) if (c > most) { best = v; most = c; }
            const code = TERRAINS[best]?.code ?? '?';
            used.add(code);
            line += code;
        }
        lines.push(line);
    }

    const out: string[] = [
        'What the map looks like now. Each character is one block of ' + (step === 1 ? 'one cell' : `${step} x ${step} cells`)
        + `; the first character of the first row is the block at [0, 0], and the grid is ${gw} blocks wide and ${gh} tall.`,
        '',
        'Key: ' + [...used].sort().map((c) => `${c} = ${terrainOf(c).slug}`).join(', '),
        '',
        '```',
        ...lines,
        '```',
    ];
    const f = (x: number, y: number) => `[${n2(x)}, ${n2(y)}]`;
    if (doc.stamps.length) {
        out.push('', 'Landmarks already on it:');
        for (const s of doc.stamps) out.push(`- ${landmarkOf(s.landmark).slug} at ${f(s.x, s.y)}, size ${n2(s.size)}${s.label ? `, named ${JSON.stringify(s.label)}` : ''}`);
    }
    if (doc.labels.length) {
        out.push('', 'Labels already on it:');
        for (const l of doc.labels) out.push(`- ${JSON.stringify(l.text)} (${l.role}) at ${f(l.x, l.y)}`);
    }
    if (doc.paths.length) {
        out.push('', 'Paths already on it:');
        for (const p of doc.paths) out.push(`- ${p.kind}${p.label ? ` ${JSON.stringify(p.label)}` : ''}${p.routeNo ? ` route ${p.routeNo}` : ''} through ${p.points.map((q) => f(q[0], q[1])).join(' ')}`);
    }
    if (doc.tokens.length) {
        out.push('', 'Tokens already on it:');
        for (const t of doc.tokens) out.push(`- ${t.kind} ${JSON.stringify(t.name)} at ${f(t.x, t.y)}`);
    }
    return out;
}

/** The dialog's settings for a map drawn onto, read off the map. */
export function recipeMapOf(doc: MapDoc): RecipeMap {
    return {
        name: doc.name, cols: doc.cols, rows: doc.rows, styleId: doc.styleId,
        background: (TERRAIN_BY_CODE.get(doc.background) ?? TERRAINS[2]).slug, scale: doc.scaleLabel,
    };
}
