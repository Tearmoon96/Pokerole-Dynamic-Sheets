import { useCallback, useEffect, useRef, useState } from 'react';
import { useGm } from '../../gm/GmContext';
import { useAppData } from '../../data/AppDataContext';
import { useToast } from '../common/Toast';
import { CRIT_MARGIN } from '../../gm/constants';
import { HISTORY_LIMIT, roll as rollDice } from '../../gm/dice';
import { ailmentByKey } from '../../gm/ailments';
import { ailmentRoll } from '../../gm/combat';
import { ailmentText } from '../../gm/ailmentText';
import {
    clearAilment, cureProgress, entityRef, participantForToken,
} from '../../gm/entities';
import { inkOn } from '../../lib/color';
import type { PokedexEntry } from '../../data/types';

/* The ailment popover.

   Hovering a round flag opens it; it carries a Roll button, so unlike the move
   panel it takes the pointer and has to survive the gap between the flag and
   itself. Hovering is a document-level concern here exactly as it was in the
   original — the flags are drawn deep inside the combat rows and already carry
   the token, the ailment key and the damage on data- attributes. */

/** Which flag is open, and where it sat when it opened. */
interface AilPop {
    token: string;
    ail: string;
    dmg: number;
    rect: DOMRect;
}

const HIDE_DELAY = 220;

