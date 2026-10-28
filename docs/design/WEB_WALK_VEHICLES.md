# WEB_WALK_VEHICLES — vehicles you are IN, not just drive (web engine)

> **Extended by [WEB_DECKS_STANCE.md](WEB_DECKS_STANCE.md) (2026-10-28):** boat decks, the trundle's aisle, ladder roofs
> (a vehicle's second deck), prone riders, footing by QUICKNESS x stance (replaces the flat `braced` x1.6 below), and the
> passenger turret seat. The rules here still hold; the new ones read through `c.onDeck.D` (which deck) and
> `g.stance.footing(c)`.

**Status:** SHIPPED 2026-10-23 on `feat/web-walk-vehicles`. Code: `web/src/systems/decks.js` (the moving floor),
`web/src/data/decks.js` (deck layouts as rows, the rules, camp, placed vehicles), `web/src/systems/vehicles.js` (rows,
reverse, screen-true steering, the parking brake), `web/src/systems/vehiclebodies.js` (the hollow van, the RV, the
pickup's longer bed, roofs built apart). Agent command `deck`; selftest "walk vehicles: …", "steering: …",
"reverse: …", "motorcycle: the rider aims …", "enter/exit: …".

## 1. Overview

A vehicle row can carry a **deck**: a floor that rides with the vehicle. A pickup's bed, a van's cargo box and an RV's
coach are decks. The people on a deck are on foot, not in a seat: they walk on their own keys, crouch, shoot, open the
deck's boxes, sleep in its bed, and the floor carries them however fast it goes. A new walkable vehicle is a row: a
`deck` (a named layout or an object of the same shape) and a body built to match.

Robert, 2026-10-23: "You should be able to get into the back of a pickup truck and walk around." "An RV where you can
walk around. Like a van, you need to be able to walk around your van, even though the van is small." "The RV should
be able to have stuff in it. Be in the middle of nowhere." "You either live out of your car, or you live out of a
house." Sleep for the car: the car is a shelter. On a motorcycle you can shoot in every direction. And from the
briefing: left must be left and right must be right when steering; reverse is too slow.

## 2. Player fantasy

You stand in the bed of a pickup doing 60 down the interstate with a rifle over the cab, your partner at the wheel.
You crouch when the rounds come and the bed's sides take them. Somebody gets clever with a wall and you go over the
side. Out in the flats, you find an RV with the awning out and nobody home: the cupboards still have tins in them, the
tank has water, the bed is made. You park it, the camp comes out, you cook on the stove and sleep in a real bed in the
middle of nowhere. The van is your rolling closet: a locker, a mattress, a door at the back and the side. On the bike
you twist in the saddle and empty a revolver at whoever is behind you, and at speed most of it goes wide.

## 3. Detailed rules

### 3.1 The moving floor (systems/decks.js)
- A rider has `c.onDeck = { v, lx, lz }`: a position in the vehicle's own frame (+x the driver's left, +z forward).
- Each frame, inside `Vehicles.update`:
  1. **capture(v)**, before the vehicle moves: wherever the rider walked this frame (they move in the world on
     `main.js`/`ai.js`'s normal path) goes back into the frame through the pose the vehicle had when they were last put
     down. There the deck resolves them: furniture pushes them out, walls stop them, a **door** lets them out, a
     **dive** (Space) takes them over a **rail**.
  2. the vehicle drives, collides, rides its springs.
  3. **carry(v)**, after: the frame position goes back out through the new pose. x, z and heading are pure 2D both
     ways (nothing drifts); the height comes from the body's full transform, so a pitching truck or a jump lifts them.
- A rider's world position is never integrated from the vehicle's velocity, so nobody slides: the floor's motion is
  applied as a change of frame, every frame.
- Riders are characters on foot: `c.perchY` holds them at the floor's height (`characters.js`, `Game.standOn`),
  `c.firingFrom = v` makes their own vehicle transparent to their rounds (`combat.js`), and the vehicle's run-over
  code skips anyone on any deck.
- **Getting on:** E beside a pickup's bed (within 1.6 m of its rails, the vehicle slower than 2 m/s) climbs in. A
  cabin's door: walk into it (or E at it). An ally following you climbs aboard when you are aboard (or driving with no
  free seat). `deck mount=` for agents and scenes.
- **Getting off:** walk out of a door; dive over a rail; F at the wheel takes the seat. Stepping or diving off faster
  than 5 m/s hurts (2.2 hp per m/s over, a knockdown).
- **What a moving floor does:** each frame the deck measures the floor's own horizontal acceleration (filtered at
  12/s: one bad frame throws nobody), the speed a collision took off this frame (`v.impact`), and a landing's closing
  speed. Open deck, standing: a stagger (0.45 s on your back) at 24 m/s² / a 4 m/s impact / a 5 m/s landing; **thrown
  out** at 40 m/s² above 12 m/s (a full-lock turn at speed), a 9 m/s impact, an 8.5 m/s landing. Crouched riders brace:
  every line x1.6. A cabin never throws you out: a stagger at 30 m/s² / 6 m/s / 7 m/s, knocked flat at a 12 m/s impact.
