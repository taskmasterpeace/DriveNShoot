# WEB_JUMPS — vehicles that leave the ground (web engine)

**Status:** SHIPPED 2026-10-22 in the three.js engine (`web/`). Code: `web/src/systems/stunts.js`, rows: `web/src/data/stunts.js`,
agent command `stunts`, selftest checks "jumps: …" (3).

## 1. Overview

The world was flat. Now it has relief that vehicles ride, and they leave the ground when the ground falls away faster
than gravity and their springs can follow. Ramps are data rows of three kinds: a steel **kicker** (concave deck, solid
sides and lip), a dirt **berm** (cosine mound, optionally lopsided like a real dune), a dirt **table** (up, flat top,
down). Rows group into **sites**, each built as one steel mesh, one dirt mesh and one letters mesh.

Two sites ship:
- **The Thrill Show**, an old auto daredevil lot east of the x=320 road, just south of Route 66 (x 330–400, z 13–76):
  **Wreck Row** (kicker, five wrecks side by side, a landing deck 25 m on), **the Table**, **the Whoops**, bleachers,
  and the show's name laid out in whitewashed stones.
- **The Dunes** in the south-west Glass Flats (x −310..−250, z 250..310): four dunes, long windward backs to the west,
  short slip faces to the east.

Named jumps (Wreck Row, the Table) pay scrip on a clear and are a deed (`stunt`) that witnesses talk about.

## 2. Player fantasy

Hit the steel at forty, feel the nose come up, the engine flare as the wheels spin free, five dead cars sliding by
underneath, and the deck coming up to meet you. Land it clean and the dust blooms, the springs boom, the HUD calls it,
and somewhere a Dustwolf who watched tells the camp that the stranger can fly. Come in slow and you meet the deck's
face; come in hot and you clear everything and break something when you land on the flat. A bike rider rides the jump
(gas lifts the front, brake drops it); a car is a brick that goes where the ramp sent it.

## 3. Detailed rules

**Ground.** `heightAt(x, z)` is 0 except inside a ramp's footprint, where it is `rise × prof(s) × side(u)`
(`s` 0 at the foot … 1 at the lip/front along the facing, `u` −1..1 across). The slope is analytic (no finite
difference across a lip). Ramps are bucketed in a 16 m grid; off the ramps a vehicle costs one array lookup.

**Riding (every land vehicle, after drive() and collide()).** The body has ride height `y` and vertical speed `vy`.
While the body is within `travel` of the ground, a spring-damper pulls it to the surface; the ground only pushes. The
body cannot sink more than `bump` into its springs (bump stops: the rest of the impact goes straight through). Climbing
costs speed and rolling down gives it back (gravity along the nose). Pitch and roll follow the slope (rate 14/s).

**Takeoff** happens when the body is more than `travel` above the ground: the springs can no longer reach. Nothing
triggers it but the physics: kicker lips, berm crests and table edges all do it at the speed that makes it true.

**Flight.** No throttle, steering or grip; the horizontal velocity keeps on (light air drag) and any spin keeps
turning. A car's nose drifts down its arc. A bike or quad drifts down more slowly, and the rider adds to it: throttle
lifts the nose, brake drops it. A blob shadow sits on the ground under anything in the air; the headlight pools fade
with altitude; the lamps ride the body.

**Collisions in the air.** Static boxes no taller than a disc's height pass under it (each disc rides as high as that
end of the body). A ramp's own solids never block the car riding or flying off it. Cars pass over each other when one
is above the other's roofline (`tall` in the vehicle rows). People are only hit by a vehicle within 1.5 m of their
height.

**Landing** happens when the body comes back within `travel`. It is judged on the closing speed into the surface
`vn` and how far the nose is off the slope (`miss`), and on whether the car hit a wall on the way down (`airHit`):
clean, rough, hard (the frame pays), crash (bikes go down and riders are thrown; quads throw on a bad nose). Dust
blooms in proportion, sparks fly off hard ones, the springs boom (`audio.land`).

