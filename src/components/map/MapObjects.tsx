import type { PointerEvent as ReactPointerEvent } from 'react';
import { MapSprite } from './MapSprite';
import { landmarkOf } from '../../map/landmarks';
import { landmarkChain, markerChain, pokemonTokenChain } from '../../map/sprites';
import { midpoint, polygonD, sampleCurve, smoothPathD, taperOutline } from '../../map/geometry';
import type { Pt } from '../../map/geometry';
import { CELL } from '../../map/render/patterns';
import { typeColors, TYPE_ICONS } from '../../lib/themeTables';
import type { MapStyle } from '../../map/styles';
import type { MapDoc, MapLabel, MapPath, MapStamp, MapToken, Selection } from '../../map/types';

/* Everything placed ON the ground, in world px (the parent is scaled by the
   view). Each object carries data-obj="<kind>:<id>" — the eraser finds what is
   under the pointer by that, and the stage's own handler hit-tests with it.

   Objects only take the pointer under the Select and Erase tools; with any
   other tool the stylesheet turns their pointer-events off, so painting or
   drawing a path straight over a town just works. */

export type Grab = 'move' | 'resize' | 'rotate' | { vertex: number };

export type ObjectDown = (e: ReactPointerEvent, sel: Selection, grab: Grab) => void;

const isSel = (sel: Selection[], kind: Selection['kind'], id: string) => sel.some((x) => x.kind === kind && x.id === id);

/* ------------------------------------------------------------------ paths */

function PathShape({ path, style }: { path: MapPath; style: MapStyle }) {
    const look = style.paths[path.kind];
    const w = Math.max(0.05, path.width * look.widthScale) * CELL;
    const casing = Math.max(2, w * 0.3);
    const dash = look.dash?.map((d) => d * w).join(' ');

    if (look.taper) {
        const dense = sampleCurve(path.points as Pt[]);
        const body = polygonD(taperOutline(dense, path.width * 0.25, path.width), CELL);
        return (
            <>
                {look.casing && <path d={body} fill={look.casing} stroke={look.casing} strokeWidth={casing} strokeLinejoin="round" />}
                <path d={body} fill={look.color} />
            </>
        );
    }
    const d = smoothPathD(path.points as Pt[], CELL);
    return (
        <>
            {look.casing && (
                <path d={d} fill="none" stroke={look.casing} strokeWidth={w + casing * 2}
                    strokeLinecap={look.cap} strokeLinejoin="round" />
            )}
            <path d={d} fill="none" stroke={look.color} strokeWidth={w} strokeDasharray={dash}
                strokeLinecap={look.cap} strokeLinejoin="round" />
        </>
    );
}

