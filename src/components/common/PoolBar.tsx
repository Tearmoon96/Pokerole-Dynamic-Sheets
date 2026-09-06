import { useEffect, useRef, useState } from 'react';

/* The HP / Will bar, shared by the trainer sheet and the Pokémon card: they
   drew the same widget from the same code, so it is one component here.

   Three ways to change it, all of which the original supported and none of
   which may regress: the +/- buttons (hold to repeat), a drag anywhere along
   the bar to scrub, and a plain click on the number to edit the pool's size. */

const POOL_REPEAT_START_MS = 400;
const POOL_REPEAT_RATE_MS = 90;

export function PoolBar({ current, max, colorClass, onSetCurrent, onSetMax, readCurrent }: {
    current: number;
    max: number;
    /** "health" or "willpower" — picks the fill colour. */
    colorClass: string;
    onSetCurrent: (value: number) => void;
    onSetMax: (value: number) => void;
    /** The live value, for the hold-to-repeat timer which must not close over
        a stale render. */
    readCurrent: () => number;
}) {
    const barRef = useRef<HTMLDivElement>(null);
    const repeatDelay = useRef<number | null>(null);
    const repeatTimer = useRef<number | null>(null);
    /* While a drag is in flight the bar paints from here instead of from the
       store, so scrubbing stays at pointer rate and only commits on release. */
    const [dragValue, setDragValue] = useState<number | null>(null);
    const [editingMax, setEditingMax] = useState(false);

    const shown = dragValue ?? current;

    const stopStep = () => {
        if (repeatDelay.current != null) { clearTimeout(repeatDelay.current); repeatDelay.current = null; }
        if (repeatTimer.current != null) { clearInterval(repeatTimer.current); repeatTimer.current = null; }
    };

    useEffect(() => {
        window.addEventListener('pointerup', stopStep);
        window.addEventListener('pointercancel', stopStep);
        return () => {
            stopStep();
            window.removeEventListener('pointerup', stopStep);
            window.removeEventListener('pointercancel', stopStep);
        };
    }, []);

    const startStep = (delta: number) => {
        stopStep();
        const step = () => onSetCurrent(readCurrent() + delta);
        step();
        repeatDelay.current = window.setTimeout(() => {
            repeatTimer.current = window.setInterval(step, POOL_REPEAT_RATE_MS);
        }, POOL_REPEAT_START_MS);
    };

    const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const bar = barRef.current;
        if (!bar || e.button > 0 || (e.target as HTMLElement).tagName === 'INPUT') return;
        const rect = bar.getBoundingClientRect();
        const startX = e.clientX;
        const onValue = (e.target as HTMLElement).classList.contains('pool-bar-value');
        let dragging = false;
        let latest = current;

        const valueFromX = (x: number) =>
            Math.max(0, Math.min(max, Math.round((x - rect.left) / rect.width * max)));

        const move = (ev: PointerEvent) => {
            if (!dragging && Math.abs(ev.clientX - startX) < 4) return;
            dragging = true;
            latest = valueFromX(ev.clientX);
            setDragValue(latest);
        };
        const finish = (ev: PointerEvent, cancelled: boolean) => {
            bar.removeEventListener('pointermove', move);
            bar.removeEventListener('pointerup', up);
            bar.removeEventListener('pointercancel', cancel);
            setDragValue(null);
            if (dragging || cancelled) onSetCurrent(latest);
            else if (onValue) setEditingMax(true);
            else onSetCurrent(valueFromX(ev.clientX));
        };
        const up = (ev: PointerEvent) => finish(ev, false);
        const cancel = (ev: PointerEvent) => finish(ev, true);

        bar.setPointerCapture(e.pointerId);
        bar.addEventListener('pointermove', move);
        bar.addEventListener('pointerup', up);
        bar.addEventListener('pointercancel', cancel);
    };

    return (
        <>
            <button
                className="pool-btn"
                title="Spend 1 (hold to repeat)"
                onPointerDown={(e) => { e.preventDefault(); startStep(-1); }}
            >
                <i className="fa-solid fa-minus"></i>
            </button>

            <div className="pool-bar" ref={barRef} onPointerDown={onBarPointerDown}>
                <div
                    className={'pool-bar-fill ' + colorClass}
                    style={{
                        width: (shown / max) * 100 + '%',
                        ...(dragValue != null ? { transition: 'none' } : null),
                    }}
                />
                {editingMax ? (
                    <PoolMaxInput
                        initial={max}
                        onCommit={(v) => { setEditingMax(false); if (v != null) onSetMax(v); }}
                    />
                ) : (
                    <span className="pool-bar-value" title="Click to set the pool size">
                        {shown}/{max}
                    </span>
                )}
            </div>

            <button
                className="pool-btn"
                title="Restore 1 (hold to repeat)"
                onPointerDown={(e) => { e.preventDefault(); startStep(1); }}
            >
                <i className="fa-solid fa-plus"></i>
            </button>
        </>
    );
}

function PoolMaxInput({ initial, onCommit }: { initial: number; onCommit: (v: number | null) => void }) {
    const ref = useRef<HTMLInputElement>(null);
    const cancelled = useRef(false);

    useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

    return (
        <input
            ref={ref}
            type="text"
            inputMode="numeric"
            className="pool-max-input"
            defaultValue={initial}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
            }}
            onBlur={(e) => {
                const parsed = parseInt(e.currentTarget.value, 10);
                onCommit(!cancelled.current && !isNaN(parsed) ? parsed : null);
            }}
        />
    );
}
