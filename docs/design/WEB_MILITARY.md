# WEB_MILITARY — the Federal Remnant's outpost, its soldiers and its vehicles (web engine)

**Status:** SHIPPED 2026-10-22 in the three.js engine (`web/`). Rows: `web/src/data/bases.js` (the base),
`web/src/data/society.js` (the `remnant` faction row, the `trespass` verb), `web/src/systems/vehicles.js` (the `patrol`
and `apc` rows), `web/src/systems/combat.js` (the `rifle` row), `web/src/data/items.js` (the `soldier` loot table).
Code: `web/src/systems/bases.js`, the bodies in `web/src/systems/vehiclebodies.js`. Agent command `base` (plus `map`,
`spawn kind=soldier`, `spawnVehicle type=patrol|apc`), five selftest checks "base: …".

## 1. Overview

The Federal Remnant is the old government's ghost (docs/WORLD_PILLARS.md, docs/design/LIVING_WORLD_DSOA.md: curfews,
checkpoints, armour, lawful bounties). Its first post on the map is **OUTPOST NINE**, a fenced compound on open sand in
the north-west Glass Flats:

| Thing | Where (world x, z) | What |
|---|---|---|
| Origin | (−292, −397) | every row in the base is in metres from here |
| Fence | x −324..−260, z −427..−367 (64 × 60 m) | chain-link on posts, razor wire coiled along the top |
| Gate | x −304 on the south run, 9 m wide | a booth, a raised boom, both leaves swung open, a WARNING / FEDERAL INSTALLATION sign |
| Spur road | x −308..−300 from DEAD MAN RD (z −327) to the gate | gravel, two ruts, a concrete-barrier chicane |
| Towers | (−320.5, −423.5), (−263.5, −423.5), (−320.5, −370.5), (−263.5, −370.5) | open deck 4.6 m up behind a parapet, a searchlight, a ladder |
| Barracks | (−308, −415), 20 × 10 m | double wooden door, five windows, eight bunks, two footlockers |
| Command post | (−286, −416), 12 × 8 m | steel door, five windows, map table, radio desk, filing cabinet; generator and antenna mast outside |
| Armory | (−313, −393), 9 × 7 m | no windows, **one steel door, locked**, rifle racks, three ammo crates |
| Motor pool | (−273, −385), 14 × 10 m | a side door, a 6 m open bay, workbench, tool chest, engine stand, a stripped chassis; the apron in front parks a **PATROL TRUCK** and an **ARMORED CARRIER** |
| Yard | | a helipad with a burned-out helicopter on its side, two tents, sandbag walls, three floodlight masts, the old flag on its pole, a fuel tank |

The lot was picked by survey: zero static boxes in an 84 × 76 m footprint, clear of the six raider camps (the nearest is
270 m away), the Thrill Show, the Dunes, water, the Iron Line (x −360, 36 m west of the fence) and the road grid.

Twelve soldiers hold it: five posts (two at the gate, the armory door, the command-post door, the motor pool), four
sentries on the tower decks and three on patrol (two round the inside of the wire, one through the yard). The
**trespass rule** decides when they shoot you; at night the **searchlights** decide when they see you.

## 2. Player Fantasy

*You come up the spur road at dusk and the first thing you see is the wire: a long glint of razor coil, a lit booth, a
flag nobody else flies any more. The guard at the gate raises his rifle and says it once: "Federal installation. Turn
around." You can walk away. You can stand there and count. Or you come back at two in the morning on your belly, timing
the searchlight that crawls across the yard, pick the armory's lock without a sound, and leave with a ruck full of
ration packs and a first-aid kit. If you are someone the Remnant trusts, the same guard just nods you through. If you
are someone it hates, it never gets as far as words.*

| If you love… | You should feel… |
|---|---|
| GTA2 | a place that is fine until you push it, and then the whole place turns on you at once |
| Project Zomboid | a hard target worth planning: the night, a crouch, quiet tools, a loud mistake |
| 28 Days Later | soldiers who are not your friends, behind wire, under lights |
| Autoduel / Car Wars | an armoured carrier in the motor pool, if you can get it out of the gate |

