# WEB_FLORIDA: the start region

**Status:** built 2026-10-23 on `feat/web-florida` (WEB_WORLD_EDITOR_PLAN §3.4). Robert, EM3 Briefing: **START IN FLORIDA.**
**Engine:** the three.js web engine (`web/`, read `web/AGENTS.md`). **Rows:** `web/src/data/regions.js`,
`web/src/data/holdouts.js`, `web/src/data/meridian-talk.js`. **Code:** `web/src/world/regions.js`,
`web/src/world/holdout.js`, `web/src/systems/regions.js`, with the corridor and region hooks in `world/worldindex.js`,
`world/chunkgen.js` and `world/streamer.js`. **Proof:** `web/src/agent/florida-checks.js` (selftest) and the
`florida` phase of `scenario name=stream-drive`. **Screens:** `docs/renders/web/florida/`.

---

## 1. Overview

Florida is the first region past P1's Arizona corridor and the place a new character begins. It streams on the same
chunk system as I-10 (WEB_STREAMING): one plane, one K (5.2), 256 m chunks, the layout and hot tiers, the pump, the
pools, the stall guard. Nothing about it is a second engine. A region is a set of rows the existing generators read:

| Layer | What Florida adds | Where |
|---|---|---|
| L0 Earth | a box of the plane (the Georgia line to past Miami, the Gulf to the Atlantic), Florida biome rows, a neutral ground texture its vertex colours paint, the squall line at its edge | `REGIONS.florida`, `world/regions.js` |
| L1 Water | the Atlantic (open sea, a barrier island, the Indian River-style lagoon, inlets), the Gulf from the grid, a drainage canal along each interstate, sloughs and gator holes in the swamp; the depth authority past the island | `REGIONS.florida.water`, `regionWater()` |
| L2 Network | I-95 down the Atlantic side and I-75 across the swamp (ALLIGATOR ALLEY), both from Miami, real-size interchanges, signs in game miles, exits by milepost | `REGIONS.florida.corridors/exits`, `Corridor` |
| L3 Settlement | MERIDIAN, a walled holdout at I-95 exit 9; the Godot towns in the box (Jacksonville, Tampa, Miami, Rosewood, the Dry Dock) from their placement rows; ruined houses in the dead suburbs | `HOLDOUTS.meridian`, `Holdout`, `buildTowns` |
| L5 Life | alligators (a FAUNA row), the infected at Florida's density, Meridian's people | `FAUNA`, `REGIONS.florida.life`, `PEOPLE.meridian` |

What streams today: **I-95** from Miami north past Meridian, Titusville, Daytona and St. Augustine to Jacksonville and
the Georgia line (57.2 km, 35.6 game miles, 8 exits); **I-75** from Miami west across Alligator Alley and north past
Tampa and the Dry Dock (58.4 km, 36.3 game miles, 3 exits); the swamp, pine flatwoods, groves, prairie, wetlands and dead
suburbs between them; the Atlantic coast with its barrier island and lagoon. Not yet: I-4 (no usmap row), the Keys road
(south of the grid's last row), a metro ring for Miami or Jacksonville (the Phoenix ring's generator, later).

## 2. Player fantasy

You wake on the doorstep of a clinic in a walled Florida town. The street is wide and hot, sabal palms down the middle
of it, a cart at the kerb, people at their work: a deputy at the gate, a woman selling water, a line outside the clinic.
Out the west gate the access road runs through palmetto and cypress to the interstate; a dark canal runs beside it, and
something in the reeds lifts its head. Out the east gate a dirt road goes down to the lagoon, a pier, an airboat. North
and south the interstate runs for an hour of real driving through a country gone back to swamp, past dead suburbs and
burnt exits, to Jacksonville and Miami. Florida reads as flat, wet and green: burnt out, and in Meridian, rebuilt.

## 3. Detailed rules

### 3.1 The region and its corridors
- A region row with a `box` (usmap metres) is built into a `Region` (`world/regions.js`): its world box, edge fade, biome
  rows, water, corridors, exits, holdouts. `WorldIndex.regionOf(x, z)` answers which; Arizona (P1) answers null and keeps
  every code path it had.
- `inWorld(x, z, pad)` replaces P1's dust-wall radius test in the streamer (planning, the hot set, `ensureHot`,
  `ensureSpan`): inside the 45 km circle **or** a region's box. The streamer's `regionWall` holds vehicles and people inside
  the box and thickens the fog toward the wall's colour over `wall.fade` metres (THE SQUALL LINE), as the dust wall does.
