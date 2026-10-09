/* What display text arriving from another browser may not contain. */

/* C0/C1 controls, zero-width characters, line separators, the byte-order mark
   and the bidirectional overrides. The last group is the interesting one:
   U+202E flips the rendering direction of everything after it, which is the
   classic way to make one display name look like another on screen. */
export const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
