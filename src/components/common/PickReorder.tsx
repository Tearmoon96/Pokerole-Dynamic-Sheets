import { useState } from 'react';
import type { DragEvent } from 'react';

/* Rearranging a picker list — the trainers behind the License's name pill and
   the wild Pokémon behind the card's. Two ways in, because each covers what the
   other cannot: a row can be dragged with a mouse, and the arrows work with a
   finger (HTML drag and drop never fires on touch) and one step at a time. */

/** The up / down arrows at the end of a row. Clicks stop here so they never
    reach the row, whose own click switches to that entry. */
export function PickReorder({ index, count, label, onMove }: {
    index: number;
    count: number;
    /** Named in the hints, so "Move up" says what is moving. */
    label: string;
    onMove: (from: number, to: number) => void;
}) {
    return (
        <span className="pick-reorder" onClick={(e) => e.stopPropagation()}>
            <button
                disabled={index === 0}
                title={'Move ' + label + ' up'}
                onClick={() => onMove(index, index - 1)}
            >
                <i className="fa-solid fa-chevron-up"></i>
            </button>
            <button
                disabled={index === count - 1}
                title={'Move ' + label + ' down'}
                onClick={() => onMove(index, index + 1)}
            >
                <i className="fa-solid fa-chevron-down"></i>
            </button>
        </span>
    );
}

/** Drag-to-reorder for a list of rows. Spread `rowProps(i)` on each row and
    append `rowClass(i)` to its class: a row dropped on another takes its place,
    and the line drawn on the target shows which side it will land. */
export function useDragReorder(onMove: (from: number, to: number) => void) {
    const [drag, setDrag] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const reset = () => { setDrag(null); setOver(null); };

    const rowProps = (i: number) => ({
        draggable: true,
        onDragStart: (e: DragEvent) => {
            setDrag(i);
            e.dataTransfer.effectAllowed = 'move';
            /* Firefox starts no drag without data */
            e.dataTransfer.setData('text/plain', String(i));
        },
        onDragOver: (e: DragEvent) => {
            if (drag == null) return;          // a file or text from elsewhere
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (over !== i) setOver(i);
        },
        onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (drag != null && drag !== i) onMove(drag, i);
            reset();
        },
        onDragEnd: reset,
    });

    /* Moving down, the row lands after the one it is dropped on; moving up,
       before it — which is what moveItem's take-out-and-put-back does. */
    const rowClass = (i: number) => {
        if (drag == null) return '';
        if (i === drag) return ' dragging';
        if (i !== over) return '';
        return drag < i ? ' drop-after' : ' drop-before';
    };

    return { rowProps, rowClass };
}
