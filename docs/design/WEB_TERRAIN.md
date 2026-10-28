# WEB_TERRAIN: the real land under the streamed world

**Status:** built 2026-10-23 on `feat/web-terrain` behind a flag; **ON by default since 2026-10-28** (`feat/web-sites-terrain`, [WEB_SITES_TERRAIN.md](WEB_SITES_TERRAIN.md): `?terrain=flat` is the escape hatch, and the land now reaches past this strip through four sheet packs). The I-10 corridor from
Los Angeles through Phoenix to El Paso (the part P1 streams) is baked and drivable on real terrain; the rest of the country
is planned in §6.4.
**Owner of the call:** Robert ("we need different terrain... you go online, you find the terrain, and you just start laying
stuff on top of it"). **Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`); streaming is
[WEB_STREAMING.md](WEB_STREAMING.md), whose "Not in scope: real slopes" this document lifts, behind the flag.

---

## 1. Overview

The streamed world was flat: everything past the Phoenix island stood on `y = 0`, with ramps, fills and bridge decks as the
only relief. This adds the real land. Public elevation and landcover data are fetched once, mapped onto our compressed I-10,
and baked into one 1.53 MB file. The engine lays the road, the towns and every chunk's contents on top of it.

| Piece | Where | What it does |
|---|---|---|
| The bake | `web/tools/terrain-bake.mjs` | Fetches and caches the sources, strip-maps them onto the world, holds the land to THE GRADE, classifies the biome and writes `src/data/terrain/i10.bin`. Also writes the profile chart. 30-40 s with a warm cache. |
| The rows | `web/src/data/terrain.js` | Every knob of the bake and the engine (§7). |
| The engine | `web/src/world/realterrain.js` | Decodes the asset, surveys the road and the pads onto the land, and answers the ground at any point from per-chunk 8 m grids. |
| The flag | `Streamer.setTerrain(on)`, the agent command `terrain on=true\|false`, ON at boot unless the URL has `?terrain=flat` (WEB_SITES_TERRAIN §3.2) | On: load, survey, lay out every chunk again. Off: lay out every chunk again, exactly as before. |
| The proof | `web/tools/terrain-check.mjs`, `docs/renders/web/terrain/` | Offline checks of the asset and the engine, plus the screenshots, the land map and the profile chart. |

**Sources** (all public, freely licensed; every file and byte is recorded in `web/.terrain-cache/manifest.json`, which is
gitignored, and in the asset's header):

| Source | Used for | Licence | Fetched |
|---|---|---|---|
| **AWS Terrain Tiles, Terrarium PNG** (`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, zoom 10, about 130 m a pixel at 32° N; the tiles go to zoom 15, carrying USGS 3DEP at 10 m and SRTM at 30 m) | elevation | AWS Registry of Open Data. Per source: USGS 3DEP, SRTM and GMTED2010 are public domain (credit requested); ETOPO1 is public domain (NOAA); INEGI's Mexican relief is under Mexico's free-use licence | 490 tiles, 24.4 MB |
| **NLCD 2021 Land Cover (CONUS)**, USGS/MRLC, from MRLC's public WMS (`mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms`, 1° × 1° blocks at 1024 px, about 90 m a pixel) | biome | Public domain (USGS); the WMS lists AccessConstraints NONE and Fees NONE | 62 blocks, 7.4 MB |
| **TIGER/Line 2023 Primary Roads**, US Census Bureau (`tl_2023_us_primaryroads.zip`) | where the real I-10 runs | Public domain | 1 file, 36.5 MB |

Total downloaded: **553 files, 68.3 MB**, once. Later bakes run from the cache (`--offline` refuses to fetch).

**Attribution text** (ship it in the credits; the asset header carries it too):
> Terrain: United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological
> Survey. Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration. Mexico terrain data source: INEGI,
> Continental relief, 2016. Tiles: AWS Terrain Tiles (Mapzen / Tilezen joerd). Land cover: National Land Cover Database
> 2021, U.S. Geological Survey / MRLC. Roads: TIGER/Line Shapefiles, U.S. Census Bureau (2023).

**Other candidates considered.** USGS 3DEP (best US data, 1 m to 1/3 arc-second, public domain) is the source the Terrarium
tiles already resample, and its own services are much heavier to fetch. SRTM (30 m, public domain) is in the tiles too.
Copernicus GLO-30 (30 m, free under the Copernicus DEM licence with attribution) is excellent but comes as 1° GeoTIFF tiles,
which need a GeoTIFF decoder. ESA WorldCover (10 m, CC BY 4.0) is global and fine for landcover, but it is distributed as 3°
cloud-optimised GeoTIFFs (a GeoTIFF reader again). NLCD covers the whole lower 48 in the public domain, and MRLC's WMS
serves it as plain PNGs whose palette maps one to one onto its classes (every pixel matched exactly). **Chosen:
Terrarium tiles**, because they are one PNG format for the whole country at any zoom, public sources, no account and no key,
and a 60-line decoder. The bake needs only about 500 m of real resolution: 32 m of game is about 480 m of real country.

**Asset.** `web/src/data/terrain/i10.bin` is **1,606,884 bytes (1.53 MB)**: a JSON header, then gzip of Int16 heights in
decimetres, delta-coded along rows, and a byte of biome per sample. The grid is 2,881 × 1,289 = 3.71 M samples at 32 m,
x −45,824 to 46,336 and z −20,992 to 20,224 (the corridor and 4 km of margin). Raw, it is 10.6 MB; in the page it holds 11 MB
(heights stay Int16). It is fetched only when the flag goes on.

## 2. Player Fantasy

*You climb out of the Los Angeles basin with the engine labouring, crest the pass and coast down into the Coachella valley
at sea level. Past Phoenix the road rises for twenty minutes: the land opens out into high grass, then rock. A green sign
says PHOENIX behind you, and the ground is 800 m higher than it was there. You never hit a wall of cliff. The road was
surveyed. But off the shoulder the country rolls away in long hills you could drive if you were stupid, and the scrub
changes with the ground: low desert, high scrubland, farmland in the irrigated valleys.*

The road's elevation profile is the real I-10's: every climb and every valley is where it is on the real road. Valleys and
basins sit at their real heights (game road against the real road, both in real metres): Los Angeles 81/86, Indio 16/21,
Phoenix 331/325, Tucson 658/666, Lordsburg 1,123/1,121, Deming 1,350/1,359, El Paso 1,143/1,177. The passes come out lower,
where the compression would otherwise make them too steep to drive (§3.2): San Gorgonio 396/795, Texas Canyon 1,166/1,437.
The compression shortens the distances, not the heights.

## 3. Detailed Rules

### 3.1 The strip map (how a world point finds its real place)
Our I-10 is a compressed copy of the real one: Los Angeles → Phoenix at 1:14.4, Phoenix → El Paso at 1:17.1, measured
(T2). A whole-country affine fit would put our straight Phoenix-to-El Paso chord over the Pinaleño Mountains. So the
corridor uses a **strip map**, like a road atlas's strip of the route.
- **The game frame.** The corridor centreline (WorldIndex `cl`) smoothed by a Gaussian of 3 km (`frameSigma`): the meander
  and the kink at Phoenix are ironed out of the frame, not out of the road. It is extended 20 km past both ends. A world
  point projects onto it as arc length `s` and signed offset `d` (+ to the right of eastbound travel).
- **The road's own offset.** `off(s)` is how far the real centreline (meander included) sits from the frame. `d' = d − off(s)`,
  so **our road maps exactly onto the real road**.
- **Along.** `s` maps to arc length `r` on the real I-10 by a monotone cubic through three anchors: downtown Los Angeles,
  Phoenix and El Paso, each taken at its nearest point on the real road. The local scale `σ(s) = dr/ds` changes smoothly.
  Past El Paso it holds σ_E.
- **Across.** `D = σ(s) · d'` real metres off the real road, along the real road's normal smoothed over 60 km
  (`realSigma`), so the strip does not fold at the real road's bends. Past the band (±6 km of game) the lateral offset is
  squashed by `bandOut` = 0.3, so the country carries on past the band, more compressed, instead of smearing the band's
  edge outward.
- **The real road** is TIGER's "I- 10": 183 parts and 25,027 vertices in the corridor, both carriageways averaged in 400 m
  bins along a rough guide through 38 towns on the route, three passes, giving 1,523 km from Santa Monica to Van Horn.

### 3.2 The land
- **Heights are real metres, about Phoenix's.** The bake subtracts the land's height at world (0, 0): the datum is 330.8 m,
  and downtown Phoenix's real elevation is 331 m. So the island stays at `y = 0` and everything else is real elevation minus
  330.8 m.
- **THE GRADE.** Horizontal distance is compressed 14-17 times and heights are not, so every real slope comes out 14-17
  times steeper: a 6% real grade would be 90%. **Decision: the land is the highest surface that never stands above the real
  land and is never steeper than g = 10%** (T3). Valleys and basins, where the roads run, keep their real heights. Mountains
  are cut down to cones of grade g. A regional climb steeper than g over its compressed length is lowered on its high side:
  the San Gorgonio pass (795 m real) comes out at 396 m, because the Coachella valley about 4 km of game away cannot rise
  faster than 10%. The midpoint of the upper and lower envelopes was tried first and rejected: the lower envelope lets one
  distant peak lift the land for tens of kilometres, and Phoenix came out at 1,014 m.
- **Sea floor.** The tiles carry bathymetry, so the land stops at −75 m (the floor of the Salton basin, the lowest dry ground
  in reach). Without that, Santa Monica Bay pulled Los Angeles 500 m under the sea through the grade.
- **Smoothing.** After the grade, 4 passes of a 3 × 3 binomial blur (`blurPasses`) round the creases where two cones meet.
  The chamfer leaves those ridges along the grid's axes. A positive kernel keeps the bound.
- **The biome.** At each sample, the majority NLCD class over about 450 m of real country: water and wetland → `w`,
  developed → `u`, crops and pasture → `a`, forest → `F`, grassland → `p`, shrub, barren or ice → `m` where the real ground
  spans more than 220 m in 1.4 km, else `f` (shrub above 1,100 m) or `d`. 255 means no data (Mexico, the sea), and the usmap
  grid answers there. Across the bake: desert 40.7%, scrub 22.6%, plains 9.6%, forest 7.6%, mountains 3.4%, farmland 2.5%,
  urban 2.4%, riverbed 1.4%, no data 9.7%.

### 3.3 What is laid on the land (the survey, at runtime)
- **The pads** are Phoenix, the four dead towns and the exit communities. **Phoenix's pad is the island and the whole ring,
  at 0**: a disc of radius `ring.reach + 80` = 1,952 m. Nothing in the ring or the island moves, so the golden hash cannot
  move. A town or community pad covers its buildings and streets plus 80 m (40 m for a community), flat at the mean of the
  land under it.
- **The road profile** `y_r(s)` is the land under the centreline every 8 m, smoothed twice over 400 m into vertical curves,
  then pinned to each pad it crosses (Phoenix 40,277-44,276 m; Los Angeles 0-344 m; El Paso 82,449-83,081 m). It eases back
  to the land at the grade. It is never steeper than g.
- **The road bed** is flat across 24 m either side of the centreline (`formation`), and 80 m through each interchange
  (`formationX`, ±650 m), so the ramps, the cross road's fills and the bridge sit on it exactly as they were designed on flat
  ground.
- **The ground** `G` is the land, cut and filled to the road bed and then to each pad at the batter slope `m` = 20% (T5).
- **Everything else is laid out as before, on flat ground, and then lifted** by `G` at its own position: every instance
  (props, walls, roofs, scrub, cacti, signs, wrecks, poles, buildings), every road vertex, every fill and rock vertex. Rails
  are pitched to the ground under their two ends. **Collision heights stay measured from the ground**: a box is as tall as
  it was, and movers ask from their own ground.

### 3.4 What the flag changes in the engine (ON by default since 2026-10-28; the packs, the many-road survey and the settlement pads are WEB_SITES_TERRAIN §3.2-3.3)
With the flag off, `WorldIndex.terrain` is `null` and every changed line takes its old path (proof: §8).

| File | With the flag on |
|---|---|
| `world/realterrain.js` (new) | the asset, the survey, the per-chunk 8 m grids (LRU of 384), `at(x, z)` with the drawn ground's own triangle split |
| `world/chunkgen.js` | ground vertices at `G` with real normals (read across seams from the neighbour's grid), the landcover's tint, a map-maker's hillshade (light from the north-west, ±24% at the full grade) and steep ground going to rock; the lift pass; rails pitched to the ground; heights in the edge signatures; a slice for each neighbour grid |
| `world/worldindex.js` | `heightAt = G + ramps(y − G)` (ramps, fills and decks stand on the ground); `groundAt`; `nearRelief` never null (the ground has relief everywhere); `biomeAt` reads the landcover |
| `world/streamer.js` | `setTerrain(on)`: loads the asset once, surveys, drops and lays out every chunk again (the pinned island chunks at once), puts people back on the ground |
| `systems/stunts.js` | a grounded car more than 2.5 m off the land (the flag turned on, a teleport, a spawn) is set on it: not a jump, not a wall, not a crash |
| `systems/vehicles.js` | a car's collision height is taken from the ground under it; a car is spawned on the land |
| `systems/fx.js` | decals, skids, footprints, pools, particles, tracers, flashes and lights sit on the land (`fx.ground`) |
| `systems/sky.js`, `main.js` | the camera keeps its height above the ground it looks at; the sun's shadow box follows it; on at boot, `?terrain=flat` off |
| `agent/api.js` | the `terrain` command; `screenshot x z` frames above the ground there; teleporting a car puts it on the land; the exit selftest measures from the ground |

## 4. Formulas

**T1. The strip map.**
```
(s, d)  = project(p) onto the frame F              d' = d − off(s)
r       = S(s)   (monotone cubic through the three anchors)      σ(s) = S'(s)
D       = σ(s)·d'               if |d'| ≤ B
        = sign(d')·σ(s)·(B + (|d'| − B)·k_out)   past the band
P_real  = R(r) + N̂_60km(r) · D
```
- `B` = 6,000 m (band), `k_out` = 0.3. R is the real centreline; N̂ is its right normal after 60 km of Gaussian smoothing.
- Range: the map folds (its Jacobian changes sign) on 0.25% of the band's cells, on the inside of the real road's bends. At
  30 km of smoothing it was 2.1%.
- **Worked example.** The point 450 m off our road at game mile 9.8 (−25,884, −4,521): σ = 14.4, so D = 14.4 × 450 ≈ 6.5 km
  off the real I-10 near Desert Center. The land there is −280 m of game (50 m real) with a 10.2% slope: the most relief in
  reach of the road anywhere on the corridor, 127 m inside a 900 m window.

**T2. The compression, measured.**
```
σ_W = (r_PHX − r_LA) / (s_PHX − s_LA) = (633.4 − 28.8) km / 42.09 km = 14.37
σ_E = (r_ELP − r_PHX) / (s_ELP − s_PHX) = (1,323.6 − 633.4) km / 40.30 km = 17.12
```
These agree with WEB_STREAMING F2: 1:14.3 west, and the known short leg east.

**T3. THE GRADE.**
```
L(p) = min over q of [ E(q) + g·|p − q| ]        (E = real elevation, max(E, −75 m), minus the datum)
```
- `L` is the largest g-Lipschitz function under `E`, computed with two chamfer passes over 8 neighbours with knight moves
  (path length within 2.6% of Euclidean), then blurred.
- Bound: `L ≤ E` everywhere, `|∇L| ≤ g`. Measured: the steepest baked cell is 10.4%; the mean lowering is 256 m (the
  mountains), the maximum 3,023 m (a 3,000 m peak cut down to the cone that fits).
- **Worked example** (an illustration of the formula). A valley floor at 1,140 m with a 2,190 m summit 8 km of real country
  away, at σ = 17 (0.47 km of game): L at the summit ≤ 1,140 + 0.10 × 470 = 1,187 m. A 1,050 m mountain becomes a 47 m rise.

**T4. The road profile.**
```
y0(s)  = L(centreline(s))
y1     = box_400(box_400(y0))                     (a triangle kernel, 800 m wide: vertical curves)
y_r    = P + clamp(y1 − P, −g·Δs, +g·Δs)          (for each pad crossed, Δs = metres outside its pinned stretch)
```
- Range: max grade 10.24% (measured; g plus the chamfer's error); deepest cut 45.4 m, highest fill 33.1 m (the vertical
  curves over crests and pad transitions).
- Curvature: a grade change of 0.2 over 400 m is 5 × 10⁻⁴ per metre, under `g_grav / v²` = 4.6 × 10⁻³ at 46 m/s, so no crest
  throws a car.

**T5. The ground.**
```
G0 = L
G1 = y_r(s) + clamp(G0 − y_r(s), −m·δ_r, +m·δ_r)     δ_r = max(0, |d| − w_f(s))      (the road bed and its batters)
G  = P_k + clamp(G − P_k, −m·δ_k, +m·δ_k)            δ_k = max(0, |p − c_k| − r_k)    (each pad k in turn, Phoenix first)
```
- `m` = 0.20 > g, so a batter that starts Δy from the land meets it within `Δy / (m − g)`.
- **The road's reach:** `R_win = (m·w_max + Δ_max) / (m − g) + 16` = 630 m. Past it, `G1 = G0` exactly. A chunk asks only for
  the centreline segments within `R_win`.
- Drivability: ground slope ≤ m = 20% on a batter (a car at 46 m/s climbs 0.15 m a frame there, under STUNT.step 0.45 m);
  ≤ g = 10% everywhere else. Measured on the grids: 25.7% at worst (a batter along a grid diagonal).

**T6. Sizes and costs.**
```
asset  = header + gzip(2·N + N) bytes,  N = n_x · n_z = 3.71 M    → 1.53 MB on disk, 11 MB in memory
grid   = 33² Float32 = 4.3 KB a chunk; LRU 384 = 1.6 MB
```
- A chunk's grid takes 0.24-0.74 ms offline: a boustrophedon over its vertices, each walking from the last one's segment. The
  survey takes 23-30 ms. Turning the flag on (fetch, decode, survey, the hot ring laid out again) takes 185-280 ms.

## 5. Edge Cases

- **The flag off.** `WorldIndex.terrain` is null, and every touched line takes its old path or adds 0. Chunk layouts are
  byte-identical to the base commit (§8 B).
- **Phoenix.** The pad covers the island and the whole ring (the ring's lobes and the freeway tail reach at most 1,872 m),
  so `G` is exactly 0 there: the island's golden hash, the ring's buildings, rooms, roofs and residents never move. The real
  country inside 1.95 km of game (South Mountain is 0.8 km of game from downtown) is flattened into the pad, and
  everything past it rises from 0 at 20%.
- **Bridges.** The deck is a relief laid on the road bed, and `heightAt(x, z, y)` measures `y` from the ground. Someone up on
  the deck stays on it, and a car under it stays under it.
- **A car the land moved.** Turning the flag on, a teleport, or a spawn at the old `y = 0` leaves a car up to 1,150 m under or
  over the land. A grounded car more than 2.5 m off it is set on it. A car going over a crest is `air` first, so it is never
  snapped.
- **Off the band, off the bake.** Past ±6 km the land is the squashed strip map. Past the bake's rectangle it is the
  rectangle's edge, carried on. The dust wall is at 45 km, and the rectangle reaches from x −45.8 to 46.3 km and z −21 to
  20 km.
- **Towns off the corridor.** San Diego and Albuquerque stand where the usmap puts them, 30-40 km off our road, so they take
  whatever land the squashed strip gives them. Albuquerque's pad comes out at 1,961 m real (the real city is about 1,620 m),
  and San Diego's below sea level (the pad's mean includes the clamped sea floor). Their streets and buildings stand
  correctly on their pads. §6.4 gives each town its own anchor.
- **Mexico.** NLCD stops at the border. The biome there is the usmap grid's, and the elevation is INEGI's through the tiles.
- **Folds.** 0.25% of band cells. The land there repeats, mirrored; it stays continuous, because the map is continuous.
- **Fresh-page GPU uploads.** With the flag on, the first lap after a page load uploads two pool geometries that an
  all-flat page had already drawn. The selftest's leak check sees +2 once, then holds on every lap after. There are no new
  scene objects.
- **Not lifted yet:** throwables and gibs use their own ground tests (`fx` lifts only their decals), the minimap tile has no
  hillshade, the train and water are island-only anyway, and the big map's atlas is flat.

## 6. Dependencies

| Doc / system | Needs from terrain | Terrain needs from it |
|---|---|---|
| [WEB_STREAMING.md](WEB_STREAMING.md) | `heightAt` with ground; chunks lifted; the gates unchanged (§8) | the chunk grid, the island rectangle, the ring's reach, `cl`, exits, towns, pads |
| `world/ring.js`, `world/city.js`, `world/storeys.js`, `systems/interiors.js` (other lanes) | nothing: they stand on Phoenix's pad at 0 | that the ring never reaches past `ring.reach` |
| `systems/stunts.js`, `systems/vehicles.js` | ground-relative collision, the snap | `surface()`'s central differences on `heightAt` |
| `data/usmap.json`, `tools/import-usmap.mjs` | none | the corridor; a re-import changes `dataHash`, so **re-bake** (the header records the hash) |
| the Godot game (`gen_relief.mjs`, `elev_mode: ground`) | none | the idea: a painted relief, roads that meet the land at a capped grade |
| Robert's survey (`D:/lsw/src/data/cityplan.js` `surveyCity`) | none | the idea: road nodes relaxed toward the land under a grade limit, with an annealed pull. Here the land is already g-Lipschitz, so the smoothed profile meets the cap without annealing |

### 6.4 The plan for the whole country
1. **Every interstate gets a strip.** The bake runs per route: the frame is the usmap polyline, and the real road comes from
   TIGER (all ten interstates are in the same file). The anchors are every town the route passes. Each strip writes its own
   grid, keyed by route.
2. **Between the strips, a rubber sheet.** A triangulation of the 59 towns' real coordinates against their usmap positions
   gives every off-road point a real place (piecewise affine). Each strip blends into the sheet across its band edge, over
   the `bandOut` zone that today only squashes.
3. **Tiles, not one file.** Bake in 8,192 m world tiles, 256 × 256 samples at 32 m, about 100-150 KB each once gzipped. The
   streamer fetches a tile when the layout ring first touches it (the same `ensureLayout` stall guard, cause `terrain`) and
   keeps an LRU of about 16. The whole 390 × 221 km world is about 1,300 tiles, roughly 150 MB on the server and a few MB in
   any one session.
4. **Sources are already national.** Terrarium tiles and NLCD cover the lower 48. Florida and the Gulf need the sea-floor
   clamp at 0 m, not −75 m. Rivers (WEB_STREAMING P4) carve into `L` before the grade, the way the Godot game's
   `water_depth_at` did.
5. **Every town gets its own anchor**, so its pad sits at its real elevation.
6. **Gates per region:** the same stream-drive phases on each new corridor; `terrain-check` per tile; seams between tiles
   (edge vertices equal).

## 7. Tuning Knobs

All in `web/src/data/terrain.js`, except the two looks constants in `world/chunkgen.js`.

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `cell` | 32 m | 16-64 | bake resolution; the asset's size goes as 1/cell² |
| `band` | 6,000 m | 3,000-8,000 | how far off the road the strip follows the real road's scale |
| `bandOut` | 0.3 | 0.2-0.5 | how hard the country past the band is squashed (lower folds less) |
| `frameSigma` | 3,000 m | 2,000-6,000 | smoothness of the game-side frame (must iron out the 1.4-km-radius meander) |
| `realSigma` | 60 km | 30-100 km | smoothness of the real-side normals: folds against faithfulness off the road |
| `demZoom` | 10 | 9-12 | DEM detail sampled; each zoom step quadruples the tiles |
| `blurPasses` | 4 | 2-6 | crease rounding against detail |
| **`g`, THE GRADE** | 0.10 | 0.06-0.15 | how much relief survives: steeper keeps more of the mountains and lowers the passes less; every car can climb 15% |
| `batter` | 0.20 | 0.15-0.33, > g | cut and fill slopes; the road's reach R_win goes as 1/(m − g) |
| `formation`, `formationX`, `formationXs` | 24 m, 80 m, 650 m | ≥ paved + one ground cell | the flat road bed, and its widening at interchanges |
| `vcurve` | 400 m | 200-800 | vertical curves; shorter means sharper crests and smaller cuts |
| `padMargin` | 80 m | 40-200 | how far a pad reaches past its buildings |
| `gridLRU` | 384 | 128-1024 | memory against re-surveying chunk grids |
| `HILLSHADE` (chunkgen) | 0.24 | 0.1-0.4 | how strongly slopes read from straight above |
| `ROCK_TONE` (chunkgen) | (0.9, 0.8, 0.72) | no purple | the colour steep ground goes toward |

## 8. Acceptance Criteria

Run from `web/` with the game up (`DL_URL=http://localhost:<port> npm run agent`). Measured 2026-10-23 on this machine's
shared RTX 4090, with other agents' browsers running.

**A. The bake and the asset**
1. `node tools/terrain-bake.mjs` (warm cache, or `--offline`) prints datum 330.8 m, 0.25% folded band cells, the steepest
   cell at 10.4%, the asset at 1.53 MB, every source's files and MB, and the profile at a mean |game road − real I-10| of
   60 m. **Measured: as listed.**
2. `node tools/terrain-check.mjs` returns `ok: true`. The grids equal the brute-force ground (6 × 10⁻⁵ m), seams are 0,
   the same chunks build to the same heights twice, the road bed is within 0.3 m of the survey, the road grade is at most
   g + 3%, and the ground slope is at most 1.5 m (1.5 × the batter). **Measured: ok; road grade 10.24%; ground slope
   25.7%; 0.24 ms a grid.**
3. `docs/renders/web/terrain/i10-profile.png` shows the real I-10 (USGS DEM along the TIGER centreline) and the game's road
   and land against real miles. **Measured: mean |difference| 60 m. The valleys match to within tens of metres. The passes
   are lowered by the grade: San Gorgonio by 399 m, Texas Canyon by 271 m, and the worst point by about 460 m at real mile
   143, between Indio and Desert Center.**

**B. The flag off is byte-identical**
4. Laying out the same 90 chunks (the corridor every 2.5 km and 900 m off it, every exit and community, the towns, the ring
   dense and at its edge, the island band and off-road) with base commit `1109205b`'s `web/src` and with this branch gives
   identical layout hashes, edge signatures, box counts and instance counts. **Measured: identical (90/90).**
5. `world` reports `islandMatches: true`, hash `c3f0f6ca`. **Measured: true.**
6. Full `selftest` on two fresh pages. **Measured on the final code: 135/135 and 135/135** (283 s and 275 s). An earlier
   pair, before the last flag-gated edits, was also 135/135 twice.
7. `scenario name=stream-drive`, flag off (the baseline): 0 cross and 0 promote stalls in every phase; the gate at 2,579 m.

**C. The flag on**
8. `terrain on=true` returns the report: survey max grade 10.24%, cut 45.4 m, fill 33.1 m, R_win 630 m, pinned Phoenix,
   Los Angeles and El Paso.
9. `scenario name=stream-drive`: **0 cross and 0 promote stalls in every phase** (vref, gate, perf, ring, ceiling) on three
   complete runs and a perf-only run. The gate covered 2,566-2,589 m with 1.0 of samples on the road. **Measured, final run:**
   gate 2,589 m, 79 draw calls; perf phase 76 draw calls (75 flat), 742k triangles (414k flat), pump p95 0.3 ms; layout p50
   4.2 ms and p95 8-18 ms (flat: 1.9/4.3). The frame times are this shared machine's noise: the perf phase's `pass` is false
   with the flag off too (p95 12.2 ms against its 8 ms gate). One more run stopped inside the scenario's own `put()` on a null
   vehicle. Boarding a car right after `exitVehicle(true)` sometimes leaves the player on foot with the flag off as well: in
   one proof-shot run, 4 of 5 boardings failed with it off and 0 of 5 with it on. So the flake is not the terrain's.
10. `selftest only=streaming` with the flag on: the golden hash, determinism and seams (heights in the edge signatures),
    nav over the island edge, a car on the ground off the island and back, exits (measured from the ground), the 60 s gate,
    the dust wall and convoys. **Measured: 9/9.** The leak check fails once (+2 GPU geometries) on the first run after a
    fresh page, then passes (§5).
11. **The screenshots** (`docs/renders/web/terrain/`), at five spots with the flag off and on: `<spot>-off|on-game.jpg`
    (the car at cruising camera height, 66 m, the game's tilt), `-overview.jpg` (260 m, tilted 0.55) and `-low.jpg` (a low
    angle). Spots: `1-west-climb` (mile 6.0), `2-hills` (the most relief within reach of the road, mile 9.8), `3-exit4` (THE
    SAND TRAP's interchange on the land), `4-steepest` (the road's steepest stretch, east of Tucson) and `5-elpaso` (the
    dead town on its pad). Also `i10-land-map.png` (the whole baked land, hillshaded, with the road and the spots) and
    `<spot>-ground-map.png` (2 km of the ground as the engine has it, road bed and pads cut in). No holes in any of them.

**D. Not measured here**
12. A stress A/B (run centrally).
