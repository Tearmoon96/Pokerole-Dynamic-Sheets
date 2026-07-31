# Sprite framing — measurements and what they ruled out

Working notes behind `tools/make-sprite-frames.py` and the `boxSpriteFrame()` block in
`trainer-license.html`. Kept because the Box set was tried, measured and **withdrawn**, and
without the numbers the next person will simply try it again.

Everything here was measured, not estimated — over all 3775 sprites unless stated.

---

## The problem

PC storage draws each Pokémon in a round well, 62px across (60px inside the border). It
used to frame them with **one scale per sprite set**, which assumes every sprite in a set
fills its canvas the same way. They do not:

| set | canvas | art fills its canvas | spread |
|---|---|---|---|
| Home | 512×512 (a few 256/128) | 0.66 – 0.99 | 1.5× |
| Book | 173–600px, varies | 0.45 – 1.00 (p10 already 0.92) | 2.2× |
| Box  | 68×56, all of them | **0.21 – 1.00** | **4.8×** |

At a flat 2×, **572 of 1354 Box sprites rendered wider than the circle** — Venusaur at
1.61 of the radius, Wailord 1.88, Onix 1.46 — while Pikachu sat at a correct 0.79.

## Why it has to be precomputed

The app runs from `file://`, where a local image taints the canvas and `fetch` is refused:

```
getImageData: SecurityError: The canvas has been tainted by cross-origin data.
fetch:        Failed to fetch
```

So the app can never measure its own sprites. `make-sprite-frames.py` measures them once
and ships the numbers in `app-data/sprite-frames-db.js`.

## What is measured

Three numbers per sprite, in thousandths of the square the canvas is drawn into:
`[cx, cy, rr]` — the art's centre offset, then the **radius of the smallest circle around
that centre holding the whole silhouette**.

A radius, not a bounding box. A box is the wrong shape to fit into a circle: fitting the
bbox still clipped Rotom by 3.72% and Bombirdier by 1.75%, because a bird with its wings
out has bbox corners outside the well even when its width fits. Switching to the silhouette
radius dropped the worst case to **0.32%** with a median of **0.00%**.

**Soft edges are trimmed on Home and Book only** — the outermost 0.4% of painted mass per
axis. 247 Home and 220 Book sprites have shadows, glows or wisps that otherwise set the
radius and frame the subject too small; the largest effect is Cascoon and Silcoon (silk
threads), Volcarona and Eiscue (glow). Box art is hard-edged and measured 0 affected, so it
takes no trim. The residual ~0.3% of pixels outside the circle on Home/Book is this trim by
construction, not an error.

## Why the Box set was withdrawn

Box art is 68×56 pixel art. To stay crisp it can only be scaled by an **exact pixel ratio**
— a whole number, or 1/n — otherwise source pixels land on fractional boundaries and blocks
come out two different widths, which reads as noise rather than as pixel art.

Those ratios are a factor of two apart. The well's usable size range is narrower than that.
So there is no setting at which the whole set looks right, and every policy tried traded one
complaint for another:

| policy | result |
|---|---|
| flat 2×, native size | 572/1354 wider than the circle (Venusaur 1.61) |
| exact ratios only, band [0.62, 0.97] | nothing clipped, but **354 sprites below 0.62** — Ponyta 0.49, Mega Venusaur 0.53, next to sprites at 0.9 |
| exact when it lands in [0.75, 1], else fit to 0.94 and smooth | sizes 0.75–1.00 (spread 1.33×), 48% still crisp — but half the set is no longer pixel-crisp |
| the above, capped at 2× crisp / 1.4× soft | never over-magnified, but the small art returns: **306 below 0.62**, smallest 0.31, spread 3.21× |

Two boundary effects worth remembering, both real:

- A hard ceiling makes the outcome **hypersensitive at the edge**. Ponyta's 2× lands at
  0.9714 of the radius; against a 0.97 ceiling it missed by a thousandth and fell to 1×,
  i.e. half size, for no visible reason.
- Native sizing makes the zoom **absolute**, not proportional to the well. The same sprite
  in a 52px well and a 62px well lands on different whole numbers — Houndoom took 2× in the
  grid and 1× in the strip, the identical Pokémon 40% smaller one row down. The two wells
  were made the same size to kill this, and must stay that way.

There is also a rendering trap: sizing the image to the well first (`object-fit: contain`,
68→60) and magnifying afterwards **destroys pixels** — nearest-neighbour downscaling drops
whole rows and columns, and the zoom then enlarges the loss. Measured on Pikachu, 50 of 353
painted pixels differed through the fit-first path. Native sizing was required to avoid it.

**Conclusion:** with 68×56 source art in a 60px round well there is no policy that is
simultaneously crisp, correctly sized and uncropped across 1354 sprites. Home and Book have
no such constraint — they are high-resolution, so a fractional zoom costs nothing, and every
sprite sits at exactly 0.94 of the radius.

### If it is ever tried again

- The measurements for Box are still in `sprite-frames-db.js`; the generator emits all three
  sets. Nothing needs regenerating.
- `BOX_SPRITE_CYCLE` in `trainer-license.html` is the only gate. Adding `'Box'` back makes it
  selectable immediately, framed like Home and Book — contained in the well, fitted to 0.94,
  fractional zoom, smoothed. That is *correct* and *uncropped*; it is simply not pixel-crisp.
- Making it crisp again means restoring native 68×56 sizing, `image-rendering: pixelated`,
  and an exact-ratio policy — and re-inheriting the table above. Larger wells would help:
  the conflict is between a 68px canvas and a 60px well, and it eases as the well grows.

## Bad source art

`SPRITE_SET_BLOCKED` in `trainer-license.html` and `pokemon-card.html` lists sprite files
that are not the Pokémon they claim to be:

- `BookSprites/egg.png` is a **byte-for-byte copy of `exeggutor-alolan-form.png`** (same
  MD5, `88cc8a14146fb2edfdd3a27500592db0`). The egg renders as a palm tree. Deleting the
  file does not help — every sprite path falls back to the same dataset on GitHub, which
  carries the identical copy.
- `ShuffleTokens` has no `egg.png` at all.

Both are upstream dataset problems, so the app simply does not offer those sets for that
species and substitutes Home.

## Regenerating

```sh
tools/make-sprite-frames.py /path/to/a/checkout/of/main            # writes the bundle
tools/make-sprite-frames.py /path/to/main --report                 # show the soft-edge trim
tools/make-sprite-test.py   /path/to/a/checkout/of/main            # throwaway review page
```

`make-sprite-test.py` writes `test.html` into the main checkout: every Pokémon, one row
each, with its sprites in the real PC-storage well and the chosen zoom under each. It lifts
the CSS and the whole `boxSpriteFrame()` block verbatim out of `trainer-license.html`, so it
cannot drift from what the app does. `test.html?q=charizard` filters. Delete it when done —
it is a review tool, not part of the app.

Both generators are deterministic: same inputs, byte-identical output.
