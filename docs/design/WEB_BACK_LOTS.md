# WEB_BACK_LOTS: alleys, back yards, docks and back doors (2026-10-28)

Lane BACK-LOTS, Wave 2 of `WEB_DEPTH_PLAN.md`. Branch `feat/web-back-lots`.

> Robert: "Back lots and alleys. Every block gets a service alley. Houses get backyards. Yes, we absolutely need that... Back doors would be the quiet way in. Lock, so kick, pry. Yeah, I love that... We gotta add depth to it." And earlier: "We need the engine to allow a person walk around the back of" buildings.

Which of the three engines it makes bite harder: **consequence**. The front door is on the street, in sight, and a kick there is heard 30 m off. The alley gives you a second way in: quieter, slower and out of sight. Choosing between them now matters.

## 1. Overview

Every generated town (world/citygen) now plans a **service alley down the back of every block**:
- Paved in the core, commercial, civic and industrial zones.
- Gravel in the residential blocks.
- Dirt at the edge and on farm blocks.

The lane is 4.6 to 5 m wide, so a car fits. A 1.1 m verge each side holds the utility poles, the dumpsters and the bins, and nothing ever stands in the lane. Blocks grew by the corridor's width (7.2 m), so the lots kept their depth.

Every building has a **back door** onto its back lot (a drive-through's back bays count). On a block, that back wall faces the block's alley.

**Yard homes** (houses, bungalows, cabins, stilt houses, trailers, farmhouses, ranch houses, and rowhouses and adobes on residential lots) get a **fenced back yard**:
- Fences along the lot lines.
- A side gate beside the house each side.
- A back fence on the alley with its own alley gate.
- Sometimes a detached garage whose roll-up opens onto the lane.
- The yard's things: a tool shed, a dog run, a clothesline, a vegetable garden, a burn barrel, a car on blocks.

The fence is **picket, board privacy, chain-link, adobe or split rail**, chosen by the town's region and wealth.

**Commercial lots** get a **loading dock** on the alley:
- A back roll-up bay at one end and a man door at the other.
- A 1.2 m concrete platform beside the bay with bumpers and pallets.
- A concrete apron down to the lane.
- A dumpster on the verge.

At runtime, the yard gates hang as real leaves from the interiors pool, so you can kick, pick or pry them. A share of the gates and back doors are locked, by data rows. A fence panel can be **climbed** (hold E: slow, heard a little) or **kicked down** (tap E: loud; pickets and boards give, chain-link and adobe don't). The town's walls and fences go into the foot and car **nav grids**, so people on foot route round buildings, through doors and gates, and down the alleys.

| File | What |
|---|---|
| `web/src/data/backlots.js` | every row: ALLEYS, ALLEY_PLAN, FENCES, FENCE_PICK, GATES, LOCKS, KIND_CLASS, NOISE, YARD, YARD_PROPS, GARAGE, DOCKS, ALLEY_PROPS; `validateBacklots(rows, rules, kinds)` |
| `web/src/world/citygen/backlots.js` | pure planner: `alleyFor`, `planYards`, `planDocks`, `alleyProps`, `reconcileBacklots`, `finishBacklots` |
| `web/src/world/citygen/backlots-build.js` | plan → colliders and items (one instanced mesh); `out.fences`, `out.gates` |
| `web/src/world/citygen/backaudit.js` | headless audits: `auditAlleys`, `auditLoops`, `auditYards`, `auditBacks` |
| `web/src/systems/backlots.js` | runtime: gates hung near you, `backLock` odds, fence climb/kick/break, `navOverlay` |
| `web/src/agent/backlots-api.js` | the `backlots` command and 9 selftest checks |

## 2. Player Fantasy

You roll up a block from the far end with the lights off. The street has a lookout on the roof and the front door is barred. The alley is dark: a dumpster, a pole, a chain-link run where a dog used to live. The gate is latched, not locked, so you push it and you're in the yard. The back door is locked, so you kneel and pick it (no one hears). If you'd kicked it, every raider within 30 m would turn.

When it goes bad, you go over the picket fence into the next yard (1.6 s with your back to the street) and down the alley to where the car is waiting. They follow the alley too: the nav grid knows it.

## 3. Detailed Rules

### 3.1 The plan (`layout.js` + `world/citygen/backlots.js`)
1. **Blocks grow** by `ALLEY_PLAN.grow` (7.2 m) on the grid step (and on a linear town's depth), so lots keep the depth they had.
2. **The alley** (`alleyFor`): a block with two fronts (deep ≥ 30 m) gets its lane down the middle. A one-sided block gets it along its back edge. The row is chosen by zone: `paved` for core, commercial, civic, industrial, rail and military; `gravel` for res; `dirt` for res blocks past `dirtPast` (0.7 of the way to the edge) and for farm. The lots' depth is `(deep − corridor)/2 − 0.5` (two-sided) or `deep − corridor − 1`. A courthouse green has no back and no alley.
3. **Lots never reach into the alley.** The setback is clamped to `lotDepth − d − 1.1`. A yard home fits only when `d + 5 + minYard ≤ lotDepth`, and keeps 2.4 m to the block's end.
4. **Gaps between buildings** are never sealed: yard homes `YARD.spacing` (4.2–7 m), core 2–2.8 m, the rest 2–4 m (before: 0.6–1.4 in the core).
5. **Back doors.** `makeBuilding` gives every building a back door unless it already has a back bay. `clearBays` leaves a back door when a back bay is walled up.
6. **Yards** (`planYards`, after the law's station and the clone tower take their lots). Only on res/farm lots. The lot lines are the middles of the gaps (at most 6 m past the house). The fence row comes from `fenceFor(biome, wealth ± 0.18)`. The parts:
   - **Side crossings** at 1.2 m in from the back corner, from each side wall to the lot line. One is a gate the side yard's width (≤ 2.6 m), or a 1.4 m gate and a panel.
   - **Lot lines** from the crossing to the alley line. A shared line is drawn once, from the nearer-to-front crossing.
   - **The back fence** on the alley line, with a 1.6 m alley gate in its widest stretch.
   - **A garage** in `GARAGE.chance` of yards ≥ 15 m deep. It sits 1.8 m off a lot line with its bay wall on the alley line, and is an `outbuilding`.
   - **Props** stand ≥ 1.5 m off the lot lines (a way down each side), off a 2.2 m walk behind the house, ≥ 1.5 m off the back fence (a climb lands clear), and clear of the gate and the garage.
   - A yard home has no fire escape.
7. **Docks** (`planDocks`) on `DOCKS.kinds` with a back wall ≥ 12 m: a 3.2 × 3.4 m bay 1.4 m from one end and a man door 1.6 m from the other. There is a 4.2 × 2.4 × 1.2 m platform beside the bay when the back lot is ≥ 4.8 m deep and the door's swing is clear.
8. **Bays and fences.** `clearBays(list, bounds, fences)` walls up a bay whose 6.5 m approach crosses a yard fence (the old rule for buildings and town walls, extended to fences).
9. **Verge props** (`alleyProps`, after `clearBays`):
   - A pole every 28 m on one verge.
   - A dumpster on each dock's verge.
   - A bin by half the alley gates.
   - Never inside a bay's 14 m drive lane, nor within 1.6 m of a door or gate.
10. **Canopies.** A gas station whose pump canopy would stand over an alley loses its canopy. A dock whose lane runs under a canopy is walled up.
11. **Sites** (`site.js`): hero buildings take lots whole. `reconcileBacklots` drops a yard whose home is no longer a yard home (and its garage). `finishBacklots` drops docks whose bay went and re-places the verge props.

### 3.2 The build (`backlots-build.js`)
Every piece is an item in citygen's one instanced mesh (no new draw call):
- **Alley:** a lane over verges.
- **Fence panels:** one collider each, tagged by row, plus posts.
- **Gate posts.**
- **Dog run:** three chain-link sides, a kennel and trodden dirt.
- **Clothesline:** posts, a line and washing (no collider).
- **Garden beds:** no collider.
- **Shed:** a box with its roof.
- **Burn barrel.**
- **Car on blocks:** a body, a cabin and four blocks, with cover both sides.
- **Dock:** platform, bumpers, pallets on top, apron; cover.
- **Verge:** poles with a crossarm, dumpsters with a lid (cover), bins.

### 3.4 Dressing (BACK-LOTS 2, `world/citygen/backdress.js`)
Robert's review of the first renders: the alley "reads as a plain empty sand strip". The dressing pass runs at the end of the build on its own seed (`town.seed ^ 0xd2e55`), so the plan and every audit's geometry stay put. It reads `DRESS` and `YARD_DRESS` in `data/backlots.js`.
- **Lanes:**
  - Darker wheel ruts on unpaved lanes.
  - Oil stains (5 per 100 m) and cracks (4 per 100 m) on paved lanes.
  - Puddles: 1.6 per 100 m, ×2.5 in wet biomes.
  - Weed clumps along both lane edges.
- **Poles:** two wires to the next pole on the same verge (spans ≤ 42 m), sagging 1.1 m in 4 stepped segments. A transformer can on every third pole.
- **Litter:**
  - 2–4 trash bags round every dumpster and bin, and clusters of 1–3 along the verges (3 per 100 m).
  - Broken pallets on the verges.
  - Weed clumps at every fence's foot.
- **Wrecks:** burned-out cars, one per 3 alleys (at most 6 a town). Each stands on the lot ground just past the verge, has a collider (`bl-burnt`: carbody) and cover both sides. They are never in a lane, a bay's drive lane, a door's step, a gate, a yard or a dock apron, and always ≥ 1.7 m from any wall (the way round).
- **Doors:** a step outside every back door; a two-step stoop for a yard home.
- **Across:** washing lines over gravel and dirt lanes (one every ~38 m, 45% each), strung at 3.4 m: a truck passes under.
- **Dock aprons:** oil stains and a pallet stack, kept clear of the bay's lane.
- **Yards let go** (poorer towns more often): a junk pile (`bl-junk`), a tire stack (`bl-tires`), a woodpile (`bl-woodpile`), a lawn chair, and 2–3 overgrown patches (gardens gone wild), on the same free ground the planner keeps.
- **Strays** (`systems/backlots.js alleyDogs`): while settlements build themselves, a town with alleys gets 1–2 stray dogs (70%, from its seed) in its alleys. They are the dogs system's own strays. Released, the town takes back the ones nobody adopted.
- **Budget:**
  - Every piece is an item of the one town mesh; the only new things that move are the dogs.
  - The biggest town is 33.4k items (it was 25.6k with the plan alone).
  - citygen's instance cap went from 90k to 120k, so three of the largest can be live at once.
  - The dressing pass takes ≤ 35 ms in the largest town (a 4 m box grid for its clear-ground tests).

### 3.5 Dead cars (BACK-LOTS 2: `data/wrecks.js`, `world/wreckbody.js`, `systems/wrecks.js`)
Robert, looking at three box cars by a road: "Are these placeholder cars or something? What happened to our cars?" Every static car in the world is now one of our own vehicle bodies (`systems/vehiclebodies.js buildBody`), dead.
- **Types:** sedan, pickup, van and LAWMAN, weighted 5:3:2:1, each scaled into the collider it always had (4.2 × 1.9 m; at least 0.78).
- **States** (`WRECK_STATES`), each made from the body's per-vertex `part` ids:
  - **rusted:** faded paint, rust blotches (smooth noise: they run across panels), flat tyres, no glass, sagging 7 cm.
  - **burned:** charred to about 1% albedo (it has to read black under the game's sun), ash patches on the tops, no glass, no tyres, on its belly, a ragged scorch on the ground.
  - **stripped:** doors gone, hood stood open on its hinge, wheels gone, cinder blocks under the axles.
  - **crushed** (the stunt show's): flattened to 46% height.
- **Paint:** the body is built in a neutral paint, and the instance tint gives it its old colour (`WRECK_PAINTS`: faded red, blue, olive, cream, black, green, brown, white, teal).
- **Sources** (`WRECK_SOURCES`, state mixes):
  - **roadside:** chunkgen's shoulder and median wrecks, a looted station's car.
  - **street:** the ring's kerbs, a holdout's kerb, a town's street wrecks, the island.
  - **boneyard:** holdout and roadside boneyards, stacked hulks, one on its roof.
  - **burnt:** the alleys.
  - **blocks:** yard cars, ring chop shops, a holdout lot's hulk, a base's stripped truck.
- **One draw call:** every dead car is one instance of a three.js `BatchedMesh` (one entry per type × state, built once). Owners hand sets over and take them back:
  - a chunk going hot or cold (`streamer.applyStep`/`release`);
  - a town stamped or released (citygen);
  - the island at boot (main.js);
  - a base's motor pool;
  - the stunt show.

  A base's `clearLot` clears the island's wrecks off its lot as it clears rubble.
- **Collision is unchanged:** every collider stays as it was. Two non-car colliders that wore the `wreck` tag were retagged (`tractor` and the drained lake's `boatwreck`, both roadside). The bases' helicopter keeps its tag (the island hash) and is told apart by size.
- **Pinned hashes:**
  - A chunk's wreck list is part of its hash (it stays a pure function), so the six P1 chunks with wrecks move in `p1ChunksReal` and `p1Chunks`.
  - `ringPlans` moves for the chop shops.
  - The island hash does not move: its colliders and RNG draws are unchanged.

### 3.3 Runtime (`systems/backlots.js`)
- **Gates.** Every 0.5 s, each yard within `GATES.near` (55 m) hangs its gates as an interiors ring (`bl:<yard>`, door kind `gate`). Past 80 m they are given back. A share `LOCKS[class].gate` is locked (none in an overrun town). Locked gates block the nav grid like any locked door.
- **Back doors.** `citygen.openings` locks `backLock(B, rec)` of a building's back doors: `LOCKS[KIND_CLASS[kind]][state]`. This replaces the flat 35%.
- **Fences.** E at a panel, in the E chain after doors, windows and roll-up bays:
  - **Hold** past the 0.3 s tap window for the row's `climb` seconds, then a 0.7 s drop (`interiors.startVault`). It is heard `climbNoise` m off. If nothing can land on the far side, it refuses.
  - **Tap** to kick: 0.55 s apart. A breakable panel loses a kick (heard `breakNoise × 0.6`) and at zero breaks: its collider rises to base 99, its items hide, it is heard `breakNoise`, and the nav grid rebuilds. Chain-link and adobe ring (10 m) and hold.
- **Pathing.** `NavGrid.overlay = navOverlay`. On every window rebuild, each live town near the window rasterises its ground colliders, then re-opens its doorways and gateways (a 1.4–1.6 m gap can fall between two 1 m cell centres once walls are grown). The windows are marked dirty whenever a town is built or released or a fence breaks.
- **Grip.** `citygen.gripAt` reads an alley lane's row grip (paved 0.95, gravel 0.82, dirt 0.74).

## 4. Formulas (with an example)
- **Corridor width** = `ALLEYS[row].w + 2 × verge`. Paved: 5 + 2.2 = **7.2 m**. Block step = `bm() + round(grow)` = `bm() + 7`.
- **Lot depth** (two-sided) = `(deep − corridor)/2 − 0.5`.
  - Example: a sonoran_sprawl block of 84 + 7 = 91 m between street centres. A blacktop2 side street is 8 + 2 × 1.6 = 11.2 m wide, so the block is 91 − 11.2 = 79.8 m deep. The alley is paved in the core, so lot depth = (79.8 − 7.2)/2 − 0.5 = **35.8 m**. Under the old plan the same 84 m step gave 84 − 11.2 = 72.8 m and 72.8/2 − 1 = 35.4 m.
- **A yard home fits** when `d + 5 + minYard ≤ lotDepth`. A house 11 m deep on a 25 m lot: 11 + 5 + 6 = 22 ≤ 25, so it fits with a 6–11 m yard.
- **Back-door lock odds** = `LOCKS[KIND_CLASS[kind]][town.state]`, decided per door by `hash(door.id) mod 100 / 100 < odds`. A house in a holding town has odds 0.45, a shop 0.6, the law 0.85; in an overrun town, 0.06.
- **Gate lock odds** = `LOCKS[class].gate`, decided by `fnv(door.id) / 2³² < odds`. A home is 0.25.
- **Noise** (m heard; `main.js noise()`):

  | Action | Heard at |
  |---|---|
  | Kick a door | 30 (DOOR.kickNoise) |
  | Pry with a bar | 18 |
  | Pick | 0 |
  | Kick a panel | `breakNoise × 0.6` (picket 13) |
  | Panel breaks | `breakNoise` (picket 22, privacy 26) |
  | Climb | `climbNoise` (picket 5, chain-link 14) |
  | Roll-up | 18 |

- **Time to cross**:
  - Picket climb: 0.3 (the tap window) + 1.6 + 0.7 drop = **2.6 s**.
  - Privacy: **3.6 s**. Chain-link: **4.0 s**.
  - Walking through a latched gate: under 1 s (the selftest measures both).

## 5. Edge Cases
- **A courthouse green** has no back: the lawn is walkable all round and gets no alley. The checks skip greens.
- **Core adobe blocks and terraces** have no yards. Their back doors open straight onto the alley; a yard fence would split a 2 m gangway in two and seal it.
- **A yard home swapped** for the police station, a clone tower or a site's hero loses its yard and its garage.
- **The leaf pool is full** (220 leaves shared with every door in town): a gate that can't hang stays an open gap. It is still a gate in the plan and in the audits.
- **Ruined homes** keep their yards. A **ruined dock building** gets no dock.
- **A fence breaks:** collider base 99, items hidden, nav dirty. It stays broken until the town is released (rebuilt whole when you come back). A broken fence is not yet saved (§6).
- **A climb with no landing** (a prop, a wall, a car on the far side) is refused with a prompt, and the hold resets.
- **Gas stations** facing an alley lose their pump canopy rather than roof the lane.
- **Outbuildings** (garages) don't count toward a town's size (the police station still comes at 30 lots).
- **Narrow boardwalk cross streets** (stilt and swamp towns): a bay facing a yard's end fence across a 4 m boardwalk is walled up (`clearBays` fences).

## 6. Dependencies (both ways)

**Reads:**
- `data/citygen.js` (KINDS, ARCHETYPES, ROADS, BIOMES).
- `data/interiors.js` (WINDOW.holdTap, DOOR noise).
- `data/materials.js` (MATERIAL_RULES.tags, every bl-* tag ruled).
- `world/citygen/audit.js` (TownProbe).
- `systems/interiors.js` (attachRing, detachRing, setLocked, startVault, kick).
- `systems/inventory.js` (forceLock).

**Read by:** citygen (lock odds, grip), the nav grids, the selftest, agents.

**Shared-file hooks (exact):**

| File | Hook |
|---|---|
| `web/src/world/citygen/layout.js` | imports; `alleys/yards/docks/backProps` on T; grid step / linear depth + grow; `alleyFor` per block; lot collection; yard-kind fit, setback clamp, spacing; `planYards` + `planDocks` before `clearBays`; `clearBays(…, fences)` and its back-door rule; `finishBacklots`; wrecks keep out of alley mouths; back door always (`makeBuilding`); garages `outbuilding` |
| `web/src/world/citygen/build.js` | import, `fences`/`gates` on out, one `buildBacklots(T, out, box)` call |
| `web/src/world/citygen/site.js` | import, `reconcileBacklots(T)` before and `finishBacklots(rng, T)` after `clearBays`, fences into `clearBays` |
| `web/src/systems/citygen.js` | import ALLEYS; `openings` lock odds via `backlots.backLock`; `gripAt` alley lanes |
| `web/src/engine/nav.js` | `this.overlay` and one call in `rebuild` |
| `web/src/main.js` | import, construct `this.backlots`, `update`, `?? this.backlots?.interact(p, I, dt)` in the E chain |
| `web/src/data/materials.js` | 13 bl-* tag rules |
| `web/src/agent/api.js` | import, commands spread, `backlotsChecks` call after the roadscape checks |
| `web/src/agent/citygen-api.js` | the police check counts lots, not outbuildings (`!B.outbuilding`) |

**Other lanes:** DEATH-RITES' cemetery hook in citygen is untouched. BALLISTICS: a round meets fence colliders by their material (chain-link stops nothing; a picket splinters). ZOMBIES: the infected reach yards through gates and alleys on the same nav grid. Breaking fences and working gates is theirs to add.

**Multiplayer (law 5):**
- The plan is a pure function of the town's seed, so every client builds the same alleys, yards and fences.
- Gate leaves and locks ride the interiors ring state like any door.
- Broken panels are not yet in the shard save. That is a follow-up: a `fenceBroken` event already fires, with the fence id.

## 7. Tuning Knobs (safe ranges)

| Knob | Default | Safe range | What it moves |
|---|---|---|---|
| `ALLEYS.*.w` | 5 / 4.8 / 4.6 | 4.5–6 | lane width (≥ 4.5: the validator) |
| `ALLEYS.*.verge` | 1.1 | 0.8–1.6 | room for poles and bins (raise `grow` with it) |
| `ALLEY_PLAN.grow` | 7.2 | ≥ widest corridor | block growth (golden chunk hashes move) |
| `ALLEY_PLAN.poleEvery` | 28 | 18–45 | pole spacing |
| `FENCES.*.climb` | 1.3–3.0 s | 0.8–5 | how slow going over is (keep > a gate walk, ~1 s) |
| `FENCES.*.kicks` | 0/2/3 | 0–6 | boots to break a panel (0: never) |
| `FENCES.*.breakNoise` / `climbNoise` | 20–26 / 4–14 | 0–40 | who hears |
| `FENCE_PICK` | rows | — | fence by region × wealth |
| `LOCKS.*` | 0.06–0.85 | 0–1 | locked back doors and gates by class × state |
| `YARD.minYard` | 6 | 5–12 | yard depth (deeper: fewer houses fit) |
| `YARD.spacing` | 4.2–7 | ≥ 4 | side yards (under 4 the gate gets too narrow) |
| `YARD_PROPS.*.chance` / `lean` | — | 0–1 / ±0.5 | how cluttered, by wealth |
| `GARAGE.chance` / `needYard` | 0.35 / 15 | 0–0.8 / ≥ 14 | garages on the alley |
| `DOCKS.kinds` / `dock` | — | — | who gets a dock, its platform |
| `GATES.near` | 55 | 30–90 | how far gate leaves hang (the leaf pool is shared) |
| `DRESS.*.per100` | 1.6–5 | 0–10 | litter density (items: watch the 36k a town) |
| `DRESS.weeds.every` / `tuft` | 4.6 / 2–4 | 3–8 / 1–6 | weed clumps (the biggest item cost) |
| `DRESS.burnt.perAlleys` / `max` | 3 / 6 | 2–8 / 0–10 | burned-out cars |
| `DRESS.across.h` | 3.4 | > 3 (validated) | washing over a lane clears a truck |
| `DRESS.strays.chance` / `max` | 0.7 / 2 | 0–1 / 0–4 | alley dogs (the dogs system caps all dogs at 32) |
| `YARD_DRESS.*.chance` | 0.25–0.55 | 0–1 | yard junk; `poor` rows scale up as wealth falls |

## 8. Acceptance Criteria (selftest checks, `agent/backlots-api.js`)

| # | Check | What it proves |
|---|---|---|
| 1 | **the rows validate** | Every row is whole: lane ≥ 4.5 m, every fence climbable, every breakable fence heard, lock odds for every kind's class, kick > pry > pick, no purple, every tag ruled in materials. |
| 2 | **every town block has an alley a car can drive** | In 10 archetypes × 2 seeds, every block except a green has an alley, and a 1.1 m car circle drives each end to end on the town's real colliders. |
| 3 | **a person can walk a loop round every building of a test town** | With every door and bay plugged, a 0.4 m person on foot from each building's front step reaches all 4 sides and 4 corners (550 buildings in 4 towns). |
| 4 | **every house has a fenced yard with a gate** | Every yard home on a res/farm lot (10 archetypes) has fence panels and an alley gate. With the gates shut, the yard reaches neither lane nor street; with the gates open, it reaches the alley. |
| 5 | **back doors face the alley** | Every building has a back door or bay, and on a block it faces the block's alley (> 600 buildings, > 50 docks). |
| 6 | **kicking a back door is louder than picking it** | Live, on a locked back door: kick heard 30 m > bar 18 m > picks 0. The lock odds come from the rows (holding > overrun; the law > homes). |
| 7 | **climbing a fence is slower than the gate** | Live: held keys through a yard's alley gate take less time than held E over the panel beside it (and at least the row's climb time). Two kicks break a picket; chain-link never gives. |
| 8 | **AI pathing uses the alleys** | Live: with the town in the foot nav grid, an end-to-end alley route stays in the alley. A route from a yard home's street to its back yard (whose straight line meets a wall or fence) never crosses a wall or panel; it uses doors, gates and the alley. |
| 10 | **the alleys and yards are dressed** | In 4 towns, every kind of dressing stands. No dressing collider stands in a lane or on a door's step. Every back door has its stoop. A town stays under 36k items and its dressing pass takes under 60 ms. The alley, loop and yard audits (checks 2–4) run on the dressed towns. |
| 11 | **strays live in the alleys of a town** | A built town's alley dogs stand in its alleys; released, it takes back the ones nobody adopted. |
| 12 | **no static car is built from raw boxes** | Every car-shaped collider in the live world (island, hot chunks, live towns) has one of our vehicle bodies standing in it, in a dead state, all in one batched mesh. |
| 9 | **draw calls < 150 standing in an alley** | Every back-lot piece is an item of the one town mesh; gates are pooled leaves. |

The existing citygen checks still pass on the new plan: the 20-stamp walkability audit, sites/homesteads/base, the 20 SITE rows, the law and the clone, and the live checks.

**Golden chunk hashes: none moved.** The island hash, `ringPlans` and all 12 pinned P1 chunk hashes pass in both batteries; the plan keeps settlements off pinned chunks, and generated towns are not part of any chunk hash. What does change: every generated town's layout. Blocks are 7 m bigger, so there are fewer of them, and the lots, buildings and street wrecks differ. A town's `rec.half` can grow with its extent, which moves which streamed (unpinned) chunks keep wild scatter off it.

**Not done (follow-ups):**
- Rear stairs on two-storey shops (fire escapes stay on side walls).
- Broken fences and gate states in the shard save.
- Cars ramming fences down; infected beating on gates (they bang on locked gates as doors, but don't climb fences).
- Rural homesteads keep their parcel fence and have no yards of their own.
