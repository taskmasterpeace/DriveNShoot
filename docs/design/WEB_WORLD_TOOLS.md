# WEB_WORLD_TOOLS: the travel math and the stamp tools (opening the country by tool work)

**Status:** built 2026-10-30 on `feat/web-world-tools`. **Rows:** `web/src/data/worldtools.js` (kinds, looks, densities,
the travel rows, `validateStamps`), `web/src/data/stamps.json` (the stamp rows the forge and the `stamp` command write).
**Fold:** `web/src/world/stamps.js`. **Math:** `web/src/world/travelmath.js`. **Forge:** the STAMP and TRAVEL tabs
(`web/src/forge/tab-stamp.js`, `tab-travel.js`). **Agent:** `stamp`, `trip` (and `travel from= to= vehicle=`),
`worldTools`, and the `world-tools:` selftest checks in `web/src/agent/worldtools-api.js`. **Screens:**
`docs/renders/web/world-tools/`.

---

## 1. Overview

Robert, 2026-10-30: *"I want to do all the math... tools so that we can stamp and do regions... buildings outside of the
cities... exits... neighborhoods... gated communities."* The whole country opens only after the tools and the travel math
exist, so the next 48 states are tool work, never hand-placed one-offs.

Nothing here is a second engine. Every stamp folds into a system that already builds the world:

| Stamp | A row says | Folds into (built by) |
|---|---|---|
| **REGION** | box (usmap m), look, climate, danger 0-5, faction lean | a region row like `REGIONS.florida` (`world/regions.js` Region, `world/worldindex.js` Corridor): its interstates from the usmap, spliced onto a neighbour region's line at a shared edge; biome rows from the look; life from climate and danger |
| **CITY** | a usmap town (or a spot), size class metro / city / town / village | citygen records (`systems/citygen.js` planWorld, `world/citygen/layout.js` layoutTown): a cluster of neighbourhoods |
| **HOOD** | the city, kind downtown / residential / industrial / trailer park / gated, offset | one citygen record of a `hood_*` archetype (`data/citygen.js`); a gated community is walled (`stone_terrace`), has gates where its streets leave, and posts guards at the gates (`systems/overrun.js` populate) |
| **EXIT** | region, road, mile (= its number), name, what stands there (fuel, motel, truck stop, diner, town, nothing), side, distance | a region exit row (`addExit`: the real-size interchange); its community built from exactly the stamp's structures (`worldindex.community`) |
| **OUTSIDE** | one place (farm, ranch, compound, church, school, prison, quarry, junkyard, motel, trailer park), or a region's DENSITY row (per km of road) | citygen rural records (`layoutRural`, the RURAL rows: six new ones, `biome: []` so the country's own roll never picks them) |
| **BASE** | the state, the `data/milbases.js` row, where to stand it | planWorld's milbase pass, anchored at the stamp's point instead of the real installation's when that sits past the drivable box |

And **THE TRAVEL MATH**: one road graph (`TravelNet`) of the built corridors as you drive them plus the national usmap
roads, priced per vehicle row on each road class with the engine's own fuel law; answered by `trip` (and the forge's
TRAVEL tab), held to the long road's measured I-10 drive and to a live drive within 10%.

**The proof state: GEORGIA**, Florida's neighbour, laid out end to end with the commands only (§3.4).

## 2. Player fantasy

You drive north out of Meridian on I-95 past the Rosewood exit and the squall line is not there any more. The swamp
gives way to longleaf pine and red clay; a green sign says EXIT 6 and a truck stop stands at the bottom of the ramp. Off
the shoulder a church with a tin roof, a junkyard behind a wall of hulks, a farm with a barn and a grain bin, every few
minutes something. An hour on, the dead sprawl of Atlanta: a downtown of towers you can climb, rows of houses, an
industrial belt, a trailer park, and on the east side a walled subdivision whose gate is held by two guards with SMGs.
A sign says FORT BENNING; the fence beyond it has a gate too. And the driver who wants to know how far it is asks the
map: Meridian to Atlanta, 60 game miles, 55 minutes at cruise, three tanks for a LAWMAN.

For Robert: open the forge, drag a box beside Florida, click the towns, the exits and the base, press ENTER on each, and a
state is in the game.

## 3. Detailed rules

