# WEB_MILITARY_BASES — a large base in every state, and the big ones you can drive to today

**Status:** BUILT 2026-10-28 on `feat/web-milbases` (Wave 2, `WEB_DEPTH_PLAN.md` §2 MILITARY BASES).
**Code:** rows in `web/src/data/milbases.js` (`MILBASES`, `MB_CLASSES`, `MB_SHAPES`, `MB_MOTOR`, `MB_RULES`, `MB_LOOT`,
`MB_TRADER`, `MB_LINES`, `projectLL`, `builtSide`, `validateMilbases`). The plan is `web/src/world/citygen/milbase.js`
(`layoutMilbase`, `buildMilbase`), stamped through citygen's own path (`systems/citygen.js`). The run is
`web/src/systems/milbases.js`. The agent surface is `web/src/agent/milbases-api.js` (the `milbase` command and 7 named
checks). Renders are in `docs/renders/web/milbases/`.
**Builds on:** `WEB_MILITARY.md` (Outpost Nine: the gate rule and `BASE_RULES`, which this reuses), `WEB_CITYGEN.md` (the
stamp path, KINDS buildings, the overrun), `WEB_SITES_TERRAIN.md` (the real-terrain pad every planned record stands on),
`WEB_UNDERGROUND.md` (the bunker level under the command post), `WEB_ZOMBIES.md` (the infected's senses), the wrecks system
(`data/wrecks.js`: every dead vehicle is one of our bodies) and the atlas (`data/atlas.js` `ATLAS_BASES`: the fifty state
bases with real lat/lon and area).

## 1. Overview
Robert: "We also need the large military bases in each state, plan for that also."
- **56 rows.** There are 50 state rows, one per state. Each is the atlas's own base at its real point and real area. There
  are also 6 large real installations that the drivable world reaches today: Yuma Proving Ground, Fort Huachuca and the
  Navajo Army Depot in Arizona, and NAS Jacksonville, Camp Blanding and Avon Park Air Force Range in Florida. Arizona's
  state row, Davis-Monthan, is drivable too. That makes **7 bases you can drive to now**.
- **Every row is planned.** Citygen's plan gives every row a record:
  - the drivable ones on free ground near their real point;
  - the rest "beyond" at their anchor, stamped when the streamed world reaches them;
  - Alaska and Hawaii off the grid. (Their rows exist. The mainland projection has no point for them.)
- **A base is a citygen settlement.** It is a town plan of KINDS buildings plus the pieces only a base has. It is built
  when you come near and released when you leave. It stands on its real-terrain pad, draws in citygen's one instanced
  mesh, its dead vehicles draw in the wrecks batch, and its crates are inventory containers.
- **Its state of being runs it.**
  - **Held:** a garrison, a patrol, a quartermaster and the gate rule.
  - **Overrun:** a horde that pours out at a noise.
  - **Sealed:** nobody home. To get in you need the generator, the code and the blast door.

## 2. Player fantasy
- You see the wire from the interstate: two fences, towers at the corners and a chicane of concrete on the approach.
  You decide whether to go in.
- At a held base a sentry calls out once from the gate. You turn round, or you don't, and the towers open up.
- At an overrun base you fire one shot from the road and watch the yard empty out through the gate toward you.
- At a sealed base the gate is chained. You find the cut in the wire, fill the dead generator from your own fuel can,
  read the code off a duty log in the command post, and the blast door grinds open over the dark below.
- The armory is the best loot in the country, and it is there exactly once.

## 3. Detailed rules
**The row.**
- Fields: `state, id, name, lat, lon, area_km2, cls, shape, status, holder` plus `atlas` (a state row) or `big` (a large
  one), and `drive` (built today).
- Classes: fort, airbase, naval, depot, proving.
- Shapes: army, air, naval, depot. A proving ground is an army post with more ranges and a test stand.
- **Status mapping from the atlas.** ruler, remnant, raider and contested become held. overrun stays overrun. automated
  and abandoned become sealed.
- Holders are `remnant` or `dustwolves` (the factions that walk the world). A planned row may also say `ruler` or
  `contested`; those wait for those factions.
- Davis-Monthan is the Remnant's in the drivable world, because the state's ruler does not walk it yet.

**The plan (world/citygen/milbase.js).**
- The base is a rectangle `size` = `builtSide(area, class)`, centred on its record.
- **The wire:**
  - The outer chain-link runs on the edge and the inner one 10 m inside it.
  - Both are see-through boxes: the whole run is a collision `hole`, so sight and rounds pass, and walkers and cars do not.
  - There is a 14 m gap at each gate, west and east, on the main road.
  - The outer gate has a rolling leaf: open when held or overrun, shut when sealed.
  - A sealed base has a 3 m cut in both fences on the south run.
- **Watchtowers** stand at the corners, every 170 m along the runs, and in a pair at each gate.
- **The approach.** The main road runs 150 m out past each gate, with two checkpoints at 55 m and 115 m. Each checkpoint
  has a jersey-barrier chicane (a barrier on one half of the road, then one on the other half 9 m on), sandbags, a booth
  and a burned-out carrier.
- **The yard.** A ring road runs inside the inner fence and a cross road runs north–south.
  - South-west: the command post (3 storeys) and beside it the bunker portal: three poured walls, a roof, the blast door
    and its keypad, and the generator on the apron. Then the armory (locked steel) and the hospital (2 storeys).
  - The quartermaster's store.
  - South-east: barracks quads round parade squares, and family housing.
  - The north half is the branch's own:
    - **air:** a runway at 86% of the yard's width, threshold stripes, a taxiway, hangars, a control tower, a motor
      pool and a fuel farm;
    - **naval:** a harbour band with a quay wall, 4 railed piers, a dry dock with a dead hull on its blocks, naval
      stores, a motor pool and a fuel farm;
    - **depot:** igloo rows (earth over a concrete headwall, a steel door, a magazine crate at every fourth one),
      depot stores, a motor pool and a fuel farm;
    - **army:** a motor pool, a fuel farm, ranges (a berm, target frames and a firing line) and supply warehouses.
- **The motor pool** is auto-shop bays plus an apron of `rows x cols` dead vehicles. Each is a patrol truck, an armored
  carrier, a pickup or a van: OUR bodies, dead (rusted, stripped or burned), in a collider at its real size.
- **The fuel farm** is tanks inside earth berms that are open to the south, plus a pump house with a fuel crate.

**The run (systems/milbases.js).** Citygen calls `onBuilt` and `onReleased`. What persists is kept per base:
power, the code, whether you read it, the blast door, the last warning, the garrison's dead and the horde's fallen.
- **Held.** Soldiers stand at:
  - every gate post,
  - the foot of every corner tower and every other tower,
  - the HQ and the armory doors.
  Three more walk the ring road, and two stand in the yard.
  - Remnant soldiers are faction `soldier`; Dustwolves are `raider`.
  - The quartermaster (Remnant only) has a counter of `mb_qm` crates. His dialogue opens it (`trade.openCounter`).
  - **The gate rule** is Outpost Nine's, with its `BASE_RULES`:
    - A sentry who SEES you inside the wire (LOS within the spot range, shorter at night and crouched) warns you once.
    - The post opens fire if you stay `grace` s, come back within `warnMemory` s, fire within `shotMargin` of the wire,
      or hurt one of them.
    - Friendly or allied: waved through. Hostile or hunted: shot on sight. Fired upon: the trespass is a deed.
- **Overrun.**
  - The base starts fallen (citygen infestation 0.9).
  - `MB_RULES.horde.bodies` infected stand in the gate yards and the yard's clusters. They are fewer by those that
    already fell.
  - Room is made through `population.make`: far ambient people fold first.
  - **The moan relay.** A noise is heard by the infected in reach (`zombies.onNoise`, r x 2 x hear). Each one that
    heard it moans. Those within `relay` m of the moaner hear the moan after 0.5–1.4 s and turn the way it is going:
    toward the noise it answered, with more scatter every hop. Then they moan on, for up to `hops` hops. Nobody learns
    where YOU are; they follow the moaning.
- **Sealed.**
  - E at the generator with a fuel can in your pack starts it. The keypad lights and the bunker level below gets power.
  - E at the duty board just inside the command post's door reads the log, and the log has the code.
  - E at the blast door with power and the code opens it.
  - The agent verbs `milbase action=power|read|keypad` call the same functions from where you stand.
- **The armory and every crate roll ONCE.** `inventory.registerRing` keeps their slots across stamps, and nothing ever
  restocks them (law 2). The armory's doors are locked steel as soon as they hang.
- **Underground.** The atlas's own `base_<id>` site (or a new `mb_<id>` site) moves to the hatch inside the portal with
  `place: false`. Its power follows the base, and a Remnant base's level is a holdout.

## 4. Formulas (with an example)
- **Where.**
  - `xz` = the atlas's own projected point, `ATLAS_XZ.bases[id]`, when the row is a state row.
  - Otherwise `projectLL(lat, lon)`: a weighted least-squares affine fit through the 8 nearest projected atlas points,
    weighted by `1/(d² + 0.05)` in degrees. Its leave-one-out error against the atlas's own fit is 126 m on average.
  - The plan puts the record on free ground within 6 km of `xz` (citygen's `free`: off the interstate, out of towns and
    exits, dry).
  - Example: Camp Blanding (29.9516, -81.9784) projects to (202111, 31445), inside Florida's box.
- **How big.**
  - `side = clamp(sqrt(area_km² · 1e6 / S²), class.side)`, with S = 14 (the road law, `FOOTPRINT.S`), rounded to 10 m.
  - `depth = side · class.aspect`.
  - Example: Davis-Monthan is 43.56 km², so √(43.56e6 / 196) = 471 m. That is below the airbase floor of 560, so the base
    is 560 m. Depth is 560 · 0.72 = 403, rounded to **560 x 400 m**.
  - The record's `half = max(side/2 + approach.len + 10, depth/2 + 20)`, so the checkpoints are inside its footprint.
- **The gate rule.**
  - Spot range = `lerp(spotDay 48, spotNight 15, night)`. Crouched it is x0.6; in a car x1.6.
  - Warn, then `grace` 6 s, then the alarm. Everyone in `engage` 75 m with sight of you takes you on.
  - The post stands down after `calmAfter` 45 s out of sight and out of the wire.
- **The horde.**
  - Bodies = `max(0, bodies − fell)`.
  - A shot (r = 45) is heard to 90 m by a shambler (r x 2 x hear 1).
  - The relay reaches 38 m per hop, up to 6 hops (about 230 m of yard), with 0.5–1.4 s per hop.
  - Scatter on the target is `±3 · hop` m.
  - Example: a shot 30 m outside the west gate is heard by the gate yard's cluster (34 m inside, 64 m off). Their moans
    turn the HQ and barracks clusters behind them, and a shambler at 2.0–2.7 m/s is out of the gate within about a minute.
- **The puzzle.** `code = 1000 + fnv("<id>:code") % 9000`: four digits, fixed per base and in the save. The generator
  takes `sealed.fuel` (1) fuel can.

## 5. Edge cases
- **No free ground near a drivable row.** Its report status is `unplaced`. The rows check fails, so it can't ship silently.
- **The character budget is full.** The horde asks the far fold for room. It never takes the last `AMBIENT_RESERVE`
  slots; the rest of the horde stays unspawned until you come back.
- **Released and built again.**
  - The garrison's dead are not hired again, and the horde's fallen do not come back.
  - Crates keep their rolled slots, so emptied stays empty.
  - The blast door stays as you left it.
  - The warning memory is per base, so walking back in within 120 s is "you were told once": no second warning.
- **You fire at a held base from outside.** The rule is the same as Outpost Nine's (`shotMargin` 18 m): a friend gets
  "cease fire" once; anyone else gets the alarm.
- **Dustwolf bases start hostile.** Raiders shoot on sight, and there is no quartermaster.
- **A sealed base's gate is chained**, so a car can't get in. The cut in the wire is on foot only.
- **The armory's doors** are locked only once they hang (citygen's openings scan near you). Before that nobody is
  near enough to try them.