export function AilmentPopover() {
    const { state, store } = useGm();
    const { data } = useAppData();
    const toast = useToast();
    const [pop, setPop] = useState<AilPop | null>(null);
    /* The roll's outcome line, replacing the "needs N" hint in place. Keyed by
       flag so it clears when a different one is opened. */
    const [out, setOut] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<number | null>(null);

    const dexById = useCallback((id: string): PokedexEntry | null =>
        data.pokemon.find((p) => p._id === id) || null, [data.pokemon]);

    const cancelHide = useCallback(() => {
        if (hideTimer.current != null) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    }, []);

    /* The pointer has to cross a gap to reach the panel, so closing waits a beat
       and is cancelled by arriving at either end. */
    const scheduleHide = useCallback(() => {
        cancelHide();
        hideTimer.current = window.setTimeout(() => setPop(null), HIDE_DELAY);
    }, [cancelHide]);

    useEffect(() => {
        const over = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t || !t.closest) return;
            const flag = t.closest('.round-flag') as HTMLElement | null;
            if (flag) {
                cancelHide();
                const token = flag.dataset.token || '';
                const ail = flag.dataset.ail || '';
                setPop((cur) => (cur && cur.token === token && cur.ail === ail) ? cur : {
                    token, ail, dmg: +(flag.dataset.dmg || 0) || 0,
                    rect: flag.getBoundingClientRect(),
                });
                return;
            }
            if (t.closest('#ail-pop')) cancelHide();
        };
        const outOf = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t || !t.closest) return;
            if (t.closest('.round-flag') || t.closest('#ail-pop')) scheduleHide();
        };
        /* Scrolling moves the anchor row out from under a fixed panel; the
           hover-held one just drops. */
        const onScroll = () => setPop(null);
        document.addEventListener('mouseover', over);
        document.addEventListener('mouseout', outOf);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('mouseover', over);
            document.removeEventListener('mouseout', outOf);
            window.removeEventListener('scroll', onScroll, true);
            cancelHide();
        };
    }, [cancelHide, scheduleHide]);

    /* A new flag starts with the hint, not with the last flag's result. */
    useEffect(() => { setOut(null); }, [pop && pop.token, pop && pop.ail]);

    /* Above the flag when there is room, otherwise below; clamped so it never
       runs off the side. Measured after the panel has its content, which is why
       this is a layout effect on the rendered node rather than arithmetic on a
       guessed height. */
    useEffect(() => {
        const el = ref.current;
        if (!el || !pop) return;
        const r = pop.rect;
        const left = Math.min(Math.max(8, r.left - 10), window.innerWidth - el.offsetWidth - 8);
        let top = r.top - el.offsetHeight - 8;
        if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - el.offsetHeight - 8);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    });

    if (!pop) return <div className="ail-pop" id="ail-pop" ref={ref} />;

    const subject = entityRef(state, dexById, pop.token);
    const ail = ailmentByKey(pop.ail);
    const text = subject && ailmentText(subject, pop.ail, pop.dmg);
    if (!subject || !ail || !text) return <div className="ail-pop" id="ail-pop" ref={ref} />;

    const spec = ailmentRoll(subject, pop.ail);
    const banked = cureProgress(state, dexById, pop.token, pop.ail);

    /* Rolls the cure through the dice panel, so it lands in the roll history
       with everything else, and reports the outcome in place. */
    const rollAilment = () => {
        /* No dice in the pool means no roll — clamping it up to 1 would hand the
           subject a die it does not have. */
        if (!spec || spec.dice <= 0) return;
        let entrySucc = 0;
        store.update((s) => {
            const entry = rollDice(spec.dice, 6, {}, CRIT_MARGIN);
            entrySucc = entry.succ || 0;
            s.dice = { count: spec.dice, sides: 6, history: [entry, ...s.dice.history].slice(0, HISTORY_LIMIT) };
        });
        const lead = `${escapeHtml(spec.label)} ${spec.dice}d6 &rarr; `;

        if (!spec.accumulates) {
            /* Asked and answered for this Round; nothing is kept. */
            const won = entrySucc >= spec.target;
            setOut(lead + `<span class="${won ? 'win' : 'lose'}">${entrySucc}</span> / ${spec.target}`
                + (won ? ' <span class="win">passed</span>' : ' <span class="lose">failed</span>'));
            return;
        }

        /* Cumulative: bank the successes and see whether that finishes it. */
        const p = participantForToken(state, dexById, pop.token);
        if (!p) return;
        const rec = p as unknown as Record<string, Record<string, number>>;
        if (!rec.cure) rec.cure = {};
        const total = (rec.cure[pop.ail] || 0) + entrySucc;
        const done = total >= spec.target;
        if (done) {
            delete rec.cure[pop.ail];
            clearAilment(state, pop.token, pop.ail, () => store.save());
            toast('<i class="fa-solid fa-hand-sparkles"></i> ' + escapeHtml(subject.name)
                + ' is free of ' + escapeHtml(ail.name)
                + ' &mdash; ' + total + ' successes in total.');
        } else {
            rec.cure[pop.ail] = total;
        }
        store.save();
        setOut(lead + `+${entrySucc} &rarr; <span class="${done ? 'win' : 'lose'}">${total}</span>`
            + ` / ${spec.target}` + (done ? ' <span class="win">fully treated</span>' : ' banked'));
        if (done) setPop(null);
        store.refresh();
    };

    const hint = !spec
        ? <span className="ail-roll-out">No roll can shake this one off.</span>
        : spec.dice <= 0
        /* An empty pool is no pool: offering a button here would roll a die the
           subject does not have. Say why instead. */
        ? (
            <span className="ail-roll-out">
                {spec.label} is <strong>0</strong> — {subject.kind === 'custom'
                    ? 'a typed-in combatant has no sheet to size this from.'
                    : 'nothing to roll, so this one cannot be shaken off.'}
            </span>
        )
        : null;

    return (
        <div className="ail-pop open" id="ail-pop" ref={ref}>
            <div className="ail-pop-head" style={{ color: ail.color }}>
                <i className={'fa-solid ' + ail.icon}></i> {ail.name}
                <span className="ail-pop-mod" style={{ background: ail.color, color: inkOn(ail.color) }}>
                    {ail.modifier}
                </span>
            </div>
            <div className="ail-text" style={{ opacity: 0.9 }}>
                {subject.name}
                {!!pop.dmg && <> · <strong>{pop.dmg}</strong> damage at the end of this Round</>}
            </div>
            <div className="ail-band">Effect</div>
            <div className="ail-text" dangerouslySetInnerHTML={{ __html: text.effect }} />
            <div className="ail-band">Treatment</div>
            <div className="ail-text" dangerouslySetInnerHTML={{ __html: text.treatment }} />
            <div className="ail-band">Duration</div>
            <div className="ail-text" dangerouslySetInnerHTML={{ __html: text.duration }} />
            {hint
                ? <div className="ail-roll">{hint}</div>
                : (
                    <>
                        <div className="ail-text" style={{ marginTop: '0.4rem', opacity: 0.8 }}>
                            {spec!.accumulates
                                ? <>Successes add up across turns until they reach <strong>{spec!.target}</strong>.</>
                                : <>A fresh roll each Round; successes do not carry over.</>}
                        </div>
                        <div className="ail-roll">
                            <button onClick={rollAilment}>Roll {spec!.dice}d6</button>
                            {out
                                ? <span className="ail-roll-out" id="ail-roll-out"
                                    dangerouslySetInnerHTML={{ __html: out }} />
                                : (
                                    <span className="ail-roll-out" id="ail-roll-out">
                                        {spec!.label} →{' '}
                                        {spec!.accumulates
                                            ? <><span className="banked">{banked}</span> / {spec!.target} banked</>
                                            : <>needs {spec!.target}</>}
                                        {spec!.alt ? ' (or ' + spec!.alt + ')' : ''}
                                    </span>
                                )}
                        </div>
                    </>
                )}
        </div>
    );
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
