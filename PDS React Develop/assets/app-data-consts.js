/* Hands the app-data bundles' top-level `const`s to the app.

   The equipment icon catalogues and the sprite frames are declared with
   `const`, which puts them in the page's global lexical scope and never on
   window. A classic script can read them by name; the app's own code could only
   with eval, which the pages' Content-Security-Policy refuses. So this runs
   right after the bundles (src/data/loadAppData.ts) and copies them across. */
window.PDS_APP_DATA_CONSTS = {
    EQUIP_ICONS: typeof EQUIP_ICONS !== 'undefined' ? EQUIP_ICONS : undefined,
    EQUIP_ICONS_MONO: typeof EQUIP_ICONS_MONO !== 'undefined' ? EQUIP_ICONS_MONO : undefined,
    EQUIP_ICON_DIR: typeof EQUIP_ICON_DIR !== 'undefined' ? EQUIP_ICON_DIR : undefined,
    EQUIP_ICON_MONO_DIR: typeof EQUIP_ICON_MONO_DIR !== 'undefined' ? EQUIP_ICON_MONO_DIR : undefined,
    SPRITE_FRAMES: typeof SPRITE_FRAMES !== 'undefined' ? SPRITE_FRAMES : undefined,
};
