# WEB_STREAMING — one country, one chunk at a time

**Status:** **P1 Streamed Arizona SHIPPED 2026-10-22** (what was built, the gate numbers and what it taught: §1.2).
P2 to P5 are still spec; P2 (render origin, K calibration, Florida) is next. **The Phoenix ring, R1 (the city itself)
SHIPPED 2026-10-22** (decision 5 for Phoenix; §1.3); **R2, the residents, built 2026-10-23** (§1.3 "R2 as built"); R3
traffic is designed there, not built.
**Owner of the call:** Robert. **Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`).
**Sources:** a read-only research pass over `web/src` and `game/data/usmap.json` (2026-10-22). The numbers that come from the
data or the code were re-derived from the repo for this document; real-world distances and chunk costs are planning
estimates and say so. The owner's scale rule is in `docs/RESUME_WEB_ENGINE.md`. This is the detailed spec for Phase 5 of
`docs/WEB_ENGINE_PLAN.md`. Canon: `docs/DIVIDED_STATES.md`.

---

## 1. Overview

Today the web engine is one walled 900 m map: Rust Haven, the Phoenix ruins and the Glass Flats desert. This spec removes
the wall and puts the whole United States behind it, driven rather than teleported. The map data already exists.
`game/data/usmap.json`, built for the Godot game, holds 763 roads (10 interstates), 1,339 junctions, 91 exits, 59 towns
(33 cities, 26 holdouts), 2,459 placements, 6 rivers, a 150 × 85 biome grid (10 kinds), 48 states and a relief grid.

**The owner's rule.** The fastest ground vehicle drives Miami to Orlando in about **ten real minutes**, on real
expressways with real exits. The fastest car-class rig is the LAWMAN at 46 m/s (103 mph). Ten minutes of that is
27.6 km of road, against about 378 km in reality: a **road scale near 1:14**. Coast to coast on I-80 is then about two
hours flat out. Distances compress; objects do not. A car is still 4.6 m long and a lane 3.6 m wide.

**At that scale** (K = 5.2, §4 F3) the world is 390 × 221 km. Its ten interstates run 2,249 km (13.6 hours flat out) and
all its roads total about 5,200 km. That cannot be loaded, drawn or even held in float32, so it is streamed.

| Layer | What it is | Budget |
|---|---|---|
| WorldIndex | read-only spatial index of the usmap rows, 1 km buckets, plus biome / relief / state samplers | built at boot, about 20 ms |
| Tier 1, LAYOUT | per-chunk pure data: collision boxes, nav tiles, surface arrays, instance records, spawn points | 5 × 5 chunks in the ring, 64 cached |
| Tier 2, HOT | the same chunk applied to the GPU and the entity layer | 3 × 3 chunks, 12 at most while rows swap |
| Pools | about 15 global InstancedMeshes plus 4 recycled surface layers | at most 124 draw calls (gate 150) |
| Render origin | the sim stays in float64 metres; rendering subtracts a moving origin | a shift every 2,048 m |
| Collision and nav | chunked StaticWorld, a 1,024 m NavWindow, a RoadGraph for long routes | window A* sub-millisecond, graph A* under 2 ms |
| Entities | Full (within 220 m), Ghost (within 3.5 km, typed arrays), Abstract (schedules) | 160 characters and about 20 vehicles at full detail |
| Save v2 | seed, K, data hash, per-chunk deltas, ghosts, a discovery bitset | 10.8 KB raw for discovery |

**Phases** (each ships alone; builds in §3.10, gates in §8):

| Phase | Ships | Proof in one line |
|---|---|---|
| P1 Streamed Arizona | the streamer, pools, chunked collision, NavWindow, I-10 from Los Angeles to El Paso through Phoenix (about 80 km of desert) | 60 s flat out reaches 2.4 km with zero stalls, under 150 draw calls |
| P2 Render origin and Florida | the origin shift, K calibration, a Florida overlay (Miami, Orlando, FL-TPK, 3–4 exits) | Miami to Orlando is 27.6 km ± 3%, `travel` takes 600 ± 30 s |
| P3 Graph and ghosts | RoadGraph, ghost and abstract tiers; traffic, convoys, chauffeur, GPS on the graph | a 30 km GPS route in under 5 ms; a ghost keeps its id, hp and paint through a promote |
| P4 Continent | every biome, river, bridge, town, exit and placement; Meridian at scale 1; the atlas | `cross-country` stays under 1.2 M triangles and 150 calls |
| P5 Persistence and worker | save v2, the discovered map, chunk generation in a Worker | loot in Miami survives a save and a load from Phoenix; streaming p95 ≤ 1 ms |

**Not in scope.** Real slopes (gameplay stays flat 2.5D; relief means mesas, ridges and colour). Regional weather (it
stays global). Anything faster than the ceiling in §4 F6, such as aircraft. Downloaded assets (everything is procedural).

### 1.1 Decisions that stay Robert's call
**Answered 2026-10-22 (Robert):** ten minutes is **flat out** (2); signs read **miles** (3, this spec's game miles along
the built road); **exit ramps must feel real** (4: the ramp itself is built near real size and shape - a long
deceleration lane, a curved ramp at a real grade, a stop at the cross road - while the road between exits is what
compresses). Still open: which vehicle defines "fastest" (1), the access-road cap (4), and city size (5).

1. **Which vehicle defines "fastest".** This spec uses the LAWMAN (46 m/s), the fastest car-class rig. The MOTORCYCLE row
   is faster: `maxSpeed` 52 m/s, so Miami to Orlando takes it 8.8 minutes. If the bike is the reference, K becomes 5.9
   and the world is 13% bigger.
2. **Is ten minutes the flat-out floor or a typical trip?** This spec takes the floor, as `RESUME_WEB_ENGINE.md` does.
   A typical drive averages less than top speed (curves, traffic, fuel); at 80% of top speed the same trip takes 12.5
   minutes. Making that typical trip ten minutes would shrink the world by 20% (K = 4.2).
3. **Units on signs and the speedometer.** A sign reading real miles ("ORLANDO 235") clashes with a ten-minute drive. This
   spec assumes signs show game miles along the built road, so distance divided by speed is the time left, and exit
   numbers stay labels from the data.
4. **Exit density and reach.** The 91 exit rows are one per 24.7 km of interstate (about every 9 minutes). Their access
   roads inherit K: the community sits a median 2.71 km from the highway (3.74 km for T2 and T3), about a minute at top
   speed, where a real exit road scaled by 1:14 would be a few hundred metres. Keep the rows as they are, or cap the access
   road (knob `EXIT_ACCESS_MAX_M`)?
5. **City size. DECIDED (Robert, 2026-10-22): metros ~3 km across, cities ~1.5 km, holdouts and exit towns as they
   are (300-600 m).** Metros are Phoenix, Los Angeles and El Paso. Phoenix keeps its authored 920 m island as the
   downtown core and gains a generated ring out to ~1.5 km radius (residential, an industrial belt, strip malls on the
   arterials, ruins thinning outward, I-10 through it as a city freeway), streamed like any chunk; the ring must be
   alive (enterable buildings with loot, residents, traffic), not scenery. Then the same generator builds LA, El Paso
   and the 1.5 km cities. Order: storeys first (WEB_STOREYS), then the Phoenix ring. Why 3 km: the 1:14 law's own
   answer for Phoenix; 80 s flat out / ~3.5 min at town speed / ~11 min on foot across; 7% of the LA-Phoenix leg. Watch:
   town chunks' prop budget (2,100 a chunk against the pool's 2,000) and layout cost (8-20 ms estimated). **Phoenix's
   ring, R1, is built: §1.3** (measured: a dense ring chunk lays out in 4-6 ms cold, at most 610 props and 866 walls).

### 1.2 P1 as built (2026-10-22)
**What you can drive.** Route 66 leaves the island at both ends and becomes I-10: 87.8 km of interstate (54.5 game
miles) from Los Angeles (mile 0) through Phoenix (mile 26.3) to El Paso (mile 51.4) and on to the dust wall 45 km out.
Two carriageways of two 3.6 m lanes, shoulders, a 6 m median, corners filleted at 800 m and a seeded meander. Three
interchanges where the rows put them: **EXIT 2 FURNACE MILE 9** (service, mile 15.8), **EXIT 4 THE SAND TRAP** (dead,
mile 31.7) and **EXIT 6 LAS PALMAS STRIP** (neighborhood, mile 47.5). Each is built near real size (Robert's ruling 4):
a 220 m deceleration lane and a 70 m taper, a 230 m gore, an S-curved ramp that climbs at under 4% to a stop line and a
STOP sign at a two-lane county road, which crosses the interstate on a bridge with a 7 m deck (fills at 4.5%, guardrails
on every fill over 1.1 m, piers and abutments; the interstate runs under the deck). A live exit's county road runs on to its
community; the dead one stops at a faded sign. Green guide signs (EXIT n 1 MILE, 1/2 MILE, the gore), distance signs to
towns within 1.5 km of the road, PHOENIX signs both ways, state lines and mileposts, all in game miles. Los Angeles, El
Paso, San Diego and Albuquerque stand as dead towns from their placement rows (streets, 111 buildings, wrecks at the
kerb). The desert follows the biome grid and the state: creosote and brittlebush, saguaros and cholla, Joshua trees,
mesquite and palo verde, boulders, wrecks on the shoulder and the median, power poles, a rare shack or camp, and mesas,
buttes and ridges wherever the relief stands up (lobed rims, scrub on the cap, talus at the foot, solid). Convoys spawn
900 m back and run on along I-10. The radar and the big map read streamed tiles past the island.

**Where it lives.** New: `web/src/world/{geo,worldindex,chunkgen,streamer,pools,signs}.js`,
`web/src/data/{streaming.js,usmap.json,golden.json}`, `web/tools/import-usmap.mjs` (`--check` says whether the copy is
current; data hash `ed4aa16f908aab28`), `web/src/scenarios/stream-drive.js`. Changed: `engine/collision.js` (the chunk
ring, floating boxes), `engine/nav.js` (the window), `systems/stunts.js` (relief outside the island comes from the
WorldIndex), `world/city.js` (`ISLAND`, `OUTSIDE` name hooks, no bound walls), `systems/convoy.js`, `ui/hud.js` and
`ui/qol.js` (radar and regional map), `agent/api.js` (`world`, `chunk`, `locate`, `teleport town= mile= dir=`, nine
selftest checks).

**The §8 C gates, measured** (fresh page, RTX 4090, headless Chrome, this machine shared with other agents):

| # | Gate | Measured |
|---|---|---|
| 6 | island hash | `f206a6c8` = golden, `islandMatches: true` |
| 7, 8 | determinism, seams | same hash after a teleport and 30 s, sync and sliced; every edge signature (ground and road) matches its neighbour's |
| 9 | 60 s flat out | **2,601 m** (43.3 m/s average) on the MOTORCYCLE, 0 `cross` and 0 `promote` stalls, 73 draw calls, every 1 Hz sample on the road |
| 10 | nav over the island edge | `path fx=300 fz=0 x=900 z=0 mode=car`: found, 600 m, 0.9 ms of search (the command first lays out the ground between the ends it has not seen: a `query` stall) |
| 11 | no leaks | every pool's `used` and `perf.geometries` back to the start after a lap out and back |
| 13 | perf (night acid storm, the widest zoom, two raider buggies, 120 s held at 46 m/s, 5.5 km through exit 4) | **75** draw calls (413k triangles), frame p95 **6.3 ms**, max 12 ms, pump p95 0.1 ms, max 3.9 ms, 0 stalls, live heap +1.7 / +9.1 MB after a full GC over two runs (an earlier, quieter run: p95 5.2, max 9.5) |
| 14 | 60 m/s ceiling | 0 stalls, 65 draw calls |
| 15 | dust wall | holds from 44,000 and from 44,800 |
| 16 | convoys | a convoy 3.5 km behind is gone, and not before |
| B5 | selftest, stress | **106/106** (97 + 9 streaming) twice on fresh pages on the merged tree; `scenario name=stress` **69** draw calls, **2.18 ms** a frame on two fresh pages; an ABBA A/B against the lead's tip, a fresh Chrome per leg on a busy machine: 3.15 vs 3.11 ms, 69 vs 69-71 calls (no difference) |

**What P1 taught (and where it departs from this spec).**
1. **No car reaches its `maxSpeed`.** Measured flat out on I-10: LAWMAN **37.5 m/s** (row 46), DUNE BUGGY 35.5 (row 40),
   MOTORCYCLE **44.7** (row 52). The driving model settles below the row. So the 60 s gate runs on the bike, and P2's K
   calibration must drive the reference vehicle and use what it really does, not read its row: at 37.5 m/s the LAWMAN
   takes 12.3 minutes from Miami to Orlando at K = 5.2 (decision 1 is still open).
2. **HOT by content distance, not a 3 × 3 ring.** A chunk is put on the GPU when its content comes within 224 m and taken
   off past 300 m. The ring promoted chunks whose content was far off screen, and cost the island's stress scene six draw
   calls; an island chunk's band is now measured from the island's edge.
3. **Relief is layered.** A bridge puts two heights on one spot, so `heightAt(x, z, y)` returns the fill for everyone and
   the deck only for those already up on it (y above h − 2.2); characters carry their ground height (`gy`), and vehicle
   collision passes the car's top so a parapet over a road does not stop the car under it.
4. **`step` builds synchronously.** Agent runs stay deterministic in a hidden tab; the real-time loop pumps. A stall names
   its cause; `teleport`, `screenshot`, `load`, `query` (an agent's `path`/`moveTo`/`drive` laying out the ground it
   routes over) and `test` stalls are expected.
5. **A long drive found a bug.** Every engine overheated on a long highway run: the temperature rose whenever the throttle
   was open, whatever the radiator. Fixed (a sound radiator now settles at 0.4).
6. **Allocation.** The streamer's per-frame path allocates nothing, and over a 5.5 km night run the live heap after a full GC grows 2-9 MB (the bounded caches filling). One heap reading before and one after is not a leak test: a major GC between them swung it by 40 MB either way, so `stream-drive` uses `gc()` when Chrome exposes it (`--js-flags=--expose-gc`). The base game allocates about 26 MB/s while it renders,
   so a 45 ms major GC lands now and then with or without streaming (streaming adds about 1 MB/s while it builds).
7. **Two gates needed fixing.** §8 item 15 passes trivially (from 44,000, 10 s at 46 m/s cannot reach the wall), so the
   selftest also runs it from 44,800. The stress number in item 5 (52 ± 5) is stale: the scene was 68-70 before P1 and is
   69-70 after.
8. **Towns at their authored scale.** The Godot layouts are a few hundred metres across; stretched by 2.6 they read as
   empty lots, so `townScale` is 1 (decision 5 is still open). The interstate's end town has the freeway trimmed back to
   its first street.
9. **The render origin can wait.** At 45 km float32 error is about 4 mm, invisible; P2 brings it with Florida.

**Not in P1** (each belongs to a later phase or is open): GPS and `drive`/`moveTo` routes longer than one nav window (the
RoadGraph, P3); people, traffic and pickups in streamed chunks (ghosts, P3); enterable buildings and loot out of town
(P4); water outside the island (the rivers are dry, P4); persistence of anything out there (P5); El Paso's streets cross
the interstate at grade; a dead exit gets its cross road and bridge but no road beyond.

### 1.3 The Phoenix ring, R1 as built (2026-10-22)
Decision 5 for Phoenix: the authored 920 m island stays the core (Rust Haven, the flats, the camps, the river, the mesas,
the rail), and a generated ring of dead city surrounds it out to a lobed edge near 1.5 km, streamed in chunks like
everything past the island. From the street the island reads as a walled holdout in the middle of a dead metro. The law for
the whole arc is that **the ring must be alive, not scenery**. R1 (this section) is the city itself, which you can walk
into and search. R2 (the residents) is built ("R2 as built", below); R3 (traffic) is designed below but not built.

**Floor plans (2026-10-23, [WEB_FLOORPLANS.md](WEB_FLOORPLANS.md)).** The front-room/back-room shells described below
are replaced for every kind but the warehouse: a house opens into its living room, with the kitchen beside it and two
or three bedrooms and a bathroom down a short hall (`world/floorplan.js`, rows in `data/floorplans.js`); a duplex is two
one-bedroom flats; a workshop, diner, fuel stop or mall unit has a stock room, kitchen, office and restroom behind its
floor. Rooms are typed and furnished as what they are, every piece proved on a copy of the foot nav before it stays.
Houses grew to 11.8-12.9 x 8.8-10.5 m to fit real rooms. The counts and costs below are R1's as first built.

**What is there.** The ring has 901 blocks and 2,477 buildings (926 of them ruined shells open to
the sky, 1,294 lots left empty). By kind: 1,093 houses, 541 bungalows, 243 duplexes, 152 workshops, 99 warehouses, 82 strip malls, 117 fuel stops and 150 diners. By zone: 288 THE BURN, 249 THE DEAD HOUSES, 190 THE STRIP and 174 THE YARDS blocks.
- **Streets** follow the island's own lattice (`world/city.js`: a road every 80 m, 14 m wide), carried outward. Every
  fourth line is a 20 m arterial (x or z = 0, ±320, ±640, ±960, ±1,280). A street exists wherever a city block lies
  beside it, so the grid starts with a road that hugs the island 16 m off its edge and stops where the blocks stop.
  Lines the island names keep their names out here (CENTRAL AVE runs on north and south of Rust Haven); the rest come
  from `STREET_NAMES`. The HUD's street sign names the street you stand on, or the district (`PHOENIX · THE YARDS`).
  Local streets stop 9 m short of I-10's pavement. Arterials cross it at grade and skip only its pavement. I-10 (Route
  66 out of the island) runs through the ring as the city freeway, with nothing built within 32 m of its centreline.
- **The edge** is `radius + Σ amp·sin(k·θ + phase)`, 1,440 m with three lobes (about 1,300 to 1,600 m), never a square.
  The strip runs on along I-10 up to 240 m past it. The last 200 m are THE BURN: ruins whose density falls toward the
  edge, then desert. No mesa stands within 160 m of the city. Power poles and desert scatter keep off the streets and lots,
  and the ground takes on the grey-brown dust of a dead city.
- **Zones are rows** (`src/data/ring.js` `ZONE_RULES`, first match wins). THE BURN is the edge belt. THE STRIP fronts
  I-10 within 160 m and 40% of the arterial blocks, with strip malls of 3 or 4 units (corner store, pharmacy, hardware,
  pawn shop and so on, each with its own door and shelves stocked to match), fuel stops with a canopy and pumps, and diners,
  all over painted parking lots. THE YARDS lie along the Iron Line (x = -360, which runs on north and south through the
  ring as dead track with boxcars on its sidings) and along the dry wash the river left in the north-east: warehouses and
  workshops with roll-up bays and a back office, on paved yards. THE DEAD HOUSES fill everything else with houses,
  bungalows and duplexes facing their streets, back-yard fences and junk. Each zone sets building kinds and weights,
  density, the ruined share, loot tables, wall, roof and floor palettes, wrecks per street and yard junk. No purple, and
  no brand names (`ip-lint` reports 0 deny).
- **Walk-in shells.** Every ring building has walls with door gaps facing the street: a 2.4 m front door, a 4.2 to 5 m
  bay, a 1.8 m back door. No door leaves yet; the gaps are centred on a 1 m nav cell. Window holes in every intact span
  of 4.5 m or more use the island's `holes` mechanism in `engine/collision.js`, so sight and rounds pass over the 0.95 m
  sill while walkers do not. Each building also has a floor, partitions with doorways (front room and back room,
  side-by-side units, a warehouse's office), and a roof that hides when you are inside. Furniture stands against the walls,
  never in a doorway's way, with the middle of every room left open: shelves, crates, racks, counters and dressers are
  containers; beds, tables, couches and benches are not. Ruins lose about a third of their wall spans to stubs or knee-high
  rubble and have no roof.
- **Containers** are real PACK-screen containers (`systems/inventory.js` `registerRing`): ids from position
  (`ring:<x·10>:<z·10>`), loot rolled from that id's seed the first time anyone opens the box (so a never-opened box holds
  the same loot every time), and tables from the unit, the kind or the zone. There are two new tables, `storefront` and
  `pumps`. Only the **hot** chunks' boxes are registered (`streamer.ringOn` / `ringOff`): a chunk going cold takes its boxes
  out, and the inventory keeps what is left in any box someone went through (`ringKept`), so the same box comes back with
  the same contents. Saves carry `ringKept` and a load restores it. Ring beds join `spawns.beds` the same way: you can
  sleep in a dead house, and the town's walkers never claim one.
- **Roofs.** A building's roof instances are recorded per building in its owner chunk (`L.ring.roofs`).
  `streamer.setRingRoof` zeroes or restores those matrices inside the roofs pool's range, and `ringBuildingAt` hands
  `main.updateInterior` a building record with `setRoof`, the same hook the military base uses. The indoor camera
  height, footstep surface and witness room rule all follow it.
- **Maps.** Chunk minimap tiles (the radar) paint the ring's streets, the Iron Line and every building, with ruins paler.
  The big map shows a **metro view** anywhere in the ring and up to 300 m past it: 3.8 km across, the island's own map in
  the middle, every block tinted by zone, every street and building, and the zone names. Click-to-waypoint works. The
  regional 24 km view draws the ring's footprint.

**How it is built** (`src/world/ring.js`, `Ring`, built by `WorldIndex`). Everything is a pure function of `data/ring.js`,
the world seed and the I-10 centreline, and every cache can be dropped.
- `block(k, j)` gives the block between lines 80k and 80(k+1): whether it is city (not touching the island, inside the
  edge), its zone, and its lots. Lots are laid out in the block's own frame (`u` along the front street, `v` away from it)
  and dropped on the freeway or the Iron Line.
- `owned(cx, cz)`: a building belongs to the chunk holding its centre. That chunk builds at most `budget.buildings` (84)
  of its lots, in id order, so any neighbour can tell which of its lots stand. `around(cx, cz)` returns the chunk's own
  buildings and its neighbours' that reach into it.
- `geo(L)` gives one building's shell (wall pieces, collision boxes with holes, floor, roof, partitions, rooms,
  furniture, containers, beds, canopy, fences, junk), cached on the lot.
- `streets(x0, z0, x1, z1)` returns the paved rectangles, split where they meet I-10 (sampled against a 64 m bucket index
  of the corridor, because `W.project` scans about 1,000 segments a call) and clipped at the island.
- `chunkgen.js` has one more stage. Streets go into the road layer: the atlas gained `street`, `walk`, `yard` and `lot`
  bands. Sidewalks, yard pads and parking go into the same layer in strips 5.5 to 6 m wide. Walls, roofs, props and the
  new `floors` pool (+1 draw call, no shadow) take the instances. Collision is clipped per chunk with holes kept. The stage
  yields every 6 buildings. Kerb wrecks and the rail come last, and the minimap tile is painted as before. Ring street
  crossings join the edge signatures.

**The gates, measured** (2026-10-22, RTX 4090, headless Chrome, a fresh page or a fresh browser per run).

| Gate | Measured |
|---|---|
| island golden hash | `islandMatches: true`; nothing streamed inside the island (the existing check, now with the ring around it) |
| chunk layout cost | the live streamer over 453 chunks built in a battery: p50 1.3, p95 4.4, max 10.2 ms. Dense ring chunks laid out cold (8 chunks × 3 runs, every ring cache dropped first): p50 4.3 and p95 9.2 ms of work, of which the ring stage is p50 2.3 and max 6.4 ms, in slices of p50 0.7 ms (the stage yields every 3 buildings). The whole ring cold (212 chunks): p50 5.1, p95 11.9 ms. Single 28 to 49 ms outliers were major GCs from the survey's own allocations, and do not repeat |
| pool fills | per chunk at most (all 212 ring chunks): 866 walls, 610 props, 90 roofs, 54 floors (budget 84 buildings; the densest has 54). The caps were set from that × 12 hot chunks: walls 12,000, roofs 4,000, floors 1,000, props 24,000. Hot over the densest chunk: walls 3,238/12,000, props 2,351/24,000, roofs 273/4,000, floors 184/1,000, never full (here or in stream-drive) |
| draw calls, widest zoom over the densest chunk | 73 by day, 75 at night in an acid storm (HIGH zoom, chunk 0,-3, 54 buildings). In stream-drive's ring phase at HIGH plus the speed lift (camera at 175 m): 118 on the freeway, 86 up the arterial |
| stream-drive | gate: 2,601 m on the MOTORCYCLE, 0 cross and 0 promote stalls, 78-79 draw calls (73 before the ring), frame p95 9.9-10.1 ms against 8.9-9.1. The frame max of 44-52 ms is the same before the ring. The perf phase (past the ring) is unchanged: 75 calls, 0 stalls. The ring phase: 0 cross and 0 promote stalls, pump p95 0.2 ms, max 4.6 |
| stress A/B (ABBA, a fresh Chrome per leg, against `feat/web-engine` a605cf45) | against a605cf45, 16 legs on a loaded machine: 5.47 against 5.45 ms per frame (mean), 70-71 calls on both. Against 20a7758c after the last merge, 8 legs: 3.37 against 3.27 ms (medians 3.44 against 3.26), 70.75 calls on both. No cost: stress stands in the island, and the ring chunks it lays out on its first step cost about 5 ms each |
| selftest | **120/120** (115 + 5 ring checks), twice on fresh pages on the merged tree |

**Not in R1** (deliberately): door leaves, locks and glass on ring buildings (the island's `interiors.js` stays
island-only: thousands of door rows streamed in and out need the interiors system to take chunk-registered rows first),
storeys in the ring, people and traffic (R2, R3), named places and signs on shop fronts (the unit labels live on the
shelves), LA, El Paso and the 1.5 km cities from the same generator, and persistence beyond containers (destroyed
things, bodies, piles dropped out there).

**R2, the residents, as built (2026-10-23).** The ring is lived in, thinly and memorably (Robert: Project Zomboid's
lived-in houses, Deathlands' frontier holdouts, GTA2's districts with their own people). Code: `src/systems/residents.js`;
rows: `src/data/ring.js` `RESIDENTS`, `RES_RULES`, `RES_NAMES`; who lives where is `world/ring.js` `household()` and
`homeOf()`; the agent command is `residents` (and `ring x z` names a building's household).
- **Who, by zone (rows).** Each zone row has `residents: [[kind, weight]]` and an `occupancy` share; a kind with
  `perQuarter` is one building per quarter (the 4 × 4 blocks between arterials) at that chance instead. Across the whole
  ring: **108 scavenger families** in intact houses, bungalows and duplexes of THE DEAD HOUSES (occupancy 0.11, 2-4
  people, at most one armed); **35 squats** in intact strip malls, diners and fuel stops of THE STRIP (0.16, 2-4, up to
  two armed); **18 Dustwolf chop shops**, one per quarter of THE YARDS at 0.85 (3-5 wolves, all armed, faction
  `dustwolves`, a stripped car up on stands in the bay, cots, a lookout who stays up all night at the bay door); **34
  infected nests**, one per quarter of THE BURN at 0.9 (5-8: shamblers, a sprinter in five, and an Echo). About 710 people.
  Every one has a name from the ring's own pools (never npcs.js randomName: its running list of used names would make a
  household come out different the second time), a real flag (`g.randomFlag` on the household's seed; a family shares one
  85% of the time), a face from `outfit` on their own seed, and a gun or not from the row.
- **Records, not characters.** A household is a record keyed by its building's id (`R<k>.<j>.<n>`, §3.7's ghost tier).
  Everything pure (names, flags, guns, beds, rooms, shelves, the day's plans) is a function of the rows and the seed, so a
  record can be dropped and made again; what happens to them (hp, grudges, deaths and by whom, what they carry, their
  bodies' contents, the Echo's work on the boards, thefts) is kept on the record, across a chunk going and coming back and
  across a save (`residents` in the snapshot; residents are never saved as characters).
- **Promote and demote.** A household is promoted when its chunk is hot (layout done) and it is within `promoteR` 210 m of
  you, nearest first, one household a frame in real time (all at once in a stepped run); members go where the game clock
  has them (asleep in bed, at home, on a run at the stop the hour says, the nest in its lair or roaming). Demoted past 300
  m, when the chunk goes cold (`ringOff`), or on a load - never while engaged (a fight, a flight, a hit in the last 20 s, a
  witness carrying word), except when the chunk's layout itself goes. The dead come back as bodies where they fell, with
  what was left on them.
- **The budget.** Residents are ambient: they never take the last 16 character slots (`AMBIENT_RESERVE`, the director's
  events need room) and are 40 at most; they may clear a body long dead out of sight to make room (the clean-up's own rule,
  sooner), never anyone alive. When anyone else needs a slot and none is free, **residents yield first** (`addChar` →
  `residents.yieldSlot()`: the farthest one nobody is busy with, the dead before the living). A promotion asks for no
  layout (only hot chunks), so it can never stall the streamer.
- **Homes, beds, boards.** A household's rooms are its unit (a duplex half, a mall unit) or the whole house; `homeOf()`
  gives each member a bed, laying a mattress on the floor where the house's own beds run out (a household is never bigger
  than the beds it has). Squats and nests board up their front door: planks nailed across the gap, solid to walkers, sight
  and rounds, with crates piled behind, and a back door of their own forced into their unit; a boarded house keeps its back
  yard unfenced so the back door is a real way in (the walkability check holds). The chop shop gets its stripped car. All of
  it from its own rng stream: no other building moves.
- **Their day.** Families and squats sleep 22:30-06:30 and 23:30-07:30 in their own beds, walked to on foot paths (`ai.toBed`
  lies them down; someone at the bedside wakes them as on the island). By day about half of a family (a third of a squat)
  goes out on a run between its leave and back hours, walking to two or three building fronts within 30-110 m, lingering
  there, then coming home with a find in their pockets; the rest potter about their rooms. Wolves sleep 02:30-10:30 with one
  lookout awake. The nest holes up by day in its lair (it only notices what comes within 9 m in sight; a noise rouses it) and
  roams the streets 20:30-05:30 toward a point that changes every game hour, then holes up at dawn in a lair picked for that
  day from up to three buildings of its chunk: it moves. Its Echo stays at the boards of the origin house and works them
  while unwatched (the boards' hp is on the record). Paths are planned three a frame across everyone; a walker who gets no
  closer for 4 s plans again (a progress watchdog).
- **Their things, their eyes.** While one of them lives, the shelves in their rooms are theirs (`box.owner` = the
  household): taking from one is a `steal` deed (`inventory.stole` finds the nearest of them), witnessed under their
  faction's row (drifters for families and squats - who now mind `steal:self` - Dustwolves for the chop shop; the infected
  witness nothing). Whoever saw it holds a grudge (48 game hours, on the record) and says so. They witness everything else
  the way anyone does. Strangers in the ring warn you of the nearest nest or chop shop (`talk.js` road topic).

**R2's gates, measured** (2026-10-23, RTX 4090, headless Chrome, on a machine shared with other agents' browsers).

| Gate | Measured |
|---|---|
| selftest | **131/131 twice on fresh pages** on the merged tree (122 on `feat/web-engine` 5f0ebe9d + 9 R2 checks) |
| stress A/B (ABBA, a fresh Chrome per leg, 16 legs, against 5f0ebe9d) | 4.55 against 4.50 ms per frame (mean, +0.05), medians 4.93 against 4.70 on a loaded machine (legs ranged 3.0-6.4 ms), 70-71 draw calls on both. Stress stands in the island: no resident is ever promoted there. An earlier 8-leg A/B against 2b6fe839: 5.37 against 5.84 |
| stream-drive (ABBA, 4 legs) | 0 cross and **0 promote** stalls in every phase on both builds; the gate 2,601 m on the bike; 79 / 75 / 118 / 86 draw calls (gate, perf, ring freeway, ring arterial) on both. One household's promotion: p50 0.1, p95 0.3, max 1.2 ms |
| draw calls over a lived-in block, widest zoom | 78 by day with the family and its neighbours promoted (selftest checks it under 150) |
| the cap | holds: a check spawns every free slot and four more with residents up; the residents yield (no one else is recycled), the count never passes 160, and they come back when the slots are free again |
| island golden hash | still matches (nothing of R2 touches the island) |

**Learned on the way.** A character removed twice pushed its slot onto the free list twice, so two people shared a slot and
the count reached 161 once in a battery: `removeChar` now ignores someone already gone and records the call in
`g.doubleRemoves` (empty in every battery since). The battery's earlier fights can leave the drifters shooting on sight,
and with squats on THE STRIP a corridor drive became a gunfight: the streaming checks now run with the drifters' standing
as it starts and give it back after the ring's checks. A save (and the autosave, every 3 minutes of calm play) wrote the
residents back onto their records with the same call a demote uses, which also took a promoted body's box out of the world:
the corpse lay there with nothing on it until the next demote and promote. A save now only copies the body; the killing check
saves over the body every time (it failed only on the runs the autosave happened to hit).

**Not in R2:** residents talking about their own house or family (they get the strangers' three topics); ring buildings'
door leaves and glass (a squat's barricade is static collision, and the Echo's work never brings it down: the hp is on the
record, nothing breaks); traffic (R3); residents of LA and El Paso; the island's own population as records (see the
question below).

**Open (for Robert):** with the island populated (136-156 of the 160 characters at any time) and the 16-slot reserve,
residents near you are about 7-20 people at once - thin. Should the island's people far behind you (1 km away, frozen by the
AI's distance cut) be demoted to records the same way, so the ring near you gets the slots?

**R3, traffic (design note, not built).** The ring's lattice is a road graph almost for free: nodes at the
intersections, an edge per street segment (arterials faster), joined to I-10 at the arterial crossings and to Route 66 at
the island. Traffic there means scavenger pickups working the strip, Dustwolf buggies patrolling the arterials at night,
the odd convoy spur into THE YARDS, and parked wrecks (already rows) that can be promoted into drivable cars. It runs on
the P3 ghost tier: lane offset, a choice at each node, 4-way stops at dead signals. Gates: about 20 full vehicles,
stream-drive stalls stay 0, and a car you hit stays hit after a demote.

## 2. Player Fantasy

*You leave the ruins of Phoenix at dawn with the throttle pinned, in the state the Solar King holds. The Furnace Run does
not end at a wall. A green sign says the next exit is a fuel stop three minutes ahead; you take it because the needle says
you must, and a dozen buildings and a pair of bulls are standing where the data says a community lives. Back on the road
the land changes under you without a seam: desert, scrub, farmland, forest, swamp. Nothing loads and nothing pops. The
convoy you heard about on the radio is where it said it would be. By the time you reach the sea you have driven the
whole country, and it took an afternoon.*

The trip times are what make that real. Planning values at K = 5.2:

| Trip | Road | Flat out in a LAWMAN | On foot, running (7.6 m/s) |
|---|---|---|---|
| Miami → Orlando | 27.2 km | 9.9 min | 60 min |
| Los Angeles → Phoenix (I-10) | 42.1 km | 15.3 min | 92 min |
| Phoenix → El Paso (I-10, runs short, §4 F2) | 40.3 km | 14.6 min | 88 min |
| Jacksonville → Miami (I-95) | 41.6 km | 15.1 min | 91 min |
| Longest interstate, I-90 | 359 km | 2.2 h | 13.1 h |
| Coast to coast, I-80 | 334.6 km | 2.0 h | 12.2 h |
| All ten interstates | 2,249 km | 13.6 h | 82 h |

## 3. Detailed Rules

### 3.1 The world frame
- One flat plane in metres. +x is east, +z is south, as everywhere in the engine. Phoenix is (0, 0).
- A usmap point `u` becomes `world = (u − PHX) · K`, with `PHX = (−43250, 7250)` and K ≈ 5.2 (§4 F3). Phoenix stays at the
  origin, so every selftest coordinate, scenario and v1 save stays valid. K is one global number, never per region.
- usmap roads are straight chords between towns, so at the "obvious" K of 60/14 = 4.29 they come out 67–85% of the target on
  the four legs measured (§4 F2). K = 5.2 (1:11.5 straight-line) is what makes the roads, not the chords, hit 1:14.
- **Distance compresses, objects do not.** People, cars, lanes and buildings keep their real size. Cities are islands of
  about 1 km, like Phoenix's 928 m. Only the road between places carries the scale law.
- Authored zones (Meridian) place as `anchor + offset · 1`, never `· K`.
- At K = 5.2 the world spans x −87.1 to +302.9 km and z −144.3 to +76.7 km. That rectangle is all the data there is; its
  edge is handled in §5.

### 3.2 Chunks and the two tiers
The world is cut into 256 m chunks. Chunk `(0, 0)` covers `[0, 256)` on each axis (§4 F4).

| Tier | Holds | Extent | Leaves when |
|---|---|---|---|
| **LAYOUT**, pure data | everything a chunk is, as arrays and records | ring radius 2 around the **centre chunk** (5 × 5); an LRU of 64 chunks | evicted by LRU once outside radius 3 |
| **HOT**, on the GPU and in the entity layer | pool slots written, surfaces uploaded, pickups and entities made, saved deltas applied | 3 × 3 around the centre; up to 12 while a row swaps | released only when 2 chunks from the centre **and** its replacement is already hot |

- **The centre chunk uses hysteresis:** it changes only after the player is 32 m past a chunk edge, so driving along an edge
  does not thrash the rings.
- **Prefetch:** layouts along the road edge ahead are requested for `max(600 m, 12 s · speed)`.
- **A layout is a pure function** of `(seed, cx, cz, dataHash)`. It is built by a generator, `layoutChunk(cx, cz)`, that
  queries WorldIndex and yields between stages, so it runs in slices. Build order, sliced or synchronous, never changes the
  result.
- **What a layout contains:** static boxes (registered into collision immediately); nav tiles, foot 1 m (256², Uint8) and
  car 2 m (128², Uint8); a 2 m water-depth raster if the chunk has water; surface arrays (ground at 8 m, 33² vertices with
  a biome colour; road ribbons and markings; rock patches; water and shore); instance records per pool; building records
  (doors, roof slots); spawn points; a 128² minimap tile.
- **Buffers are recycled.** Nav tiles, surface arrays and minimap tiles come from free lists and go back on eviction, so
  steady driving allocates nothing but small records (AGENTS.md invariant 2).
- **Guarantees:** at least 224 m around the player is hot, and at least 480 m has collision and nav (§4 F6).

### 3.3 The pump, two modes, and the stall guard
- Each frame `pump()` resumes layout generators in slices of at most 0.5 ms until 2.5 ms are spent. At most 1 surface
  upload and 2 pool-range writes happen per frame.
- **Sliced mode** is for real-time play, `bench` and the perf scenarios. **Sync mode** is for `step`, so agent runs stay
  reproducible in a hidden tab.
- **Anything that needs a chunk** calls `ensureLayout(x, z)` or `ensureHot(x, z)`: the player crossing, `teleport`,
  `screenshot`, `load`, entity promotion. If the chunk is not ready it is built synchronously and an event
  `streamStall {key, ms, cause}` is emitted. Perf gates count stalls caused by `cross` and `promote`; a `teleport`, `load`
  or `screenshot` stall is expected and reported on its own.

### 3.4 The Phoenix island
- Phoenix is built first, exactly as today, in the rectangle `|x|, |z| ≤ 464 m` (the research pass's number; it just clears
  the lake at (390, 398), radius 64, which reaches 462 m). P1 re-verifies the edge against the golden hash. Then the
  streamer starts.
- A golden hash of the island's static boxes and buildings guards the RNG sequence in `world/city.js`.
- Chunks skip all content inside that rectangle. The boundary `bound` walls are removed; the ground plane shrinks to the
  island; Route 66 is trimmed to ±464 m and spliced onto I-10; usmap rows inside the island are suppressed, and I-10 and
  `CR-phoenix-vegas` are clipped at its edge.
- Phoenix chunks are pinned. The Iron Line (x = −360), the river, the lake and the mesas stay as built.

### 3.5 Drawing: pools, surfaces, shadows, render origin
- **Repeated things go in about 15 global InstancedMesh pools:** walls, roofs, floors, props, barrels, cacti, trunks,
  canopies, boulders, shrubs, lamp posts, glows, flames, signs, guardrails. Each has a fixed capacity sized for 12 hot
  chunks (props 24,000; walls 12,000) and a first-fit range allocator that merges freed neighbours. Freeing writes
  zero-scale matrices; uploads are partial (`addUpdateRange`). Pools set `frustumCulled = false` and `visible = used > 0`.
  A pool costs one draw call, plus one shadow call if it casts, however many chunks are loaded.
- **Unique things are merged geometry per chunk**, from a recycled SurfacePool with four layers: ground (receives shadow),
  road (receives), rock (casts), water (receives). Buffers are preallocated as DynamicDraw and reused through
  `setDrawRange`, so there is no create or dispose churn and no shader recompile. The layers share `world.groundMat` and
  `world.roadMat`, so sky tinting still applies. Per-chunk frustum culling keeps this at 16 calls plus up to 4 rock
  shadow calls.
- **Rejected:** one InstancedMesh per archetype per chunk (calls grow with chunks × types); BatchedMesh in three r170 (freed
  vertex space is not reused without a full `optimize()`, and per-instance culling runs in JS). BatchedMesh stays a
  fallback if surfaces get tight, through fixed reserved slots and `setGeometryAt`.
- **Shadows:** the sun's shadow box grows with the camera (§4 F7) and snaps its centre to shadow texels, so it does not
  shimmer at 46 m/s.
- **Render origin** (`src/engine/origin.js`): the sim keeps absolute float64 coordinates, so agents always see absolute
  numbers. Every render write uses `x − RO.x`. RO moves in 2,048 m steps when the player is more than 1,536 m from it
  (§4 F9). On a shift: chunk meshes do `position −= Δ`; pools and the persistent decal rings (fx, ambient tracks) subtract
  Δ from their translation floats and upload once (about 30,000 instances, under 1 ms); per-frame pools need nothing; the
  camera, the sun and its target, and the rain box follow render space. About a dozen render write sites need `− RO` (P2
  finds each one).
- **Cheap win:** hide headlight cones when `night < 0.1`. They draw all day at opacity 0.04 and cost one call per driven car.

### 3.6 Collision and navigation
- **StaticWorld keeps its API.** The 8 m global cell grid maps to chunk-local 32 × 32 cell arrays through an 8 × 8 ring of
  slots that checks keys, so hot loops never do a Map lookup. A box crossing a chunk border is listed in both chunks; the
  existing `mark` stamp de-duplicates it. Unloaded ground is empty.
- **NavWindow:** NavGrid gains an origin `(ox, oz)`. The window is 4 × 4 chunks (1,024 m) and is built by copying tiles in.
  `ensureCovers(start, target)` re-centres it when a query needs it (about 0.5 ms); `focus(x, z)` is for tests. Cell
  centres stay on the same 1 m and 2 m lattice, so today's routes, and the "535 m in 1.8 ms" claim, hold. Water and rock are
  baked into tiles; A* across chunk seams works inside the window.
- **RoadGraph** (`src/world/roadgraph.js`) is built from junction legs (roads split at `arc_m · K`), the Phoenix grid and
  overlays: about 2,000 nodes and 3,000 edges in CSR form. Edge cost is `length / speed(kind) · danger`; a nearest-edge hash
  uses 1 km buckets. A long route is graph A* plus window A* for the first and last mile; followers re-plan locally around
  obstacles.

### 3.7 Entities: Full, Ghost, Abstract
| Tier | Range | Representation | Rules |
|---|---|---|---|
| **Full** | within 220 m | today's objects | promote once the target chunk's layout is ready; demote at 300 m or when its chunk leaves the layout set, unless it was engaged or hit in the last 20 s, or is quest-flagged. Caps: 160 characters (existing) and about 20 vehicles (2–3 draw calls each when visible) |
| **Ghost** | up to 3.5 km | typed-array records, `src/sim/ghosts.js` | traffic (capacity 512) `{edge, s, lane, speed, type, paint, seed, hp, id}`; a convoy is one group record `{route edges, s, formation}`; a squad is `{x, z, kind, count, goal, seed}`. Updated at 10 Hz, a sixth of the records per frame, 30 m headway per lane. Crew names and flags are generated from the seed on promotion, so a demoted car comes back as the same car |
| **Abstract** | beyond 3.5 km | per-edge densities, schedules, `src/sim/offscreen.js` | densities from road kind, danger and town tier; convoys follow `position(t)` between towns; town faction and supply tick at 1 Hz. A record becomes a ghost at 3 km, never in view |

Traffic AI becomes edge-following: a lane offset, a junction choice, a speed by road kind. Phoenix's grid is just more
graph, so there is one code path. Convoys spawn and despawn by distance to the player, not by the old map edge `HALF`.

### 3.8 Roads, exits and towns
- **Import.** `tools/import-usmap.mjs` copies usmap, `structure_profiles` and `exit_blueprints` into `src/data/` and records
  a sha as the save's `dataHash`. Rows are data; the streamer never invents a road, exit or town that has no row, except the
  overlays in `content/world/`.
- **Expressways.** Corners are rounded: radius 800 m on interstates, 150 m on county roads, 30 m on streets. A seeded
  meander of at most 60 m is added (under 5% length). Width is `lanes · 3.6 m + shoulders`, plus a 6 m median when
  divided (§4 F12). `lanes` counts both directions (6 means 3 + 3); `divided` is a physical median.
- **Exits.** An exit row's ramps start with a peel-off of about 300 m; the rest is the access road to `dest`. At `dest` the
  builder makes a community from the archetype's `structures_hint`, sized by tier: **T1 4–8 buildings, T2 10–20, T3 25–50**.
  Archetypes in the data: service 25, neighborhood 20, industrial 19, dead 16, county_seat 8, military_spur 2, metro 1.
  A **dead** exit builds its ramp and a faded sign and nothing else. T4 (metro) and `special` exits are a town or an
  authored set-piece, not a community. Exit numbers are labels from the row, never recomputed from distance.
- **Towns.** A city gets core, ruins and outskirts rings like Phoenix; a holdout gets a walled compound. Placements become
  authored landmark buildings (footprint and entrances from `structure_profiles`) with procedural infill along town streets.
- **Height.** `grade: deck` and `elev_mode: structure` become visual overpasses and bridges (59 deck junctions in the data).
  Gameplay stays flat. A road crossing a river becomes a bridge: the water-depth raster is zero under the deck, and the rails
  are collision boxes.
- **States** drive the HUD name and the law. Where a road crosses a state line the generator places a border sign (and, per
  the ruler's law, a gate) *(P4)*.
- **Every generated name is ours.** Towns, exits, shops and signs come from our own row lists and carry the skip-list rule in
  `WEB_FAN_SERVICE_BIBLE.md` §3.3 (display-name law).

### 3.9 Save, discovery, maps
- **Save v2** is v1 plus: `world {seed, dataHash, K}`; per-chunk deltas `{key: {looted, destroyed}}` using deterministic
  local ids; persistent ghosts (parked player cars, named NPCs, convoys with cargo, squads holding grudges); a
  discovered-area bitset at 1 km resolution (about 1 KB after RLE); town state.
- **Load** sets RO, runs `ensureHot` synchronously (about 150 ms behind a LOADING overlay), applies the deltas, then places
  entities. A v1 save loads unchanged. Dev hot-reload uses the same path.
- **Minimap:** a window canvas composed from 5 × 5 tiles (1,280 m), copied again when the centre moves; view radius
  `150 + 6 · speed`, up to 426 m (§4 F13).
- **Big map, three levels:** a continental atlas rendered lazily at 2048 × 1160 (about 190 m per px: biomes, state borders,
  rivers, interstates with their nicknames, towns, exits, fog of discovery); a regional vector view of the road graph (±20 km);
  a local view from minimap tiles. Click-to-waypoint works in world metres; GPS uses the graph route.

### 3.10 Phases, and the new surface in the agent API
| Phase | Builds | New commands | Scenarios and tools |
|---|---|---|---|
| **P1** | `geo`, WorldIndex (interstates and relief only), desert chunkgen (cacti, trees, boulders, scrub, wrecks, shacks, rare camps, mesas from relief), streamer, pools, chunked StaticWorld, NavWindow, minimap tiles, the I-10 splice, a soft dust wall, convoys by distance | `world`, `chunk`, `locate`, `teleport town=` | `stream-drive`; `tools/import-usmap.mjs` |
| **P2** | `origin.js` and the render write sites, K calibration, the Florida overlay (`content/world/florida.json`) and biome profiles, a first town generator (Miami, Orlando) with a canal in Miami, an exit-sign texture atlas | `route`, `travel` | `stream-drive corridor=florida`, `origin-churn`; `tools/usmap-calibrate.mjs` |
| **P3** | RoadGraph, ghosts, the offscreen sim; traffic, convoys, chauffeur and GPS move onto the graph | `ghosts`, `route mode=road`, `traffic density=` | `highway-rush` |
| **P4** | biomes as data rows, rivers and bridges, coast, all towns, exits and placements, Meridian at scale 1, the atlas; the dust wall goes; Phoenix's batches fold into the pools | | `cross-country` |
| **P5** | save v2 and the discovered map; chunk generation moves into a module Worker (transferable buffers, OffscreenCanvas minimap tiles) | | |

The new commands go in `COMMANDS` (`src/agent/api.js`) with `group`, `desc` and `args`, then `node tools/gen-commands.mjs`.
They return at least:
- `world` → `{k, seed, dataHash, ro:{x,z}, islandHash, layout:{resident, cap}, hot:{count, max}, pools:{<name>:{used, cap}}, stream:{stalls, byCause, pumpMs:{p95, max}, mode}}`
- `chunk` (`x z` in metres) → `{key, tier, hash, buildMs, biome, boxes, buildings, instances:{<pool>:n}, edges:{n, e, s, w}}`
- `locate name=` → `{x, z, chunk:[cx, cz], kind, state}`
- `route from= to=` → `{km, nodes, ms, secondsAtVref}`; `travel to= speed=` → `{simSeconds, km, stalls}`

## 4. Formulas

**F1 — The scale law.**
```
D_rule = T_rule · V_ref          S = D_real / D_rule
```
- `T_rule` = 600 s (the owner's rule). `V_ref` = 46 m/s, the LAWMAN row's `maxSpeed` in `src/systems/vehicles.js`.
  `D_real` = 378 km, the real road from Miami to Orlando (planning value; confirm against a map source).
- Range: the **built** Miami → Orlando road must land within 27,600 m ± 3% = 26,772–28,428 m, which is 582–618 s at `V_ref`.
  The effective `S` then stays within 13.3–14.1.
- **Worked example.** `D_rule = 600 · 46 = 27,600 m`. `S = 378,000 / 27,600 = 13.70`, quoted as 1:14. The straight chord
  from Miami to Orlando is 25.8 km at K = 5.2; the road with its shape and meander is planned at about 27.2 km, which is
  591 s (9.9 min), 1.4% under the rule and inside the gate.
- Coast to coast: I-80 is about 4,690 km real, so `4,690 / 14 = 335 km`, `335,000 / 46 = 7,283 s = 2.02 h`.

**F2 — Leg targets and what K = 5.2 builds.** Target is `real / 14`. Built is `K · L_usmap` from the usmap polyline, before
meander. Checked against `usmap.json`.

| Leg | Real road (km) | Target (km) | At 46 m/s | usmap polyline (m) | Built at 5.2 (km) | Error |
|---|---|---|---|---|---|---|
| Los Angeles → Phoenix, I-10 | ≈ 600 | 42.9 | 15.5 min | 8,097 | 42.1 | −1.8% |
| Jacksonville → Miami, I-95 | ≈ 563 | 40.2 | 14.6 min | 8,004 | 41.6 | +3.5% |
| San Francisco → New York, I-80 | ≈ 4,690 | 335.0 | 2.02 h | 64,348 | 334.6 | −0.1% |
| Phoenix → El Paso, I-10 | ≈ 692 | 49.4 | 17.9 min | 7,754 | 40.3 | −18% |
| Miami → Orlando (chord only; no row yet) | 378 | 27.6 (the rule) | 10.0 min | 4,965 | 25.8 chord, ≈ 27.2 with the road | −1.4% with the road |

- Phoenix → El Paso runs short because the data's two towns sit closer than reality; no K fixes it without breaking the
  other legs. It is a known short leg, not a gate.
- Least squares over the first three legs gives K = 5.17; 5.2 is within 1%.
- Range: the three measured legs stay within ±4%. They are diagnostics; the only gate is F1.

**F3 — The import transform and calibration.**
```
world = (u − PHX) · K            L_built = K · L_usmap · (1 + g)
```
- `u` in usmap metres; `PHX = (−43250, 7250)`; `g` is the net length growth from the meander minus the small shortening of
  rounded corners (expected 0.01–0.03; rule: at most 0.05).
- Range: K 4.9–5.5; planning value 5.2.
- **Worked example.** Miami `u = (−2000, 20500)` → `((−2000 + 43250) · 5.2, (20500 − 7250) · 5.2) = (214,500, 68,900) m`.
  Orlando has no row; the planning position, fitted from latitude and longitude, is `u = (−3570, 15790)` →
  `(206,336, 44,408) m`.
- **Calibration rule.** `tools/usmap-calibrate.mjs` solves K on the measured legs, then **checks** Miami → Orlando against the
  F1 gate. If the gate fails, adjust the Florida overlay's road shape first. K moves every other leg.

**F4 — Chunk address.**
```
cx = floor(x / C)      lx = x − cx · C      C = 256
```
- Range: `lx ∈ [0, 256)`. The sim never truncates toward zero.
- **Worked example.** Miami `(214,500, 68,900)` → chunk `(837, 269)`, local `(228, 36)`. Negative: `x = −87,100` → `cx = −341`,
  `lx = 196`. Exact edge: Orlando's planning `x = 206,336 = 806 · 256` is in chunk 806, `lx = 0`.

**F5 — Streaming load.**
```
t_cross  = C / |v_axis|
λ_L      = (2·r_L + 1) · (|v_x| + |v_z|) / C         new layouts per second, upper bound
λ_H      = (2·r_H + 1) · (|v_x| + |v_z|) / C         new hot chunks per second
load     = λ_L · c_L + λ_H · c_A                     ms of pump work per second
headroom = (b · fps) / load
```
- `r_L` = 2, `r_H` = 1. `c_L` = layout cost, 3–8 ms desert and 8–20 ms town (estimates; P1 measures them). `c_A` = apply cost,
  1–2 ms. `b` = 2.5 ms per frame.
- Range at 46 m/s: load 8–27 ms/s; headroom at 60 fps (150 ms/s) is at least 5.6.
- **Worked example.** Desert, driving along an axis: `t_cross = 256 / 46 = 5.57 s`; `λ_L = 5 · 46 / 256 = 0.90/s`;
  `λ_H = 3 · 46 / 256 = 0.54/s`; `load = 0.90 · 8 + 0.54 · 1.5 = 8.0 ms/s`; headroom `150 / 8.0 = 18.8`.

| Case at 46 m/s | λ_L | load (ms/s) | headroom at 60 fps |
|---|---|---|---|
| Desert, along an axis | 0.90 | 8.0 | 18.8× |
| Desert, at 45° | 1.27 | 11.3 | 13.3× |
| Town, along an axis | 0.90 | 19.0 | 7.9× |
| Town, at 45° | 1.27 | 26.9 | 5.6× |

**F6 — Lead time and the speed ceiling.**
```
R_hot = C − h_hys = 224 m        R_nav = 2C − h_hys = 480 m
t_lead = (R_hot − R_view) / v
F_row  = n_row · c_L / b + n_apply          frames to ready one new row
v_max  = fps · C / F_row
```
- `h_hys` = 32 m. `R_view` is F7. `n_row` = 5 for a straight crossing, 9 at a corner. `n_apply = 3 · max(L_s, ⌈P_u / 2⌉)`:
  `L_s` ≤ 4 surface layers and `P_u` ≤ 15 pools in use per chunk, with the per-frame upload caps of §3.3.
- Range: `t_lead` must stay at or above `t_min` = 1.0 s.
- **Worked example.** At 46 m/s, `R_view` = 105 m (F7), so `t_lead = (224 − 105) / 46 = 2.59 s`. Worst row (a corner of
  dense town chunks, 8 pool frames each): `F_row = 9 · 20 / 2.5 + 24 = 96` frames, so `v_max` = 160 m/s at 60 fps, 80 at 30 fps,
  53 at 20 fps. A typical desert straight: `F_row = 22`, `v_max` = 698 m/s at 60 fps. Even the worst case at a 20 fps floor
  covers the motorcycle's 52 m/s.
- **The cap this puts on zoom:** `h_max(v) = (R_hot − v · t_min − 0.55 v) / 0.6824`, where 0.6824 = `tan 21° · 16/9` is the
  half-width seen per metre of camera height. It is 224 m at 46 m/s and 328 m at rest. The planned multi-level zoom must stay
  under it.

**F7 — View footprint and shadow box.**
```
h = 82 + 0.75 · v           H_vis = 2 · h · tan(21°)          W_vis = H_vis · aspect
lead = 0.55 · v             R_view = W_vis / 2 + lead         shadowHalf = clamp(R_view, 60, 110)
```
- `h` is the zoomed-out camera height while driving (`updateCamera` in `main.js`); FOV 42°; `aspect` 16:9.
- Range: `shadowHalf` 60–110 m, so a shadow texel (2048 map) is 5.9–10.7 cm.
- **Worked example.** At 46 m/s: `h = 116.5 m`, `H_vis = 89.4 m`, `W_vis = 159.0 m`, `lead = 25.3 m`, `R_view = 79.5 + 25.3 = 104.8 m`
  (rounded to 105). Today's box is ±70 m (6.8 cm per texel), 35 m short of the screen edge; the formula gives ±104.8 m
  (10.2 cm). On foot (`h = 33`) `W_vis` is 45 m, so the clamp keeps 60 m. At an aspect above 2.1 the 110 m cap falls short of
  the edge, which is accepted.

**F8 — Draw-call budget.**
```
calls = calls_base + calls_surface + calls_pool
```
- `calls_base` = 52–80 today. `calls_surface` ≤ 16 + 4 rock shadow = 20. `calls_pool` ≤ 15 + 9 shadow casters = 24.
- Range: gate under 150; target 110 or fewer after P4.
- **Worked example.** Worst case: `80 + 20 + 24 = 124`, a margin of 26. P4 folds Phoenix's own batches into the pools (about
  −15): 109. Hiding headlight cones by day saves one call per driven car.
- Pool fill: the sum over hot chunks of a pool's instances must stay under its capacity. Props hold 24,000 = 12 chunks · 2,000.
  A town ring averaging 2,100 props per chunk overflows by 1,200; the farthest chunk waits (§5).

**F9 — Float precision and the render origin.**
```
ulp(d) = 2^(⌊log2 d⌋ − 23)           px_err = ulp / (W_vis / res_x)
shift RO by ±2048 m when |p − RO| > 1536 m
```
- Range: shifts are 2,048 m apart when driving one way (44.5 s at 46 m/s); after a reversal at least 1,024 m (22 s). The
  render coordinate then stays under 2,048 m.
- **Worked example.** Miami `x = 214,500`: `ulp = 15.6 mm`. At the on-foot camera (`h = 33`, 1080p, 2.35 cm per px) that is
  0.67 px of wobble; at photo-mode zoom (`h = 6`, 0.43 cm per px) it is 3.7 px. At the far edge, `x = 303 km`, `ulp = 31 mm`.
  With the origin, render `x < 2048` gives `ulp = 0.24 mm`: 0.01 px on foot and 0.06 px in photo mode. P1 ships without an
  origin because the corridor is within 42 km (`ulp` 3.9 mm, 0.17 px on foot).

**F10 — Memory and window sizes.**
```
nav_chunk = (C/1)² + (C/2)² = 65,536 + 16,384 = 81,920 B       minimap tile = 128² · 4 B = 65,536 B
ground    = (C/8 + 1)² = 1,089 vertices
NavWindow = foot (4C/1)² = 1,048,576 cells, car (4C/2)² = 262,144 cells
```
- Range: 9 MiB for nav and minimap tiles at the default 64 layouts; 18 MiB at 128, the knob's ceiling.
- **Worked example.** 64 cached layouts hold 5.0 MiB of nav tiles and 4.0 MiB of minimap tiles, 9 MiB before surfaces and
  instance records. The NavWindow is 1.25 MiB as Uint8. Phoenix (928 m) fits in one 1,024 m window.

**F11 — Entity timing.**
```
t_promote = (R_promote − R_view) / v_close
```
- `R_promote` = 220 m; demote at 300 m. A ghost record updates every 6 frames (10 Hz at 60 fps): 512 records is 85 per frame.
- Range: `t_promote` stays at or above 0.8 s for any closing speed up to 140 m/s.
- **Worked example.** Two LAWMANs head-on close at 92 m/s: `(220 − 105) / 92 = 1.25 s`. Against a 30 m/s car, 76 m/s: 1.5 s. Two
  vehicles at the 60 m/s test speed of §8 item 14 close at 120 m/s: 0.96 s. A promotion has to finish inside that window.

**F12 — Road shape and exit reach.**
```
r_min = v² / a_lat            λ_min = 2π · √(A · r)            growth ≈ (π · A / λ)²
W_road = lanes · 3.6 + 2 · W_shoulder + (divided ? W_median : 0)
```
- `a_lat` is a comfortable lateral acceleration, 0.3 g. `A` = 60 m meander amplitude. `W_shoulder` 1.0 m and `W_median` 6 m.
- Range: corner radius 720–1,200 m on interstates, 100–250 m on county roads, 20–50 m on streets; meander growth at most 5%.
- **Worked example.** At 46 m/s, 0.3 g needs `r_min = 46² / (0.3 · 9.81) = 719 m`; the 800 m interstate radius gives
  `a_lat = 2.65 m/s² = 0.27 g`. A 150 m county corner at 46 m/s would pull 1.44 g, so the car slows to
  `√(0.8 · 9.81 · 150) = 34 m/s`; a 30 m street slows it to 15 m/s. Road class sets speed without a sign. The meander must be
  no tighter than the corner radius: `λ ≥ 2π · √(60 · 800) = 1,377 m`, which adds `(π · 60 / 1377)² = 1.9%` length.
- Widths: 6-lane divided 29.6 m (18.6% of the 159 m screen at 46 m/s), 4 divided 22.4 m, 4 undivided 16.4 m, 2 undivided 9.2 m.
- **Exit reach.** Access road = straight `pos → dest` distance · K: min 1.94 km, median 2.71 km, max 6.51 km; T1 median 2.70 km,
  T2 and T3 median 3.74 km. At 46 m/s the median is 59 s.

**F13 — Map scales.**
```
atlas_m_per_px = 390,000 / 2048        minimap_R = min(426, 150 + 6 · v)        discovery_bits = 390 · 221
```
- Range: atlas about 190 m per px; minimap radius 150–426 m; discovery 10.8 KB raw.
- **Worked example.** The atlas is 190 m per px. A 29.6 m interstate is 0.16 px wide, so the atlas strokes roads at a minimum
  width. At 46 m/s the minimap shows 426 m (the cap), at rest 150 m; its 1,280 m window is 640 px at 2 m per px.
  Discovery is `390 · 221 = 86,190` bits = 10.8 KB raw.

## 5. Edge Cases

**Streaming**
- **A needed chunk is not ready:** it is built synchronously and `streamStall {key, ms, cause}` is emitted. The player never
  sees an empty hole, because collision and nav arrive with the layout, ahead of the hot ring.
- **`teleport`, `load`, `screenshot` to a far place:** `ensureHot` builds the destination first (about 150 ms for a load), then
  RO is recomputed there before the first render, then the old ring is evicted through the LRU. These stalls carry their own
  cause and are not counted against perf gates. `cross-country` expects exactly 12.
- **A point exactly on a chunk edge** belongs to the chunk on its positive side (`floor`). Orlando's planning `x` is such a
  point (F4).
- **Driving back and forth over an edge:** the 32 m hysteresis keeps the centre chunk where it is; no layout is rebuilt.
- **A building straddles a border:** its collision boxes go in both chunks. Its record (door, roof slot) belongs to the chunk
  holding its centre point, so it is instanced once *(proposed)*.
- **A pool is full:** that chunk's instances for that pool are skipped, `poolFull {pool}` is emitted, and the allocator retries
  whenever any chunk is released. Collision is unaffected. Selftest fails if a stress run emits one.
- **A render-origin shift** happens only between frames and is atomic; no frame draws half a shift. The sim, agents and saves
  never see it. Persistent render-space caches (decal rings) are re-based in the same step.
- **A non-finite coordinate** never reaches the streamer. The NaN sentinel repairs it first; `ensureHot(NaN)` returns
  `{ok:false}` and emits an `error` event instead of building a chunk.
- **A hidden tab or a paused game:** `step` uses sync mode, so streaming is deterministic and finishes within each step.
- **A frame spike of 100 ms:** the pump spends at most its 2.5 ms; it never makes up lost time in one frame.
- **A road row changes** (a MapForge re-bake): `dataHash` changes, so every layout is rebuilt. Saved deltas whose local ids no
  longer exist are dropped with a `deltaDropped {key}` event; a player inside a solid is moved to the nearest free nav cell.
- **A v1 save** loads unchanged: `world` defaults to the current seed, K and data hash; no deltas; an empty discovered map.

**The map**
- **Rivers before P4:** the data holds only a name and a centre line per river. In P1 the Colorado crossing 24.1 km west of
  Phoenix and the Rio Grande at El Paso (37.7 km east) are dry road. Water sheets and bridges arrive in P4.
- **The P1 dust wall** sits at 45 km from Phoenix. The corridor ends are Los Angeles at 41.6 km and El Paso at 37.7 km, so the
  research pass's 40 km would hide Los Angeles behind the wall. The wall is a fog-and-dust fade and a hard stop for vehicles.
- **The edge of the usmap rectangle:** there is no data beyond it, so it carries the same dust-and-fog wall as the P1 corridor
  (a fade for sight, a hard stop for vehicles). Where the edge cell is ocean, the sea continues 3 km out before the wall, so
  boats can leave the coast and ground vehicles sink by the existing water law *(proposed)*. In the data the east edge is all
  ocean, the south edge is ocean with swamp and urban cells at Florida (Miami is 7.8 km from it), the west edge is 39 ocean and
  46 forest cells, and the north edge is mostly land (109 land cells, 20 lake cells, 21 ocean cells).
- **An exit with no `dest` or no `ramp_ids`:** it is skipped, listed in `world.warnings`, and the highway is unaffected.
- **A junction on a chunk edge:** the junction patch is generated in each chunk it touches from the junction id alone, so both
  copies are identical and there is no seam.
- **Two roads crossing at `grade: deck`:** the overpass is visual only. Both roads stay on the ground plane for collision, so
  traffic meets at the crossing as at any intersection. A layer tag with collision filtering is possible later; it is not
  designed here.
- **The Phoenix island border:** content is suppressed by rectangle, never by chunk, so a chunk that straddles `|x| = 464` holds
  streamed content on its outer side only.

**Entities**
- **An entity wants promotion before its layout is ready:** it stays a ghost until the layout exists, except an entity the
  player is engaged with inside 105 m, which forces `ensureLayout`.
- **An engaged or quest-flagged entity outside the layout set:** it stays Full and pins its chunk's collision and nav (not its
  surfaces). At most 8 chunks are pinned; past that the oldest pin expires and the entity demotes *(proposed)*.
- **A ghost on an unloaded edge:** ghosts move by arc position on the graph and need no chunk.
- **Convoys in P1:** a convoy farther than 3.5 km from the player is despawned and may roll again. From P3 it becomes an Abstract
  schedule instead.
- **The motorcycle** (52 m/s) is faster than the reference vehicle: Miami to Orlando in 531 s, 12% under the rule. This is
  accepted until Robert's decision 1.

## 6. Dependencies

Bidirectional: the right-hand column says what this spec needs back.

| Doc / system | What it needs from streaming | What streaming needs from it |
|---|---|---|
| `docs/WEB_ENGINE_PLAN.md` (Phase 5) | the world, chunk and entity design behind "stream map chunks, simulate NPCs near the player" | the Arizona-first order |
| `docs/RESUME_WEB_ENGINE.md` | the scale numbers behind the vision memo ("redo America, scaled up") | the rule, and the roadmap for multi-level zoom and survival |
| `web/AGENTS.md` invariants 1–7 | under 150 calls, no per-frame allocation (pump, pools and buffers), a fixed light count (streaming adds none), new commands in `COMMANDS`, rows not code, no purple in any biome or sign palette, `selftest` green | its architecture map must gain `world/streamer.js`, `chunkgen.js`, `worldindex.js`, `roadgraph.js`, `engine/origin.js`, `sim/ghosts.js`, `sim/offscreen.js` when built |
| `game/data/usmap.json` and `tools/mapforge` | stable schema for `roads`, `junctions`, `exits`, `towns`, `placements`, `rivers`, `relief`, `states_grid` | they own the rows; a re-bake changes `dataHash` |
| `docs/design/WEB_WORLD_MEMORY.md` | place rows for towns, exits and camps, with stable ids; society state saved outside the chunk deltas | its `places` content section and `society.update` independent of chunk residency. **Place rows come from WorldIndex at boot** (59 towns, 91 exits), so a deed is never "in no place"; the chunk only attaches the live part (gate bulls, loot) when it goes hot. This refines "register when chunks stream in" in its §6 |
| `docs/design/WEB_FAN_SERVICE_BIBLE.md` | streamed places for COLD DEPOTS, BENCHMARKS (50 per state, 2,400 in 48 states), LIVE WIRES; a closable edge on the road graph for THE CORDON | the vocabulary and the no-brand rule for every generated name; a skip list in each name generator |
| `docs/design/ROAD_TRAFFIC_OVERHAUL.md`, `THE_AMERICAN_ROAD.md`, `THE_ROAD_KIT_AND_LANE_GRAPH.md` (Godot side) | nothing | the meaning of `lanes` (both directions: 2, 4, 6) and `divided`, and the junction `legs` / `arc_m` schema |
| `src/engine/collision.js`, `engine/nav.js` | the chunked StaticWorld and NavWindow behind unchanged APIs | their current API and the `mark` de-duplication |
| `src/world/city.js` | the island rectangle, golden hash, trimmed Route 66 | its RNG sequence and `HALF`; `world/water.js`, `world/rail.js`, `world/terrain.js` stay inside the island |
| `src/systems/sky.js`, `systems/fx.js` | the shadow-box rule (F7); decal rings re-based on a shift | scratch objects reused each frame (checked: `sky.js` uses module-level scratch colours) |
| `src/systems/vehicles.js`, `convoy.js`, `train.js`, `ai.js`, `seats.js` | traffic and convoys on graph edges; despawn by distance | the vehicle rows (`maxSpeed`), the Iron Line staying put, `HALF` removed from `convoy.js` |
| `src/ui/hud.js`, `ui/qol.js`, `main.js` | the minimap window, the atlas, click-to-waypoint in world metres, `locationName` from WorldIndex, `updateCamera` heights | they stop treating `HALF` as the world |
| `src/agent/api.js` | the new commands (§3.10), `save` / `load` v2, `map` bounds from WorldIndex | `COMMANDS` conventions, `exec`, `step` |

## 7. Tuning Knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `K` (game metres per usmap metre) | 5.2 | 4.9–5.5; recalibrate if it moves (F3) | world size, every trip time, how far the origin shift matters |
| `T_rule` | 600 s | 480–720 | the owner's trip time (decision 2) |
| `V_ref` | 46 m/s, from the LAWMAN row | a change over ±5% re-solves K | every trip time |
| `C`, chunk size | 256 m | 128–512; changes every hash, tile and ring | pump granularity, draw culling |
| `r_L`, layout radius | 2 | 2–3 (1 breaks the 480 m guarantee) | prefetch distance, memory |
| `r_H`, hot radius | 1 | 1 | draw cost |
| `h_hys`, hysteresis | 32 m | 16–64 | thrash against lead |
| LRU size | 64 | 36–128 (at least ring + a backtrack) | memory against regeneration |
| Prefetch | `max(600 m, 12 s · v)` | 8–20 s | lead on bends |
| `b`, pump budget | 2.5 ms per frame | 1.0–4.0 | stalls against frame time |
| Slice | 0.5 ms | 0.25–1.0 | granularity of long layouts |
| Uploads per frame | 1 surface, 2 pool writes | 1–2, 1–4 | hitching against apply latency |
| `t_min`, minimum lead | 1.0 s | 0.5–2.0 | the camera-height cap (F6) |
| Pool capacities | props 24,000; walls 12,000; the rest sized the same way (12 hot chunks · measured per-chunk maximum) | ±50% | memory against `poolFull` |
| Ground step | 8 m (33² vertices) | 4–16 | terrain detail against vertex count |
| NavWindow | 4 × 4 chunks | 4–6 (3 cannot hold the island) | memory, re-centre rate |
| `RO` step and trigger | 2,048 m, 1,536 m | 1,024–4,096; trigger 0.5–0.9 · step | upload frequency against precision |
| Shadow box clamp | 60–110 m | ±10 | shadow reach against texel size |
| Promote / demote | 220 m / 300 m | 160–260; demote at least promote + 40 | pop-in against entity cost |
| Ghost range, capacity, rate | 3.5 km, 512, 10 Hz | 2–5 km, 256–1024, 5–20 Hz | traffic density against sim cost |
| Engaged grace | 20 s | 10–60 | how long a fight stays Full after you leave |
| Full caps | 160 characters, about 20 vehicles | ±25% | draw calls |
| Corner radii | 800 / 150 / 30 m | 720–1,200 / 100–250 / 20–50 (F12) | how fast each class can be driven |
| Meander | 60 m, under 5% length | 0–100 m, keep `λ ≥ 2π · √(A · r)` | whether a long road looks hand-drawn |
| Lane / shoulder / median | 3.6 / 1.0 / 6 m | 3.2–4.0 / 0.5–3 / 2.4–8 | readability from the camera (the Godot geometry law uses a 2.4 m median) |
| Ramp peel-off | 300 m | 200–500 | how early an exit announces itself |
| Community size | T1 4–8, T2 10–20, T3 25–50 buildings | ±50% | exit payoff against build time |
| `EXIT_ACCESS_MAX_M` | none (median 2.71 km) | 600–3,000 m | how long a trip to an exit takes (decision 4) |
| P1 dust wall | 45 km | corridor end + 3 km | where the early world ends |
| Minimap window and radius | 5 × 5 tiles; `150 + 6 · v`, cap 426 m | cap 300–600 | how much road you can read at speed |
| Atlas size | 2048 × 1160 | half to double | map sharpness against memory |
| Discovery cell | 1 km | 0.5–2 | save size against map detail |

## 8. Acceptance Criteria

Each item passes or fails. Run `node tools/dl.mjs ...` from `web/` with the game running (`npm run agent`). Items marked
*(new)* need the command or scenario from §3.10.

**A. Data and document, checkable today**
1. **Row counts.** From the repo root: `node -e "const d=require('./game/data/usmap.json');console.log(d.roads.length,d.roads.filter(r=>r.kind=='interstate').length,d.junctions.length,d.exits.length,d.towns.length,d.placements.length,d.rivers.length)"` prints `763 10 1339 91 59 2459 6`.
2. **Leg lengths at K = 5.2.** From the repo root:
   `node -e "const d=require('./game/data/usmap.json'),P=Object.fromEntries(d.towns.map(t=>[t.id,t.pos]));const leg=(r,a,b)=>{const p=d.roads.find(x=>x.id==r).pts,i=p.findIndex(q=>q+''==P[a]+''),j=p.findIndex(q=>q+''==P[b]+'');let s=0;for(let k=Math.min(i,j)+1;k<=Math.max(i,j);k++)s+=Math.hypot(p[k][0]-p[k-1][0],p[k][1]-p[k-1][1]);return (s*5.2/1000).toFixed(1)};console.log(leg('I-10','losangeles','phoenix'),leg('I-95','jacksonville','miami'),leg('I-80','sanfrancisco','newyork'))"`
   prints `42.1 41.6 334.6` (F2). If the data changes, update F2 and the §2 table in the same commit.
3. **Document shape.** `grep -c "^## " docs/design/WEB_STREAMING.md` prints `8`, in the house order.
4. **Names stay ours.** `node tools/ip-lint.mjs` reports 0 deny after every phase (generated town, exit and sign lists live in `src/` or `content/`).

**B. Every phase**
5. `node tools/dl.mjs selftest` is green, with a new check per system added; `scenario name=stress` stays at 52 ± 5 draw calls; `perf` reports no `runtimeErrors`.

**C. P1, Streamed Arizona**
6. **Island hash.** `world` *(new)* returns an `islandHash` equal to the constant committed in `src/data/golden.json`.
7. **Determinism.** `chunk x=2000 z=0` *(new)* returns hash `H`; after `teleport x=0 z=0` and `step seconds=30`, the same call returns `H`; it returns `H` in sync and in sliced mode.
8. **Seams.** For `chunk x=2000 z=0` and `chunk x=2300 z=0`, the first's `edges.e` equals the second's `edges.w`.
9. **Drive-out.** `scenario name=stream-drive` *(new)*: 60 s at full throttle east on I-10 ends more than 2,400 m from the start (average at least 40 m/s), `stream.byCause.cross` and `stream.byCause.promote` are 0, and at least 90% of the 1 Hz samples are within the road half-width plus 2 m. The research pass wrote this gate as `x > 2.4 km`; I-10 leaves Phoenix 20.8° south of east, so the gate is distance, not x.
10. **Nav across a seam and the island edge.** `path fx=300 fz=0 x=900 z=0 mode=car` succeeds with `length` at most 690 m and under 5 ms.
11. **No leaks.** After a lap out and back, every `world.pools.<name>.used` equals the starting value and `perf.geometries` is unchanged.
12. **Interiors.** The existing "every building interior walkable" selftest still passes, through `nav.focus`.
13. **Perf.** The `stream-drive` summary (night storm, zoomed out, two raider buggies chasing, 120 s at 46 m/s) reports `maxDrawCalls` under 150 (target 110 or fewer), `frameMs.p95` under 8, `frameMs.max` under 25, `stream.pumpMs.p95` at most 2.5, zero `cross` and `promote` stalls, and heap growth under 15 MB after a warm-up lap (`exec code="performance.memory.usedJSHeapSize"` before and after).
14. **Speed ceiling.** `registerVehicle key=probe def='{"base":"interceptor","maxSpeed":60}'` then `spawnVehicle type=probe`; driving the corridor produces zero stalls.
15. **Dust wall.** After `teleport x=44000 z=0` in a vehicle, 10 s of full throttle east leaves `|x| ≤ 45,000`.
16. **Convoys.** A convoy left more than 3.5 km behind is gone from `query type=vehicle radius=4000`.

**D. P2, Render origin and Florida**
17. **Scale gate.** `node tools/usmap-calibrate.mjs` *(new)* prints K and the F2 table and exits 0 only if Miami → Orlando is within 26.77–28.43 km.
18. **Route and travel.** `route from=miami to=orlando` *(new)* returns `km` in 26.77–28.43; `travel to=orlando speed=max` *(new)* returns `simSeconds` in 570–630.
19. **Origin.** After `teleport town=miami`, `exec code="Math.abs(game.camera.position.x)"` is under 2,048; a static prop's render position moves less than 0.01 m over 60 frames; the mean luma of a `screenshot` is between 40 and 200.
20. **Water at distance.** `water` at a known Miami canal returns `swim`.
21. **Perf.** `stream-drive corridor=florida` meets item 13; `origin-churn` (50 shifts) keeps `frameMs.max` under 25.

**E. P3, Graph and ghosts**
22. **Round trip.** A traffic ghost promoted, demoted and promoted again keeps its `id`, `hp` and `paint` (`ghosts` *(new)*).
23. **Routing.** `route from=… to=… mode=road` for a 30 km route reports `ms` under 5.
24. **Convoy ghost.** A ghost convoy reaches its destination within 5% of its scheduled time; Phoenix traffic still loops (existing check).
25. **Perf.** `highway-rush` *(new)* (60 ghosts, up to 14 full vehicles, an engaged convoy, night): `maxDrawCalls` under 150 and `simMs.p95` under 4.

**F. P4, Continent**
26. **Every biome.** For each of the 10 biome letters, `chunk` at a sample coordinate returns that `biome` and a hash.
27. **Towns.** All 59 town-centre chunks report `buildMs` under 30, and a sample has walkable interiors.
28. **Bridges.** On the Mississippi bridge deck `water` returns depth 0, and `path` across the rails is blocked.
29. **Continuity.** `route from=phoenix to=losangeles` returns contiguous legs.
30. **Perf.** `cross-country` *(new)* (12 teleports, 20 s of driving each): `perf.triangles` under 1.2 M, `maxDrawCalls` under 150, and exactly 12 `teleport` stalls.

**G. P5, Persistence and worker**
31. **Persistence.** Loot an item in Miami, `save`, then `load` from Phoenix: the delta is present and the chunk hash matches.
32. **Worker.** `chunk` in worker mode and in main-thread mode return the same hash.
33. **Perf.** `stream.pumpMs.p95` is at most 1.
