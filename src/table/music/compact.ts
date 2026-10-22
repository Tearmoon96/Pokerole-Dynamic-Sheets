/* Makes a GM's audio file small before it goes to the table.

   Every megabyte of a track is a request to the relay for the GM and one more
   for each player, and the relay's free allowance counts requests. A WAV or
   FLAC is ten times the size it needs to be for a table's background music,
   and a 320 kbps MP3 three times. So the GM's own browser re-encodes such a
   file to Opus at 96 kbps — transparent for this use — and the table only
   ever sees the small copy.

   The container is WebM, written here: it is what every browser the table
   supports plays Opus from (Safari on a Mac included, which does not take
   Opus in Ogg), and with Cues it seeks at once, which the sync loop does
   all the time (music.ts `reconcile`).

   Nothing is lost by trying: anything this cannot do — no WebCodecs, a file
   the browser cannot decode, a result not much smaller — keeps the original. */

/** Past this the decoded audio is too much memory to hold at once. */
const MAX_SECONDS = 15 * 60;
/** A lossy file below this is left alone: re-encoding would only lose. */
const KEEP_BELOW_KBPS = 160;
/** Kept only when it is at most this share of the original. */
const WORTH = 0.75;
const RATE = 48_000;
const LOSSLESS = /^audio\/(wav|x-wav|wave|vnd\.wave|flac|x-flac|aiff|x-aiff)$|\.(wav|flac|aiff?)$/i;

function bitrate(channels: number): number {
    return channels > 1 ? 96_000 : 64_000;
}

/** A smaller copy of the file, or null to keep it as it is. */
export async function compactAudio(file: File, seconds: number): Promise<Blob | null> {
    if (typeof AudioEncoder === 'undefined' || typeof OfflineAudioContext === 'undefined') return null;
    if (!(seconds > 0) || seconds > MAX_SECONDS) return null;
    const lossless = LOSSLESS.test(file.type) || LOSSLESS.test(file.name);
    if (!lossless && file.size * 8 / seconds / 1000 < KEEP_BELOW_KBPS) return null;
    try {
        const ctx = new OfflineAudioContext(2, 1, RATE);
        const audio = await ctx.decodeAudioData(await file.arrayBuffer());
        const channels = Math.min(2, audio.numberOfChannels);
        const config: AudioEncoderConfig = { codec: 'opus', sampleRate: RATE, numberOfChannels: channels, bitrate: bitrate(channels) };
        if (!(await AudioEncoder.isConfigSupported(config)).supported) return null;
        const encoded = await encode(audio, channels, config);
        const out = new Blob([webm(encoded, channels, audio.length)], { type: 'audio/webm' });
        return out.size <= file.size * WORTH ? out : null;
    } catch {
        return null;
    }
}

interface Encoded {
    frames: { data: Part; samples: number }[];
    /** Samples the decoder drops from the start (the encoder's look-ahead). */
    preSkip: number;
}

async function encode(audio: AudioBuffer, channels: number, config: AudioEncoderConfig): Promise<Encoded> {
    const frames: Encoded['frames'] = [];
    let preSkip = 312;
    let failure: unknown = null;
    const encoder = new AudioEncoder({
        output: (chunk, meta) => {
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            frames.push({ data, samples: Math.round((chunk.duration ?? 20_000) * RATE / 1e6) });
            const head = meta?.decoderConfig?.description;
            if (head && frames.length === 1) {
                const bytes = ArrayBuffer.isView(head) ? new Uint8Array(head.buffer, head.byteOffset, head.byteLength)
                    : new Uint8Array(head);
                /* OpusHead: the pre-skip is the little-endian u16 at byte 10. */
                if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 8)) === 'OpusHead') {
                    preSkip = bytes[10] | (bytes[11] << 8);
                }
            }
        },
        error: (e) => { failure = e; },
    });
    encoder.configure(config);
    const step = RATE;
    for (let at = 0; at < audio.length; at += step) {
        if (failure) throw failure;
        const n = Math.min(step, audio.length - at);
        const data = new Float32Array(n * channels);
        for (let c = 0; c < channels; c++) data.set(audio.getChannelData(c).subarray(at, at + n), c * n);
        const chunk = new AudioData({
            format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: channels,
            timestamp: Math.round(at * 1e6 / RATE), data,
        });
        encoder.encode(chunk);
        chunk.close();
        /* Let the encoder drain rather than queue the whole file. */
        while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 0));
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    if (!frames.length) throw new Error('nothing encoded');
    return { frames, preSkip };
}

/* ------------------------------------------------------------ the WebM */

const ID = {
    EBML: 0x1A45DFA3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42F7, EBMLMaxIDLength: 0x42F2,
    EBMLMaxSizeLength: 0x42F3, DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
    Segment: 0x18538067, SeekHead: 0x114D9B74, Seek: 0x4DBB, SeekID: 0x53AB, SeekPosition: 0x53AC,
    Info: 0x1549A966, TimestampScale: 0x2AD7B1, Duration: 0x4489, MuxingApp: 0x4D80, WritingApp: 0x5741,
    Tracks: 0x1654AE6B, TrackEntry: 0xAE, TrackNumber: 0xD7, TrackUID: 0x73C5, TrackType: 0x83,
    FlagLacing: 0x9C, CodecID: 0x86, CodecPrivate: 0x63A2, CodecDelay: 0x56AA, SeekPreRoll: 0x56BB,
    Audio: 0xE1, SamplingFrequency: 0xB5, Channels: 0x9F,
    Cluster: 0x1F43B675, Timestamp: 0xE7, SimpleBlock: 0xA3,
    Cues: 0x1C53BB6B, CuePoint: 0xBB, CueTime: 0xB3, CueTrackPositions: 0xB7, CueTrack: 0xF7,
    CueClusterPosition: 0xF1,
} as const;

