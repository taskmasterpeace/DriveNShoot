# WEB_SEMIS — tractor-trailers you drive a car into

Lane: SEMIS (`feat/web-semis`, port 3494). Builds on `WEB_DECKS_STANCE.md` (the decks law) and `WEB_WALK_VEHICLES.md`.
Code: `web/src/data/trailers.js` (rows + `validateTrailers`), `web/src/systems/semis.js` (`g.semis`), bodies in
`web/src/systems/vehiclebodies.js` (`semiBody`, `boxTrailerBody`, `wideTrailerBody`, `rampGeometry`, `holdDoorGeometry`).
Agent surface: `web/src/agent/semis-api.js` (`semi`), checks in `web/src/agent/semis-selftest.js`.
Renders: `docs/renders/web/semis/`.

## 1. Overview

Robert, 2026-10-29 (relayed by the gadgets lane): *"tractor-trailers you drive a car INTO. An 18-wheeler semi (cab plus a
hitched box trailer) with a drop ramp at the back, so a car drives up into the trailer, rides inside, and drives back
out."* His normal cars, the LAWMAN and the motorcycle fit the standard trailer; an RV is too big for it, so there is an
extra-big trailer for an RV, about two lanes wide, with WIDE LOAD signs and banners. He loves the cars: the semi is built
with the same body builders as every other vehicle, never boxes.

This lane adds:

- **The LONGHAULER**, a conventional sleeper tractor (row `semi`): long square nose, chrome grille and air cleaners,
  stacks, saddle tanks, a sleeper with a roof fairing, a fifth wheel on its deck plate, tandem drive axles on duals.
- **Two trailers**, each its own vehicle (rows `boxtrailer`, `widetrailer`), joined at a kingpin:
  - the **BOX TRAILER**: a long dry box with a roll-up door and a hydraulic ramp that slides out from under its floor and
    tips to the road. It takes a car, a LAWMAN, a pickup or a motorcycle;
  - the **WIDE-LOAD LOWBOY**: a 5.6 m drop deck with a gooseneck, hazard chevrons on its rails, amber markers down both
    sides, red flags at the corners, a beacon, and WIDE LOAD banners (on its tail, on the gooseneck, and on the bumper
    and sleeper roof of whatever pulls it). A pair of folding ramps at the back. It takes the RV.
- **The hitch**: an articulated pivot at the kingpin. The trailer tracks, cuts inside a bend, swings out of a fast one when
  light, and backing up turns the other way. An empty trailer jackknifes when braked hard at speed. You can uncouple a
  trailer and leave it parked, and couple it again.
- **A car in a moving hold**: drive up the ramp of a parked or slow-moving semi at a matched speed. Inside, the car rides
  on the trailer's floor in the trailer's frame, the decks law extended to vehicles. It shifts under hard braking unless
  chocked. Its driver and crew get out and walk round it. It drives back down the ramp, out onto the road behind the
  moving truck.
- **Freight on the interstate**: hauler crews run box rigs (a car in one hold), or a wide load between two pilot cars,
  along I-10 every 4–7 minutes. They keep to roads their rig fits, and they stop short of anything overhead lower than
  the rig.

## 2. Player fantasy

You're at the wheel of your LAWMAN, a hundred metres behind a rolling semi on the interstate, and its ramp is down,
throwing sparks off the asphalt. You ease up to its speed. The nose climbs, the cab tips back, and you're in the dark of
the hold, the oak floor under your tyres. The door rolls down behind you. At fifty the truck leans into the bend, and you
feel it in the floor, but your brakes hold. You get out and walk round your car in the hold while the world goes by.
Later the ramp comes down at a crawl, you back out onto the road, and the truck rolls on without you.

Or you take the LONGHAULER out empty and stand on the brakes at sixty, and the trailer comes round to meet the cab.

## 3. Detailed rules

### 3.1 The rows (`data/trailers.js`, vehicle rows in `systems/semis.js`)

