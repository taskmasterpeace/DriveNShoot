# THE COUNTRY PLAN — relief, rivers, and the readable road

**Status:** ✅ **SHIPPED IN FULL, 2026-07-14** — all three arcs executed in one `/goal` session and merged to main: Arc 1A+1B `3ede17e` (relief/climbing roads/rivers/bridges/60 overpasses), Arc 2 `3143a00` (landmarks/farm belts/exit billboards/ecotones), Arc 3 `a48c6a5` (districts→engine/ghost sites). Proof sims: relief_paint 16 · river 12 · overpass 8 · readable_road 15 · district 13 · network_fill 17 (+ every guard green). Before/after renders in `docs/renders/world/arc1_baseline..arc3_after`. This document is now the RECORD of what shipped, kept for the §0 research corrections and per-arc discipline notes.
**Owner ask:** "do all this research and make a doc we can follow" — the eight
country-scale ideas, ordered into three arcs by dependency, every claim checked
against the code that actually shipped (receipts inline). Companion contracts:
`TERRAIN_RELIEF.md` (the greenlit relief part-2 design), `GROUND_INTEGRITY.md`
(the floor-safety law that gates all of it), `THE_AMERICAN_ROAD.md` (M-ladder).

---

## 0. RESEARCH CORRECTIONS (what the idea list got wrong — read before scoping)

The idea list was written against a stale map. Verified 2026-07-14:

| Claim | Reality (receipt) |
|---|---|
| "the land is still a flat plane with rock props" | **Relief v1 SHIPPED**: `ground_y(x,z) = fbm(x,z)² × relief_at(x,z) × 24m` — deterministic, seam-free, per-STATE knobs (`world_builder.gd:37-100`, `STATE_RELIEF` COLORADO 1.0 → FLORIDA 0.0). The land already rolls in relief states. |
| "roads could climb" (implied) | Roads are **hard-flat by law**: `ROAD_FLAT_M 90` + 90m fade, towns flat 150m (`relief_at`, wilderness-only law). NO road climbs anywhere — that's the actual gap. |
| "there's a relief hook at 0.0" | It's not a hook, it's the shipped v1 dict; the code comment names the follow-up: *"graduating it to a usmap.json field + a MapForge painter is the banked follow-up"* (`world_builder.gd:48-50`). |
| "water_depth_at authority exists" | **It does not.** Zero grep hits in `game/proto3d`. Water is biome-binary; cars get a flat grip/speed tax (`car_3d.gd surface_grip_mult/offroad_factor`). Any river work BUILDS the depth authority, not "extends" it. |
| "60 pending junctions" | **60 junction rows** carry `grade:"separated_pending"` (usmap.json); the latest bake lint headlines **6 interstate×interstate blind crossings** (I-95×I-40, I-90×I-75, I-80×I-75, I-70×I-75, I-40×I-75 + 1). Both numbers are real: 60 rows to convert, 6 marquee sites. |
| "billboards, mile markers, rest stops barely placed" | **M4b ADDRESS FURNITURE SHIPPED**: mile markers on the exit mile, route shields every ~2km, WELCOME monuments at state lines, billboards with risk-conditioned text (`world_stream.gd:1039-1130`). **45 rest_stops + 5 weigh_stations already placed.** The remaining gap is billboard CONTENT (static "LAST GAS / NEXT EXIT" → real exit services at real distances) — not the furniture. |
| "silhouette system supports town landmarks" | Half-true: per-category silhouettes ship on structures (`structure_builder.gd:156-222`); the town `landmark` field exists but only 3 towns use it, all hardcoded (vegas/stlouis/washington in `_stamp_town`, `world_stream.gd:1464+`). Water towers placed ×2, grain elevators ×9 — no seeded per-town landmark law. |
| Ecotones, districts→engine, ghost-site vocabulary | Confirmed as described: no biome blending (hard 500m seams), districts are editor-only (`usmap.gd load_file` never reads them), dirt-spur payload vocabulary = farm/still/quarry/hermit/stand/cemetery ×76 (no decayed-Americana kinds). |

**Standing assets these arcs inherit:** the ELEV road channel + pitched-deck/pillar
builder (`elevation_sim` 25), track pieces + destructibles, surface-handling rows
(grip prices grades already), vegetation rows, town layout v2, THE WORLD PHOTOBOOTH
(`docs/renders/world/`), the void net (`proto3d.gd:892-930 VOID_Y`, shipped), and
five-point relief floor sampling (GROUND_INTEGRITY G4, shipped).

---

## ARC 1 — THE VERTICAL COUNTRY (relief bands → rivers/bridges → overpasses)

One geometry story; two `/goal` sessions. Session A = relief. Session B = water + decks.

### 1A. Painted relief — the country gets its ranges

