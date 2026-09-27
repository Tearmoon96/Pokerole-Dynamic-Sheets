/* The sheets' stand-in for window.alert and window.confirm.

   The browser's own boxes draw grey system chrome in the middle of a themed
   page, and cannot be styled at all. These build the same markup every other
   dialog on the two sheets uses — .modal-overlay > .modal-box, .modal-title,
   .modal-text, .form-btn — so they pick up the page's palette variables, light
   themes included, with no stylesheet of their own.

   Plain DOM rather than a React component: half the callers are not
   components (the trainer file I/O, the wild-file import), and a promise is
   what they need anyway. The GM screen and the Map Maker have their own
   themed confirm (useGmConfirm) and do not use this. */

export interface DialogOpts {
    title?: string;
    icon?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** A destructive confirm: red OK button, and the focus starts on Cancel. */
    danger?: boolean;
}

/* Above every page dialog (the gear catalogue is 260) — an alert is usually
   raised from inside one — and under the tooltip layer. */
const Z = 300;

function open(text: string, opts: DialogOpts, withCancel: boolean): Promise<boolean> {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay app-dialog';
        overlay.style.display = 'flex';
        overlay.style.zIndex = String(Z);

        const box = document.createElement('div');
        box.className = 'modal-box';
        box.setAttribute('role', withCancel ? 'alertdialog' : 'dialog');
        box.setAttribute('aria-modal', 'true');

        const title = document.createElement('div');
        title.className = 'modal-title';
        const icon = document.createElement('i');
        const glyph = opts.icon || (opts.danger ? 'fa-triangle-exclamation'
            : withCancel ? 'fa-circle-question' : 'fa-circle-info');
        icon.className = 'fa-solid ' + glyph;
        icon.style.color = opts.danger ? '#f43f5e' : 'var(--ghost-color)';
        title.append(icon, ' ', opts.title || (withCancel ? 'Are you sure?' : 'Notice'));

        const body = document.createElement('p');
        body.className = 'modal-text';
        body.style.whiteSpace = 'pre-line';
        body.style.margin = '0';
        body.textContent = text;

        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'form-btn ' + (opts.danger ? 'danger' : 'save');
        ok.textContent = opts.confirmLabel || 'OK';
        let cancel: HTMLButtonElement | null = null;
        if (withCancel) {
            cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'form-btn cancel';
            cancel.textContent = opts.cancelLabel || 'Cancel';
            actions.append(cancel);
        }
        actions.append(ok);

        box.append(title, body, actions);
        overlay.append(box);
        document.body.append(overlay);

        const before = document.activeElement as HTMLElement | null;
        const done = (value: boolean) => {
            window.removeEventListener('keydown', onKey, true);
            overlay.remove();
            if (before && before.isConnected) before.focus();
            resolve(value);
        };
        /* On the window, capturing, so it runs ahead of the Modal's own Escape
           handler (on the document) and a press closes this and not the
           dialog underneath it. */
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
            else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(!withCancel || document.activeElement !== cancel); }
            else if (e.key === 'Tab') {
                /* Keep the focus inside: there are at most two buttons. */
                e.preventDefault();
                const next = document.activeElement === ok && cancel ? cancel : ok;
                next.focus();
            }
        };
        window.addEventListener('keydown', onKey, true);
        ok.addEventListener('click', () => done(true));
        cancel?.addEventListener('click', () => done(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
        /* Enter on a dialog nobody read must not be the one that deletes. */
        ((opts.danger && cancel) || ok).focus();
    });
}

/** A themed window.alert. Resolves when it is dismissed. */
export function showAlert(text: string, opts: DialogOpts = {}): Promise<void> {
    return open(text, opts, false).then(() => undefined);
}

/** A themed window.confirm. Resolves true for OK, false for Cancel / Escape / backdrop. */
export function showConfirm(text: string, opts: DialogOpts = {}): Promise<boolean> {
    return open(text, { confirmLabel: 'Confirm', ...opts }, true);
}