- **Thrown:** along the way the floor was going (a crash, a landing) or out of the turn (the felt force: the floor's
  acceleration reversed), 1.6 + 0.12·speed + half the width out, on your back for 1.4 s, 5 + 1.6·speed hp (x0.7 for
  the player).

### 3.2 Shooting from a deck
- An **open** deck shoots any way. A rider **standing** in it is above its sides: rounds from outside reach them past
  the truck. **Crouched**, the bed's side takes a round meant for them 70% of the time (`cover`).
- A **cabin** shoots only out of a window or an open door (`windows`, `doors` spans on each edge); any other way the
  shot doesn't fire ("NO WINDOW THAT WAY"). From outside, the vehicle's body stands between a round and anyone inside.

### 3.3 The vehicles
- **Pickup** (`pickupBed`): an open bed 2.04 x 2.02 m, rails 0.43 m, a tailgate 0.42 m, the cab's back wall in front, a
  crossover **TOOLBOX** (70 L, garage loot) at the cab end. The cab moved 0.25 m forward to make room. Its old standing
  bed seats are gone; the convoy's gun truck now stands its gunner on the deck.
- **Van** (`vanCargo`): two seats in front, then a cargo box 2.0 x 3.48 m: walls to the roof, split **rear doors** and a
  **sliding side door** (kerb side), a **bench**, a steel **LOCKER** (160 L, starts empty: your storage), a **mattress**
  on the floor (a bed: sleep on it). F at the wheel spot behind the driver's seat drives; F again stands you back up
  inside. The roof lifts away while you are inside.
- **RV** (`rvCoach`, a new row `rv`): a van's cab, then a coach 2.3 x 5.7 m. The **bed** across the back (sleep quality
  1: a real bed), a **WARDROBE** (bedroom loot), a kitchenette down the driver's side: the **stove**, the **sink** over
  the **water tank** (60 L), the **PANTRY** cupboards (kitchen loot); a **dinette** (table and two benches) across from
  it, a **LOCKER** (garage loot) by the door. Windows down both sides and across the back; a solar panel and a vent on
  the roof; a ladder and a spare on the back wall. The roof, the bunk over the cab and the cab's roof lift away while
  you are inside. One stands in the middle of nowhere (`PLACED`: x 120, z 290, the south flats) with its cupboards full.
- **Camp:** an RV parked (no driver, under 0.3 m/s) for 3 s makes camp: the awning comes out on the door side over a
  mat and a folding chair, and the stove works (E: a hot meal from your pack: the food itself plus 0.12 FOOD and 6 hp).
  Rain fills the tank (6 L a game hour of rain) while camped. Drive off and it all stows.
- **Water tank:** E at the sink drinks half a litre (WATER +0.45, `survival.consume('water')`), or pours a carried
  bottle (0.5 L) or canteen (1 L) in when you are not thirsty.
- **Motorcycle:** the rider and the pillion shoot any way they look; the rider turns at the waist (the legs stay on the
  bike, up to 155°), sits up off the tank, and keeps aiming 1.2 s after each shot. Moving, every shot from any vehicle
  gets extra spread: 0.004 rad per m/s, capped at 0.1, x1.5 for the one at the wheel or the bars.

### 3.4 Steering and reverse (the driving fixes)
- **Measured before:** steering was car-relative: A turned the car counter-clockwise on screen (its own left), so a
  car pointing **down** the screen turned toward screen-**right** on A, at every zoom (the camera never rotates, and
  zoom only changes its height). Reversing, A swung the tail to the car's own left. Reverse top speed was a flat 35% of
  top speed for every rig (sedan 14 m/s, bike 18, APC 9.1) at 0.6 x accel.