| Row | What | Numbers |
|---|---|---|
| `semi` | LONGHAULER tractor | 7.4 × 2.6 × 3.95 m, mass 5, accel 11, top 31 m/s, reverse 7; `tractor.fifth` −2.35 (the fifth wheel's local z) |
| `boxtrailer` | BOX TRAILER | 12.4 × 3.2 × 4.0 m, mass 4, no engine, no seats; `trailer: 'box'`, deck `boxHold` |
| `widetrailer` | WIDE-LOAD LOWBOY | 14.2 × 5.6 × 1.8 m (deck), mass 5; `trailer: 'wide'`, deck `wideDeck` |

`TRAILERS.box` and `TRAILERS.wide` define each trailer:
- `kingpin` and `axle`: local z;
- `floorY`;
- `hold`: the space a car stands in, and its door height `h`;
- `ramp`: the hinge, length, width, kind (`slide` or `flip`), seconds, and roll-up door;
- `maxCargo`: cars and mass;
- `wide` and `escort`.

`fitsHold(T, row)` says whether a vehicle goes in. A vehicle fits when:
- it is narrower than the hold less 0.12 m;
- it is shorter than the hold less 0.3 m;
- it is lower than the door;
- it is lighter than `maxCargo.mass`.

| Vehicle | Box | Wide |
|---|---|---|
| sedan, LAWMAN, BULL CAR, pickup, buggy, motorcycle, ATV, PATROL TRUCK | fits | fits |
| van | fits (2.25 m wide; door 2.25 m) | fits |
| RV | **no** (3.3 m tall: the door is 2.25) | **fits** |
| WHALER, ARMORED CARRIER | no (too tall) | no (too heavy / too long) |

### 3.2 The hitch (`HITCH`)

- **Coupling.** At the wheel of a tractor, back its fifth wheel under a loose trailer's kingpin, within `reach` (1.4 m)
  and with the headings within `reachAngle` (0.45 rad). Then tap **G**. Within 4.5 m of coupling, the tractor and the
  trailer don't collide (the fifth wheel slides under the trailer's nose). The prompt names the trailer and why it won't
  couple yet.
- **Hitched.** Each frame, after the tractor moved, the trailer's axle point stays where it was and the trailer turns to
  point from it at the kingpin (a no-slip trailer). It is then placed from the kingpin. A push (a wall, a car) moves it,
  and `pin` puts the kingpin back in the fifth wheel. The trailer's velocity, yaw rate and filtered acceleration come
  from where it went.
- **Articulation stop** `yawLimit` 1.38 rad: past it, the cab's corner meets the trailer's nose.
- **Jackknife.** The tractor's deceleration is measured and filtered. A trailer's axles lock and shove the kingpin when
  that deceleration is above `brakeA × (1 + load × loadBite)`, at more than `minSpeed`.
  - load = cargo mass / trailer mass.
  - While it folds, the articulation grows at `gain × excess + sustain × speed × |sin φ| + kick`.
  - The cab folds the other way at `cabShare` of that.
  - At the stop (moving faster than 0.5 m/s):
    - it is jackknifed (`jackknife` event, a dent);
    - the rig scrubs at `scrub` 1/s;
    - the tyres smoke.
  - It stays jackknifed until the angle is back under `clearAt`.
- **Swing.** Through a fast bend, the trailer's tail slides out by `k × (aL − grip × (1 + load × loadBite))` rad/s, where
  aL is the lateral load (speed × yaw rate).
- **Pull.** While hitched, the tractor's accel (and so its brakes, which are accel × 2.2 in `vehicles.js`) is
  `accel₀ / (1 + (trailer + cargo mass) / pullMass)`.
- **Lights.** A towed trailer's tail and brake lights work off its tractor's driver.
- **Uncoupling.** Hold **G** for 0.6 s. The trailer drops its landing gear (`parked`: `vehicles.js` brakes it) and stays.
  Anything can shove it.

### 3.3 The ramp

- **At the wheel** of the tractor (hitched), or of a car in the hold: tap **G** to work the ramp. The `semi action=ramp`
  command does the same.
- **Lowering** is refused above `CARRY.rampSafe` (9 m/s). **Raising** is refused while a car is on the ramp; if one rolls
  on, the ramp stays down.
- **The box's ramp.** The door rolls up (0–35%), the ramp slides out under the floor (35–80%), then it tips to the road
  (80–100%). The lowboy's folds down from upright.
- **Down** (`rampDown`): the ramp is a slope from the floor at the hinge to the road at its tip, at `asin(floorY / len)`.
  - The hold's door (a `needs: 'rampDown'` door in its deck row) opens.
  - People on foot walk up its slope (they are perched on it) and in.
  - A ramp left down on the move drags its tip: sparks.

