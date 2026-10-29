# WEB_SITES_TERRAIN: the 263 site rows in the world, on real land by default, past I-10

**Status:** built 2026-10-28 on `feat/web-sites-terrain`. Real terrain is **ON by default** (`?terrain=flat` is the
escape hatch). The I-10 strip (WEB_TERRAIN.md) is joined by four sheet packs: Florida, the rest of the dust-wall circle
north and south of the strip, and the whole lower 48 at a coarse cell. Every SITE row of the location bible is accounted
for and the city generator plans each on-map row as a hero set-piece.
**Owner of the call:** Robert: "Location data: 251 real Deathlands sites, as data the city generator can stamp... we got a
real world map, right? Like, with canyons, forests... can we, like, not have everything be flat terrain." Then: "Start a
lane that stamps the 251 sites into the generated world and makes real terrain the default, extended past I-10."
**Engine:** `web/` (see `web/AGENTS.md`). Builds on WEB_TERRAIN.md (the strip, the survey, the pads), WEB_CITYGEN.md (the
plan, the stamper), WEB_LOCATION_BIBLE.md §3.1 (the SITE row) and WEB_FLORIDA.md (the start region).

---

## 1. Overview

| Piece | Where | What it does |
|---|---|---|
| The rubber sheet | `web/tools/usmap-proj.mjs` | The atlas projection (quadratic fit through the usmap's 36 real cities plus an inverse-distance blend of their leftovers), without the state law, and its inverse by Newton steps: real lat/lon ⇄ usmap ⇄ world. |
| The sheet bake | `web/tools/terrain-sheet.mjs`, rows `data/terrain.js` `TERRAIN_PACKS`, `DATUM` | Bakes each pack: the DEM at every sample's real place, the datum off, THE GRADE (with the strip held fixed where it touches), Florida's water cut in, life-zone landcover. Same asset format as `i10.bin`. |
| The packs | `web/src/data/terrain/{fl,az-n,az-s,us}.bin` | 0.45 + 1.17 + 1.04 + 3.74 MB (6.4 MB; with `i10.bin` 7.9 MB). |
| The engine | `web/src/world/realterrain.js` | Many land sources (the strip first, then the packs in order), one road survey per corridor (I-10, I-95, I-75), pads for the holdouts and for **every planned settlement and site**, bucketed. |
| The default | `web/src/main.js` | `setTerrain(true)` at boot unless `?terrain=flat`. |
| Sites in the plan | `web/src/systems/citygen.js` `planWorld`, `siteRows`, `stampOf`, `liftBuilt`, `onTerrain` | Every SITE row: planned in the streamed world, planned beyond it, off the map (with the reason) or unplaced. A stamp stands on its pad. |
| The stamp by kind | `web/src/world/citygen/site.js` | A `ruin` row cuts more than half of its non-hero buildings off and open to the sky (the rest as before). |
| For agents | `web/src/agent/sites-api.js` | `sites action=list|near|goto|info`; six selftest checks (§8). |
| Raised ground | `world/storeys.js`, `engine/collision.js`, `systems/interiors.js` | A building's street floor at its pad (`S.y0`), its boxes measured from it, its doors and windows hung at it. |

**Sources.** Elevation only: AWS Terrain Tiles (Terrarium PNG; USGS 3DEP / SRTM / GMTED2010 / ETOPO1, INEGI in Mexico;
attribution as in WEB_TERRAIN §1), fetched once into the gitignored `web/.terrain-cache/` (z9 Florida 136 tiles 10.8 MB,
z10 dust-wall circle 1,008 tiles 64.5 MB, z7 lower 48 264 tiles 17.1 MB). **NLCD's WMS (mrlc.gov geoserver) timed out
from this machine on 2026-10-28** (100 s, even for a 64 px tile; the site's front page answered), so the packs carry the
life-zone landcover of §3.4 and leave the rest to the usmap grid. The raw tiles are never committed: only the bake outputs.

**Coverage (which land is real):**

| Asset | World rectangle (km) | Cell | Real country | Grade |
|---|---|---|---|---|
| `i10.bin` (strip) | x −45.8..46.3, z −21.0..20.2 | 32 m | the I-10 corridor, Los Angeles to past El Paso (strip map) | 10% |
| `az-n.bin` | x −48.1..48.1, z −48.1..−21.0 | 32 m | north of the strip inside the dust wall: the Grand Canyon, the Kaibab, southern Utah and Nevada | 15% |
| `az-s.bin` | x −48.1..48.1, z 20.2..48.1 | 32 m | south of it: Sonora, the sky islands, the head of the Gulf of California | 15% |
| `fl.bin` | x 185.3..234.5, z 19.5..80.4 | 32 m | the Florida region box and 1 km round it | 10% |
| `us.bin` | x −87.2..303.0, z −144.4..76.8 | 128 m | the whole usmap (lower 48): every region holding a SITE row, the Gulf, the Rockies, Appalachia | 15% |

Everything the player can reach today (the dust-wall circle and Florida) is real land at 32 m. `us.bin` is the data the
next regions stream onto; a `sites goto force=true` beyond the world lands on it.

## 2. Player Fantasy

*A new game opens in Florida and the land is not a table: the ground falls away to every lagoon and slough, rises a few
metres onto the sandy ridges between them, and the star fort on the Atlantic side stands level on its own terrace. Out in
Arizona you drive north past the corridor and the country climbs into ponderosa forest; the road ends at a village on a
canyon's lip, and below it the land drops away hundreds of metres in a rock-toned wall. Every place the books walked
through is out there, under our own names, at its real position: some a drive away, most still past the edge of the
streamed world, waiting.*

## 3. Detailed Rules

### 3.1 Sites in the world
- **The anchor.** Each SITE row's real lat/lon is already projected into `data/sites/xz.js` by `tools/sites-project.mjs`
  (the atlas projection with the state law). `null` there means off the usmap (Alaska, Hawaii, Puerto Rico, abroad).
- **The plan.** `planWorld` gives every row a status:
  - `planned`: the anchor lies in the streamed world (P1's 45 km dust-wall circle, the Florida box); the record goes on
    the nearest free ground within 1.5 km, then (a row whose anchor is a built town or the island itself) up to 5 km.
  - `beyond`: the anchor is on the usmap but outside the streamed world: the record stands at its anchor (nudged off any
    other record). Its pad is surveyed on `us.bin`; it stamps when someone gets there.
  - `offmap`: no world position; the `sites` command gives the reason.
  - `island`: the anchor is on the Phoenix island or its ring: the hand-built city is that site.
  - `unplaced`: in the world but no free ground within 5 km (none today).
- **Measured:** 263 rows: 33 planned, 1 island (`phoenix-az`) (all 7 Florida rows on the map, inside the start region), 199 beyond, 30 off the map,
  0 unplaced. Florida's `key-west-*`, `fort-jefferson` and `seven-mile-bridge-fl` are off the usmap grid (its Florida stops
  north of the Keys), so they are `offmap` with that reason.
- **The stamp** (`stampOf`): `military` → **bunker** (the base layout and its vault); a swamp layout or a swamp-biome row
  that is not a holdout → **swamp road**; `holdout`, `fort` or any walls → **holdout**; `ruin` → **ruin**; otherwise its
  kind (trade post, camp, station, works, landmark, farm). `site.js` lays it from the row: the layout id picks the street
  plan, the footprint the size, the density the fill, the walls the wall, the structures the hero buildings; a `ruin`
  rolls 55% of its non-hero buildings ruined (cut a storey down, open to the sky).
- **Stamped** when you come within 760 m (WEB_CITYGEN's scan), or at once by `sites goto`.

### 3.2 Real terrain by default, and what stands on it
- **Boot.** `main.js` calls `setTerrain(true)` before agents connect unless the URL has `?terrain=flat`. The strip and
  the four packs are fetched in parallel (7.9 MB) and surveyed (about 60 ms).
- **The land at a point** is the strip's inside its rectangle, else the first pack whose rectangle holds it (fl, az-n,
  az-s, us), else the strip clamped (beyond the map). Bilinear on each asset's own samples.
- **The roads.** Every corridor on baked land gets its own profile (WEB_TERRAIN T4): I-10 (max grade 10.24%, cut 45.4 m,
  fill 33.1 m), I-95 (10%, 3.0 / 2.2 m), I-75 (10%, 9.8 / 3.4 m). The road bed's interchange widening counts only that
  corridor's own exits (before, I-10's counted Florida's too).
- **The pads.** Phoenix (at 0), the dead towns and exit communities as before, then **Meridian and every holdout**, then
  **every planned settlement and site** (322 pads at boot: 303 of them settlements). A settlement's pad is the square of
  its plan record, flat at the mean of the land under it, then held clear of every road bed (F5). A pad on steep land
  cuts a steeper batter (F6).
- **A settlement on its pad.** `liftBuilt` raises everything drawn and every floor by the pad's level `y`; the collision
  boxes stay measured from the ground (as every streamed static is), and `resolveBody` subtracts the building's `y0`
  for someone upstairs. `storeys.heightAt` answers the street floor at `y0`. Doors and windows hang at it
  (`interiors.attachRing` lot `y`). Loot sits at its floor, cover points at theirs.
- **An ad-hoc stamp** (`citygen action=stamp`, `site id=`) after the survey gets its pad then: levelled, held clear,
  its grids dropped and the chunks under it laid out again; `citygen action=remove` takes it away again.
- **Turning terrain on or off** releases the live settlements; they stamp again on their pads (or at 0).

### 3.3 The sheet packs (past I-10)
- **The real place** of a world sample is `unproject(x, z)` (F1). The DEM is read there with 4 sub-samples a cell.
- **The datum** (F2): Phoenix's 330.8 m inside 60 km of Phoenix (so the strip and the packs agree, and the island stays
  at 0), easing to sea level at 180 km (Florida's sea and its water rows at 0).
- **THE GRADE** per pack (F3): 10% for Florida (it never needs more), 15% for the dust-wall circle and the lower 48 (more
  of a canyon or a range survives; every car climbs 15%). The az pack keeps the strip's own land fixed inside its rectangle
  and is graded against it from both sides, so the two meet on the same samples with no step.
- **Florida's water** (F4): the bake builds the engine's own `WorldIndex` and asks `regionWater` at every sample (the
  procedural sea, lagoon, canals and sloughs); the land is 0 under all of it and eases up over 600 m. 44% of Florida's
  samples are wet; the land runs 0..49 m.
- **The us pack** has no fixed samples (nothing reachable borders it) and `hUnit` 0.2 m (the Rockies need ±6.5 km).

### 3.4 Landcover past the strip (the life zones)
Real local relief over 3 × 3 samples above 220 m (scaled by √(cell/32)) → mountains `m`. In the dry West (lon < −100):
real elevation above 3,100 m → `m`; 1,950-3,100 m → forest `F` (the Kaibab, the Mogollon Rim, the Rockies' montane belt);
1,350-1,950 m → scrub `f`. Everything else is 255 and the usmap grid's letter answers. Florida stores none (its region
rows own its look). Measured: az 11.7% forest, 5.8% mountains, 22.7% scrub; us 4.8% forest, 3.1% mountains.

### 3.5 For agents
`sites` (list / near / goto / info, §1), `terrain` (now lists the packs, the roads, the pads), `site id=` and `citygen`
as before. `node tools/sites-shots.mjs` re-shoots §8's renders; `node tools/terrain-sheet.mjs [fl az us]` re-bakes.

## 4. Formulas

**F1. The rubber sheet.** `u(φ, λ) = Q(φ, λ) + k · Σ wᵢ rᵢ / Σ wᵢ`, `wᵢ = (1 − dᵢ/900 km)² / dᵢ²`, `k = Σw / (Σw + 16/900²)`;
world `= (u − PHX) · K`. Q is the least-squares quadratic through the 36 cities, `rᵢ` each city's leftover, `dᵢ` the
great-circle km (floored at 0.05 km so the sheet stays smooth). Inverse: Newton with a numeric Jacobian (h = 10⁻⁴°),
steps clamped to 2°, from the previous sample's answer. *Example:* world (−972, −24,748) → 36.0544° N, 112.1401° W (the
Grand Canyon village), back to within 5 cm in 3 steps; 10,000 inversions take 33 ms.

**F2. The datum.** `D(x, z) = 330.8 · (1 − smoothstep((r − 60 km) / 120 km))`, `r = |(x, z)|`; stored height
`= max(E, seaFloor) − D`. *Example:* at r = 100 km, t = 0.333, smoothstep 0.259, D = 245 m. In Florida (r ≥ 186 km) D = 0.
The tilt it adds is at most 330.8 m over 120 km, 0.28%.

**F3. The grade with a fixed strip.** `U = min over q of (E'(q) + g|p − q|)` (E' = the land, the strip's samples where
fixed), then `L = max over fixed q of (strip(q) − g|p − q|)`, land `= max(U, L)` outside the strip, the strip inside.
Both are g-Lipschitz and equal the strip on its edge, so the pack meets it without a step. Ranges: g 0.06-0.15.
Measured: steepest az cell 21.9% at the strip's rim (the strip and the pack's chamfer cones meeting on a crease; the blur
does not touch fixed samples), us 15.6%, fl 10.3%.

