import { useSyncExternalStore } from 'react';
import type { Tool } from './types';

/* The Map Maker's keyboard shortcuts, as profiles the user can switch between
   and edit.

   A binding is a string: the modifiers in a fixed order and then the key, as
   "Ctrl+Shift+Z", "Space" or "[". Keys are matched on `KeyboardEvent.key`
   (upper-cased when it is a letter), so a binding follows the keyboard's
   layout — what is printed on the key is what the user pressed to record it.
   Space is matched on `code`, since its `key` is a bare " ".

   Two profiles ship built in and cannot be edited: Classic, the
   Photoshop-like set the page has always had, and Left hand, which keeps
   everything under the left hand's home row. Editing a built-in makes a copy
   and edits that, so a user can never lose one of them. Custom profiles and
   the active choice live in localStorage under their own key — they belong to
   this browser, not to any one map. */

export type HotkeyAction =
    | `tool:${Tool}`
    | 'pan-hold' | 'fit' | 'zoom-in' | 'zoom-out' | 'grid'
    | 'undo' | 'redo' | 'duplicate' | 'select-all' | 'delete' | 'deselect'
    | 'brush-smaller' | 'brush-larger';

export interface HotkeyActionDef { action: HotkeyAction; name: string; group: string }

export const HOTKEY_ACTIONS: HotkeyActionDef[] = [
    { action: 'tool:select', name: 'Select and move', group: 'Tools' },
    { action: 'tool:pan', name: 'Pan', group: 'Tools' },
    { action: 'tool:paint', name: 'Paint terrain', group: 'Tools' },
    { action: 'tool:fill', name: 'Fill an area', group: 'Tools' },
    { action: 'tool:path', name: 'Draw a path', group: 'Tools' },
    { action: 'tool:stamp', name: 'Place a landmark', group: 'Tools' },
    { action: 'tool:token', name: 'Place a token', group: 'Tools' },
    { action: 'tool:label', name: 'Add a label', group: 'Tools' },
    { action: 'tool:erase', name: 'Eraser', group: 'Tools' },
    { action: 'tool:edge', name: 'Borders', group: 'Tools' },
    { action: 'pan-hold', name: 'Pan while held', group: 'View' },
    { action: 'fit', name: 'Fit the whole map', group: 'View' },
    { action: 'zoom-in', name: 'Zoom in', group: 'View' },
    { action: 'zoom-out', name: 'Zoom out', group: 'View' },
    { action: 'grid', name: 'Show or hide the grid', group: 'View' },
    { action: 'undo', name: 'Undo', group: 'Edit' },
    { action: 'redo', name: 'Redo', group: 'Edit' },
    { action: 'duplicate', name: 'Duplicate the selection', group: 'Edit' },
    { action: 'select-all', name: 'Select everything', group: 'Edit' },
    { action: 'delete', name: 'Delete the selection', group: 'Edit' },
    { action: 'deselect', name: 'Clear the selection', group: 'Edit' },
    { action: 'brush-smaller', name: 'Smaller brush', group: 'Brush' },
    { action: 'brush-larger', name: 'Larger brush', group: 'Brush' },
];

export type Bindings = Partial<Record<HotkeyAction, string[]>>;

export interface HotkeyProfile {
    id: string;
    name: string;
    builtin?: boolean;
    bindings: Bindings;
}

/* The keys every profile shares unless it says otherwise. */
const COMMON: Bindings = {
    'zoom-in': ['+', '='],
    'zoom-out': ['-'],
    grid: ['#'],
    undo: ['Ctrl+Z'],
    redo: ['Ctrl+Y', 'Ctrl+Shift+Z'],
    duplicate: ['Ctrl+D'],
    'select-all': ['Ctrl+A'],
    delete: ['Delete', 'Backspace'],
    deselect: ['Escape'],
    'brush-smaller': ['['],
    'brush-larger': [']'],
};

