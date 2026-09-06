/* A populated trainer, written into the working-set key both pages read at
   boot, so the screenshots compare a filled sheet rather than an empty one. */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = process.argv[2];
const dex = (() => {
    const src = readFileSync(ROOT + '/PDS React Develop/app-data/pokedex-db.js', 'utf8');
    const w = {}; new Function('window', src)(w); return w.ALL_POKEMON;
})();

const pick = (name) => dex.find((p) => p.Name === name);
const team = ['Pikachu', 'Charizard', 'Gengar', 'Lapras'].map((n, i) => {
    const p = pick(n);
    return {
        uid: 't' + i, dexId: p._id,
        sheet: { nickname: '', rank: ['Starter', 'Beginner', 'Amateur', 'Ace'][i], heldItem: ['Oran Berry', '', 'Leftovers', ''][i], hp: 5 + i, gender: i % 2 ? 'F' : 'M' },
        preview: null,
    };
});
while (team.length < 6) team.push({ dexId: '', sheet: null, preview: null });

const data = {
    id: 'tseedtrainer', name: 'Ash Ketchum', player: 'Luca', gender: 'M',
    photo: '', photoFile: '', photoAdjust: { scale: 1, offsetX: 0, offsetY: 0 },
    themeType: 'License',
    stats: { strength: 3, dexterity: 4, vitality: 2, special: 3, insight: 5, tough: 2, cool: 4, beauty: 1, cute: 3, clever: 5 },
    skills: { brawl: 3, channel: 1, clash: 2, evasion: 4, alert: 5, athletic: 2, nature: 3, stealth: 1, charm: 4, empathy: 2, intimidate: 3, perform: 1, craft: 2, lore: 5, medicine: 3, science: 4 },
    extras: [{ name: 'Cooking', value: 3 }, { name: 'Fishing', value: 2 }],
    achievements: [
        { text: 'Beat the Pewter Gym', done: true },
        { text: 'Caught 20 species', done: false },
        { text: 'Survived Mt. Moon', done: true },
        { text: '', done: false }, { text: '', done: false },
    ],
    nature: 'Adamant', rank: 'Ace', hp: 4, will: 6, hpMaxBonus: 0, willMaxBonus: 0,
    hpMax: null, willMax: null, exp: 42, age: '16', money: 3250,
    team, boxes: [], activeBox: 0, boxSpriteType: 'Home', boxUseCustom: true,
    bagOut: [{ name: 'Poke Ball', qty: 5 }, { name: 'Potion', qty: 3 }],
    bagBattle: [{ name: 'Super Potion', qty: 2 }],
    potionCharges: { potion: [true, false], superPotion: [true, true, false, false], hyperPotion: Array.from({ length: 14 }, (_, i) => i < 9) },
    potionQty: { potion: 3, superPotion: 2, hyperPotion: 1 },
    otherMeds: 'Camping Kit x2\nRepel x1',
    badges: [
        { earned: true, type: 'Rock' }, { earned: true, type: 'Water' },
        { earned: true, type: 'Electric' }, { earned: false, type: '' },
        { earned: false, type: '' }, { earned: false, type: '' },
        { earned: false, type: '' }, { earned: false, type: '' },
    ],
    equipment: {}, equipBag: [],
    notes: 'Meet Professor Oak in Viridian.\nAsk about the fossil.',
    manualBookmarks: {},
};

const seed = { trainers: [{ id: data.id, name: data.name, fileName: 'ash.json', data }], active: 0 };

/* A populated GM board: the trainer above in the roster with its team open, a
   wild, three combatants mid-round, notes, NPCs and a roll in the history. */
const wildDex = pick('Rattata');
const gm = {
    trainerIds: [data.id],
    wilds: [{
        gid: 'gwild1', dexId: wildDex._id, pushed: false,
        sheet: {
            hp: 3, will: 2, nickname: '',
            status: { major: 'poison', poisonStage: 1, burnDegree: 0, confusion: false, flinch: false, inLove: false },
            pinnedMoves: ['Tackle', 'Quick Attack'],
        },
    }],
    combat: {
        round: 2,
        participants: [
            { pid: 'p1', label: 'Ash Ketchum', kind: 'trainer', dexId: null, src: 'T:' + data.id,
              init: 7, acted: 2, since: {}, cure: {}, dealt: {} },
            { pid: 'p2', label: 'Ash Ketchum - Pikachu', kind: 'mon', dexId: pick('Pikachu')._id,
              src: 'M:' + data.id + ':0', init: 9, acted: 1, since: {}, cure: {}, dealt: {} },
            { pid: 'p3', label: 'Rattata (wild)', kind: 'wild', dexId: wildDex._id, src: 'w:gwild1',
              init: 5, acted: 0, since: {}, cure: {}, dealt: {} },
        ],
    },
    notes: '',
    noteSheets: [
        { gid: 'n1', title: 'Session 4', body: 'The gym leader is out of town.\nAsk about the fossil.', open: true },
        { gid: 'n2', title: 'Loot', body: 'Two potions, a rare candy.', open: false },
    ],
    npcs: [
        { gid: 'c1', name: 'Takeshi', gender: 'm', region: 'Kanto', note: 'innkeeper', nature: 'Adamant' },
        { gid: 'c2', name: 'Elodie', gender: 'f', region: 'Kalos', note: '', nature: '' },
    ],
    dice: {
        count: 4, sides: 6, history: [
            { label: '4d6', vals: [5, 3, 6, 2], total: 16, succ: 2, net: 2, t: 1700000000000,
              who: 'Pikachu', what: 'Thunderbolt accuracy', need: 2, pain: 0, verdict: 'hit' },
            { label: '2d6', vals: [4, 1], total: 5, succ: 1, net: 1, t: 1699999990000 },
        ],
    },
    expanded: { [data.id]: true },
    nameOpts: { region: 'Kanto', gender: 'any', letter: '', withNature: false },
    layout: { order: ['roster', 'combat', 'dice', 'npc', 'notes'], widths: {} },
};

const set = (key, value) =>
    `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});`;
const js = '<script>try{' + set('pokerole_working', seed) + set('pokerole_gm_screen', gm)
    + '}catch(e){}<' + '/script>';
writeFileSync(ROOT + '/.verify/seed-snippet.html', js);
console.log('seed written, ' + js.length + ' bytes');
