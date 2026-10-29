# THE WORKSHOP: building the car (web engine)

**Status:** built 2026-10-27 on `feat/web-workshop` (lane 3409). Rows: `web/src/data/workshop.js`. Wear: `web/src/systems/garage.js`.
Guns and the counter: `web/src/systems/workshop.js`. Screen: `web/src/ui/workshop.js` + `workshop.css`.
Agent: `web/src/agent/workshop-api.js` (`workshop`, `mount`, `arena`; 9 selftest checks). Scenario: `arena-night`.
Renders: `docs/renders/web/workshop/`.

> Robert, 2026-10-27: "We gotta have mechanic stuff too, because you gotta be able to put guns on the car, oil, mines to be
> able to drop out the back. Rockets, machine guns, rail guns, all of that good stuff... we gotta have a UI for all of that
> as well, that fits our design language." And: "make the game fun, but brutal."

## 1. Overview

A car is a budget. Every body (chassis row) carries a load in kilograms and a number of spaces. Armour goes on **SIX FACES**
(front, back, left, right, top, under) as slabs of a kind (boiler plate, sheet steel, ablative, spaced, ram plate,
cowcatcher, spike strip); guns, launchers and droppers go on **mount points** named for their face (hood, tail, two pods,
the roof turret), each with a size and a firing **arc**; gadgets (batteries, a power plant, fire bottles, run-flats, solid
tyres, nitrous, a turbo, bumpers, a second tank, a cargo rack, gun ports, a targeting computer, a radar detector) take
spaces. Everything costs scrip **and time** at a counter (Kenji's, a town garage, your own bench), and everything weighs:
weight takes pull, top speed, handling and braking off the car by one formula. In a fight, a hit spends the plate on the
face it lands on; a face shot bare is **breached** and the next hits reach the parts behind it (THE BREACH). Fan service
for the car-duelling games' shapes (bible §3.2: SIX FACES, TAILGATE KIT, THE BREACH), in our names and numbers.

## 2. Player fantasy

You roll into Kenji's with a dented sedan and $400, and you have to choose: plate the nose and keep your speed, or put a
gun on the hood and pray nobody comes at you from the side. Every slab is a trade you can feel on the road. Later you are
the car people talk about: ram plate, spikes down the flanks so nobody climbs on, a roof turret that follows your aim, oil
and mines out the back for whoever is chasing. And it is brutal: three Dustwolf cars built at the same counter will take
your nose off in nine seconds (`scenario name=arena-night`), and a breached face means the next burst is in your engine.

## 3. Detailed rules

**Faces.** `FACES6 = front, rear, left, right, top, under` (the screen says BACK). A bullet lands on the horizontal face
toward the shooter (`vehicledamage.zoneOfLocal`); a car mine on `under`; a direct rocket on the face toward its launch
point; `top` takes hits from above (a drone, a turret above you: callers pass `face`). One kind per face: changing kind
means stripping the face first. Each chassis caps points per face (`CHASSIS.faces`; a bike has a nose only).

**Damage types** (`ARMOR.vs`): `bullet` (rounds, hood guns, the autocannon: they ride `combat.hitscan`), `fire` (flamer,
laser), `blast` (rockets, mines), `pierce` (the rail gun). A plate point stops `absorb x vs[type]` hit points.

**THE BREACH.** `garage.absorb` (combat's bullets) and `garage.soak` (the workshop's weapons) spend plate first. A face
under 0.05 pts is breached (`breach` event, a toast for the driver). On an armoured car, any hit on a bare face calls
`vehicledamage.breach(v, face, dmg, type)`: front → engine + radiator, back → tank, sides → that side's two tyres (popped
at 0) and the crew on that side, under → tank, engine, every tyre, top → everyone under the roof (`breachHit` event).
Then the old pipeline (hull hp, glass, dents) runs as it always did. A car with no plate at all behaves exactly as before.

**Mounts and arcs.** Hood (front, ±0.45 rad fixed), tail (rear, ±0.6), pods (left/right, ±0.6 about the side), roof
turret (top, 360°, slews to the aim). A weapon row may narrow it (heavy rocket ±0.2, rail ±0.25). Sizes 1-3 must fit the
point. Bolted guns give 0.07 rad toward the aim, then their spread (x0.5 with a targeting computer).

**Trigger groups** (`garage.groupOf`): **1** aimed = hood + pods (LMB / pad LB at the wheel; whichever mount has the aim in
its arc fires, else you shoot out of the window as before); **2** the tail = droppers and a tail gun (B / pad B; a tail gun
fires straight back); **3** the roof turret (RMB / pad VIEW+RB). `workshop.fireMount(vehicle, group, angle, shooter)` is
the one verb; AI raiders call it through `workshop.aiFire` (vehicles.js raider brain), the tactics lane may call
`fireMount` for anyone. Held triggers are called every frame: the rail gun (1.6 s) and the EMP (0.8 s) charge while held.

