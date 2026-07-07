# DRIVN — Drive-By Combat Spec

**Date:** 2026-07-07
**Status doc, not code.** Every rule here is a ROW or a formula a programmer implements against `car_3d.gd` / `weapon.gd` / `proto3d.gd` / `puppet.gd`.
**Feeds:** `docs/design/LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §"Crimes create evidence" — a drive-by is a gunshot marker + a witnessed vehicle (plate/paint/class), same evidence law, no new pipe.

## 1. Overview

Right now a driver can fire their own gun out of any window in any direction (`fire_from_vehicle()` aims at the mouse with zero gating), the hood MG only fires dead-forward, no passenger can fire at all, and nobody is rendered in a seat except a bed-riding companion. This spec turns "shoot from the car" into "shoot **from your seat, out your side, in your arc**" — every seat on every vehicle declares a SIDE and an ARC as data, occupants are visible puppets who can be shot back, and the reticle's promise (where it points is where the round goes) finally holds true from inside a moving vehicle, not just on foot.

## 2. Player Fantasy

You're the wheelman AND the gun — but not both at once, not everywhere at once. Driving a car past a target on your right, only your right side can answer; you plan the pass, not just point-and-click. Riding shotgun you can lean into the wind for a wide sweep, torso hanging out the window — a screen-readable "I am committing to this shot," Autoduel's spirit made 3D. A motorcycle is a gun with no armor around it: full exposure both ways, you can shoot anything and anything can shoot you. This is **Competence** (learn the arcs, plan your approach) wrapped in **Autonomy** (drive-and-shoot vs. lean-out vs. bail-and-fight are all valid, situational choices) — and it MUST read from outside the vehicle too: a shot-back driver's arm sticking out the window is the same information for the shooter and the target.

## 3. Detailed Rules

### 3.1 Seat rows carry firing data (P0)

Every seat in a vehicle's `seats` array (`data/vehicles.json`) gets 4 new fields alongside `pos`/`type`:

| Field | Type | Meaning |
|---|---|---|
| `side` | string | `"driver"` \| `"passenger"` \| `"exposed"` (bike/no-door) — which lateral half of local space this seat fires into |
| `arc_center_deg` | float | Center angle of the firing cone, in LOCAL vehicle space, 0° = forward (-Z), +90° = local right (+X), -90° = local left (-X) |
| `arc_half_deg` | float | Half-width of the cone (seated). Full cone = `arc_center_deg ± arc_half_deg` |
| `lean_arc_half_deg` | float | Half-width when LEANED OUT (passenger only; omit/0 for driver and exposed seats — they have no lean state) |

`cab`/`bed`/`cabin`/`shotgun` seat `type`s (existing field, unchanged) now imply a `side` if the row omits it (left x < 0 → driver, right x > 0 → passenger, bike → exposed) — **the new fields are additive, no existing row breaks.**

**Concrete starting angles** (car classes, LHD wasteland convention — driver sits left, x < 0):

| Seat | side | arc_center_deg | arc_half_deg (seated) | lean_arc_half_deg |
|---|---|---|---|---|
| Driver (any car) | driver | **-90°** (straight out the left window) | **28°** | n/a (drivers don't lean — see 3.4) |
| Passenger (any car) | passenger | **+90°** (straight out the right window) | **42°** | **75°** |
| Motorcycle rider | exposed | **0°** (whatever the bike faces) | **150°** | n/a |
| Bed gunner (pickup/van, existing `type: "bed"`) | passenger\* | **+90°** | **75°** | n/a (already exposed — see 3.4) |

\*Bed seats are pre-exposed (open truck bed): treat as `side: "passenger"` but with the LEAN-OUT arc as their SEATED arc — no separate lean state needed, matching how `seat_sim.gd` already proves bed gunners fire while the rig drives.

Rationale for the numbers: driver's 28° is "you can clip a target that's basically abeam your window" — narrow enough that you cannot plink someone ahead of the hood or someone on the passenger's side (the owner's literal ask: "only shooting on whatever side the person is on"). Passenger's 42° seated is wider because a passenger has nothing to steer, giving up a third more cone before earning lean-out's 75°. Exposed (bike/bed) starts at the lean-out number because there's no window to be *inside* of.

### 3.2 Side + arc check, at fire time (P0 — the core mechanic)

On fire, for the shooter's current seat:
1. Compute the seat's world-space firing direction: `world_center = car.global_transform.basis * Vector3(sin(deg_to_rad(arc_center_deg)), 0, -cos(deg_to_rad(arc_center_deg)))` (i.e., rotate the local arc center by the car's current yaw — the arc turns with the car).
2. Clamp the player's aim direction to the active arc: `angle_from_center = angle_between(aim_dir, world_center)`. If `angle_from_center <= active_half_deg` (seated or leaned, per 3.4), fire AT the aim point. If it exceeds the half-width, **clamp the fired direction to the nearest edge of the cone** — the shot still goes out, just at the arc's boundary, so the player always gets feedback ("I'm trying to aim behind me and the gun stops turning") rather than a silent no-op. Melee weapons still can't be used from a seat at all (existing rule, unchanged — a car door doesn't reach anyone).
3. The shot ORIGINATES from the seat anchor (`seat.pos`, car-local → global), not car center — this fixes today's `fire_from_vehicle()`, which uses a fixed offset off car center regardless of which seat/side the shooter occupies.

### 3.3 Occupant models (P0)

Every non-empty seat renders a puppet (`puppet.gd`'s existing rig) parented to the car at the seat anchor — the SAME mechanism `seat_sim.gd` already proves for bed-riding companions/dogs, extended to driver and cab-passenger seats (currently the ONLY seats that render nobody). Concretely:
- Driver seat: player's own puppet (already exists on foot) is re-parented to the car's driver-seat anchor on `enter_car()`, hidden legs-down/seated pose (existing puppet has sit/crouch poses to reuce from), replacing today's fully-hidden-driver behavior.
- Cab passenger seat: an NPC/companion puppet at the passenger anchor (already how `seat_sim.gd` proves the bed — cab seats just weren't wired the same way).
- Motorcycle: the rider's puppet sits astride the bike's single seat row (side `exposed`), legs down along the frame — this is the owner's explicit ask ("something to shoot at, once we calculate damage") and is currently MISSING entirely; a bike today renders no rider.

**Firing pose is the puppet's existing `aim_arm`/`shoulder` system (puppet.gd §"Aim arm"), driven by seat state:**

| State | Pose |
|---|---|
| Driver firing | `aim_arm` yaws to the seat's world arc direction; shoulder/hand extend OUT the driver-side window opening (arm-and-gun visible outside the hull silhouette) — this is the owner's literal "arm shooting out of the window" |
| Passenger firing, seated | Same aim_arm yaw, hand stays inside the window opening (gun visible, torso doesn't clip the door) |
| Passenger LEAN-OUT | Torso pivot (existing spine/shoulder chain) rotates the puppet's whole upper body out through the window plane — visibly outside the hull box, not just the arm. This is a distinct pose state (see 3.4), not just a wider arc number |
| Motorcycle rider firing | aim_arm yaws freely (no window to clip); puppet already fully exposed astride the seat |

### 3.4 Lean-out (P0)

A NEW passenger-only input: **HOLD to lean out** (bound as a rebindable row in `data/input_bindings.json`, same law as every other verb — e.g. `drivn_lean`, defaulting to a currently-unbound key/pad chord since no existing verb overlaps a seated passenger's needs). While held:
- Active arc widens from `arc_half_deg` to `lean_arc_half_deg` (seated 42° → leaned 75°, per the table above).
- Puppet pose switches to the lean-out torso state (3.3).
- Passenger's own EXPOSURE modifier changes too (3.5) — leaning out is a real risk/reward trade, not a free upgrade.
- Releasing snaps back to seated pose + arc on the next fire, not mid-swing (no popping the arc under an in-flight shot).

Driver does NOT get a lean-out state (P0) — the owner's ask separates "driver shoots out their side" from "passenger can lean out," and a driver leaning out of a moving car while steering is its own can of worms deferred to P2 (3.9).

### 3.5 Occupant damage + exposure (P0)

Seated occupants (driver, passenger, motorcycle rider, bed gunner) are `Damageable` and added to the `combatant` group **the same one-damage-law every fighting body already uses** (`player_3d.gd`, `howler.gd`, `lurker.gd`, `companion.gd` all do this identically) — no new damage class, just occupants joining the existing law. Incoming damage to a seated occupant is scaled by an EXPOSURE modifier before `take_damage()`:

| Seat state | exposure_mult |
|---|---|
| Car driver (seated, door/window covers most of the body) | **0.55** |
| Car passenger, seated | **0.55** |
| Car passenger, LEANED OUT | **0.9** (mostly exposed — the risk half of the lean-out trade) |
| Motorcycle rider (any state — no door, ever) | **1.0** (fully exposed, per owner's ask) |
| Bed gunner | **0.85** (open bed, low rail cover) |

`exposure_mult` multiplies incoming damage the same way `armor` already blunts vehicle-chassis hits in `car_3d.take_damage()` — same shape of formula, different variable, so this drops into the existing damage pipeline without inventing a second law.

### 3.6 Fix the gun arc (P0)

Independent of the vehicle-arc work above, today's on-foot/in-car reticle-to-shot mapping has a bug: the fired ray must match where the aim indicator (reticle/twin-stick cursor) points, clamped only by the weapon's `spread_deg` bloom cone — never silently retargeted, never offset by a stale muzzle position. **Correct behavior, stated crisply for whoever pins the exact bug:**
- `fire()`'s direction input IS `aim_point() - origin` (already the documented convention per `puppet.gd`'s "muzzle-parallax bug" comment) — the shot's centerline must equal this vector before spread is applied, on foot AND from every seat.
- Spread (`_spread()`'s triangular cone) rotates the centerline by at most `±spread_deg/2`, `current_spread()`'s multiplier is the ONLY widening factor — no path may add unaccounted jitter.
- From a vehicle seat, the SAME centerline law applies, but is additionally clamped by the seat's arc (3.2) — arc-clamp happens BEFORE spread is rolled, so bloom never pushes a shot back inside the arc if the centerline was already clamped to the edge, nor does it push a legally-aimed shot outside the arc.
- Verified by: a target dead-center in the reticle at seated `spread_deg = 0` equivalent takes the hit; a target 1° outside `spread_deg`'s edge never does, across 500+ trials (statistical, since spread is randomized).

### 3.7 Windows (P0/P1 split)

- **P0:** every car class gets colored window BOXES: front windshield (already exists as a single box, but only spec'd/placed at the CABIN's rear face per `car_3d.create()`'s `windshield` mesh — this is backwards for a forward-facing shield and gets corrected to face the vehicle's front, -Z) PLUS two new side window boxes (driver + passenger) at the cabin's left/right faces, sized to roughly the cabin's height × a third of its length, positioned at the cabin's side faces. This is where the arm/lean visually "emerges" — the puppet's arm-out and lean-out poses (3.3) target these window positions, not an arbitrary offset.
- **P0:** windows get a distinct tinted color per the owner's ask ("color the windows") — a translucent blue-gray box (e.g. `Color(0.25, 0.45, 0.5, alpha)`), NOT the same flat dark tone currently used for the one windshield box, and not black/opaque (must read as glass, not paneling).
- **P2:** broken/shot windows (a window takes enough incidental damage → visually cracks/darkens, or is removed on a hit that would've been a headshot on the occupant behind it) — deferred, no gameplay dependency blocks P0/P1 without it.

### 3.8 Controller parity (P0)

Everything above must work identically on pad, using the twin-stick convention already proven (`right stick → aim_override`, `RT`/`drivn_fire` fires, `LB`/`drivn_fire_drive` is the wheel-hand trigger):
- Arc clamp (3.2) applies to `aim_override`-derived directions exactly like mouse-derived ones — a pad's right-stick deflection outside the arc gets the same edge-clamp, not a different behavior.
- Lean-out (3.4) binds to a pad chord (a currently-unbound face button or a stick-click — final chord is a `data/input_bindings.json` row, tunable without code) that HOLDS the same as the keyboard/mouse bind.
- Rumble (existing per-hit rumble law) fires on occupant hits exactly as it does on any other combatant hit — no special-casing.

### 3.9 Explicit non-goals (P2, called out so scope doesn't creep)

- Driver lean-out.
- Firing while the car is airborne/flipped (existing seat occupancy checks already gate on `is_active`/`dead`; airborne is not a new gate, just noted as untested).
- Multiplayer occupant-hit netcode beyond the existing victim-authoritative PvP damage law (should fall out of "occupants are combatants" for free, but isn't explicitly re-tested here).
- NPC-driven vehicles' AI choosing to lean out or fire back — this spec covers the PLAYER's seats; enemy-vehicle gunners are `docs/design/LOOT_NPC_PRODUCTION_WANTED_SPAWN.md`/enemy-variety territory (Phase 7 priority 4), reusing these same arc rows once that AI exists.

## 4. Formulas

**World-space arc center** (car yaw θ = `car.global_rotation.y`, `arc_center_deg` = seat row value):
```
world_center = car.global_transform.basis * Vector3(sin(rad(arc_center_deg)), 0, -cos(rad(arc_center_deg)))
```
Example: pickup driver seat, `arc_center_deg = -90`, car facing due north (θ=0) → `world_center = (-1, 0, 0)` — straight out the car's left, which is west if the car faces north. Car turns 90° right (θ=90°) → the SAME local -90° now points north — the arc turns with the car, exactly as a real window does.

**Arc test** (`aim_dir` = normalized aim vector, `active_half_deg` = `lean_arc_half_deg` if leaning else `arc_half_deg`):
```
angle_from_center_deg = rad_to_deg(acos(clamp(aim_dir.dot(world_center), -1, 1)))
in_arc = angle_from_center_deg <= active_half_deg
fired_dir = aim_dir if in_arc else world_center.rotated(UP, sign(cross_y) * rad(active_half_deg))
```
Example: passenger seated (`arc_center=+90, half=42`), player aims 30° off the seat's +90° center → `30 <= 42` → fires exactly at the aim point. Player aims 60° off-center → clamps to the 42° edge, NOT the full 60° — the shot visibly "hits a wall" at the window frame.

**Exposure-scaled incoming damage** (mirrors `car_3d.take_damage()`'s armor formula shape):
```
damage_taken = incoming_amount * exposure_mult
```
Example: motorcycle rider (`exposure_mult = 1.0`) takes a full 18 hp pistol hit. A car passenger leaning out (`exposure_mult = 0.9`) takes 16.2 hp from the same hit. The same passenger seated (`0.55`) takes 9.9 hp — window and door frame are doing real work.

**Lean transition**: instantaneous arc-width swap on press/release (no lerp specified at P0 — a tuning knob, §6, if playtesting wants a blend instead of a snap).

## 5. Edge Cases

- **Target directly behind the car, driver's arc is -90° (side), passenger's is +90° (other side):** neither seat can hit it — correct; nobody can shoot backward out a side window. A rear-facing mount (future `mount_type`) would need its own arc row, not a workaround here.
- **Motorcycle passenger (future 2-up riding):** not in scope — bike rows currently have exactly one `exposed` seat; a second rider seat is a future vehicles.json row, same schema, no spec change needed.
- **Car is destroyed (`dead == true`) mid-fire:** existing `fire_from_vehicle()`/`fire_mount()` guards (`active_car.dead` check) already block firing from a husk; occupant puppets should un-parent the same way `_exit_car()`/`rider_thrown` already un-parents riders (existing path, not new).
- **Occupant killed while seated (driver or passenger dies from incoming fire):** the seat becomes empty — existing companion/dog death handling already frees the occupant node; the SEAT anchor itself persists on the car (an empty seat, not a broken one) so a new rider can board it later.
- **Trailer / semi-cab-only classes with no side seats declared:** a vehicle row that omits `seats` entirely (several already do, per `vehicles.json`) simply has no fireable seat — driver of such a vehicle cannot drive-by at all until the row is given a driver seat entry; this is a DATA gap per vehicle, not an engine gap.
- **Both driver and passenger fire in the same frame (co-op or companion NPC gunner):** each seat's arc test runs independently against its own `world_center`; there's no shared "vehicle facing" gate, so simultaneous cross-fire from both sides is expected and correct (a car full of guns should be able to shoot both ways at once).
- **Car flips/rolls (upside-down or on its side):** the arc math rotates by the car's FULL basis, not just yaw — an upside-down car's "left window" now points at the sky. This is intentionally consistent (no special-case), but is flagged as an UNTESTED edge case for the sim (3.9's airborne non-goal, adjacent).
- **Aim point is inside the car itself (very close target, e.g. someone grabbing the door):** `aim_point()`'s existing close-range convergence (documented muzzle-parallax fix) still applies; the arc test runs on the resulting direction like any other, so a point-blank target abeam the seat still needs to fall in-arc.

## 6. Dependencies

- **`weapon.gd`** — `fire()` gains an optional arc-clamp parameter (or a wrapping call from the seat-fire path) so melee's existing `is_melee()` early-out and the hitscan/multi/projectile behaviors are untouched; arc-clamping is a pre-step on `dir`, not a rewrite of `fire()`'s internals.
- **`car_3d.gd`** — seats gain the 4 new fields (3.1); `take_damage()`'s armor-scaling shape is reused, unchanged, for the new exposure formula (5); vehicle geometry (`chassis`/`hull`/`cabin` Vector3 rows) is the source for window box placement (3.7) — no new geometry concept, just two more boxes per the existing per-class dimensions.
- **`proto3d.gd`** — `fire_from_vehicle()` is the P0 rewrite target (origin moves from car-center-offset to seat-anchor, direction gets arc-clamped); `_fire_from_seat()`'s dispatch (mount vs. personal weapon) gains a THIRD branch for "passenger fires their own weapon" (today only the driver can fire personal weapons — a passenger has no fire path at all); `enter_passenger()`/`enter_car()` are where occupant puppets get parented (mirroring the existing companion/dog `board()` pattern from `seat_sim.gd`).
- **`puppet.gd`** — the existing `aim_arm`/`shoulder`/`hand` chain is reused for arm-out-window pose (3.3); lean-out needs a NEW torso-pivot pose state, which is the one net-new puppet capability this spec requires (everything else is seat rows + arc math).
- **`data/vehicles.json`** — every vehicle row with a `seats` array needs the 4 new fields backfilled (currently only bed/cab/cabin/shotgun `type`+`pos` exist); rows with no `seats` array at all get no drive-by capability until authored (5).
- **`data/input_bindings.json`** — one new row (`drivn_lean`) for lean-out, following the exact pattern every other verb already uses (key+pad+persisted rebind).
- **`docs/design/LOOT_NPC_PRODUCTION_WANTED_SPAWN.md`** — downstream consumer, not upstream: a drive-by shot fired from a seat is a gunshot noise event + a witnessed vehicle (plate/paint/class) exactly like any other gunshot in that spec's evidence law (§"Crimes create evidence" / §"Police do not know what they did not witness"); THIS spec does not implement witness/evidence, it just needs to keep emitting the SAME noise-event hook (`emit_noise()`, already called for horn/engine/gunfire elsewhere in `proto3d.gd`) so that system has something to listen to.
- **Enemy variety (Phase 7 priority 4, not yet built)** — armed enemy vehicles will want the SAME seat/arc rows for their own gunners; this spec's data shape is written so that reuse costs nothing extra later (3.9).

## 7. Tuning Knobs

| Knob | Range | Category | Affects |
|---|---|---|---|
| `arc_half_deg` (driver) | 15°–40° | gate | How forgiving the driver's own-side shot is; too wide breaks "your side only," too narrow feels unresponsive |
| `arc_half_deg` (passenger, seated) | 30°–55° | gate | Passenger's baseline generosity vs. driver's |
| `lean_arc_half_deg` | 60°–90° | gate | The reward half of the lean-out risk/reward; 90° = full broadside |
| `arc_center_deg` per seat | -180°..180° | gate | Which way a seat's window actually faces; almost never needs to move off ±90°/0° once a class's cabin geometry is fixed |
| `exposure_mult` per seat state | 0.4–1.0 | feel/gate | How much cover a door/window/bed-rail is worth; 1.0 (motorcycle) is the hard floor — never let ANY car seat reach full exposure, or "get in a car" stops being a meaningful defensive choice |
| Lean-out transition | snap (P0) vs. 0.1–0.3s lerp | feel | Whether the arc widening reads as instant commitment or a smooth lean; a snap is cheaper to tune first and is the P0 default |
| Arc-clamp fired-shot behavior | clamp-to-edge (spec default) vs. no-fire | gate | Clamp-to-edge always gives feedback; a "no-fire outside arc" alternative is colder but simpler — spec picks clamp-to-edge for feel, flagged here in case playtesting disagrees |
| Window tint color/alpha | any non-black translucent | (art, not this doc's call) | Referenced only because window placement is this spec's concern; final color is an art decision |

## 8. Acceptance Criteria

- [ ] A player driving a car, aiming at a target abeam their driver-side window, hits it; aiming at a target abeam the PASSENGER side (through the car) does NOT hit it, regardless of reticle position.
- [ ] A player riding shotgun (not leaned out) can fire out their own window within the passenger's seated arc; a target outside that arc is unreachable until lean-out is held.
- [ ] Holding lean-out widens the passenger's hit-able arc (measurable: a target that was out-of-arc seated becomes in-arc leaned, at the SAME bearing) and visibly changes the puppet's pose (torso outside the hull box).
- [ ] A motorcycle rider puppet is visibly present astride the bike at all times the bike `is_active`, and is a `Damageable` in the `combatant` group — an incoming hit registers against the rider, not the frame.
- [ ] A car driver and passenger puppet are both visibly present in their seats whenever occupied (driver always when `is_active`; passenger when a companion/NPC has boarded) — matching the existing bed-seat precedent from `seat_sim.gd`.
- [ ] Driver-firing pose shows the arm (and gun) breaking the hull silhouette on the driver's side only; passenger-firing (seated) shows the gun at the window without full-torso clipping; lean-out shows the torso outside the hull.
- [ ] Every car class in `vehicles.json` that has a `seats` array renders a windshield facing FORWARD (-Z) plus two tinted side windows at the cabin's left/right faces.
- [ ] A shot fired anywhere (foot or seat) lands exactly on the aim-point centerline before spread is applied — verified by a zero-spread synthetic case landing dead-on 100% of trials, and a spread-clamped case never exceeding `current_spread()`'s cone across 500+ trials.
- [ ] All of the above hold identically when driven by a gamepad (`aim_override` substituting for mouse aim, a bound pad chord substituting for the lean-out key).

## 9. Sim Hooks

A headless sim (`res://proto3d/tests/drive_by_sim.tscn`, following the existing sim-harness pattern — real input events, watchdog timer, `current_scene` fallback to `get_parent()`) proves each P0:

