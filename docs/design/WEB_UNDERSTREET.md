# WEB_UNDERSTREET: the storm drains and sewers under every town (2026-10-28)

Lane UNDERSTREET, Wave 2 of `WEB_DEPTH_PLAN.md`. Branch `feat/web-understreet`.

> Robert: "Below the street, underground system. Yeah, I think we do need storm drains, yeah, and everything has to be seamless, of course."

The run loop's "get in: ...or a storm drain underneath". Which of the three engines it makes bite harder: **distance and consequence**. The drains are a second map under every town. They are a quiet road past a held street, the way into a locked store, and a trap when the sky goes green.

| File | What |
|---|---|
| `web/src/data/understreet.js` | every row: SEWER, PIPES, CHAMBERS, WAYS, FLOOD, CURRENT, LIFE, CACHES, US_LOOT, US_LOGS, RING_DRAINS, BARS; `validateUnderstreet(rows, items)` |
| `web/src/world/understreet.js` | pure generator: `drainSite(rec, T, world)` (a town plan to a site row), `planDrains`, `genDrains`, `ringPlan` (a ring district), `drainMap`; registers `GEN.drains` with `world/undergen.js` |
| `web/src/systems/understreet.js` | runtime (`g.understreet`, the underground's `ext`): sites per town and ring district, lids, bars, the flood and its current, lazy residents, rats, grate light, the dead following sound down and up shafts |
| `web/src/systems/understreetlook.js` | the meshes: the ways on the street (one InstancedMesh a site + one for discs), below (water, grate light, floats, rats) |
| `web/src/agent/understreet-api.js` | the `understreet` command and 9 named selftest checks |
| `docs/renders/web/understreet/` | 5 game-camera screenshots |

## 1. Overview

A town's drains are **one underground site of kind `drains`** (`data/underground.js` KINDS.drains). It has one level, and its frame is the whole town plus its outfall. The generator reads the town's own street plan (`world/citygen/layout.js` T: roads, alleys, buildings, wrecks):

- **Trunk sewer** (4 m: a 2 m channel between two 1 m benches) under the main street. It runs on past the town's edge to the culvert and the outfall.
- **Laterals** (2 m) under every other street, and **alley drains** (2 m) down every service alley. An alley drain is stretched to the cross street at each end.
- **Junction chambers** (8 x 8 m, with a weir each side) wherever the trunk crosses another pipe.
- **A pump station** (14 x 10 m) beside the trunk in a town of 300 m or more. It has a generator, two pumps, a shelf cache and strip lights.
- **The outfall.** The trunk's line (then the other trunks', then the laterals') is carried on past its end until it meets water within 110 m. The outfall ramp's top stands on the dry bank 3 m short of the water. With no water, it opens into the dry wash 16 m past the trunk's far end. 65% of outfalls are barred.
- **A box culvert** (4 m) under the main road, 30 m past the town's edge at the end away from the outfall. A ramp rises out of each side.
- **Breaches**: 1 to 3 stores (shop, saloon, diner, clinic, gas station, auto shop, office, police station; 13.5 m deep or more) have an old cellar under them. A passage runs from the pipe under their street, and a stair comes up through their floor.
- **Manholes** every 64 m along every street pipe, and one per alley drain. Each sits in a niche beside the pipe, its lid on the street.
- **Kerb grates** every 30 m at the street pipes' kerbs. Daylight falls through all of them; 30% are loose and can be climbed.

The **Phoenix ring** (`world/ring.js`) is a 3 km metro, so it is cut into **districts of 4 x 4 blocks** (`RING_TILE` 320 m, edges mid-block so no street is cut). Each district is a drain site with a trunk under its arterials and laterals under its streets. A street line that I-10 cuts is one pipe that runs on under the freeway. Where its water goes:

- into the island's river, the old river's dry wash, or the desert past the city's edge, if one of its pipe lines reaches one within 260 m without crossing another district's ground;
- otherwise through an **interceptor grille** at its edge, into the next district toward the nearer of the wash and the edge.

Ring districts come up within one district of you, one per half second, and go past two.

Everything else is the underground's own (`docs/design/WEB_UNDERGROUND.md`):

- the `p.ug` state, the view going below with your head (the clipping plane, the occluder, the dark sky);
- the UnderWorld's colliders and rays, the walk grid and A*;
- the noise flood, write-back, save and load.

The drains plug in through `under.ext`: many ways, lids, lazy people, the street's noise going down a shaft. Nothing loads; you walk down a ladder.

## 2. Player Fantasy

The square is held: a lookout on the courthouse roof, two at the gun shop's door. You walk round the block to the alley, kneel at a lid and lever it up with the crowbar. It is loud, and you wait. Then you go down the rungs into the smell.

The trunk is old brick, a channel of black water down the middle and a bench each side. Your lamp is the only light, except where a grate at the kerb lets a grey bar of noon down onto the water. Rats run from your beam. Somewhere ahead something drags its feet through the water, and every step you take rings down the pipe ahead of you.

The chalk on the wall says the river is that way and the hardware store's cellar is the squatters'. Under the gun shop you find a broken floor and a rubble heap. You come up behind its counter with both of its doors still locked.

When the sky goes green, the water comes up the benches, then your knees, then your chest, and the current takes you toward the outfall's bars. You find a ladder.

## 3. Detailed Rules

### 3.1 The plan (`world/understreet.js` drainSite / planNet, pure)
1. Pipes from the town's roads: the main road is the trunk (or the longest road, if none is main); the others are laterals. Each is clamped to the town's bounds and to whole metres.
2. Alley drains: the alley's lane centre line, stretched to a perpendicular street pipe within 18 m at each end (an alley joined to nothing gets no drain).
3. **Only what joins the main trunk is piped.** Two pipes join if their cells share an edge at least a metre long. A street piece cut off on its own has no drain.
4. Junction chambers at every trunk crossing (12 m apart at least); a chamber at the trunk's middle if it crosses nothing.
5. Outfall search (see §1), then the culvert, then the pump station. The station tries each side of the trunk and is skipped if it would touch a pipe or a chamber.
6. Breaches. A candidate must face a street that has a pipe within 26 m. Its stair band must be clear of every front door and bay (their width plus 1.2 m each side). The stair's footprint inside the store must not touch any box the building's build made except its outer walls (its own stair core, counters): `world.blocked`, read off `built.boxes` at stamp time. The cellar must fit inside the store, at least 0.4 m clear of its back wall.
7. Manholes. A manhole's niche is a 1 x 2 m shaft beside the pipe, along it. Its lid (the step-on point) must be on the road's or the alley corridor's surface. It must stand at least 6 m from any other way's top, 3.4 m from a wreck, 3 m from a chamber, and 1 m from any other pipe.
8. Grates at the kerb line (the road row's half-width less 0.4 m). They alternate sides and never stand within 4 m of a way, 2 m of a chamber, or cut through a manhole's niche. A loose grate needs 2 m of stub to the kerb for its ladder.

### 3.2 The level (`genDrains`, pure)
- **Cells**: rock, OPEN floor with a class (`CLS`: channel, bench, lateral, alley, connector, outfall, culvert, junction, pump, basement, stub), and STAIR (a shaft's or ramp's mass).
- **Flights**: every way is a flight from the street (Y[0]: the town's pad, absolute, so real terrain works) down to the sewer floor (Y[1] = Y[0] − 4.2). Each flight's top end is its own ground height. Pitches: manhole and grate 2.1 (2 m of rungs), breach 1.0, ramps 0.42.
- **Colliders**: the rock that touches a floor cell, merged into rectangles (`ug-wall`), plus each flight's flanks and end blocks (`ug-flank`, `ug-endblock`, `ug-rail`). A ring district's interceptor is a `ug-gate` box drawn as bars.
- **The outfall's bars**: a double-leaf door of material `bars` across its pipe, 1.5 m inland of the ramp's foot.
- **The flow field** (`L.dist`): steps from the outfall's foot (or the interceptor) over the floor, four ways. A cell nothing reaches goes back to rock. The proof fails if any pipe's centre line, chamber or way is cut off, or more than 1% of the floor had to be sealed.
- **What is in it.** The pump station's generator (`L.generator`: the underground's own generator rules: hold E, a fuel can into a dry tank), its pumps, shelf, three strip lights, and its card. Each cellar gets a rubble crate. In 60% of towns a squatters' camp takes the second-farthest junction: two cots, a cache, an amber chem light, its rules, and 2-4 drifters (40% armed). Nests: one per 170 m of town size, in the farthest junctions (or the farthest dead end), each 3-5 dead (a sprinter at 60%) and a cache. 2-5 loose dead wander the pipes more than 30 steps from the outfall. 3-7 bags of flotsam lie in chambers and pipes, 45% of them under the murk with nothing on show. Notes: chalk by the outfall's foot, a water line in the nearest junction.
- **A hash** of every cell, flight, door, box and spawn: the same row makes the same level.

### 3.3 Runtime (`systems/understreet.js`)
- **Sites.** `citygen.stamp` calls `onBuilt(t)`, and the town's row joins `under.sites`; release takes it out (the underground's records stay). Rural places and bases get no drains. A row's `attachR` is its half-size + 70 m (town) or + 24 m (ring district). The live site switches on within 16 m of any way's top, and off past 56 m of all of them when you are up top. A site's own entrance you walk up to (a vault, a bunker) takes over from the drains.
- **Lids.** A manhole or loose grate is closed until lifted. Lifting from the street takes hold E: 1.2 s with a crowbar, 3 s by hand, a grate 2.4 s and only with a crowbar. It is heard 22 m (a grate 26 m). From below you shoulder the lid up the same way. Tap E on an open lid to drag it back over (heard at 0.6 of that). An open shaft has a 0.45 m lip on its sides and far end, so you step in at its top end only; nobody walks into one sideways. A shut lid is **no way at all**: heightAt skips its flight, a noise does not climb it, and AI does not route through it. Lids are in the underground's site record (`rec.open`, saved).
- **Bars.** At the outfall's grille, hold E: a hacksaw cuts a bar in 7 s and is heard by nobody; a crowbar pries it in 3.2 s and is heard 34 m. Kicks (30) and rounds (`bulletLock 0`) do not open it.
- **Water.** `rec.water` is metres over the trunk's channel floor. The target is `dry + (rain − dry)·min(1, sky.rain) + (storm − rain)·min(1, sky.storm)`. The water rises 0.02 m a game minute toward it, falls 0.006, and a running pump station takes 0.03 more off (never below dry). Depth at a cell is `water − LIFT_OF[class]`. `world/water.js stateAt` asks the drains first below the street, so the water lane's own wade (> 0.25) and swim (≥ 1.3) speeds, breath and splashes apply. Under a bunker, a river over it no longer makes you swim.
- **Current.** Anyone standing in water deeper than wading (not on a flight) is carried one cell's way down the flow field at `min(1.5, 0.55·depth)` m/s: a swimmer at full speed, a wader at 0.35 of it. Within 0.3 m of the soffit (the walls are 2.6 m) there is no air: 9 hp/s, with a toast every 3 s. The dead are swept and drown the same way. Zombies no longer stop at the surface's water when they are below (`ai.wades`).
- **Sound.** A drains level floods noise four ways, one visit a cell, at `carry` 0.6 a metre: a 30 m shot carries 50 m down a pipe. It climbs every open shaft it reaches (the underground's `NOISE.shaft` share), but never echoes back down another. A street noise goes down the three nearest open shafts. The dead on the street who remember a sound within 9 m of an open shaft's top go to the top, down the rungs, then on to where it was made (`usDown`). The dead below who hear a street noise come down a shaft climb up it to the street (`usUp`).
- **People.** At promote, only the record's people within 70 m of you stand up. Every second, more stand up as you come within 70 m, and anyone past 105 m who is not after you folds back into the record (where they stood, their hp). The underground's write-back keeps the rest.
- **Rats**: 36, cosmetic. They nose about within 28 m of you, scatter from you (6 m) and from your lamp's beam (10.8 m), squeak close by, and are gone when the water is over a metre.
- **Light.** Below is the underground's dark: no sun, the lamp, chem lights, a powered station's strips. Each grate throws a pool under it and a wider spill into its pipe, plus a faint shaft. All are coloured by daylight: `(1 − night)·(1 − 0.5·clouds)·0.9`.
- **Containers** are the inventory's ring boxes (`ring:ug:<site>:1:b<n>`): rolled once, never refilled (law 2). A submerged one has no prop: you find it by wading over it.

### 3.4 What the street sees (`understreetlook.js buildWays`)
One InstancedMesh of boxes and one of discs per attached site:
- **Manhole**: an iron frame, a disc lid with its raised centre. When the lid is off it lies slid aside, the dark slot and its rungs show, and a rusted lip rail stands round three sides.
- **Grate**: a dark inlet and iron bars at the kerb.
- **Ramps** (outfall, culvert, breach): a dark opening, stepped bands going down, a concrete lip on three sides (the collar, also a collider), and a headwall over the far end. The outfall also has an apron, and bars if it is barred. A breach is a broken slab ring inside the store's floor.

Heights follow `engine/depthlayers.js` rows `usHole` (0.118) and `usLid` (0.14): over every citygen street and kerb (to 0.112).

## 4. Formulas (with an example)

| Name | Formula | Example |
|---|---|---|
| Floors | `Y[0] = pad`, `Y[1] = pad − SEWER.depth` | a county seat on a 52.77 m pad: sewer at 48.57 |
| Manhole shaft | `len = max(2, ceil((yTop − Y[1]) / 2.1))` | 4.2 m of rise: 2 m of rungs at 0.4 pace |
| Outfall ramp | `len = max(2, ceil((yBank − Y[1]) / 0.42))`, foot = bank − s·len | a bank 1 m over the pad: 13 m of ramp |
| Flood target | `dry + (rain − dry)·r + (storm − rain)·s` | RAIN (r 1, s 0): 0.5 m; ACID STORM (r 1.6→1, s 1): 2.45 m |
| Flood rate | `+0.02` / `−0.006` / pumps `−0.03` m a game minute (2 game min a second) | dry to knee deep in a rain: 20 game min, 10 s; to a full trunk in a storm: ~2 min real |
| Depth | `water − LIFT_OF[class]` (channel 0, bench 0.32, lateral 0.14, alley 0.18, junction 0.08, pump 0.55, cellar 0.7) | water 0.5: channel 0.5 (wade), bench 0.18 (dry), cellar dry |
| Current | `v = min(1.5, 0.55·depth)·(depth ≥ 1.3 ? 1 : 0.35)` down the flow field | water 1.7 in the channel: 0.94 m/s |
| Air | drowning when `depth > 2.6 − 0.3` | a storm's 2.45 in the channel: no air; on a bench (2.13) there still is |
| Noise below | heard if flood steps × 0.6 ≤ r | a 30 m shot: 50 m of pipe (checked: 45 m hears, 60 m does not) |
| Shaft share | street ← below: `(r − d_foot)·0.35`; below ← street: `(r − d_top)·0.35` | a 60 m shot 6 m from an open top: 18.9 m into the pipe |
| Lazy people | stand up within 70 m, fold back past 105 m unless hunting you | a 600 m town keeps 3-8 of its 15 below at once |
| Nests | `max(1, round(size / 170))` | a 368 m county seat: 2 nests |

## 5. Edge Cases (exactly what happens)

- **A lid shut over you.** Its flight is gone: you are at its foot on the level, and the prompt says "hold E Push the lid up". A shut lid has no collar, so cars drive over it.
- **Standing on an open lid's frame from the side.** The lip stops you. Its top end is the only way in.
- **Walking past a closed grate's niche below.** Its stair cells are not on the walk grid, and the flanks keep you out of the slot. A walker who cuts a corner into one steps back out.
- **A pipe with no crossing street** (a dead-end lateral): it joins through the trunk crossing at its end, or it is not piped (§3.1.3).
- **No water within 110 m**: the outfall opens into the dry wash past the trunk's far end; `net.outfall.water` is false.
- **A ring district whose search would cross another district's streets**: it stops there (that district's drains take the water). It sends its own on through the interceptor toward the wash or the edge.
- **Two ways' shafts in one cell bucket**: heightAt looks only at the 16 m bucket's flights (`plan.fgrid`).
- **A breach where the store's stair core stands**: the stair moves along the front wall until its footprint is clear, or there is no breach.
- **The town is released while you are below**: its row stays until you come up.
- **Loading a save below in a town's drains**: the underground's load activates the site only if the row exists. The town must be stamped first (it is, if you saved inside it: citygen stamps the nearest town on the first scan). If it is not, you load on the level's height with no floor under you until it stamps. Not covered by a check.
- **A ray below on raised ground**: callers pass heights over the street (`gy − y0`, as upstairs passes `gy − storey.y0`). `engine/collision.js` adds the live site's `y0` back before asking the UnderWorld, so a town's drains on a 52 m pad and a bunker at 0 both work.
- **The flashlight off at night below**: the grates are dark too; only a chem light or a powered station lights anything.
- **Water over a metre**: rats are gone. Over 1.3 m you swim; zombies are swept and drown.

## 6. Dependencies (both ways)

Uses:
- `systems/underground.js`: sites, attach/detach, activate, promote/demote, write-back, heightAt, steer, waypoint, the noise flood, playerInteract, view, save. Hooks added there: `ext`, the `y0` getter, drains dispatch in attach/update/noise/steer/heightAt/promote/demote/playerInteract, per-site `attachR`, the ring-buffered and four-way flood for drains, `climbing`.
- `world/undergen.js`: `GEN`, `flight`, `flightColliders`, `mergeRects`, `flightHeight`, cell constants.
- `world/citygen/layout.js` (T), `systems/citygen.js` (`onBuilt` / `onReleased`, `buildingAt`, `openings`, `setBay`, `built.boxes`).
- `world/ring.js` (`streets`, `inCity`, `depth`, `I`).
- `world/water.js` (`depthAt`, `stateAt` → `below`, `normal`), `data/water.js` (the 0.25 / 1.3 depths), `systems/sky.js` (`cur.rain`, `cur.storm`, `night`, `time`).
- `systems/zombies.js` (`spawn`, `remember`), `systems/ai.js` (`wades` below), `systems/interiors.js` (door leaves, `unlock`), `systems/inventory.js` (ring boxes, `hasTag`).
- `engine/collision.js` (the UnderWorld ray route, `extra` collars), `engine/depthlayers.js` (`usHole`, `usLid`), `data/items.js` (`hacksaw`), `data/underground.js` (`KINDS.drains`, `ENTRANCES.manhole`, `LOGS`, `NOISE`, `UG`).

Used by:
- `main.js`: constructs it, calls `update`, puts `interact` in the street's E chain, and `sees` passes the height over the street below.
- `systems/combat.js`: a round fired below flies at its height over the street.
- `systems/underground.js` (through `ext`), `systems/citygen.js` (stamp/release), `agent/api.js` (the command and the checks).
- `docs/design/WEB_UNDERGROUND.md` §6 names this lane.

## 7. Tuning Knobs (safe ranges)

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| SEWER.depth | data/understreet.js | 4.2 m | 3.4-6 (validated) | shaft length, how far the street's light reaches |
| SEWER.carry | " | 0.6 | 0.4-0.9 | how far a noise runs down a pipe |
| SEWER.lazyR / dropR | " | 70 / 105 m | 50-100 / lazyR + 25-60 | how many below are live; cost |
| PIPES.*.w | " | 4 / 2 / 2 / 3 / 4 | 2-6 whole m | room to fight, current width |
| CHAMBERS.pump.minSize | " | 300 m | 250-450 | which towns have a station |
| WAYS.manhole.every | " | 64 m | 40-120 | how many ways in |
| WAYS.manhole.bar / hand | " | 1.2 / 3 s | 0.8-2 / 2-5 | the cost of going down quietly |
| WAYS.grate.every / enter | " | 30 m / 0.3 | 20-60 / 0-0.6 | light below, extra ways |
| WAYS.outfall.bars / pry / cut | " | 0.65 / 3.2 s / 7 s | 0-1 / 2-6 / > pry | the outfall as a way in |
| WAYS.breach.per / minDepth | " | [1,3] / 13.5 m | [0,4] / 12-16 | quiet ways into stores |
| FLOOD.rain / storm | " | 0.5 / 2.45 | wade..swim / ≥ 2.3 | how a storm traps you |
| FLOOD.rise / fall / pump | " | 0.02 / 0.006 / 0.03 m a game min | 0.005-0.06 | warning time, recovery |
| CURRENT.k / max / wade | " | 0.55 / 1.5 / 0.35 | 0.2-1 / 0.8-2.5 / 0.2-0.6 | being swept |
| LIFE.nestPer / nestSize / loose | " | 170 m / [3,5] / [2,5] | 120-300 / [2,8] / [0,8] | danger below |
| LIFE.squat / squatters | " | 0.6 / [2,4] | 0-1 / [1,6] | people below |
| LIFE.rats | " | 36 | 0-64 | life, noise |
| CACHES.flotsam / submerged | " | [3,7] / 0.45 | [0,10] / 0-0.8 | loot below (rolled once) |
| RING_DRAINS.search / washReach / edgeIn | " | 260 / 520 / 30 m | 150-400 / 300-800 / 10-60 | which districts have their own outfall |

## 8. Acceptance Criteria (selftest: `selftest only=understreet`, `agent/understreet-api.js`)

1. **Rows validate.** Pipes are whole metres, and the trunk's channel sits between its benches. A manhole shaft is within 3 m of run. A storm fills the trunk to the soffit; rain is knee deep. A cut is slower than a pry. Every loot row is a real item. No colour has a hue of 270-320.
2. **Every town has a connected drain network reaching an outfall.** Every archetype × 2 seeds (52 towns, about 4,400 ways, 3,000 manholes) is proved from the outfall's foot: every pipe, chamber and way is reached. All 76 Phoenix ring districts are proved too, each reaching an outfall of its own (35) or through interceptors (41).
3. **Every manhole connects to the network.** In 10 archetypes × 2 seeds, every manhole's lid is on a street or alley surface and never in a building, and its foot is on the outfall's network.
4. **Street → manhole → tunnel → a store's cellar → inside the locked store, without opening its doors.** On held keys: lift the lid (hold E), climb down (`ug`, the view below), walk the level's own path to the breach's cellar, and climb up through the floor. You end inside the store with every one of its doors still locked and shut, and its roll-ups down.
5. **Noise underground carries further along a pipe than through ground.** A 30 m shot below turns an infected 45 m down the same straight trunk (past the 30 m it carries in the open). It does not turn one 60 m down, nor one on the street right over the shot.
6. **Rain raises the water in the trunk.** Clear is dry. Rain takes the channel over wading depth (you wade). An acid storm takes it over swimming depth (you swim, and the current carries you more than 0.5 m in 2 s). It falls again when the sky clears.
7. **An infected follows a sound down a manhole.** A shambler on the street near an open manhole hears shots below come up the shaft. It climbs down (`ug`) and comes within 9 m of the shooter.
8. **A horde can come up a manhole.** The dead below at an open manhole's foot hear a shot on the street come down the shaft, and climb up into the street.
9. **Daylight falls through the grates, and the drains draw under 150 calls.** The pool under a grate is lit at noon (> 0.4) and dark at midnight (< 0.15).

Perf: `scenario name=stress` (Phoenix island; no drains attached) was within run-to-run noise on three pages each way. The live drains below add 4 draw calls to the underground's: water, light pools, shafts and floats, decorations, rats (88-96 measured in a town). The street adds 2 per attached site. No per-frame allocation (rats, water and light reuse their instance buffers; the current and lazy passes use fixed temporaries). No new lights.

## Not done (follow-ups)
- **Breaches in the ring.** Ring lots are not citygen buildings; there is no store-from-below in the ring yet.
- **Squatters' behaviour.** They are drifters at their post: they don't trade, warn you off or follow the camp's rules yet.
- **Flood warnings.** The radio and the squatters do not warn of a storm's flood; the only warning is the water.
- **Bodies in the water.** Remains below are props on the floor. They are not hidden by the murk the way submerged caches are, and the current does not carry them.
- **Ring districts and towns never share a network**: a citygen town is a separate system from the ring district it might stand near.
