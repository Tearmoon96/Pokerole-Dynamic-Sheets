#!/usr/bin/env python3
#
# Measure where the art actually sits inside every sprite, and write the result
# to main as app-data/sprite-frames-db.js.
#
# PC storage draws each Pokemon in a round well. It used to frame them with one
# scale per sprite set, which assumes every sprite in a set fills its canvas the
# same way. They do not — across the Box set the subject spans anywhere from
# 0.21 to 1.00 of its canvas, a 4.8x range, so a single zoom left half of them
# bursting out of the circle (Venusaur at 1.39 of the diameter) while others sat
# lost in the middle of it (Tynamo at 0.41).
#
# The app cannot measure this itself: it runs from file://, where a local image
# taints the canvas and getImageData throws, and fetch is refused outright. So
# the measurement is done here, once, and shipped.
#
# What is emitted is the measurement, not the framing — the art's centre and
# half-extents as fractions of the square the sprite is drawn into. The policy
# that turns those into a zoom and an offset lives in trainer-license.html
# (boxSpriteFrame), so it can be retuned without regenerating this file.
#
# Usage: tools/make-sprite-frames.py /path/to/a/checkout/of/main
#        tools/make-sprite-frames.py /path/to/main --report
#
# --report prints the sprites whose soft-edge trim moved the measurement most,
# so they can be eyeballed, and writes nothing.

import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit("needs Pillow and numpy: pip install pillow numpy")

SETS = {"Home": "HomeSprites", "Book": "BookSprites", "Box": "BoxSprites"}

# Alpha at or below this is background. Low enough to keep antialiased edges,
# high enough to ignore the near-transparent fringe PNG compression leaves.
ALPHA_FLOOR = 16

# Home renders and Book illustrations carry drop shadows, glows and wisps that
# reach well past the subject; taking the outright bbox of those frames the
# Pokemon itself too small. Discarding the outermost fraction of *painted mass*
# per axis ignores them, because a shadow is a handful of pixels per column
# where the body is hundreds. Box art is hard-edged pixel work with no such
# fringe — measured across all 1354, a trim moves nothing — so it takes none.
TRIM = {"Home": 0.004, "Book": 0.004, "Box": 0.0}

# Sprites where the measurement is wrong and a hand value is better. Keyed
# "Set/filename.png" -> [cx, cy, hw, hh] in the same units as the output.
# Empty by design: add an entry only when a specific sprite looks wrong in the
# app, and say why.
OVERRIDES = {}


def span(counts, trim):
    """First and last index holding art, ignoring `trim` of the mass each end."""
    total = counts.sum()
    if total == 0:
        return None
    if trim <= 0:
        nz = np.nonzero(counts)[0]
        return int(nz[0]), int(nz[-1])
    c = np.cumsum(counts)
    return int(np.argmax(c > total * trim)), int(np.argmax(c >= total * (1 - trim)))


