import { useSheetStore } from '../../state/SheetContext';
import { SKILL_GROUPS } from '../../lib/pills';
import type { TrainerSkills } from '../../state/types';

function SkillDots({ skillKey }: { skillKey: keyof TrainerSkills }) {
    const { sheet, store } = useSheetStore();
    const value = sheet.skills[skillKey] || 0;
    return (
        <div className="skill-dots" data-skill={skillKey}>
            {[1, 2, 3, 4, 5].map((i) => (
                <div
                    key={i}
                    className={'skill-dot' + (i <= value ? ' filled' : '')}
                    onClick={() => store.update((s) => {
                        s.skills = { ...s.skills, [skillKey]: (value === i) ? i - 1 : i };
                    })}
                />
            ))}
        </div>
    );
}

export function SkillsTower() {
    return (
        <div className="skills-tower">
            {SKILL_GROUPS.map((group) => (
                <div className="skill-group" key={group.label}>
                    <span className="skill-group-label">{group.label}</span>
                    <div className="skill-group-rows">
                        {group.skills.map((sk) => (
                            <div className="tower-skill" key={sk.key}>
                                <span className="tower-skill-name">{sk.label}</span>
                                <SkillDots skillKey={sk.key as keyof TrainerSkills} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