**Scoring.** A flight of 0.25 s or more is a jump (`jump` event, `stunts` command). The player's jumps of 0.55 s or
more get a HUD line; records (air, distance, height) save with the game. A named jump is **cleared** when the car comes
down at least `clear` metres along the takeoff ramp without crashing (overshooting the landing deck still clears;
the grade says what it cost). First clear pays `first`, then `again` once per game day. The first clear each day is
a `stunt` deed: witnesses take the word home (Dustwolves +2 a unit, drifters +0.5, Rust Haven +0.3; a clean one is
told at 1.5×).

**Kickers stand square to the map** (heading a multiple of π/2) because their sides and lip are axis-aligned static
boxes. A non-square kicker builds without solids and is listed in `stunts().warnings` (selftest fails on any).

## 4. Formulas

| Name | Formula | Variables / range | Example |
|---|---|---|---|
| Kicker profile | `prof(s) = (1−c)s + c·s²` | `c` = curve 0..1 (default 0.65) | Wreck Row's kicker, rise 2, len 8: lip slope `(1+c)·rise/len = 0.4125` (22.4°) |
| Lopsided berm | crest at `c = 0.5 + skew`; cosine up to the crest, cosine down after | skew 0..0.3 | dune1 skew 0.22: windward slope ≤ 10°, slip face 24° |
| Launch on a crest | flies if `u² / R > g` | `R` crest radius (m), `u` speed (m/s) | whoops (rise 0.42, len 5.2): R ≈ 3.2 m, so above ~5.6 m/s |
| Range, lip to same height | `R = 2u²·tanθ / g` | θ lip angle | 18 m/s off Wreck Row: 27.3 m |
| Suspension (implicit damper) | `vy' = (vy + (k(gh + g/k − y) + c·vg)·dt) / (1 + c·dt)`, ground only pushes | `vg = ∇h·v` | stable at the 50 ms frame cap |
| Slope gravity | `a = g·s / √(1+s²)` along the nose | `s` rise per metre along the heading | 22° deck: 3.7 m/s² against you |
| Closing speed | `vn = (∇h·v_h − v_y) / √(1+|∇h|²)` | m/s, ≥ 0 | a 2.5 m drop onto the flat: 7 m/s |
| Landing damage | `((vn − 7)² × 2.2 + [miss > 0.5] · miss · u · 0.9) / √mass` | hp | 10.65 m/s in a sedan (mass 1.5): 24 hp |
| Speed kept | `1 − min(0.5, max(0, vn − 2)·0.03 + miss·0.22)` | fraction | clean 2.6 m/s: 98% |

**Wreck Row by speed at the lip** (sedan; the deck was chosen by flying the arc at every speed, `deck_sweep`):

| lip m/s (mph) | result |
|---|---|
| < 17.6 (39) | meets the landing deck's face: crash, not cleared |
| 17.8–18.3 (40–41) | lands high on the deck: **clean** |
| 18.8–20 (42–45) | lower on the deck: rough |
| 20.5–21 (46–47) | the foot of the deck: hard |
| ≥ 21.5 (48) | flies past the deck onto the flat: hard, still cleared |

Every land type (bike, ATV, buggy, pickup, van, the 7.6 m rig) lands clean at 18.2 and rough at 20.

## 5. Edge cases

- **Leaving the deck sideways:** a ramp's own solids don't hold the car riding it, so a car drifting off a kicker's
  side drops off it (a short flight, landed like any other).
- **Coming up short:** the landing deck's lip face is a static box `rise − 0.3` tall; a car below that is stopped by
  it (wall damage, `airHit` → the landing is a crash). Above it but below the deck top, the bump stops lift it onto
  the deck (a hard hit, judged on the speed it came down at, before the stops took it).
