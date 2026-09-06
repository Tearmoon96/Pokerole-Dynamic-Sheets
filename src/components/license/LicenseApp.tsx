import { useEffect, useState } from 'react';
import { useSheetStore } from '../../state/SheetContext';
import { useTheme } from '../../hooks/useTheme';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNatureRowAlignment } from '../../hooks/useNatureRowAlignment';
import { PhotoArch } from './PhotoArch';
import { LicensePlate } from './LicensePlate';
import { CombatPills, SocialPills } from './StatPills';
import { SkillsTower } from './SkillsTower';
import { Achievements } from './Achievements';
import { NatureRank } from './NatureRank';
import { ExtraPanel } from './ExtraPanel';
import { PoolsRow, AgeMoneyRow } from './AgeMoneyExp';
import { TeamGrid } from './TeamGrid';
import { BagColumns } from './Bag';
import { PotionTallies } from './Potions';
import { BadgeStrip } from './Badges';
import { ThemePicker } from './ThemePicker';
import { BadgePicker } from './BadgePicker';
import { LicenseHeader } from './LicenseHeader';
import { SessionDialogs } from './SessionDialogs';
import { TrainerNav, TrainerPicker } from './TrainerSwitcher';
import { InfoModal } from './InfoModal';
import { TeamPicker } from './TeamPicker';
import { SpriteModal } from './SpriteModal';
import { PhotoModal } from './PhotoModal';
import { RemovePokemonModal } from './RemovePokemonModal';
import { BoxModal } from './BoxModal';
import { EquipmentModal } from './EquipmentModal';
import { CaptureWildButton } from './CaptureWild';
import { ManualPicker } from './ManualPicker';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';
import { useAppData } from '../../data/AppDataContext';
import { openCard } from '../../lib/navigation';

/* The four quadrants of the licence, plus the notepad under them.

   Which dialog is open is plain component state here rather than a set of
   display:none divs in the markup — a closed modal is simply not rendered. */