## 3. Detailed Rules

### 3.1 Building the base (boot, before the nav grids)
- The base is ONE row in `BASES` (data/bases.js). `systems/bases.js` builds it right after the jumps and before the
  nav grids, so every solid is in the walk and drive grids. All positions are local to the row's origin; bases are not
  rotated.
- **Geometry:** every wall, floor, tower, prop, piece of furniture and box goes into ONE merged, vertex-coloured mesh
  (casts and receives shadows); the roofs are ONE InstancedMesh (so a building's roof pieces hide when you walk in);
  the chain-link and the gate sign are ONE alpha-tested mesh cut from a canvas atlas (no shadow pass: a solid panel's
  shadow would lie); the lights are two additive InstancedMeshes (ground pools, searchlight beams).
- **The fence and the tower skirts are see-through walls:** a static box whose whole length is a window `hole`
  (engine/collision.js). Walkers, cars and the nav grids meet it as a wall; sight (`RAY_SIGHT`) and rounds
  (`RAY_BULLET`) pass through; a thrown thing passes only above the wire (`sill` = the fence height).
- **Enterable buildings** are cut the way world/city.js cuts the town's: wall spans with door gaps (a single door 1.9 m,
  a double 2.6 m, both centred on the 1 m walk grid) and window notches (`WINDOW` rows), one collision box per span with
  its windows as holes. Their door leaves and glass are rows appended to `world.doors` / `world.windows` before
  `systems/interiors.js` hangs them (kind `base`), and their records join `world.buildings` (district `base`) with a
  `setRoof` hook, so the roof cut-away, the door kick, the lock, the window crack and the HUD name toast all work as in
  town. A building record lists only its **unlocked** ways in; the armory lists none (sealed by design).
- **Boxes** (`row.boxes`) are static boxes tagged `milbox` and containers registered through `inventory.place()` once the
  inventory exists (`placeBoxes`), loot rolled from `LOOT[table]` the first time anyone opens one: the armory's three
  ammo crates and the barracks' two footlockers roll `military`, the filing cabinet `office`, the tool chest `garage`.
  No base furniture is ever tagged `crate` or `shelf`, so `inventory.placeFurniture()` never gives a base box a home
  or shop table.
- **The lot is cleared:** the world's loose rubble and boulders (visual only, no collision) inside the wire + 6 m and
  along the spur road are hidden at boot (`clearLot`).
- **The map:** the compound is painted on the minimap at boot; the big map (M) marks it with an olive star and its name
  (red while the post is on alarm).

### 3.2 The soldiers
- Faction `soldier` on the character, `fid` `remnant`. Spawned last in `populate()` from the base's own seed, so nobody
  else in the world moves. Each gets a random name and a real flag (US about 77%, the rest from the flag table), the
  soldier wardrobe (helmet, vest or pack, olive and faded tan), 140 hp, a **service rifle** (80%) or the SMG (20%), and a
  30% chance of one grenade.
- **Posts:** a soldier walks back to his post along the walk grid and stands there, looking about his `face`.
  **Towers:** a sentry is *perched*: drawn on the deck (`perchY`), never moved by the AI, a crowd shove or a door; he
  turns and shoots from up there and dies there. **Patrols:** walk their loop leg by leg (each leg planned on the walk
  grid, re-planned if they stall), spread evenly round it.
- In a fight they are ordinary AI (`ai.js`): they shoot whoever their faction is at war with (relation ≤ −50: the
  Dustwolves and the infected) and whoever holds a grudge against them. Out of a fight `ai.js` hands them to
  `bases.think()`.
- On the alarm, soldiers who can't see you close on where you were last seen (run, inside their 90 m leash); when the
  post stands down they walk back to their posts and routes.

