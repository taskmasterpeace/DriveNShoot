# WEB_MATERIALS: what everything is made of

Status: v1 built (2026-10-23), `feat/web-materials`. Code: `web/src/systems/materials.js`, `web/src/systems/blood.js`,
rows `web/src/data/materials.js`, agent rows and checks `web/src/agent/materials-api.js`.

## 1. Overview

Every wall, door, window, crate, shelf, tent, wreck, fence, car panel and prop has a MATERIAL, decided by rule from data the
world already has (a collision box's tag; for a building's wall, the building, outer wall or partition, and the finish its
shader paints). Rounds, blasts, fire and rams act on a thing by its material:

- a round goes **through** thin wood, drywall and sheet metal with what energy is left (and can still kill the man behind),
  **stops** in block, brick, adobe, concrete and sandbags, and **glances off** steel (and a little off concrete, rock, sheet
  metal) at shallow angles;
- what breaks (**wooden doors, drywall partitions, crates, shelves, furniture, stalls, tents, placed pieces**) carries hp and
  **breaks**: a door comes off its hinges, a wall opens a **breach** you see, shoot and walk through (the nav grid is told),
  a crate goes to planks; masonry **chips and holds**;
- blasts break things by material in their radius; fire **burns** wood and cloth and **spreads** along what burns; a car
  **rams** through what breaks;
- a person hit by a round **bleeds onto the wall, door or car behind them** (spray, drips running down, a stain at its foot),
  the downed pool, the dragged smear, and all of it **dries darker** over game hours and **washes away** in rain outdoors.

What is broken, burnt and bled is in the save. One damage law: people still only take damage through `combat.damage`.

## 2. Player Fantasy

You are behind a plank fence and the raider's rifle comes through it anyway. You learn the town: Rust Haven's adobe and the
ruins' concrete block are cover; the stucco houses of the ring are concealment; a shack is a death trap. You blow the back
door of a holdout off its hinges with a frag instead of kicking it three times. You burn a raider camp's shacks and they burn
down to black stumps while the tin one beside it stands. You walk into a room and the wall behind where a man died is
sprayed dark red; you come back that night and it has gone brown; the alley outside is clean after the rain. It reads like
the books: scarce rounds, improvised cover, a world that keeps the marks of what happened in it.

## 3. Detailed Rules

