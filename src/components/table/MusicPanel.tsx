/* Music at the table. The GM sees the library and both decks with their
   controls; a player sees what is playing and their own volume. Either way
   the decks show where the music is, worked out from the table's clock. */

import { useEffect, useRef, useState } from 'react';
import { useTable } from '../../table/TableContext';
import { CHANNELS } from '../../table/protocol';
import type { ChannelId } from '../../table/protocol';
import { formatTime } from '../../table/music/position';
import type { GmTrack } from '../../table/music/music';

const DECK_NAMES: Record<ChannelId, string> = { bg: 'Background', scene: 'Scene' };
const DECK_ICONS: Record<ChannelId, string> = { bg: 'fa-water', scene: 'fa-masks-theater' };

/** Re-renders every `ms` while `on`, for moving seek bars. */
function useTicker(on: boolean, ms: number): void {
    const [, setN] = useState(0);
    useEffect(() => {
        if (!on) return;
        const t = window.setInterval(() => setN((n) => n + 1), ms);
        return () => clearInterval(t);
    }, [on, ms]);
}

function SoundGate() {
    const { session } = useTable();
    return (
        <button className="accent wide sound-gate" data-enable-sound="" onClick={() => session.music.unlock()}>
            <i className="fa-solid fa-volume-high"></i> Enable sound
        </button>
    );
}

