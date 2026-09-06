import { useEffect, useState } from 'react';
import { useCard } from '../../card/CardContext';
import {
    downloadWild, forgetWildFileHandle, readWildFileHandle, rememberWildFileHandle,
    wildFileName, wildPayload,
} from '../../card/wild';
import { cardStorageKey } from '../../card/cardContext';
import type { CardMove } from '../../card/moves';

/* Save / Export / Import / Reset, shown only on a wild card.

   Export downloads a new copy every time, which is what you want for handing one
   to a trainer sheet but not for working on the same creature across a session.
   Save keeps a handle to one file and overwrites it: it asks where exactly once,
   then never again. */

export function WildActions({ onImportFolder, evolveControls }: {
    speciesMoves: CardMove[];
    onImportFolder: () => void;
    /* On a wild sheet the Evolve control moves below these buttons, so the order
       reads: Load another Pokémon, Save, Export, Import, then Evolve. */
    evolveControls: React.ReactNode;
}) {
    const { pokemon, sheet, store } = useCard();
    const ctx = store.ctx;
    const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
    const [status, setStatus] = useState<{ text: string; warn: boolean }>({ text: '', warn: false });

    /* Primed on load so the common Save has no await before the write:
       showSaveFilePicker needs the click's transient activation, and awaiting
       IndexedDB first can spend it. */
    useEffect(() => {
        let live = true;
        readWildFileHandle(ctx.wildId).then((h) => {
            if (live && h) {
                setHandle(h);
                setStatus({ text: 'Saves to ' + h.name, warn: false });
            }
        });
        return () => { live = false; };
    }, [ctx.wildId]);

    const save = async () => {
        const json = JSON.stringify(wildPayload(pokemon, sheet), null, 2);

        /* No File System Access API (Firefox, Safari): a download is the only
           route out, so fall back rather than offering a dead button. */
        if (!window.showSaveFilePicker) {
            downloadWild(pokemon, sheet);
            setStatus({ text: 'This browser can only download — use Chrome to overwrite one file.', warn: false });
            return;
        }

        let h = handle;
        if (h && h.queryPermission) {
            let perm = await h.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted' && h.requestPermission) {
                perm = await h.requestPermission({ mode: 'readwrite' });
            }
            if (perm !== 'granted') h = null;
        }

        if (!h) {
            try {
                h = await window.showSaveFilePicker({
                    suggestedName: wildFileName(pokemon, sheet),
                    types: [{ description: 'Wild Pokémon', accept: { 'application/json': ['.json'] } }],
                });
            } catch (e) {
                if (e && (e as DOMException).name === 'AbortError') return;   // cancelled: say nothing
                /* Asking for permission above consumes the click's activation,
                   so the picker can refuse on the same click. */
                setStatus({ text: 'Press Save again to choose a file.', warn: true });
                return;
            }
            setHandle(h);
            await rememberWildFileHandle(ctx.wildId, h);
        }

        try {
            const w = await h.createWritable();
            await w.write(json);
            await w.close();
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setStatus({ text: 'Saved to ' + h.name + ' at ' + time, warn: false });
        } catch (e) {
            /* Moved, deleted, or on a drive that went away: forget it so the next
               Save asks for a new file instead of failing again. */
            console.warn('Wild save failed', e);
            setHandle(null);
            await forgetWildFileHandle(ctx.wildId);
            setStatus({ text: 'Could not write that file — press Save to pick another.', warn: true });
        }
    };

    /* Blank the sheet back to a fresh Pokémon of the same species. It clears the
       stored sheet and reloads rather than resetting the forty-odd fields by
       hand: the load path already builds exactly the defaults a brand-new card
       gets, and cannot miss one the way a hand-written reset would.

       The file link goes with it. The point of Reset is to build a different
       creature, and keeping the link would have the next Save silently overwrite
       the file of the one just discarded. */
    const reset = async () => {
        const confirmText = 'Reset this sheet?\n\nStats, skills, moves, notes, HP and Will all go back to a fresh '
            + pokemon.Name + '. This cannot be undone.'
            + (handle ? '\n\nThe link to ' + handle.name
                + ' is cleared too, so the next Save asks where to put the new one.' : '');
        if (!confirm(confirmText)) return;
        try { localStorage.removeItem(cardStorageKey(ctx, pokemon._id)); } catch { /* private mode */ }
        await forgetWildFileHandle(ctx.wildId);
        location.reload();
    };

    return (
        <>
            <button
                className="pokemon-picker-btn"
                onClick={() => { void save(); }}
                title={'Write this wild Pokémon back to its own .json file. The first save asks where;\n'
                    + 'after that it overwrites the same file with no download and no prompt.'}
            >
                <i className="fa-solid fa-floppy-disk"></i> Save
            </button>
            <button
                className="pokemon-picker-btn"
                onClick={() => downloadWild(pokemon, sheet)}
                title="Download a fresh copy as a .json, to capture on a trainer's sheet"
            >
                <i className="fa-solid fa-download"></i> Export
            </button>
            <button
                className="pokemon-picker-btn"
                onClick={onImportFolder}
                title={'Pick a folder and open every wild Pokémon .json in it, each as its own sheet.\n'
                    + 'Trainers and the Pokémon on their teams are left alone. A single file can be picked from the sheets list.'}
            >
                <i className="fa-solid fa-folder-open"></i> Import
            </button>
            <button
                className="pokemon-picker-btn"
                id="wild-reset-btn"
                onClick={() => { void reset(); }}
                title="Blank this sheet back to a fresh Pokémon of the same species, to build another one"
            >
                <i className="fa-solid fa-rotate-left"></i> Reset
            </button>
            <div className={'wild-file-status' + (status.warn ? ' warn' : '')} id="wild-file-status">
                {status.text}
            </div>
            {evolveControls}
        </>
    );
}
