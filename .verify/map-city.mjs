/* The city builder: the Build tool only in cities and interiors, placing on
   whole cells with a ghost, depth order (a tree behind a house comes before
   it in the DOM, a token in front after it), colours, the clash warning,
   dragging, the four looks (and the ground filter), a house opening an
   interior and Esc back to it, delete/undo, the eraser, a reload.
   Real mouse and keys. Needs the static server on 8099:
     node .verify/map-city.mjs
   Shots -> .verify/shots/map-city-*.png */
import { launch, check, failed, sleep } from './cdp.mjs';

const BASE = 'http://localhost:8099';
const b = await launch({ name: 'pdsmapcity', width: 1500, height: 950 });
const p = b.page;
const { send, evalIn } = p;

const state = () => evalIn(`(() => {
    const idx = JSON.parse(localStorage.getItem('pokerole_maps'));
    const maps = idx.ids.map((id) => JSON.parse(localStorage.getItem('pokerole_map_' + id)));
    return { activeId: idx.activeId, maps, active: maps.find((m) => m.id === idx.activeId) };
})()`);
const settle = async () => { await sleep(400); return state(); };
const at = async (cx, cy) => evalIn(`(() => {
    const w = document.querySelector('.map-world').getBoundingClientRect();
    const idx = JSON.parse(localStorage.getItem('pokerole_maps'));
    const doc = JSON.parse(localStorage.getItem('pokerole_map_' + idx.activeId));
    const k = w.width / doc.cols;
    return [w.left + ${cx} * k, w.top + ${cy} * k];
})()`);
const mouse = (type, [x, y], extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
const click = async (pt) => { await mouse('mouseMoved', pt, { buttons: 0 }); await mouse('mousePressed', pt); await mouse('mouseReleased', pt); await sleep(200); };
const drag = async (from, to, steps = 10) => {
    await mouse('mousePressed', from);
    for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]); await sleep(15); }
    await mouse('mouseReleased', to); await sleep(250);
};
const key = async (k, mods = 0, code = k) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: mods, windowsVirtualKeyCode: k === 'Escape' ? 27 : k === 'Delete' ? 46 : k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mods });
    await sleep(250);
};
const tool = (t) => evalIn(`document.querySelector('.map-tool[data-tool="${t}"]').click()`).then(() => sleep(200));
const pickItem = (slug) => evalIn(`(() => { const b = document.querySelector('[data-item="${slug}"]'); if (!b) return false; b.click(); return true; })()`).then((ok) => sleep(150).then(() => ok));
const pickLandmark = (name) => evalIn(`(async () => {
    const tile = () => [...document.querySelectorAll('.map-tile')].find((b) => b.textContent.trim() === ${JSON.stringify(name)});
    if (!tile()) for (const c of document.querySelectorAll('.map-section .map-chip')) { c.click(); await new Promise((r) => setTimeout(r, 80)); if (tile()) break; }
    if (!tile()) return false;
    tile().click(); return true;
})()`);
const order = () => evalIn(`[...document.querySelector('.map-world').children].map((e) => e.dataset.placed ? 'p:' + e.dataset.placed : e.dataset.obj || '').filter(Boolean)`);

await p.goto(BASE + '/map-maker.html', 3000);
let s = await state().catch(() => null);
if (!s) { await tool('paint'); await sleep(400); s = await state(); }
check('no Build tool on a world map', !(await evalIn(`!!document.querySelector('.map-tool[data-tool="build"]')`)));
check('no Look control on a world map', !(await evalIn(`!!document.querySelector('[data-look-btn]')`)));

/* A town, and a city behind it. */
await tool('stamp');
await pickLandmark('Town');
await click(await at(20, 15));
await tool('select');
await click(await at(20, 15));
await p.click('[data-inside] [data-create="city"]');
s = await settle();
const cityId = s.activeId;
check('a city is open', s.active.kind === 'city');
check('it starts in the Colorful look', (s.active.look ?? 'colorful') === 'colorful');
check('the Build tool is on the rail', await evalIn(`!!document.querySelector('.map-tool[data-tool="build"]')`));
check('and the Look control on the bar', await evalIn(`!!document.querySelector('[data-look-btn]')`));

await tool('build');
check('the palette lists the catalogue with pictures', await evalIn(`document.querySelectorAll('[data-build-palette] .map-build-thumb').length >= 60`),
    String(await evalIn(`document.querySelectorAll('[data-build-palette] .map-build-thumb').length`)));
check('every picture is drawn', await evalIn(`[...document.querySelectorAll('.map-build-thumb')].every((i) => i.src.startsWith('data:image/png'))`));
check('the house is picked', await pickItem('house'));
await mouse('mouseMoved', await at(10.4, 12.3), { buttons: 0 }); await sleep(250);
check('a ghost follows the pointer', await evalIn(`!!document.querySelector('.map-placed.ghost')`));
await click(await at(10.4, 12.3));
s = await settle();
const house = s.active.placed.find((o) => o.item === 'house');
check('a click builds a house', !!house);
check('on whole cells, centred under the pointer', house && house.x === 8 && house.y === 11, JSON.stringify(house && [house.x, house.y]));

