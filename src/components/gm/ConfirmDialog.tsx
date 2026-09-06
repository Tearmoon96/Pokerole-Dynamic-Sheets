import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* The board's one confirmation dialog, handed out as a promise so a caller can
   `await` it in the middle of an action. */

export interface ConfirmOpts {
    icon?: string;
    title?: string;
    text?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(async () => false);

export function useGmConfirm(): ConfirmFn {
    return useContext(Ctx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [opts, setOpts] = useState<ConfirmOpts | null>(null);
    const resolver = useRef<((v: boolean) => void) | null>(null);
    const okRef = useRef<HTMLButtonElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    const answer = useCallback((value: boolean) => {
        setOpts(null);
        const res = resolver.current;
        resolver.current = null;
        if (res) res(value);
    }, []);

    const confirm = useCallback<ConfirmFn>((next) => {
        /* A second call while one is open answers the first as a cancel, rather
           than stranding its promise forever. */
        if (resolver.current) resolver.current(false);
        setOpts(next || {});
        return new Promise<boolean>((res) => { resolver.current = res; });
    }, []);

    useEffect(() => {
        if (!opts) return;
        /* Focus the safe button: Enter on a dialog you did not read should not
           be the one that throws the combat away. */
        const id = window.setTimeout(() => {
            (opts.danger ? cancelRef.current : okRef.current)?.focus();
        }, 0);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); answer(false); }
            else if (e.key === 'Enter') { e.preventDefault(); answer(true); }
        };
        document.addEventListener('keydown', onKey);
        return () => { clearTimeout(id); document.removeEventListener('keydown', onKey); };
    }, [opts, answer]);

    return (
        <Ctx.Provider value={confirm}>
            {children}
            <div
                className={'gm-overlay' + (opts ? ' open' : '')}
                id="gm-overlay"
                onClick={(e) => { if (e.target === e.currentTarget) answer(false); }}
            >
                <div className={'gm-dialog' + (opts?.danger ? ' danger' : '')} id="gm-dialog">
                    <div className="gm-dialog-title">
                        <i id="gm-dialog-icon" className={'fa-solid ' + (opts?.icon || 'fa-circle-question')}></i>
                        <span id="gm-dialog-title">{opts?.title || 'Are you sure?'}</span>
                    </div>
                    <div className="gm-dialog-text" id="gm-dialog-text">{opts?.text || ''}</div>
                    <div className="gm-dialog-actions">
                        <button ref={cancelRef} onClick={() => answer(false)} id="gm-dialog-cancel">
                            {opts?.cancelLabel || 'Cancel'}
                        </button>
                        <button ref={okRef} className="go" onClick={() => answer(true)} id="gm-dialog-ok">
                            {opts?.confirmLabel || 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </Ctx.Provider>
    );
}