### 3.4 A car in the hold (`CARRY`)

- **Boarding.** A driven car boards a trailer whose ramp is down when all of these hold:
  - its nose is over the ramp's tip;
  - its centre is behind the hinge and it is within the ramp's width;
  - it is square to the trailer within 0.45 rad;
  - its speed is within 4.5 m/s of the trailer's.

  It must fit (`canLoad`); a car that doesn't fit is refused (`semiRefused`, with a toast saying why).
- **Riding.** The car keeps `carry = { lx, lz, lh, lvx, lvz, lav, chocked }` in the trailer's frame. Each frame, after the
  trailer moved:
  1. The car is put into that frame.
  2. The floor's acceleration is applied backwards:
     - along the car, its brakes hold `brakeHold` (8 m/s²) unless its driver is on the pedals;
     - across it, its tyres hold `tyreHold` (9);
     - past either, it shifts by the excess.
  3. It drives (its own `vehicles.js` `drive()`: the same throttle, wheel and brakes as on the street).
  4. The hold's walls, the closed door and the ramp's curbs stop it (bounce 0.25; it dents past 5 m/s), as do the other
     cars in the hold.
  5. It goes back out through the trailer's new pose, with the floor's velocity at that point plus its own.

  Its height and pitch come from the floor or the ramp under each axle. While it is in a hold, it collides with nothing in
  the world.
- **Chocks.** A chocked car is fixed in the frame. A car left parked in a hold with the ramp up is chocked by whoever
  closed it; `semi action=chock` also sets them.
- **Leaving.** The car is released when its nose passes the ramp's tip, rolling backwards. It is then on the road with its
  world velocity (`semiUnload`). It can't board again for 1.5 s.
- **Getting out.** F at the wheel of a car in a hold puts its driver on the trailer's floor beside their door, as a deck
  rider. On the ramp, they step down onto the road instead. On the floor:
  - the car is furniture (`v.cargoBoxes`): they walk round it, never through it;
  - F at its door gets back in;
  - the roof cuts away while you are in the hold, whether on foot or in the car.

### 3.5 The freight and the road rules

- **The freight.** A run spawns every `FREIGHT.every` s (240–420) while you are out on the corridor:
  - `boxes`: two rigs, one with a sedan chocked in its hold;
  - `wideload`: a pilot pickup, the lowboy with an RV, and a pilot pickup.

  It rolls in along I-10 from 700 m back, in the formation's slots, at `cruise` (13 m/s; a wide load at `wideCruise`, 10).
  On the island, `semi action=freight` sends it along Route 66. It clears once it is 3.2 km from you.
- **Road fit** (`ROAD_FIT`, `fitsRoad`). A rig fits a road class when:
  - its widest body is narrower than the class's usable width less 0.4 m each side;
  - its length is within the class's `maxLen` (its bends);
  - a wide load is allowed on that class.

  The results: a semi doesn't fit a dirt track (12 m bends), and a wide load may not use a rural route or a dirt track.
  Both run the interstate. A wide load takes the whole of a two-lane road.
- **Clearance** (`CLEARANCE`, `fitsUnder`): overpass 5.0 m, rail bridge 4.6, low bridge 3.8, plus a 0.15 m margin.
  - The rig's height is the tallest of the tractor, the trailer, and the floor height plus whatever rides on it.
  - The box rig is 4.0 m; the lowboy with an RV is 4.2.
  - A freight tractor probes ahead every 0.3 s. Out to 26 m, any collision box whose base is above head height but under
    its height stops it short (`semiBlocked`).

### 3.5b Wear and the workshop (shared with every car)

- **Wear** (`systems/lookfeel.js`): the tractor and both trailers are ordinary vehicles to it. Each body is dressed with the
  wear layer on first sight, and dust and mud build by what is under its own wheels (a trailer reads its own ground, so a
  rig whose tail is on the shoulder dusts its tail). Scrapes along walls and the dent tint work the same way. A car in a
  **box** hold is `sheltered` and gathers nothing while it rides; a car on the open lowboy keeps wearing.
