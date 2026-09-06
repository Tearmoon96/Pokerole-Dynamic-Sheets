import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* The one transient message the sheet shows — saves, storage warnings, the
   "that's trainer gear" nudge. Callers pass a small HTML fragment because the
   messages carry a FontAwesome glyph; nothing user-typed reaches it unescaped. */

const TOAST_MS = 2400;

/* The GM screen's toast is its own element with its own timing — `#toast`, held
   for 3.2s — while the two character sheets share `.save-toast` at 2.4s. Same
   behaviour either way, so the page picks the skin rather than owning a copy. */
export interface ToastSkin {
    id: string;
    className: string;
    ms: number;
}

export const SHEET_TOAST: ToastSkin = { id: 'save-toast', className: 'save-toast', ms: TOAST_MS };
export const GM_TOAST: ToastSkin = { id: 'toast', className: '', ms: 3200 };

type ToastFn = (html: string) => void;

const Ctx = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
    return useContext(Ctx);
}

export function ToastProvider(
    { children, skin = SHEET_TOAST }: { children: ReactNode; skin?: ToastSkin },
) {
    const [html, setHtml] = useState('');
    const [shown, setShown] = useState(false);
    const timer = useRef<number | null>(null);

    const flash = useCallback((next: string) => {
        setHtml(next);
        setShown(true);
        if (timer.current != null) clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setShown(false), skin.ms);
    }, [skin.ms]);

    useEffect(() => () => { if (timer.current != null) clearTimeout(timer.current); }, []);

    return (
        <Ctx.Provider value={flash}>
            {children}
            <div
                id={skin.id}
                className={(skin.className + (shown ? ' show' : '')).trim()}
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </Ctx.Provider>
    );
}
