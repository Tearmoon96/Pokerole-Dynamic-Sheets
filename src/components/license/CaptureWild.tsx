import { useRef } from 'react';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { WILD_MARKER } from '../../state/constants';
import { genUid } from '../../state/defaults';
import { addMonToTrainer } from '../../state/boxes';
import type { MonEntry, TrainerState } from '../../state/types';
import { showAlert } from '../../lib/dialog';

/** Import a wild Pokémon JSON, exported from a Pokémon card, into this trainer. */
export function CaptureWildButton() {
    const { store } = useSheetStore();
    const { data } = useAppData();
    const toast = useToast();
    const input = useRef<HTMLInputElement>(null);

    const capture = async (file: File) => {
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(await file.text()); }
        catch { void showAlert('That file is not valid JSON.', { title: 'Cannot open that file', icon: 'fa-file-circle-xmark' }); return; }

        if (!parsed || !parsed[WILD_MARKER] || !parsed.dexId) {
            void showAlert('That is not a wild Pokémon file.\n\nExport one from a Pokémon card '
                + '(Manage a Wild Pokémon → Export Wild Pokémon).', { title: 'Cannot open that file', icon: 'fa-file-circle-xmark' });
            return;
        }

        const dexId = parsed.dexId as string;
        const p = data.pokemon.find((x) => x._id === dexId);
        const caught = p ? p.Name : dexId;
        const mon: MonEntry = {
            uid: genUid(), dexId,
            sheet: (parsed.sheet as MonEntry['sheet']) || null, preview: null,
        };

        let message = '';
        let failure = '';
        store.update((s: TrainerState) => {
            /* Team full: the capture still succeeds, it just goes to storage —
               same as the games, and better than losing it */
            const put = addMonToTrainer(s, mon);
            if (!put) {
                failure = "This trainer's team is full (6 Pokémon) and every PC box is full too.\n\n"
                    + 'Release something, or add a box, before capturing another.';
                return;
            }
            message = put.where === 'team'
                ? '<i class="fa-solid fa-hand-sparkles"></i> Captured ' + escapeHtml(caught) + '!'
                : '<i class="fa-solid fa-box-archive"></i> Captured ' + escapeHtml(caught)
                    + ' — team was full, sent to ' + escapeHtml(put.box) + '.';
        });

        if (failure) void showAlert(failure);
        else if (message) toast(message);
    };

    return (
        <>
            <button
                className="pokemon-picker-btn"
                title="Import a wild Pokémon JSON into an empty team slot"
                onClick={() => input.current?.click()}
            >
                <i className="fa-solid fa-hand-sparkles"></i> Capture Wild Pokémon
            </button>
            <input
                ref={input}
                type="file"
                id="wild-import-input"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (file) void capture(file);
                }}
            />
        </>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