**What a thing is made of** (`Materials.classify(box, x, z)`, first match wins):
1. A piece stood with `build` is its own row's material.
2. `MATERIAL_RULES.tags[tag]`: a crate, shelf, furniture, table, desk, bench, booth, stall, barricade, bleachers = wood; a
   tent = cloth; a barrel, junk, shed, pump, lockers, racks = sheet metal; a wreck, car, chassis, engine = a car body; a tank,
   tower, boxcar, rail, ramp, mast, flagpole, post, pole, boom, bunk, milbox, generator = steel; a fence is chain-link on the
   island (the base's wire) and concrete block in the ring (yard walls); Rust Haven's town wall = corrugated sheet on a
   packed-earth core (`scrap_wall`); sandbags; barrier, pool, storey floor = concrete; trees and cacti = a living trunk;
   rock and boulders = rock; a solid building = by its painted finish.
3. A `wall` (or `storey-wall`): probe 0.3 m past each face. Both probes in the same building: a **partition**, drywall.
   Otherwise an outside wall, by the finish `world/surfaces.js wallFinish(cx, cz)` paints on the piece of wall that point is
   on (a wall with windows is drawn as pieces between them, each with its own finish): finish 0-5 stucco (in Rust Haven:
   adobe), 6-8 concrete block, 9 brick. The wall shader and `wallFinish` use the same exact integer hash, so a wall is made of
   what it looks like.
4. Anything else: concrete (the selftest proves no island tag falls through to this).
- A door leaf: wood or steel by its row (`DOOR_MATERIALS`). A window: glass while intact, wood while boarded, nothing when
  shattered (windows keep `systems/interiors.js`'s own rules: glass and boards stop a round). A car (`material id=v<N>`):
  sheet-metal panels, steel on plated facings, glass, rubber tyres (rounds into cars keep `garage.absorb` and
  `vehicledamage`'s rules).

**A round** (`combat.hitscan`, up to `PEN.segments` legs): it flies until it meets a person, a car, a dog, the train or a
wall. A person, car, dog or train takes it and it ends there. A wall: `Materials.bullet`/`throughLeaf` sprays the hit by
material (splinters, dust, chips, sparks, a puff, fibres, shards), leaves a hole mark on the face, wears the thing
(`dmg x bulletMul`), then the round glances off, stops, or carries on from just past the far face with what is left
(Formulas). A second leg can hit a person (that is the plank-wall kill) or another wall.

**Breaking.** Only on the island (the ring's buildings are a pure function of the data and stay whole; its doors do break).
- A wall of a breakable material keeps its hp in strips of about 1 m. A strip at 0 opens a breach `breach` m wide (a car's
  ram at least `RAM.breach`), centred on a half-metre so the foot nav's cells line up with it. The wall's box and drawn
  instance go; what is left is drawn as pieces (same colour and finish) with boxes of their own; the foot and car nav grids
  are re-rasterised round it by nav.js's own rule. Marks on the part that went go with it.
- A door: `hpM2 x width x 2.25`. At 0 it is off its hinges for good (`door.broken`): no leaf, no lock, no collision, no
  sight or round stopped, no E prompt; planks in the doorway. Ring doors keep it when they detach and attach again.
- A prop (crate, shelf, furniture, stall, tent...): whole. At 0 its box and drawn parts go, debris lies where it stood. A
  container in it stays where it was (a pile to search).
- Masonry, steel, rock, sandbags: never break; rounds and blasts chip and scorch them.

**Blasts** (every grenade, pipe bomb, sticky charge, tanker and car going up: `interiors.blast` calls `materials.blast`):
every breakable box and door in the radius takes the blast power at its distance less its `blastRes`; a wall strip by
strip; the faces nearest the blast take scorch marks (8 at most).

**Fire.** Every 0.25 s each fire (a molotov's patch, burning fuel, a car on fire, and every burning thing's own patch) heats
what burns within its radius; `ignite` seconds of flame and it catches. It burns for `burn` seconds, blackening (soot in its
shader, a door leaf's colour, a crate's parts), keeping a fire patch over itself (which burns people, cooks cars, lights the
night through the two fire lights and catches what stands next to it: that is how fire spreads; things burning within
`FIRE.merge` m of each other feed one patch, grown to take them in, up to `FIRE.maxR` m, so a shack is one blaze); at the end it collapses
to charred stumps, charred debris and a soft ash mark. Drywall, metal and masonry do not burn.

**Rams.** A car within 160 m of the player, driven by you or by someone out to hurt somebody (raiders, a car on a
chase; the town's traffic and the convoys keep to the road), at or above `RAM.minSpeed`, that touches a breakable thing deals it
`speed² x perSpeed2` (its speed before the impact), at most once per `RAM.every` s per thing.

**Blood.** A person hit by a round (`combat.damage`, cause bullet) sprays along the round's line: a ray `BLOOD.reach` m
behind them finds the nearest wall, door, crate or car. A wall gets a directional spray at chest height (streaks along the
wall the way the round was going), and for a hard hit or a kill drips running down it and a stain on the floor at its foot
(what reads from the game camera). A car gets the spray on its roof, riding along with it. Several pellets in one frame
make one splash (70% skipped). The floor's spray, the pools under the downed and the drip trails are fx.js's as before; a
dead body that moves (a harpoon, a car shoving it) leaves smears every `smearEvery` m. Every blood mark, wall or floor, dries
from fresh to dry over game hours; outdoors (not inside a building with a roof) rain washes blood and scorch away.

**Pieces** (`build`): walls (plank, sheet, drywall, block, brick, concrete, sandbags, steel plate, chain-link, tarp),
crates, and shacks (four walls round a 3.4 x 3 m floor, a door gap on the -z side), on the island only.

## 4. Formulas

Variables: `dmg` the round's damage; `E` its energy; `P` = `PUNCH[ammo]`; `stop`, `ricochet`, `ricAngle`, `bulletMul`, `hpM2`,
`blastRes` from the material's row; `d` the round's unit direction, `n` the face normal; `p` the path through the thing;
`T` its thickness; `r` a blast's radius, `δ` the distance from the blast to the thing.

- **Energy:** `E = dmg x P` (pistol 1.0, SMG 1.0, shells 0.5, rifle 1.9).
- **Glance:** `θ = asin(|d·n|)` in degrees. Glances when `ricochet > 0` and `θ < ricAngle` and (`θ < ricAngle/2` or a roll
  under `ricochet`). New way `d' = d − 2(d·n)n` turned by a jitter in `±ricJitter`; `dmg' = dmg x ricKeep`, `E' = E x ricKeep`.
- **Through:** `slant = clamp(p / min(T, p), 1, maxSlant)`, `soak = stop x slant`. Stopped if `T > maxDepth` (solid mass) or
  `E ≤ soak`. Otherwise `k = (E − soak) / E`, `dmg' = dmg x k`, `E' = E − soak`, and it carries on from `p + exitGap` past
  the entry. A door leaf: `T = 0.1`, `p = T / max(0.2, |d·n|)`.
- **Wear:** `dmg x bulletMul` to the thing. Strip hp `hpM2 x h x (len / n)` (`n = round(len)` strips); door `hpM2 x w x 2.25`;
  prop `hpM2 x longSide x min(2, h)`.
- **Blast:** `power = powerPerM x r`; to a thing `power x (1 − δ/r) x (1 − blastRes)`.
- **Ram:** `speed² x perSpeed2 x (1 − blastRes/2)`.
- **Fire:** `heat += dt / ignite` while in flame; burning for `burn` s; `char = 1 − burnLeft / burn`.
- **Blood:** splash size `s = (0.55 + min(1.2, dmg/50)) x (1.15 − 0.45 t/reach) x (1.35 if it killed)`; dryness
  `k = 1 − e^(−age/dryHours)`, colour `lerp(fresh, dry, k)` (linear); wash `+= Δhours x washPerHour x min(1, rain)`, gone at 1.

Example: a .45 (`dmg 38`) square into a plank wall: `E = 38`, `soak = 12`, `k = 0.68`: the man behind it takes 26. The same
round into concrete block (`stop 170`): stopped, the face chipped. A service rifle (`24 x 1.9 = 45.6`) through a ring
house's stucco (`30`): `k = 0.34`, 8 damage behind it. A frag (`r 7`, power 490) 2 m from a single wooden back door (1.4 m,
`hp 60 x 1.4 x 2.25 = 189`): `490 x 0.71 x 0.65 = 227` ≥ 189, off its hinges; 3.5 m off: 159, it holds. An island partition
4.4 m high (drywall, `30 x 4.4 = 132` a strip): four .45 rounds in the same metre open a 1.3 m breach.

## 5. Edge Cases

- A round that starts inside a wall (pressed against it): `combat.fire`'s muzzle checks are unchanged; a round only ever
  starts its next leg past a far face, so it cannot re-hit the wall it left.
- A wall thicker than `maxDepth` (1.25 m: a tower block, a boulder, a wreck's long side counts by its smaller side): never
  passed, whatever the material.
- A round that has spent its range (`left < 0.5 m`), or four legs: ends.
- Upstairs (`storeys`): the round keeps its floor's height on every leg; floating boxes (base > 0) never break.
- A glancing round is nudged off the face so it never re-enters it.
- Windows: glass and boards keep interiors.js's rules (they stop the round; boards leak every 5th). A shattered window is
  nothing.
- A breach narrower than a walker (none of the rows are) would stay blocked on the nav grid; breaches are centred on the
  foot grid's half metres so 1.3 m opens a cell. The car grid (1.9 m radius) opens only for wide breaches.
- A locked door that breaks: unlocked, its nav block lifted, its chain gone.
- A ring door broken while it is attached: kept by id (`brokenDoors`); it attaches again broken; in the save under `door:<id>`
  even while detached.
- The ring's walls, crates and furniture take rounds by material (and mark) but do not break (their chunks are rebuilt from
  data; v1 keeps no overlay there).
- A container in a broken crate or shelf stays searchable where it stood.
- A save from before materials: nothing is reset (a save without the key leaves the world as it is).
- Loading: everything this system did is undone first (boxes back in the grid, instances shown again, colours restored, doors
  re-hung), then the save's state applied, then nav re-rasterised round each.
- The decal ring is full (640): the oldest mark goes. A car that leaves the world takes its blood with it.
- Many pellets in one frame: one splash per person per frame, the rest 70% skipped.
- A fire patch renewed every few seconds lays no new scorch (pushed straight into the fire list); the scorch is laid once
  when the thing catches and the ash once when it collapses.
- Rain and scorch: scorch outdoors washes too.

## 6. Dependencies

Uses: `engine/collision.js` (the island grid's cells and boxes, `raycast`, `hit` normals, ops), `engine/nav.js` (`getCell`,
`setCell`, radius, cell, island), `systems/combat.js` (calls in), `systems/interiors.js` (doors: `byId`, `doors`, `orient`,
`flush`, `navBlock`, `syncLock`, `leafMesh`, `doorView`, `windowView`), `systems/throwables.js` (`fires`, `startFire`),
`systems/vehicles.js` (`speed`, `discs`, `impact`), `systems/fx.js` (particles, decals, the floor decals' blood
bookkeeping), `world/city.js` (`world.walls`, `world.props`, `world.buildings`), `world/surfaces.js` (`wallFinish`),
`world/streamer.js` (`ringBuildingAt`), `systems/sky.js` (time scale, fast, rain), `water.depthAt`.

Used by: `combat.hitscan` (every wall a round meets), `combat.damage` (blood on walls), `interiors.blast` (every blast),
`interiors.makeDoor` / `leafCircle` / `ray` / `nearest` / `writeLeaf` (broken doors), `throwables.startFire` (soft scorch),
`main.js` (update), `agent/api.js` (save/load, the commands, the checks).

## 7. Tuning Knobs (data/materials.js)

| Knob | Now | Safe range | What it moves |
|---|---|---|---|
| `MATERIALS.*.stop` | wood 12, drywall 8, sheet 10, stucco 30, block 170 | 0..∞ | what gets through; keep wood < 14 so a 9 mm round passes a fence |
| `PUNCH` | pistol 1, smg 1, shells 0.5, rifle 1.9 | 0.3..3 | how far each round carries through things |
| `*.ricochet`, `ricAngle` | steel 0.9 / 35° | 0..1, 5..60° | glances; under ricAngle/2 it always glances |
| `*.hpM2`, `bulletMul` | wood 60 x 0.5, drywall 30 x 1 | 10..2000, 0..1 | rounds to break things |
| `*.breach` | 1.1..1.5 m | 0.9..2.5 | how wide a breach opens (≥ 1.3 to be walkable) |
| `*.blastRes`, `BLAST.powerPerM` | wood 0.35, drywall 0.5; 70 | 0..1; 30..120 | what a frag breaks and how far |
| `*.fire.ignite`, `burn` | wood 1.5 s / 32 s; cloth 0.4 / 9 | 0.2..10, 5..120 | how fast things catch and burn down |
| `FIRE.margin`, `flamesPerM`, `merge`, `maxR` | 0.9 m, 2, 3 m, 4.5 m | 0.3..2, 1..8, 0..5, 3..6 | how far fire jumps; flame density (perf: particles); one blaze, not a stack |
| `RAM.minSpeed`, `perSpeed2`, `breach` | 6, 2.2, 2.4 | 3..12, 1..5, 2..3.5 | what a car drives through |
| `PEN.maxSlant`, `maxDepth`, `ricKeep`, `segments` | 2.5, 1.25, 0.55, 4 | 1..4, 0.6..2, 0.2..0.9, 2..6 | oblique soak, solid mass, glance energy, legs |
| `BLOOD.fresh`, `dry`, `dryHours` | #5a0707, #3c2417, 3.5 h | dark reds, browns (no hue 270-320) | how it looks and dries |
| `BLOOD.reach`, `wallMax`, `washPerHour`, `smearEvery` | 2.5 m, 640, 0.45, 0.45 m | 1..4, 256..1024, 0.1..2, 0.2..1 | how far it carries, how many marks, rain, smears |

## 8. Acceptance Criteria (selftest, `node tools/dl.mjs selftest only=materials`)

1. Every island box has a material by rule, no tag left to the default; the island has adobe, stucco, block, brick, drywall,
   wood, sheet metal, chain-link, sandbags, steel, concrete, car bodies, cloth and the town wall's scrap.
2. A .45 round passes a plank wall and the man 2.5 m behind it loses hp (the round's story says `through` wood); three rounds
   at a man behind a concrete-block wall all stop (`stopped` block) and he is untouched.
3. A round meeting a steel plate at 10° glances off (one ricochet, the man behind it untouched); two square on stop, no
   ricochet.
4. A frag thrown 1.2 m in front of a wooden back door in the ruins takes it off its hinges: `door.broken`, the gap open on
   the foot grid, a look in through the doorway meets no leaf; a concrete wall 2.2 m out beside it stands whole.
5. Rounds into an island drywall partition open a breach (≤ 10 rounds): the foot nav cell in the gap opens (it was blocked),
   and a look across it meets nothing of the wall.
6. A man shot in front of a block wall leaves blood on its face; 10 s later it is still there; after 8 game hours (time x40)
   its colour's value is under 0.8 of what it was and it is more than 80% dry; a dead body moved 2.4 m leaves a smear.
7. A molotov at a wooden shack burns every wall of it to charred stumps (broken, burnt out, char 1); a sheet-metal shack 9 m
   off and a concrete wall 4.5 m off neither burn nor break.
8. A save after a plank wall is breached keeps the breach (same gaps, two parts), the door off its hinges and the burnt
   shack; a save from before brings all of them back whole; the breach is walkable after the load.
Also: `selftest` in full twice on fresh pages, `scenario name=stress` not regressed, under 150 draw calls, 0 `ip-lint` deny.