### 3.1 The travel math (`world/travelmath.js`, rows `TRAVEL` in `data/worldtools.js`)
- **The graph.** Lines are (a) every built corridor (`W.cl` for I-10, `cor.cl` for each region interstate) sampled every
  ~250 m, exact world metres; (b) every usmap interstate segment no built corridor of that road covers (a built line of
  the same id within 2.5 km of its midpoint inside the streamed world), at x K x the class sinuosity; (c) every usmap
  county and dirt road. A line end within `snap` (70 usmap m, the forge's dead-end rule) of another line's middle gets a
  vertex there; vertices within snap merge. A built corridor's end meets the nearest uncovered vertex of the same road
  (`joinBuilt`).
- **Places.** Every town and holdout (a street from the nearest node, within `townReach`), every built exit (a node on
  the corridor + the ramp (600 m) + its access road's built length to the community), or `x,z`.
- **Pace.** For a vehicle row on a class in a mode: `top = maxSpeed x SETTLE[row]` (P1 measured: LAWMAN 37.5/46, DUNE
  BUGGY 35.5/40, MOTORCYCLE 44.7/52, others 0.84), `v = min(top, cap x OFFROAD, mode target)`; `throttle = (v/top)^p +
  class throttle`; `litres/s = 0.012 + 0.05 x throttle` (`systems/vehicledamage.js`, the same for every rig).
- **A trip** is Dijkstra on time; it answers km, game miles, minutes, litres, tanks, refuels, the km and minutes per
  class, how far one tank gets per class, the share on built road, the roads in order, and the path (world and usmap).
- **Modes:** flat (flat out: the 1:14 law's ten-minute Miami-Orlando), cruise (the long road's 30 m/s), careful (20).

### 3.2 The stamp tools (the forge's STAMP tab; the `stamp` command)
- **Rows, the row law.** `src/data/stamps.json` is a forge file (`FILES.stamps` in `src/forge/rows.js`): every write is
  row ops applied to the file on disk, field-preserving, refused if `validateStamps` finds a structural fault, with the
  inverse returned (undo). The tab keeps per-tab undo and redo (`Ctrl Z` / `Ctrl Y`).
- **Preview before commit.** A tool opens a modal prefilled from the click (the snapped town, the projected mile, the
  side of the road, the state under the box); PREVIEW folds the doc with the pending row through the engine's own code in
  the page (`WorldIndex` over the stamps, citygen's `planWorld`, `validateStamps` with the engine's tables) and draws it
  DASHED with its findings; COMMIT (`Enter`) writes it; DISCARD (`Esc`). Committed stamps draw solid; a region's open
  seam is a teal edge.
- **REGION:** drag a box; it snaps to 100 usmap m and onto a neighbour's edge within 400 m (the seam law wants them
  exact). Must not overlap a region (an edge may be shared), at most 12 x 12 usmap km, at least half its cells its state.
- **CITY / HOOD:** the city's centre is its usmap town (or the spot). Without hood stamps the size class tiles its ring
  (`CITY_SIZES.*.ring`: kind, bearing, distance); with them only those stand. Hoods of one city must not overlap (20 m of
  street between) and stand within the class's `across`.
- **EXIT:** on a stamped region's corridor; `mile >= 1`, 1.5 miles from the next on the same road; the name upper case.
- **OUTSIDE:** one place inside its region; or a density row `mix: { interstate: { kind: perKm } }`: every `step`
  (250 m) of each region corridor, each kind rolls `perKm x step / 1000`; one place a step, 140-300 m off the road on a
  random side, its drive pointing back at the road; never within 1.4 km of a town or a city hood, 900 m of an exit's
  community, 520 m of another outside place; at most 120 a region.
- **BASE:** one a state; the row must be that state's; `at` stands it there (planWorld looks for free ground within 6 km).

### 3.3 The seam law (two regions that share an edge)
- `buildRegions` records every shared edge on both regions (`Region.open`: side and the shared interval).
- **No wall, no fog** along it: `edgeFade` ignores an open side at that point, and the streamer's `regionWall` holds
  nothing that stands inside any region.
- **One road:** a region stamp's interstate that a neighbour's corridor of the same road crosses starts on THAT
  corridor's line (its last point inside the neighbour and the next one), then the usmap's own points further on. A
  corridor clips 400 m inside a walled side but exactly at an open side, and cuts where it ENTERS a box as well as where
  it leaves (`Corridor`). The two built roads meet at the edge on one line (measured: under a micrometre apart).
- **The region the point is in wins:** `regionAt` with a pad returns the containing region before a merely near one.
- Mileposts restart at the line (Georgia's real rule): a stamped region's corridor runs south to north from its south
  edge.

### 3.4 The proof state: Georgia (laid by commands only)
See `docs/renders/web/world-tools/georgia.md` for the exact command list and what each folded into. The rows: one region
(the box north of Florida's, sharing its north edge), the city of Atlanta (metro) with six stamped hoods including a gated
community, Savannah-side and I-75 exits with what stands at them, one density row for the land between, a handful of
single outside places (a prison farm, a quarry), and Fort Benning stood inside the box.

### 3.5 For agents
`stamp op=list|validate|preview|add|set|remove|undo kind= row=` · `trip from= to= vehicle= mode=` (also `travel from= to=
vehicle=`) · `trip table=true places= vehicles=` · `trip pace=true vehicle=` · `worldTools` · `forgePush file=stamps` ·
`selftest only=world-tools`. The forge page: `window.FORGE.stamp` (`preview(kind,row)`, `commit()`, `fold()`, `fit()`),
`window.FORGE.travel` (`set({from,to,vehicle,mode})`, `table()`).

## 4. Formulas

### 4.1 The travel math
- World metres = usmap x K (5.2). Built length counts as driven; a national edge's length x `ROAD_CLASSES[c].sinuosity`
  (interstate 1.0: the built I-10 is 87.8 km, the long road's 54.5 game miles; county 1.06, dirt 1.12).
- `top = maxSpeed x SETTLE`; `v = min(top, cap_class x OFFROAD[row][class], MODES[mode].target)`.
- `throttle = min(1, (v / top)^1.6 + throttle_class)`; `litres/s = 0.012 + 0.05 x throttle`; `litres/m = litres/s / v`.
- One tank on a class: `fuelCap / litres/m`.
- **Example** (LAWMAN, cruise, I-10): top 37.5, v 30, throttle 0.8^1.6 = 0.70, 0.047 L/s, 1.57 L/km, 38 km a tank;
  Los Angeles to El Paso 82.8 km (51.4 game mi) in 46.0 min, 130 L, 2.2 tanks.

| Trip (cruise) | LAWMAN | PICKUP | WHALER rig | MOTORCYCLE |
|---|---|---|---|---|
| see `docs/renders/web/world-tools/travel-table.md` (generated by `trip table=true` on the merged tree) | | | | |

### 4.2 Density
Expected outside places on a corridor of length L: `sum_k perKm_k x L/1000`, less what the clearances refuse; one roll a
`step`, so the most is `L / step`.

### 4.3 Hood rings
A hood at `(cos a x d, sin a x d)` world metres from the city centre (a = 0 east, clockwise on the map: +z is south).

## 5. Edge cases
- **A stamp past the drivable world** (a city in a region not yet stamped): its records are planned only when
  `W.inWorld` holds; the report lists the hood as `ok: false`.
- **A region stamp with the id of a hand region** (`florida`) is refused; hand regions always win (`stampedRegions`
  skips them).
- **Two regions overlapping by a hair** are refused (edges may touch within 1 m; that is the shared edge).
- **A corridor that only clips a box corner** (under 3 usmap km inside) is not built.
- **Pushing stamps live:** cities, hoods, outside places and bases re-plan citygen at once (every live settlement is
  released and stamped again: infestation and heat on unstamped records restart; an editor action, never gameplay).
  Regions and exits need the WorldIndex rebuilt: a page reload (the forge says so; the rows are on disk).
- **A gated community with no free character slots** posts fewer guards (the 160-character cap is never broken).
- **Fuel on a boat:** `trip` refuses (the road graph is for land rows).
- **Duplicate corridor ids** (Florida's I-75 and Georgia's I-75 are two Corridor objects with one id): exit ids carry the
  region (`GEORGIA-I-75-X12`), the travel graph keys lines by object, real terrain surveys each corridor on its own.

## 6. Dependencies
- **Reads:** `data/usmap.json` (interstates, roads, towns, the state grid), `data/regions.js` (Florida's rows: a look's
  `from`), `data/citygen.js` (ARCHETYPES, RURAL, WALLS, KINDS), `data/milbases.js`, `systems/vehicles.js` (VEHICLES),
  the fuel law in `systems/vehicledamage.js`, the long road's measured drive (WEB_LONG_ROAD.md).
- **Hooks in code this lane does not own (exactly these):**
  - `world/regions.js`: import the fold; `Region.open`, `openAt`, `inClip`; `edgeFade` skips open sides; `buildRegions`
    adds the stamped rows and links shared edges; `regionAt` prefers containment.
  - `world/worldindex.js`: the corridor clip uses `inClip` and cuts on entry; region exit ids carry the region; a stamped
    exit row carries `structures`; `community()` builds exactly those.
  - `world/streamer.js` `regionWall`: nothing inside any region is held.
  - `systems/citygen.js`: import `stampRecords`; `biomeFor` reads a region's `citygen` map; planWorld pushes the stamp
    records, skips the auto scatter on a stamped region's corridors (`autoTowns: false`), anchors a moved base;
    `stampReport`.
  - `systems/overrun.js` populate: a gated hood's guards at its gates.
  - `world/citygen/layout.js` layoutRural: `fenceFull` (the prison farm's full-height fence).
  - `data/citygen.js`: five `hood_*` archetypes and six RURAL rows (data only; `validateCitygen` green).
  - `forge/rows.js` `FILES.stamps` + `checkFile`; `forge/forge.js` the two tabs; `forge/help.js` their drawers.
  - `agent/api.js` import + commands + checks; `agent/forgetools.js` push for `stamps`; `agent/clone-api.js` `travel
    from= to= vehicle=` hands to `trip`.
- **Read by:** the HUD and map (`worldTools`), future state lanes (every new state is stamps).

## 7. Tuning knobs (`data/worldtools.js`)
| Knob | Default | Safe range | What it does |
|---|---|---|---|
| `ROAD_CLASSES.*.cap` | county 26, dirt 16, street 15, ramp 18 m/s | 10-40 | the most a driver holds on the class |
| `ROAD_CLASSES.*.sinuosity` | 1.0 / 1.06 / 1.12 | 1.0-1.3 | built length over a national line's length |
| `SETTLE.other` | 0.84 | 0.75-0.95 | flat-out share of `maxSpeed` for unmeasured rows |
| `MEASURED.throttleExp` | 1.6 | 1-3 | steady throttle at a speed (re-fit by the live-drive check: `api.worldToolsDrive.fit`) |
| `OUTSIDE_DENSITY.*` | farm 0.16/km of interstate ... prison 0.006 | 0-2 | outside places per km of road |
| `OUTSIDE_RULES.apart` / `clearTown` / `clearExit` | 520 / 1400 / 900 m | 200-3000 | spacing of outside places |
| `CITY_SIZES.*.ring` | metro six hoods | any | what a city tiles when no hood is stamped |
| `HOOD_KINDS.gated.guards` | 2 | 0-6 | gate guards |
| `NET_RULES.snap` / `townReach` / `joinBuilt` | 70 / 1600 / 3200 usmap m | | the graph's joins |

## 8. Acceptance criteria (`node tools/dl.mjs selftest only=world-tools`)
1. `world-tools: the stamp rows validate with the engine's tables, and a bad row is refused with why`
2. `world-tools: every stamped kind folds into the world (...)`: each region built with corridors, each exit built, each
   city with a hood in the plan, each single outside place placed, each density row placing some, each base planned.
3. `world-tools: the travel math matches the long road's measured I-10 (...) within 10%`
4. `world-tools: a real drive matches the travel math within 10% (a LAWMAN on I-10 at cruise for 75 s: distance, time
   and fuel, the engine's own burn)`
5. `world-tools: the proof state streams with no dead seams (...)`: the two halves of each road meet within 1 m, no fog
   at the seam, both chunks either side lay out with matching edges, road under the wheels 30 m either side.
6. `world-tools: a car crosses the seam at speed without the wall stopping it (Florida to Georgia on I-75)`, zero cross
   stalls.
7. `world-tools: a stamped city stands up (its downtown built, a gated community walled with a gate and guards there)
   under 150 draw calls`
8. Two full batteries green on fresh Chrome; `ip-lint` 0 deny; `gen-commands` run. Results in the hand-back
   (`docs/renders/web/world-tools/README.md`).