export function LicenseApp() {
    const { sheet, store } = useSheetStore();

    useTheme(sheet.themeType);
    useDocumentTitle(sheet.name);
    useNatureRowAlignment([sheet.id, sheet.name, sheet.player]);

    const { data } = useAppData();
    const update = useUpdateCheck(data.version, data.repo);
    const [themeOpen, setThemeOpen] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [photoOpen, setPhotoOpen] = useState(false);
    const [pickSlot, setPickSlot] = useState<number | null>(null);
    const [spriteSlot, setSpriteSlot] = useState<number | null>(null);
    const [removeSlot, setRemoveSlot] = useState<number | null>(null);
    const [boxOpen, setBoxOpen] = useState(false);
    const [equipOpen, setEquipOpen] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [badgeIndex, setBadgeIndex] = useState<number | null>(null);

    /* A Pokémon card edited in another tab writes the working set; pull those
       changes back in when this tab regains focus. */
    useEffect(() => {
        const onFocus = () => store.syncFromStorage();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [store]);

    /* Warn before leaving with changes not written to disk. */
    useEffect(() => {
        const onLeave = (e: BeforeUnloadEvent) => {
            if (store.anyDirty()) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', onLeave);
        return () => window.removeEventListener('beforeunload', onLeave);
    }, [store]);

    const healingItem = (sheet.stats.clever || 0) + (sheet.skills.medicine || 0);

    return (
        <>
            {/* Trainer switcher: edge arrows + a label, shown only when more
                than one trainer is loaded from a folder */}
            <TrainerNav />

            <main className="license-container">

                {/* QUADRANT 1: the license itself — photo, name, player */}
                <section className="panel license-panel">
                    <LicenseHeader
                        onOpenTheme={() => setThemeOpen(true)}
                        onOpenInfo={() => setInfoOpen(true)}
                        hasUpdate={update.newer}
                        updateVersion={update.latest}
                    />
                    <PhotoArch onAdjust={() => setPhotoOpen(true)} onOpenEquipment={() => setEquipOpen(true)} />
                    <LicensePlate />
                    <div className="license-footer">
                        <button className="pokemon-picker-btn" onClick={() => openCard('pokemon-card.html')}>
                            <i className="fa-solid fa-paw"></i> Open a Pokémon card
                        </button>
                        <button className="pokemon-picker-btn" onClick={() => setManualOpen(true)}>
                            <i className="fa-solid fa-book"></i> Open Pokerole Manual
                        </button>
                    </div>
                </section>

                {/* QUADRANT 2: attributes, skills, achievements, nature & rank */}
                <section className="panel">
                    <div className="q2-grid">
                        <CombatPills />
                        <SocialPills />
                        <SkillsTower />
                        <Achievements />
                        <NatureRank />
                        <ExtraPanel />
                    </div>
                </section>

                {/* QUADRANT 3: pools, age & money, the team */}
                <section className="panel">
                    <PoolsRow />
                    <AgeMoneyRow />
                    <div className="section-bar" style={{ marginTop: '16px' }}>Pokémon Team</div>
                    <div className="team-capture-row">
                        <CaptureWildButton />
                        <button
                            className="pokemon-picker-btn"
                            title="PC Storage — Pokémon this trainer owns but isn't carrying"
                            onClick={() => setBoxOpen(true)}
                        >
                            <i className="fa-solid fa-box-archive"></i> PC Storage
                        </button>
                    </div>
                    <TeamGrid
                        onPick={setPickSlot}
                        onRemove={setRemoveSlot}
                        onEditSprite={setSpriteSlot}
                    />
                </section>

                {/* QUADRANT 4: bag, potion satchel, badge case */}
                <section className="panel">
                    <div className="section-bar">Bag</div>
                    <BagColumns />

                    <div className="potions-row">
                        <div
                            className="heal-box"
                            title={'Healing Item = Clever + Medicine.\nItems and healing moves restore at most 3 HP per round.'}
                        >
                            <span className="heal-box-label">
                                <i className="fa-solid fa-kit-medical"></i> Healing Item
                            </span>
                            <span className="heal-box-val"><strong id="heal-item-value">{healingItem}</strong></span>
                        </div>
                        <PotionTallies />
                        <div className="other-box">
                            <div className="hwe-label">Other Stuff</div>
                            <textarea
                                className="other-textarea"
                                id="other-meds"
                                placeholder="Camping Kit x2, etc..."
                                value={sheet.otherMeds}
                                onChange={(e) => {
                                    const otherMeds = e.currentTarget.value;
                                    store.update((s) => { s.otherMeds = otherMeds; });
                                }}
                            />
                        </div>
                    </div>

                    <div className="section-bar small" style={{ marginTop: '16px' }}>Gym Badge Case</div>
                    <BadgeStrip onPick={setBadgeIndex} />
                </section>

                {/* Full-width notepad */}
                <section className="panel notepad-panel full-width">
                    <h2 className="stats-title"><i className="fa-solid fa-note-sticky"></i> Notes</h2>
                    <textarea
                        id="notes-area"
                        className="notepad-textarea"
                        placeholder="Campaign notes, goals, contacts, secrets..."
                        value={sheet.notes}
                        onChange={(e) => {
                            const notes = e.currentTarget.value;
                            store.update((s) => { s.notes = notes; });
                        }}
                    />
                </section>
            </main>

            <ThemePicker open={themeOpen} onClose={() => setThemeOpen(false)} />
            <BadgePicker index={badgeIndex} onClose={() => setBadgeIndex(null)} />
            <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} update={update} />
            <TrainerPicker />
            <TeamPicker slot={pickSlot} onClose={() => setPickSlot(null)} />
            <SpriteModal slot={spriteSlot} onClose={() => setSpriteSlot(null)} />
            <PhotoModal open={photoOpen} onClose={() => setPhotoOpen(false)} />
            <RemovePokemonModal slot={removeSlot} onClose={() => setRemoveSlot(null)} />
            <BoxModal open={boxOpen} onClose={() => setBoxOpen(false)} />
            <EquipmentModal open={equipOpen} onClose={() => setEquipOpen(false)} />
            <ManualPicker open={manualOpen} onClose={() => setManualOpen(false)} />
            <SessionDialogs />
        </>
    );
}
