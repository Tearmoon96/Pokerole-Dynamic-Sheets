import { useSheetStore } from '../../state/SheetContext';
import { isLightTheme } from '../../lib/theme';
import { mixHex } from '../../lib/color';
import { COMBAT_STATS, SOCIAL_STATS, STAT_LABELS, pillColor } from '../../lib/pills';
import { poolMax } from '../../state/defaults';
import type { TrainerState, TrainerStats } from '../../state/types';

type StatKey = keyof TrainerStats;

/* Vitality and Insight feed the two pool maxes, so anything that moves them has
   to say what happens to the current value: a pool that was full stays full,
   anything below keeps the number it had. */
function withPoolsFollowingStats(s: TrainerState, mutate: () => void): void {
    const wasFull = { hp: s.hp >= poolMax('hp', s), will: s.will >= poolMax('will', s) };
    mutate();
    (['hp', 'will'] as const).forEach((key) => {
        const max = poolMax(key, s);
        s[key] = wasFull[key] ? max : Math.min(s[key], max);
    });
}

function Dot({ filled, color, light, onClick }: {
    filled: boolean; color: string; light: boolean; onClick: () => void;
}) {
    const style = filled
        ? { background: color, borderColor: color, boxShadow: `0 0 8px ${color}66` }
        : { background: color + (light ? '24' : '14'), borderColor: color + (light ? '80' : '59') };
    return <div className="dot" style={{ cursor: 'pointer', ...style }} onClick={onClick} />;
}

function StatPill({ statKey }: { statKey: StatKey }) {
    const { sheet, store } = useSheetStore();
    const light = isLightTheme(sheet.themeType);
    const c = pillColor(statKey, sheet.themeType);
    const value = sheet.stats[statKey] || 1;

    return (
        <div
            className="stat-pill"
            data-pill={statKey}
            style={{
                background: c + (light ? '40' : '1f'),
                borderColor: c + (light ? 'c0' : '8c'),
                boxShadow: light ? 'none' : `0 0 10px ${c}26, inset 0 0 14px ${c}0d`,
            }}
        >
            {/* Labels blend toward black on light backgrounds, white on dark */}
            <span
                className="stat-pill-label"
                style={{ color: light ? mixHex(c, '#000000', 0.5) : mixHex(c, '#ffffff', 0.6) }}
            >
                {STAT_LABELS[statKey]}
            </span>
            <div className="stat-dots pill-dots" data-stat={statKey}>
                {[1, 2, 3, 4, 5].map((i) => (
                    <Dot
                        key={i}
                        filled={i <= value}
                        color={c}
                        light={light}
                        onClick={() => store.update((s) => {
                            withPoolsFollowingStats(s, () => {
                                /* Clicking the current value steps down; attributes never drop below 1 */
                                s.stats = { ...s.stats, [statKey]: (value === i) ? Math.max(1, i - 1) : i };
                            });
                        })}
                    />
                ))}
            </div>
        </div>
    );
}

export function CombatPills() {
    return (
        <div className="pill-col combat">
            {COMBAT_STATS.map((k) => <StatPill key={k} statKey={k} />)}
        </div>
    );
}

export function SocialPills() {
    return (
        <div className="pill-col social">
            {SOCIAL_STATS.map((k) => <StatPill key={k} statKey={k} />)}
        </div>
    );
}