**Kinds.** hitscan (MG, twin MG, autocannon) · rocket (pod: dumb-fire; seeker: locks the car nearest the aim inside
±0.35 rad after 1.2 s, homes at 2.4 rad/s, a flare dropped by its target steals it; heavy rocket) · flame (cone 14 m ±0.25,
burns people, `fire` on cars, starts ground fires) · beam (laser: power only, `fire`) · rail (power + slugs, `pierce`:
through up to 3 targets, 70% carried each) · harpoon (the Whaler's verb, any car) · emp (stalls every engine in its cone
4 s, drains their power) · drop (oil, caltrops, smoke, car mines arming in 1.2 s, flares, paint that blinds whoever drives
through it: AI drivers swerve and cannot shoot; the player gets a toast).

**Power.** Every engine: alternator cap 20, +4/s while driven. Battery bank +80 cap; pre-war power plant +120 cap,
+12/s. Rail 60 a shot, laser 6, EMP 40. No power, no charge.

**The counter.** `workshop.install / remove / repair / reload / paint`. Install = part price + labour (hours x the shop's
rate x your price multiplier from standing, roles and the creator's tongue); the clock runs the labour hours (your own
bench charges nothing and takes x1.5). Remove: plate is scrap (no refund), a mount or gadget sells back at 40% less half
its labour. Repair: a face back to what was fitted (`platesFull`), or a part (engine, radiator, tank, lights, tyres,
body) priced by how worn it is. Reload: rounds are ITEMS (`AMMO_ITEMS`, registered into `data/items.js`), taken from
your pack, then the trunk, then bought at the counter. Rare rows (`uncommon`, `prewar`) are sold only where the shop deals
in them (Kenji: uncommon; the Remnant motor pool: both, at standing 30).