### 3.3 The trespass rule (`bases.watch`, every frame; a sight check every 0.2 s)
States: **calm → warned → hostile → calm**. "Inside" means the player (or the car they are in) is inside the fence
rectangle. "Seen" means some living soldier is within the spot range (§4 F1) with line of sight.
1. **Calm**, seen inside: the Remnant's tier toward you decides.
   - *friendly or allied:* waved through: one line ("You're on the list. Go ahead."), `baseCleared`, nothing else.
   - *hostile or hunted:* seen anywhere within 30 m of the wire: the alarm at once (why `enemy`).
   - *a warning less than 120 s old:* the alarm at once (why `returned`, "You were told once.").
   - *otherwise:* **the warning**: the soldier who saw you says "Federal installation. Turn around." (a subtitle and a
     `baseWarning` event), and the post goes to *warned*.
2. **Warned:** every soldier within 45 m stops, turns and aims at you (they hold fire). Six seconds inside the wire
   (counted only while you are inside) → the alarm (why `stayed`, "Contact! Open fire!"). Back outside for 4 s → the
   warning is heeded (`baseCalm` why `heeded`); its 120 s memory stays.
3. **Anywhere but hostile:** a soldier with a grudge against you (you hurt one) → the alarm (why `attacked`). A noise you
   make inside the wire or within 18 m of it, heard by a soldier inside its radius (a gunshot 45 m, a grenade 80, a
   door kick 30, smashed glass 22, a crowbar on a lock 18; lockpicks make none) → the alarm (why `shots`). A friendly
   player gets one "Cease fire inside the wire!" first.
4. **The alarm:** every soldier takes a grudge (leash 90 m); those within 75 m with a clear line take you as their
   target at once. A siren winds three times; the toast reads `OUTPOST NINE: ALARM`; the searchlights swing onto you;
   a `baseAlarm` event says why. Unless it was `enemy`, a `trespass` deed is recorded at your feet: the soldiers who
   saw it carry the word to the Remnant (§4 F4).
5. **Hostile → calm:** 45 s out of the wire's 30 m margin and out of sight (3 s once you are dead): grudges and targets
   on you are dropped, `baseCalm` (why `lost` or `down`).

### 3.4 Night
- The four searchlights sweep the quarter of the yard their tower watches, from along one fence run to along the other,
  the pool sliding in and out (§4 F5). On the alarm each beam whose tower is within reach tracks the player.
- The floodlight masts throw fixed pools (r 10–11 m) round the yard, the apron and the tents.
- Both are additive instances faded by the sky's night factor, and hidden by day. **No real THREE lights are added**
  (the light count stays fixed: AGENTS.md invariant 3).
- A sentry sees far less at night (15 m standing, 9 m crouched) but 40 m into a pool of light (§4 F1, F2).

### 3.5 The Federal Remnant (faction row `remnant`)
Archetype `military`, olive (`#7a8456`), starts at −5 (neutral). At war with the Dustwolves and the infected (−100),
wary of Rust Haven (−20), indifferent to drifters (0). `stars: false`: they keep their own law and never raise Rust
Haven's wanted stars. Values: kill −10, hurt −3, carjack −5, steal −4, destroy −4, rob −5, silence −8, betray −9,
**trespass −6** (all `:self`); killing their enemies +0.8; killing Rust Haven's people −1.5 and drifters −2 (order
matters to them); rescue +2, deliver +5, defend +5, pay +2. Hunters: up to five **Remnant Troopers** (rifles 75%, SMGs
25%, 140 hp) when the director's anger test passes. Home place `outpost_nine` (the ground inside the wire). No `sim`
row: the outpost is a fixed garrison outside the off-screen war (§5). The HUD's respect chip reads REMNANT (`short`).

### 3.6 The vehicles (VEHICLES rows, generic by design: no make, model or designation)
- **PATROL TRUCK** (`patrol`): a high-riding four-door armoured utility truck: flat hood, slab fenders, winch bumper
  and brush guard, a canvas-topped cargo box, the spare on the tail, big tyres, ballistic glass (75 hp a pane), and a
  ring mount on the roof whose seat (`gunner`, exposed, standing in the cab with head and shoulders out of the hatch)
  shoots like the pickup's bed. Five seats.
- **ARMORED CARRIER** (`apc`): an eight-wheeled hull with a long sloped glacis, the driver's cupola (its "glass" is four
  armoured vision slits, 320 hp each), a small turret, roof hatches, stowage bins, a rear ramp; seven seats, one of them
  the turret hatch (exposed, standing). Heavy truck springs (`springs: 'rig'`).
