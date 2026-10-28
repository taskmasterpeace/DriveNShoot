# DSOA web engine — PROCEDURAL CITIES AND BUILDINGS

**Status:** LANE SHIPPED on `feat/web-citygen` (2026-10-27), waiting for the lead to land it.
**Owner:** Robert. **Lane:** citygen (harness :3403). **Gap doc:** `WEB_DEATHLANDS_GAP.md` G4 (storeys), G7 (holdouts), G8 (breadth), acceptance 8.
**Schema:** `WEB_LOCATION_BIBLE.md` §3.1 SITE rows, §3.2 CITY ARCHETYPE rows, §3.3 biomes, §3.4 layout ids, §4 the miniature formula.
**Layer stack:** `WEB_WORLD_EDITOR_PLAN.md` L3 Settlement + L4 Sites.

Code: `web/src/data/citygen.js` (every row), `web/src/data/sites/` (SITE rows), `web/src/world/citygen/` (`layout.js`
plans, `build.js` makes them solid, `audit.js` walks them, `site.js` stamps a SITE row), `web/src/systems/citygen.js`
(the plan of the country, stamping near you, the mesh, the APIs), `web/src/systems/overrun.js` (the dead against the
living), `web/src/agent/citygen-api.js` (commands + checks), `web/src/scenarios/overrun-test.js`.

---

## 1. Overview

Robert (2026-10-27): *"Use a procedural approach for city generation that ensures biome, building, and city density
variations ... take the real layouts and architecture and make small versions of it ... you got to be able to drive ...
some buildings should have garages, there should be warehouses, where you can go on a roof and shoot from the roof ...
up to 6 stories ... live in a city or outside of a city ... I don't think all cities should have walls ... sealed bunkers
are in the military base, and they're vast, and far in between ... different biomes, different roads ... cities be able
to get overrun ... to playtest, you gotta be able to test it."* And: **systems first, box-level art.**

What exists now:

| Piece | What it does |
|---|---|
| 26 city archetypes | Sonoran sprawl, adobe pueblo on a mesa, plains grain town, rust-belt mill town, Appalachian hollow, gulf stilt town, swamp ferry town, New England green, Pacific timber port, alpine mining stack, interstate exit cluster, courthouse-square county seat, company town, college town, military base town, dead suburb, port wharf, refinery town, oasis ring, frozen outpost, badlands crossroads, salt works, delta river town, hot-zone ruin, walled stronghold, casino strip — covering all 19 biomes; 8 walled, 18 open |
| 37 building kinds | houses, rowhouses, adobe blocks, stilt houses, cabins, trailers, shops, saloons, diners, gas stations, **auto shops / garages / parking structures / warehouses / quonsets / barns / fire stations / truck stops with roll-up bays you drive into (and through)**, motels, churches, schools, clinics, hospitals, courthouses, apartment blocks, offices, hotels (to 6 storeys), grain elevators, mills, barracks, HQ, guardhouses, farmhouses, ranch houses, **police stations** (patrol bays for the security lane's cars), **cloning centers** (fortified 4–6 storey medical towers, once per major city) |
| Storeys to 6, anywhere | every storeyed building is a world/storeys.js record: switchback stairs to every floor and to the ROOF (bulkhead), parapets to shoot over, fire escapes (outside stairs with a door into every floor), plank bridges between roofs, ruins cut off at a lower floor and open to the sky (half walls), per-floor loot, cover points |
| Roads by biome | 8 road rows with grip (dirt track 0.72, gravel 0.80, switchback 0.84, boardwalk 0.86, brick 0.90, causeway 0.92, blacktop/divided 1.0); a car's grip follows the row under it |
| The country's plan | at boot, along every streamed corridor: towns of the biome's archetypes, real SITE rows, homesteads you can live in outside a city (farmsteads, ranches, roadside motels, cabins, trailer parks, truck stops, stilt camps), military bases only at real base anchors and ≥ 40 km apart; built only within 760 m of you |
| Military bases | fence + gates + towers, a runway with hangars, a housing grid, the HQ, and under it **a VAULT of 6–8 levels** (entry, security, barracks, labs, storage + power, the sealed ring-platform room) on the underground lane's levels |
| Doors, windows, bays | street-storey doors and windows join `systems/interiors.js` near you (leaves you kick, pick or pry; back doors locked in a holding town; glass you smash, climb through, board up); roll-up bays roll down (a wall), up (drive through), lock and pick open |
| Overrun | every settlement has an infestation read as a LEVEL 0–5 (CLEAR → DEAD ZONE, falls at 4) and a noise HEAT that pulls hordes; it spreads to neighbours from level 3, recovers when quiet; SIEGE NIGHTS every 7±1 days by the study's formula in 3 waves (`docs/research/GENRE_DEPTH.md` §4); migrating hordes are records that walk at dusk and stand up to 40 bodies in the street near you; a siege is defense vs strength; past 0.75 the town FALLS (gates open, residents run or turn, loot picked over, map marked); clear it and it is RETAKEN |
| SITE rows | the location bible's 263 rows (`data/sites/*.js`, merged from `feat/web-sites`) at their real anchors (`tools/sites-project.mjs` bakes the atlas projection into `data/sites/xz.js`), plus 12 hand-written seed rows: real Arizona and Florida places (Tombstone, Bisbee, Jerome, Ajo, the Titan silo, Winslow, St. Augustine's star fort, Key West, Cedar Key, Ybor City, Cape Canaveral, Fort Jefferson), our names, real layout notes; the stamper is generic for the hundreds the lead adds |