- A corridor (`Corridor`, `world/worldindex.js`) is the I-10 law on an overlay line: two carriageways of two 3.6 m lanes,
  shoulders, a 6 m median, 800 m fillets, the seeded meander (its own salt) tapered to nothing at every exit, clipped 400 m
  inside the box. It runs **south to north from Miami**, so arc length is miles from Miami and **an exit's number is its
  milepost** (Florida's real rule; Meridian is exit 9 because it stands at game mile 9). I-10 stays exactly as it was,
  reachable through the same interface (`W.i10`).
- Exits reuse I-10's interchange builder (`addExit`): the diamond, the deck, the fills, rails, the stop line and STOP sign,
  the access road. A `town` exit's dest is the town (Rosewood, the Dry Dock); a `holdout` exit's dest is the holdout's
  west gate (Meridian); others grow a community from their archetype, as on I-10.
- Signs: the same faces in game miles, plus the road's name leaving Miami and SQUALL LINE AHEAD where a road runs into
  the box edge. A region's faces are painted into **their own atlas** (`SignAtlas` with `scale 0.75`, identical faces
  shared) drawn by their own pool (`signsfl`), so P1's atlas is byte-identical and Florida's costs 61 faces, not ~100.
- Both corridors start in Miami; each ends at Miami's first street (`trimAtTown`), as I-10 does at Los Angeles.

### 3.2 The land
- Ground: the biome rows' tints (display colours, linearised) bilinear between 500 m cell centres, with three noises,
  over a neutral grass-and-earth texture (`marshTexture`) on the region's own ground material. Sand on the barrier island
  and the beach; mud and wet ground round any water; worn grass and dirt inside a holdout's wall.
- Wild scatter (`regionScatter`, its own branch: P1 chunks never run it): saw palmetto (starbursts of fronds) and
  sawgrass tussocks (which stand in the shallows); trees **in stands** (a 150 m noise crowds them into hammocks and leaves
  the marsh open) by the biome's `flora` weights; cypress domes in the sloughs; red mangroves on the lagoon's edges; old
  citrus groves in rows; sea oats, palms and driftwood on the barrier island; the dead suburbs' block-house ruins, some
  burnt; a fishing camp on stilts; limestone. No mesas: every Florida biome row has `rock: 0`.
- Trees: five new species from `tools/blenderforge/gen_flora.py` (sabal palm 9 m, slash pine 16 m, bald cypress 13 m,
  red mangrove 4.5 m, live oak 9 m; three variants each, 414-510 triangles), plus the existing fan palm, citrus and dead tree.

### 3.3 The water (L1)
`regionWater(R, x, z)` is pure and returns depth, kind (swamp, canal, lagoon, ocean) and a signed margin:
- **Atlantic:** the shore line `shore(z)` (usmap x 0, bent west into a bay at Miami, wobbled by two noises) sampled every
  8 m; seaward of it the ocean deepens by `ocean.slope`; landward the barrier island (`barrier` metres), cut by inlets
  every `inletEvery` metres; then the lagoon (`lagoon` metres, `lagoonDepth`), shallowing over its first 60 m each side.
- **Gulf:** the grid's ocean cells as a bilinear field, shored by noise (west of the Atlantic rows).
- **Canals:** beside each corridor at `off` metres on `side`, `half` wide, `depth` deep (parabolic); none within 700 m of
  an interchange or at the trimmed end.
- **Sloughs:** two noises scaled by the biome's `sloughs`; they shallow out toward roads (`clearRoad`), towns and holdouts
  (`clearTown`) and every other paved ribbon (34 m), and never reach the barrier island.
- A layout keeps a 65 x 65 grid (4 m) of depth, kind and margin; the region caches it while the layout lives. **The
  water authority** (`world/water.js waterDepth`, which wading, swimming, diving, drowning, flooding cars and boats all ask)
  calls the region past the island's ±470 m: the cached grid, else the pure function. A holdout's pier is dry.