- Both are parked in the motor pool, keys in, nobody at the wheel; `spawnVehicle type=patrol|apc` makes more anywhere.
  A seat row may carry its own body-frame position (`at`); a vehicle row may name its springs.

## 4. Formulas

| # | Name | Formula | Variables / range | Example |
|---|---|---|---|---|
| F1 | Spot range | `R = lerp(spotDay, spotNight, n) · m`; then `R = max(R, spotLit)` if lit | `n` the sky's night factor 0..1; `m` 1.6 in a vehicle, 0.6 crouched, else 1; spotDay 48, spotNight 15, spotLit 40 (m) | noon standing 48 m; 23:00 standing 15 m, crouched 9 m, in a car 24 m; 23:00 in a beam 40 m; noon in a car 76.8 m |
| F2 | Lit | lit if `n ≥ 0.3` and `dist(p, pool) < r · k` for any pool | `k` 1.1 for a searchlight pool (r 3.4), 0.75 for a floodlight's (r 10–11) | 3.7 m from a beam's centre is lit; 9 m from a floodlight mast (r 11) is not (cut-off 8.25 m) |
| F3 | Warning clock | alarm when `t_inside ≥ grace`; heeded when `t_outside ≥ warnLeave`; a re-entry with `t − t_warn < warnMemory` alarms at once | grace 6 s, warnLeave 4 s, warnMemory 120 s; `t_inside` counts only time inside the wire | walk in at 0 s: warned ~0.2 s, alarm ~6.2 s. Walk out at 3 s, back in at 60 s: alarm on sight (`returned`) |
| F4 | Standing cost of a trespass | `Δ = clamp(v · m · learn, −60, 60)`, once per alarm, when the first witness's word lands | `v` = −6 (`trespass:self`), `m` = 1, `learn` = cohesion 0.85; delay `U(15, 35) · clamp(far/200, 0.5, 2)` s, `far` = witness to hub | −6 · 1 · 0.85 = −5.1 after 7.5–17.5 s: neutral −5 becomes −10.1, wary |
| F5 | Searchlight sweep | heading `h = lerp(a0, a1, u)`, `u = ½ − ½·cos(2πt/P + φ)`; reach `d = lerp(d0, d1, ½ + ½·sin(0.37t + φ))`; the pool slides to its target at 7 m/s (16 on the alarm) | `P` = sweepPeriod 16 s, `φ` = 1.9 × tower index, `[d0, d1]` = beamReach [11, 24] m, `[a0, a1]` the row's sweep | NW tower `[π/2, 0]`: at `u` = ½ it points south-east (`h` = π/4) |
| F6 | Beam and pool shape | pool ellipse `rx = r`, `rz = r · (1 + 0.04 · far)`; beam cone from the lamp (5.5 m up) to the pool centre, `0.9 r` wide at the ground; opacity pools `min(1, 0.95 n)`, beams `0.2 n`; hidden when `n ≤ 0.04` | `r` = beamRadius 3.4 m, `far` = lamp-to-pool distance | far 24 m: a 3.4 × 6.7 m pool; noon: zero draw calls |
| F7 | Engage | on the alarm: grudge for every living soldier; target now if `dist < engage` and line of sight; reaction `0.25 + U(0, 0.5)` s | engage 75 m, leash 90 m | walked in through the gate: 7 of 12 engaged at once, all 12 hostile (measured) |
| F8 | Stand-down | calm when `t_gone > calmAfter` (or `> 3` s once dead) | calmAfter 45 s; "gone" = outside the wire's 30 m margin and unseen | run out of the gate and hide: calm 45 s later |
| F9 | Hull damage | `hp −= dmg · armor` (rounds that hit a car; glass first, then the occupants behind broken glass) | patrol armor 0.2 / 330 hp; carrier 0.06 / 720 hp | a service-rifle round (24): 4.8 to the truck (69 rounds), 1.44 to the carrier (500 rounds) |
| F10 | AI aim | aim error `U(−s/2, s/2)`, `s = 0.1 + 0.006 · d (+0.1 if the target moves)`, plus the weapon's own `U(−spread, spread)` | `d` metres; rifle spread 0.035 rad | 40 m at a running player: `s` = 0.44, so up to ±0.22 + ±0.035 rad |