## 2. Player Fantasy

You crest a rise on I-10 and there is a town — not a copy of the last one. A grain elevator towers over a two-block main
street; a mile on, a rust-belt mill town's brick rows climb a slope; in Florida a stilt village leans over the marsh on a
causeway. You drive your rig straight through the roll-up door of a warehouse and out the back with raiders on your
bumper, run up four flights of a hotel, put your back to the parapet and shoot down into the street. You cross a plank to
the next roof. You find a farmhouse off a gravel road and make it home. One dusk the radio says a horde is walking the
road toward the county seat — you can help hold it, or come back next week and take it back from the dead.

## 3. Detailed Rules

### 3.1 Rows (`data/citygen.js`)
- **BIOMES** (19, §3.3 ids): road rows by role, ground/wall/roof palettes (no hue 270–320), flora.
- **ROADS** (8): width, sidewalk, grip, speed, colour, curb; boardwalk/causeway/switchback lay differently.
- **KINDS** (35): footprint ranges, storeys [min,max] (cap 6), street-storey height, BAYS `[count, width, height]` and
  `through` (a second set on the back wall), roof access (stair | ladder | none), parapet, fire-escape chance, zones,
  loot row, `claimable`.
- **ARCHETYPES** (26): biome[], size, block plan (grid | organic | square | radial | linear | canyon), block size, layout
  id, zoning fractions, storeys per zone, kinds per zone (weighted), density core→edge, age, damage, wealth, WALLS (most
  `none`), roads by role, population, defense.
- **WALLS**: none, earth berm, palisade, car husk, container, stone terrace, chainlink.
- **RURAL** (7): parcel, buildings, fence, biomes, spacing along a road, offset off it.
- **MILITARY**: size, runway, hangars, housing grid, fence, the vault (kind `vault`, levels 6–8), spacing 40 km.
- **OVERRUN**: start, threshold (0.75), retake (0.2), kill drain, decay, horde (speed, seek, bodyR, bodies, kill, press,
  arrive, hold), noise draw, dusk/dawn hours, flee share, loot shift.
- **PLACE**: city spacing along a corridor (9 km), offset, clearances (island 2.2 km, holdouts, exit communities),
  attach/release radii, the most built at once (3).

### 3.2 The town plan (`world/citygen/layout.js`, pure)
1. Streets: axis-aligned lines by the block plan; the line nearest the centre is MAIN STREET (row `roads[0]`), the edges
   tracks (`roads[2]`), the rest side streets. Organic plans drop half of some cross streets (cul-de-sacs); linear plans
   are one main street with a block either side; a courthouse square keeps its middle block as the green.