- **Now:** the keyboard's left and right are **screen-true** (`DRIVING.screenSteer`): at the moment you press A, the
  game looks at where the nose points on screen through the real camera; nose up, A is the car's left; nose down, the
  sign flips so A still turns the nose toward screen-left. The choice is **latched while the key is held**, so holding
  A still drives a full circle. Reversing, the same rule swings the tail (the end leading the way) to screen-left.
  Agents (`drive steer=`) and the AI keep the car's own frame: +1 is the car's left.
- **Reverse:** every row has a `reverse` top speed (m/s) and backs up at 0.85 x its accel (was 0.6), tapering near the
  top as the forward gears do: sedan 14, LAWMAN 15, pickup 13, van 12, RV 10, WHALER 11, APC 10, bike 10, quad 12,
  boats 5-7. A row without one: 40% of its top speed within 6..15 m/s.
- **The parking brake (the enter/exit bug):** a car whose driver got out used to coast on at a 1.4/s drag: 7 m from
  10 m/s, out of the 4.2 m you can get back in from. Getting back into a car you just stepped out of failed 4 times in
  5 after a short walk. Now getting out of the driver's seat leaves it braked (14 m/s²) to a stop; thrown off (a bike
  crash) it slides on.

## 4. Formulas

| What | Formula | Example |
|---|---|---|
| Frame <- world | lx = dx·cos h − dz·sin h, lz = dx·sin h + dz·cos h | a rider 2 m behind a car facing +z: (0, −2) |
| World <- frame | x = vx + lx·cos h + lz·sin h, z = vz − lx·sin h + lz·cos h | |
| Felt acceleration | a ← a + (Δv/dt − a)(1 − e^(−12·dt)) | a single 2-frame spike of 300 m/s² reads ~60 |
| Thrown (open, standing) | impact > 9 or landing > 8.5 or (a > 40 and speed > 12) | crouched: x1.6 |
| Thrown distance | 1.6 + 0.12·speed + wid/2 | 20 m/s pickup: 5.1 m |
| Thrown hurt | (5 + 1.6·speed)·(0.7 player) | 20 m/s: 25.9 hp |
| Hop-off hurt | (speed − 5)·2.2·(0.7 player) | 12 m/s: 10.8 hp |
| Reverse cap | reverse · fxm.top | |
| Reverse pull | revAccel·power·throttle·(1 − 0.6·(−fwd/rev)) | |
| Moving spread | min(0.1, 0.004·speed)·(1.5 at the wheel) | 20 m/s rider: ±0.08 + the gun's |
| Screen-true steer | steer = s · (nose up on screen ? 1 : −1), latched on press | |
| Parking brake | fwd −= sign(fwd)·14·dt until 0 | 12 m/s stops in 0.86 s, 5.1 m |
| Camp | campT += dt while no driver and speed < 0.3; camp at 3 s | |

## 5. Edge cases

- **Teleported, respawned, boarded a seat, the train, hanging on a car:** a rider whose frame position jumped more
  than 3 m, or who is now in a seat, on the train or hanging on, is off the deck (silently).
- **A dead rider** stays on the deck and rides with it; their body container moves with them. A **wrecked** or
  **sunk** vehicle puts everyone off where they stand (the dead too).
- **A vehicle removed** (despawned) steps its riders down and drops its deck boxes.
- **A restored vehicle** is spawned, then renamed: deck boxes are registered once the vehicle has its final id, and
  `decks.load` puts the saved contents under the restored ids (a save keeps riders, boxes and tanks; an old save puts
  everyone off).
- **Shooting a cabin from outside** hits the vehicle; the people inside are covered (windows are not modelled for
  incoming rounds yet).
- **Ground pickups under a moving pickup** are collected by a rider in its bed (they share x, z); accepted.
- **The building interiors' windows** (`interiors.js`) are static rows in the collision hash: they do not fit a moving
  floor, so a cabin's windows are painted glass on the body plus `windows` spans on the deck.
- **A rider pressed against a wall** while the vehicle is parked against a building can be nudged by the static world
  first; the deck clamps them back inside the same frame.
- **The awning** is decoration (no collision), drawn only while camped (+1 draw call); the roof mesh is +1 draw call per
  visible cabin vehicle and 0 while you are inside it.