export const BUILTIN_PROFILES: HotkeyProfile[] = [
    {
        id: 'classic',
        name: 'Classic (Photoshop-like)',
        builtin: true,
        bindings: {
            ...COMMON,
            'tool:select': ['V'],
            'tool:pan': ['H'],
            'tool:paint': ['B'],
            'tool:fill': ['G'],
            'tool:path': ['P'],
            'tool:stamp': ['S'],
            'tool:token': ['T'],
            'tool:label': ['L'],
            'tool:erase': ['E'],
            'tool:edge': ['O'],
            'pan-hold': ['Space'],
            fit: ['0'],
        },
    },
    {
        /* Everything under the left hand, so the right stays on the mouse —
           which is also why panning is the middle button here rather than a
           held key: Space fits the map instead. */
        id: 'left-hand',
        name: 'Left hand (QWER)',
        builtin: true,
        bindings: {
            ...COMMON,
            'tool:select': ['Q'],
            'tool:pan': ['W'],
            'tool:paint': ['E'],
            'tool:path': ['R'],
            'tool:fill': ['F'],
            'tool:token': ['A'],
            'tool:stamp': ['S'],
            'tool:label': ['D'],
            'tool:erase': ['C'],
            'tool:edge': ['Z'],
            'pan-hold': [],
            fit: ['Space', '0'],
        },
    },
];

const STORE_KEY = 'pokerole_map_hotkeys';

interface Saved { active: string; custom: HotkeyProfile[] }

/* ---------------------------------------------------------------- keys */

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift'] as const;

/** Keys that are only ever a modifier and so never a binding on their own. */
const BARE_MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS'];

function keyName(e: KeyboardEvent): string | null {
    if (BARE_MODIFIERS.includes(e.key)) return null;
    if (e.code === 'Space') return 'Space';
    if (e.key === 'Dead' || e.key === 'Unidentified') return null;
    return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** Shift is part of a binding only for keys where it does not already change
    the character: "Ctrl+Shift+Z" is Shift, but "+" — Shift+= on most layouts —
    is just "+". */
function shiftCounts(key: string): boolean {
    return key.length > 1 || /[A-Z0-9]/.test(key);
}

/** The binding a key press spells, or null for a bare modifier. */
export function eventCombo(e: KeyboardEvent): string | null {
    const key = keyName(e);
    if (!key) return null;
    const mods: string[] = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey && shiftCounts(key)) mods.push('Shift');
    return [...mods, key].join('+');
}

/** Tidies a stored binding into the form eventCombo produces. */
export function normalizeCombo(combo: string): string {
    const parts = combo.split('+');
    /* "+" itself splits into two empty parts; put it back. */
    let key = parts.pop() || '';
    if (key === '' && combo.endsWith('+')) { parts.pop(); key = '+'; }
    const mods = MOD_ORDER.filter((m) => parts.some((p) => p.toLowerCase() === m.toLowerCase()
        || (m === 'Ctrl' && /^(cmd|meta|control)$/i.test(p))));
    key = key.length === 1 ? key.toUpperCase() : key;
    return [...mods, key].join('+');
}

/** How a binding is shown on a key cap. */
export function comboLabel(combo: string): string {
    return combo.replace(/^Arrow/, '').replace(/\+Arrow/, '+');
}

/* ---------------------------------------------------------------- store */

function load(): Saved {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (raw && typeof raw === 'object') {
            const custom = (Array.isArray(raw.custom) ? raw.custom : [])
                .filter((p: HotkeyProfile) => p && typeof p.id === 'string' && p.bindings)
                .map((p: HotkeyProfile) => ({ id: p.id, name: String(p.name || 'Custom'), bindings: cleanBindings(p.bindings) }));
            return { active: typeof raw.active === 'string' ? raw.active : 'classic', custom };
        }
    } catch { /* fall through to the defaults */ }
    return { active: 'classic', custom: [] };
}

function cleanBindings(b: unknown): Bindings {
    const out: Bindings = {};
    if (!b || typeof b !== 'object') return out;
    for (const def of HOTKEY_ACTIONS) {
        const v = (b as Record<string, unknown>)[def.action];
        if (Array.isArray(v)) out[def.action] = v.filter((x) => typeof x === 'string' && x).map(normalizeCombo);
    }
    return out;
}

