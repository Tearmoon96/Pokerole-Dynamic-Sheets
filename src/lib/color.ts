/* Colour maths the themes derive from. Ported verbatim; the rounding and the
   exact mix points are what make a derived theme match its hand-tuned twin. */

export function mixHex(hexA: string, hexB: string, t: number): string {
    const a = hexA.match(/\w\w/g)!.map((x) => parseInt(x, 16));
    const b = hexB.match(/\w\w/g)!.map((x) => parseInt(x, 16));
    return '#' + a.map((v, i) =>
        Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function hexToHsl(hex: string): [number, number, number] {
    const [r, g, b] = hex.match(/\w\w/g)!.map((x) => parseInt(x, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + [r, g, b].map((v) =>
        Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/** A second colour that reads as clearly different from `hex`: near-greys go
    pale, everything else rotates 45 degrees and lands in a usable lightness. */
export function distinctVariant(hex: string): string {
    const [h, s, l] = hexToHsl(hex);
    if (s < 0.25) return mixHex(hex, '#ffffff', 0.75);
    return hslToHex((h + 45) % 360, s, Math.min(0.72, Math.max(0.6, l)));
}

/** Black or white, whichever reads on a filled chip of this colour. The 0.19
    threshold is where the ailment palette splits most cleanly. */
export function inkOn(hex: string): string {
    const [r, g, b] = hex.match(/\w\w/g)!
        .map((x) => parseInt(x, 16) / 255)
        .map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.19 ? '#12100f' : '#ffffff';
}
