/* The two things a deck can play through: an <audio> element for a file the
   table downloaded, and a YouTube player for a link. One interface, so the
   sync loop in music.ts does not care which it is driving. */

export interface Output {
    readonly kind: 'file' | 'yt';
    /** Starts loading a source; a no-op when it is already loaded. */
    load(src: string): void;
    unload(): void;
    time(): number;
    seek(t: number): void;
    play(): Promise<void>;
    pause(): void;
    readonly paused: boolean;
    /** Can play from where it is without waiting. */
    readonly ready: boolean;
    /** Mid-seek: its clock is not to be trusted yet. */
    readonly seeking: boolean;
    /** Seconds, 0 while unknown. */
    readonly duration: number;
    /** Fine rate control. YouTube has only a few coarse steps. */
    readonly fineRate: boolean;
    setRate(r: number): void;
    setVolume(v: number): void;
    setLoop(loop: boolean): void;
    /** A problem with this source, in a sentence; '' when none. */
    readonly error: string;
    destroy(): void;
}

/* ------------------------------------------------------------- files */

export class FileOutput implements Output {
    readonly kind = 'file' as const;
    readonly fineRate = true;
    private el: HTMLAudioElement;
    private src = '';
    private rate = 1;
    error = '';

    constructor() {
        this.el = new Audio();
        this.el.preload = 'auto';
        /* A deck sped up 3% to catch up must not sound 3% sharp. */
        this.el.preservesPitch = true;
        this.el.onerror = () => { this.error = 'This browser cannot play that file.'; };
    }

    load(src: string): void {
        if (this.src === src) return;
        this.src = src;
        this.error = '';
        this.el.src = src;
        this.el.load();
    }

    unload(): void {
        if (!this.src) return;
        this.src = '';
        this.el.pause();
        this.el.removeAttribute('src');
        this.el.load();
    }

    time(): number { return this.el.currentTime; }
    seek(t: number): void { if (Number.isFinite(t)) this.el.currentTime = Math.max(0, t); }
    play(): Promise<void> { return this.el.play(); }
    pause(): void { if (!this.el.paused) this.el.pause(); }
    get paused(): boolean { return this.el.paused; }
    get ready(): boolean { return this.el.readyState >= 3; }
    get seeking(): boolean { return this.el.seeking; }
    get duration(): number { return Number.isFinite(this.el.duration) ? this.el.duration : 0; }

    get rateNow(): number { return this.rate; }
    get volumeNow(): number { return this.el.volume; }

    setRate(r: number): void {
        if (Math.abs(r - this.rate) < 0.001) return;
        this.rate = r;
        this.el.playbackRate = r;
    }

    setVolume(v: number): void {
        const clamped = Math.max(0, Math.min(1, v));
        if (Math.abs(this.el.volume - clamped) > 0.001) this.el.volume = clamped;
    }

    setLoop(loop: boolean): void { this.el.loop = loop; }

    destroy(): void { this.unload(); }
}

/* ------------------------------------------------------------- YouTube */

/* The IFrame API, typed for exactly what is used here. */
interface YtPlayer {
    cueVideoById(id: string): void;
    loadVideoById(id: string, start?: number): void;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(t: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    setVolume(v: number): void;
    destroy(): void;
}

interface YtNamespace {
    Player: new (el: HTMLElement, opts: Record<string, unknown>) => YtPlayer;
}

declare global {
    interface Window {
        YT?: YtNamespace;
        onYouTubeIframeAPIReady?: () => void;
    }
}

let api: Promise<YtNamespace> | null = null;

/** Loads YouTube's player API once, the first time a deck needs it. */
export function loadYouTube(): Promise<YtNamespace> {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (api) return api;
    api = new Promise<YtNamespace>((resolve, reject) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            prev?.();
            if (window.YT?.Player) resolve(window.YT);
        };
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.async = true;
        s.onerror = () => { api = null; reject(new Error('YouTube could not be reached.')); };
        document.head.appendChild(s);
    });
    return api;
}

export function youTubeReady(): boolean {
    return !!window.YT?.Player;
}

/** Accepts a bare id or any of YouTube's link shapes. */
export function parseYouTube(raw: string): string | null {
    const s = raw.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    try {
        const u = new URL(s);
        const host = u.hostname.replace(/^(www|m|music)\./, '');
        if (host === 'youtu.be') return /^\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1] ?? null;
        if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            const v = u.searchParams.get('v');
            if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
            return /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1] ?? null;
        }
    } catch { /* not a URL */ }
    return null;
}

