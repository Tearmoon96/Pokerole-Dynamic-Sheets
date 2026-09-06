/* Writes the two seeded pages the UI comparison screenshots: the original
   inline-HTML sheet and the React build, both preloaded with the same trainer
   so they render the same content.

   Both get the same fixture script, which can open one dialog on command. The
   dialogs are where a port is most likely to have drifted, and a screenshot of
   the closed sheet would never reach them. It drives the real UI — it clicks the
   button a user would — so the two pages need no shared internals. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = process.argv[2];
execFileSync(process.execPath, [ROOT + '/scripts/make-seed.mjs', ROOT], { stdio: 'inherit' });

/* Two things are neutralised in BOTH fixtures, so the comparison stays about
   layout and paint:

   - The toast is a few seconds' transient, so whether it is on screen when the
     shutter opens is a race, not a difference in the page. The GM screen calls
     its own `#toast`; the two character sheets share `.save-toast`.
   - The sprite carries a drop-shadow over a transformed image, and Chrome does
     not composite that bit-for-bit identically between runs — the same page
     shot twice differs by a couple of hundred pixels along the sprite's edge.
     Without this the real differences drown in that noise. */
const HIDE_TRANSIENTS = '<style>.save-toast,#toast{display:none!important}'
    + '.pokemon-sprite{filter:none!important}</style>';

/* One selector per view, resolved against the rendered page. */
/* Both pages are served over http so the fixture can drive them, which would
   otherwise switch the port into its hosted behaviour — no update row, a note
   where the Core Book PDF would be — and read as a regression against an
   original that has neither. Pin both to the from-disk behaviour instead. */
const ASSUME_DISK = '<script>window.__PDS_ASSUME_DISK__ = true;<' + '/script>';

const FIXTURE = `<script>
(function () {
    var VIEWS = {
        /* Pokémon card */
        cardTypes:   '.header-tools button[title="Type Effectiveness"]',
        cardAilments:'.header-tools button[title="Ailments & Conditions"]',
        cardWeather: '.header-tools button[title="Weather and Environments"]',
        cardLoad:    '#load-picker',
        cardAbility: '#add-ability-btn',
        theme:     '.license-tools button[title*="theme"]',
        info:      '#info-btn',
        storage:   '.team-capture-row button[title*="PC Storage"]',
        equipment: '.photo-equip-btn',
        manual:    '.license-footer button:nth-child(2)',
        team:      '.team-slot:nth-child(5) .team-edit-btn',
        badge:     '.badge-strip > *:nth-child(4)',
        /* GM screen */
        gmTip:     '#roster-body .tip-btn',
        gmCombatTip: '#combat-list .c-tip',
        /* Hover, not click: the ailment popover opens on mouseover of a round
           flag. Both pages listen on the document, so a synthetic event that
           bubbles reaches either of them. */
        'hover:gmAilment': '#combat-list .round-flag'
    };
    var view = new URLSearchParams(location.search).get('view');
    var sel = VIEWS[view] || VIEWS['hover:' + view];
    var hover = !VIEWS[view] && !!VIEWS['hover:' + view];
    if (!sel) return;
    var tries = 0;
    var timer = setInterval(function () {
        var el = document.querySelector(sel);
        if (!el) { if (++tries > 100) clearInterval(timer); return; }
        clearInterval(timer);
        if (hover) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        else el.click();
        settleFocus();
    }, 100);

    /* A dialog that focuses its search box does so at a different moment on the
       two pages — synchronously inside the click handler on the original, after
       a render on the React one — and headless Chrome only repaints the focus
       ring for the later of the two. The focused element is the same either way
       (checked with document.activeElement), so re-apply the focus once things
       have settled and both pages paint it. */
    function settleFocus() {
        setTimeout(function () {
            var el = document.activeElement;
            if (el && el.tagName === 'INPUT') { el.blur(); el.focus(); }
        }, 2000);
    }
})();
<\/script>`;

const seed = readFileSync(ROOT + '/.verify/seed-snippet.html', 'utf8');
const inject = (src, dest) => {
    const html = readFileSync(src, 'utf8')
        .replace('<head>', '<head>\n' + ASSUME_DISK + '\n' + seed + '\n' + HIDE_TRANSIENTS, 1)
        .replace('</body>', FIXTURE + '\n</body>');
    writeFileSync(dest, html);
};

inject(ROOT + '/legacy/trainer-license.html', ROOT + '/.verify/compare/legacy.html');
inject(ROOT + '/.verify/compare/trainer-license.html', ROOT + '/.verify/compare/react.html');
inject(ROOT + '/legacy/pokemon-card.html', ROOT + '/.verify/compare/legacy-card.html');
inject(ROOT + '/.verify/compare/pokemon-card.html', ROOT + '/.verify/compare/react-card.html');
inject(ROOT + '/legacy/gm-screen.html', ROOT + '/.verify/compare/legacy-gm.html');
inject(ROOT + '/.verify/compare/gm-screen.html', ROOT + '/.verify/compare/react-gm.html');
console.log('compare pages written');
