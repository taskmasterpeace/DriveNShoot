# THE AMERICAN ROAD — junctions, addresses, buildings, and the look of the country

**Status:** GREENLIT design spec (owner directives 2026-07-09, voice): *"How are we gonna do these
roads?… the roads don't connect to each other… everything should be the highway, then the exit off it,
and that could be the town — Miami might be exit one off I-95… Should I do internal buildings first?…
I want it to look like AMERICA: the expressway, the exits, the fields next to the road in one place,
the forest next to the field in another. I don't know how we're gonna do mountains… we need ALL the
buildings — the types, and then the interiors."*
**Ground truth verified (9-agent workflow: 3 readers / 4 designers / 2 critics, all against the live
repo):** 126 roads (10 interstates, 109 ramps, 5 backroads) + 88 exits + 59 towns + 166 placements;
the ONE geometry law is real and shared. **The owner's complaint is literally true at geometry level:**
where roads meet, slabs merely overlap with a ≤24 mm z-lift — no intersection slab, no gore, no law;
the divided-highway **median barrier runs unbroken through junctions** (a car arriving on I-80's
6-lane at the I-95 T is walled off); **blind crossings exist** where interstates cross with no shared
vertex at all; and **traffic has no graph** — an agent follows ONE polyline and *evaporates* where
I-90 becomes I-95. Exits are real (ramps, signs, archetypes) but numbering is creation-order, the world
holds a split canon (a streamed "EXIT 1 — MERIDIAN" 200 m from an authored "EXIT 9 MERIDIAN" slab),
and only 82 of 166 placements carry structure-profile ids — the rest are gray boxes.
**Core law:** *A road network is a graph, an exit number is an address, a building is a row with a
JOB, and the corridor is the game's face — the player is at the wheel for most of every session, so
the space between exits is where "America" lives.*

---

## 0. Ratified rulings (reconciles the facets + both critiques — binding)