- **Harbours are painted.** The naval basin is a water-coloured slab behind a quay wall and pier rails, not real water:
  nobody walks into it, and nobody swims in it either.
- **Stamping a base anywhere** (`milbase action=stamp`, the checks) is an ad-hoc record with its own pad. Removing it puts
  the ground back.

## 6. Dependencies (both ways)
- **Uses:**
  - `data/atlas.js` (ATLAS_BASES, ATLAS_XZ, FOOTPRINT)
  - `world/citygen/layout.js` makeBuilding, `world/citygen/build.js` buildTown
  - `systems/citygen.js` (plan, stamp, release, openings, place)
  - `data/bases.js` BASE_RULES (the gate rule's numbers)
  - `systems/zombies.js` (spawn, remember, onNoise, AMBIENT_RESERVE)
  - `systems/population.js` make
  - `systems/underground.js` (sites, recs, power)
  - `systems/trade.js` openCounter, inventory (registerRing, place, spend)
  - `data/items.js` LOOT
  - `data/trade.js` TRADERS
  - `systems/wrecks.js` via built.wrecks
  - `engine/collision.js` holes
  - society factions and deeds
- **Used by / hooks into (shared files, minimal):**
  - `systems/citygen.js`:
    - imports;
    - the plan block after the bunker bases (every row gets a record, plus `plan.milbaseReport`);
    - an overrun base starts fallen;
    - `layoutOf` and `stamp` branch to the milbase plan and build;
    - `stampAt` takes `milbase`;
    - `g.milbases.onBuilt` / `onReleased`.
  - `main.js`: construct the system before citygen, `update`, `noise`, and the E chain (`interact` after the roll-up bays).
  - `systems/ai.js`: a garrison soldier's `think`.
  - `agent/api.js`: import, commands, checks after citygen's, save/load.
  - `data/materials.js`: `mb-fence` is chainlink and `mb-blast` is steel.

## 7. Tuning knobs (safe ranges)
| Knob | Default | Safe range | What it does |
|---|---|---|---|
| `MB_CLASSES.*.side` | 420–760 | 360–800 | Built size per class; above 800 m the item budget of three live settlements gets tight |
| `MB_RULES.fence.inset` | 10 | 6–16 | Gap between the two fences (the kill zone) |
| `MB_RULES.fence.towerEvery` | 170 | 100–260 | Tower spacing; lower means more sentries on a held base |
| `MB_RULES.approach.checks` | [55, 115] | each 30–140 | Checkpoint distances out from the gate |
| `MB_RULES.garrison.patrol / yard / tower` | 3 / 2 / 1 | 0–6 / 0–6 / 0–2 | Garrison size (the 160 people budget: keep under ~30) |
| `MB_RULES.horde.bodies` | 34 | 12–60 | Infected in an overrun base (the budget again) |
| `MB_RULES.horde.relay` | 38 | 20–60 | Moan carry per hop; higher empties the whole yard at one shot |
| `MB_RULES.horde.hops` | 6 | 2–10 | How far the moaning travels |
| `MB_RULES.sealed.fuel` | 1 | 1–3 | Fuel cans the generator wants |
| `MB_MOTOR.types / states` | weights | any ≥ 0 | What stands dead in the motor pool |
| `MB_LOOT.mb_armory` | 3–5 rolls | — | The best loot in the world; it rolls once |

## 8. Acceptance criteria (the named selftest checks, `only=milbases`)
1. **The rows validate.** There are 56 rows. 50 are state rows, one per state, agreeing with the atlas on state, lat/lon
   and area. The 6 large ones and Davis-Monthan give 7 drivable bases covering every shape and every state of being. The
   plan has a record for every drivable row on free ground, and every row is accounted for. The motor pool's collider
   sizes match the `VEHICLES` rows.
   *Proves:* "one per state" is data that cannot drift, and the drivable world really has them.
2. **A stamped base has a closed perimeter with gates.** Sampling every 0.5 m along all eight fence runs finds no gap but
   the four gate gaps. Someone walking into the south wire on held keys stays outside. The foot planner's path in goes
   through the west gate. Sight and a bullet ray pass through the wire.
   *Proves:* the wire is real collision, see-through by rule, and the gates are the only way in.
3. **The armory's loot rolls once and never refills.** The armory's doors are locked. A crate rolls from `mb_armory`.
   After it is emptied and the base is released and stamped again, the crate is still empty.
   *Proves:* law 2 (no loot regeneration) for the best loot in the world.
4. **A held base challenges, then fires.** You walk in through the west gate on your own keys (Remnant at their start
   standing): exactly one warning, and nobody hostile while it stands. After the grace the post is hostile (at least 2
   guards hostile, targeting you) and the alarm's reason is `stayed`. At standing 40 the same walk is waved through.
   *Proves:* senses, not cheats: a sentry who saw you, one challenge, then fire.
5. **Draw calls stay under 150 in the motor pool**, standing at its apron with at least 8 dead military bodies there.
   *Proves:* the budget holds with a whole base live, since everything is batched.
6. **A sealed base's blast door opens only with power and the code.**
   - The right code with no power: the keypad is dead.
   - Reading the log and trying again without power: dead.
   - The generator with no can: dry. With a can: it runs.
   - A wrong code: it buzzes.
   - The log's code with power: open. You then walk through it on your keys.
   *Proves:* the puzzle can't be skipped, and both halves are needed.
7. **An overrun base's horde comes out at a gunshot.** At least 20 infected stand inside and fewer than 3 are outside
   while it is quiet. One shot 30 m outside the west gate, with you hidden, and at least 8 come out through the gate,
   with relays counted.
   *Proves:* the horde acts only on what it heard (the shot, then each other).

## 9. Not done (follow-ups)
- **Real water at naval stations.** The harbour is painted. A real basin needs the water lane's carve.
- **The base's own vehicles that run.** The motor pool is all dead. A held base could keep one patrol truck that runs
  (Outpost Nine's `vehicles`).
- **Searchlights and night lights.** Outpost Nine's are fixed lights per base. The light-count law needs a pooled lamp
  first.
- **Rulers and contested holders.** The 22 planned rows held by a state ruler or contested wait for those factions to
  walk the world.
- **Garrison off-screen.** Raids on and from a base belong to the faction sim. No base gets a strength record yet.
- **Base shapes from real outlines.** The base is a rectangle sized from the real area. Real perimeter polygons are a
  data job (public outlines → rows).

## 10. The 56 rows
| # | State | Base (real installation) | Class | Shape | State of being | Holder | Real area km² | Built m | World x, z | Today |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AL | REDSTONE ARSENAL | fort | army | held | ruler | 147.6 | 620 x 480 | 171600, -7800 | planned |
| 2 | AK | JOINT BASE ELMENDORF-RICHARDSON | airbase | air | sealed | - | 259 | 720 x 520 | off the grid | planned |
| 3 | AZ | DAVIS-MONTHAN AIR FORCE BASE | airbase | air | held | remnant | 43.56 | 560 x 400 | 8070, 11230 | **drivable (arizona)** |
| 4 | AR | PINE BLUFF ARSENAL | depot | depot | overrun | infected | 54.6 | 530 x 410 | 134330, -8700 | planned |
| 5 | CA | FORT IRWIN NATIONAL TRAINING CENTER | proving | army | held | dustwolves | 2579.77 | 720 x 540 | -31740, -17370 | planned |
| 6 | CO | CHEYENNE MOUNTAIN COMPLEX | depot | depot | sealed | - | 0.0206 | 420 x 330 | 48780, -49400 | planned |
| 7 | CT | NAVAL SUBMARINE BASE NEW LONDON | naval | naval | held | ruler | 2.78 | 420 x 340 | 267800, -72800 | planned |
| 8 | DE | DOVER AIR FORCE BASE | airbase | air | held | remnant | 15.78 | 560 x 400 | 245770, -52540 | planned |
| 9 | FL | EGLIN AIR FORCE BASE | airbase | air | held | contested | 1874.2 | 720 x 520 | 179400, 33800 | planned |
| 10 | GA | FORT BENNING | fort | army | overrun | infected | 736.5 | 620 x 480 | 182050, 8980 | planned |
| 11 | HI | JOINT BASE PEARL HARBOR-HICKAM | naval | naval | held | contested | 113.3 | 540 x 430 | off the grid | planned |
| 12 | ID | MOUNTAIN HOME AIR FORCE BASE | airbase | air | held | ruler | 25.6 | 560 x 400 | -25820, -89310 | planned |
| 13 | IL | ROCK ISLAND ARSENAL | depot | depot | held | dustwolves | 3.83 | 420 x 330 | 144970, -75460 | planned |
| 14 | IN | NAVAL SUPPORT ACTIVITY CRANE | depot | depot | held | ruler | 250.9 | 580 x 450 | 169570, -50920 | planned |
| 15 | IA | IOWA ARMY AMMUNITION PLANT | depot | depot | sealed | - | 76.9 | 580 x 450 | 137800, -67600 | planned |
| 16 | KS | FORT LEAVENWORTH | fort | army | sealed | - | 22.7 | 480 x 370 | 111800, -54600 | planned |
| 17 | KY | FORT KNOX | fort | army | held | ruler | 440 | 620 x 480 | 175480, -41990 | planned |
| 18 | LA | FORT POLK | fort | army | overrun | infected | 801.3 | 620 x 480 | 127520, 20820 | planned |
| 19 | ME | PORTSMOUTH NAVAL SHIPYARD | naval | naval | held | ruler | 1.125 | 420 x 340 | 286000, -98800 | planned |
| 20 | MD | FORT GEORGE G. MEADE | fort | army | held | contested | 20.5 | 480 x 370 | 238480, -52560 | planned |
| 21 | MA | JOINT BASE CAPE COD | fort | army | held | remnant | 89 | 620 x 480 | 278200, -83200 | planned |
| 22 | MI | CAMP GRAYLING | fort | army | held | ruler | 594.9 | 620 x 480 | 184170, -104400 | planned |
| 23 | MN | CAMP RIPLEY | fort | army | held | ruler | 214.5 | 620 x 480 | 119120, -117950 | planned |
| 24 | MS | CAMP SHELBY | fort | army | sealed | - | 525 | 620 x 480 | 153880, 19890 | planned |
| 25 | MO | FORT LEONARD WOOD | fort | army | held | remnant | 252.8 | 620 x 480 | 134190, -40540 | planned |
| 26 | MT | MALMSTROM AIR FORCE BASE | airbase | air | held | ruler | 13.5 | 560 x 400 | 5850, -130720 | planned |
| 27 | NE | OFFUTT AIR FORCE BASE | airbase | air | held | remnant | 11.3 | 560 x 400 | 104000, -70200 | planned |
| 28 | NV | NELLIS AIR FORCE BASE | airbase | air | held | dustwolves | 45.7 | 560 x 400 | -21390, -26610 | planned |
| 29 | NH | PEASE AIR NATIONAL GUARD BASE | airbase | air | sealed | - | 0.89 | 560 x 400 | 278430, -89830 | planned |
| 30 | NJ | JOINT BASE MCGUIRE-DIX-LAKEHURST | airbase | air | held | remnant | 170 | 720 x 520 | 251220, -60580 | planned |
| 31 | NM | WHITE SANDS MISSILE RANGE | proving | army | held | ruler | 8300 | 720 x 540 | 38190, 9050 | planned |
| 32 | NY | FORT DRUM | fort | army | held | remnant | 434.09 | 620 x 480 | 244500, -98780 | planned |
| 33 | NC | FORT BRAGG | fort | army | held | ruler | 650 | 620 x 480 | 222330, -16380 | planned |
| 34 | ND | MINOT AIR FORCE BASE | airbase | air | held | ruler | 20 | 560 x 400 | 72380, -139460 | planned |
| 35 | OH | WRIGHT-PATTERSON AIR FORCE BASE | airbase | air | held | ruler | 25.9 | 560 x 400 | 187980, -59900 | planned |
| 36 | OK | FORT SILL | fort | army | held | ruler | 380.4 | 620 x 480 | 91690, -12180 | planned |
| 37 | OR | UMATILLA CHEMICAL DEPOT | depot | depot | overrun | infected | 69.4 | 580 x 450 | -49700, -115100 | planned |
| 38 | PA | FORT INDIANTOWN GAP | fort | army | held | remnant | 73 | 610 x 480 | 238500, -64770 | planned |
| 39 | RI | NAVAL STATION NEWPORT | naval | naval | held | dustwolves | 4.3 | 420 x 340 | 274940, -75330 | planned |
| 40 | SC | FORT JACKSON | fort | army | held | ruler | 210.4 | 620 x 480 | 210020, -6220 | planned |
| 41 | SD | ELLSWORTH AIR FORCE BASE | airbase | air | held | dustwolves | 19.66 | 560 x 400 | 60440, -99630 | planned |
| 42 | TN | FORT CAMPBELL | fort | army | overrun | infected | 414 | 620 x 480 | 165630, -30430 | planned |
| 43 | TX | FORT HOOD | fort | army | held | ruler | 866 | 620 x 480 | 95970, 20300 | planned |
| 44 | UT | DUGWAY PROVING GROUND | proving | army | overrun | infected | 3243.58 | 720 x 540 | -4550, -63770 | planned |
| 45 | VT | CAMP ETHAN ALLEN TRAINING SITE | fort | army | held | ruler | 45.4 | 480 x 370 | 263780, -102760 | planned |
| 46 | VA | NAVAL STATION NORFOLK | naval | naval | held | dustwolves | 13.76 | 420 x 340 | 240410, -33180 | planned |
| 47 | WA | YAKIMA TRAINING CENTER | fort | army | sealed | - | 1323.3 | 620 x 480 | -54670, -123570 | planned |
| 48 | WV | CAMP DAWSON | fort | army | held | ruler | 16.906 | 480 x 370 | 218120, -56040 | planned |
| 49 | WI | FORT MCCOY | fort | army | overrun | infected | 242.8 | 620 x 480 | 143930, -98660 | planned |
| 50 | WY | FRANCIS E. WARREN AIR FORCE BASE | airbase | air | held | ruler | 13 | 560 x 400 | 46800, -75400 | planned |
| 51 | AZ | YUMA PROVING GROUND *(large)* | proving | army | overrun | infected | 3367 | 720 x 540 | -15745, 4836 | **drivable (arizona)** |
| 52 | AZ | FORT HUACHUCA *(large)* | fort | army | held | dustwolves | 296.5 | 620 x 480 | 11503, 16812 | **drivable (arizona)** |
| 53 | AZ | NAVAJO ARMY DEPOT *(large)* | depot | depot | sealed | - | 114.7 | 580 x 450 | 1265, -16982 | **drivable (arizona)** |
| 54 | FL | NAVAL AIR STATION JACKSONVILLE *(large)* | naval | naval | overrun | infected | 15.8 | 420 x 340 | 204068, 29002 | **drivable (florida)** |
| 55 | FL | CAMP BLANDING *(large)* | fort | army | held | remnant | 295 | 620 x 480 | 202111, 31445 | **drivable (florida)** |
| 56 | FL | AVON PARK AIR FORCE RANGE *(large)* | airbase | air | sealed | - | 429 | 720 x 520 | 206606, 52126 | **drivable (florida)** |