## 5. Edge Cases

- **Friendly, then a shot:** one "Cease fire inside the wire!", then the alarm on the next one. A friendly player who
  hurts a soldier is shot anyway (the grudge rule has no exception).
- **Hostile standing:** any sentry who sees you within 30 m of the wire raises the alarm; every Remnant soldier anywhere
  shoots on sight anyway (faction hostility, ai.js); the director can send Remnant Troopers after you.
- **Warned, walked out, came back inside two minutes:** no second warning (`returned`). After two minutes: a fresh
  warning.
- **In a car:** the car's position counts, it is seen 1.6× as far, the fence stops it (a rammed fence never breaks),
  and the chicane makes you slow down for the gate.
- **Sneaking in:** crouched at night out of the pools a sentry sees you from 9 m: you can cross the yard between beams;
  a beam or a floodlight pool shows you from 40 m. Glass and chain-link hide nothing; walls, closed doors, boards,
  sandbags and smoke do.
- **The armory:** three kicks open it, each a 30 m noise: any soldier within 30 m brings the post down. A crowbar is an
  18 m noise; lockpicks are silent (the stealth way in). Shooting the lock off is a gunshot.
- **A soldier killed without a sound or a witness:** nothing happens until somebody sees you or finds a grudge (soldiers
  within 30 m of a hurt friend take one). A gunshot always carries 45 m.
- **Every soldier dead:** no warnings, no alarms; the boxes and vehicles are free; nobody refills the garrison (yet).
- **The player dies during the alarm:** the post stands down 3 s later and walks back to its posts.
- **Save/load mid-alarm:** the alert, warnings and posts come back (soldiers are re-attached by id); a hostile post takes
  its grudges again quietly. A save from before bases loads with the soldiers on their boot posts.
- **A tower sentry:** never steps off the deck; nobody walks or drives in under a tower (its skirt is solid to movers,
  see-through to sight and rounds); killed, he lies on the deck.
- **Raiders or the infected at the wire:** the soldiers fight them on sight; Rust Haven wardens (wary) are left alone.
- **`inventory.placeFurniture()`:** never touches a base box (tag `milbox`, no `crate`/`shelf` furniture inside); the
  selftest checks the only containers inside the wire are the base's own, bodies and ground piles.
- **"Every building interior walkable" (selftest):** the armory lists no ways in (its only door is locked) and is
  skipped; the barracks, command post and motor pool are checked like every town building.
- **Weather:** dust storms and fog do not shorten a sentry's sight yet (open question 2).
- **Day:** the light meshes are hidden (no draw calls); they fade in with the night factor at dusk.
- **The faction sim:** the Remnant has no `sim` row, so no off-screen skirmishes, recruits or lost places; `outpost_nine`
  stays theirs. Adding a `sim` row would put them in the daily war with the Dustwolves (open question 1).

## 6. Dependencies