function Deck({ ch }: { ch: ChannelId }) {
    const { session, state } = useTable();
    const music = session.music;
    const m = music.view;
    const st = m.decks[ch];
    const host = state.isHost;
    const track = host ? m.gm.find((t) => t.id === st.track) : m.library.find((t) => t.id === st.track);
    useTicker(!!track && st.playing, 250);
    const [drag, setDrag] = useState<number | null>(null);

    const pos = music.positionOf(ch);
    const shownTime = drag ?? pos.t;
    const dur = pos.dur;
    const waiting = host && m.waiting[ch];
    const blockers = waiting ? music.blockers(st.track) : [];
    const stalled = m.stall.includes(ch);
    const error = m.errors[ch];
    const drift = m.drift[ch];

    const commitSeek = () => {
        if (drag !== null) music.seek(ch, drag);
        setDrag(null);
    };

    return (
        <div className={'deck deck-' + ch + (st.playing ? ' playing' : '')} data-deck={ch}>
            <div className="deck-head">
                <i className={'fa-solid ' + DECK_ICONS[ch] + ' deck-icon'}></i>
                <span className="deck-name">{DECK_NAMES[ch]}</span>
                <span className="deck-track" title={track?.title}>
                    {track ? track.title : <span className="muted">nothing marked</span>}
                </span>
                {track?.kind === 'yt' && <i className="fa-brands fa-youtube yt-mark" aria-label="YouTube"></i>}
            </div>

            {track && (
                <>
                    <div className="deck-seek">
                        <span className="deck-time">{formatTime(shownTime)}</span>
                        {host ? (
                            <input
                                type="range" min={0} max={Math.max(1, dur)} step={0.1} data-seek={ch}
                                value={dur ? Math.min(shownTime, dur) : 0}
                                aria-label={DECK_NAMES[ch] + ' position'}
                                disabled={!dur}
                                onChange={(e) => setDrag(Number(e.currentTarget.value))}
                                onPointerUp={commitSeek}
                                onKeyUp={commitSeek}
                                onBlur={() => { if (drag !== null) commitSeek(); }}
                            />
                        ) : (
                            <div className="progress thin"><span style={{ width: dur ? Math.min(100, shownTime / dur * 100) + '%' : '0%' }}></span></div>
                        )}
                        <span className="deck-time">{dur ? formatTime(dur) : '–:––'}</span>
                    </div>

                    {host && (
                        <div className="deck-controls">
                            {st.playing && !pos.ended ? (
                                <button className="icon-btn" data-pause={ch} title="Pause for everyone" onClick={() => music.pause(ch)}>
                                    <i className="fa-solid fa-pause"></i>
                                </button>
                            ) : (
                                <button
                                    className="icon-btn accent" data-play={ch}
                                    title="Play for everyone (after the ready check)"
                                    onClick={() => music.play(ch)}
                                >
                                    <i className="fa-solid fa-play"></i>
                                </button>
                            )}
                            <button className="icon-btn" data-stop={ch} title="Stop and go back to the start" onClick={() => music.stop(ch)}>
                                <i className="fa-solid fa-stop"></i>
                            </button>
                            <button
                                className="icon-btn" aria-pressed={st.loop} data-loop={ch}
                                title={st.loop ? 'Looping: on' : 'Looping: off'}
                                onClick={() => music.setLoop(ch, !st.loop)}
                            >
                                <i className="fa-solid fa-repeat"></i>
                            </button>
                            <i className="fa-solid fa-volume-low deck-vol-icon"></i>
                            <input
                                type="range" min={0} max={1} step={0.01} value={st.vol} data-volume={ch}
                                aria-label={DECK_NAMES[ch] + ' volume for everyone'}
                                title="This deck's volume, for everyone"
                                onChange={(e) => music.setVolume(ch, Number(e.currentTarget.value))}
                            />
                        </div>
                    )}

                    {waiting && (
                        <div className="ready-check" role="status" data-ready-check={ch}>
                            <p><i className="fa-solid fa-hourglass-half"></i> Starts when everyone is ready:</p>
                            <ul>
                                {blockers.map((b) => (
                                    <li key={b.id || b.name}><strong>{b.name}</strong> — {b.why}</li>
                                ))}
                            </ul>
                            <div className="ready-buttons">
                                <button className="accent" data-start-anyway={ch} onClick={() => music.start(ch)}>Start anyway</button>
                                <button onClick={() => music.cancelWait(ch)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {(stalled || error || (st.playing && drift !== null)) && (
                        <p className={'deck-note' + (error || stalled ? ' warn-text' : '')}>
                            {error || (stalled
                                ? (!m.unlocked ? 'Sound is not enabled in this browser.' : 'Buffering…')
                                : Math.abs(drift!) < 50 ? 'In sync' : 'Catching up (' + drift + ' ms)')}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

function TrackRow({ t }: { t: GmTrack }) {
    const { session } = useTable();
    const music = session.music;
    const decks = music.view.decks;
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(t.title);
    const on = CHANNELS.filter((c) => decks[c].track === t.id);

    return (
        <li className={'track-row' + (on.length ? ' marked' : '')} data-track={t.id}>
            <div className="track-main">
                {t.kind === 'yt'
                    ? <i className="fa-brands fa-youtube yt-mark" aria-label="YouTube"></i>
                    : <i className="fa-solid fa-file-audio track-kind" aria-label="Audio file"></i>}
                {editing ? (
                    <input
                        type="text" className="track-title-input" value={title} maxLength={60} autoFocus
                        onChange={(e) => setTitle(e.currentTarget.value)}
                        onBlur={() => { music.rename(t.id, title); setEditing(false); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { music.rename(t.id, title); setEditing(false); }
                            if (e.key === 'Escape') { setTitle(t.title); setEditing(false); }
                        }}
                    />
                ) : (
                    <span className="track-title" title={t.title} onDoubleClick={() => { setTitle(t.title); setEditing(true); }}>
                        {t.title}
                    </span>
                )}
                <span className="track-dur">{t.dur ? formatTime(t.dur) : ''}</span>
            </div>
            <div className="track-meta">
                {on.map((c) => <span key={c} className={'deck-chip ' + c}>{DECK_NAMES[c]}</span>)}
                {t.upload !== null && (
                    <span className="track-upload">
                        <i className="fa-solid fa-cloud-arrow-up"></i> {Math.round(t.upload * 100)}%
                    </span>
                )}
                {t.uploadError && (
                    <button className="link-btn warn-text" title={t.uploadError} onClick={() => music.retryUpload(t.id)}>
                        <i className="fa-solid fa-triangle-exclamation"></i> retry upload
                    </button>
                )}
                <span className="bar-spacer"></span>
                <button className="mini-btn" data-assign="bg" title="Mark as the Background track" aria-pressed={decks.bg.track === t.id}
                    onClick={() => music.assign('bg', t.id)}>BG</button>
                <button className="mini-btn" data-assign="scene" title="Mark as the Scene track" aria-pressed={decks.scene.track === t.id}
                    onClick={() => music.assign('scene', t.id)}>Scene</button>
                <button className="icon-btn" aria-label={'Rename ' + t.title} onClick={() => { setTitle(t.title); setEditing(true); }}>
                    <i className="fa-solid fa-pen"></i>
                </button>
                <button className="icon-btn danger" aria-label={'Remove ' + t.title} onClick={() => music.remove(t.id)}>
                    <i className="fa-solid fa-xmark"></i>
                </button>
            </div>
        </li>
    );
}

function Library() {
    const { session } = useTable();
    const music = session.music;
    const tracks = music.view.gm;
    const files = useRef<HTMLInputElement>(null);
    const [link, setLink] = useState('');
    const [busy, setBusy] = useState(false);

    return (
        <div className="library">
            <div className="library-head">
                <span className="side-subtitle">Library <span className="muted">{tracks.length}/40</span></span>
            </div>
            {tracks.length === 0 && <p className="muted">Add audio files or YouTube links, then mark one as Background or Scene.</p>}
            <ul className="track-list">
                {tracks.map((t) => <TrackRow key={t.id} t={t} />)}
            </ul>
            <button className="wide" data-add-audio="" onClick={() => files.current?.click()}>
                <i className="fa-solid fa-plus"></i> Add audio files…
            </button>
            <input
                ref={files} type="file" accept="audio/*,.mp3,.ogg,.oga,.opus,.m4a,.aac,.wav,.flac,.webm" multiple hidden
                onChange={async (e) => {
                    const list = [...(e.currentTarget.files ?? [])];
                    e.currentTarget.value = '';
                    if (!list.length) return;
                    setBusy(true);
                    await music.addFiles(list);
                    setBusy(false);
                }}
            />
            <form
                className="yt-add"
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (!link.trim()) return;
                    if (await music.addYouTube(link)) setLink('');
                }}
            >
                <input
                    type="text" placeholder="YouTube link" value={link} aria-label="YouTube link"
                    onChange={(e) => setLink(e.currentTarget.value)}
                />
                <button type="submit" className="icon-btn" aria-label="Add the YouTube link"><i className="fa-solid fa-plus"></i></button>
            </form>
            {busy && <p className="muted"><i className="fa-solid fa-circle-notch fa-spin"></i> Reading the files…</p>}
            <p className="muted">
                Files are sent to the table once and kept in this browser for next time. A YouTube box
                appears in the corner while a video plays; adverts can put a player out of step for a moment.
            </p>
        </div>
    );
}

function PlayerLibrary() {
    const { session } = useTable();
    const m = session.music.view;
    const files = m.library.filter((t) => t.kind === 'file');
    if (!files.length) return null;
    const ready = files.filter((t) => m.tracks[t.id]?.state === 'ready').length;
    const failed = files.filter((t) => m.tracks[t.id]?.state === 'failed').length;
    const loading = files.find((t) => m.tracks[t.id]?.state === 'loading');
    return (
        <p className="muted" data-player-library="">
            <i className="fa-solid fa-download"></i> {ready}/{files.length} tracks ready
            {loading ? ' · ' + loading.title + ' ' + (m.tracks[loading.id]?.pct ?? 0) + '%' : ''}
            {failed ? ' · ' + failed + ' waiting to be resent' : ''}
        </p>
    );
}

function LocalMixer() {
    const { session } = useTable();
    const music = session.music;
    const mix = music.view.mix;
    const [open, setOpen] = useState(false);
    return (
        <div className="local-mix">
            <div className="mix-row">
                <button
                    className="icon-btn" aria-pressed={mix.muted}
                    aria-label={mix.muted ? 'Unmute' : 'Mute'}
                    onClick={() => music.setMix({ muted: !mix.muted })}
                >
                    <i className={'fa-solid ' + (mix.muted ? 'fa-volume-xmark' : 'fa-volume-high')}></i>
                </button>
                <input
                    type="range" min={0} max={1} step={0.01} value={mix.master}
                    aria-label="Your volume" title="Your volume — only on this device"
                    onChange={(e) => music.setMix({ master: Number(e.currentTarget.value) })}
                />
                <button className="icon-btn" aria-expanded={open} aria-label="More sound settings" onClick={() => setOpen(!open)}>
                    <i className="fa-solid fa-sliders"></i>
                </button>
            </div>
            {open && (
                <div className="mix-more">
                    {CHANNELS.map((c) => (
                        <label key={c} className="mix-field">
                            <span>{DECK_NAMES[c]}</span>
                            <input
                                type="range" min={0} max={1} step={0.01} value={mix[c]}
                                onChange={(e) => music.setMix({ [c]: Number(e.currentTarget.value) })}
                            />
                        </label>
                    ))}
                    <label className="mix-field">
                        <span>Speaker delay {mix.delay} ms</span>
                        <input
                            type="range" min={0} max={400} step={10} value={mix.delay}
                            onChange={(e) => music.setMix({ delay: Number(e.currentTarget.value) })}
                        />
                    </label>
                    <p className="muted">
                        Only on this device. Bluetooth headphones play late; a delay of 150–250 ms puts them back
                        in time with everyone else.
                    </p>
                </div>
            )}
        </div>
    );
}

export function MusicPanel() {
    const { session, state } = useTable();
    const m = session.music.view;
    const anything = state.isHost || m.library.length > 0 || CHANNELS.some((c) => m.decks[c].track);

    if (!anything) return null;

    return (
        <div className="side-panel music-panel">
            <h2 className="side-title"><i className="fa-solid fa-music"></i> Music</h2>
            {!m.unlocked && <SoundGate />}
            {CHANNELS.map((c) => <Deck key={c} ch={c} />)}
            <LocalMixer />
            {state.isHost ? <Library /> : <PlayerLibrary />}
        </div>
    );
}