**The screen** (`U` at a garage with your car within 40 m, or Kenji's "Open the workshop" line): the car as a work order on
paper (nose up), six faces as plates (click or Space to pick), mount rings with group numbers and their arcs drawn, a
legend of what is on each. TABS: ARMOR / WEAPONS / UTILITY / AMMO / REPAIR / PAINT (two columns of price tags; no tab
scrolls). Detail: description, the bill (part + labour + hours + kg). Numbers: top speed, pull, handling, braking, load,
spaces, power, each ghosted red/green with the picked part fitted. Keys: 1-6 or Q/F tabs, WASD rack, Space face, E fit,
X take off, R repair the face, U/Tab/Esc close. Pad (menu context): D-pad, A fit, X off, Y face, LB/RB tabs, B close.

**Arenas** (`ARENAS`, `LOANER`): THE DUST BOWL (derby, tyre wall, barrel stacks, a kicker, a wreck) and LOOPLINE SPEEDWAY
(a 3-lap oval with checkpoints, barrel stacks, a kicker; the loaner night). Rows for the cities lane to stamp; `arena
loaner=true` hands you the promoter's junker (sheet steel nose and tail, a hood MG).

## 4. Formulas

```
mass  = base.mass + kg / 1000                      kg: plate pts x kind kg + mounts + gadgets
ratio = base.mass / mass
accel = base.accel x ratio x turbo.accel(1.12) x nitrous.accel(1.8 while burning)
top   = base.maxSpeed x (1 - 0.25 x (1 - ratio)) x turbo.top(1.05) x nitrous.top(1.15)
turn  = base.turn x ratio ^ 0.35
brake = ratio ^ 0.5                                 (multiplies vehicledamage/upkeep fx.brake)
plate stops = pts x absorb x vs[type]; rail: plate stops at most 35% of the slug, the rest goes on
```

**Example** (the selftest's): a SEDAN (mass 1.5 t, accel 18, top 40 m/s, turn 2.2) with 12 pts of sheet steel on each
side face and 6 on top = 54 pts x 14 kg = 756 kg. mass 2.256, ratio 0.665 → accel 11.97, top 36.65 m/s (82 mph), turn
1.91, brake x0.82. From rest it is measurably slower after 1.5 s; 12 more points on the nose (924 kg > 900) are refused.

## 5. Edge cases

- Legacy saves and Kenji's old dialogue: an old `v.plates` is boiler plate on four faces; `garage plates= points=` still works
  (`kind=` added); MOUNTS mg/oil/caltrops/smoke are the same rows with the same numbers.
- Changing a face's kind with plate on it is refused ("strip it first"); `remove face= part=plate` strips it.
- A mount with nothing in arc: group 1 falls back to window shooting; group 2 fires a tail gun straight back.
- Out of ammo: "DRY" toast; out of power: "NOT ENOUGH POWER" and the charge resets.
- Boats and the train cannot be worked on (no chassis row). Bikes: a nose plate and a size-1 hood or tail only.
- A seeker's lock is kept in a WeakMap, never on the mount row, so the row stays plain JSON for saves and the shard.
- The workshop screen is modal: the pause menu and the map do not take Esc while it is open (main.js skips `qol.input`).
- Fire suppression puts out a burning car (hp to 12%) twice, then is spent; reload with a suppressant bottle.
- Painted glass ends after 4 s; a car mine ignores the car that laid it.

## 6. Dependencies

**Uses:** `systems/vehicles.js` (rows, discs, damage, harpoon), `systems/vehicledamage.js` (zones, parts, effects),
`systems/combat.js` (hitscan, damage), `systems/carcombat.js` (glass, grabbers), `systems/throwables.js` (smoke, fires),
`systems/inventory.js` (pack, trunk caps), `data/items.js` (ammo as items), `engine/collision.js` (rays), `ui/hudart.js`
(paper), `hud.css` tokens and `.inv-card`.
**Used by:** combat (bullets on cars), vehicles.js raider brain (`aiFire`, blind steering, ram multiplier), Kenji's dialogue,
the save (`build`), the controls rows (`fireTurret`, `workshop`, `menuTabPrev`). **For other lanes:** `fireMount(vehicle,
group, angle, shooter)` and `aiFire(vehicle, tx, tz, dt)` (tactics, town security), `hitVehicle(v, x, z, dmg, type, by,
face)` and `blast(...)` (gadgets: drones from above pass `face: 'top'`), `v.flareUntil` (drones fooled by flares),
`workshop.addSite({ name, where, x, z, r, rate, rare })` (cities: a town garage), `ARENAS` rows (cities: stamp them).
**Semis** (WEB_SEMIS.md §3.5b): `systems/semis.js` adds `CHASSIS.semi`; a mount point with `drops: true` takes droppers only
(`canMount`), and `dropFrom` asks `g.semis.dropTail(v)` so a tractor's oil falls behind its trailer.

## 7. Tuning knobs (safe ranges)

| Knob | Where | Now | Safe |
|---|---|---|---|
| top speed lost per load | `PERF.topLoss` | 0.25 | 0.15-0.4 |
| handling exponent | `PERF.turnExp` | 0.35 | 0.2-0.6 |
| braking exponent | `PERF.brakeExp` | 0.5 | 0.3-0.8 |
| plate absorb per point | `ARMOR.*.absorb` | 5-11 | 4-14 |
| chassis load | `CHASSIS.*.maxKg` | 110-4000 | ±30% |
| hood arc | `ARC.hood` | 0.45 rad | 0.3-0.6 |
| rail charge / pierce / carry | `MOUNT_WEAPONS.rail` | 1.6 s / 3 / 0.7 | 1-2.5 / 2-3 / 0.5-0.8 |
| seeker lock time / cone | `seeker.lock` | 1.2 s / 0.35 | 0.8-2 / 0.2-0.5 |
| sell-back share | `workshop.remove` | 40% | 25-50% |
| shop labour rate | `WORKSHOPS.*.rate` | 0-35 $/h | 0-60 |

## 8. Acceptance criteria (the selftest checks, `only=workshop`)

1. The rows validate; every chassis carries at least every legacy Kenji face; every ammo row is an item.
2. Armour weight slows a car exactly by the formula (pull, top speed, handling, braking) and measurably off the line; the
   body's load is a ceiling.
3. THE BREACH: a plated nose keeps rounds off the engine; shot bare, the next rounds reach engine and radiator, the tank
   untouched.
4. A rear oil slick spins a pursuing raider car (dropped on group 2, the real raider brain driving through it).
5. A hood rocket aimed inside its arc fires and lands on its target; aimed behind, nothing fires.
6. The rail gun refuses on the alternator alone, charges while held (one frame: charging), then one slug goes through two cars.
7. Fitting at the counter costs exactly the quote in scrip and passes exactly the labour hours; broke, it refuses; a ram
   plate refuses a flank.
8. The screen opens with six tabs, every tab lists rows, E fits a part, F walks to the next tab, Esc closes.
9. What the car wears (plate kinds, every mount, gadgets, paint) rides a save and a load.

`scenario name=arena-night`: the loaner against three built Dustwolf cars at night in the Glass Flats; reports fire, rockets,
breaches, slicks and kills. Renders: `docs/renders/web/workshop/01-armor.png` ... `06-paint.png` (Playwright, 1920x1080 full
page), `07-game-camera-builds.jpg` (three builds from the game camera).
