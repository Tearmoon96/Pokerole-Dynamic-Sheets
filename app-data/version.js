/* App version + the update check's only tunable bits.

   This file exists so the version string lives somewhere obvious instead of
   buried in a 10,000-line HTML file. It is loaded by trainer-license.html
   through the same document.write loader as the data bundles.

   RELEASING A NEW VERSION IS TWO STEPS — do both, or the check misfires:
     1. Bump APP_VERSION below.
     2. Publish a GitHub release whose tag matches it (a leading "v" is fine,
        so v1.1.0 and 1.1.0 are treated as the same version).

   If the tag is NEWER than APP_VERSION, everyone still running the old copy
   sees a dot on the info button. If the two drift apart, users either never
   get told about an update or get told about one forever. */

window.APP_VERSION = '1.0.8';
window.APP_REPO = 'Tearmoon96/Pokerole-Dynamic-Sheets';

/* Compare two dot-separated versions numerically. Returns 1 if a > b, -1 if
   a < b, 0 if equal. Tolerates a leading "v" and differing segment counts, so
   "v1.2" and "1.2.0" come out equal.

   Anything unparseable returns 0 (= "no update"). That is deliberate: a junk
   tag should leave users alone, not nag them about an update forever. */
window.compareVersions = function (a, b) {
    const parse = v => String(v == null ? '' : v).trim().replace(/^v/i, '').split('.')
        .map(n => parseInt(n, 10));
    const pa = parse(a), pb = parse(b);
    if (!pa.length || !pb.length || pa.some(isNaN) || pb.some(isNaN)) return 0;
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0, nb = pb[i] || 0;   // missing segment counts as 0
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
};