- **Exiting in the air:** the player is placed beside the car at ground level; the empty car flies on and lands.
- **Dying in the air:** a dead car keeps flying and lands as a wreck.
- **Water:** in the air the water drag is skipped; a car that lands in deep water floods as usual.
- **Boats and the sunk** skip the vertical model entirely (boats ride their own swell).
- **A hop is not a jump:** flights under 0.25 s are not scored (whoops would spam events), unless they crash.
- **Old saves:** no `stunts` key loads empty records; vehicles restore on the ground.
- **A stale stunt car:** the `stunts run` command clears cars it parked on earlier runs before staging the next.

## 6. Dependencies

- `web/src/systems/vehicles.js`: spawn (vertical state), drive (air branch), collide (height-aware statics with
  `skip = v.air ? v.toRamp : v.ramp`, roofline test between cars, run-overs by height, `airHit`), update (calls
  `stunts.step`, poses the body from y/pitch/roll, seats riders through the body matrix, calls `stunts.update`).
- `web/src/engine/collision.js`: `resolveCircle(p, r, minY, skip)` (boxes no taller than minY pass under; boxes owned
  by `skip` don't count).
- `web/src/systems/vehiclelights.js`: lenses ride the body matrix; beam pools are painted at ground height under the
  car and fade with altitude.
- `web/src/systems/characters.js`: `groundAt` (people stand on ramps and dunes).
- `web/src/data/society.js` + `deeds.js`: the `stunt` verb and its faction values (see WEB_WORLD_MEMORY §verbs).
- `web/src/systems/audio.js`: `land(k)`; `ambience(..., free)` flares the revs in the air.
- `web/src/ui/qol.js` (map labels), the minimap canvas (ramps drawn at boot), `hud.toast` (jump lines).
- `web/src/agent/api.js`: `stunts` command, save/load of records, the three selftest checks.
- Reciprocal: WEB_WORLD_MEMORY lists `stunt` among the verbs; WEB_FAN_SERVICE_BIBLE §GTA2 (stunt bonuses) points here.

## 7. Tuning knobs (`STUNT` in data/stunts.js, `SUSPENSION` in stunts.js)

| Knob | Value | Safe range | Affects |
|---|---|---|---|
| gravity | 9.8 | 9.8 (honest) – 14 (snappier) | every jump's length and hang time |
| airDrag | 0.012 /s | 0–0.04 | range at speed; 0.04 cut Wreck Row by ~1 m |
| cleanVn / hardVn / crashVn | 4 / 7 / 11 m/s | ±1 each | how forgiving landings feel (0.8 / 2.5 / 6 m drops) |
| bikeVn / bikeMiss | 8.5 / 0.6 rad | 7–10 / 0.4–0.8 | how often riders come off |
| airPitch | 3.2 rad/s² | 2–5 | rider authority in the air |
| step | 0.45 m | 0.3–0.6 | ledges a tyre climbs vs walls |
| SUSPENSION k, c, travel, bump | car 420/26/0.22/0.18 … bike 175/15/0.33/0.24 | k 150–600, travel 0.15–0.4 | small bumps soaked vs launched; landing sink |
| Ramp rows | rise, len, wid, curve, skew | kicker lip ≤ 25° | where a jump lands at a speed: re-fly the sweep when changing a named jump |
| JUMPS first/again/clear | 60/15/29 (Wreck Row) | — | pay, and where "cleared" begins |

## 8. Acceptance criteria (selftest, all honest: only `true` passes)

1. Wreck Row at 18.2 m/s: flies, lands **clean** on `wreckrow_down`, 22+ m, pays exactly 60 on a first clear, and a
   `deed` event with verb `stunt` fires.
2. Wreck Row at 16 m/s: not cleared, graded **crash** (met the deck's face). At 22 m/s: cleared, landed off the deck
   (`landedOn` null), graded hard or rough.
3. dune1 at 5 m/s: never airborne. At 25 m/s: airborne > 0.4 s. A sedan driven square into the takeoff kicker's side
   near its lip stops short of it (z < 24.2, y < 0.2). A person on the table's flat top stands at 1.8 m. No
   `stunts().warnings`.
4. Perf: the Thrill Show in view costs ≤ 3 draw calls (steel, dirt, letters) + 1 while anything is in the air.
