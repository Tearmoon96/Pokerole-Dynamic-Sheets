# Map Maker art: where each picture goes

The Map Maker draws a placeholder (a coloured disc with an icon) for every
landmark until a picture exists for it. A picture is linked by its **file name
alone**: drop a PNG with the right name into the right folder and it appears
on the next reload. There is no list to edit.

## Folders

All under `PDS React Develop/app-data/images/MapSprites/`:

| Folder | Used by |
|---|---|
| `HandDrawn/` | the Hand-drawn style |
| `Anime/` | the Anime style |
| `TownMap/` | the Town Map style |
| `Overworld/` | the Overworld style |
| `Common/` | every style that has no picture of its own for that name |

For each landmark the page tries the current style's folder first, then
`Common/`, then draws the placeholder. So one picture in `Common/` covers all
four styles, and a style-specific one overrides it for that style only.

The **Sprite checklist** button in the Map Maker's top bar (the images icon)
lists every file name against every folder and ticks the ones it found.

## Making the pictures

- PNG with a transparent background, **square**, the subject centred.
- Hand-drawn, Anime, Town Map: about 256×256.
- Overworld: pixel art at 16, 32 or 64 px square. It is scaled up with
  smoothing off, so every pixel stays sharp.
- A terrain texture is **one cell** of a seamless tile, and it replaces that
  terrain's colour and pattern in that style.

A Pokémon token needs no art: it uses the Shuffle token sprite already in
`app-data/images/ShuffleTokens/`, or the Box sprite in a round frame for the
species that have no Shuffle token.

## Publishing the pictures

`app-data/` is tracked on `main`, not on `dev-source`, so commit the PNGs
to `main` under `app-data/images/MapSprites/`. The fresh-clone restore then
picks them up. `npm run deploy` already publishes every image under
`app-data/images/`, so nothing needs adding to the allowlist.

## File names

The names are fixed. A saved map refers to a landmark by this name, so renaming
one would orphan both its picture and every stamp of it on every map.

### Nature

| Landmark | File |
|---|---|
| Mountain | `mountain.png` |
| Mountain range | `mountain-range.png` |
| Hill | `hill.png` |
| Volcano | `volcano.png` |
| Forest | `forest.png` |
| Woods | `woods.png` |
| Jungle | `jungle.png` |
| Grassland | `grassland.png` |
| Flower field | `flower-field.png` |
| Tall grass | `tall-grass.png` |
| Flower field | `flower-field.png` |
| Giant tree | `giant-tree.png` |
| Desert | `desert.png` |
| Oasis | `oasis.png` |
| Badlands | `badlands.png` |
| Canyon | `canyon.png` |
| Swamp | `swamp.png` |
| Frozen tundra | `frozen-tundra.png` |
| Glacier | `glacier.png` |
| Lake | `lake.png` |
| Sea | `sea.png` |
| Waterfall | `waterfall.png` |
| Island | `island.png` |
| Beach | `beach.png` |
| Cave | `cave.png` |
| Rock formation | `rock-formation.png` |
| Geyser | `geyser.png` |

### Settlements

| Landmark | File |
|---|---|
| City | `city.png` |
| Town | `town.png` |
| Village | `village.png` |
| Medieval city | `medieval-city.png` |
| Castle | `castle.png` |
| Tower | `tower.png` |
| House | `house.png` |
| Farm | `farm.png` |
| Windmill | `windmill.png` |
| Port | `port.png` |
| Lighthouse | `lighthouse.png` |
| Bridge | `bridge.png` |
| Camp | `camp.png` |
| Mine | `mine.png` |
| Temple | `temple.png` |
| Shrine | `shrine.png` |
| Ruins | `ruins.png` |

### Pokémon

| Landmark | File |
|---|---|
| Pokémon Center | `pokemon-center.png` |
| Poké Mart | `poke-mart.png` |
| Gym (takes a type badge) | `gym.png` |
| Pokémon League | `pokemon-league.png` |
| Pokémon Lab | `pokemon-lab.png` |
| Day Care | `day-care.png` |
| Safari Zone | `safari-zone.png` |
| Battle Tower | `battle-tower.png` |
| Contest Hall | `contest-hall.png` |
| Berry tree | `berry-tree.png` |
| Team hideout | `team-hideout.png` |
| Power plant | `power-plant.png` |
| Radio tower | `radio-tower.png` |
| Ferry | `ferry.png` |
| Game Corner | `game-corner.png` |
| Museum | `museum.png` |
| Trainer school | `trainer-school.png` |
| Route gate | `route-gate.png` |
| Legendary shrine | `legendary-shrine.png` |

### Map furniture

| Landmark | File |
|---|---|
| Compass rose | `compass-rose.png` |
| Signpost | `signpost.png` |
| Flag | `flag.png` |
| X marks the spot | `x-marks-the-spot.png` |
| Danger | `danger.png` |
| Point of interest | `point-of-interest.png` |
| Campfire | `campfire.png` |

### Markers

| Marker | File |
|---|---|
| Trainer token | `trainer.png` |
| Wild Pokémon token | `wild-pokemon.png` |

### Terrain textures (optional)

| Terrain | File, in `<Style>/terrain/` |
|---|---|
| Clouds | `clouds.png` |
| Deep sea | `deep-sea.png` |
| Sea | `sea.png` |
| Shallows | `shallows.png` |
| Lake | `lake.png` |
| River | `river.png` |
| Swamp | `swamp.png` |
| Beach | `beach.png` |
| Grassland | `grassland.png` |
| Flower field | `flower-field.png` |
| Tall grass | `tall-grass.png` |
| Forest | `forest.png` |
| Jungle | `jungle.png` |
| Desert | `desert.png` |
| Badlands | `badlands.png` |
| Tundra | `tundra.png` |
| Snow | `snow.png` |
| Mountain | `mountain.png` |
| Snow mountain | `snow-mountain.png` |
| Volcanic | `volcanic.png` |
| Cave floor | `cave-floor.png` |
| Road | `road.png` |
| Town paving | `town-paving.png` |