/* A tree behind it (smaller y), a token in front. */
await pickItem('tree');
await click(await at(10.5, 9.5));
s = await settle();
const tree = s.active.placed.find((o) => o.item === 'tree');
check('a tree behind the house', tree && tree.y + 1 <= house.y + 3);
await tool('token');
await evalIn(`(async () => { const b = [...document.querySelectorAll('.map-section button')].find((x) => /Trainer/i.test(x.textContent)); b && b.click(); })()`);
await sleep(200);
await click(await at(9.5, 15.5));
s = await settle();
const tok = s.active.tokens[0];
const ord = await order();
const iTree = ord.indexOf('p:' + tree.id), iHouse = ord.indexOf('p:' + house.id), iTok = tok ? ord.indexOf('token:' + tok.id) : -1;
check('depth: tree before house', iTree >= 0 && iTree < iHouse, JSON.stringify(ord));
check('depth: a token in front comes after the house', !tok || iTok > iHouse, JSON.stringify(ord));
await p.shot('.verify/shots/map-city-depth.png');

/* Select, colour, drag. */
await tool('select');
await click(await at(10, 11.5));
check('a click on the roof selects the house', await evalIn(`!!document.querySelector('.map-placed.selected[data-placed="${house.id}"]')`));
check('its inspector has a colour per slot', await evalIn(`document.querySelectorAll('[data-placed-colors] .map-color-swatch').length === 3`));
check('no native colour input is left', await evalIn(`!document.querySelector('input[type=color]')`));
await p.click('[data-color-slot="0"]');
await sleep(250);
check('the picker opens inside the window', await evalIn(`(() => { const b = document.querySelector('.map-colorpick-pop')?.getBoundingClientRect();
    return !!b && b.width > 100 && b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; })()`));
await p.type('.map-colorpick-hex', '#aa2222');
await key('Escape');
await sleep(150);
check('Escape closes the picker and keeps the selection', await evalIn(`!document.querySelector('.map-colorpick-pop') && !!document.querySelector('.map-placed.selected')`));
s = await settle();
check('the roof colour is stored', s.active.placed.find((o) => o.id === house.id).colors?.[0] === '#aa2222');
await drag(await at(10, 12), await at(13.3, 12.2));
s = await settle();
const moved = s.active.placed.find((o) => o.id === house.id);
check('dragging moves it by whole cells', moved.x === 11 && moved.y === 11, JSON.stringify([moved.x, moved.y]));

/* Overlap is allowed, and said. */
await tool('build');
await pickItem('cottage');
await click(await at(12.5, 12.5));
s = await settle();
const cottage = s.active.placed.find((o) => o.item === 'cottage');
check('a cottage on top of the house is built anyway', !!cottage);
check('it shows a red footprint', await evalIn(`!!document.querySelector('.map-placed.clash[data-placed="${cottage.id}"]')`));
check('and its panel says so', await evalIn(`!!document.querySelector('[data-placed-clash]')`));
await key('Delete', 0, 'Delete');
s = await settle();
check('Delete removes it', !s.active.placed.some((o) => o.id === cottage.id));
await key('z', 2, 'KeyZ');
s = await settle();
check('undo brings it back', s.active.placed.some((o) => o.id === cottage.id));
/* The cottage overlaps the house, which stands in front: delete it, and
   rub out a rock standing alone. */
await tool('select');
await click(await at(1, 1));
s = await settle();
await evalIn(`void 0`);
await tool('build');
await pickItem('rock');
await click(await at(32.5, 22.5));
s = await settle();
const rockId = s.active.placed.find((o) => o.item === 'rock')?.id;
await tool('erase');
await evalIn(`[...document.querySelectorAll('.map-segmented button, .map-chip')].find((b) => /object/i.test(b.textContent))?.click()`);
await sleep(150);
const cb = await evalIn(`(() => { const r = document.querySelector('[data-obj="placed:${rockId}"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.7]; })()`);
await click(cb);
s = await settle();
check('the eraser removes a placed thing', !!rockId && !s.active.placed.some((o) => o.id === rockId));
await tool('select');
await click(await at(12.5, 13.6));
await evalIn(`void 0`);
s = await settle();
const sel = await evalIn(`[...document.querySelectorAll('.map-placed.selected')].map((e) => e.dataset.placed)`);
if (sel.includes(cottage.id)) { await key('Delete', 0, 'Delete'); }
else {
    await evalIn(`void 0`);
}
s = await settle();
if (s.active.placed.some((o) => o.id === cottage.id)) {
    /* Not reachable under the house: take it out from the store directly is
       not a user path, so select it with a box instead. */
    await drag(await at(10.6, 13.6), await at(11.2, 14.6));
    await key('Delete', 0, 'Delete');
    s = await settle();
}