- **Side-gate, driver:** spawn a target directly abeam the driver's window (in-arc) and a mirrored target abeam the passenger's window (same distance, opposite side). Fire from the driver seat aimed at each in turn. ASSERT: the driver-side target's hp drops; the passenger-side target's hp is UNCHANGED after N shots aimed at it (proves the clamp, not just "usually misses" — spread alone wouldn't guarantee a full miss across a wide-open opposite side, so an unchanged hp is a strong the-arc-worked signal).
- **Arc-edge clamp:** place a target exactly 1° inside the driver's `arc_half_deg` and one exactly 1° outside. ASSERT: inside is hittable (statistically, across repeated fire, since spread randomizes slightly), outside is not, across 200+ trials each — this also doubles as the "gun arc is fixed" proof (§3.6) since it's the same centerline-then-spread pipeline.
- **Lean-out widens the arc:** place a target between the passenger's seated `arc_half_deg` and `lean_arc_half_deg`. ASSERT: fire attempts while NOT holding lean fail to hit it (0/N); fire attempts WHILE holding lean-out succeed (>0/N, statistically consistent with in-arc odds). Also assert the puppet's torso-pose flag/state flips true while held, false on release.
- **Motorcycle rider present + Damageable:** spawn a motorcycle, mount the player, assert (a) a puppet node exists parented to the bike, visible, at the seat anchor, (b) it is in the `combatant` group, (c) firing a weapon at the rider's position from outside reduces its hp — mirroring `seat_sim.gd`'s existing "the bed GUN answers a roadside threat (hp drops)" assertion pattern, applied to the rider being SHOT rather than shooting.
- **Exposure scaling:** deal an identical fixed `incoming_amount` to a motorcycle rider, a seated car passenger, and a leaned-out car passenger. ASSERT the three resulting hp deltas are in the ratio `1.0 : 0.55 : 0.9` (§4's formula), within a small epsilon — proving the modifier is wired, not just present as an unused field.
- **Origin is the seat, not car center:** for a vehicle with driver and passenger seats at different local `pos` values, fire from each seat and assert the tracer/hit ray's recorded origin matches that seat's global position (within a small epsilon), not the car's `global_position` — regression-proofs the P0 "shot originates from the seat" fix directly against today's car-center-offset bug.
- **Controller parity:** repeat the side-gate and lean-out checks feeding `aim_override` (as the existing pad-aim tests already do) instead of mouse `aim_point()`, and firing lean-out via the bound pad action instead of the keyboard key — same assertions, same pass bar.

---

File: `D:\git\carworld\docs\design\DRIVE_BY_COMBAT.md`