**F4. Florida's shore.** `land = max(0, E − D) · smoothstep(dist / shoreFade)`, `dist` = chamfer distance (3-4) to the
nearest wet sample, `shoreFade` = 600 m. *Example:* a 12 m sand ridge 300 m from a slough comes out at 12 × 0.5 = 6 m.

**F5. A settlement pad.** `P = mean of 81 land samples over its square`, then for every road segment i near it:
`|P − y_r(i)| ≤ 0.9 · m · max(0, d_e(i) − w_f(i))` (d_e: metres from the pad's edge to the centreline, w_f the bed's
half-width, m the batter 0.20). *Example:* a town whose square's edge is 60 m from I-10, w_f = 24 m: P stays within
0.9 × 0.2 × 36 = 6.5 m of the road's level there, so neither batter cuts the other.

**F6. A pad's batter and reach.** `m_p = max(m, g_land + 0.10)`, `reach = R_pad + db / max(0.03, m_p − g_land) + 40`
(R_pad: the half-diagonal of a square pad, db the largest gap between the pad and the ground round its rim). *Example:*
on the north pack (g 0.15) m_p = 0.25; a 40 m gap reaches 400 m + 40 m past the rim.

**F7. Sizes.** `bytes ≈ header + gzip(3 · n_x · n_z)`: fl 2.93 M samples → 0.45 MB (mostly sea and flat), az-n 2.55 M →
1.17 MB, az-s 2.63 M → 1.04 MB, us 5.27 M → 3.74 MB. In the page: 3 B a sample, 40 MB for the four packs.