- **Party members:** an ally aboard a deck shoots hostiles out of it and hops off when you have left and it has
  stopped. You get up from the wheel with a waypoint set and an ally in the other seat: they drive you there.
- **Raiders:** the convoy's gun truck stands its gunner on the deck (held still until the convoy fights). Any AI on a
  deck fights on its normal path; the deck keeps them aboard.

## 6. Dependencies

- `systems/vehicles.js` calls `decks.capture/carry` each frame and `decks.init/drop` on spawn and remove.
- `systems/seats.js`: board takes a rider off a deck; leave(…, inside) stands you up at the wheel of a van or an RV;
  followThink boards a deck; the parking brake flag.
- `systems/combat.js`: two lines (a cabin's muzzle check; an open bed's rider not covered by their own truck).
- `systems/carcombat.js`: moving spread, the shooter's facing and last shot (the bike's aim pose).
- `systems/characters.js`: the bike rider's waist twist and sitting up to aim.
- `systems/convoy.js`: the gun truck's bed gunner on the deck.
- `systems/survival.js` (unchanged): `sleepAt('bed', …)` with a deck bed (quality 1), `consume('water')`.
- `systems/inventory.js`: deck containers are its boxes; TRUNK size for the RV.
- `main.js` hooks (the input lane, kept minimal): the vehicle you stand in is not "a car in reach"; E climbs in; the
  deck's own spots (the wheel F, the stove and tank E); a deck bed for N/E; F at the wheel of a cabin stands you up
  inside; the keyboard's steering through `screenSteer`.
- `agent/api.js`: the `deck` command, the vehicle report's `deck` and `reverse`, save/load, the selftest checks.

## 7. Tuning knobs

| Knob | Where | Value | Range | Feel |
|---|---|---|---|---|
| A deck's layout | data/decks.js DECKS | per vehicle | | a new walkable vehicle is a row |
| radius | DECK_RULES | 0.27 m | 0.2–0.35 | how tight a van feels |
| railMax, stepH | DECK_RULES | 0.6, 0.35 m | | what you dive over, what you step on |
| open/cabin lines | DECK_RULES | see 3.1 | x0.5–x2 | how easily the bed throws you |
| braced | DECK_RULES | 1.6 | 1–3 | what crouching buys |
| cover | DECKS.pickupBed | 0.7 | 0–1 | how good the bed's sides are |
| CAMP.after, meal, drink, rain | data/decks.js | 3 s, +0.12/+6, 0.5 L, 6 L/h | | |
| PLACED | data/decks.js | the RV at (120, 290) | | where the world's walkable vehicles stand |
| reverse | VEHICLES rows | 5–15 m/s | | |
| DRIVING.reverseAccel | vehicles.js | 0.85 | 0.5–1.2 | how brisk backing up is |
| DRIVING.screenSteer | vehicles.js | true | true/false | screen-true or car-relative keys |
| DRIVING.shootSpread | vehicles.js | 0.004/m/s, 0.1, x1.5 | | how hard shooting on the move is |
| DRIVING.parkBrake | vehicles.js | 14 m/s² | 6–20 | how a car you step out of stops |

## 8. Acceptance criteria (selftest, held keys and the mouse button only)

1. E climbs into a pickup's bed; walking it on held keys while an ally drives 200 m, the player never leaves the bed,
   stays inside its floor and at its height, past 12 m/s.
2. Shooting from the bed of a moving pickup hits a target beside the road.
3. A staged 20 m/s crash into a wall throws the standing player out of the bed: a `thrown` event from the deck, hurt, on
   the ground, knocked down.
4. An RV: walk in its door and down to the bed on held keys (its roof cut away), N sleeps in its bed (quality 1) and wakes
   rested, still aboard.
5. A van: walk in its side door; E at the locker opens it on the PACK screen; what is put in it is there after a save and
   a load, and the player is aboard again.
6. An ally climbs into the bed after the player and shoots a hostile from it.
7. Steering: at every zoom level, nose up and nose down, A turns the nose toward screen-left and D toward screen-right;
   backing up, A swings the tail to screen-left.
8. Reverse: held S backs sedan, pickup, van, RV, WHALER and bike up to their row's `reverse`, no faster.
9. The motorcycle rider hits a target behind them while riding, turned at the waist.
10. Getting out of a rolling car (F) and back in after a step (F) works five times in a row.
11. The full selftest green twice on fresh pages; draw calls under 150; `ip-lint` 0 deny.
