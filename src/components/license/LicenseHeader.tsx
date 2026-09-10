import { useSheetStore } from '../../state/SheetContext';
import { useSession } from '../../state/SessionContext';
import { HomeButton } from '../common/HomeButton';

/** The licence title bar and the tool buttons along its top-right. */
export function LicenseHeader({ onOpenTheme, onOpenInfo, hasUpdate, updateVersion }: {
    onOpenTheme: () => void;
    onOpenInfo: () => void;
    hasUpdate: boolean;
    updateVersion?: string;
}) {
    const { store } = useSheetStore();
    const session = useSession();
    const dirty = store.anyDirty();

    return (
        <div className="license-header">
            <div className="license-title-group">
                <div className="license-icon"><i className="fa-solid fa-id-card"></i></div>
                <h1 className="license-title">Pokémon League<br />Trainer's License</h1>
            </div>
            <div className="license-tools">
                <HomeButton className="type-eff-btn" />
                <button
                    className={'type-eff-btn' + (hasUpdate ? ' has-update' : '')}
                    id="info-btn"
                    onClick={onOpenInfo}
                    title={hasUpdate
                        ? 'Version ' + updateVersion + ' is available \u2014 click for details'
                        : 'How saving & loading works, and how the folder should be organized'}
                >
                    <i className="fa-solid fa-circle-info"></i>
                </button>
                <button className="type-eff-btn" onClick={onOpenTheme} title="Change the page theme color">
                    <i className="fa-solid fa-palette"></i>
                </button>
                <button
                    className="type-eff-btn"
                    onClick={session.openWorkingFolder}
                    title="Open a working folder and load all trainers in it"
                >
                    <i className="fa-solid fa-folder-open"></i>
                </button>
                <button
                    className={'type-eff-btn' + (dirty ? ' has-unsaved' : '')}
                    id="save-all-btn"
                    onClick={() => { void session.saveAll(); }}
                    title={(dirty ? 'Unsaved changes \u2014 save' : 'All changes saved \u2014 save')
                        + ' all loaded trainers to their JSON files'}
                >
                    <i className="fa-solid fa-floppy-disk"></i>
                </button>
                <button
                    className="type-eff-btn"
                    onClick={session.backupAll}
                    title="Download a backup copy of every loaded trainer's JSON — works in any browser, even alongside Save All on Chrome"
                >
                    <i className="fa-solid fa-download"></i>
                </button>
                <button className="type-eff-btn" onClick={session.newTrainer} title="Open a fresh new trainer card">
                    <i className="fa-solid fa-file-circle-plus"></i>
                </button>
            </div>
        </div>
    );
}