| # | Ruling |
|---|---|
| **0.1 THE ADDRESS LAW — Exit 9 canon wins.** | One constant: `EXIT_MILE_M ≈ 1450 m` (the game-mile), **origin = the south/west end of every highway** (AASHTO convention — the build-order facet's north-origin is corrected). `exit_number = round(arc_s / EXIT_MILE_M)`, tuned so **MERIDIAN = I-95 EXIT 9** (the authored slab at `world_builder.gd:432` and `races.json` are canon; the streamed "EXIT 1" and `exit_blueprint_sim:72/96` flip in the same commit — the `rig_v2_sim:95` precedent). **Mile markers use the SAME game-mile** so EXIT N stands near MILE N (the real American invariant); the 26.822 m true-mile examples are deleted. Advance signs say *"EXIT 9 — MERIDIAN — NEXT RIGHT"* (no distance fiction). Exit **ids** (`I-95_X1`) never change — saves/`known_to_player`/`dest_exit_id` survive; only the display number renumbers. MapForge assigns by milepost at create (`count+1` at `server.mjs:391` dies). |
| **0.2 THE JUNCTION LAW — one engine spec.** | The NETWORK facet owns the engine; the BUILD-ORDER facet owns phase numbers only. One file **`road_graph.gd` (`ProtoRoadGraph`)**, **Dijkstra with time-cost** (cost matters: a 16 m/s backroad must lose to the interstate). One junction row schema: `{id, kind: tee|cross|ramp_mouth|ramp_rejoin|end_cap, grade: flat|separated_pending|deck, control: gap|riro|none, pos, legs:[{road, arc_m}]}` — `gap_half` is **derived** (0.3), never stored. **Ramp mouths are `control:"riro"` by definition — an exit NEVER opens the median** (right-in/right-out; preserves ROAD_TRAFFIC_OVERHAUL's crossing-only-via-exits ruling at all 88 exits); only `tee`/`cross` earn `gap`. |
| **0.3 THE GAP FORMULA — one number.** | `gap_half = width(cross_road)/2 + 6.0 m`, symmetric about the node's projection onto the barrier run. Worked (the sim asserts it): I-80 arriving at the I-95 T → I-95 (6-lane divided, 27.2 m) opens `13.6 + 6.0 = 19.6 m` each side — a **39.2 m mouth**. |
| **0.4 THE BLIND-CROSSING ROSTER IS A BAKE OUTPUT, never spec text.** | Both facets hardcoded the grounding's list — and the critic's independent audit proved it wrong (phantom crossings, ~2 km coordinate errors, and it **missed I-95×I-40 at (-708,3724)** — a divided×divided crossing on THE CRIMSON MILE ~900 m from Meridian, the first grade-sep the player will actually see). The seg×seg audit (crossing angle ≥15°, no node within snap) is the ONLY source of truth; the bake prints the roster in its lint report; `junction_bake_sim` asserts ZERO unbaked crossings remain. Divided×divided crossings triage to `grade:"separated_pending"` (barrier stays UNGAPPED, no transfer) until M2 decks make them real overpasses. |
| **0.5 CHARACTER PRESERVATION.** | The bake NEVER redraws the owner's roads: non-endpoint vertices move 0 m; an endpoint may snap ≤ `snap_m` onto a host segment; inserted vertices are colinear with their host. The Meridian AUTHORED rect is skipped by the town stamper, but **`EXIT-meridian`'s mouth lies OUTSIDE the rect** — the ramp-mouth re-anchor applies to it, `road_lane_sim`/`exit_blueprint_sim` are named regression gates, and the agent's lane transfer eases over ~0.5–1 s (no lateral pop). All ramp resolution goes through `ramp_ids`, never name patterns (Meridian's ramp is `EXIT-meridian`, not `*-off`); the runtime exit fold gains `ramp_ids`/`known_to_player`/`town_id` (today `_ramp_for`'s ramp_ids branch is dead code). |
| **0.6 ONE CANONICAL ROW TABLE.** | THE BUILDING BOOK catalog (§4) is THE definition for every structure/furniture row; other sections cite ids only. Resolved: `rest_stop` 16×10 walk-in `can_be_safehouse` · `truck_stop` 30×20, own type · `water_tower` is a catalog row placed via placements (never hardcoded in the town stamper) · the Library shelf furniture id is **`bookshelf`** (matches THE_LIBRARY.md's manifest). |
| **0.7 M0 IS BIGGER THAN THE WIRE, smaller than a migration.** | The true stat: **82 of 166** placements carry profile ids (148 was the near-an-exit count). M0 = the materialize wire **+ pure-row migrations** for the legacy ids (`ruined_house`, `market_stall`, a `gas_station→gas_station_small` alias, `safehouse` shell) — doubling the visible payoff to ~150 placements for row work. The `PLACEMENT_SIZE` fallback **stays** until M5 (deleting it early turns un-migrated towns into nulls). |
| **0.8 TOWN STREETS v1 = STREET KITS.** | `street_kits.json` — 2–4 short road ROWS + placement slots per exit archetype, junction-baked, replacing `_stamp_town`'s husk ring. The BSP block-grid law is the documented T3/T4 metro **upgrade path**, not v1. |
| **0.9 NO PORTAL INTERIORS BEFORE THEY'RE PROVEN.** | `mall_dead`/`bunker_survivalist` are M8+ backlog rows. **The howler den re-tiers to a SURFACE den for its P2** (an open culvert/drain mouth + wake-on-approach occupiers — the Carousel `_spawn_occupation` pattern proves dangerous dens work open-air); the true underground portal interior is the P3 ambition once portal tech is proven on something. *(This amends LIVING_WOUND_ECOSYSTEM §3.13's den phasing — edited in the same commit.)* |
| **0.10 THE HONEST M6 GATE (ecosystem).** | The ecosystem's **hard** prerequisites are its own: the dormant population-cell wiring + the banked `population_cell_sim` hang fix. Its "overpass" habitat is a data qualifier (`lanes ≥ 4 or divided` in the sector) satisfiable TODAY — **M1/M2 are NOT gates**. Soft/aesthetic gate: M4a's look on I-75. **The ecosystem runs in PARALLEL from ~M2 onward.** Roadkill props register in the ecosystem's real interface (per-body `corpse.heat`, aggregated ÷3.0), and grazers ride `population.GROUPS` — no invented metas. |
| **0.11 THE INTERIOR LOD LAW (perf).** | Measured truth: the densest chunk (`-441,-28`) holds **8 placements** — wire-only already ≈ 40–56 wall bodies vs the ~34-body worst-case measurement. Law: chunk-spawn builds **shell + sign + chest only**; partitions + furniture build **on approach** (~40 m wake — the carousel idiom) and free on exit; ≤2–3 full interiors per chunk, rest open-shell. `structure_wire_sim` asserts the body count **on the measured worst chunk**, not a synthetic one. (Open question flagged: is 34 a budget or just today's worst? A ceiling test sets the real number.) |
| **0.12 CAMERA-HONEST AMERICA.** | The driving camera is near-vertical (height 9–58 m, FOV 62, ground window ≈ ±50–90 m) — **the 120–384 m "backdrop band" is off-screen at the wheel; there is no horizon.** Mountains read **underfoot**: relief + snowline/rock tint, flanking ridge walls inside the ~90 m window, long shadows/palette. Distant ranges + the water-tower silhouette live where distance actually renders: **binoculars (240 m), V-views, the drone, and the atlas**. One staged screenshot from the real rig gates ANY backdrop spend. **Billboards:** fixed posts+panel for the silhouette, but the TEXT is a camera-facing Label3D (the proven `sign.gd` BILLBOARD_ENABLED grammar) or the panel tilts 40–60° sky-ward; acceptance = legible in a staged frame at cruise, else billboards ship silhouette-only. |
| **0.13 E% IS INSTANCES, NOT TYPES.** | Enterable-percentage targets key to **placement instances in a fixed test rect**; M5's five walk-in types are chosen **by instance count** across the ~150 profile-id placements (likely: house_small, gas_station_small, diner_roadside, motel_strip, police_station). The 42-row catalog lands as rows immediately (rows are cheap), each tagged M5/M7/backlog so "catalog complete" never reads as "interiors due." |
| **0.14 SCALE FICTION.** | Buildings AND towns are 1:1 islands; the 60× law compresses only the land between. No fiction-km conversions inside town grids. |
| **0.15 FUN ADOPTIONS (rows on shipped patterns).** | **Dead-exit ghost towns** (the `dead` archetype finally gets content: boarded husks, one live vending machine, a faded billboard — danger-4 destinations that feed corpse_heat) · **sign condition as danger telegraph** (weathered/bullet-holed ProtoSign variant at `risk_rating ≥ 3` — the read IS the warning; "THE BURNED RAMP" finally burns) · **state-line monuments** ("WELCOME TO FLORIDA" structure rows auto-placed where an interstate crosses a state boundary — the bake already walks arcs — the most iconic drive read in America) · **route reassurance shields** ("I-95 SOUTH" every ~2 km, billboard-text grammar — the missing third leg of the address system). All M4b/backlog. |

---

## 1. The connectivity verdict (ground truth, answering the owner)

Three levels, three different answers — which is why it *feels* wrong to drive:
- **Data:** partially connected, implicitly — 13 interstate↔interstate shared vertices exist and every
  exit's ramps + the 5 backroads share exact vertices at exit destinations (a real secondary network in
  the data that nothing uses). But there is **no junction table**, and blind crossings exist (0.4).
- **Geometry:** NOT connected. Junctions are two overlapping slabs at a ≤24 mm z-offset; the median
  barrier is a physical wall straight through every T and crossing; ramp mouths on divided highways
  emerge from under the barrier.
- **Traffic:** NO graph. One polyline per agent; the only transfer in the codebase is highway→own-exit.
  Cars evaporate at shared vertices; the 22 on-ramps and 5 backroads have never carried a vehicle.

The fix is one law (§0.2–0.5): bake `junctions[]` from the coordinates already in the file, gap the
barrier at flat nodes, paint one intersection slab per node, and generalize the exit-transfer into
node-transfer so traffic, motorists, and convoys all route on `ProtoRoadGraph`.

## 2. The milestone ladder (the build-order answer: ROADS FIRST — with one free buildings win)

The dependency graph resolves the owner's waver unambiguously. Leverage law: `L = units × visibility /
days` — the materialize wire scores ~150 and jumps the queue; everything else is roads before deep
interiors, with ecosystem/weather/library interleaved where their real dependencies unlock.

| M | Name | Definition of done | Sims |
|---|---|---|---|
| **M0** (~2–3 d) | **TRUE-UP + FREE WINS** — the materialize wire (`_spawn_placement` → `ProtoStructureBuilder.materialize` for profile ids) **+ the legacy-id migration rows (0.7)**; MapForge placement-id validation; `STATE_RELIEF` → rows with **FLORIDA 0.0** (today it rolls ~4.8 m!); cherry-pick GROUND_INTEGRITY.md from main | drive to HOLLOWPOINT: every placement is a signed, chest-seeded shell | `placement_wire_sim`, `structure_data_sim` |
| **M1** (~1–1.5 w) | **THE JUNCTION LAW** — bake `junctions[]` (13 vertices + 88 exits + audited blind crossings); `road_graph.gd`; barrier gaps (0.3); intersection slabs; `_maybe_transfer` at nodes (cars continue I-90→I-95; backroads + on-ramps finally carry traffic) | stand at the I-80/I-95 T, watch a car turn through a real gap | `junction_bake_sim`, `junction_law_sim`, `traffic_transfer_sim`; `road_lane_sim`/`traffic_sim` assertions FLIP with the law |
| **M2** (~1 w) | **GROUND INTEGRITY EXECUTED** — void net, floor-first, 2 m floors + CCD, 5-point relief sampling, **real bridge decks** (resolves `separated_pending` into overpasses; builds the ecosystem's I-75 den site) | can't fall through the highway at any speed; a car crosses the canal on a deck | `ground_integrity_sim` |
| **M3** (~1 w) | **THE ADDRESS LAW** — milepost renumber (0.1, Meridian = 9); `town_id` on exits; atlas/radio/signs speak addresses ("MIAMI — I-95 EXIT 21"); **street kits v1** (0.8) replace the husk ring; motorists route multi-road | "how do I get to Rosewood?" answerable with highway + exit; the exit leads to streets | `exit_address_sim` (strictly increasing along arcs; Meridian == 9), `town_grid_sim` |
| **M4a** (~3–4 d, parallel with M2/M3) | **CORRIDOR KIT #1 (Southeast)** — fences, utility poles, guardrails, field patches, verge — the band pass in `_build_road_stretch` (needs only M1) | a 60-second I-75 drive reads as Florida in a screenshot | `roadside_band_sim` (instance counts, body budget, drape) |
| **M4b** (after 0.1 lands) | mile markers + billboards (camera-honest, 0.12) + route shields + state-line monuments + rest_stop/truck_stop/water_tower rows at chosen exits + ghost-town kit (0.15) | EXIT N stands near MILE N; the water tower says the town's name | extends `roadside_band_sim` |
| **M6** (parallel from ~M2; owned by LIVING_WOUND §9) | **ECOSYSTEM PHASE 1** — hard gate: population-cell wiring + sim-hang fix (its own spec's step 0). Soft gate: M4a on I-75 | "the Alley is alive — don't stop under the overpass" | its own suite |
| **W** (parallel, any time after M0) | **WEATHER & SEASONS** — road-independent (verified); land during M3–M5 so `season_mult` rows exist before M6 couples | — | its own suite |
| **M5** (~1.5 w, after M3) | **CATALOG RECONCILED + 5 CORE ENTERABLES** — `building_type` join field; buildings.json + `PLACEMENT_SIZE` retire into rows; the five house.gd laws generalize into the builder (**`ProtoInteriorSkin`**: roof-hide, front-fade, floor-fade + RAMP-not-steps + the footprint furnisher); wave 1 = the five by instance count (0.13), **LOD law (0.11)** | walk into the Hollowpoint diner: roof hides, front fades, register loots | `shell_recipe_sim` (real walk-ins), `furnisher_sim`, `furniture_container_sim` |
| **M7** (~1–1.5 w) | **INTERIORS WAVE 2 + THE LIBRARY IN THE WORLD** — `interior_template` room kits (clinic/church/courthouse/warehouse/radio); the **`bookshelf`** furniture row makes books findable in houses; furniture persistence gap closed | — | `interior_template_sim`, `furniture_persist_sim`, `library_shelf_sim` |
| **M8** (~1 w) | **MOUNTAINS (camera-honest)** — relief rows + MapForge relief painter; state-border blending; `RELIEF_MAX_M` → 80 in heavy states; **snowline/rock tint underfoot** (the single biggest "Colorado" read); pass-gate structures; ranges/silhouettes in binocular/atlas layers only (0.12) | Colorado is climbs, ridge walls, and snowline beside the road | `border_blend_sim`, `snowline_sim`, `terrain_relief_sim` |

**The discipline list (binding):** no asset shopping (banked owner verdict) · ONE look kit before any
second · no every-building-enterable (open-top shells are honest to the top-down camera) · no
roads-that-climb until traffic rides height (mountains option C deferred) · **no portal interiors before
M7+, and none for the M6 den (0.9)** · no hand-editing junctions before the bake exists · no
freeway-stack art (gap + slab + deck reads correctly top-down) · no fifth building vocabulary, no second
height field · `world_stream.gd` is the hot file — M0/M1/M2/M3/M4 touch it; **sequence them, never
parallelize two inside it**.

## 3. The network law (engine summary; the NETWORK facet record holds full derivations)

`junctions[]` rows in usmap.json (schema 0.2), baked by MapForge (`POST /api/junctions/bake`,
re-runnable, character-preserving) and verified at load. `road_graph.gd` builds nodes↔road-arcs once at
fold; `route(from, to)` is Dijkstra on time-cost; traffic (`_maybe_transfer`), motorists
(`plan_route` v2), convoys, and the autopilot all consume the same graph — one routing law. Barrier
runs skip `±gap_half` around flat nodes; one intersection slab per node paints above the overlap.
Blind divided×divided crossings ride `separated_pending` (walled, no transfer) until M2's decks
promote them to `deck` — the first the player sees is **I-95×I-40, 900 m from Meridian**. Exit
numbering per 0.1; the address surfaces are the sign ladder (advance → exit → town welcome), the atlas,
radio directions, and route shields.

## 4. THE BUILDING BOOK (the owner's "ALL the buildings" — canonical catalog, 42 rows: 19 exist, 23 new)

Every row passes the JOB rule (no box without a purpose). `E` = exists today. Tiers: **walkin** (full
interior via the generalized house recipe) · **lobby** (ground floor real, upper implied) · **solid**
(shell/landmark/compound) · **portal** (M8+ backlog only, per 0.9).

**Residential:** house_small E (10×12, walkin) · house_two_story (10×9×2fl, walkin, can_be_safehouse) ·
ruined_house (migrated, walkin, corpse loot/squatters) · trailer_single (4×11, walkin — the cheap rural
E% workhorse) · apartment_block (20×14×3fl, lobby) · farmhouse_field E (22×16, walkin).
**Commercial:** gas_station_small E · market_general E · market_stall (migrated, solid) ·
diner_roadside E · motel_strip E (walkin room doors, **the paid BED on the road** — Library study
comfort) · bar_roadhouse (brawls/informants) · pawn_gun_shop (contraband law_hook) · auto_shop E.
**Civic:** police_station E (wanted/evidence/impound) · courthouse E (lobby) · clinic_small E ·
hospital_lobby (26×18×3fl) · church_small E (sanctuary-or-law-center by faction) · school_small
(lobby, refugee events) · **library_small (walkin — bookshelf rows, a STUDY-comfort site for THE
LIBRARY)** · fire_station · radio_station E · monument_plaza E · **water_tower (solid landmark — the
town's name painted on, read through binoculars/atlas per 0.12)**.
**Industrial:** warehouse E · junkyard E (compound) · factory_shell (lobby, raider garrison) ·
substation_power (blackout events; the `power_required` upstream) · grain_elevator (the farmland
landmark).
**Road-service (the WORLD_PILLARS promise, finally rows):** rest_stop (16×10 walkin,
can_be_safehouse — bed=bench) · truck_stop (30×20 core+lot, convoy anchor) · weigh_station (cargo
inspection law_hook) · toll_booth (consumes the road row's `toll` — I-70 "THE TOLLWAY" finally
collects) · checkpoint_road E.
**Special:** military_base_shell E · drive_in_theater E · kennel_small E · ranger_station (the
mountains content hook) · *backlog (portal, M8+):* mall_dead, bunker_survivalist · **howler_den —
SURFACE den per 0.9** (biome-placed mouth, wake-on-approach pack, corpse_heat sink).
Clusters (trailer park, main-street row, farm compound) are **stamp templates of these rows** — one
vocabulary, composed.

**THE INTERIORS LAW:** all build-ourselves boxes (the banked no-asset-packs verdict). The five proven
house.gd laws generalize into `ProtoStructureBuilder` v2 + a shared **`ProtoInteriorSkin`** (roof-hide
AABB test, front-fade alpha, per-floor fade) + RAMP-not-steps circulation + a footprint-driven
furnisher (room roles → `furniture_set` rows → loot). Open-top shells stay the honest default;
`roof:true` is earned (safehouses, motel rooms, police). Partitions/furniture obey the LOD law (0.11).

## 5. America, the look (camera-honest summary)

**The corridor band system** (rows in `roadside_kits.json`, keyed by state/biome, executed in
`_build_road_stretch` which already holds the row + perp vector): SHOULDER 0–30 m (verge, guardrail,
mile markers, mailboxes at farm drives — nothing tall; neighborhood houses legally straddle
SHOULDER/FIELD via the driveway rule) · FIELD 30–120 m (**field PATCHES** — rectangular crop/fallow
plots with fence rows oriented to the road, the geometry of American farmland — or the wall of trees,
or scrub) · BACKDROP 120 m+ (**sparse and cheap — mostly off-screen at the wheel per 0.12; its reads
live underfoot and in binocular/atlas layers**). **The furniture of the road:** wire fences, utility
pole runs following the highway, guardrails on relief, mile markers (game-mile, 0.1), billboards
(silhouette + camera-facing text; weathered ads are media/lore tie-ins), route shields, state-line
monuments, roadkill (per-body `corpse.heat`). **Regional identity = kit rows:** Southeast v1 (GA kudzu
walls, FL palms + swamp channels along I-75/I-95), then plains corn, desert scrub+mesa — new kits are
rows, days each. **Mountains, honestly:** relief + snowline/rock tint + flanking ridge walls in the
visible window + climbs the car feels (M8); big silhouette ranges only where distance renders
(binoculars, V-views, drone, atlas). No fake horizon walls the camera can't see.

## 6. Dependencies (bidirectional)

**Reads:** `usmap.gd` (rows, geometry law, folds — gains junctions/stations/relief rows + the exit-fold
fix 0.5), `world_stream.gd` (the hot file), `traffic.gd`/`motorist.gd` (graph consumers),
`structure_builder.gd`/`house.gd`/`world_builder.gd`/`furniture.gd`/`door.gd` (the building substrate),
`sign.gd` (the billboard-text grammar), `camera_rig.gd` (the honesty constraint), MapForge
(`server.mjs` — 4 endpoint families). **Written for:** LIVING_WOUND_ECOSYSTEM (M6 interleave, honest
gate 0.10, surface den 0.9, roadkill interface) · WEATHER_AND_SEASONS (track W; its storm discs render
on the atlas beside the address layer) · THE_LIBRARY (M7 `bookshelf` row + library_small + motel/rest
stop study comfort) · GROUND_INTEGRITY (cherry-picked M0, executed M2) · TERRAIN_RELIEF (M8 executes
its unbuilt half) · BANDIT_CONVOY (convoys ride the roadnet for free after M1).

## 7. Tuning knobs

`EXIT_MILE_M` (~1450, set once by the Meridian=9 constraint) · `GAP_MARGIN_M` 6.0 (2–8) · `snap_m`
24–60 · junction knobs (`junction_straight_bias` 0.5–0.9, `junction_turn_chance`,
`backroad_spawn_share`) · band cadences (`fence_spacing_m` 4–10, `pole_spacing_m` 30–60,
`billboard_per_km` 0.3–1.5, shield every ~2 km) · enterable wave sizes (M5=5, M7=+5..9) · interior LOD
(wake 40 m, ≤2–3 full/chunk) · `RELIEF_MAX_M` 24→80 · street-kit street counts per tier. All rows.

## 8. Acceptance (headless, real inputs, no teleports)

The ladder's sims in landing order (§2), plus the regression floor every step: `road_lane_sim`,
`traffic_sim`, `structure_data_sim`, `furnisher_sim`, `furniture_container_sim`, `terrain_relief_sim`,
`exit_blueprint_sim` — with M1/M3 explicitly **flipping** the old-behavior assertions in the same
commit as the law (the `rig_v2_sim:95` precedent). `road_connect_sim`'s character assert reads:
non-endpoint vertices 0 m; endpoints ≤ `snap_m` onto a host; inserted vertices colinear. Plus one
PLAYTEST_GUIDE DO→EXPECT line per milestone (the §2 DoD column *is* those lines).

**Owner-flip flags (defaults chosen):** Exit-9 canon over true-60× mileposts (0.1) · ramp mouths never
gap the median (0.2) · portal interiors deferred + surface howler den (0.9) · street kits over BSP
grids v1 (0.8). Say the word and any of these flips before M1 lands.

---

*The answer to "what first": **M0 this week** (one wire + rows — 13 towns light up), **M1 next** (the
junction law — your #1 complaint dies), and the ecosystem starts in parallel the moment its own
population-cell prerequisite is wired. The buildings are all named (§4); the interiors have one recipe
and a LOD law; America is a band system plus the honest camera. Nothing here waits on an asset store.*