| Doc / system | What it needs from this | What this needs from it |
|---|---|---|
| `web/src/main.js` | constructs `Bases` after the jumps and before the nav grids; calls `populate()`, `placeBoxes()`, `update()`, `onNoise()` | the construction order (statics before the nav grids, rows before Interiors) and the frame loop |
| `web/src/world/city.js` | `setRoofVisible` honours a building's `setRoof`; `props` exposed so a set-piece can clear its lot | `world.buildings`, `world.doors`, `world.windows`, `world.props`, the minimap canvas |
| `web/src/systems/interiors.js` + `data/interiors.js` | door rows of kind `base` (leaves, the locked steel door) and window rows | leaves, locks, kicks, the locked door's nav block, glass; `DOOR_MATERIALS.metal` (the steel door), `WINDOW` sizes |
| `web/src/engine/collision.js`, `engine/nav.js` | see-through walls (a full-length `hole`) for the fence and tower skirts | holes honoured by SIGHT and BULLET rays; boxes rasterised into the nav grids |
| `web/src/systems/ai.js` | the soldier hostility rule (faction relations), perched sentries, the `think()` hand-off | the fight loop, `move()`, scan, grudges |
| `web/src/systems/factions.js`, `data/society.js`, `systems/deeds.js` | the `remnant` row (and `short`), `soldier` → `remnant`, the `trespass` verb | tiers decide the rule; the witness pass and rumors carry the trespass |
| `web/src/systems/society.js`, `systems/director.js` | the place `outpost_nine`; the hunters row (Remnant Troopers) | places by rectangle; hunters by anger |
| `web/src/systems/inventory.js`, `data/items.js` | `TRUNK` for both vehicles; the `soldier` loot table | `place()` / `open()` / `roll()`; the `military`, `office` and `garage` tables |
| `web/src/systems/vehicles.js`, `vehiclebodies.js`, `stunts.js`, `carcombat.js` | the `patrol` and `apc` rows and bodies; seat `at`; row `springs` | the driving model, glass layouts (`GREENHOUSE`), lamps, damage parts |
| `web/src/systems/characters.js`, `combat.js`, `audio.js` | the soldier wardrobe, `perchY`; the `rifle` row; the rifle report and the siren | instanced bodies (the rifle model), hitscan, synthesized sound |
| `web/src/ui/qol.js`, `ui/hud.js` | the base on the big map; the chip's short name | the map canvas; subtitles, toasts, respect chips |
| `web/src/agent/api.js` | the `base` command, `map` bases, `spawn kind=soldier`, save/load, five selftest checks | the command table, snapshot/restore, the selftest harness |
| docs/WORLD_PILLARS.md, docs/design/LIVING_WORLD_DSOA.md, docs/LORE_BIBLE.md | the first playable Federal Remnant: a post, its law at the wire, its soldiers | who the Remnant are (curfews, checkpoints, armour, lawful bounties, "they may save a town and then conscript everyone in it") |
| docs/design/WEB_WORLD_MEMORY.md | a new verb (`trespass`) and a fifth faction with a full values table | the standing formula (§4 F4), tiers, witnesses, rumors, the director |
| docs/design/WEB_FAN_SERVICE_BIBLE.md | our own names only (OUTPOST NINE, PATROL TRUCK, ARMORED CARRIER, SERVICE RIFLE, Remnant Trooper); THE CORDON and PAPER LADDER can build on these soldiers | the IP wall and the lint |
| docs/design/WEB_INVENTORY.md | five more `military` containers and the `soldier` table | the loot tables, lockpicks and the crowbar on the armory |
| docs/design/WEB_JUMPS.md | `springs` on a vehicle row (the carrier rides on truck springs) | the suspension model |

## 7. Tuning Knobs

`BASE_RULES` and `TOWER` in data/bases.js; the rows themselves; the faction row in data/society.js.

| Knob | Value | Safe range | Affects |
|---|---|---|---|
| grace | 6 s | 3–12 | how long you can argue at the wire |
| warnMemory / warnLeave | 120 s / 4 s | 60–600 / 2–10 | when a second visit gets no words |
| calmAfter | 45 s | 20–120 | how long a post stays up after you vanish |
| shotMargin / nearMargin | 18 m / 30 m | 10–40 / 15–60 | how close a shot counts; how close a hated player is shot on sight |
| spotDay / spotNight / spotLit | 48 / 15 / 40 m | 35–60 / 8–25 / 25–50 | the night raid's difficulty |
| crouchMul / vehicleMul | 0.6 / 1.6 | 0.4–0.8 / 1.2–2.5 | how much a crouch or a car matters |
| engage / leash / hunt | 75 m / 90 m / 1.6 s | 50–100 / 60–150 / 1–3 | how hard the post comes for you |
| sweepPeriod / beamReach / beamRadius | 16 s / [11, 24] m / 3.4 m | 10–30 / 8–30 / 2.5–5 | how often a beam crosses a spot, and how big it is |
| hp / weapons | 140 / rifle 0.8, smg 0.2 | 100–200 | how long a firefight lasts |
| TOWER deck / lamp | 4.6 / 5.5 m | 4–7 | the beam's look; the sentry's height on screen |
| Row content | posts, patrols, boxes, vehicles | any | who stands where, what there is to take |
| `remnant` start / cohesion / `trespass:self` | −5 / 0.85 / −6 | −20..10 / 0.5–1 / −3..−12 | whether a stranger is warned or waved through; what a trespass costs |
| `rifle` row | 24 dmg, 0.12 s, 30 rds, 68 m, spread 0.035 | dmg 18–30 | how dangerous the post is |
| `patrol` / `apc` rows | maxSpeed 37 / 26, accel 17 / 10, hp 330 / 720, armor 0.2 / 0.06 | — | getaway speed against staying power |

