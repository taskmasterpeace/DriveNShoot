# DRIVN — The Fleet (5 wildly different vehicles)

**Status:** ✅ v1 SHIPPED in `game/proto3d/` (2026-07-05) · **Proof:** `tests/vehicles_sim.tscn`
**Law:** a vehicle is a ROW in `ProtoCar3D.VEHICLES` — adding one = adding data, never new code
(ENGINE.md: "bicycles to 18-wheelers to tanks"). Same 5-part anatomy, death spiral, trunk,
surfaces, and skid marks for every class.

---

## §1. The five (start wildly different, refine later)

| | class id | Role | The catch |
|---|---|---|---|
| 🏍️ | `motorcycle` — **Rat Bike** | fastest off the line, ~85 mph, slips through anything | **a crash THROWS YOU** — the bike has no cab; the rider eats the wound (×2.5) and tumbles down the road. Saddlebag holds almost nothing (10 kg). |
| 🚗 | `scavenger` — **Scavenger** | the baseline all-rounder (the car we've always had) | master of nothing. 40 kg trunk. |
| 🛻 | `buggy` — **Dustrunner** | light + **knobby tires: barely loses grip on dirt** (0.95 vs the car's 0.78) — the off-road king | fragile, small tank, 22 kg rack. On asphalt it's merely okay. |
| 🚐 | `van` — **Boxer** | the loot mule: **120 kg** cargo bay | slow, wallowy, wide — highway tires are AWFUL on dirt (0.68). |
| 🚛 | `semi` — **Longhaul** + trailer | tows a **detachable TRAILER (400 kg)** — the "transport big stuff" answer; rams wrecks aside by sheer mass | takes forever to start and stop; jackknifing the trailer is the skill test. Cab alone holds 45 kg. |

**Speed order (sim-enforced):** accel bike > buggy > car > van > semi · top speed bike > car >
buggy > van > semi.

## §2. Tires — the variation lever

Every class carries a `tires` row: `{grip_f, grip_r, dirt_mult, name}`. Grip numbers feed the
wheel friction (baseline × tire-damage tier × surface). `dirt_mult` is what the tire is WORTH
off-road: knobby 0.95, street 0.78, highway 0.68. This is the hook tire LOOT upgrades later
(swap tire rows, not vehicles).

## §3. Trunks — "the trunk thing"

Every vehicle's trunk is a `ProtoContainer` with a **`max_weight` cap** (bike 10 · buggy 22 ·
car 40 · semi cab 45 · van 120 · **trailer 400**). `transfer_to` refuses past the cap and the
panel says so — hauling big stuff now REQUIRES the big vehicles. (Backpack keeps the soft
encumbrance system — you can overload your back, not a trunk.)

## §4. The trailer

A separate `VehicleBody3D` (4 free-rolling wheels, no engine) hitched to the semi by a
`Generic6DOFJoint3D`: linear locked, yaw free ±80°, pitch/roll stiff — it articulates like a
real rig. **E at the hitch drops it; back the semi's hitch within reach and E re-couples.**
The trailer's 400 kg tank rides with it, so a dropped trailer is a STASH you can stage — and
lose. (Trailer flips = the load's gone with it; sim proves flat-ground towing stays upright.)

## §5. Damage you can SEE (playtest law)

- **Smoke = the health bar.** Exhaust smoke starts at chassis < 70% and thickens/darkens
  continuously with damage (amount 6→44) — read a car's state at a glance from above.
- **It pours from the TAILPIPE** (per-class `tailpipe` position, rear-left) — not the hood.
  Fire still burns at the engine when the spiral gets there.
- Crash wounds scale by class: `crash_wound_mult` — bike 2.5 (you ARE the crumple zone),
  buggy 1.4, car 1.0, van 0.8, semi 0.4 (the cab is a fortress).

## §6. Shooting from vehicles (mount removed — for now)

The hood MG default is GONE (the mount SYSTEM stays in code for a later build). In a vehicle,
**LMB fires YOUR equipped weapon** out the driver's window at the mouse — same gun, same ammo,
same reload (R). Right-handed in a left seat: we shoot out the driver's side and call it
wasteland pragmatism.

## §7. Data columns (one row per class in `ProtoCar3D.VEHICLES`)

`name` · `size` (hull box) · `mass` · `engine` · `top_speed` / `reverse` · `steer` (max/high-
speed/rate) · `tires {grip_f, grip_r, dirt_mult}` · `trunk_max_w` · `crash_wound_mult` ·
`rider_exposed` (bike: eject on hard impact) · `tailpipe` (smoke pos) · `cabin`/`wheel` layout
rows · `hitch` (semi/trailer only) · starting `trunk_loot`.

## §8. Where they spawn (proto slice)

Scavenger + sedan as before · **Rat Bike** on Meridian main street (98, −288) · **Boxer van**
by the cross street (122, −292) · **Dustrunner** off the exit ramp in the dirt (46, −272) ·
**Longhaul + trailer** on the interstate shoulder (−11, −150) pointing north — you'll pass it
driving in.

## §9. Later (designed, not built)

Sedan folds into a `sedan` row · tanks/APCs (turret = the mount system returning) · bicycles
(stamina-powered row) · tire loot swaps (§2) · trailer variants (tanker = fuel, flatbed = car
hauler) · per-class engine synth voices.
