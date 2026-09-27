import { openWildFiles, stashWildSheet, wildUrl } from './wild';
import type { WildPayload } from './wild';
import { showAlert } from '../lib/dialog';

/* Opening wild sheets that came from files.

   Both routes stash the sheet under a fresh id, then navigate to it in wild
   mode so the normal load path picks it up. */

/** One wild-Pokémon JSON, as exported from a card. */
export async function importOneWildFile(file: File): Promise<void> {
    let data: WildPayload;
    try { data = JSON.parse(await file.text()); }
    catch { void showAlert('That file is not valid JSON.', { title: 'Cannot open that file', icon: 'fa-file-circle-xmark' }); return; }

    const wid = await stashWildSheet(data, file.name);
    if (!wid) {
        void showAlert('That is not a wild Pokémon file.\n\nSave or export one from a Pokémon card '
            + '(Manage a Wild Pokémon).', { title: 'Cannot open that file', icon: 'fa-file-circle-xmark' });
        return;
    }
    location.search = wildUrl(data.dexId, wid);
}

/** Every wild sheet among these files; lands on the first one opened. */
export async function openWildFilesAndGo(files: File[]): Promise<void> {
    const { first, report } = await openWildFiles(files);
    if (!first) {
        /* Nothing happened, and a picker that closes on nothing reads as broken
           — say what was in there instead. */
        void showAlert(report);
        return;
    }
    location.search = wildUrl(first.dexId, first.wid);
}
