import { useState } from 'react';
import { Panel } from './Panel';
import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { uid } from '../../gm/state';
import {
    GENDERS, LANGS, REGIONS, genderIcon, randomName, startOptions,
} from '../../gm/names';
import type { GeneratedName } from '../../gm/names';
import type { GmNpc } from '../../gm/types';

/* Generate name ideas, click one to keep it — or type your own. The note next to
   each name is free text (role, town, voice…). */

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function NpcPanel({ onReorder }: { onReorder: (from: string, to: string) => void }) {
    const { state, store } = useGm();
    const { data } = useAppData();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [suggestions, setSuggestions] = useState<GeneratedName[]>([]);
    const [draft, setDraft] = useState('');

    const o = state.nameOpts;
    const natures = data.natures;
    const natureByName = (name: string) => natures.find((n) => n.Name === name) || null;

    const setOpt = (key: keyof typeof o, value: string | boolean) => store.update((s) => {
        let v = value;
        if (key === 'letter') {
            /* One letter, letters only: anything else can never match an onset
               and would silently produce unfiltered names. */
            v = String(value).replace(/[^a-zA-Z]/g, '').slice(0, 1);
        }
        s.nameOpts = { ...s.nameOpts, [key]: v };
    });

    const addNpc = (name: string, meta?: Partial<GeneratedName> & { nature?: string }) => store.update((s) => {
        s.npcs = [...s.npcs, {
            gid: uid(), name, note: '',
            gender: (meta && meta.gender) || 'n',
            region: (meta && meta.region) || '',
            nature: (meta && meta.nature) || '',
        }];
    });

    const suggest = () => {
        const next = Array.from({ length: 5 }, () => randomName(o)) as (GeneratedName & { nature?: string })[];
        if (o.withNature && natures.length) {
            next.forEach((s) => { s.nature = pick(natures).Name; });
        }
        setSuggestions(next);
    };

    /* Say so when the requested letter has nothing to build on in the chosen
       flavour, rather than quietly ignoring it. */
    let warn = '';
    if (o.letter && o.region !== 'Mixed' && REGIONS[o.region]) {
        if (!startOptions(LANGS[REGIONS[o.region].lang!], o.letter).ok) {
            warn = 'No ' + REGIONS[o.region].label + ' sound starts with "'
                + o.letter.toUpperCase() + '" — names will ignore the letter.';
        }
    }

    return (
        <Panel
            panelKey="npc"
            icon="fa-address-book"
            title="NPC Names"
            onReorder={onReorder}
            actions={
                <>
                    <button className="icon-btn" onClick={suggest} title="Generate name ideas">
                        <i className="fa-solid fa-wand-magic-sparkles"></i> Generate
                    </button>
                    <button
                        className={'icon-btn' + (settingsOpen ? ' accent' : '')}
                        id="npc-cog"
                        onClick={() => setSettingsOpen((v) => !v)}
                        title="Generation settings"
                    >
                        <i className="fa-solid fa-gear"></i>
                    </button>
                </>
            }
        >
            <div className="panel-body">
                <div className="muted">
                    Generate ideas, click one to keep it — or type your own. The note next to each name
                    is free text (role, town, voice…).
                </div>

                <div className={'npc-settings' + (settingsOpen ? ' open' : '')} id="npc-settings">
                    <div className="set-row">
                        <label htmlFor="set-region">Region</label>
                        <select
                            id="set-region"
                            value={o.region}
                            onChange={(e) => setOpt('region', e.currentTarget.value)}
                        >
                            {Object.entries(REGIONS).map(([k, r]) => (
                                <option value={k} key={k}>{r.label}{r.note ? ' — ' + r.note : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div className="set-row">
                        <label>Gender</label>
                        <div className="seg" id="set-gender">
                            {GENDERS.map((g) => (
                                <button
                                    key={g.key}
                                    className={o.gender === g.key ? 'on' : ''}
                                    onClick={() => setOpt('gender', g.key)}
                                    title={g.label}
                                >
                                    <i className={'fa-solid ' + g.icon}></i>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="set-row">
                        <label htmlFor="set-letter">Starts with</label>
                        <input
                            type="text" id="set-letter" maxLength={1} placeholder="any letter"
                            value={o.letter}
                            onChange={(e) => setOpt('letter', e.currentTarget.value)}
                        />
                    </div>
                    <label className="set-check">
                        <input
                            type="checkbox" id="set-nature"
                            checked={!!o.withNature}
                            onChange={(e) => setOpt('withNature', e.currentTarget.checked)}
                        />
                        Roll a nature with each name
                    </label>
                    <div className="set-warn" id="set-warn" style={{ display: warn ? 'block' : 'none' }}>
                        {warn}
                    </div>
                </div>

                <div className="npc-suggestions" id="npc-suggestions">
                    {suggestions.map((s, i) => (
                        <button
                            key={s.name + i}
                            className="npc-suggestion"
                            title={'Keep this name' + ((s as { nature?: string }).nature
                                ? ' (' + (s as { nature?: string }).nature + ')' : '')}
                            onClick={() => {
                                addNpc(s.name, s);
                                setSuggestions((prev) => prev.filter((_, j) => j !== i));
                            }}
                        >
                            <i className={'fa-solid ' + genderIcon(s.gender) + ' g-icon'}></i>{s.name}
                        </button>
                    ))}
                </div>

                <div className="add-row">
                    <input
                        type="text" id="npc-add-name" placeholder="Add a name…"
                        value={draft}
                        onChange={(e) => setDraft(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const name = draft.trim();
                            if (!name) return;
                            setDraft('');
                            addNpc(name, { gender: o.gender === 'any' ? 'n' : o.gender });
                        }}
                    />
                    <button
                        onClick={() => {
                            const name = draft.trim();
                            if (!name) return;
                            setDraft('');
                            addNpc(name, { gender: o.gender === 'any' ? 'n' : o.gender });
                        }}
                    >
                        <i className="fa-solid fa-plus"></i>
                    </button>
                </div>

                <div id="npc-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {!state.npcs.length ? (
                        <div className="empty-note">No NPC names kept yet.</div>
                    ) : state.npcs.map((n) => (
                        <NpcRow
                            key={n.gid}
                            npc={n}
                            natures={natures.map((x) => x.Name)}
                            nature={natureByName(n.nature || '')}
                            onNote={(note) => store.update((s) => {
                                s.npcs = s.npcs.map((x) => x.gid === n.gid ? { ...x, note } : x);
                            })}
                            onNature={(nature) => store.update((s) => {
                                s.npcs = s.npcs.map((x) => x.gid === n.gid ? { ...x, nature } : x);
                            })}
                            onRoll={() => {
                                if (!natures.length) return;
                                const nature = pick(natures).Name;
                                store.update((s) => {
                                    s.npcs = s.npcs.map((x) => x.gid === n.gid ? { ...x, nature } : x);
                                });
                            }}
                            onRemove={() => store.update((s) => {
                                s.npcs = s.npcs.filter((x) => x.gid !== n.gid);
                            })}
                        />
                    ))}
                </div>
            </div>
        </Panel>
    );
}

function NpcRow({ npc, natures, nature, onNote, onNature, onRoll, onRemove }: {
    npc: GmNpc;
    natures: string[];
    nature: { Name: string; Keywords: string; Description: string } | null;
    onNote: (v: string) => void;
    onNature: (v: string) => void;
    onRoll: () => void;
    onRemove: () => void;
}) {
    const [clipped, setClipped] = useState(true);
    const region = npc.region && REGIONS[npc.region] ? REGIONS[npc.region].note : '';

    return (
        <div className="npc-row">
            <div className="npc-line">
                <i className={'fa-solid ' + genderIcon(npc.gender) + ' g-icon'}></i>
                <span className="npc-name" title={npc.name}>{npc.name}</span>
                {region && <span className="npc-region">{region}</span>}
                <input
                    type="text"
                    value={npc.note}
                    placeholder="role, town, voice…"
                    onChange={(e) => onNote(e.currentTarget.value)}
                />
                <button className="icon-btn danger" title="Forget" onClick={onRemove}>
                    <i className="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div className="npc-nature-line">
                <select
                    value={npc.nature || ''}
                    onChange={(e) => onNature(e.currentTarget.value)}
                    title="Nature / temperament"
                >
                    <option value="">— nature —</option>
                    {natures.map((x) => <option value={x} key={x}>{x}</option>)}
                </select>
                <span className="npc-keywords" title={nature ? nature.Keywords : undefined}>
                    {nature ? nature.Keywords : ''}
                </span>
                <button className="icon-btn" title="Roll a random nature" onClick={onRoll}>
                    <i className="fa-solid fa-dice-d20"></i>
                </button>
            </div>
            {nature && (
                <div
                    className={'npc-desc' + (clipped ? ' clipped' : '')}
                    title="Click to expand"
                    onClick={() => setClipped((v) => !v)}
                >
                    {nature.Description}
                </div>
            )}
        </div>
    );
}
