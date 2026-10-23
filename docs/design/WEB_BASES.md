# WEB_BASES — The Fifty Bases

**Status:** built 2026-10-23 on `feat/web-bases` (DSOA web engine, `web/`).
**Rows:** `web/src/data/milbases.js` · **Ground:** `web/src/world/milbase.js` · **Life:** `web/src/systems/milbases.js` ·
**Agent:** `web/src/agent/bases-api.js` (`bases` command, the selftest's `bases:` checks) · **Atlas:** `docs/design/WEB_ATLAS.md` §3.5 ·
**The island's own base:** OUTPOST NINE, `docs/design/WEB_MILITARY.md` (unchanged; this system reuses its trespass rule).

## 1. Overview

Robert: *"military bases, one in every state"*, *"you scale it"*, *"military rail, secret facilities with secret projects,
military holdouts with real guns and drones"*, *"START IN FLORIDA"*.

Every one of the atlas's fifty installations (one real base per state, `ATLAS_BASES`) is a **base row**: a site template
(airfield, army post, naval station, missile field, depot, training range, research lab), a holder (a Federal Remnant
garrison, a ruler's troops, raiders, the infected inside, nobody: abandoned and looted, the continuity network), a fence
at the footprint rule, and — for the playable ones — a secret project and a way down. Five more rows cover what a playable
region needs that its state's atlas row is not (Florida's atlas base, Eglin, stands in the panhandle outside the region box).

A row is **built** when it stands inside a playable region and has a build block. Eight are built today:

| Base | Region | Template | Holder | Side | What you find |
|---|---|---|---|---|---|
| PATRICK SPACE FORCE BASE | Florida, I-95 mile 16 east | airfield | Federal Remnant | 560 m (runway law) | a swept runway, hangars, a drone up every night |
| CAPE CANAVERAL SPACE FORCE STATION | Florida, I-95 mile 21 east | research lab | the infected inside | 571 m | a launch pad with a rocket under tarps, domes, the lift down |
| HOMESTEAD AIR RESERVE BASE | Florida, south of Miami | airfield | abandoned, looted | 560 m | storm-wrecked roofless shells, picked-over boxes |
| DAVIS-MONTHAN AIR FORCE BASE | Arizona (Tucson) | airfield | the Sun Court | 560 m | the boneyard: sixteen dead aircraft in rows |
| FORT IRWIN | California (Mojave) | training range | the Crimson Road | 3,000 m | the mock town, hulks, trenches, targets |
| WHITE SANDS MISSILE RANGE | New Mexico | missile field | the Atomic Priesthood | 3,000 m | silo pads, a gantry, the blockhouse, the lift |
| FORT BLISS | Texas (El Paso) | army post | the Republic | 3,000 m | barracks rows, the parade ground, the firing range |
| THE IRON LINE RAILHEAD | Arizona, north of Phoenix | army post + rail | Federal Remnant | 380 m | the Iron Line's spur, a locked yard, a cargo train |

The other 47 are rows on the map (the World Forge MAP draws the atlas's fifty), laid out by the same templates the day
their region streams.

## 2. Player Fantasy

You see the wire from the interstate: a fence line running off into the scrub, a watchtower every few hundred metres, a
gravel road turning off toward a gate. Who holds it decides everything. The Remnant warn you once and then open fire; the
Sun Court's men stand behind a wall of dead cars; the Crimson Road shoot on sight; at Canaveral nobody challenges you, and
that is worse. At night the searchlights sweep the yard and a drone hums over the core with its lamp: keep your
flashlight off and you might get to the armory door, which is locked steel and loud to kick in. In the records you find a
log that does not make sense yet. Under the lab there is a lift that goes down further than it should.

## 3. Detailed Rules

**3.1 Rows.** `MIL_SITES` = `ATLAS_BASES` (50) + `MIL_EXTRAS` (5), each run through `rowOf()`: template from the atlas
kind (`KIND_TEMPLATE`, a build block may name another), hold from the atlas's `dsoa` status, side by the footprint rule,
the build block (`MIL_BUILT`) for the playable ones. `validateBaseRow(row)` is the World Forge SITE tab's validator.

**3.2 Placement** (`placeMilBases`, at boot). The world point is the atlas's (`ATLAS_XZ`), a build block's `at` (world
metres) or `anchor` (an interstate, a mile, a side, an offset: the exit-community rule). `extend` hangs the square off its
anchor (White Sands: the main post near its east edge). A built base then obeys the **scale law** (F4) and never overlaps
another built base. Built bases are laid out at boot (a few ms each) so no layout ever lands mid-drive.

**3.3 The ground** (`MilBase.layout`, a pure function of the row, `W.seed` and the placement; its own rng streams per part):
- **The wire**: chain-link round the whole square, a post every 8 m, razor wire on top, a bare strip along it. Collision is
  a see-through `wire` box (its whole length a hole): it stops walkers and cars, not sight or rounds (material `chainlink`).
- **Towers**: four corners, both sides of the gate, one every `towerEvery` along each run; an open deck at 4.6 m with a
  searchlight (OUTPOST NINE's tower, data `MIL_RULES.tower`).
- **The gate**: a 10 m gap on the side facing the base's road. Dressed by holder: a booth, a raised boom, a jersey-barrier
  chicane and sandbags (Remnant); a wall of dead cars and banners (rulers, raiders); torn-off leaves in the road (abandoned).
- **The road**: from the gate straight out until it is beside the interstate's outer edge (`roadStop`), or an L to a named
  point (`road.to`). A street rect: the chunks draw it, the HUD names it.
- **The core** (cantonment): the template's programmes as walk-in buildings along the main street, fronts to the street,
  alternating sides (data/ring.js military `KINDS`: barracks with cots and footlockers, HQ with desks and RECORDS, the
  armory with rifle racks and ammo crates behind a **locked steel door**, mess, stores, motor pool, hangar, control tower,
  lab, the mock town's shells). Then floodlight masts down the street, sandbag nests, a checkpoint lane of barriers, the
  water tower and radio mast by the HQ, tents, dead trucks.
- **Features** by template, each on the nearest free ground (`spot`): runway (the runway law), apron, hangars, parked and
  wrecked aircraft (the boneyard), helipad and a downed helicopter, fuel farm, parade ground and flag, motor yard, firing
  range, silo pads, gantry and blockhouse, igloo rows, mock town, domes, antennas, piers and cranes. Gravel tracks join them
  to the main street.
- **The rail** (the railhead): the Iron Line run on from where the Phoenix ring's dead track fades out, under a closed rail
  gate, into a **yard** fenced off inside the base. The yard's gate is a double steel door row (locked); the cargo train
  (locomotive, three boxcars, a flatcar) waits on the spur, each car a container.
- **The way down**: a lift (lab, missile field) or a hatch on a pad beside the HQ/lab/armory: `hook = {id, kind, x, z,
  levels, building, project}`. The underground system attaches its levels there (`bases hooks=true`).
- **Wreckage**: one 64 m cell at a time on open ground: craters, tank hulks, burned trucks, wrecked planes, bunkers,
  trenches, targets, silos, igloos, by the template's `scatter` chances.

**3.4 People** (`systems/milbases.js`). Records: gate (2), armory and HQ doors, towers nearest the core first, two core
patrols, a yard patrol; the infected for an overrun base. A record becomes a character within `promoteR` of you once its
chunk is laid out (tower sentries perched on the deck), and goes back onto its record past `demoteR` (alive or dead, hp
kept; the dead stay dead; saved). At most `maxLive` alive per base. The soldiers are OUTPOST NINE's soldiers: each base is
a site in `systems/bases.js` (`byId`), so its garrison keeps posts, walks patrols and closes on you by the same `think`,
and **the trespass rule** is the same `watch`: a sentry who sees you inside the wire warns you once; stay `grace` (6) s,
fire a shot, hurt one of them and the post opens fire; a friendly standing is waved through; a hostile one is shot on
sight. The holder's own lines (`MIL_LINES`). The motor pool's vehicles spawn once when you first come near.

**3.5 Drones.** A loop over the core (and the yard). By day a drone sees you as far as a sentry; at night only `spotNight`
(9 m) — or `spotLight` (52 m) when your flashlight is on. Held in sight for `call` (1.2) s inside the fence (+50 m), it
**calls it in**: a garrison goes to the alarm (`why: 'drone'`); a base with nobody home sounds a siren the infected come to.
Its lamp is a lit pool the sentries see you in. Event `droneSpotted {base, drone, by: flashlight|sight}`.

**3.6 Lights.** One additive pool batch and one beam batch for the base you are at (nearest within 500 m), night only:
floodlights, the searchlights on the towers within `lightsR` (a slow sweep across their arc; on the alarm the beam finds
you), the drones' lamps. No light objects: the fixed light count holds.

**3.7 The secret project.** One line of our own invention per built base and its logs, in the base's RECORDS containers:
each time you open one, the next log (HUD subtitle, a toast, event `baseLog`). Saved.

## 4. Formulas

**F1 — Where.** `world = ATLAS_XZ[id]` (the atlas's F1 projection) · or `build.at` · or
`corridor.at(mile · 1609.344) + normal · side · off`; `extend`: `+ dir · (side/2 − 120)`.

**F2 — The footprint rule (the scale rule).**
```
side_fp = clamp(sqrt(area_km2 · 10^6 / 14²), 64, 3000)        side = max(side_fp, template.min)   (or build.side)
```
`template.min`: airfield 560 (the runway law), range 600, missile 400, lab 400, army 300, depot 300, naval 240.
*Example:* Davis-Monthan, 43.56 km²: `43,560,000 / 196 = 222,245 m²`, `sqrt = 471 m`; an airfield's minimum is 560, so
**side = 560** (`grown 89`). Fort Bliss, 4,550 km²: 4,818 m, **3,000** (clamped). Patrick, 9.47 km²: 220 m, grown to 560.

**F3 — The runway law.** `runway = clamp(0.82 · side, 400, 1800)` m long, 46 m wide, along the gate side past the core,
the hangars and a 60 m apron. Patrick (560): 459 m.

**F4 — The scale law.** With `d` the least distance from the square's edge (40 samples) to the nearest interstate's
centreline: while `d < clear` (170) slide away along the line from that point; while `d > approachMax` slide toward it;
then step `slideStep` (40) away from any town within `side/2 + clearTown` (650) and from the Phoenix ring.
*Example:* Davis-Monthan's atlas point is 7.6 km from I-10; with `approachMax` 1500 it slides 5.75 km north to
(10008, 5814), gate on its north side, a 1.5 km road to I-10.

**F5 — A drone's reach.** `range = lerp(spotDay 34, spotNight 9, night)`; flashlight on and night > 0.3:
`max(range, spotLight 52)`; ×1.4 in a car, ×0.7 crouched; seen when inside `range` of its ground point, not indoors, the
fence +50 m. Calls after `call` (1.2) s of sight.

## 5. Edge Cases

- **A row off the mainland grid** (Alaska, Hawaii): a row with no place; `bases` lists it `centre: null`; never built.
- **A row in a region with no build block** (the 42 others): placed, unbuilt; nothing streams.
- **A built base on water** (Florida's lagoon, sloughs): sloughs keep out of a built base (`regionWater` shallows them
  toward it like a holdout); wreckage never lands on water; the anchors keep the squares between I-95 and the lagoon.
- **A mesa where a base stands:** the land was graded: no mesa inside a built base or on its road (`mesasOf`).
- **Two built bases too close** (White Sands and Fort Bliss): the later slides away until 120 m apart.
- **A pinned P1 chunk:** a base never covers one (placement keeps clear of I-10; the selftest reruns the twelve pins).
- **A template's programme that does not fit** the core: dropped, listed in `bases id=` `dropped`.
- **A base out of character slots:** a record that cannot become a character waits; the infected and soldiers never push
  the ring's residents (they yield first by the engine's rule).
- **You die / leave:** the post stands down after `calmAfter` out of sight; records go back past `demoteR`, alive or dead.
- **The yard gate kicked in, the armory pried:** stays open while away and across a save (interiors `ringState` `u`).
- **A save mid-alarm:** the soldiers come back with the save's characters (by id) and the alarm resumes, quietly.
- **Nobody home and a drone sees you** (Canaveral): no alarm; a siren at your position the infected hear.
- **Abandoned and looted:** no garrison, half the roofs gone, every container rolls `wreck` (picked over).

## 6. Dependencies

**Uses:** `data/atlas.js` (ATLAS_BASES, ATLAS_XZ, RULERS, footprint) · `world/worldindex.js` (corridors, towns, regions,
the ring) · `world/ring.js geo()` (walk-in shells; `data/ring.js` military KINDS/ZONES/FURNITURE) · `world/chunkgen.js` (the
towner stage, the extras' see-through boxes, `blocked`, `mesasOf`) · `world/regions.js` (water) · `systems/bases.js`
(watch, warn, alarm, calm, think, lit, spotRange; `ext` hook; per-site lines) · `systems/interiors.js` (doors of opted-in
towners, geo locks and materials) · `systems/zombies.js`, `systems/vehicles.js`, `data/materials.js` (tags).
**Used by:** the underground system (`bases hooks=true` / `g.milbases.hooks()`), the World Forge SITE tab
(`validateBaseRow`), the observer (soldiers are ordinary characters), save/load (`bases._streamed`).

## 7. Tuning Knobs (`MIL_RULES`, `MIL_TEMPLATES`, `MIL_BUILT`)

| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `clear` | 170 m | 120-400 | fence keep-off from an interstate |
| `approachMax` (row) | 1300-1500 | 900-4000 | how far a base may sit from its road |
| `clearTown` | 650 | 400-1200 | keep-off from towns |
| `template.min` | see F2 | 64-1000 | smallest fence for a template |
| `towerEvery` | 240-320 | 150-600 | towers along the wire (cost: items) |
| `runway.share/min/max` | 0.82/400/1800 | | the runway law |
| `promoteR / demoteR` | 230 / 300 | 180-300 / +60 | records near you |
| `maxLive` | 22 | 10-30 | characters per base (budget 160 total) |
| `drone.spotLight / spotNight / call` | 52 / 9 / 1.2 | 30-80 / 5-15 / 0.5-3 | how a flashlight gives you away |
| `lightsR / beams / pools` | 260 / 16 / 48 | | searchlights near you (draw cost fixed: 2 batches) |
| `holds.*.garrison / ruin / loot` | | | who is home, how wrecked, how picked over |

## 8. Acceptance Criteria (the selftest's `bases:` checks)

1. All 50 atlas rows (50 states) have a row; every row's side equals F2; every row validates; ≥ 6 bases built, each inside
   its region and ≥ `clear` from an interstate.
2. A built base's chunk is a pure function (sync = sliced hash); the island golden holds (the Florida check reruns the
   twelve P1 pins).
3. Every built base's gate is reachable from its access road on foot (through the gap) and by car (nav grids); the wire
   beside the gate is blocked.
4. The railhead: the wire holds you on your own keys while sight and a round pass it; walk in through the gate and a
   sentry warns you once; stay and the post opens fire (`stayed`); a shot inside brings it down (`shots`).
5. At night a drone does not see you in the dark at 30 m, and with your flashlight on it spots you (`by: flashlight`) and
   calls it in.
6. The armory's front door is locked steel and holds you; its containers roll `military` loot only.
7. The yard gate holds you until kicked in; then you walk into the yard; the cargo train has ≥ 3 searchable cars.
8. At night the searchlights near you sweep; a sentry's reach in a beam is > 1.5× the dark's; the lights are off by day.
9. Opening the records turns up the next log (`baseLog`); every built base has an underground hook inside its fence.
10. Under 150 draw calls at the widest zoom over Patrick's airfield by day and at night.
Also: `node tools/ip-lint.mjs` 0 deny; the materials census green; `scenario name=stress` not regressed.