def measure(path, trim):
    """Art centre and enclosing radius, as fractions of the square it is drawn into.

    The <img> is object-fit: contain, so the canvas is scaled by 1/max(w, h) and
    centred. Working in those units folds the aspect ratio in, and the runtime
    needs nothing but these three numbers and the size of the well.

    The radius is measured from the silhouette, not from the bounding box. A box
    is the wrong shape to fit into a circle: a Braviary with its wings out has a
    bbox whose corners sit well outside the well even when its width fits, so
    fitting the box still clipped the wingtips. Taking the furthest painted pixel
    from the centre makes the fit exact for whatever shape the sprite happens to
    be, and lets compact subjects sit larger than sprawling ones."""
    with Image.open(path) as im:
        alpha = np.array(im.convert("RGBA"))[:, :, 3]
    h, w = alpha.shape
    mask = alpha > ALPHA_FLOOR
    if not mask.any():
        return None
    sx = span(mask.sum(0).astype(float), trim)
    sy = span(mask.sum(1).astype(float), trim)
    m = float(max(w, h))

    # centre on the trimmed bounding box: stable, and not dragged off by a tail
    cx_px = (sx[0] + sx[1] + 1) / 2
    cy_px = (sy[0] + sy[1] + 1) / 2
    ys, xs = np.nonzero(mask)
    dist = np.hypot(xs + 0.5 - cx_px, ys + 0.5 - cy_px)
    # same soft-edge trim, applied radially: ignore the outermost fraction of
    # painted pixels so a shadow or a glow does not set the radius
    rr = float(np.max(dist)) if trim <= 0 else float(np.quantile(dist, 1 - trim))
    return ((cx_px - w / 2) / m, (cy_px - h / 2) / m, rr / m)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    report = "--report" in sys.argv[1:]
    if len(args) != 1:
        sys.exit("usage: tools/make-sprite-frames.py /path/to/a/checkout/of/main [--report]")
    target = args[0]
    images = os.path.join(target, "app-data", "images")
    if not os.path.isdir(images):
        sys.exit("no app-data/images in %s — is that a checkout of main?" % target)

    out, trims = {}, []
    for name, folder in SETS.items():
        d = os.path.join(images, folder)
        if not os.path.isdir(d):
            sys.exit("missing sprite folder: %s" % d)
        entries, skipped = {}, []
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith(".png"):
                continue
            path = os.path.join(d, f)
            frame = OVERRIDES.get("%s/%s" % (name, f)) or measure(path, TRIM[name])
            if frame is None:            # fully transparent: nothing to frame
                skipped.append(f)
                continue
            if report and TRIM[name] > 0:
                raw = measure(path, 0)
                trims.append((raw[2] - frame[2], name, f))
            entries[f] = [round(v * 1000) for v in frame]
        out[name] = entries
        note = "  (%d fully transparent, skipped)" % len(skipped) if skipped else ""
        print("%-5s %5d sprites%s" % (name, len(entries), note))

    if report:
        trims.sort(reverse=True)
        print("\nsoft-edge trim, largest effect first (radius, fraction of the well):")
        for delta, name, f in trims[:25]:
            print("  %-5s %-40s -%.3f" % (name, f, delta))
        print("\n--report: nothing written")
        return

    dest = os.path.join(target, "app-data", "sprite-frames-db.js")
    body = []
    for name in SETS:
        rows = ",\n".join('        "%s": %s' % (f, json.dumps(v, separators=(",", "")))
                          for f, v in sorted(out[name].items()))
        body.append('    "%s": {\n%s\n    }' % (name, rows))

    with open(dest, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(HEADER + "const SPRITE_FRAMES = {\n" + ",\n".join(body) + "\n};\n")
    print("\nwrote %s (%.0f KB)" % (dest, os.path.getsize(dest) / 1024))
    print("regenerate with tools/make-sprite-frames.py whenever the sprite packs change")


HEADER = """/* Generated by tools/make-sprite-frames.py on the dev-data branch — do not edit by hand.

   Where the art sits inside each sprite, so PC storage can frame every Pokemon
   individually instead of applying one zoom to a whole set. Three numbers per
   sprite, in thousandths of the well it is drawn into, measured after
   object-fit: contain (so the canvas aspect ratio is already folded in):

       [cx, cy, rr]   centre offset from the middle of the well, then the
                      radius of the smallest circle around that centre that
                      holds the whole silhouette

   A radius, not a bounding box, because the well is round: a sprite with its
   wings out has bbox corners outside the circle even when its width fits.
   Scaling so that rr lands just inside the well fits any shape exactly.
   Turning that into a zoom and an offset is boxSpriteFrame() in
   trainer-license.html, not this file — the policy is meant to be tunable
   without remeasuring.

   Keys are the sprite filename, which is the Pokedex's `Image` field and is
   the same across all three sets. A sprite missing here (a species with no
   local copy, which the app fetches from GitHub instead) falls back to the
   per-set defaults in BOX_SPRITE_FRAME. */

"""


if __name__ == "__main__":
    main()