- The sheet: a `water` surface layer per slot (the island's water material, rougher: still swamp water and a wide lagoon),
  cut along the margin's zero line by marching squares, tinted by kind and depth. Deep water is blocked in the nav tiles
  (1.2 m on foot, 0.6 m by car), as the island's store does.

### 3.4 Meridian, the starting holdout
- **Placement:** at I-95 exit 9, east of the road, its east wall `shoreGap` (330 m) back from the lagoon's mainland shore
  (centre world 222480, 55826). The exit's access road ends `approach` metres outside the west gate.
- **Layout** (`world/holdout.js`, rows `HOLDOUTS.meridian`): a 372 x 300 m wall of tin and timber panels with junk banked
  against it, posts, a cap rail, towers at the corners and both sides of each gate (west, the lagoon gate east, a north
  postern), name boards over the gates. Inside: Main Street gate to gate (16 m), Cypress Row and Tidewater Row, Palmetto
  Avenue, Courthouse Street and Yard Street, sidewalks, a dirt lane inside the wall; sixteen blocks.
- **Buildings** are lots handed to the Phoenix ring's own `geo()` (`world/ring.js`): walk-in shells with doors, windows,
  floor plans (`world/floorplan.js`), furniture, PACK-screen containers and beds, roofs that hide when you walk in. The
  civic row faces Main Street: CLINIC, CLONE BAY (the clinic's wing: vats), SHERIFF'S OFFICE (holding cells), TOWN HALL,
  CHAPEL, RADIO. Across it: GENERAL STORE, CANTINA, GUNSMITH, WATER, BOARDING HOUSE, DINER. The GARAGE and a FUEL STOP with
  a yard of cars; a warehouse; houses, bungalows, duplexes and boarding houses on the rows and on the backs of the civic and Main Street blocks (59 walk-in buildings in all). New kinds and plans are rows (`data/ring.js`
  KINDS and ZONES.holdout, `data/floorplans.js` clonebay, jail, nave and their PLANS); no ring zone picks them.
- **Open lots** (Rust Haven's holdout fill, `data/holdout.js` rows): THE MARKET (stalls round a fire, a well, live oaks),
  THE GARDENS and THE FIELDS (raised beds, a rain tank, a shade tarp), THE PIT (a ring of fence and tyres, bleachers), THE
  BONEYARD (wrecks stacked two high), the water tower. Lamps (night pools of light), sabal palms down Main Street; carts
  and cars at the kerb.
- **Rebuilt from wreckage** (look pass 2, docs/design/WEB_LOOK.md §3.8; rows `HOLDOUTS.meridian.grit`): the ground is
  packed earth with worn paths, litter and puddles (the market square too: no paving); buildings sit off a ruled frontage;
  a fifth of the back-row houses are burnt shells (zone `holdout_burnt`); every lot has junk fences, a lean-to, back
  houses, a shed and an outhouse, raised beds, a chicken run, a hulk, a tank, washing, firewood, compost and scrap, never
  near a door; the market is in use (striped canvas, stock, blankets of goods, benches, fire barrels, a cook tarp).
- **Outside:** the lagoon road out of the east gate to a pier (dry deck), a boathouse, an airboat and a waterbike.
- **People** (`PEOPLE.meridian`, `systems/regions.js`): records promoted within 520 m, written back past 900 m. Nine named
  (Sheriff Marisol Duarte CU, Dr. Kwame Asante GH, mechanic Lucien Boudreaux HT, trader Nguyen Thi Hoa VN, gunsmith Abel
  Mendoza MX, water seller Precious Owusu NG, Teo Ruiz PR at the cantina, Della Kincaid US on the radio, Mayor Winston
  Clarke JM) at their counters with dialogue (`data/meridian-talk.js`); five deputies (warden archetype) at the gates and
  the market; 25 townsfolk at work (farmers, fishers, stallkeepers, scrappers, a mechanic's hand, pit fighters, people on
  Main Street, a line at the clinic). Every one carries a real flag. They belong to the MERIDIAN faction (registered at
  boot; deeds, witnesses and standing work as for Rust Haven). Traders own their shelves (TRADERS rows): taking is buying
  with the keeper there. The essential (sheriff, doctor, mayor) come back after going down.
- **Jobs:** the sheriff's first job, CLEAR THE CANAL (two gators by the pumps, $120), counted by `g.stats.gators`.

### 3.5 The start, and the clone hook
- `?start=florida|phoenix` picks where a new game begins. With neither, **players start in Florida** and the agent harness
  (`?agent=1` / `?autostart`) **in Phoenix** (`START` rows), so the selftest and every scenario stage as they always have.
- A Florida start: the town is laid out, the player stands on the clinic's doorstep, Meridian's people come in, the title
  reads MERIDIAN, FLORIDA and the first toasts are Meridian's. `region action=start` does the same for an agent.
- Fall in Florida and you wake at Meridian's clinic door (`respawnPoint`, fee from `clinic.fee`); in Arizona, Rust Haven's,
  as before.
- **The clone agent's hook:** `g.regions.clinic(id)` returns the clinic's door, the inside post, the clone bay's room
  (`clonebay`, the vats) and its wake point, the doctor's id and the fee; `region action=clinic` reports it.

### 3.6 Life
- **Alligators** (`FAUNA.gator`): chunk layouts find lairs (water 0.3-1.8 m deep with a bank within 16 m; `out.life`). A
  hot chunk's lair within 260 m gets its gator (at most `max` alive); past 360 m it goes back to the record; one killed
  stays dead that day. By day it crawls out onto a bank and lies still; by night it lies in the water. It notices the
  living within `notice` m (x1.4 at night) near its water, closes in (fast in water), lunges inside `lungeRange`, bites for
  `bite`, then backs off; it keeps to `leash` m of its lair. A character (shootable, `ownMesh`: drawn by one instanced mesh,
  low in the water, belly up dead), faction WILDLIFE (no deed against anyone). Its body is a container on the `gator` LOOT
  row (tail meat, a hide). The fauna layer absorbs the row and the think.
- **The infected:** `life.infected` herds (`density` 1.6, day and night sizes, `every` 9 s, a cap round the player) spawn
  out of sight, on dry land, never within 90 m of a holdout's wall, after the arrival quiet. The existing daylight cull
  thins the far ones.

## 4. Formulas

- World frame: `x = (ux + 43250) * 5.2`, `z = (uy - 7250) * 5.2` (WEB_STREAMING F3). Florida's box: x 187,460-232,700,
  z 21,580-78,260 (45 x 57 km); Meridian at (222,480, 55,826), 222 km east of Phoenix.
- Exit number = its milepost: `s = mile * 1609.344` on a corridor from Miami.
- Squall line fade: `clamp((fade - d) / fade, 0, 1)`, d = distance inside the nearest box edge; vehicles and people held
  at the box.
- Atlantic depth: sea `min(9, 0.15 + (dx - 2) / 30)` (shallowed over the first 9 m); lagoon `(1.2..2.4 by noise) *
  smooth(e / 60)`; inlet `2.8 * smooth(3e')`. Canal `depth * (1 - (e / half)^2)`. Slough `min(1.9, (n - cut) * 7)` with
  `cut = 0.69 + 0.13 (1 - min(1, k)) - 0.06 max(0, k - 1)`, then `min(., 0.03 (dRoad - 70), 0.03 (dTown - 140), 0.03 (dRibbon - 34))`.
- Gator bite: `F.bite` (26) per lunge, every `F.biteEvery` (1.6 s); lunge `F.lunge` m/s for 0.45 s.
- Infected herd: `round(k * density / 1.6)` with k from `dayHerds` / `nightHerds`; cap `cap` (night) or 45% of it (day).

## 5. Edge cases

- **P1 must not move.** Every P1 code path is unchanged when `regionOf` is null; new pools and the water surface count in
  a chunk's hash only when the chunk uses them; P1's sign atlas holds only P1's faces. Twelve P1 chunk hashes are pinned in
  `data/golden.json` (`p1Chunks`) and checked; a 324-chunk sweep (the island edge, the ring, I-10 end to end, every exit
  and town) matched byte for byte before and after.
- **Float precision 222 km out:** the render origin (P2) is still not built. Instance matrices are float32 (1.6 cm at
  222 km); the camera and the world quantise together, under a pixel at every zoom. No jitter was seen; the render origin
  remains P2's job.
- **Meridian's Godot row is in Virginia** (usmap 110,-325): Florida relocates the town row (`relocate`), so `locate
  meridian` and `teleport town=meridian` answer Florida and nothing builds in Virginia.
- **Seams:** water, tints and the margin are pure functions of position; a vertex on a chunk edge reads the neighbour's
  grid points exactly (bank checks at ±8 m sit on the 4 m grid); the selftest checks a Florida chunk's east edge against
  its neighbour.
- **Pier:** the deck is dry even though the 4 m grid around it is water (the depth query asks the holdout first).
- **The barrier island** keeps no sloughs and few trees (palms only); mangroves stand only in shallow lagoon or canal.
- **Character budget:** Meridian brings 39 people at most; the gators and the infected yield to the 160 cap like
  anyone (addChar recycles the long dead and far drifters first).

## 6. Dependencies

- WEB_STREAMING (chunks, tiers, pools, the stall guard, golden hashes; this is P2's "Florida overlay" without the render
  origin), WEB_FLOORPLANS and WEB_BUILDING_LAB (the planned shells), WEB_ATLAS (Florida's sites: the Miami thrill park and
  the Kings Bay yard are next on the L4 ladder), WEB_INFECTED (`zombies.horde`), WEB_WORLD_MEMORY (the MERIDIAN and
  WILDLIFE factions), WEB_TRADE (the TRADERS rows), WEB_LOOK (the ground and roof surfaces).
- Feeds: the clone and travel agent (`g.regions.clinic()`), the fauna layer (`FAUNA` rows, `think`), the rivers and
  bridges agent (the water authority, `regionWater`), the World Forge (every row here is editable data).
- **Used by THE WORLD TOOLS** (`WEB_WORLD_TOOLS.md`): a region stamp that shares Florida's edge (Georgia) opens it (no
  squall line there: `Region.open`), starts its I-95 and I-75 on Florida's own lines, and a look's `from: 'florida'` reuses
  these biome rows so the ground matches across the seam. Florida's corridors now clip at an open edge, not 400 m in.

## 7. Tuning knobs

| Knob | Value | What it changes |
|---|---|---|
| `REGIONS.florida.box` | x -7200..1500, y 11400..22300 (usmap) | the playable box |
| `wall.fade` | 2500 m | how far the squall line thickens |
| `corridors[].pts`, `canal` | rows | each interstate's line; its canal side, offset, width, depth |
| `exits[]` | mile / town / holdout, side, m | where each exit is and what it serves |
| `biomes.*` | tint, shrubs, trees, palmetto, flora, sloughs, ruins | the look and density of each biome |
| `water.atlantic` | barrier 300-470, lagoon 1250-1700, inletEvery 9000 | the coast's shape |
| `water.slough` | wave 210, cut 0.69, depth 7, max 1.9 | how much of the swamp is open water |
| `life.fauna[].max`, `perKm2` | 14 | gators alive at once |
| `life.infected` | density 1.6, herds, every 9, cap 28 | the infected's pressure |
| `HOLDOUTS.meridian` | size, shoreGap, streets, blocks, gates | the town's shape and programmes |
| `PEOPLE.meridian` | named, deputies, folk, promoteR 520, demoteR 900 | who lives there and when they come in |
| `START` | player florida, agent phoenix | where a new game begins |
| `POOLS.props`, `POOLS.cacti`, `signsfl` | 52,000, 14,000, 256 | pool capacity for Florida's fronds and signs |

## 8. Acceptance criteria

Measured on this machine (RTX 4090, headless Chrome, shared with other agents' harnesses), branch `feat/web-florida`.

1. **Florida streams with no cross or promote stalls.** `stream-drive` `florida` phase: 60 s flat out north on I-95 on the
   bike from mile 7 past Meridian: 2,612 m, 0 cross / 0 promote, 85 draw calls, on the road 100%. Night storm at the
   widest zoom, 90 s held at 46 m/s on I-75 through Alligator Alley: 4,126 m, 0 / 0, 90 draw calls, no pool full.
   Selftest: 40 s north on I-95 past exit 9, 0 / 0, under 150 calls.
2. **Meridian stands at exit 9, walkable, with its people.** Selftest: the wall forces a walk round by a gate; a run from
   the access road through the west gate arrives on Main Street; the clinic, clone bay, sheriff, store, gunsmith, water,
   cantina, garage, town hall and houses stand as planned walk-in buildings; nine named people at their counters, each
   reached on foot from their door; deputies and townsfolk out; a real flag on everyone; the store's shelves are its
   keeper's; under 150 draw calls at the widest zoom over the town.
3. **A new game starts there.** Selftest: players' START is Florida and the harness's Phoenix; `region action=start` puts
   you on the clinic doorstep with the town live; a fall in Florida wakes you at Meridian's clinic and in Phoenix at Rust
   Haven's. Loading `/?agent=1&start=florida` boots at the clinic door.
4. **Phoenix is untouched.** The island golden hash, the ring plans hash, twelve pinned P1 chunk hashes (and a 324-chunk
   sweep before/after) all match.
5. **The water is real, the gators bite, the infected come.** Selftest checks for each.
6. `selftest` **150/150 twice in a row on proved-fresh pages** (game.time under 40 s, day 0) on the final tree (328 s and 367 s); `node tools/ip-lint.mjs` 0 deny. The selftest budget is now 900 s (the battery outgrew 300 s on this busy machine). Seen flaky on other runs, not tied to Florida: the single-shot Mateo memory check (a miss), and a battery run on a reused page.
7. Screenshots in `docs/renders/web/florida/` at the game camera and from above, by noon and at dusk: Meridian, I-95
   through the swamp, the coast.


**Used by WEB_WATER_LIFE (2026-10-28):** the Atlantic and the lagoon carry the swell, sharks, bait and gulls; THE DEEP WATER, THE DROWNED BLOCKS and GULL KEY are placed off Meridian's coast through `shoreAt()`; the ocean's region colour is now teal (data/water.js).