## 5. Edge Cases

- **`?terrain=flat`.** `W.terrain` is null; every touched line takes its old path (`rec.y` 0, `S.y0` undefined → 0,
  window `y` 0, door `y` undefined).
- **Phoenix (the island and the ring).** Still Phoenix's pad at 0: the island's golden hash cannot move.
- **The site row `phoenix-az`** anchors on the island itself: its status is `island` (the hand-built city IS the site;
  nothing is stamped, and a plan record there would have thinned the desert's animals east of the island).
  `ybor-city` (inside Tampa's town clearance) and `albuquerque-nm` go to the nearest free ground within 5 km.
- **A row beyond the streamed world.** Planned at its anchor, with a pad on `us.bin`. `sites goto` refuses it without
  `force=true` (past the dust wall a car is pushed back; on foot the chunks there are not laid out today).
- **Off the map.** Alaska (8 rows), Hawaii (0), Puerto Rico and abroad (23 INTL), and the Keys (the usmap's Florida stops
  north of them): `offmap`, with the reason in `sites action=list`.
- **Two pads overlap.** They are applied in order (Phoenix, towns, communities, holdouts, settlements): the later wins
  inside its square, the batters meet between.
- **A pad near a road.** Held to F5, so the road bed is never cut by a pad. A pad crossing a road (none: the plan keeps
  settlements 60 m + their half off every corridor) would be pinned only if it were a disc.
- **A negative plan seed** picked a negative door index in `overrun.populate` (a pre-existing bug a Grand Canyon stamp
  hit): fixed with `>>> 0`.
- **Florida's land and its procedural water disagree with the real coast.** The region's shore is procedural; the real
  DEM there may be a few metres up. F4 brings it down to 0 at every wet sample, so the region's water still lies in
  basins; the real shoreline is not followed.
- **The strip's edge.** Heights meet exactly (F3). The landcover jumps: across the edge two different real places meet
  (the strip map squashes the country beside I-10; the sheet does not).
- **Steep pads.** On the north pack the batter is 25% (F6): the cut round a rim village is a short steep bank.

## 6. Dependencies

| Doc / system | Needs from this | This needs from it |
|---|---|---|
| WEB_TERRAIN.md (`world/realterrain.js`, `tools/terrain-bake.mjs`) | the packs, the many-road survey, the settlement pads; its §3.4 table now says ON | the strip asset, the survey law, T3-T5 |
| WEB_CITYGEN.md (`systems/citygen.js`, `world/citygen/*`) | `rec.y` (its pad), `liftBuilt`, `siteRows`, `stampOf`, the ruin roll | the plan, `layoutSite`, `buildTown`, `free()` / `near()` |
| WEB_LOCATION_BIBLE.md §3.1, `data/sites/*.js`, `tools/sites-project.mjs` | nothing (rows are read, never written) | the rows and their anchors (`xz.js`) |
| WEB_FLORIDA.md (`world/regions.js`, holdouts) | Meridian's pad; the I-95 / I-75 profiles | `regionWater` (baked into `fl.bin`), the corridors |
| `world/storeys.js`, `engine/collision.js`, `systems/interiors.js` | `S.y0`, `c.storey.y0`, door/window `y` | their floors, boxes and openings |
| WEB_STREAMING.md (`world/streamer.js`) | `setTerrain` loads the packs, `citygen.onTerrain` | chunk eviction for an ad-hoc pad |
| WEB_RIVERS.md (`world/rivers.js`) | `landAt` now answers past the strip | nothing new |
| WEB_ATLAS.md (`tools/atlas-project.mjs`) | `tools/usmap-proj.mjs` is its fit without the state law | the city list (kept equal by hand) |
| WEB_ROADSCAPE.md (`world/roadscape.js`, `data/roadscape.js`) | the corridor survey: the road biome's raised bed is added to `R.yr`, a ditch is cut past the bed in `roadClamp` (`R.dk`, `R.bed`) | the pinned pads and `wf` (where the bed and ditch fade out) |

## 7. Tuning Knobs

| Knob | Where | Default | Safe range | Affects |
|---|---|---|---|---|
| pack `cell` | `TERRAIN_PACKS` | 32 (fl, az), 128 (us) | 16-256 | detail against size (1/cell²) |
| pack `zoom` | `TERRAIN_PACKS` | 9, 10, 7 | cell-matched (z10 ≈ 130 m/px at 32° N) | real detail read; one step = 4× the tiles |
| pack `g` | `TERRAIN_PACKS` | 0.10 fl, 0.15 az/us | 0.06-0.15 | how much canyon and range survives |
| `seaFloor` | `TERRAIN_PACKS` | 0 fl/us, −75 az | −100..0 | how low the land goes by the sea |
| `shoreFade` | `TERRAIN_PACKS` fl | 600 m | 200-1200 | how fast Florida rises from its water |
| `hUnit` | `TERRAIN_PACKS` | 0.1, us 0.2 | 0.05-0.25 | height precision against range (Int16) |
| `DATUM.r0`, `DATUM.r1` | `data/terrain.js` | 60 km, 180 km | r0 > 52 km (the strip's corners), r1 < 186 km (Florida) | where the datum eases to sea level |
| pad clearance factor | `realterrain.js clearRoads` | 0.9 | 0.5-1.0 | how close a pad's level may be pushed to what the batter allows |
| pad batter step | `realterrain.js levelPad` | g_land + 0.10 | +0.05..+0.2 | the bank round a pad on steep land |
| ruin share | `site.js` | 0.55 | 0.3-0.8 | how much of a `ruin` row is open to the sky |
| site search | `citygen.js planWorld` | 1.5 km, then 5 km | 1-8 km | how far a row may move from its anchor |

## 8. Acceptance Criteria

Run from `web/` with the game up on the lane's port (`DL_URL=http://localhost:3452 node tools/agent.mjs`).

**A. The bake**
1. `node tools/terrain-sheet.mjs` writes `fl.bin` 0.45 MB, `az-n.bin` 1.17 MB, `az-s.bin` 1.04 MB, `us.bin` 3.74 MB and
   prints each pack's land range, steepest cell and landcover. **Measured: as listed (fl 0..49 m, 10.3%; az −406..2,544 m,
   21.9% at the strip rim; us −331..2,591 m, 15.6%).**

**B. The selftest checks** (in the full battery, `selftest only="sites: |terrain: a fresh|terrain: past|terrain: a car"`)
2. `sites: every SITE row is accounted for...`: 263 rows, every on-map row planned or beyond with a citygen record, every
   Florida row on the map planned inside the Florida region.
3. `terrain: a fresh game is on real terrain...`: `W.terrain` set on a fresh page, packs `fl,az-n,az-s,us`, every corridor
   surveyed, a pad for every planned settlement.
4. `terrain: past the I-10 strip the land has real relief...`: the land within 3 km of the Grand Canyon village spans
   more than 150 m (az-n), the Colorado Rockies more than 150 m within 6 km (us), more than 10 forest samples on the
   Kaibab, Florida's sea at 0 and Meridian on `fl`.
5. `sites: a Florida site stamps as its row says...`: three Florida sites stamp; every building corner within 0.15 m of
   its base.
6. `sites: a site on raised land...`: the Grand Canyon village's pad more than 200 m above the datum, every corner within
   0.15 m, the street floor at the pad, a person walking in stays on it.
7. `terrain: a car drives the steepest graded stretch of I-10...`: more than 300 m in 14 s, never below the ground, more
   than 20 m of climb or fall.

**C. The battery and the gates** (§ results in the hand-back): the full selftest green twice in a row on fresh pages;
`scenario name=stress` not regressed; `node tools/ip-lint.mjs` 0 deny; under 150 draw calls.

**C2. Goldens and the checks real terrain moved** (each is a consequence of the default, not a regression)
- `world` islandMatches: unmoved (`f0cfcd28`; the island stands on Phoenix's pad at 0).
- `golden.json p1Chunks` (the twelve pinned P1 chunk hashes): unmoved as the `?terrain=flat` golden; a second set,
  `p1ChunksReal`, holds the same chunks on the land (11 of 12 move: every chunk off Phoenix's pad takes the land, the
  strata, the outcrops and the forest stands; `-2,-4` is on the pad and keeps its flat hash). `florida: P1 is
  untouched...` reads the set for the mode it runs in.
- `water: every road/river crossing...`: on the land every small crossing is a gorge under a fill, so a deck; the check
  no longer asks for 3 culverts or fords when terrain is on (17 decks, 0 culverts).
- `water: with real terrain on, the rivers lie in their valleys...`: puts the terrain back to how it found it (it used
  to turn it off, which left the rest of the battery flat).
- `streaming: every exit is where its row says...`: a mile-1 sign the water moved off a new deck (`rivers.js
  fixSigns`) is not measured from the gore.
- `fauna: the formula...`: its "open desert east of the island" (chunk 5,1) is Phoenix's real sprawl on the land; on
  terrain it takes the first chunk east whose middle reads desert.
- `citygen: a shot out of a floor-4 window...`: a building's wall bands stand on its own ground (`S.y0`).
- Bullets, blood rays and collision from a storey use the height above the building's own pad (`combat.js`,
  `blood.js`, `collision.js`).

**D. The renders** (`docs/renders/web/sites-terrain/`, game camera): `1-florida-site-star-fort`,
`1b-florida-site-sawgrass-road`, `2-canyon-grand-canyon-wall`, `2b-canyon-grand-canyon-low`, `3-forest-kaibab`,
`4-mountain-road-i10`, `4b-mountain-road-i10-wide`, `5-setpiece-canyon-rim-village`.

**E. Not done here**
- Streaming the world itself past the dust wall and the Florida box (the next regions): the land and the site plans are
  ready for it.
- NLCD landcover for the packs (its WMS did not answer).
- A finer `us` (32 m tiles for the regions as they open: WEB_TERRAIN §6.4's 8 km tiles).