export function PathsLayer({ doc, style, selection, draft, onDown }: {
    doc: MapDoc; style: MapStyle; selection: Selection[]; draft: Pt[] | null; onDown: ObjectDown;
}) {
    const W = doc.cols * CELL, H = doc.rows * CELL;
    const town = style.label.route;
    return (
        <svg className="map-svg map-paths" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {doc.paths.map((p) => {
                const d = smoothPathD(p.points as Pt[], CELL);
                const hitW = Math.max(p.width, 0.7) * CELL;
                const selected = isSel(selection, 'path', p.id);
                /* Points are editable only on a path selected on its own. */
                const alone = selected && selection.length === 1;
                const mid = midpoint(p.points as Pt[]);
                const fontSize = town.size * CELL * 0.8;
                return (
                    <g key={p.id}>
                        <PathShape path={p} style={style} />
                        {p.label && (
                            <>
                                <path id={'mp-' + p.id} d={d} fill="none" stroke="none" />
                                <text className="map-path-label" fontFamily={town.font} fontSize={fontSize}
                                    fontWeight={town.weight} fontStyle={town.italic ? 'italic' : undefined}
                                    fill={town.color} stroke={town.halo} strokeWidth={fontSize * 0.22}
                                    paintOrder="stroke" dy={-(p.width * CELL) / 2 - fontSize * 0.3}>
                                    <textPath href={'#mp-' + p.id} startOffset="50%" textAnchor="middle">{p.label}</textPath>
                                </text>
                            </>
                        )}
                        {p.kind === 'route' && p.routeNo && (
                            <g transform={`translate(${mid[0] * CELL} ${mid[1] * CELL})`}>
                                <rect x={-CELL * 0.55} y={-CELL * 0.38} width={CELL * 1.1} height={CELL * 0.76}
                                    rx={CELL * 0.16} fill={style.badge.fill} stroke={style.badge.border} strokeWidth={2} />
                                <text className="map-route-no" textAnchor="middle" dominantBaseline="central"
                                    fontFamily={town.font} fontWeight={700} fontSize={CELL * 0.46} fill={style.badge.text}>
                                    {p.routeNo}
                                </text>
                            </g>
                        )}
                        <path className="map-hit" data-obj={'path:' + p.id} d={d} fill="none" stroke="transparent"
                            strokeWidth={hitW} strokeLinecap="round"
                            onPointerDown={(e) => onDown(e, { kind: 'path', id: p.id }, 'move')} />
                        {selected && (
                            <>
                                <path className="map-path-sel" d={d} fill="none" strokeWidth={3} />
                                {alone && p.points.map(([x, y], i) => (
                                    <circle key={i} className="map-vertex" cx={x * CELL} cy={y * CELL} r={6}
                                        onPointerDown={(e) => onDown(e, { kind: 'path', id: p.id }, { vertex: i })} />
                                ))}
                            </>
                        )}
                    </g>
                );
            })}
            {draft && draft.length > 1 && (
                <path className="map-path-draft" d={smoothPathD(draft, CELL)} fill="none" strokeWidth={3} />
            )}
        </svg>
    );
}

/* ----------------------------------------------------------------- stamps */

function StampView({ stamp, style, selected, alone, onDown }: {
    stamp: MapStamp; style: MapStyle; selected: boolean;
    /** Selected on its own: only then does it get resize and turn handles. */
    alone: boolean;
    onDown: ObjectDown;
}) {
    const def = landmarkOf(stamp.landmark);
    const px = stamp.size * CELL;
    const sel = { kind: 'stamp' as const, id: stamp.id };
    const typeColor = stamp.type ? typeColors[stamp.type] : undefined;
    const lab = style.label.small;
    return (
        <div
            className={'map-obj map-stamp' + (selected ? ' selected' : '')}
            data-obj={'stamp:' + stamp.id}
            style={{
                left: stamp.x * CELL, top: stamp.y * CELL, width: px, height: px,
                transform: `translate(-50%, -50%) rotate(${stamp.rotation}deg)`,
            }}
            onPointerDown={(e) => onDown(e, sel, 'move')}
        >
            <MapSprite
                candidates={landmarkChain(style, stamp.landmark)}
                icon={def.icon}
                color={def.color}
                className={'map-stamp-art' + (style.pixelated ? ' pixelated' : '')}
                style={{ transform: stamp.flip ? 'scaleX(-1)' : undefined, fontSize: px * 0.45 }}
            />
            {typeColor && (
                <span className="map-type-badge" style={{ background: typeColor, fontSize: px * 0.16 }} title={stamp.type}>
                    <i className={'fa-solid ' + (TYPE_ICONS[stamp.type!] || 'fa-circle')}></i>
                </span>
            )}
            {stamp.label && (
                <span className="map-stamp-label" style={{
                    fontFamily: lab.font, fontWeight: lab.weight, color: lab.color,
                    fontSize: Math.max(10, lab.size * CELL * 1.1), WebkitTextStroke: '0',
                    textShadow: `0 0 3px ${lab.halo}, 0 0 3px ${lab.halo}, 0 0 2px ${lab.halo}`,
                    fontStyle: lab.italic ? 'italic' : undefined,
                }}>{stamp.label}</span>
            )}
            {selected && alone && (
                <>
                    <span className="map-handle map-handle-resize" onPointerDown={(e) => onDown(e, sel, 'resize')} title="Drag to resize"></span>
                    <span className="map-handle map-handle-rotate" onPointerDown={(e) => onDown(e, sel, 'rotate')} title="Drag to rotate"></span>
                </>
            )}
        </div>
    );
}

