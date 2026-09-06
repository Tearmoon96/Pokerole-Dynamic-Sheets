import { useRef } from 'react';
import { useSheetStore } from '../../state/SheetContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { WILD_MARKER, BOX_CAPACITY } from '../../state/constants';
import { genUid } from '../../state/defaults';
import { activeBoxIdx } from '../../state/boxes';
import type { MonEntry, TrainerState } from '../../state/types';

/** Import a wild Pokémon JSON, exported from a Pokémon card, into this trainer. */
export function CaptureWildButton() {
    const { store } = useSheetStore();
    const { data } = useAppData();
    const toast = useToast();
    const input = useRef<HTMLInputElement>(null);

    const capture = async (file: File) => {
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(await file.text()); }
        catch { alert('That file is not valid JSON.'); return; }

        if (!parsed || !parsed[WILD_MARKER] || !parsed.dexId) {
            alert('That is not a wild Pokémon file.\n\nExport one from a Pokémon card '
                + '(Manage a Wild Pokémon → Export Wild Pokémon).');
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
            const idx = s.team.findIndex((t) => !t.dexId);
            if (idx !== -1) {
                s.team = s.team.map((t, i) => i === idx ? mon : t);
                message = '<i class="fa-solid fa-hand-sparkles"></i> Captured ' + escapeHtml(caught) + '!';
                return;
            }
            /* Team full: the capture still succeeds, it just goes to storage —
               same as the games, and better than losing it */
            const start = activeBoxIdx(s);
            const target = s.boxes[start].mons.length < BOX_CAPACITY
                ? start : s.boxes.findIndex((b) => b.mons.length < BOX_CAPACITY);
            if (target === -1) {
                failure = "This trainer's team is full (6 Pokémon) and every PC box is full too.\n\n"
                    + 'Release something, or add a box, before capturing another.';
                return;
            }
            /* Where the full-res copy is already on disk the embedded thumbnail
               is redundant — see shedBoxThumbnail in state/boxes. */
            const stored = (mon.sheet && mon.sheet.customImage && mon.sheet.customImageFile)
                ? { ...mon, sheet: { ...mon.sheet, customImage: '' } } : mon;
            s.boxes = s.boxes.map((b, i) => i === target ? { ...b, mons: [...b.mons, stored] } : b);
            message = '<i class="fa-solid fa-box-archive"></i> Captured ' + escapeHtml(caught)
                + ' — team was full, sent to ' + escapeHtml(s.boxes[target].name) + '.';
        });

        if (failure) alert(failure);
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