2. Blocks between the streets, zoned centre-out: core, commercial on the main street, civic by the core, industrial and
   rail on the +x flank, farm at the edge, homes in between.
3. Lots: each block frontage is cut into lots; the zone's weighted kinds are tried until one fits; density decides empty
   lots. Storeys roll inside zone ∩ kind, leaning taller toward the core; the biggest core building gets the archetype's
   top storey (the skyline). A ruin is cut off 1..n-1 floors down.
4. Doors: a front door; roll-up BAYS on the front (and back for a drive-through); motels a door a room; maybe a back
   door. `clearBays`: a bay needs 6.5 m clear outside it (no building, no wall) or it is walled up.
5. Bridges: two accessible roofs facing across ≤ 7 m, sharing ≥ 3 m of edge, within 3.2 m of height → a plank bridge
   (one per roof).
6. Wall (only archetypes/rows that say so): a perimeter with gates where streets leave; towers at the corners.
7. Wrecks in the streets (cover), never within 10 m of a bay or 4.5 m of a door.

### 3.3 Making it solid (`world/citygen/build.js`)
- **Walls** per storey band: one box per segment between gaps, `base` = the band's floor, `height` = the next floor;
  door gaps (lintel boxes float above: people pass under a 2.6 m lintel, a car under a bay's); window HOLES every 3.6 m
  (`holes`: sight and rounds pass over the sill, people do not). A ruin's top band is jagged half walls.
- **Stairs**: a switchback core (world/storeys.js plan law: flight 0 in band 0, the flights above back and forth in
  band 1/0) against a side wall that is not the front, not the back with bays, not the escape side, clear of every door
  swing and of the drive lane between bays. Flanks, rails round the holes, top-end blocks; a cupboard closes the pocket
  under the street flight's top landing; each flight carries an `approach` point in the room and its foot landing's
  column (storeys.steer walks up to the foot from the room side, never along a stair's strip).
- **Roof**: the core goes on up to the roof deck (stair, or a ladder at pitch 1.73); a PARAPET (0.6–1.1 m) round it with
  gaps where a bridge or the escape lands. A flat roof otherwise.
- **Fire escape**: the same core OUTSIDE a side wall (2.8 m deep, open-air flanks, outer rails per landing), a door into
  every floor, kept off other buildings and streets.
- **Records**: each storeyed building, escape and bridge is a storeys record `{ b, n, Y, flights, ix0..iz1, top, cg }`
  registered by `Storeys.addExt` — `ix` = the outer footprint, so a roof deck reaches the parapet and a bridge's end.
- **Loot**: 1–4 containers per floor by area (`LOOT_BY_KIND`, richer up high: `gunsmith` from floor 3 at 18 %/floor),
  a crate on half the roofs; each sits at its floor's height (`box.y`), registered with inventory as the ring's are.
- **Cover**: points with facing and height — wall faces at street level (full), window frames inside (full), ruin half
  walls, parapets, pumps, crates (half), town walls (full), wrecks (half).

### 3.3b Openings (doors, windows, roll-ups)
A live building within 110 m of you (the ring's RING_OPENINGS.near) takes its street-storey doors and windows from the
interiors pool through `Interiors.attachRing` and gives them back past 150 m or when released: doors are real leaves
(kick, pick with lockpicks, pry with a bar; 35 % of back doors in a holding town start locked), windows are glass
(smash, climb through, board up from inside; the WINDOW_MIX of a ruin when the building is ruined). Upper storeys keep
open window holes (interiors ops have no floor height: a later pass). Each roll-up bay is a box that floats out of the
way while it is up (base 99: people, cars, sight and rounds pass) and drops to the floor when it is down; E rolls it,
a locked one is picked (hold E, 2.6 s, one pick). `citygen.setBay(t, bay, open, locked)` for scripts.

### 3.4 Living outside a city
Homesteads along every corridor at 1.1–2.1 km steps, a RURAL row whose biome matches, 110–220 m off the road with a
gravel drive pointing back at it. Every main building is `claimable`: `citygen action=claim` (or `CityGen.claim(R)`)
marks it the player's and emits `deedClaimed` — the base-building lane builds on that hook.

### 3.5 Military bases and their vaults
Bases stand 900 m off a real base anchor (`data/atlas.js` ATLAS_BASES / ATLAS_XZ) inside the streamed world, at most one
per 40 km. Fence + two gates + four towers, runway, three hangars (drive-in quonsets), barracks grid, family houses,
HQ (3 storeys), warehouse, motor pool, guardhouse. Under the HQ's flank: an underground site of kind `vault`
(`data/underground.js`: programme per level — 1 entry + security, 2 security/armory, 3 barracks, 4 labs, 5 storage +
power, 6 the RING PLATFORM behind a blast door, 7 deep stores, 8 a second platform) with a freight-lift entrance, made
and proved by the underground lane's generator. A SITE row of kind `military` (the Titan silo, Cape Canaveral) brings
its own vault (`underground.levels`).

### 3.5b Major cities and the law
`MAJOR_CITIES` (Los Angeles, Miami, Houston, New York, Chicago): a metro district of a major archetype (sonoran sprawl,
port wharf, rust-belt mill; `ARCHETYPES.*.major`) stands 2.5–5 km from the real usmap town when it is in the streamed
world. Every major archetype puts exactly one CLONING CENTER on its central core lot (4–6 storeys, a blast wall with one
gate at the lobby door). `citygen.cloneCenters()` → `[{ city, id, x, z, door, storeys, building, inWorld, live }]`
(computed from the plan, built or not; a city outside the streamed world is listed at its real town with door null) —
the lead's life-insurance / respawn picker reads it (systems/clone.js is not touched here). Every town of 30+ buildings
has a POLICE STATION (two roll-up patrol bays when its lot has room; three in four do): `citygen.securityStations()`.

### 3.6 Overrun (`systems/overrun.js`)
- Infestation 0..1 on every plan record, read as a LEVEL `floor(inf·5)`: 0 CLEAR, 1 STIRRING, 2 INFESTED, 3 SWARMED,
  4 OVERRUN (the fall), 5 DEAD ZONE. Quiet settlements heal (`decay`/s).
- HEAT (GENRE_DEPTH §4.2 layer A): every noise inside a settlement adds `r/6` (cap 100), ×0.97 every 2 s; a walking horde
  without an explicit target turns to the hottest settlement within 1.5 km.
- Daily (layer C; while hordes rise on their own): a settlement at level ≥ 3 gives +1 level to each neighbour within 4 km
  with probability `0.15·(level−2)` (half for a defended one, defense ≥ 0.6); a quiet one drops a level every 2 days.
- SIEGE NIGHTS every 7 ± 1 days (warned 2 days ahead: `siegeNightSoon`): `size = 20 + 6·week + 0.4·wealth/100 + 8·crew`
  × difficulty, split over 3 waves from 2–3 directions, pinned on the settlement you are in or nearest you.
- A HORDE is a record `{ x, z, strength, target, state }`. It walks at 1.4 m/s at dusk (19:00–06:00; `force` by day)
  toward its target (a noisy settlement's gunfire retargets hordes within 900 m; otherwise the nearest). Within 160 m of
  you it stands up to 40 real infected (never past the 160-character cap less the ambient reserve); the rest stays
  strength; a body killed takes 1 off.
- Siege (each s, at the edge): kills = defense × 9; infestation += max(0, strength − defense × 300) × 0.0006.
- FALL at 0.8 (level 4): gates open, 60 % of residents run, the rest turn where they stand, unsearched boxes switch to the dead's
  table, `settlementOverrun` event, HUD toast, `marks()` says overrun.
- RETAKE: infected killed inside drain 0.004 each; under 0.2 with none left inside → `retaken`, gates shut.
- Residents: a holding town has up to 6 townsfolk (wardens when walled) at its doors.

### 3.7 Lifecycle and cost
Planned once at boot from the corridors, the SITE anchors, the major cities and the bunker anchors (no bunker anchor lies inside today's streamed world: bases appear as regions stream in). Within 760 m:
built (one per 0.5 s scan, nearest first, at most 3); past 1050 m + its half-size: released. Build ≈ 5–50 ms per town.
One InstancedMesh (cap 90 000) draws every live settlement: **1 draw call** (+ its shadow pass). The chunk generator keeps
its wild scatter out of every planned footprint (`W.citygen.solid`); no planned footprint touches a pinned P1 chunk.

### 3.8 APIs for other lanes
- **Camera** (`setView` / cutaway is the camera lane's): `citygen.floorTags(x, z)` → `{ id, kind, levels: [y…], top, roof }`;
  `citygen.hideAbove(S, level)`, `citygen.showAll(S)`. `storeys.setView(S, y)` already calls these for a generated building.
- **Tactics**: `citygen.coverNear(x, z, r, y, out)` → `{ x, z, y, nx, nz, h (1 | 0.5), kind }`; kinds in `COVER_KINDS`.
  Collision boxes carry tags: `cg-wall`, `cg-half`, `cg-parapet`, `cg-flank`, `cg-rail`, `cg-wreck`, `cg-townwall`,
  `cg-fence`, `cg-tower`, `cg-post`, `cg-pump`, `crate`.
- **Map/HUD** (the lead's polish pass): `citygen.marks()` → every settlement with its state and infestation; events
  `settlementBuilt`, `settlementOverrun`, `settlementRetaken`, `hordeRisen`, `hordeAtGates`, `hordeSpent`, `deedClaimed`.
- **Base building**: `R.B.claimable`, `R.B.owner`, `deedClaimed`.

### 3.9 Commands
`citygen` (list | stamp archetype= seed= at= [biome walls size defense] | info | audit | remove | release | claim |
marks), `site` (list; id= at=), `overrun town= level=` (hordes=on|off, day=true, siege=true), `horde size= at= toward= force=` (the old
`horde` without size= is unchanged), `cover x= z= r= y=`. Scenario `overrun-test`.

## 4. Formulas

- **Storey heights**: `Y[0] = 0`, `Y[1] = h0` (kind, 2.8–7 m), `Y[k] = h0 + (k−1)·3.2`. A 6-storey hotel (h0 4.6) has its
  roof at 4.6 + 5·3.2 = **20.6 m**.
- **Flight run** `L = rise / pitch`, pitch 3.2/4.4 = 0.727 (ladder 1.73). A 6 m warehouse street flight: 8.25 m; with
  two 1.4 m landings the core needs 11.05 m of wall.
- **Lots**: a lot is filled with probability `fill = min(0.98, (density.core + (density.edge − density.core)·d)·scale)`,
  `d` = block distance from the centre / half-size (0..1). Sonoran sprawl: core 0.85, edge 0.4 → a block at d = 0.5
  fills 62.5 % of its lots.
- **Storey roll** `n = lo + ⌊t·(hi−lo+1)⌋`, `t = min(1, 0.7·u + 0.5·(1−d))`, u uniform: the core leans high.
- **Miniature** (bible §4): street spacing `·s`, building plans `·√s`, s = clamp(target / real, 0.02, 0.4); a SITE
  structure's plan is clamped to [kind min, kind max × 1.4] so it stays walkable.
- **Siege** per second: `kills = D·9`, `Δinf = max(0, S − 300·D)·0.0006`. 200 vs D 0.3 (open county seat): held 90,
  falls in ≈ 15 s (overrun-test: 82 s total with the walk). 200 vs D 1.5 (walled stronghold + containers): held 450,
  never presses, the horde is spent in ≈ 15 s.
- **Defense** `D = archetype.defense + wall bonus (berm/palisade 0.25, car husk 0.3, container 0.4, stone 0.45,
  chainlink 0.15) + bonus`, capped 1.5. Bases 0.55 + fence; homesteads 0.1; sites 0.35.
- **Draw calls**: one InstancedMesh + its shadow: +1–2 over the scene; measured < 150 standing in the densest core.

## 5. Edge Cases

- **No wall has room for a stair core**: the building loses its roof access, then storeys, until one fits (a house too
  small for two storeys stays one).
- **A bay with no room to drive up to**: walled up (`clearBays`); a building that loses every bay keeps a front door.
- **A fire escape that would stand on a street or another building**: not built.
- **A bridge whose roofs did not both get a core to the roof**: not built (its parapet gaps stay: an open roof edge).
- **A gas-station canopy that would clash with another building or the town wall**: not built (no pumps either).
- **Character budget full**: residents and horde bodies are skipped (the horde keeps its strength as a number); the
  ambient reserve is never taken.
- **You leave a settlement mid-siege**: it is released (geometry, loot, residents gone); its plan record keeps its
  infestation and state; the horde record keeps walking/sieging.
- **A stamp on top of the island or ring** (agents only): allowed; the island's own boxes still stand (testing tool).
- **Standing on a generated floor when it is released**: your `storey` is dropped and you stand on the street.
- **A shot from a window**: a round leaves a building only through a window hole or over a parapet; a round into the
  solid wall beside a window stops there; nobody on another floor of the shooter's own building is hit.
- **Real terrain on** (`terrain on=true`): settlements sit on the flat datum (an omission; see §8).

## 6. Dependencies

| Depends on | For | Back-reference added |
|---|---|---|
| `world/storeys.js` (`WEB_STOREYS.md`) | the vertical law; `addExt`/`removeExt`, `setView` hands generated buildings to `ext`, `steer` approach + on-flight rule, downtown's 6-storey tower (`RISE.ruins.tower`) | this doc |
| `engine/collision.js` | the `cg` tier (resolveCircle, raycast) | comment in file |
| `systems/underground.js`, `data/underground.js` (`WEB_UNDERGROUND.md`) | the vault: kind `vault`, room `ringroom` | rows commented |
| `world/chunkgen.js`, `world/streamer.js` (`WEB_STREAMING.md`) | `W.citygen.solid` keeps scatter out; `evict` re-lays chunks under an ad-hoc stamp | comment in file |
| `systems/combat.js` | the shot down out of a window / over a parapet | comment in file |
| `systems/vehicles.js` | `v.roadGrip` | comment in file |
| `systems/inventory.js` | per-floor loot (`registerRing`, `box.y`) | — |
| `systems/zombies.js` (`WEB_INFECTED.md`) | horde bodies (`spawn`, `AMBIENT_RESERVE`) | — |
| `data/atlas.js` | real base anchors | — |
| `WEB_LOCATION_BIBLE.md` | the SITE / ARCHETYPE schema | it names `world/citygen/` as consumer |
| `WEB_DEATHLANDS_GAP.md` G4/G7/G8 | the plan this lane answers | — |
| Camera lane (`main.js updateCamera`, `data/camera.js`) | consumes `floorTags` / `hideAbove` | listed in hand-back |
| `systems/interiors.js` | `attachRing`/`detachRing`/`setLocked` for generated openings | — |
| `systems/clone.js` (lead) | consumes `cloneCenters()` | listed in hand-back |
| Gadgets/security lane | consumes `securityStations()` | listed in hand-back |
| `data/sites/*.js`, `tools/sites-project.mjs` | SITE rows and their projected anchors | `WEB_LOCATION_BIBLE.md` §9 |
| `docs/research/GENRE_DEPTH.md` §4 | the overrun levels, heat, spread, siege nights | — |
| Tactics lane (`systems/tactics.js`) | consumes `coverNear` + box tags | listed in hand-back |

## 7. Tuning Knobs

| Knob | Where | Safe range | Affects |
|---|---|---|---|
| `PLACE.cityEvery` | data/citygen.js | 5 000–20 000 m | how often a town appears along a road |
| `PLACE.attachR` / `releaseR` | " | 500–1200 / attachR+200.. | how early towns build, build hitches |
| `PLACE.maxLive` | " | 1–4 | memory, instances (cap 90 000) |
| `ARCHETYPES.*.density` | " | core 0.5–0.95, edge 0.2–0.6 | building count, open lots |
| `ARCHETYPES.*.damage` | " | 0–0.9 | ruined share (cut-off tops, half walls) |
| `ARCHETYPES.*.storeys` | " | 1–6 per zone | skyline, roof fights |
| `KINDS.*.bays` | " | width ≥ 4 (a car), ≤ min side −1 | drive-ins |
| `VERT.bridge.maxGap`, `share` | " | 3–8 m, 0–1 | roof-to-roof routes |
| `OVERRUN.overrun` / `retake` | " | 0.6–0.9 / 0.1–0.3 | how easily towns fall / come back |
| `OVERRUN.horde.kill`, `hold`, `press` | " | 5–15, 200–400, 0.0003–0.001 | siege outcome |
| `OVERRUN.horde.bodies`, `bodyR` | " | 10–40, 100–200 m | street bodies (character budget) |
| `MILITARY.spacing` | " | 40 000–60 000 m | how far apart bases are |
| `FLOOR_LOOT.richPerFloor` | " | 0–0.3 | upstairs reward |

## 8. Acceptance Criteria (selftest checks; `node tools/dl.mjs selftest only="citygen:"`)

1. **Rows validate**: ≥ 24 archetypes covering all 19 biomes, kinds ≤ 6 storeys, roads with grip, rural rows, walls on a
   minority, no purple; SITE rows valid (real place, refs, layout, programmes).
2. **20 random archetype stamps** build headless with 0 errors and pass the walkability audit (every floor of every
   storeyed building reached on foot from its front door; every bay driven in and through by a 1.1 m car circle).
3. **Sites, homesteads, the base** stamp and pass the audit; every rural main building claimable; the vault plans 5–8
   levels, each proved, a ring-platform room on one.
4. **The plan**: towns of ≥ 3 archetypes, ≥ 10 homesteads, no overlaps, nothing on the island, bases at anchors ≥ 40 km apart.
5. **A 6-storey building stands in Phoenix downtown** (the Glass Flats tower), every flight joining consecutive floors.
6. **A stamped city stands**: walls solid, heightAt lifts you on a flight and holds you upstairs, loot per floor, cover.
7. **Draw calls < 150** standing in the densest generated core.
8. **Climb to the roof on held keys** via `storeys.steer` (as a zombie would).
9. **A window shot from floor 4 hits a staged street target**; the solid pier beside it does not let a round through;
   a shot over the roof parapet hits.
10. **A car drives into a warehouse and out the far bay**; a gravel/dirt row's grip < 1.
11. **Overrun levers**: ≥ 0.75 falls (event, mark), < 0.2 retaken; a horde record walks to a town and besieges it with no
    bodies when you are far.
12. **overrun-test resolves**: the open county seat falls to 200 at dusk, the walled stronghold holds.
13. **20 random SITE rows** of the bible stamp and pass the audit; every row validates; a `respect` row carries no loot.
14. **Police and cloning centers**: police in every town of size (3/4 with bays), one fortified cloning center per major
    archetype, `cloneCenters()` lists the five cities.
15. **Levels, spread, recovery, siege night** sized by the formula in 3 waves.
16. **Doors, windows, roll-ups**: attached from the interiors pool, some back doors locked, a bay down blocks, up passes,
    locks.
17. **Living outside a city**: a homestead builds when you come near, its home is claimable (`deedClaimed`), it is
    released when you leave.

**Omissions (the next pass):** settlements sit on the flat datum when real terrain is on; NPC pathing inside generated
towns uses steer + collision (no nav grid of their own; `moveTo` for agents works on the street); AI sight between floors
(snipers on roofs seeing the street) is the tactics/AI lane's; stilt houses are drawn on the ground (no raised deck);
parking decks are drive-in at the street level only (upper decks on foot); the HUD/map marks are data (`marks()`) for
the lead's HUD pass; real-coordinate placement of SITE rows waits for the atlas projection of the research rows (done: `data/sites/xz.js`). Nests and hives (§4.2), the car body build-up rule and the full 17-source heat table are
not built yet.