## 8. Acceptance Criteria

Run from `web/` against your own instance (`DL_URL=http://localhost:<port>`, see AGENTS.md). Each item passes or
fails; the selftest only counts `true`.

1. **Selftest** (fresh page, twice in a row): every check green, including these five:
   - *base: the chain-link stops you on foot and a car at speed, but not sight or a round; the way in is the gate* —
     your keys walk you into the east run and you stay outside; a sedan driven into it at 13 m/s stops outside; the
     walk grid's path from outside goes through the gate; a SIGHT ray and a BULLET ray cross the fence.
   - *base: a sentry warns you once inside the wire, stay and the post opens fire; a Remnant-friendly player is waved
     through; a shot inside brings it down at once* — on your own keys through the gate at neutral standing: exactly one
     `baseWarning` and nobody hostile; grace + 1 s later the alert is `hostile`, ≥ 6 soldiers hostile, `baseAlarm` why
     `stayed`; at standing 40 the same walk gets `baseCleared` and no warning; at neutral, inside, one pistol shot gives
     `baseAlarm` why `shots`.
   - *base: the armory is a locked steel door that holds you, and its ammo crates roll military loot* — walking into it
     leaves you outside with the leaf shut and the lock on; it is `metal` (the steel door, 3 kicks); its three crates are
     `military` containers and every item they roll is on the `military` table; the armory lists no unlocked way in;
     and no other container inside the wire carries a home or shop table.
   - *base: the motor pool parks a PATROL TRUCK and an ARMORED CARRIER; both are vehicle rows that spawn anywhere and
     drive* — both parked at the base; spawned on open sand, 2.5 s of full throttle moves the truck > 14 m and the
     carrier > 8 m.
   - *base: at night the searchlights sweep and the floodlights burn; a sentry picks you out further in a beam than in the
     dark* — the light meshes are on at 23:00 and off at noon; a pool moves > 1 m in 4 s; 25 m from the north-west tower's
     sentry you are not seen in the dark and are seen under its beam.
2. `node tools/dl.mjs base` answers with the alert, twelve soldiers, four doors (the armory's `locked: true`), seven
   boxes, two vehicles and four searchlights; `base action=alarm` and `action=calm` change the alert.
3. `node tools/dl.mjs spawnVehicle type=patrol` returns `"name": "PATROL TRUCK"`, `type=apc` returns
   `"name": "ARMORED CARRIER"`; `spawn kind=soldier` returns a soldier whose `faction` is `soldier`.
4. **Perf:** `perf` with the camera in the base stays under 150 draw calls by day and at night (measured 68/69 by day,
   71–74 at night); `scenario name=stress` does not regress.
5. **IP:** `node tools/ip-lint.mjs` prints `0 deny`.
6. **Art law:** no colour in the base, the soldiers, the vehicles or the faction row has a hue in 270–320 (no purple);
   every soldier carries a real flag (`base` lists each one's `flag`).

**Open questions for Robert:** (1) should the Remnant join the off-screen war (a `sim` row: daily skirmishes with the
Dustwolves, recruits, places to lose)? (2) Should dust storms and fog shorten a sentry's sight? (3) Should the post
refill its dead over the days, and should a stolen ARMORED CARRIER send Remnant Troopers after it?
