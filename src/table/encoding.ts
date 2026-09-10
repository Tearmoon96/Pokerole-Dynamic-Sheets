/* Byte pushing for the rolling table: the four conversions the protocol needs
   and a password generator, kept away from the crypto so that file reads as
   crypto and nothing else. */

/* TypeScript 5.7 made Uint8Array generic over the buffer behind it, and the
   WebCrypto signatures all want the ArrayBuffer flavour rather than the
   ArrayBufferLike one a bare `Uint8Array` annotation widens to. Naming it
   once keeps that detail out of every signature downstream. */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (s: string): Bytes => encoder.encode(s);
export const fromUtf8 = (b: ArrayBuffer | Uint8Array): string => decoder.decode(b);

/* RFC 4648 base32, uppercase, unpadded. Used for the lobby id and the room
   address because both get read aloud or retyped now and then, and base32 has
   no case to get wrong and no +/ to mangle in a URL.

   Note the alphabet omits 0, 1, 8 and 9 — so does the digit-lookalike problem
   of O vs 0 and I vs 1. Any example id has to respect that or it cannot be
   typed back in. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function toBase32(bytes: Uint8Array<ArrayBufferLike>): string {
    let out = '';
    let bits = 0;
    let value = 0;
    for (const b of bytes) {
        value = (value << 8) | b;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

export function toB64u(bytes: Uint8Array<ArrayBufferLike>): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Throws on malformed input — every caller is a validation boundary and
    treats the throw as "not one of ours". */
export function fromB64u(s: string): Bytes {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/* Lower case, upper case, digits and punctuation that survives a copy-paste
   through a chat window, a URL bar and a shell without being escaped or
   turned into a smart quote. */
const PW_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const PW_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PW_DIGIT = '0123456789';
const PW_SYMBOL = '!#$%&*+-=?@^_~';
const PW_ALPHABET = PW_LOWER + PW_UPPER + PW_DIGIT + PW_SYMBOL;

export const PASSWORD_LENGTH = 32;

/** A 32-character lobby password drawn from the browser's CSPRNG.

    Rejection sampling, not `% alphabet.length`: the modulo would make the first
    few characters of the alphabet fractionally likelier, and there is no reason
    to hand an attacker even that. The whole string is redrawn until all four
    character classes appear, which keeps it uniform over the strings that
    qualify rather than biasing individual positions. */
export function generatePassword(): string {
    const n = PW_ALPHABET.length;
    const ceiling = 256 - (256 % n);
    for (let attempt = 0; attempt < 64; attempt++) {
        let out = '';
        while (out.length < PASSWORD_LENGTH) {
            const buf = crypto.getRandomValues(new Uint8Array(PASSWORD_LENGTH));
            for (const b of buf) {
                if (b >= ceiling) continue;
                out += PW_ALPHABET[b % n];
                if (out.length === PASSWORD_LENGTH) break;
            }
        }
        const hasAll = [PW_LOWER, PW_UPPER, PW_DIGIT, PW_SYMBOL]
            .every((set) => [...out].some((c) => set.includes(c)));
        if (hasAll) return out;
    }
    /* Unreachable in practice: the chance of 64 consecutive draws each missing
       a class is far below the chance of the CSPRNG itself being broken. */
    throw new Error('could not generate a password');
}

/** `K7QM3XTBR5WE2GHD` shown as `K7QM-3XTB-R5WE-2GHD`. Display only — every
    comparison and every derivation uses the bare form. */
export function formatLobbyId(id: string): string {
    return (id.match(/.{1,4}/g) || []).join('-');
}

/** Accepts what `formatLobbyId` produces, what the user retyped in lower case,
    and whatever spaces a chat client inserted. */
export function normaliseLobbyId(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z2-7]/g, '');
}
