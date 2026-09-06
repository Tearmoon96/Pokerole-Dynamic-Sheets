import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useGm } from '../../gm/GmContext';
import { PANEL_MAX_W, PANEL_MIN_W } from '../../gm/constants';

/* One board panel: a head with a grip, a title, its own buttons and the width
   lock, then the body, then the right-edge resize grabber.

   Dragging the right edge sets a width, which pins the panel by the same token —
   an explicit width and "does not follow the window" are the same state, so
   setting one is what turns the lock on. */

export function Panel({ panelKey, icon, title, actions, children, onReorder }: {
    panelKey: string;
    icon: string;
    title: string;
    actions?: ReactNode;
    children: ReactNode;
    onReorder: (from: string, to: string) => void;
}) {
    const { state, store } = useGm();
    const ref = useRef<HTMLElement>(null);
    const width = state.layout.widths[panelKey];
    const fixed = width > 0;

    const toggleLock = () => {
        const el = ref.current;
        store.update((s) => {
            const widths = { ...s.layout.widths };
            if (widths[panelKey] > 0) delete widths[panelKey];
            else if (el) widths[panelKey] = Math.round(el.getBoundingClientRect().width);
            s.layout = { ...s.layout, widths };
        });
    };

    const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = ref.current;
        const handle = e.currentTarget;
        if (!el) return;
        const startX = e.clientX;
        const startW = el.getBoundingClientRect().width;
        document.body.classList.add('resizing');
        handle.setPointerCapture(e.pointerId);

        let latest = startW;
        const move = (ev: PointerEvent) => {
            latest = Math.round(Math.max(PANEL_MIN_W,
                Math.min(PANEL_MAX_W, startW + (ev.clientX - startX))));
            /* Painted directly during the drag: React state on every pointermove
               would serialise the whole session dozens of times a second. */
            el.style.flex = '0 0 ' + latest + 'px';
            el.style.minWidth = '0';
            el.classList.add('fixed-w');
        };
        const done = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', done);
            handle.removeEventListener('pointercancel', done);
            document.body.classList.remove('resizing');
            /* Written once at the end rather than on every pointermove. */
            store.update((s) => {
                s.layout = { ...s.layout, widths: { ...s.layout.widths, [panelKey]: latest } };
            });
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', done);
        handle.addEventListener('pointercancel', done);
    };

    /* Reordering, the same way the Pokémon card rearranges moves: the panel is
       only made draggable while the grip is the thing under the press, so a drag
       can never start from a button or a field in the head. */
    const draggable = useRef(false);

    return (
        <section
            className={'panel' + (fixed ? ' fixed-w' : '')}
            id={'panel-' + panelKey}
            ref={ref}
            /* Inline, so it beats the .panel rule's `flex: 1 1 390px`. min-width
               has to go with it or the floor would win back any width set below
               390. */
            style={fixed ? { flex: '0 0 ' + width + 'px', minWidth: 0 } : undefined}
            draggable={draggable.current}
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', panelKey);
                e.currentTarget.classList.add('dragging');
            }}
            onDragEnd={(e) => {
                draggable.current = false;
                e.currentTarget.draggable = false;
                e.currentTarget.classList.remove('dragging');
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData('text/plain');
                if (from && from !== panelKey) onReorder(from, panelKey);
            }}
        >
            <div className="panel-head">
                <span
                    className="panel-grip"
                    title="Hold and drag to reorder the panels"
                    onPointerDown={(e) => {
                        draggable.current = true;
                        const panel = e.currentTarget.closest('.panel') as HTMLElement | null;
                        if (panel) panel.draggable = true;
                    }}
                >
                    <i className="fa-solid fa-grip-vertical"></i>
                </span>
                <i className={'fa-solid ' + icon + ' panel-icon'}></i>
                <h2>{title}</h2>
                {actions}
                <button
                    className="icon-btn panel-lock"
                    onClick={toggleLock}
                    title={fixed
                        ? 'Width pinned at ' + width + 'px — click to let it share the board again'
                        : 'Pin this width so the panel keeps it when the window is resized'}
                >
                    <i className={'fa-solid ' + (fixed ? 'fa-lock' : 'fa-lock-open')}></i>
                </button>
            </div>
            {children}
            <div
                className="panel-resize"
                title="Drag to set this panel's width"
                onPointerDown={startResize}
            />
        </section>
    );
}
