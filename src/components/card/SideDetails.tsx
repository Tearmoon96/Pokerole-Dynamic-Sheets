import { useCard } from '../../card/CardContext';
import { useAppData } from '../../data/AppDataContext';
import { evoGender, evoMethodLabel } from '../../card/evolution';

/* Everything that used to sit under Skills & Specialties: the ability panels,
   the height/weight/evolution details, and the dex flavour text. */

interface AbilityRow { name: string; tag: string; custom?: boolean }

export function SideDetails({ onPickAbility }: { onPickAbility: () => void }) {
    const { pokemon: p, sheet, store } = useCard();
    const { data } = useAppData();

    const findAbility = (name: string) =>
        name ? (data.abilities.find((a) => a.Name.toLowerCase() === name.toLowerCase()) || null) : null;

    const abilities: AbilityRow[] = [];
    if (p.Ability1) abilities.push({ name: p.Ability1, tag: 'Ability' });
    if (p.Ability2) abilities.push({ name: p.Ability2, tag: 'Ability' });
    if (p.HiddenAbility) abilities.push({ name: p.HiddenAbility, tag: 'Hidden Ability' });
    /* A user-chosen ability from the full list, unless it already is one of this
       species' standard abilities */
    const stdNames = abilities.map((a) => a.name.toLowerCase());
    if (sheet.customAbility && !stdNames.includes(sheet.customAbility.toLowerCase())) {
        abilities.push({ name: sheet.customAbility, tag: 'Custom', custom: true });
    }
    const selectable = abilities.length > 1;

    const h = p.Height || {}, w = p.Weight || {};
    const evos = p.Evolutions || [];

    return (
        <div className="side-details">
            <span id="abilities-container" style={{ display: 'contents' }}>
                {abilities.map((a) => {
                    const info = findAbility(a.name);
                    const isInUse = selectable && sheet.abilityInUse === a.name;
                    const idle = selectable && !!sheet.abilityInUse && !isInUse;
                    return (
                        <div
                            key={a.name}
                            className={'ability-panel' + (selectable ? ' ability-selectable' : '')
                                + (isInUse ? ' ability-in-use' : '') + (idle ? ' ability-idle' : '')}
                            data-ability={a.name}
                            title={selectable ? 'Set as the ability in use' : undefined}
                            /* Ability in use drives the highlight here and which
                               ability grants type immunities in the chart. */
                            onClick={selectable
                                ? () => store.update((s) => {
                                    s.abilityInUse = s.abilityInUse === a.name ? '' : a.name;
                                })
                                : undefined}
                        >
                            <div className="ability-header">
                                <h2 className="ability-title">
                                    <i className="fa-solid fa-star-of-life"></i> {a.name}
                                    {isInUse && <> <i className="fa-solid fa-circle-check ability-in-use-mark"></i></>}
                                </h2>
                                <div className="ability-header-right">
                                    <span className={'ability-badge' + (a.custom ? ' custom' : '')}>{a.tag}</span>
                                    {a.custom && (
                                        <button
                                            className="ability-remove-btn"
                                            title="Remove this custom ability"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                store.update((s) => {
                                                    s.customAbility = '';
                                                    if (s.abilityInUse === a.name) s.abilityInUse = '';
                                                });
                                            }}
                                        >
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                            {info?.Description && <div className="ability-desc">"{info.Description}"</div>}
                            {info?.Effect && <p className="ability-effect"><strong>Effect:</strong> {info.Effect}</p>}
                        </div>
                    );
                })}
            </span>

            <button
                className="add-ability-btn"
                id="add-ability-btn"
                onClick={onPickAbility}
                title="Choose an ability from the full list"
            >
                <i className="fa-solid fa-plus"></i> {sheet.customAbility ? 'Change' : 'Add a'} custom ability
            </button>

            <div className="details-panel">
                <div className="detail-item">
                    <span className="detail-label">Height</span>
                    <span className="detail-val" id="detail-height">
                        {h.Meters ?? '?'} m ({h.Feet ?? '?'} ft)
                    </span>
                </div>
                <div className="detail-item">
                    <span className="detail-label">Weight</span>
                    <span className="detail-val" id="detail-weight">
                        {w.Kilograms ?? '?'} kg ({w.Pounds ?? '?'} lbs)
                    </span>
                </div>

                <div className="evolution-panel">
                    <span className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                        Evolutions
                    </span>
                    {/* Both ends of every chain are plain text — the panel just
                        states the chain, it never navigates anywhere */}
                    <div className="evolution-flow" id="evolution-flow">
                        {!evos.length ? (
                            <span className="evo-method evo-empty">Does not evolve</span>
                        ) : evos.map((evo, i) => {
                            const gender = evoGender(p, evo);
                            /* Exactly five children per row, gender badge or not —
                               the grid above lines the rows up on them */
                            return (
                                <div className="evolution-step" key={i}>
                                    <span className="evo-name">{evo.From || p.Name}</span>
                                    <i className="fa-solid fa-arrow-right evo-arrow"></i>
                                    <span className="evo-mid">
                                        <span className="evo-method">{evoMethodLabel(p, evo, true)}</span>
                                        {gender && (
                                            <span className={'evo-gender ' + gender.toLowerCase()} title={gender + ' only'}>
                                                <i className={'fa-solid ' + (gender === 'Female' ? 'fa-venus' : 'fa-mars')}></i>
                                            </span>
                                        )}
                                    </span>
                                    <i className="fa-solid fa-arrow-right evo-arrow"></i>
                                    <span className="evo-name">{evo.To || p.Name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="desc-panel" id="desc-panel">{p.DexDescription || ''}</div>
        </div>
    );
}
