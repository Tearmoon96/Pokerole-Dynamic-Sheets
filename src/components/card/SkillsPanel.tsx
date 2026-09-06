import { useState } from 'react';
import { useCard } from '../../card/CardContext';
import type { CardSkills, SkillCategory } from '../../card/types';

/* Skills, the four category ratings, and the custom specialties.

   Collapsed, the panel keeps only what has points on it: the skill rows with a
   dot filled, the specialties with a value, and the category heading above
   whichever of those survive — a heading pulled out from over its own rows would
   leave them unlabelled. Everything sitting at zero goes, along with the
   add-a-specialty field; a sheet with nothing assigned collapses to the title
   bar by itself.

   The original read this off the filled dots in the DOM so it could never
   disagree with what was on screen. Here the state IS what is on screen, so it
   is computed from the sheet directly. */

interface Category {
    key: SkillCategory;
    label: string;
    icon: string;
    skills: { key: keyof CardSkills; label: string }[];
}

const CATEGORIES: Category[] = [
    {
        key: 'fight', label: 'Fight', icon: 'fa-shield-halved', skills: [
            { key: 'brawl', label: 'Brawl' },
            { key: 'channel', label: 'Channel' },
            { key: 'clash', label: 'Clash' },
            { key: 'evasion', label: 'Evasion' },
        ],
    },
    {
        key: 'survival', label: 'Survival', icon: 'fa-tree', skills: [
            { key: 'alert', label: 'Alert' },
            { key: 'athletic', label: 'Athletic' },
            { key: 'nature', label: 'Nature' },
            { key: 'stealth', label: 'Stealth' },
        ],
    },
    {
        key: 'social', label: 'Social', icon: 'fa-comments', skills: [
            { key: 'charm', label: 'Charm' },
            { key: 'empathy', label: 'Empathy' },
            { key: 'intimidate', label: 'Intimidate' },
            { key: 'perform', label: 'Perform' },
        ],
    },
    {
        key: 'knowledge', label: 'Knowledge', icon: 'fa-book', skills: [
            { key: 'craft', label: 'Craft' },
            { key: 'etiquette', label: 'Etiquette' },
            { key: 'medicine', label: 'Medicine' },
            { key: 'science', label: 'Science' },
        ],
    },
];

function Dots({ value, onPick }: { value: number; onPick: (i: number) => void }) {
    return (
        <>
            {[1, 2, 3, 4, 5].map((i) => (
                <div
                    key={i}
                    className={'skill-dot' + (i <= value ? ' filled' : '')}
                    onClick={() => onPick(i)}
                />
            ))}
        </>
    );
}