export function StampsLayer({ doc, style, selection, onDown }: {
    doc: MapDoc; style: MapStyle; selection: Selection[]; onDown: ObjectDown;
}) {
    return (
        <>
            {doc.stamps.map((s) => (
                <StampView
                    key={s.id} stamp={s} style={style} selected={isSel(selection, 'stamp', s.id)}
                    alone={selection.length === 1} onDown={onDown}
                />
            ))}
        </>
    );
}

/* ----------------------------------------------------------------- labels */

function LabelText({ label, style, selected, onDown }: {
    label: MapLabel; style: MapStyle; selected: boolean; onDown: ObjectDown;
}) {
    const look = style.label[label.role];
    const size = look.size * CELL * label.scale;
    const text = look.upper ? label.text.toUpperCase() : label.text;
    const lines = text.split('\n');
    return (
        <text
            className={'map-obj map-label' + (selected ? ' selected' : '')}
            data-obj={'label:' + label.id}
            x={label.x * CELL}
            y={label.y * CELL}
            transform={label.rotation ? `rotate(${label.rotation} ${label.x * CELL} ${label.y * CELL})` : undefined}
            textAnchor="middle"
            fontFamily={look.font}
            fontSize={size}
            fontWeight={look.weight}
            fontStyle={look.italic ? 'italic' : undefined}
            letterSpacing={look.spacing ? look.spacing * size : undefined}
            fill={look.color}
            stroke={look.halo}
            strokeWidth={size * 0.2}
            strokeLinejoin="round"
            paintOrder="stroke"
            onPointerDown={(e) => onDown(e, { kind: 'label', id: label.id }, 'move')}
        >
            {lines.map((ln, i) => (
                <tspan key={i} x={label.x * CELL} dy={i === 0 ? (-(lines.length - 1) / 2 * 1.15 + 0.35) + 'em' : '1.15em'}>{ln || ' '}</tspan>
            ))}
        </text>
    );
}

export function LabelsLayer({ doc, style, selection, onDown }: {
    doc: MapDoc; style: MapStyle; selection: Selection[]; onDown: ObjectDown;
}) {
    const W = doc.cols * CELL, H = doc.rows * CELL;
    return (
        <svg className="map-svg map-labels" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {doc.labels.map((l) => (
                <LabelText key={l.id} label={l} style={style} selected={isSel(selection, 'label', l.id)} onDown={onDown} />
            ))}
        </svg>
    );
}

/* ----------------------------------------------------------------- tokens */

function TokenView({ token, style, selected, onDown }: {
    token: MapToken; style: MapStyle; selected: boolean; onDown: ObjectDown;
}) {
    const px = token.size * CELL;
    const candidates = token.kind === 'pokemon' && token.image
        ? pokemonTokenChain(token.image)
        : markerChain(style, token.kind === 'trainer' ? 'trainer' : 'wild');
    return (
        <div
            className={'map-obj map-token map-token-' + token.kind + (selected ? ' selected' : '')}
            data-obj={'token:' + token.id}
            style={{ left: token.x * CELL, top: token.y * CELL, width: px, height: px, borderColor: token.color, borderWidth: Math.max(2, px * 0.07) }}
            onPointerDown={(e) => onDown(e, { kind: 'token', id: token.id }, 'move')}
            title={token.name}
        >
            <MapSprite
                candidates={candidates}
                icon={token.kind === 'trainer' ? 'fa-user' : 'fa-question'}
                color={token.color}
                className={'map-token-art' + (style.pixelated ? ' pixelated' : '')}
                style={{ fontSize: px * 0.45 }}
            />
            {token.name && (
                <span className="map-token-name" style={{ fontSize: Math.max(9, px * 0.26), background: token.color }}>{token.name}</span>
            )}
        </div>
    );
}

export function TokensLayer({ doc, style, selection, onDown }: {
    doc: MapDoc; style: MapStyle; selection: Selection[]; onDown: ObjectDown;
}) {
    return (
        <>
            {doc.tokens.map((t) => (
                <TokenView key={t.id} token={t} style={style} selected={isSel(selection, 'token', t.id)} onDown={onDown} />
            ))}
        </>
    );
}
