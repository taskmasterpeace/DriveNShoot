# WEB_ROADSIDE: power lines, billboards, gas stations, junkyards, farms and the dam

**Status:** built 2026-10-23 on `feat/web-roadside` (rung 3 of the content ladder, "then human-made stuff":
[WEB_WORLD_EDITOR_PLAN.md](WEB_WORLD_EDITOR_PLAN.md) §3.3). **Engine:** the three.js web engine in `web/`
([web/AGENTS.md](../../web/AGENTS.md)). **Rows:** `web/src/data/roadside.js`. **Generator:** `web/src/world/roadside.js`
(+ `roadside-art.js`, the billboard atlas). **Live:** `web/src/systems/roadside.js`. **Agent:** the `roadside` command and
ten selftest checks in `web/src/agent/roadside-api.js`. **Renders:** `docs/renders/web/roadside/`.

---

## 1. Overview

Robert's calls this answers: *"long drives with the radio"*, *"rebuild the United States"*, survival at the core (fuel,
scrap and water are what these places are FOR), and the whole country compressed 60x (WEB_STREAMING: distances compress,
objects do not).

The roadside is the human-made layer between the interstate and the wild: what a long drive goes past, and what a driver
who is low on fuel, out of scrap or thirsty pulls off for.

| Kind | Rows | What it is in the game | What you DO there |
|---|---|---|---|
| **Power lines** | `POWER_LINES` (2) | lattice towers every 112 m on a route along I-10, three sagging conductors per span; THE COLORADO TIE from the dam to Phoenix's west substation (282 towers), THE PASO TIE (38); one tower DOWN across the westbound outer lane at mile 11 | drive round it, or into it (it is solid); a warning toast as you come at it |
| **Billboards** | `BILLBOARDS` (18) + `ADVERTS` (6) | faded, shot-up, peeled boards on three legs; exit boards name the REAL next exit and its real distance in game miles; faction boards (THE SLUICE's toll, TURN BACK) whitewashed over an old advert; pre-war adverts of our own | read them: where the next fuel is, who wants a toll, what to avoid |
| **Gas stations** | `SITES` kind station (4) | a walk-in kiosk from the floor-plan generator (ring.js `KINDS.gas`: canopy, pump islands, a real plan with containers), the underground tank's fill caps and vent, a brand board on a price pole; looted (a car left at the pumps) or a HOLDOUT's trading post (sandbags, drums, a water tank, keepers) | siphon the dregs with a hose into your car or your empty cans; buy fuel, water and a hose at a holdout's counter |
| **Junkyards** | `SITES` kind junkyard (2) | a corrugated fence with a gate toward the road, hulks in rows (stacked, some on their roofs), a crawler crane with a car on the hook, a walk-in workshop office (garage loot: wrenches, pry bars), tyre stacks; a guard dog (the dogs system) or squatters | strip a hulk for scrap on the game clock with a wrench or a pry bar (loud) |
| **Farms** | `SITES` kind farm (5), `CROPS` (5) | belts of fields both sides of a road, crops by state (cotton and alfalfa in Arizona, pecans and cotton in the Mesilla valley, sugarcane on Alligator Alley's canal and citrus groves inland of the Florida coast), worked green near the farmstead and gone to stubble further out; a walk-in farmhouse, a pole barn, a silo, a windmill over a stock tank; lined canals along the back | fill your water at the stock tank (the windmill pumps a little in every day); search the farmhouse |
| **Substations** | `SITES` kind substation (2) | chain-link round a gravel pad, transformers, gantries the line comes down to, a control house | (scenery and cover for now) |
| **The dam** | `SITES` kind dam (1): PALO VERDE DAM on the Colorado, held by THE SLUICE | an earth dam: the crest road on its fill (driveable: up the east abutment, along the crest, down the west), the upstream face in concrete, the spillway (five piers, four radial gates, the hoist house, the chute and its stilling basin), the gatehouse, the gate wheel, the intake tower in the drained bed and its catwalk, the cistern at the east toe; RIVER BEND FIELDS below it | the faction lever: whoever holds the wheel holds the water. The Sluice's keeper sells water and opens the gates for a price; with the keeper dead the wheel is yours. Open gates fill the cistern on the clock |

Everything is a pure function of the rows, the seed and the roads it stands by (WEB_STREAMING's law): it streams, it
hashes, it rebuilds the same. What a player changes (litres drawn, hulks stripped, the gates, who is dead) is state in
`systems/roadside.js` and rides the save.

## 2. Player Fantasy

You are three hours west of Phoenix with the needle on E. The billboard says EXIT 2, FURNACE MILE 9, 3 MILES, FUEL · FOOD,
and somebody has shot it forty times. Off the ramp the station's canopy is still standing and a sedan has been dying at
pump two for a century. You park beside the fill caps, feed the hose down the pipe and pull up thirty-two litres of
something that will burn. Across the road a rottweiler watches you from the boneyard fence; there is a pry bar in the
office and a hundred hulks with steel on them, and every bolt you crack is loud. Further on the cotton is green near the
farmhouse and dead beyond it, and the windmill still turns over a stock tank with water in it.

West of there a tower is down across the westbound lanes at mile eleven, its wires lying across the road. You see it
late, at night, at a hundred miles an hour.

At the state line THE SLUICE holds a dam. Their board on I-10 says DAM ROAD TOLL 10 SCRIP · NO GUNS ON THE CREST. They
sell water by the litre. They will open the gates for the fields below if you pay, and if you kill the man at the wheel
the river is yours to turn.

**Fan service.** Autoduel's truck-stop economy (fuel is the currency of distance). Zomboid's scavenging verbs (a tool
gates the loot, the work makes noise, time passes while you do it). GTA2's readable top-down road furniture. The books'
dead highways, holdouts that hold the water, and toll keepers on the only crossing (in our words: the lint is clean).

## 3. Detailed Rules

### 3.1 Where a row stands (anchors)
A row never stores world coordinates; it says where it is on the map, so it follows the road when the road is re-laid:
- `{ exit: '<exit id>', along, side, set }`: `along` metres down that exit's access road, on the traveller's right (`side`
  1) or left (-1), its near edge `set` metres off the road's centre.
- `{ rib: '<ribbon id>', along, side, set }`: the same down any road ribbon (the dam road is `palo_verde road`).
- `{ road: 'I-10', s | mile, u }`: a point on an interstate, `u` metres off its centreline (+u is the right of travel in
  +s: south of I-10, east of I-95 and I-75).
Buildings are axis-aligned (the ring's walls and doors are): a site turns its front to the cardinal facing the road.

### 3.2 Power lines
- A route is `[s, u]` points along an interstate. Towers every `pylon.span` metres of route; a spot on a road (any ribbon
  within `pylon.clear`, the interstate's paved width + 6 m) or on a site slides forward up to `pylon.slide`, or is skipped.
- A tower: four legs to a waist at 14 m, the mast to 22 m, two cross-arms, insulator strings, two belts of girts, footings.
  Collision: four 0.6 m leg boxes (people walk between the legs; cars do not).
- Conductors: three per span (both arm tips and the peak), each `wire.segs` straight pieces on a parabola sagging
  `wire.sag` x span. No collision (they are overhead).
- `down: [{ s, u, fall }]`: that tower is placed exactly at (s, u) and lies `pylon.h` metres along the road normal toward
  the carriageway (`fall: 'road'`). Collision: slices `fallen.w` wide, `fallen.h` tall along its length (tag `pylon`,
  steel). Its conductors droop from the next standing tower to the ground and lie across every lane (visual only).
- A hazard record per fallen tower (`roadside action=list` hazards): systems/roadside.js toasts DOWNED LINE ACROSS THE
  ROAD AHEAD once per approach to a driver within 260 m heading at it at over 8 m/s.

### 3.3 Billboards
- At `mile` on `road`, facing traffic `dir` (the corridor's own letters: E/W on I-10, N/S on I-95 and I-75), on that
  traffic's right, `billboard.off` metres past the outer shoulder. Never within `billboard.keepExit` of an interchange.
- Three wooden legs and a catwalk; the face (12 x 4.2 m) on top, tilted back toward the camera as the road signs are.
- **kind exit**: the first exit AHEAD in the direction of travel on that road, and `miles = max(1, round(|X.s - s| / mile))`
  game miles (`STREAM.mile` = 1,609 m of built road). Lines: `EXIT n`, its name, `n MILES`, what is there (FUEL · FOOD,
  FUEL · WATER · TRADE, HOLDOUT · SAFE BEDS; a dead exit: NO SERVICES). Never typed by hand: computed from the map.
- **kind advert**: an `ADVERTS` row. **kind warning / toll**: an old advert under whitewash and spray; the lines are the row's.
- `cond`: faded (sun bleach, heavier up top), shot (16-30 bullet holes), peeled (paper strips gone to grey plywood),
  repainted. Painted once at boot into one atlas (world/roadside-art.js), drawn by one pool (`bills`): +1 draw call while
  any board is on screen.

### 3.4 Gas stations
- The kiosk is a ring building of kind `gas` in zone `strip` (walls, floor plan, containers with `pumps` loot, a roof that
  hides when you walk in), its canopy and pump islands out front; the apron is a `lot` pad from the kiosk to the road.
- The underground tank: three fill caps beside the canopy (the siphon point, `tank` spot, reach 3.4 m), a vent pipe, the
  patched slab over it. Litres: looted `station.tank` [14, 34] by the site's seed; holdout `station.holdoutTank`.
- **Siphon (E at the caps with a `siphon_hose`)**: the car within 9 m of the caps first (up to its tank's room), then every
  empty `fuel_can` you carry (10 L each, a can is filled whole or not at all). What does not fit stays in the tank. A dry
  tank refuses. A holdout's tank is guarded while any of its counter keepers lives ("buy at the counter").
- With a car parked beside the caps, E is the caps' (siphon), F is still the car's.
- **A holdout's counter** (the keeper's dialogue): 20 L into your car parked within 60 m, your empty cans filled, your
  water filled, a siphon hose; prices x the drifters' standing tier (data/trade.js `PRICE_TIER`; hostile: no deal).

### 3.5 Junkyards
- A `w x d` lot behind a corrugated fence (`junk`, sheet metal) with an 9 m gate toward the road. The office is a ring
  `shop` (WORKSHOP, garage loot) by the gate. Hulks in `rows` rows 6.4 m apart, 4.9 m along, 18% gaps, 32% stacked two high
  (twice the scrap), 12% on their roofs; each hulk is a `hulk` spot with `scrap` [3, 6] x its stack.
- **Strip (E at a hulk, a wrench or a pry bar in your pack)**: a job on the game clock. Every `hulk.hoursPer` game hours (a
  quarter hour: 7.5 real seconds) one `scrap` goes into your pack (or onto the ground at your feet when it is full), and
  the work is heard `hulk.noise` metres off (g.noise: the infected, the AI, dogs). The job stops when you step away, get in
  a car, lose the tool, or the hulk is bare. Bare is bare forever (in the save).
- **Guard**: a dog row (breed, name) is made once by the dogs system at its kennel the first time you come within
  `keeper.promoteR` (from then on it is the dogs system's, in its save); a squatters row is KEEPERS people round a fire.

### 3.6 Farms
- A belt: fields of 120-190 m along the road and `farm.depth` deep, `farm.gap` apart, on `sides`, starting `halfW + 8` off
  an access road (on an interstate: past the pole line, or past its canal on the canal's side).
- A field is worked if it lies within `keptR` (default 320 m) of the farmstead along the road, otherwise worked by chance
  `worked`. Worked: its crop's rows in its colours (cotton bolls on top). Fallow: stubble rows on paler ground, 35% gaps,
  weeds. Orchards: trees in a grid (at most ~220 a field), a dead one here and there.
- Rows run along the field, cut into `farm.seg` pieces (a chunk owns a piece by its centre). No row, tree or slab stands
  on water (the region's own depth, world/regions.js) or within 5 m of another road; a field on either is skipped.
- Canal `dry` / `dam`: a concrete-lined channel along the back edge (walls 0.6 m, solid: tag `canal`). `region`: the
  region's own canal is the water (Alligator Alley).
- Farmstead: a walk-in farmhouse (ring `house`, zone `residential`), a pole barn (`shed`), a silo (`silo`), a windmill
  over a stock tank (a `water` spot), an old tractor. The stock tank holds `tank.windmill.cap` litres and the windmill
  pumps `perDay` a game day into it.

### 3.7 The dam (one authored site)
- The road: from I-10's north shoulder at `from.s` to the foot of the east abutment, up at `dam.grade` to the crest at
  `dam.crest` metres, `len` metres along the crest, down the west abutment, on to the old valve house. It is a WorldIndex
  ribbon on a `ramp` piece: the chunk generator draws its fill (an earth dam's body) and the relief carries cars and
  people up onto it (`heightAt`); guardrails on both edges wherever it stands taller than `STREAM.ramp.rail`.
- The works over the fill (section 1) are solid where they should be (`dam`, concrete; the crest parts float at the crest
  so movers under them are not stopped).
- **The wheel (E on the hoist deck's road side)**: turns the gates open or shut if nobody holds it (the sluice keeper is
  dead) or you are allied with the drifters; otherwise "the sluice holds the wheel: ask its keeper". The keeper opens them
  for 120 scrip x your price tier, shuts them for free, and sells water.
- **The cistern**: fills `tank.cistern.perDay` litres a game day while the gates are open, up to `cap`; none while shut.
  E at it fills your water containers and lets you drink.
- The river: the row names it (`river: 'COLORADO'`). Its water belongs to the rivers lane (L1, world/rivers.js, not yet
  landed on this tree): the reservoir and the river bed are drawn dry until it does (section 6).

### 3.8 Keepers
- `KEEPERS` rows: name, title, real flag, job (`fuel`, `guard`, `squatter`, `sluice`), post (`counter` just in from the
  kiosk's front door, `forecourt`, `yard`, `wheel`, `crest`), weapon, portrait.
- Made real (drifters, holding their post) when you come within `keeper.promoteR` of the site, back onto their record past
  `keeper.demoteR`. Killed, they stay dead (in the save). Not saved as characters (as the ring's residents are not).

## 4. Formulas

| # | Formula | Variables |
|---|---|---|
| F1 | next exit = argmin over exits X on the road with (X.s - s)·dir > 0 of \|X.s - s\| | s: the board's arc length; dir: +1 for the road's first direction |
| F2 | miles = max(1, round(\|X.s - s\| / mile)) | mile = 1,609 m (STREAM.mile, a game mile of built road) |
| F3 | tower k at route distance d = k·span (slid by 8 m steps up to `slide` if blocked) | span 112 m, slide 48 m |
| F4 | conductor y(t) = yA + (yB - yA)t - 4·sag·L·t(1 - t), t in [0, 1] | sag 0.05, L the span |
| F5 | siphoned = min(tank, carRoom) + 10·n, n = cans filled whole from what is left | carRoom = fuelCap - fuel |
| F6 | scrap(t) = min(left0, floor(Δh / hoursPer)), Δh the game hours worked | hoursPer 0.25; 1 game hour = 30 real s |
| F7 | stock(t) = min(cap, l0 + (h - h0)·perDay/24) (a windmill always; the cistern only while open) | cap 60 / 400, perDay 24 / 600 |
| F8 | price = ceil(base x PRICE_TIER[tier].buy) | fuel base 20 L x 1.6, water 2 L x 3, hose 15, gates 120 |
| F9 | fallen tower: foot (s, u), tip = foot + n·h·sign(-u) | h 22 m; on I-10 at u = -29 the tip lands at u = -7: shoulder and outer lane covered, inner lane open |

**Worked example (the board at mile 12.4 eastbound).** s = 12.4 x 1,609.344 = 19,956 m. Exits ahead eastbound: EXIT 2
FURNACE MILE 9 at s = 25,458 (the next), EXIT 4 at 50,966. |25,458 - 19,956| = 5,502 m; 5,502 / 1,609 = 3.42 -> **3 MILES**.
The face reads EXIT 2 / FURNACE MILE 9 / 3 MILES / FUEL · FOOD (the selftest recomputes it from the map).

**Worked example (the siphon).** FURNACE MILE 9 FUEL's tank rolls 32 L. A pickup with an empty 70 L tank parked beside the
caps takes all 32 (F5: min(32, 70) = 32, nothing left for cans): the tank is dry; a second pull is refused.

## 5. Edge Cases

- **A road re-laid under a row** (the forge moves an exit): the anchor follows the road; the validator reports any site
  footprint a road now runs through (`foot.roads`), any billboard closer than `keepExit` to an interchange, any reach into
  a pinned P1 chunk or the island. A broken row is skipped with a warning (`roadside action=list` warnings), never a crash.
- **The pinned P1 chunks and the island** (`data/golden.json`): no roadside row may reach them. The validator names the
  chunk; the selftest fails on it. Routes were laid round them (the Colorado tie keeps 400 m north of I-10 past the state
  line, comes in east of chunk -128,-21, stays on the north side past -25,-4).
- **A field on water or a road**: skipped whole (a warning); a row piece or tree in water is dropped (the region's depth on
  a 4 m grid, 8 m for trees).
- **A tower spot on a road or a site**: slides forward up to 48 m; past that the tower is skipped and the span left
  open (a broken line, more than 2.6 spans: no conductors drawn across it).
- **Siphon with nothing to fill**: refused ("bring the car alongside, or an empty can"); the tank keeps its litres.
- **Siphon with more than you can hold**: you take what fits; the rest stays for the next can.
- **Strip with a full pack**: the scrap lands on the ground at your feet (a ground pile, as the inventory does).
- **Strip interrupted** (stepped away, into a car, the tool dropped): the job stops; the hulk keeps what is left.
- **A holdout keeper killed**: dead in the save, never promoted again; the guarded tank is then open to a hose; the dam's
  wheel is then yours.
- **A save and load**: tanks, hulks, gates and cisterns, the dead and the junkyard dogs come back as they were; keepers are
  promoted again near you from their records. A save from before the roadside loads with everything fresh.
- **A chunk evicted and rebuilt**: identical (the layout is pure); what was taken is state, not layout, so a stripped hulk
  still looks whole (the shell stays) but is bare.
- **The downed line and the trundle** (systems/travel.js): the coach's lane-blocked rule sees the fallen tower and passes it
  by the inner lane, as it does a wreck.
- **Night**: the boards keep their faces (no light of their own yet); the holdout stations' fire barrels glow.

## 6. Dependencies

**It reads:** WEB_STREAMING (chunks, the towner interface, pools, golden hashes), WorldIndex (exits, access roads,
corridors, ribbons, pieces, rails), world/ring.js `geo()` and data/ring.js `KINDS` (walk-in kiosks, offices and farmhouses
with real floor plans), world/regions.js (Florida's water depth), data/items.js (fuel cans, water containers, scrap, tools),
data/trade.js (price tiers), systems/dogs.js (the junkyard dog), the inventory, the survival needs, g.noise.

**It changes (shared files, minimal):** `world/worldindex.js` (builds the Roadside before bucketing; adds it to `towners`),
`world/chunkgen.js` (the `bills` pool; matrix items and floating boxes in a towner's extras; scatter and mesas keep off
sites), `world/streamer.js` (the `bills` pool and its atlas), `data/streaming.js` (`POOLS.bills`), `data/materials.js`
(rules for pylon, hulk, silo, billboard, canal, dam, wirefence), `data/items.js` (`siphon_hose`), `main.js` (the system,
its update, E at a roadside spot), `agent/api.js` (the commands, the checks, save/load).

**What depends on it / what it waits for:**
- **The rivers lane (L1, `world/rivers.js`):** the dam's reservoir and river, and wet farm canals in Arizona, need its depth
  authority. Asked in the hand-back: adopt the dam row (`river`, the crest line) and the `dry` canals as L1 sources.
- **The World Forge** (SITE and MAP tabs): the rows are pure data with `validateRoadside(W, rows, built, pinned)` exported;
  the tabs can draw and edit them later.
- **Traffic (R3)** and **the director**: a toll checkpoint on the dam road and raiders at a downed line are natural events.

## 7. Tuning Knobs

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `pylon.span` | 112 m | 80-160 | towers per km (instances and boot ms scale with 1/span) |
| `pylon.h` | 22 m | 16-30 | how far a fallen tower reaches across the road |
| `wire.sag` | 0.05 | 0.02-0.08 | conductor droop |
| `billboard.off` / `keepExit` | 42 m / 640 m | 25-80 / 520-1000 | where boards stand; never on a ramp |
| `station.tank` | [14, 34] L | [0, 60] | the reward for a hose |
| `station.sell` | 20 L at 1.6 | price 1-4 | a holdout's fuel economy |
| `hulk.scrap` / `hoursPer` | [3, 6] / 0.25 h | [1, 10] / 0.1-1 | scrap per hulk, time per piece |
| `hulk.noise` | 18 m | 8-40 | how much attention stripping draws |
| `keeper.promoteR` / `demoteR` | 170 / 260 m | 120-250 / +60 | when keepers are real |
| `farm.depth` / `seg` | [110, 170] / 40 m | 60-250 / 20-60 | field size; row instances (and their hot bounds) |
| `keptR` (per farm) | 320 m | 0-1000 | how much of a belt is still worked |
| `tank.windmill` | 60 L, 24/day | cap 20-200 | free water on a farm |
| `tank.cistern` | 400 L, 600/day | | the dam's lever |
| `dam.crest` / `grade` | 9 m / 6% | 5-14 / 4-8% | dam height; ramp length = crest / grade |

## 8. Acceptance Criteria

Each is a selftest check (`node tools/dl.mjs selftest only=roadside`):
1. The rows validate against the map with no errors; no roadside chunk is a pinned P1 chunk; every kind is built (>150
   towers, >=1 downed line, >=15 billboards); the layout costs < 120 ms of boot.
2. Every exit billboard names the real next exit ahead and its distance in game miles (F1, F2), and a board's chunk built
   fresh draws its face in the `bills` pool.
3. The downed line: a `pylon` box covers the westbound outer lane's centre at its s, and a car driven at it in that lane at
   18 m/s stops against it (never past).
4. A looted station: with no hose the prompt says so; with one, E at the caps (a pickup parked beside them) moves every litre
   into the pickup, the tank is dry, a second pull is refused, and a save and a load keep it dry.
5. A junkyard hulk: refused by hand; with a wrench, E starts the job, one piece after 1.5 pieces' time, all of them by the
   end, the hulk bare and refused after.
6. The dam: a pickup driven up the east abutment reaches the crest height; the cistern stays dry with the gates shut, has
   over 30 L two game hours after they open, and fills an empty bottle.
7. Purity: the chunks of a station, a junkyard, a farm, the downed line, the dam, a billboard and a Florida station hash
   the same built sync and sliced, and their east and south edges match their neighbours'.
8. Under 150 draw calls at the widest zoom over the FURNACE MILE 9 cluster (farm belt, station, junkyard), no pool
   allocation failing and no hot chunk missing a pool while it comes in.
9. Every roadside collision box classifies to a material by rule.
10. A holdout station's two keepers come in with real flags and the counter's dialogue, its tank refuses a hose while they
    live, and both go back onto their record when you leave.

Plus the whole battery green twice on fresh pages, `scenario name=stress` not regressed, `ip-lint` 0 deny, and the
renders in `docs/renders/web/roadside/` reviewed (section 9).

## 9. As built (2026-10-23)

(Measured numbers and the critic's pass: filled in below at hand-back.)