**The law:** relief stays THE ONE FIELD (`ground_y`) — we upgrade its *amplitude
input* from a per-state scalar to painted bands, and finally let ROADS climb.

1. **Relief as rows**: `usmap.json` gains a `relief` grid (same char-grid style as
   biomes — a compressed 150×85 byte layer, 0-9 → 0.0-1.0) folded through
   `ProtoUSMap`. `relief_at()` reads the grid with bilinear smoothing; the
   `STATE_RELIEF` dict becomes the code-stock fallback when the grid is absent
   (the vegetation.json overlay law, again). Rockies band, Appalachian spine,
   river-valley troughs get PAINTED, not per-state-averaged.
2. **Roads climb**: replace the hard `ROAD_FLAT_M` clamp with **grade-limited road
   relief** — sample `ground_y` along each road polyline at bake time and write the
   result into the road's existing `elev` channel (the RDS field!), capped at ~6%
   grade with smoothing. The streamer already builds pitched slabs/decks off `elev`
   (`elevation_sim`) — this step is a BAKE PASS (`bake_road_relief` in
   bake_junctions.mjs), not new engine tech. Terrain under the road then fades TO
   the road's elev instead of to zero (update `relief_at`'s road fade to lerp toward
   road-elev, not flat).
3. **MapForge relief painter**: a RELIEF layer next to the biome PAINT tool —
   brush 0-9 bands, contour tint view; `GET/POST /api/grid?layer=relief`. The ELEV
   vertex tool remains for road-specific overrides (the painter feeds the bake;
   the bake writes road elev; hand ELEV edits win — field-preserving law).
4. **Altitude/slope coloring** (from TERRAIN_RELIEF.md): ground material tints
   grey-then-white above altitude thresholds; slope steepness darkens. Cheap, sells
   every ridge.
5. **RELIEF_MAX_M** graduates 24 → 48 in painted-band states (doc range 20-80),
   ONLY where the grid says so — Florida stays 0.0 byte-identical.

**Watch-outs (paid-for knowledge):**
- Execute against GROUND_INTEGRITY: five-point floor sampling is already law; keep
  the void net green. Authored Meridian slab (±6000) is flat by construction — the
  relief grid must carry 0 there (assert it in the sim).
- Sloped terrain × surface-handling character is a FEATURE (wet dirt grade = real
  fight) but staged sims assume flat ground — expect the sim-staging tax; re-declare
  flat ground via `surface_override`/flat-band staging, never weaken the law.
- `frontier_sim`, `road_lane_sim`, `junction_law_sim`, `stream_budget_sim` stay
  green at every step — they caught every regression this week.

**Sims:** `relief_paint_sim` (grid fold law, bilinear read, Meridian-zero,
Florida-zero regression, road-grade cap ≤6%, road-elev bake determinism) + a
driven-climb check (car gains altitude on a painted-band interstate on REAL inputs).
**Photobooth:** baseline+after at a Colorado pass, an Appalachian grade, Florida
(must be pixel-identical), Meridian (identical).

### 1B. Rivers with real bridges + the 60 overpasses

1. **Rivers materialize**: the 6 river rows render as carved water corridors —
   ground depresses along the polyline (a river term in `ground_y`: depth ~3-5m,
   width per-row, banks eased), water sheet on top, and **`water_depth_at(pos)`
   is BORN** as the one water authority (0 on land, depth in channel) — cars
   consult it (shallow ford = the current water tax; deep = float/drown per the
   on-foot swim law), the map paints it.
2. **Bridge decks**: every road×river crossing gets a bake-minted `elev` hump +
   the RDS deck builder (deck collision + rails + pillars — already shipped).
   A bake lint lists river crossings with no road (fords) — those stay fords.
3. **Overpasses**: a bake pass converts `separated_pending` junctions to real
   grade separation — the CROSSING road gets an elev hump over the through road
   (deck + pillars, clearance ≥5.5m), junction grade flips to `"deck"` (the
   junction painter already colors decks, `app.js` junction tint). Start with the
   6 marquee interstate crossings, then the long tail of 60.
4. **Chokepoint hooks (rows only, no AI)**: bridges/overpasses tagged in junction
   rows (`kind:"bridge_deck"`) so the banked bandit-director arc can hold them later.

**Sims:** `river_sim` (carve depth, water_depth_at authority, ford vs deep, bridge
deck collision — drive a REAL car across a bridge and through a ford),
`overpass_sim` (separated_pending → deck conversion count, clearance law, both
roads still drivable through the junction on real inputs). Guards: junction_bake,
junction_law, road_lane, graph_health orphans.
**Photobooth:** the Mississippi from a bridge deck; an I-75 overpass.

---

## ARC 2 — THE READABLE ROAD (town identity + exit-service billboards + ecotones)

Entirely data/bake-side. One `/goal` session. No new engine tech.

