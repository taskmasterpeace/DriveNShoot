# WEB — THE FOUND THINGS

**Status:** v1 built 2026-10-29 on `feat/web-fan-nods`. **Engine:** the three.js web engine (`web/`).
**Rows:** `web/src/data/fannods.js`. **Run:** `web/src/systems/fannods.js`. **Agents:** `web/src/agent/fannods-api.js`
(the `fannods` command and nine named checks, `selftest only=fan nods`).
**Renders:** `docs/renders/web/fan-nods/` (the amber and the green glass rooms, the case on a shop floor, the bones in the
ditch, the convoy open on the shoulder and its counter close up, the burning rain over Rust Haven, a calendar on a command
room's wall).

---

## 1. Overview

Robert: "Low code stuff. And not just words." Eight rare, physical things a player may come across and stop to look at.
None of them explains itself. There is no sign, no note, no line of dialogue and no item text that says where an idea came
from. Each one is an object or a place, built as rows in a system that already exists.

| # | The thing | Where it lives | System it is a row of |
|---|---|---|---|
| 1 | A six-sided room of thick tinted glass | the bottom level under six sealed military bases, one per region | the underground's rooms and props (`data/underground.js`, `world/undergen.js`, `systems/underlook.js`) |
| 2 | A glass display case: a long cap-and-ball revolver with a shot barrel under it, and a silver-topped cane with a blade inside | rarely on a shop's sales floor in the Phoenix ring | ring furniture (`data/ring.js`, `data/floorplans.js`, `world/ring.js`), weapons, rounds, melee |
| 3 | A broad, heavy, single-edged jungle blade | beside bones in three of the interstate's ditches | melee rows, a ring box (`systems/inventory.js`) |
| 4 | A lapel counter that ticks near hot ground | rare military, hospital and lab loot | items, the hot ground's zones (`data/hotground.js`) |
| 5 | An armoured trade convoy | out on the interstate, rarely | a semis freight run (`systems/semis.js`), the trade counter (`systems/trade.js`), decks |
| 6 | A burning orange-green rain | the sky, rarely | a weather row (`systems/sky.js`) |
| 7 | Calendars left on January | sealed offices and command rooms below ground | the underground's levels (a hash, not a roll) |
| 8 | A self-heating meal | military and bunker loot, the convoy's stock | items, a short timer |

## 2. Player fantasy

- Two levels under a sealed base, behind a door like every other door, there is a room with a glass chamber in the middle.
  It is amber in one base and bottle green in another. The keypad by its door is dead and the floor inside is burnt black.
  It hums when you stand close. Nothing happens. You leave, and you remember it.
- On the floor of a shop in the city there is a case under glass. Behind the glass there is a revolver with a barrel too many and a
  black cane with a silver knob. You break the lid and take them both. The revolver is slow to load. The cane is a cane
  until you hold the swing.
- In the ditch past the shoulder a skeleton lies face down. One arm is out toward a heavy blade lying in the gravel.
- The counter clipped to you starts to tick before you can see anything wrong with the ground ahead.
- Three plated rigs with slits cut along their trailers come up behind you, with guards riding on the roofs. They pull
  onto the shoulder ahead of you, a side lets down, and somebody sells you fuel and rounds at fair prices. Then they close
  up and roll on.
- The sky goes the colour of a bad bruise healing, yellow-green and orange. The rain stings. Everyone with sense is
  already running for a door.
- On an office wall below ground there is a calendar turned to January, still waiting for somebody to turn the page.
- You pull a tab on a meal pouch, it hisses, and half a minute later you have a hot meal in a dead country.

## 3. Detailed rules

### 3.1 The tinted-glass room
- **Where:** `GLASS_ROOMS` holds six rows, each naming a *sealed* `data/milbases.js` base in its own region (southwest,
  southeast, northwest, mountain, plains and northeast), each with its own tint.
- **How it is built:**
  - `world/undergen.js` puts a `glassroom` room first in the bottom level's programme of any site whose `base` has a row.
    That covers the atlas's own `base_<id>` sites and a stamped base's `mb_<id>` site alike.
  - The room is 9-11 m on a side. It holds a `glasshex` prop in the middle and a `deadconsole` against a wall.
  - The room has no loot table and no log.
- **The chamber** (`hexPanels`, pure, shared by the look and the colliders):
  - Six panels round the middle, corners every 60 degrees, `r` = 2.4 m.
  - The side facing -z is the doorway. Its glass leaf stands swung out on its hinge.
  - **Look** (`systems/underlook.js`): each panel is a thick tinted slab on a steel sill under a steel head, with a post at
    every corner. A dead keypad sits on the door post; it is a strip that `paint` never lights. The floor scorch is a ring
    of dark plates, blackest at the centre.
  - **Colliders** (`systems/underground.js promote`): three small square boxes along each slanted panel and one long box
    for the level panel, tagged `ug-glass`. That tag is steel to a round (`data/materials.js`): thick glass, so a shot
    glances off. The door side has only its two posts.
- **The hum:** `systems/fannods.js` checks twice a second for a chamber on the level under your feet. Within `hum` m it
  plays a 55 Hz tone with a faint octave every `humEvery` s, louder the nearer you are.
- **It does nothing else:** no teleport, no loot, no event past `glassHum`.

### 3.2 The glass case, the revolver and the cane
- **The case** (`FN_CASE`, in `data/ring.js FURNITURE` as `glasscase`) is a dark wood cabinet with a framed lid over red
  felt. On the felt you can see, from above:
  - the revolver: a long barrel, the fatter barrel under it, the cylinder and a wooden grip;
  - the cane: a black shaft and a silver knob.
- **Where:** `data/floorplans.js` ROOMS `sales` carries `rare: [['glasscase', 0.02]]`: a few of the Phoenix ring's ~400 shop
  sales floors (a pawn shop's front), about six. Never on the island: its furnisher (`world/furnish.js`) sets `noRare`, so
  the start town is exactly as it was.
  - `world/ring.js` reads `rareRoll(seed, room, piece)`, a hash of the room's corner. It never uses the furnishing rng, so
    no other room in the world is laid out differently.
  - The case goes first in its room's list, so it finds a wall.
- **Its box** is `fn_case`, an `all: true` table: each row once, with no roll (`systems/inventory.js roll`). It holds the
  revolver (in good condition, unloaded), the cane and 9-18 charges of ball and caps.
- **The revolver** (`percussion`, `FN_WEAPONS`) has nine chambers and loads a ball, a pinch of powder and a cap per chamber,
  so a reload takes 4.2 s.
  - **BALL mode:** a .44 lead ball (`ball44`): slow, heavy, no casing.
  - **SHOT BARREL mode:** nine pellets of loose shot (`capshot`), a wide cloud, 18 m reach.
  - Both modes draw on one box, `ammo_capball` (lead, powder, caps and shot).
- **The cane** (`sword_cane`): `systems/melee.js` reads `FN_MELEE_CARRY` before the knife.
  - A tap raps with the knob (`cane`: a knock, a push).
  - Holding the button past `heavyAt` draws the blade in the same motion (`caneblade`: reach 1.6 m, narrow arc, bleed).
    It replaces the kick.
  - With a gun raised it is the gun butt and the kick, as ever.

### 3.3 The jungle blade
- **Where:** `DITCH_BONES` holds three rows. Each sits at a share of the interstate's length, on a side, set metres (about 3) past
  the outer shoulder edge (`W.section(s).out`).
- **When you come near:** within `near` m, `systems/fannods.js` registers a ring box `fn:<id>` (`fn_ditch`, `all`: the
  blade). It draws a skeleton face down: the skull, the ribs, the hips, the legs, one arm out, and a rag of coat. The
  blade lies in the gravel by the hand, and once taken it is no longer drawn. Past `far` m the box is written back
  (`ringKept`), so what you took stays taken.
- **The blade** (`jungle_blade`, `jungleblade` strike) is heavy at the tip: a slow wind-up, a wide arc, 40 damage, bleed
  and a knock. It keeps the kick as its held strike.

### 3.4 The lapel counter
- **The item:** `lapel_counter`, a tool. Carrying it is the whole switch.
- **Its rate** (`rateAt`), against every `HOT_GROUND` zone:
  - It is silent more than `reach` m outside the edge.
  - Inside that, from the outer edge of its reach to the zone's edge, it rises from `rate[0]`.
  - Inside the zone it rises toward `rate[1]` with the zone's dose times its nearness^1.5, the same shape as the body's
    own count.
- **The sound:** ticks come at that rate, uneven, as 8 ms high-pass clicks at `vol`.
- **Found:** rarely in the military, `mb_hospital` and `ug_lab` tables.

### 3.5 The armoured trade convoy
- **The run:** `CONVOY.rigs` (three box rigs, plated paint) is folded into `FREIGHT.rigs.armoured`. The convoy *is* a
  semis freight run, so it drives the real interstate, holds formation and despawns far away like any other freight.
- **The roll:** every `every` s, while you are out on the interstate and no freight is running, there is a `chance` it
  rolls in from behind.
- **The guards:** two ride each trailer's roof on a `CONVOY_ROOF` deck (`decks.mount`, `load`), armed with rifles. They
  stay up there while it halts and while it rolls on.
- **The look:** four plate panels over each trailer's roof (what the top-down camera sees), a plated band and four slits
  along each side, all drawn each frame in the trailer's own world matrix (so they ride its pitch on the fifth wheel).
- **The stop:**
  1. Within `halt` m of you, the run's `halt` and `pull` flags are set (two small hooks in `systems/semis.js`: `lanePoint`
     takes a `pull` offset, and `aiDrive` stops the lead and closes the rest up behind it). It steers onto the shoulder
     and stops.
  2. When all rigs have been below 0.6 m/s for 1.5 s (or after 40 s), every rig holds (`F.hold`: brakes on) and the middle
     trailer's side lets down into a flap counter on the
     shoulder side, away from traffic. A trader stands there: npc `fn_convoy`, a `TRADERS` row with broad deals and a
     pistol.
  3. `boxes` boxes of `fn_convoy` stand behind the flap, owned by the trader. That is real stock: fuel, rounds, water,
     food, bandages, parts, rolled once like every shelf and sold at `trade.js` prices.
  4. After `stay` s, or `leave` s after you walk off, or if the trader dies, the trader climbs back in, the boxes go, the
     flap closes, and the run rolls on down the same road.

### 3.6 The burning rain
- **The row:** `WEATHER.SICKSKY`, labelled `BURNING RAIN`.
  - Fog tint `#9c8f2c` (hue 53), clouds 1, rain 1.35, a little storm.
  - It has its own `burn` key, eased like the rest but kept outside `BLENDED` so no other row needs it.
  - The rain's lines go yellow (`#d8c440`) as `burn` rises, and the sky fill and the sun are pulled toward an orange-green
    light (`#c8a830`, hue 46).
- **Rare:** it is never in `ORDER`. Each weather change has a `SICK_SKY.chance` of bringing it instead.
- **What it does:**
  - **Bare skin:** with `burn` past `from`, a player under the open sky takes `dmg x burn` hp a second, as `sickness`, in
    whole points. You are under the open sky when you are not below ground, not underwater, and survival's
    `shelterKind()` is `rough`. A roof, a hard-topped car and a box trailer's hold all count as shelter.
  - **The warning:** one toast a storm says the rain burns and to get under a roof.
  - **Everyone else:** once a second, the unarmed people near you who are not in a car make for the nearest door within
    40 m. They use their own flee, mirrored so it runs them toward the door.

### 3.7 Frozen calendars
- **Which rooms:** `CALENDAR.rooms` gives a share per room type: office 0.35, command 0.5, comms 0.25, guard 0.15.
- **The roll:** `calendarOn(room, doors)` hashes the room's corner. It draws no rng, so every level's layout is the same
  byte for byte except for the calendar.
- **Placement:** it hangs on the north wall at 1.55 m, facing in (toward the camera), unless the room's door is within
  1.6 m of that wall's middle; then on the wall farthest from the door.
- **The page:** drawn once on a canvas.
  - a picture of a dark ridge under a pale sky;
  - a red band with the month, JANUARY;
  - the days' initials;
  - a grid of 31 days starting on the second column.
- **No year anywhere.**
- **Draw calls:** one, on a level that has any calendars.

### 3.8 The self-heating meal
- **Using it:** `heater_meal` has the use act `heatmeal` (`systems/inventory.js act`). It spends the pouch, plays a long
  hiss, makes a 3 m noise, and starts a `wait` s timer.
- **When the timer ends:** a `hot_meal` goes into your pack (`made` now) and a toast says it is hot.
- **The hot meal:** it feeds 0.5 food and 6 hp and goes stale in 2 game hours. Its id has "meal" in it, so
  `systems/stats.js` counts it as eating well.
- **Found:** rarely in military, soldier, quartermaster and bunker guard tables, and in the convoy's stock.

## 4. Formulas (with an example)

- **The counter's rate.** Take `d` = distance to the zone's centre minus `r`.
  - Outside the edge: `k = 0.12 (1 - d/reach)`.
  - Inside: `k = 0.12 + 0.88 min(1, (dose/3) (-d/r)^1.5 1.6 + 0.05)`.
  - Then `rate = 0.6 + 13.4 k` ticks a second.
  - Example, the Fused Flat (r 44, dose 3):
    - 36 m outside the edge: `k = 0.048`, about 1.2 ticks/s.
    - 2 m from the centre (`-d` = 42): `k ≈ 0.12 + 0.88 × 1` = 1, so 14 ticks/s.
- **The rain.** `hp/s = 1.6 × burn`. At full burn that is 1.6 hp a second: a 100 hp player in the open loses half their
  health in about 31 s.
- **The convoy's rarity.** A check every 60 s at 0.06 gives about one every 17 minutes of interstate driving, and only
  when no other freight is out. The freight itself runs every 4-7 minutes, so in practice it comes about every half hour.
- **The case's rarity.** 0.02 of the ring's sales floors. With 401 of them that is about 8 expected; the real furnishing
  makes 6 (the hash decides which). The `fannods` cases action lists them.

## 5. Edge cases

- **A sealed base you never open:** the glass room is behind the blast door and the generator puzzle like everything else
  down there.
- **The glass room's level is a sealed base's bottom level:** for the atlas sites that is level 2. A stamped
  `mb_<id>` row is level 2 too.
- **The glass panels** are colliders on the level's own `UnderWorld`, so they go with the level when it demotes.
- **Two weapon modes, one box:** the shot barrel and the cylinder share the gun's nine-round count. Switching mode works
  the loaded rounds back into the pack, as every shell switch does (`arms.setMode`). A per-mode magazine is a follow-up
  (§9).
- **A convoy you board or ride:** it follows the freight's own rule: a rig with you aboard is never despawned.
- **A convoy shot up:** a dead trader closes the side early. The guards fight back like any armed drifter.
- **The rain and the dead:** the infected neither flee it nor burn (law: they don't feel it).
- **Save and load:** ring boxes are kept by the inventory's `ringKept`, so the case and the ditch stay looted. The
  convoy, the heating timer and the hum are moments, and they are not saved.
- **Golden ring hash:** the case changes the furniture of the six sales floors that get one. `data/golden.json ringPlans`
  is re-pinned on this branch (0e6b74b9, was 6bc92d8a). The island's furniture does not change.

## 6. Dependencies (both ways)

- **Reads:** `data/milbases.js` (sealed rows), `data/underground.js`, `world/undergen.js`, `systems/underlook.js`,
  `systems/underground.js`, `data/ring.js`, `data/floorplans.js`, `world/ring.js`, `systems/combat.js` WEAPONS,
  `data/ballistics.js`, `data/arms.js` MELEE, `systems/melee.js`, `data/items.js`, `systems/inventory.js`,
  `data/hotground.js`, `systems/sky.js`, `systems/survival.js` (shelter), `systems/semis.js` (freight, lanes),
  `data/trailers.js` FREIGHT, `systems/decks.js`, `systems/trade.js`.
- **Hooks added to shared files** (one or two lines each):
  - `world/undergen.js`: the glass room in the programme, `L.calendars`, `calendarOn`.
  - `data/underground.js`: the `glassroom` room and the `glasshex` and `deadconsole` props.
  - `systems/underground.js`: the `glasshex` colliders and the dead keypad's paint.
  - `systems/underlook.js`: the glass and calendar materials, `glassChamber()`, the calendar page and two batches.
  - `data/materials.js`: the `ug-glass` tag.
  - `data/ring.js`: the `glasscase` FURNITURE row.
  - `data/floorplans.js`: `rare` on `sales`.
  - `world/ring.js`: `rareRoll` and the rare push; `world/furnish.js`: `noRare` on the island's furnisher.
  - `systems/combat.js`, `data/ballistics.js`, `data/arms.js`, `data/items.js`: `Object.assign` folds of the rows.
  - `systems/melee.js`: `carried()`, the strike pick and the held strike.
  - `systems/inventory.js`: `all` tables and the `heatmeal` act.
  - `systems/sky.js`: the `SICKSKY` row, the rare pick, `burn` easing and the rain colour.
  - `systems/semis.js`: `lanePoint` `pull`, the `trailerPaint` pass-through, the `halt` and `hold` in `aiDrive` (a held rig
    brakes with no throttle: before, a target speed of zero still crept at 0.1 throttle).
  - `systems/decks.js`: a rider's perch is clamped to the vehicle's own ground, not to 0.05 m. On land below render zero
    (the interstate west of Phoenix sits about 218 m down) the old clamp put every deck rider at 0.05, far above the vehicle.
  - `main.js`: construct and update.
  - `agent/api.js`: the command and the checks.
  - `tools/ip-terms.mjs`: new deny and review terms.
- **Other systems may read:** `g.fannods.rateAt(x, z)`, `g.fannods.startConvoy()`, `g.fannods.status()`.

## 7. Tuning knobs (safe ranges)

| Knob | Default | Safe range |
|---|---|---|
| `GLASS_ROOMS` rows | 6 | 4-8 (validated) |
| `GLASS_CHAMBER.r` | 2.4 m | 2.0-2.6 (the room's mid needs side + 2.8 m) |
| `GLASS_CHAMBER.hum` / `humEvery` | 7 m / 2.6 s | 4-12 / 2-4 |
| `FN_CASE_RARE` | sales 0.02 | 0.005-0.05 (validated at most 0.2); how many cases the ring has |
| `BADGE.reach` / `rate` | 60 m / [0.6, 14] | 30-120 / max 6-20 |
| `HEATER.wait` | 25 s | 10-60 |
| `SICK_SKY.chance` / `dmg` | 0.035 / 1.6 hp/s | at most 0.06 / 0.5-3 |
| `CONVOY.chance` / `every` / `halt` / `stay` | 0.06 / 60 s / 120 m / 300 s | at most 0.1 / 30-120 / 80-200 / 120-600 |
| `CALENDAR.rooms` | office 0.35, command 0.5, comms 0.25, guard 0.15 | 0-0.6 |

## 8. Acceptance criteria (the named checks, `selftest only=fan nods`)

1. **The rows validate.**
   - Six glass rooms in six sealed bases in six regions, with no purple tint.
   - The revolver has a shot barrel and the cane a blade; every found thing has an item and a table.
   - The rain is hue 20-140 and rare.
   - Three ditches.
   - The convoy is rare, with two or three rigs.
   - Calendars only in the four room types, and no year.
2. **The tinted-glass room.**
   - It is on the bottom level of each of its six bases, on no other base and on no other level.
   - There is one door side.
   - Gone down into one: at least 10 glass colliders; you step through the open side into the middle; the far side is
     shut; it hums.
3. **The glass case.**
   - The ring's real furnishing puts at least one case in, only on sales floors, in under one in ten of them; the island has
     none.
   - Opened, it holds the revolver, the cane and the ball and caps.
   - The shot mode is nine `capshot` pellets and the ball mode one `ball44`.
   - A tap is the cane; held, the blade comes out and cuts.
4. **The jungle blade.**
   - Three ditches.
   - Standing by one: the bones are drawn past the shoulder, and the box holds the blade.
   - Carried, a tap is its chop and hits harder than a fist.
5. **The lapel counter.** It is silent out of reach, ticks slowly past the edge and fast in the middle, and says nothing
   when not carried.
6. **The armoured convoy.**
   - Three rigs with six guards up top.
   - It halts on the shoulder and opens.
   - The trader's boxes hold only the convoy's table's items, and the counter opens on them.
   - It closes and rolls on with the guards still up.
   - The slits are drawn.
7. **The burning rain.**
   - It is out of the common roll.
   - The fog and the rain are hue 20-140.
   - Outside you are hurt; in a hard-topped car you are not.
   - An unarmed passer-by makes for a door.
   - Cleared, the burn falls away.
8. **Frozen calendars.**
   - Over 60 generated levels they appear at about each row's share and in no other room type.
   - Each one is on its room's wall.
   - January, no year.
9. **The self-heating meal.**
   - The tab spends the pouch.
   - After the wait there is one hot meal in the pack.
   - Eaten, it feeds you and is logged as a meal.

## 9. Not done (follow-ups)

- A magazine per weapon mode, so the shot barrel holds one load and the cylinder nine.
- A visible lapel badge on the player's model (today the counter works from the pack).
- The convoy on the other regions' corridors (it runs wherever the semis freight runs today: the streamed interstate).
- A recorded sound for the hum and the heater's hiss (both are synth today).