export function SkillsPanel() {
    const { sheet, store } = useCard();
    const [collapsed, setCollapsed] = useState(false);

    const skillValue = (k: keyof CardSkills) => sheet.skills[k] || 0;

    const setSkill = (k: keyof CardSkills, i: number) => store.update((s) => {
        s.skills = { ...s.skills, [k]: (s.skills[k] || 0) === i ? i - 1 : i };
    });

    const setCategory = (cat: SkillCategory, i: number) => store.update((s) => {
        s.categoryRatings = { ...s.categoryRatings, [cat]: (s.categoryRatings[cat] || 0) === i ? i - 1 : i };
    });

    /* Which rows survive a collapse. */
    const keptSkills = (c: Category) => c.skills.filter((sk) => skillValue(sk.key) > 0);
    const keptSpecialties = sheet.specialties.filter((sp) => sp.value > 0);
    const keptCategories = CATEGORIES.filter((c) =>
        keptSkills(c).length > 0 || (sheet.categoryEnabled[c.key] && (sheet.categoryRatings[c.key] || 0) > 0));
    /* Nothing left to show: drop the body outright, or the panel's own 16px gap
       would sit under the title as a strip of empty box. */
    const anythingLeft = keptCategories.length > 0 || keptSpecialties.length > 0;

    return (
        <div className="skills-panel">
            <h2
                className="stats-title"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
            >
                <span><i className="fa-solid fa-graduation-cap"></i> Skills &amp; Specialties</span>
                <button
                    className="edit-stats-btn"
                    id="skills-collapse-btn"
                    onClick={() => setCollapsed((v) => !v)}
                    title={collapsed ? 'Expand section' : 'Collapse section'}
                >
                    <i className={'fa-solid ' + (collapsed ? 'fa-chevron-down' : 'fa-chevron-up')}></i>
                </button>
            </h2>

            <div
                className="skills-body"
                id="skills-body"
                style={{ display: (!collapsed || anythingLeft) ? 'flex' : 'none' }}
            >
                {CATEGORIES.map((c) => {
                    const kept = keptSkills(c);
                    const catOn = !!sheet.categoryEnabled[c.key];
                    const catRating = sheet.categoryRatings[c.key] || 0;
                    const showCategory = !collapsed || kept.length > 0 || (catOn && catRating > 0);
                    if (!showCategory) return null;
                    const rows = collapsed ? kept : c.skills;
                    return (
                        <div className="skills-category" key={c.key}>
                            <div className="category-title">
                                <span className="category-name">
                                    <i
                                        className={'fa-solid ' + c.icon + ' cat-icon' + (catOn ? ' active' : '')}
                                        data-category-toggle={c.key}
                                        title={'Toggle ' + c.label + ' rating'}
                                        onClick={() => store.update((s) => {
                                            s.categoryEnabled = { ...s.categoryEnabled, [c.key]: !s.categoryEnabled[c.key] };
                                        })}
                                    /> {c.label}
                                </span>
                                <div
                                    className="skill-dots category-dots"
                                    data-category={c.key}
                                    style={{ display: catOn ? 'flex' : 'none' }}
                                >
                                    {catOn && <Dots value={catRating} onPick={(i) => setCategory(c.key, i)} />}
                                </div>
                            </div>
                            {rows.map((sk) => (
                                <div className="skill-row" key={sk.key}>
                                    <span className="skill-label">{sk.label}</span>
                                    <div className="skill-dots" id={'skill-' + sk.key} data-skill={sk.key}>
                                        <Dots value={skillValue(sk.key)} onPick={(i) => setSkill(sk.key, i)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}

                <Specialties collapsed={collapsed} />
            </div>
        </div>
    );
}

function Specialties({ collapsed }: { collapsed: boolean }) {
    const { sheet, store } = useCard();
    const [draft, setDraft] = useState('');

    const rows = collapsed ? sheet.specialties.filter((s) => s.value > 0) : sheet.specialties;
    if (collapsed && !rows.length) return null;

    const add = () => {
        const val = draft.trim();
        if (!val) return;
        const exists = sheet.specialties.some((s) => s.name.toLowerCase() === val.toLowerCase());
        if (exists) return;
        store.update((s) => { s.specialties = [...s.specialties, { name: val, value: 1 }]; });
        setDraft('');
    };

    return (
        <div className="specialties-section">
            <div className="specialties-title"><i className="fa-solid fa-award"></i> Custom Specialties</div>
            <div className="specialties-list" id="specialties-list">
                {!sheet.specialties.length ? (
                    <span style={{
                        fontSize: '0.8rem', color: 'var(--text-muted)',
                        fontStyle: 'italic', marginBottom: '5px',
                    }}>
                        No specialties added yet.
                    </span>
                ) : rows.map((spec) => {
                    const idx = sheet.specialties.indexOf(spec);
                    return (
                        <div className="custom-specialty-row" key={spec.name}>
                            <span className="skill-label">{spec.name}</span>
                            <div className="custom-specialty-controls">
                                <div className="skill-dots">
                                    <Dots
                                        value={spec.value}
                                        onPick={(i) => store.update((s) => {
                                            s.specialties = s.specialties.map((x, j) =>
                                                j === idx ? { ...x, value: x.value === i ? i - 1 : i } : x);
                                        })}
                                    />
                                </div>
                                <i
                                    className="fa-solid fa-xmark specialty-remove"
                                    onClick={() => store.update((s) => {
                                        s.specialties = s.specialties.filter((_, j) => j !== idx);
                                    })}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            {!collapsed && (
                <div className="specialty-input-group">
                    <input
                        type="text"
                        id="specialty-input"
                        className="specialty-input"
                        placeholder="e.g., Brawl: Punch"
                        value={draft}
                        onChange={(e) => setDraft(e.currentTarget.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                    />
                    <button className="specialty-add-btn" onClick={add}>Add</button>
                </div>
            )}
        </div>
    );
}