1. **Landmark-per-town**: `stampTownStreets` seeds ONE identity landmark per town
   from a weighted set (water_tower w/ town name Label3D, grain_elevator, church
   steeple, radio mast) — placed at the town's tallest-visibility corner; the
   `landmark` field gets WRITTEN so the sign system ("— THE RUSTED ARCH") names it.
   The 3 hardcoded landmark towns keep their bespoke builders (skip them).
2. **The farm-belt ring**: towns fade in through worked land — a bake ring
   (radius ~300-500m) writes `farmland` biome cells around each town (grid edit,
   respecting water/urban), so vegetation rows produce crops/windbreaks and the
   approach reads "civilization ahead" before the sign.
3. **Exit-service billboards**: upgrade M4b billboard text from static strings to
   the REAL next exit's `service_tags` at real distance ("GAS — FOOD — 2 MI",
   computed from exit rows on the same road arc; risk ≥3 keeps the wasteland
   variants). This is the "info is earned" GPS-less driving payoff.
4. **Ecotone blend bands**: biome edges blend across 1-2 chunks — `veg(biome)`
   counts lerp by distance-to-biome-edge (a cheap 4-neighbor grid check at chunk
   spawn; forest thins into plains, scrub sparses into desert). Density is already
   data; this is one modulation factor in `_spawn_chunk`.

**Sims:** extend `city_layout_sim` (every generated town has exactly 1 landmark,
landmark field written), `vegetation_sim` (ecotone factor: edge chunk count <
interior count), a billboard check in `road_sim` or new (billboard text matches the
next exit's real services/distance). Guards: town_grid, map, frontier, network_fill.
**Photobooth:** a town approach at farm-belt distance; a billboard readable at the
wheel; a forest→plains ecotone seam before/after.

---

## ARC 3 — THE LIVING MAP (districts→engine + ghost sites)

One `/goal` session. Also where Meridian's split-brain gets unified.

1. **Districts feed the engine**: `usmap.gd load_file` reads `districts`;
   `district_at(pos)` joins the query family; consumers: (a) ground tint per
   district kind (downtown asphalt-grey, yards oil-stain, fairgrounds trampled),
   (b) the v2 town generator prefers district building pools when a town HAS
   painted districts (Meridian's three exist today — the unification seam: the
   generator can then run on authored towns' EMPTY blocks without touching hand
   placements), (c) spawn gates (population/threat rows can filter by district —
   rows only, wired when those arcs land).
2. **Ghost sites**: extend the dirt-spur payload vocabulary with decayed Americana
   — `dead_motel`, `dead_gas`, `drive_in_ruin`, `roadside_attraction` (the giant
   ball of rust). Each = a small placement cluster stamp (ruined shells from the
   catalog + town-dressing junk + a themed cache) minted by the network-fill pass
   with the SAME payload law (a dead dirt road is a lie — network_fill_sim
   already enforces leads_to). Natural loot/ambush venues for the banked bandit
   arc.

**Sims:** `district_sim` (fold, district_at, tint applied, generator pool
preference), extend `network_fill_sim` (new payload kinds materialize). Guards:
meridian_town_sim (hand placements untouched), city_layout_sim.
**Photobooth:** Meridian yards vs downtown tint; a dead motel off a dirt spur.

---

## THE PER-ARC DISCIPLINE (what actually shipped three arcs this week)

1. **Baseline photobooth FIRST** — before/after is the only honest "does it read."
2. **Rows before code** — data with code-stock defaults; a missing file changes
   nothing; the sim proves the fold law.
3. **Budget the sim-staging tax** — physics-adjacent changes break sims in
   legitimate ways; flip asserts WITH the code, never around it.
4. **Commit per lane, push, MERGE TO MAIN at arc end** — the merge law is the
   definition of done; early commits saved the last arc when the session limit
   killed both subagents mid-flight.
5. **Surveys delegate, implementation goes INLINE** — it was faster inline once
   survey context was loaded; assume subagents may die.
6. **Guards green at every step**: frontier, road_lane, junction_bake/law,
   stream_budget, map, world, traffic, meridian_town + the arc's own new sim.

## SIZING & FIRING ORDER

| Arc | Sessions | First `/goal` line |
|---|---|---|
| 1A relief bands + climbing roads | 1 (big) | `terrain relief bands per TERRAIN_RELIEF + GROUND_INTEGRITY — painted ranges, roads climb at capped grade, Florida/Meridian byte-flat, do not cut corners` |
| 1B rivers + bridges + overpasses | 1 | `rivers carve, bridges deck, the 60 separated_pending junctions become real overpasses — water_depth_at is born, do not cut corners` |
| 2 readable road | 1 | `town landmarks + farm belts + exit-service billboards + ecotone blending — the road tells you where you are` |
| 3 living map | 1 | `districts feed the engine + ghost sites on the dirt spurs — unify Meridian with the v2 generator` |