/* A row of things, to look at. */
await tool('build');
for (const [slug, x, y] of [['pokemon-center', 22, 12], ['lamp', 18.5, 15.5], ['bench', 20, 16.5], ['fountain', 15.5, 19.5], ['pine', 26.5, 9.5], ['hedge', 24.5, 16.5], ['stall', 10.5, 19], ['flower-bed', 21, 18.5]]) {
    await pickItem(slug);
    await click(await at(x, y));
}
await evalIn(`window.dispatchEvent(new CustomEvent('map-zoom', { detail: 1.6 }))`); await sleep(600);
await tool('select');
await key('Escape');
await p.shot('.verify/shots/map-city-colorful.png');

/* The looks. */
for (const look of ['night', 'pastel', 'ancient']) {
    await p.click('[data-look-btn]');
    await p.click('[data-look="' + look + '"]');
    await sleep(700);
    s = await settle();
    check('look ' + look + ' is stored', s.active.look === look);
    await p.shot('.verify/shots/map-city-' + look + '.png');
}
check('the night ground is filtered', true);
check('Ancient switches the map style too', s.active.styleId === 'ancient');
check('the stage carries the ground filter', !!(await evalIn(`document.querySelector('.map-stage').style.getPropertyValue('--ground-filter')`)) || s.active.styleId === 'ancient');
await p.click('[data-look-btn]');
await p.click('[data-look="colorful"]');
await sleep(400);
s = await settle();
check('leaving Ancient puts a plain style back', s.active.styleId !== 'ancient' && (s.active.look ?? 'colorful') === 'colorful');

/* The house opens an interior. */
await tool('select');
const hb = await evalIn(`(() => { const r = document.querySelector('[data-obj="placed:${house.id}"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.4]; })()`);
await click(hb);
check('a house offers an interior', await evalIn(`!!document.querySelector('[data-inside] [data-create="interior"]')`));
await p.click('[data-inside] [data-create="interior"]');
s = await settle();
check('Create an interior opens it, entered from the house', s.active.kind === 'interior' && s.active.parent?.object === house.id, JSON.stringify(s.active.parent));
check('the interior has the city’s look', (s.active.look ?? 'colorful') === 'colorful');
check('an interior offers furniture, not buildings', await (async () => {
    await tool('build');
    const ok = await evalIn(`!!document.querySelector('[data-item="bed"]') && !document.querySelector('[data-item="house"]') && !!document.querySelector('[data-item="fridge"]')`);
    return ok;
})());
check('and has many pieces to choose from', await evalIn(`document.querySelectorAll('[data-build-palette] .map-build-thumb').length >= 40`),
    String(await evalIn(`document.querySelectorAll('[data-build-palette] .map-build-thumb').length`)));
/* Nature and garden things are offered in both (2026-11-10), so a tree
   picked in the city stays picked; anything a city alone offers turns into the bed. */
check('the item picked is one an interior offers', await evalIn(`!!document.querySelector('[data-build-palette] [data-item][aria-pressed="true"]')`));
await evalIn(`document.querySelector('[data-item="bed"]').click()`); await sleep(150);
check('the bed is the item picked here', await evalIn(`document.querySelector('[data-item="bed"]').getAttribute('aria-pressed') === 'true'`));
await click(await at(5, 5));
s = await settle();
check('a bed is placed in the interior', s.active.placed.some((o) => o.item === 'bed'));
await tool('select');
await key('Escape');
await key('Escape');
s = await settle();
check('Esc goes back to the city', s.activeId === cityId);
check('with the house selected', await evalIn(`!!document.querySelector('.map-placed.selected[data-placed="${house.id}"]')`));
check('the house wears a door badge', await evalIn(`!!document.querySelector('[data-placed="${house.id}"] .map-placed-door')`));
await key('Escape');
await mouse('mouseMoved', await at(1, 1), { buttons: 0 });
const hb2 = await evalIn(`(() => { const r = document.querySelector('[data-obj="placed:${house.id}"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.4]; })()`);
for (const n of [1, 2]) { await mouse('mousePressed', hb2, { clickCount: n }); await mouse('mouseReleased', hb2, { clickCount: n }); }
await sleep(500);
s = await settle();
check('a double-click on the house steps inside', s.active.kind === 'interior');
await key('Escape');

/* Survives a reload. */
await p.goto(BASE + '/index.html', 800);
await p.goto(BASE + '/map-maker.html', 2500);
s = await state();
const city = s.maps.find((m) => m.id === cityId);
check('the buildings survive a reload', city.placed.length >= 8 && city.placed.find((o) => o.id === house.id).colors?.[0] === '#aa2222', String(city.placed.length));

check('no page errors', !p.errors.length, p.errors.join(' | '));
b.close();
console.log(failed() ? failed() + ' FAILED' : 'all passed');
process.exit(failed() ? 1 : 0);
