# WEB_RIVERS: L1 water and its L2 crossings (rivers, washes, canals, lakes, bridges, culverts, fords)

**Status:** built 2026-10-23 on `feat/web-rivers` (the content ladder's second rung, after structures:
[WEB_WORLD_EDITOR_PLAN.md](WEB_WORLD_EDITOR_PLAN.md) §3.3). Works on the flat default and with `?terrain=real`
([WEB_TERRAIN.md](WEB_TERRAIN.md)). The Phoenix island's own river, lake, bridge and dock are untouched (its golden hash
does not move).
**Engine:** the three.js web engine (`web/`, [web/AGENTS.md](../../web/AGENTS.md)); streaming is
[WEB_STREAMING.md](WEB_STREAMING.md), whose P4 line "rivers and bridges" this delivers for the I-10 corridor.

---

## 1. Overview

Water is layer L1 of the world stack: rows of data, a seeded generator, a validator, selftest checks and photobooth shots.
Bridges, culverts and fords are part of L2 (the network): they are generated wherever a road meets a row of L1.

| Piece | Where | What it does |
|---|---|---|
| The rows | `web/src/data/water.js` | Every knob (§7), the authored rows, the sea hook, `WATER_ROWS` (baked + authored), and `validateWater(rows, ctx)` (the World Forge's water tab calls it). |
| The baked rows | `web/src/data/water/i10.json` (125 KB) | 23 river, wash and canal runs (211 km of channel) and the Salton Sea along the I-10 corridor, from USGS hydrography. One JSON file per region: Florida's goes beside it. |
| The bake | `web/tools/water-bake.mjs` (+ `web/tools/strip-map.mjs`) | Fetches the USGS NHD flowlines and waterbodies, maps them onto our road through the terrain's strip map run backwards, writes the rows and `docs/renders/web/rivers/l1-water-map.svg`. Cache: `web/.water-cache/` (gitignored). |
| The engine | `web/src/world/rivers.js` | `Rivers`: the rows resampled every 8 m and bucketed per 256 m chunk; `sample(x, z)` (depth, the carved bed, the floor movers stand on, the surface); `depthAt(x, z, y)` THE water authority past the island, with two sources (L1 rows, and a region's own water: §3.6); `plan(W)`: every crossing classified and built. |
| Wiring | `world/worldindex.js`, `world/chunkgen.js`, `world/streamer.js`, `world/pools.js`, `world/water.js` | The ground is carved, a water sheet and wash beds drawn per chunk (one new surface layer), nav tiles block deep water, the mainline is lifted over its decks, heightAt reads the water's floor, the island's `Water` hands over past \|x\|,\|z\| 464. |
| The agent | `web/src/agent/water-api.js`, `water-selftest.js` | `water`, `rivers`, `bridges`; ten selftest checks. |

**What is in the corridor now** (flat default; `bridges`):

| Mile | Crossing | Kind | Deck length / lift | Under it |
|---|---|---|---|---|
| 1.1 | SAN GABRIEL RIVER BRIDGE | deck | 92 m / 2.9 m | a concrete flood channel, 1.4 m of water |
| 4.1, 6.3, 7.1 | SANTA ANA, SAN GORGONIO, WHITEWATER WASH | culvert | - | dry sand washes |
| 16.4 | COLORADO BRIDGE | deck | 146 m / 5.1 m, 5 piers | THE COLORADO, 44 m wide, 3.4 m deep (and its ford 1.2 km downstream) |
| 20.0, 20.2, 21.0, 32.2 | AQUEDUCT BRIDGE (x3), AQUEDUCT & CENTENNIAL WASH BRIDGE | deck | 84-153 m / 2.9 m | the Central Arizona Project canal, 2.8 m deep, steep concrete sides |
| 23.6, 28.1, 32.8, 35.1, 40.4 | HASSAYAMPA, GILA, RILLITO, CIENEGA, SAN SIMON | culvert | - | dry washes |
| 36.1 | SAN PEDRO RIVER BRIDGE | deck | 90 m / 5.1 m | a shallow living river, 1.1 m (wadeable; ford downstream) |
| 48.8 | RIO GRANDE BRIDGE | deck | 106 m / 5.1 m | the Rio Grande at Las Cruces, 2.6 m (and its ford) |
| exit 2's access road | COLORADO BRIDGE | deck | 116 m / 5.1 m | the Colorado again: the road to FURNACE MILE 9 crosses it |

With real terrain on, the land under the road is real, the road profile rides on fills and vertical curves, and every one
of these crossings is a deck over a gorge (5-14 m drops: §3.4).

**Sources** (public domain; every byte in `web/.water-cache/manifest.json` and in the rows' `meta.sources`):

| Source | Used for | Licence |
|---|---|---|
| **USGS National Hydrography Dataset (NHD)**, via The National Map's ArcGIS service (`hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer`): flowlines (layer 4, small scale; layer 6, large scale, for the CAP aqueduct) and waterbodies (layer 10) | where every river, wash, canal and lake runs | Public domain (U.S. Geological Survey). Credit: "National Hydrography Dataset, U.S. Geological Survey". |
| **TIGER/Line 2023 Primary Roads**, U.S. Census Bureau | where the real I-10 runs (the strip map); reused from `.terrain-cache` when the terrain bake has it | Public domain |

19 NHD queries, 0.6 MB; TIGER 36.5 MB (once). Natural Earth's 10 m rivers (public domain) were checked as an alternative:
they carry the big rivers but none of the washes, so NHD won.

## 2. Player Fantasy

*Two hours of desert, and then the road climbs onto a fill and the parapets come up beside you: the Colorado, wide and
brown-green under the twin spans, a gap between them where you can see the water move. You pull off at FURNACE MILE 9 and
the access road crosses it again. A mile downstream a gravel bar brings the river up to your knees: you can wade it, or
take the truck across at a crawl in a sheet of spray. Push a car off the bank anywhere else and it floods and goes down.*

*East of Phoenix the washes are dry: pale braided sand cut a metre and a half into the desert, mesquite and paloverde
along the lip, cobbles in the bed. The interstate crosses them on culverts; the county roads dip through them. With the
real land under you, the same washes are canyons, and the interstate leaps them on viaducts.*

Robert's calls this serves: **Water = boats, the need, swimming** (all three: a river you can swim and dive in, a river you
can boat on, a river that is the reason a crossing matters); **real terrain, found online** (every channel is a real one
from USGS data, in the valley the real land puts it); **bridges you can blow** (each deck has hit points and a state,
the hook the destruction system will write).

## 3. Detailed Rules

### 3.1 L1: the rows
- A **river / creek / canal / wash** is a polyline in flow order with a game width `w` and a depth `d` (water at the
  centre; a wash has none and a `bed`, the dry channel's depth below its banks). Per-point overrides `[x, z, w, d]`;
  `fords: [{ i, d, len }]` put a gravel bar at point `i`.
- A **lake / reservoir / playa** is a ring with a depth `d` and a `shelf` (depth gained per metre from the shore). A playa
  is dry.
- **The sea** is a level and coastline polygons (`SEA`, off for I-10): the hook Florida's coast drops into.
- **Widths and depths are gameplay metres**, not compressed: the world compresses distance 14-17 times but not heights,
  and not water (a boat is 2.6 m tall, a car must be able to drown).
- **Clear zones:** water never stands inside Phoenix's pad (2.6 km: the island and the ring keep their own water), within
  950 m of a built town or 420 m of an interchange or its community. A channel fades to nothing over the last 150 m before
  a zone (its width, depth and bed all go to 0): the town stands on dry ground.

### 3.2 L1: the ground and the water
- **The channel is carved into the ground** (flat or real). A wet channel's surface `Y` sits `drop` below the land
  (river 1.2 m, canal 1.6, creek 0.7, lake 0.6); its bed shelves linearly from the water's edge to full depth over
  `max(3 m, 0.45 · half-width)`, then flattens; a canal drops at its concrete walls. The bank rises from the water's edge at
  `bankRun` (river 1:5). A wash's bed is flat at `bed` below the land, its banks at 1:3.5.
- **The surface with real terrain:** the lowest land across the channel, the lowest within ±96 m along it (the valley
  floor, not one fold of the strip map), averaged over ±200 m, minus `drop`. A canal takes the land at its centre (it runs
  on the land's level). A carve never cuts more than 18 m below the land.
- **The query** `sample(x, z)` answers, allocation-free: the water depth, the carved bed (`bedRel`, for drawing), the floor
  a mover stands on (`floorRel`: a wash's bed; in water the surface minus half the depth, at most 0.45 m, while wading, the
  surface itself once swimming), the surface, which body, the signed distance from the water's edge.
- **depthAt(x, z, y)** is THE water authority past the island (world/water.js hands over at \|x\|,\|z\| > 464): 0 on dry
  land, 0 on a bridge deck for someone up on it (y above the deck top - 2.2) or when y is not given (the 2-D question, as on
  the island), 0 inside a culvert's fill. Wading, swimming, diving, drowning, flooding cars, boats, the infected's refusal,
  nav tiles and fords all read it.
- **Drawn:** the chunk's 8 m ground grid is cut to the bed (normals from the cut ground; near water each cell splits along
  its flatter diagonal so the shoreline follows the bank, not the grid). A water sheet on the same grid sits at the surface
  wherever a cell has water at a corner or next to one: where the cut bank stands above it, the ground hides it, so the
  shoreline is the bank's own contour. Its colour is worked out per pixel from (signed metres from the edge, depth): a crisp
  foam line at the edge, shallow to deep muddy green-brown at 4 m. Ripples scroll downstream at `flow` (UV v = metres along
  the river). A dry wash's bed is a strip at its own level in the same layer: pale braided sand, gravel speckle, a dark lip
  where the bank comes up through it, no shine. Brush lines a wash, mesquite thickets a river's banks; a ford's banks are
  kept clear (the way across).
- **One draw call** per hot chunk that has water (the layer is empty, and invisible, everywhere else); the material is
  compiled with the others at boot.
- **Nav:** walkers do not plan through water deeper than 1.2 m, drivers through more than `ford`; a cell takes the deepest of
  its 4 m lattice corners (a route never grazes deep water at a cell's edge). A deck is dry ground there.

### 3.3 L2: crossings
For every road (the interstate's centreline; every county road and street ribbon) and every body it meets:
1. **Measure** the crossing along the road: walking out from the intersection in 2 m steps across the road's width, the
   stretch where there is water (> 5 cm), a cut channel or bank (> 0.3 m), or ground more than `gorge` below the road's own
   level. Record the deepest water and the biggest drop.
2. **Decide:** water deeper than `ford`, or a drop deeper than `gorge` -> a **DECK**. Otherwise a dry wash under the
   interstate -> a **CULVERT**. Otherwise (a county road over a wash, shallow water anywhere) -> a **FORD**.
3. **A deck** runs from `approach` before the measured stretch to `approach` after it. Its top is the road's own level plus
   `lift`, where lift = max(0, water surface + clearance + deckThick - road) (0 over a dry gorge). The approach fills climb on
   a smoothstep at most `rampGrade`, then run on under the deck end as a 2:1 spill-through slope (the abutment's seat on top).
   On the interstate it is twin spans with the median open between them (the river shows through). Parapets on every edge
   (solid, floating: they stop someone on the deck, not a boat under it); a pier bent every `span` (a cap beam under the
   slab, columns at the edges and the median, standing on the carved bed: solid to boats and swimmers); W-beam guardrails
   along the fills where they stand taller than `railH`. Movers: on the deck if already up near it (WorldIndex `rampAt`,
   kind `deck`), on the fills always, in the river under it otherwise. A deck over a deck's overlap (a confluence, the
   aqueduct beside a wash) merges into one.
4. **A culvert** keeps the road's fill whole over the wash (the carve and any water suppressed within the road's footprint
   plus `culvertMargin`); concrete headwalls either side with the pipes' dark mouths.
5. **A ford** leaves the carve under the road: the road paint and the ground both dip through it, white depth posts each
   side.
6. **Formation guards:** wherever a channel or a lake's shore comes near the interstate and no deck spans it, the road bed is
   kept (culvert-like records, 160 m each), so a wash running beside the road never undercuts the shoulder.
7. **Interchange pieces** (ramps, the cross road over the interstate) are never crossed: the clear zones keep water off
   them; if a row ever did, the plan leaves it at grade and lists it in `bridges` warnings.
8. Signs are moved off a deck and its fills toward the traffic they are for; mileposts there are left out; no wreck is left
   on a deck, no power pole stands in a river.

### 3.4 With real terrain
The same rows, the same rules: `Streamer.setTerrain` hands the land to `Rivers.setGround` and plans L2 again before any
chunk is laid out. The road profile (WEB_TERRAIN T4) rides on fills and vertical curves, so at every crossing the land is
5-14 m below the road: every crossing becomes a deck (a viaduct over the gorge the carve cuts through the fill), most at
lift 0 (the road's own level over a dry gorge).

### 3.6 One authority, two sources (merged with Florida, 2026-10-23)
- `world/water.js` EXT.depth = `WorldIndex.depthAt` = `Rivers.depthAt(x, z, y, ignoreDeck)`: a deck holds the asker, else the deeper of
  **L1** (`sample()`: this doc's rows) and **the region** (`W.regionDepth` = world/regions.js `makeDepthAt`: a region chunk's 4 m grid,
  else `regionWater`). `waterDepth()` (the standalone), `Water.depthAt/stateAt/surfaceAt`, vehicles, the AI and both nav rasters all read it.
  A region's surface is its flat ground (0); L1's is its own `Y`.
- **One water layer** per chunk (`pools.js` LAYERS.water, one `SURF.water` buffer, one material: `world/water.js` streamMat). The
  vertex colour's blue picks the mode: 0 river, 0.2 lake (calmer), 0.4 + kind/100 a region's swamp, canal, lagoon or sea (shallow to
  deep from `WATER.colour.region`, as Florida painted it per vertex), 1 a dry wash's bed. A region chunk writes its 4 m marching-squares
  sheet, an L1 chunk its 8 m sheet and wash strips; a chunk in both would write both into the same buffer.
- Names: a region's 4 m grid size stays `WG` (chunkgen) and its grid `L.water`; L1's 8 m grid is `LW` and its stats `L.l1water`.

### 3.5 Boats, swimming, cars
- **Boats** (the airboat, the waterbike, the raider gunboat) float on the streamed water's own surface (world/water.js
  `surfaceAt`), bob, and beach where depth drops under their draft; under a deck they are in the river (depthAt asks with y
  = -Infinity for a hull). No new boat was needed.
- **Swimming / wading / diving** are the island's rules (depth > 0.25 wade, > 1.3 swim, Ctrl dives) on the streamed floor:
  a wader stands in the water, a swimmer at the surface.
- **Cars:** depth > 0.15 (a ford) drags the wheels (forward speed decays at 2.2·depth per second, power x (1 - 0.6·depth))
  and throws spray; > 0.55 drags harder; > 1.1 floods the engine and sinks the car after 5 s. A sunk car settles 1.7 m
  below where it went down (it used to sink to an absolute -1.7, which the terrain's heights broke).

## 4. Formulas

**W1. Crossing decision** (per road-body intersection, measured over the road's width):
```
deck     if  maxDepth > ford                          (water a car may not drive through)
         or  maxDrop  > gorge,  maxDrop = road - (G0 + bedRel)   (ground under the road more than gorge below it)
culvert  else if the body is dry and the road is the interstate
ford     otherwise
```
**W2. Deck geometry:**
```
s0, s1  = (first, last s where the road's width meets water, a cut, or a gorge) -/+ approach
lift    = max(0, Y_surface + clearance(kind) + deckThick - road)          (0 over a dry gorge)
ramp    = max(20, 1.5 · lift / rampGrade)      (a smoothstep's steepest slope is 1.5 · lift / ramp)
piers   = round((s1 - s0) / span) - 1          rails where the fill > railH
```
**W3. The channel profile** (half-width h, signed distance from the centre u, depth at the centre d, shelf s):
```
s       = max(3, 0.45 h)
depth   = d · min(1, (h - |u|) / s) · (1 - 0.15 (u/h)^2)       |u| < h   (canal: d · min(1, (h - |u|)/1.5))
ground  = Y - depth                                            |u| < h
        = Y + (|u| - h) / bankRun                              |u| >= h    (never above the land, never 18 m below it)
floor   = Y - min(0.45, depth / 2)  while depth < 1.3;   Y once swimming;   the ground where dry
```
**W4. Worked example: the Colorado at I-10** (flat default). w = 44 m (h = 22 m), d = 3.4 m, drop 1.2 m, so Y = -1.2 and the
bed at the centre is -4.6 m. The road meets it at 61°: the wet stretch along the road is 44 / sin 61° = 50 m plus the banks
(1.2 m at 1:5 = 6 m each side) -> 86 m measured; with `approach` 30 m each end the deck is 146 m. lift = -1.2 + 5.2 + 1.1 - 0
= 5.1 m; ramp = 1.5 · 5.1 / 0.04 = 191 m each side; 146 / 24 -> 6 spans, 5 pier bents. A boat 2.6 m tall at the surface
(-1.2) clears the slab's underside (5.1 - 1.1 = 4.0 m) by 2.6 m. A car at 46 m/s over the crest of the fill: a smoothstep
of 5.1 m over 191 m has curvature 6 · 5.1 / 191² = 8.4e-4 per metre, v² κ = 1.8 m/s², under g: it never leaves the road.

## 5. Edge Cases

- **A river through a town, Phoenix or an interchange:** it fades out over 150 m and is dry inside the zone (the LA River in
  Los Angeles, the Salt and Agua Fria in Phoenix's pad, the Rio Grande at El Paso). `rivers` lists each as a note; the
  validator with `{ towns, exits }` reports it.
- **Two channels at one crossing** (the CAP aqueduct beside Centennial Wash): one deck spans both, named for both.
- **A channel beside the road, not across it:** the formation guard keeps the road bed; the carve and the water stop at the
  guard's edge (the channel looks like it runs under a low fill there).
- **The median over the water:** the twin spans' gap is open (depthAt there is the river's): a person who walks off the
  median falls in; the nav grid never routes through it.
- **Someone under a deck:** in the river (swimming, a boat) or on the bank under it where the clearance allows; the deck counts
  only for someone already within 2.2 m of its top.
- **A deck at lift 0 over a dry gorge (terrain):** the deck still holds a mover up (WorldIndex `_deck`), even though its
  relief is 0: a car never drops into the gorge through it.
- **Terrain toggled at runtime:** surfaces, beds and the plan are computed again before the chunks are laid out again; the
  mainline is laid again with the new lift; signs move again from their original places.
- **A sample in no chunk with water:** one Map lookup and out (0 everywhere). Chunks with no water lay out byte for byte as
  before (no water layer, no new hash keys).
- **The strip map's folds (0.25% of the band):** a channel's surface takes the lowest land over ±96 m and is averaged, so one
  fold cannot drag a river down a canyon; a carve is capped at 18 m.
- **The dust wall, the bake's band:** rows stop 1.5 km inside the wall and at 6 km off the road (the band). Past the band the
  real country is squashed and a channel there would be distorted.
- **A destroyed bridge (the hook):** `bridges id= hp= state=` set a deck's condition and emit `bridge`; nothing falls yet.
  The materials system decides what `down` means (the deck piece's `deckRel` is the one place to make it stop holding cars).
- **Mismatch with the old usmap rivers:** the Godot-era usmap rows put the Colorado 24.1 km west of Phoenix; the real one,
  through the strip map, is at 16.4 game miles (about 20 km west). The rows win; the usmap rows are no longer read. The AZ/CA
  state-line sign comes from the usmap state grid and does not sit on the river.

## 6. Dependencies

| Doc / system | Needs from rivers | Rivers needs from it |
|---|---|---|
| [WEB_STREAMING.md](WEB_STREAMING.md), `world/streamer.js`, `world/chunkgen.js`, `world/pools.js` | a pure, sliced, bucketed query; one surface layer | chunk layout stages, the surface pool, the pump's slices |
| [WEB_TERRAIN.md](WEB_TERRAIN.md), `world/realterrain.js` | none (it never reads water) | `landAt` (the raw land) for surfaces, `at` (the ground) for carves; the strip map (tools/strip-map.mjs mirrors the bake's) |
| `world/worldindex.js` | heightAt/nearRelief/rampAt read the floor and the decks; the mainline reads `liftAt` | the corridor, sections, exits, towns, ribbons, `clBuckets`, `project` |
| `world/water.js` (the island) | `depthAt`, `stateAt`, `surfaceAt` hand over past the island; the streamed sheet's material lives there | nothing: its own river and lake are untouched |
| `systems/vehicles.js`, `systems/stunts.js`, `main.js`, `systems/ai.js` | cars ask with their y (a deck), boats ride the surface, the player's wet state asks with gy, the AI's wade test works out on the corridor | `depthAt`, `surfaceAt` |
| Florida (`world/regions.js`, WEB_FLORIDA.md) | its sea, lagoon, canals and sloughs answer through the one authority; its sheet is a mode of the one water material | `makeDepthAt` (its 4 m grids) as the region source; L1 rows for Florida rivers go in a `data/water/florida.json` |
| THE WORLD FORGE (another agent) | `WATER_ROWS`, `validateWater(rows, ctx)`, the knobs | a TERRAIN/water tab that edits rows and calls the validator |
| Materials / destruction (another agent) | each deck's `hp`, `hpMax`, `state` and the `bridge` event | what a blown deck does |
| `agent/api.js` | `water` (replaces the island-only row, same answers there), `rivers`, `bridges`; the checks run before devtools' | `C`, `check`, `need` |

- **WEB_WILDS** (`systems/outdoors.js waterKind`) asks this authority what water is where to fish it (depth >= 0.45 m to cast; the body's kind picks the fish) and where a fish trap or net may sink.

## 7. Tuning Knobs

All in `web/src/data/water.js` (WATER).

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `ford` | 0.6 m | 0.4-0.8 | deeper water under a road makes a deck; car nav blocks deeper water |
| `gorge` | 4 m | 3-8 | ground this far under the road makes a deck (terrain) |
| `span` | 24 m | 16-40 | pier spacing |
| `approach` | 30 m | 12-60 | deck past the water's edge / gorge lip each end |
| `railH` | 1.0 m | 0.6-1.5 | guardrails on fills taller than this |
| `clearance` | river 5.2, canal 3.4, creek 2.6 | ≥ a boat (2.6) | a deck's underside over the water |
| `deckThick` | 1.1 m | 0.8-1.6 | the slab |
| `rampGrade` | 0.04 | 0.03-0.06 | approach fill steepness (and its length) |
| `deckHp` | 2400 | - | a deck's hit points (the destruction hook) |
| `culvertMargin` | 6 m | 4-12 | the culvert's fill past the paved edge |
| `fordOff`, `fordDepth` | 1200 m, 0.38 m | -, < ford | where the bake puts a river's ford and how deep it is |
| `drop` | river 1.2, canal 1.6, creek 0.7, lake 0.6 | 0.3-3 | water surface below the land |
| `bankRun` | river 5, canal 1.2, creek 4, wash 3.5, lake 6 | ≥ 1 (≥ 3 reads on the 8 m grid) | bank slopes |
| `wadeSink`, `swimDepth` | 0.45 m, 1.3 m | 0.3-0.6, = world/water.js | where a wader's feet are; swimming |
| `colour` | deep `#323627` … foam `#cbbf9f`, wash bed `#b39d79`, lip `#76593e` | no hue 270-320 | the water and the wash beds |
| `washTint`, `washBank`, `bankTint`, `playaTint` | see file | no purple | ground tints near water |
| `flow` | 0.9 m/s | 0.3-2 | ripple speed downstream |
| `phoenixClear`, `townClear`, `exitClear`, `wallClear`, `bakeBand`, `minRun` | 2600, 950, 420, 1500, 6000, 300 m | - | where water may stand; what the bake keeps |
| bake tables (`RIVERS`, `LAKES` in tools/water-bake.mjs) | 18 rivers, 1 lake | - | which NHD features, their game width, depth or bed, kind |

## 8. Acceptance Criteria

Run from `web/` with the game up (`DL_URL=http://localhost:<port> node tools/agent.mjs`). Measured 2026-10-23 on this
machine's shared RTX 4090 with other agents' browsers running.

1. **The bake.** `node tools/water-bake.mjs` (warm cache) prints the strip map agreeing with the terrain asset's anchors
   (20000/62089/102393 and 28797/633427/1323578), an inverse round trip under 5 m over 400 points (**measured 0.92 m**), and
   every river's kept km; writes 23 runs and 1 lake. `--offline` reproduces it from the cache.
2. **Valid rows.** `rivers` returns `problems: []` (validateWater with Phoenix's clear zone) and 4 notes (channels faded at
   towns and interchanges).
3. **The authority.** `water` at a dry spot: depth 0, `dry`; mid-Colorado: depth > 0.6, `swim`; on the Colorado deck as a
   car: dry; under it: the river; the island's lake still 7 m (selftest `water: the L1 rows are valid…`).
4. **No crossing missing.** Every 4 m of every I-10 lane, every county road and street point: no water deeper than `ford`
   and no cut channel off a deck; every intersection of a channel with I-10 has a deck spanning it or a culvert at it
   (selftest `water: every road/river crossing…`; measured 17 crossings: 9 decks, 8 culverts).
5. **A car crosses a bridge at speed.** Flat out over the Colorado bridge: never in the water, never airborne, never below the
   deck, over 20 m/s on it (selftest).
6. **A car in deep water stalls and sinks; one on the deck above it is dry** (selftest).
7. **Someone on foot wades a ford, a car fords it:** wade (never swim) bank to bank by moveTo; the car slows to under 80% of its
   entry speed, sprays, and does not flood (selftest).
8. **Nav goes over the bridge:** car and foot routes bank to bank beside the Colorado bridge stay on the deck and out of the
   water (selftest).
9. **Under the deck is the river:** a swimmer there swims; an airboat floats at the surface and runs (> 5 m/s); a lane on
   the deck is dry with the river under it (selftest).
10. **Pure function:** the Colorado bridge chunk hashes the same built fresh sync and sliced; its east and south seams match
    (selftest).
11. **Terrain on:** the Colorado lies more than `gorge` under I-10, and no lane meets water or a gorge off a deck; terrain
    off again (selftest).
12. **Budget:** under 150 draw calls over the Colorado bridge at the widest zoom (selftest); `scenario name=stress` A/B
    against the base build (§9).
13. **Island golden hash** unchanged (`world` `islandMatches: true`, `f0cfcd28`).
14. **Screenshots** from the game camera in `docs/renders/web/rivers/` (§10), looked at.

## 9. Measured (2026-10-23)

- **selftest, full battery, two fresh pages:** 205/208 and 205/208; every `water:` check passed both times. The failures
  were outside this lane and differ run to run: `grapevine` (rush on the third reload) and `recorder` (a walk) fail on the
  base build too (base: 195/198 with `controller`, `grapevine`, `recorder`); `storeys` (stops at gy 0.006, reported 0.01),
  `gunpoint` and `weapon bar` once each.
- **`scenario name=stress`, ABBA x 4 (fresh page per leg, base = 6420c7b7):** base 7.51 ms / 85.5 calls, rivers 7.74 ms /
  85.5 calls (spread 7.1-8.5 ms on a busy shared machine: no difference in draw calls, frame time within noise).
- **Boot:** `Rivers` 20-30 ms, `plan()` about 90 ms (node, warm), so WorldIndex +~110 ms.
- **Chunk layout** with water: 9-25 ms of work in 36-49 slices (a dry chunk 7.7 ms); `sample()` 0.7-0.8 µs.
- **Island golden hash** `f0cfcd28` = golden, `islandMatches: true`, flag off and after terrain on/off.

## 10. Renders

`docs/renders/web/rivers/`: `colorado-bridge.jpg` (the Colorado and its twin spans from above, game camera tilt),
`colorado-bridge-low.jpg`, `wash-culvert.jpg` (the Hassayampa's dry wash under I-10), `wash-bed-low.jpg`,
`colorado-ford.jpg`, `riverbank-night.jpg`, `san-pedro-bridge.jpg`, `terrain-colorado-viaduct.jpg`,
`terrain-hassayampa-viaduct.jpg`, `salton-sea.jpg`, and `l1-water-map.svg` (the corridor with every channel).