const YT_ERRORS: Record<number, string> = {
    2: 'That YouTube link is not valid.',
    5: 'YouTube could not play that video here.',
    100: 'That YouTube video was removed or is private.',
    101: 'That video’s owner does not allow it to play outside YouTube.',
    150: 'That video’s owner does not allow it to play outside YouTube.',
};

/* YouTube's terms do not allow a hidden player, so each deck's player is a
   small visible box in a dock the page owns, outside React: a re-render must
   never tear down an iframe that is playing. */
function dock(): HTMLElement {
    let d = document.getElementById('yt-dock');
    if (!d) {
        d = document.createElement('div');
        d.id = 'yt-dock';
        d.setAttribute('aria-label', 'YouTube players');
        document.body.appendChild(d);
    }
    return d;
}

export class YtOutput implements Output {
    readonly kind = 'yt' as const;
    readonly fineRate = false;
    private box: HTMLElement;
    private player: YtPlayer | null = null;
    private playerReady = false;
    private video = '';
    private state = -1;
    private wantVolume = 100;
    private loop = false;
    /** The player's clock right after a seek is the old position for a beat. */
    private seekUntil = 0;
    error = '';

    constructor(label: string) {
        this.box = document.createElement('div');
        this.box.className = 'yt-box';
        this.box.dataset.deck = label;
        const tag = document.createElement('span');
        tag.className = 'yt-box-label';
        tag.textContent = label;
        const slot = document.createElement('div');
        this.box.append(tag, slot);
        this.box.hidden = true;
        dock().appendChild(this.box);
    }

    load(src: string): void {
        if (this.video === src) return;
        this.video = src;
        this.error = '';
        this.state = -1;
        this.box.hidden = false;
        if (this.player && this.playerReady) {
            this.player.cueVideoById(src);
            return;
        }
        if (this.player) return;
        void loadYouTube().then((YT) => {
            if (this.player || !this.video) return;
            const slot = this.box.lastElementChild as HTMLElement;
            this.player = new YT.Player(slot, {
                host: 'https://www.youtube-nocookie.com',
                videoId: this.video,
                width: 192,
                height: 108,
                playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin },
                events: {
                    onReady: () => {
                        this.playerReady = true;
                        this.player?.setVolume(this.wantVolume);
                    },
                    onStateChange: (e: { data: number }) => {
                        this.state = e.data;
                        /* Ended on a looping deck: round again. */
                        if (e.data === 0 && this.loop) { this.player?.seekTo(0, true); this.player?.playVideo(); }
                    },
                    onError: (e: { data: number }) => { this.error = YT_ERRORS[e.data] ?? 'YouTube could not play that video.'; },
                },
            });
        }).catch((e) => { this.error = e instanceof Error ? e.message : 'YouTube could not be reached.'; });
    }

    unload(): void {
        if (!this.video) return;
        this.video = '';
        this.box.hidden = true;
        if (this.player && this.playerReady) this.player.pauseVideo();
    }

    time(): number {
        return this.player && this.playerReady ? this.player.getCurrentTime() || 0 : 0;
    }

    seek(t: number): void {
        if (!this.player || !this.playerReady) return;
        this.player.seekTo(Math.max(0, t), true);
        this.seekUntil = performance.now() + 700;
    }

    play(): Promise<void> {
        if (this.player && this.playerReady) this.player.playVideo();
        return Promise.resolve();
    }

    pause(): void {
        if (this.player && this.playerReady && (this.state === 1 || this.state === 3)) this.player.pauseVideo();
    }

    /** Playing (1) or buffering on its way to playing (3) is not paused. */
    get paused(): boolean { return this.state !== 1 && this.state !== 3; }
    /** The player exists and is not buffering. A player made with a video id
        stays "unstarted" (-1) without ever reporting "cued", so that counts as
        ready to be told to play; an advert or a slow network shows as
        buffering (3). */
    get ready(): boolean { return this.playerReady && this.state !== 3; }
    get seeking(): boolean { return this.state === 3 || performance.now() < this.seekUntil; }

    get duration(): number {
        return this.player && this.playerReady ? this.player.getDuration() || 0 : 0;
    }

    setRate(): void { /* coarse steps only; this output corrects by seeking */ }

    setVolume(v: number): void {
        const vol = Math.round(Math.max(0, Math.min(1, v)) * 100);
        if (vol === this.wantVolume) return;
        this.wantVolume = vol;
        if (this.player && this.playerReady) this.player.setVolume(vol);
    }

    setLoop(loop: boolean): void { this.loop = loop; }

    destroy(): void {
        try { this.player?.destroy(); } catch { /* already gone */ }
        this.player = null;
        this.box.remove();
    }
}