- **The workshop** (`data/workshop.js CHASSIS.semi`, added from `systems/semis.js` with `??=`): the LONGHAULER takes
  plate (front 60, sides 44), a ram plate or cowcatcher, guns up to size 3 on the hood and the roof, size 2 pods on the
  flanks, nitrous and any other utility (3600 kg, 22 spaces). Its rear point sits at the fifth wheel: size 1 and
  **droppers only** (`drops: true`), because what it pulls is in the way of a gun. Oil, caltrops, smoke and mines fall
  **behind the trailer it pulls** (`dropTail`), 1.6 m past the trailer's tail; with nothing hitched, behind the cab.
- Trailers have no chassis row: the workshop refuses them (`can't be worked on`).

### 3.6 Shard shape (law 5)

| | |
|---|---|
| **Owner** | The hitch is the tractor's (`K.towing`, `T.towedBy`); the hold is the trailer's (`T.cargo`, each car's `carriedBy` and `carry`). |
| **What must be saved** | Hitch pairs, ramp state, each car's frame pose and chocks. This lane does not save them yet (see §5). |
| **What another player sees** | Tractor and trailer poses, the ramp's `rampT`, and each car's world pose, which is derived from its frame pose. |

## 4. Formulas, with an example

- **Trailer heading** (no-slip): `h = atan2(kx − ax, kz − az)`, where k is the fifth wheel and a the trailer's axle point
  before the move. Position: `T = k − (sin h, cos h) × kingpin`.
- **Reversing.** With the kingpin near the tractor's turning point, `dφ/dt ≈ dθ_tractor/dt + (v/L) sin φ` in reverse: φ
  grows, and the trailer turns against the tractor.
  - Selftest: 150 frames at throttle −0.7, steer +0.7.
  - The tractor turns one way and the trailer the other; |φ| > 0.2.
- **Jackknife, empty box at about 15.5 m/s, full brakes.**
  - Tractor accel = 11 / (1 + 4/9) = 7.6. Brakes = 16.7 m/s², plus rolling drag 0.18 × v ≈ 2.8, so a deceleration of
    about 19.5.
  - The line is 9 × (1 + 0) = 9, so the excess is 10.5.
  - Articulation rate = 0.18 × 10.5 + 0.12 × v × |sin φ| + 0.25 ≈ 2.1 rad/s at the start. It reaches the stop (1.38) in
    about 0.6 s: jackknifed.
- **The same stop with a sedan chocked in the hold** (load 1.5 / 4 = 0.375).
  - accel = 11 / (1 + 5.5/9) = 6.8. Deceleration is about 15.0 + 2.8 = 17.8.
  - The line is 9 × (1 + 0.375 × 3) = 19.1, so it is not crossed: it stops straight (selftest: |φ| < 0.3).
- **A held car under hard braking** (the loaded rig brakes at about 17.8 m/s²). Along the car, 17.8 − 8 = 9.8 m/s² gets
  through. The unchocked car slides forward and meets the front wall; at more than 5 m/s it dents.

## 5. Edge cases

| Case | What happens |
|---|---|
| A car that doesn't fit drives at the ramp | Refused once every 3 s (`semiRefused`, a toast saying why); it meets the trailer's tail |
| A car arrives too fast | Not boarded until its speed matches; it rams the trailer's tail if it doesn't slow |
| You raise the ramp with a car on it | Refused; the ramp stays down |
| The trailer or tractor is removed or sinks | The trailer unhitches (`lost`); cars in a removed hold are released where they are |
| The cargo car is removed | It leaves the hold list on the next frame |
| A trailer you stand in is driven off | You ride it (decks law); its roof cuts away over you |
| Getting out on the ramp | You step down onto the road (the seat's own door) |
| Jackknifed, then reversing | The angle comes back down through the stop; it is cleared under 0.6 rad |
| Two cars in one box | They stop against each other along the length; the second one in sits behind |
| Saving with a car in a hold, or a rig hitched | **Not persisted yet.** On load the vehicles come back loose and parked |
| A gun fitted on the tractor's rear point | Refused at the counter: that point only takes droppers |
| Dropping oil while hitched | The slick lands 1.6 m behind the trailer's tail, never under the trailer |
| A car rides the open lowboy | It keeps gathering dust (only a box hold shelters) |
| A restored save reuses vehicle ids | `findVeh` can return the wrong vehicle; the checks enter by reference (follow-up below) |

## 6. Dependencies, both ways

- **Reads:**
  - `systems/vehicles.js` (`drive`, `collide`, `DRIVING`, the update loop);
  - `systems/stunts.js` `step` (the trailer's springs);
  - `systems/decks.js` (`mount`, the hold's deck rows);
  - `engine/collision.js` (the grid, read-only, for the clearance probe);
  - `world/worldindex.js` corridor `W` (`project`, `at`, `section`);
  - `systems/characters.js` `outfit`.
- **Shared-file hooks** (each one line or a few):
  - `vehicles.js update`: `g.semis.tick(v, dt)` in place of drive/collide/stunts, and a trailer is lit by its tractor;
  - `vehicles.js collide`: `g.semis.linked(v, o)` skips tractor–trailer pairs and cars in a hold;
  - `vehicles.js aiDrive`: `v.ai === 'semi'`;
  - `vehiclelights.js`: `lit` includes `v.towedBy?.driver`;
  - `decks.js`: `doorAt(..., v)` and resolve/exitPoint honour a door's `needs` flag; resolve and settle push riders out of
    `v.cargoBoxes`;
  - `seats.js leave`: `g.semis.exitInto` (out onto the hold's floor);
  - `main.js`: constructs `Semis` and calls `semis.update` after the convoy; a trailer is never a "Drive" target;
  - `vehiclebodies.js`: three body builders, the ramp and door builders, `GREENHOUSE.semi`, the lamp anchors;
  - `agent/api.js`: the command and checks registered;
  - `garage.js canMount`: a mount point marked `drops` only takes droppers;
  - `workshop.js dropFrom`: `g.semis.dropTail(v)` (drop behind the trailer);
  - `lookfeel.js updateWear`: skips a `sheltered` vehicle (a car in a box hold).
- **Also reads:** `data/workshop.js` `CHASSIS` (adds the `semi` row) and `MOUNT_WEAPONS` (the check).
- **Read by:** the freight's crews (`ai.js` treats them as drifters). The convoy is untouched; it can add rigs as
  `FREIGHT.rigs` rows later.

## 7. Tuning knobs (safe ranges)

| Knob | Where | Default | Safe range |
|---|---|---|---|
| `HITCH.reach` / `reachAngle` | data/trailers.js | 1.4 m / 0.45 | 0.8–2.5 / 0.2–0.8 |
| `HITCH.yawLimit` | " | 1.38 rad | 1.1–1.55 |
| `jackknife.brakeA` | " | 9 m/s² | 6–14 (lower: jackknifes more easily) |
| `jackknife.loadBite` | " | 3 | 1–5 (higher: a loaded rig is steadier) |
| `jackknife.gain` / `sustain` / `kick` | " | 0.18 / 0.12 / 0.25 | 0.05–0.4 / 0–0.25 / 0–0.5 |
| `jackknife.cabShare` | " | 0.35 | 0–0.6 |
| `swing.grip` / `k` | " | 5.5 / 0.05 | 3–9 / 0–0.15 |
| `pull.pullMass` | " | 9 | 4–20 (lower: a load drags harder) |
| `CARRY.brakeHold` / `tyreHold` | " | 8 / 9 m/s² | 4–14 |
| `CARRY.board.speed` / `angle` | " | 4.5 m/s / 0.45 | 2–8 / 0.2–0.7 |
| `CARRY.rampSafe` | " | 9 m/s | 3–15 |
| `TRAILERS.*.ramp.secs` | " | 3.2 / 2.6 s | 1–6 |
| `ROAD_FIT.*` / `CLEARANCE.*` | " | per row | width > 2, maxLen > 4 |
| `FREIGHT.every` / `cruise` / `wideCruise` | " | 240–420 s / 13 / 10 m/s | 60–900 / 8–25 / 6–15 |

`validateTrailers(VEHICLES, validateDecks)` guards the shapes. `semi action=status` returns its complaints.

## 8. Acceptance criteria (the selftest checks, `semis:`)

1. **Rows and bodies.**
   - `validateTrailers` is clean.
   - The tractor has more than 2,500 triangles, each trailer more than 1,500, with wheels, a frame and a cab tub.
   - The ramp and the roll-up door are their own meshes, and the box has a roof to cut away.
   - The WIDE LOAD banners are on the lowboy and on its tractor.
2. **Hitch and unhitch.** Backing the tractor under a parked trailer on held keys, [G] couples it, and it pulls. Holding
   [G] uncouples it: parked, it doesn't move while the tractor drives 12 m+ away.
3. **Reversing steers the trailer the other way.** Backing up with the wheel over, the tractor and the trailer turn
   opposite ways and |φ| > 0.2. Going forward, they turn the same way.
4. **Jackknife.** An empty rig braked hard at 15 m/s+ folds to the stop (|φ| ≥ yawLimit − 0.05, a `jackknife` event). The
   same stop with a sedan chocked in the hold pulls up straight: no event, |φ| < 0.3.
5. **A car into a moving semi, through a bend at 50 km/h, and out.** On held keys only:
   - the LAWMAN boards the down ramp of a truck rolling at more than 2.5 m/s, drives into the hold and stops;
   - [G] raises the door;
   - the rig does 14 m/s and more than 1.5 rad of bend: the car never leaves the hold, its footprint stays inside the
     walls, and its height stays on the floor (±0.25 m);
   - at 4 m/s, [G] drops the ramp and S backs the car out: `semiUnload`, the car on the road (y < 0.4), the truck still
     rolling and pulling away.
6. **The RV only fits the wide trailer.**
   - The fit table: the LAWMAN, the motorcycle and the sedan fit the box; the RV doesn't, but it fits the wide trailer.
   - Live, on held keys: driven at a box's ramp, the RV is refused and never carried. Driven up the lowboy's ramp, it rides
     on the deck (y > 0.7).
7. **Out of the car in the hold.** F puts you on the trailer's floor (y > 1.0) beside the car. Walking WASD around it, you
   are never inside its footprint and never off the floor. F at its door gets back in.
8. **Road rules.**
   - Road fit: the box rig doesn't fit dirt and fits the interstate. The wide RV rig doesn't fit rural or dirt and fits
     the interstate. It is wider than two box trailers, too tall for a low bridge, and clears an overpass.
   - Live: a wide-load freight (two pilots, the RV in the hold) on Route 66 stops short of a staged beam 3.6 m up.
9. **Draw calls with a convoy of semis.** A wide-load freight with its escort, and two box rigs with cars in their holds
   and their ramps down, beside you on Route 66: under 150 draw calls.
10. **Wear and mounts.** With a car in the box hold, the player drives the rig over the flats (wear rate x40 for 4 s):
    the tractor and the trailer are dressed and both gather dust (> 0.05); the car in the hold stays at 0. The workshop
    fits a ram plate (front), an oil sprayer (rear) and nitrous to the LONGHAULER, refuses a machine gun on its rear point,
    and has no row for the trailer. The oil drops past the trailer's tail (further behind its centre than half its length).

**Staging.** The checks run on the north-east flats (x 130–400, z −464…−368): open ground between the mesa and the river.
For a check:
- any cactus or tree on that ground is lifted (base 99);
- residents' promotion is paused, and any hostile near the ground is removed with their vehicle (the ring's Dustwolf
  chop shop is in reach).

All of it is put back afterwards.

**Screenshots** (game camera, `docs/renders/web/semis/`):
- `car-into-moving-semi.jpg`: the LAWMAN climbing the ramp of a rolling box rig, the roof cut away over the hold;
- `wide-load-rv-rig.jpg`: the lowboy with the RV, pilot pickups fore and aft, the banners and chevrons;
- `jackknife.jpg`: an empty rig folded against its trailer after a hard stop.

## Follow-ups (not in this lane)

- Persist hitches, ramps and hold cargo in the save, and through the shard (the rows in §3.6).
- `restore` (`agent/api.js`) gives restored vehicles their saved ids without advancing `Vehicles.nextVid`, so a later
  spawn can reuse an id. `findVeh` then returns the wrong vehicle.
- Removing a character (`main.removeChar`) leaves them in their vehicle's seat. A raider buggy kept driving and shooting
  with a removed gunner.
- Ambient traffic doesn't spawn semis yet: only the freight runs (and `semi action=spawn ai=traffic`).
- The ramp has no collider for walkers (they are perched on it); NPC crews of the freight don't get out at stops.