let saved = load();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: Saved): void {
    saved = next;
    version++;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* storage full or blocked */ }
    listeners.forEach((l) => l());
}

export function allProfiles(): HotkeyProfile[] {
    return [...BUILTIN_PROFILES, ...saved.custom];
}

export function activeProfile(): HotkeyProfile {
    return allProfiles().find((p) => p.id === saved.active) || BUILTIN_PROFILES[0];
}

export function setActiveProfile(id: string): void {
    commit({ ...saved, active: id });
}

function newId(): string {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** A custom copy of any profile, made active. Returns its id. */
export function copyProfile(fromId: string, name?: string): string {
    const from = allProfiles().find((p) => p.id === fromId) || activeProfile();
    const copy: HotkeyProfile = {
        id: newId(),
        name: name || from.name.replace(/ \(.*\)$/, '') + ' (custom)',
        bindings: JSON.parse(JSON.stringify(from.bindings)),
    };
    commit({ active: copy.id, custom: [...saved.custom, copy] });
    return copy.id;
}

export function renameProfile(id: string, name: string): void {
    commit({ ...saved, custom: saved.custom.map((p) => (p.id === id ? { ...p, name } : p)) });
}

export function deleteProfile(id: string): void {
    commit({
        active: saved.active === id ? 'classic' : saved.active,
        custom: saved.custom.filter((p) => p.id !== id),
    });
}

/** Sets one action's keys on a CUSTOM profile. A key taken from another
    action is removed there, so one press never means two things. */
export function setBindings(id: string, action: HotkeyAction, combos: string[]): void {
    const clean = [...new Set(combos.map(normalizeCombo))];
    commit({
        ...saved,
        custom: saved.custom.map((p) => {
            if (p.id !== id) return p;
            const bindings: Bindings = {};
            for (const def of HOTKEY_ACTIONS) {
                const had = p.bindings[def.action] || [];
                bindings[def.action] = def.action === action ? clean : had.filter((c) => !clean.includes(c));
            }
            return { ...p, bindings };
        }),
    });
}

/** Which action a key press means in the active profile. */
export function actionFor(e: KeyboardEvent): HotkeyAction | null {
    const combo = eventCombo(e);
    if (!combo) return null;
    const b = activeProfile().bindings;
    for (const def of HOTKEY_ACTIONS) if ((b[def.action] || []).includes(combo)) return def.action;
    return null;
}

/** The action whose binding this is, in a profile — for conflict notes. */
export function actionUsing(profile: HotkeyProfile, combo: string): HotkeyAction | null {
    for (const def of HOTKEY_ACTIONS) if ((profile.bindings[def.action] || []).includes(combo)) return def.action;
    return null;
}

/** The first key for an action, for a tooltip: "(V)". */
export function keyHint(action: HotkeyAction): string {
    const k = (activeProfile().bindings[action] || [])[0];
    return k ? ' (' + comboLabel(k) + ')' : '';
}

function subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
}

/** Re-renders when the profiles or the choice change. */
export function useHotkeys(): { active: HotkeyProfile; profiles: HotkeyProfile[] } {
    useSyncExternalStore(subscribe, () => version, () => version);
    return { active: activeProfile(), profiles: allProfiles() };
}

/* Another tab changing the profiles. */
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key !== STORE_KEY) return;
        saved = load();
        version++;
        listeners.forEach((l) => l());
    });
}

/** "Hold Space to pan." in the active profile's words — or the middle button,
    which pans in every profile. */
export function panHint(): string {
    const k = (activeProfile().bindings['pan-hold'] || [])[0];
    return k ? 'Hold ' + comboLabel(k) + ' or drag with the middle button to pan.'
        : 'Drag with the middle mouse button to pan.';
}

/** "[ and ] change the size." in the active profile's words. */
export function brushSizeHint(): string {
    const b = activeProfile().bindings;
    const a = (b['brush-smaller'] || [])[0], z = (b['brush-larger'] || [])[0];
    return a && z ? comboLabel(a) + ' and ' + comboLabel(z) + ' change the size. ' : '';
}