/** One cluster per this many milliseconds; a block's time is a signed
    16-bit offset from its cluster's, so it must stay well under 32 s. */
const CLUSTER_MS = 5000;

type Part = Uint8Array<ArrayBuffer>;

function concat(parts: Part[]): Part {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

function idBytes(id: number): Part {
    const out: number[] = [];
    for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
    return Uint8Array.from(out);
}

/** An EBML size: the shortest variable-length integer that holds it. */
function size(n: number): Part {
    for (let len = 1; len <= 8; len++) {
        if (n < 2 ** (7 * len) - 1) {
            const out = new Uint8Array(len);
            let v = n;
            for (let i = len - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
            out[0] |= 0x80 >> (len - 1);
            return out;
        }
    }
    throw new Error('element too large');
}

function el(id: number, ...body: Part[]): Part {
    const payload = concat(body);
    return concat([idBytes(id), size(payload.length), payload]);
}

/** An unsigned integer, in `width` bytes or as few as it needs. */
function uint(id: number, v: number, width = 0): Part {
    const out: number[] = [];
    for (let x = v; x > 0; x = Math.floor(x / 256)) out.unshift(x % 256);
    while (out.length < Math.max(1, width)) out.unshift(0);
    return el(id, Uint8Array.from(out));
}

function float(id: number, v: number): Part {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v);
    return el(id, b);
}

function ascii(id: number, s: string): Part {
    return el(id, Uint8Array.from(s, (c) => c.charCodeAt(0)));
}

function opusHead(channels: number, preSkip: number): Part {
    const b = new Uint8Array(19);
    b.set(Uint8Array.from('OpusHead', (c) => c.charCodeAt(0)));
    const v = new DataView(b.buffer);
    v.setUint8(8, 1);
    v.setUint8(9, channels);
    v.setUint16(10, preSkip, true);
    v.setUint32(12, RATE, true);
    return b;
}

function webm(enc: Encoded, channels: number, samples: number): Part {
    const header = el(ID.EBML,
        uint(ID.EBMLVersion, 1), uint(ID.EBMLReadVersion, 1), uint(ID.EBMLMaxIDLength, 4),
        uint(ID.EBMLMaxSizeLength, 8), ascii(ID.DocType, 'webm'), uint(ID.DocTypeVersion, 4),
        uint(ID.DocTypeReadVersion, 2));

    const info = el(ID.Info,
        uint(ID.TimestampScale, 1_000_000), float(ID.Duration, samples * 1000 / RATE),
        ascii(ID.MuxingApp, 'Pokerole Dynamic Sheets'), ascii(ID.WritingApp, 'Pokerole Dynamic Sheets'));

    const tracks = el(ID.Tracks, el(ID.TrackEntry,
        uint(ID.TrackNumber, 1), uint(ID.TrackUID, 1), uint(ID.TrackType, 2), uint(ID.FlagLacing, 0),
        ascii(ID.CodecID, 'A_OPUS'), el(ID.CodecPrivate, opusHead(channels, enc.preSkip)),
        uint(ID.CodecDelay, Math.round(enc.preSkip * 1e9 / RATE)), uint(ID.SeekPreRoll, 80_000_000),
        el(ID.Audio, float(ID.SamplingFrequency, RATE), uint(ID.Channels, channels))));

    /* The clusters, each starting on a whole frame. Times are the decoded
       stream's: the pre-skip is the decoder's to drop (CodecDelay). */
    const clusters: { ms: number; bytes: Part }[] = [];
    let blocks: Part[] = [];
    let clusterMs = 0;
    let at = 0;
    const close = () => {
        if (blocks.length) clusters.push({ ms: clusterMs, bytes: el(ID.Cluster, uint(ID.Timestamp, clusterMs), ...blocks) });
        blocks = [];
    };
    for (const f of enc.frames) {
        const ms = Math.round(at * 1000 / RATE);
        if (!blocks.length) clusterMs = ms;
        else if (ms - clusterMs >= CLUSTER_MS) { close(); clusterMs = ms; }
        const head = new Uint8Array(4);
        head[0] = 0x81;
        new DataView(head.buffer).setInt16(1, ms - clusterMs);
        head[3] = 0x80;
        blocks.push(el(ID.SimpleBlock, head, f.data));
        at += f.samples;
    }
    close();

    /* Positions are counted from the start of the Segment's data. The seek
       head's are written 8 bytes wide, so its length is known before them. */
    const seekHead = (infoAt: number, tracksAt: number, cuesAt: number) => el(ID.SeekHead,
        el(ID.Seek, el(ID.SeekID, idBytes(ID.Info)), uint(ID.SeekPosition, infoAt, 8)),
        el(ID.Seek, el(ID.SeekID, idBytes(ID.Tracks)), uint(ID.SeekPosition, tracksAt, 8)),
        el(ID.Seek, el(ID.SeekID, idBytes(ID.Cues)), uint(ID.SeekPosition, cuesAt, 8)));
    const headLen = seekHead(0, 0, 0).length;
    const infoAt = headLen;
    const tracksAt = infoAt + info.length;
    let clusterAt = tracksAt + tracks.length;
    const cuePoints: Part[] = [];
    for (const c of clusters) {
        cuePoints.push(el(ID.CuePoint, uint(ID.CueTime, c.ms),
            el(ID.CueTrackPositions, uint(ID.CueTrack, 1), uint(ID.CueClusterPosition, clusterAt))));
        clusterAt += c.bytes.length;
    }
    const cues = el(ID.Cues, ...cuePoints);
    const body = concat([seekHead(infoAt, tracksAt, clusterAt), info, tracks, ...clusters.map((c) => c.bytes), cues]);
    return concat([header, el(ID.Segment, body)]);
}
