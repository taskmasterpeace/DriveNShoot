# WEB_CAMERA: the boom, the views, the cutaway and the gun at the side

**Status:** v1, 2026-10-27, lane `feat/web-camera` (gap G1 + G2 of `WEB_DEATHLANDS_GAP.md`).
**Code:** `web/src/data/camera.js` (rows), `web/src/systems/camrig.js` (the boom), `web/src/systems/cutaway.js` (the
cutaway), `web/src/systems/characters.js` + `web/src/data/arms.js` `CARRY` (the carry), `web/src/agent/camera-checks.js`
(the checks), `web/src/scenarios/camera-tour.js` (the tour).

## 1. Overview
The play camera used to be one north-up rig ~8° off vertical with five fixed heights, stepped with Z. The wheel cycled
weapons and did nothing in a car. It is now a continuous **boom**: a distance `D` along an arm pitched `θ` off vertical
and yawed `ψ` round the look point `L`. Four **views** are rows:

| View | Pitch θ | Yaw ψ | Use |
|---|---|---|---|
| TOPDOWN (default) | 7.97° (= atan 0.14, the old rig) | 0, north up | the game's identity |
| ANGLED | from D (§4.1): close ≈ 42-50°, far ≈ 10° | 0, north up | "a little angle… almost third person" |
| ISO | 35° fixed | 0 / 90 / 180 / 270 (`[` `]`) | isometric read of buildings |
| CHASE | 52° | the car's heading + 180° | at the wheel only; on foot it reads as ANGLED |

The **wheel zooms everywhere** (in a car too); Alt+wheel cycles the guns. Each view remembers its own D on foot and at
the wheel. Getting out eases in (foot `dStart` 22 m), getting in eases out (drive `dStart` 70 m). A **cutaway**
dithers away whatever stands between the camera and you. The aimed gun rides **at the side** on the dominant hand.

## 2. Player Fantasy
Robert: "zoom out a little further in the car… roll your mouse to zoom in… get out and it zooms in… a little angle,
almost third person and isometric… I like the top-down, but we want different camera views… aim where your mouse is,
not where your direction is… the gun held on the side… go in them buildings, up to 6 stories, you just cut off the top."
You drive with the road laid out ahead, step out and the world closes round you; tilt it and the town has facades and
height; walk into a six-storey ruin and the floors above you and the wall between you and the camera are simply gone.
You walk one way and shoot another, and the gun is in your right fist off your shoulder (or your left, if you are left).

## 3. Detailed Rules
### 3.1 The boom
`camera = L + (D sinθ sinψ, D cosθ, D sinθ cosψ)`; ψ = 0 puts the camera south of L, so north is up. `camHeight =
D cosθ` (the old consumers — ambient birds, photo mode — keep reading it). Per frame D, θ and ψ chase their targets
exponentially (`heightRate` 2.2/s, `thetaRate` 4/s, `yawRate` 3/s), frame-rate independent. L chases the player (or
0.55 s ahead of the car; in CHASE `ahead` m in front of its nose) at `follow` 5/s; on foot L leans toward the cursor
(`lean` 0.25, up to `leanMax` 8 m × D/33). Upstairs D is measured from the floor you stand on (`camFloor`).
### 3.2 Views and zoom
- **O** cycles TOPDOWN → ANGLED → ISO (→ CHASE at the wheel) → TOPDOWN. Pad: **VIEW+R3** (photo mode moved to VIEW+L3).
- **Wheel**: one notch = D × 1.15 (out) or ÷ 1.15 (in), clamped to the mode's `dMin..dMax`. **Alt+wheel**: next/previous
  gun (the 1-6 keys and pad RB unchanged). A wheel over a panel (pack, map, menu, dialogue) never zooms: only a wheel
  whose target is the game canvas counts, and the zoom input is skipped while the world is paused, the pack is open or
  a dialogue runs.
- **Z / Shift+Z / − / =** step the five named stops (CLOSE 22/30, STREET 33/40, WIDE 55/64, FAR 86/96, HIGH 130/140 —
  foot/drive D). `g.zoomLevel` reads the nearest stop and writes one, so `zoom level=` and old checks keep working.
- **Pad**: VIEW held + right stick vertical = continuous zoom (VIEW then doesn't open the map).
- **Memory**: `mem[view][foot|drive]`. In a car `D_target = mem + speedLift·v` (0.75 m per m/s; ×0.35 in CHASE).
- **Indoors** D ≤ 26 m and θ ≤ 42°.
- **ISO** turns in 90° snaps on `[` and `]` (only in ISO). Q and E keep their verbs (throw-aim, interact).
- A turned view (ISO, CHASE) turns the controls with it: WASD and the pad's sticks are screen-true (`camrig.toWorld`,
  `controls.aimAt` adds ψ). Car steering was already screen-true through the real camera (`vehicles.screenSteer`).
### 3.3 Aim at the mouse
The cursor's ray meets a plane at your floor + 1.2 m (it followed the street before: wrong upstairs under a tilt). The
body turns to the aim point; the legs walk where the body goes (strafe, backpedal past 100° — `characters.js` gait,
already there) — so walk north, aim east, and the shots go east. Pad: the right stick aims (screen-true).
**Look far** (Robert: "hold down Shift, you can look further, outside of your range"): hold the **middle mouse button**
(row `look`; Shift is sprint and RMB is melee, so neither is free) and the look point goes all the way to the cursor, up
to `lookFar` 0.7 × viewR; the cursor's ground point walks out as the view follows it, so you scout past the edge. Pad:
the right stick thrown past 0.95 for 0.4 s (R3 is melee on foot, so no button is taken).
**Flying targets**: `fauna.raycast` skips any bird above 2.2 m (`systems/fauna.js` ~1035) and the ambient vultures
(`ambient.js`) have no hit test, so nothing in the air can be shot today. The hook is in place: `main.js` calls
`fauna.pickAir?.(mouseRay)` each frame and, when it returns `{ x, z, y }`, aims there (`g.aimAir`). The wilds lane needs to
add `pickAir` (a 3D ray-vs-bird test) and let `raycast` take airborne birds when `g.aimAir` names one.
### 3.3a Steering in the views (audited 2026-10-27)
`vehicles.screenSteer` (default Steering setting "screen", `ui/qol.js`): at the moment A/D goes down it projects the
nose through the real camera; nose up the screen → A = the car's left; nose down the screen → A = the car's RIGHT (so the
car turns toward screen-left). That is the "backwards" feel when a car drives down the screen in TOPDOWN: it is the
setting working as designed, and "car" (Steering: the car's left) gives classic tank steering. In ANGLED/ISO the same
projection answers any yaw. **CHASE now forces car-relative steering** (`screenSteer` returns the raw input when
`cam.eff() === 'CHASE'`); behind the car the two agree anyway (the nose is always up the screen).
### 3.4 The cutaway
Every lit mesh material (Standard/Lambert/Phong/Basic/Physical/Toon; people opt out with `userData.noCut`) is patched
once (`onBeforeCompile`, a scan each second picks up streamed materials) to read one shared uniform set. A fragment is
discarded on a 4×4 Bayer pattern when it is (a) higher than the **line** (`knee` 0.6 m over your feet; at the wheel
`carClear` 1.8 m over the car), (b) nearer the camera than you (view depth − 0.8 m), and (c) inside a screen circle of
`radius` 5.5 m round you (×1.4 at the wheel), the outer `soft` 35% dithered. Results: the camera-side walls of your room
drop to knee height, roofs/trees/overpass decks open a hole, the roof or deck you stand on (under the line) stays.
Inside a storeyed building `world/storeys.js setView` (unchanged) still hides every floor above yours. No transparency
sort, no per-frame allocation, no draw calls.
### 3.5 True view radius
`viewR` = the farthest of the four frustum corners on the ground plane from L (§4.2), × 1.05; a corner above the
horizon counts at the far plane. Spawners, clean-ups, the shadow box and the fog read it. The far plane is 600 m on
TOPDOWN and 1200 m on the pitched views; `θ + φ ≤ 80°` keeps the frame top on the ground; past it the background is
the fog colour (sky.js) — a plain gradient by design.
### 3.6 The gun at the side
`data/arms.js CARRY`: aimed, the gun sits off the chest centre on the dominant side — a one-hand pistol 0.20 m (at
1.35 m off the ground), two hands 0.10 m, a long gun shouldered 0.16 m. The drawn gun toes in by
`atan(lateral / distance)` (≤ 4°) to the aim point (the player's, refreshed every frame), the target (NPCs) or 15 m, and
the muzzle flash leaves its side muzzle. **The round itself still flies the body's centre line** (`combat.fire`): an
offset ballistic origin moved exact-geometry results (a steel plate's 10° graze hit the block beside it) and would
shift hit rates; on the centre line hit rates are unchanged by construction and the shot meets the cursor exactly.
`hand: 'R'|'L'`
per character: stable from the name (FNV hash, `leftShare` 8%), the player picks **GUN HAND** in the creator's look
page; every carry (aim, low ready, the revolver swinging in the fist) mirrors for a lefty.

## 4. Formulas
- Zoom fraction: `s = (ln D − ln dMin)/(ln dMax − ln dMin)` ∈ [0,1]; ANGLED `θ = θclose + (θfar − θclose)·smoothstep(s)`.
  Example (foot, D = 22, 50°→10°, 9..140): s = ln(22/9)/ln(140/9) = 0.326, smoothstep 0.25 → θ = 40.0°; height 16.9 m,
  14.1 m south. Example (drive, D = 70 + 0.75·16.7 = 82.5, 36°→8°, 24..175): s = 0.62, smoothstep 0.68 → θ = 17.0°.
- Wheel: `D' = clamp(D · 1.15^n, dMin, dMax)`; three notches in = ÷ 1.521.
- viewR (vertical half-FOV φ = 21°, h = D cosθ): far edge `h·tan(θ+φ)` from the camera's ground point; viewR = max over
  the four ground corners of |corner − L| × 1.05. Example: D = 20, θ = 41.8° → ≈ 27.3 m × 1.05 = 28.7 m.
- Toe-in: `δ = hand · min(4°, atan2(lateral, d))`; one-hand at 10 m: atan(0.20/10) = 1.15°.
- Cutaway radius on screen (NDC y units): |project(P + right·5.5) − project(P)|·aspect.

## 5. Edge Cases
- **Wheel over a panel** (pack, map, menu, dialogue): the panel keeps it; nothing zooms. Paused: photo mode owns the wheel.
- **CHASE on foot**: reads as ANGLED (its own memory); getting into a car in CHASE swings the camera behind it.
- **Exit while in CHASE**: the foot view is ANGLED at ANGLED's foot memory; ψ eases back to north-up.
- **Pad has no wheel**: VIEW + right stick zooms; VIEW + D-pad up/down still step the stops.
- **`zoom level=2`**: sets the current view and mode's D to the WIDE stop; returns the same fields as before.
- **Camera inside a tall building** south of you (a 6-storey wall, D small): its back faces are culled and the cutaway
  removes the rest between you and the lens; the frame shows you.
- **Overpass deck** you drive on: under the car's line, never cut; a deck above you: cut in the circle.
- **Another person between camera and you**: never cut (people opt out) — you may lose sight of your own shape behind
  a big man for a frame; acceptable.
- **Upstairs aim**: the cursor plane follows your floor, so a tilted camera doesn't throw the aim point north.
- **Left-handed in a car window**: not done in v1 (see §8 notes) — the window side follows the shot angle as before.
- **Screenshot at another size**: the cutaway is in NDC, so a 1280×720 shot cuts the same circle as the game canvas.

## 6. Dependencies
| Depends on | Why | Back-reference |
|---|---|---|
| `WEB_CONTROLLER` §3.7 (north up) | TOPDOWN/ANGLED keep ψ = 0; ISO/CHASE are opt-in views | add a line pointing here |
| `systems/sky.js` | shadow box + fog follow `viewR` (unchanged code) | — |
| `world/storeys.js` `setView` | hides floors above (unchanged; the cutaway does the walls) | `WEB_STOREYS` |
| `engine/input.js`, `engine/controls.js`, `data/controls.js` | wheel split, Alt+wheel, O / `[` `]` rows, pad VIEW chords, screen-true sticks | `WEB_CONTROLLER` |
| `systems/combat.js` | the muzzle off the shoulder + toe-in | `WEB_INVENTORY` (guns) |
| `data/creator.js`, `ui/creator.js`, `systems/creator.js` | GUN HAND pick | `WEB_CREATOR` |
| spawners (`zombies`, `director`, `residents`, `regions`, `wilds`, `fauna`) | read `g.viewR` (unchanged code) | — |
Depended on by: the cities lane (G4 storeys v2 relies on the cutaway for 6-storey buildings), the look lane (G9).

## 7. Tuning Knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `CAMERA.foot.dStart` | 22 m | 12-33 | how close you start on foot |
| `CAMERA.drive.dStart` | 70 m | 45-100 | how far the car view starts |
| `CAMERA.view.ANGLED.foot.thetaClose` | 50° | 35-58 | how third-person the closest ANGLED zoom is |
| `CAMERA.view.ANGLED.drive.thetaFar` | 8° | 0-20 | road readability far out at speed |
| `CAMERA.view.ISO.theta` | 35° | 25-50 | the iso read |
| `CAMERA.view.CHASE.theta` / `dStart` / `ahead` | 52° / 26 m / 3 m | 40-58 / 15-50 / 0-8 | the chase framing |
| `CAMERA.wheelStep` | 1.15 | 1.08-1.3 | zoom per notch |
| `CAMERA.cutaway.radius` | 5.5 m | 3-9 | how much is cut round you |
| `CAMERA.cutaway.knee` / `carClear` | 0.6 / 1.8 m | 0.3-1.2 / 1.5-3 | the cut line on foot / at the wheel |
| `CARRY.pistolOneHand.lateral` | 0.20 m | 0.12-0.28 | the pistol's side offset |
| `CARRY.leftShare` | 0.08 | 0.05-0.10 | lefties among NPCs |
| `CARRY.toeInMax` | 4° | 2-6 | the most a shot bends toward the aim |

## 8. Acceptance Criteria (selftest checks in `agent/camera-checks.js`, named `camera: …`)
1. **Wheel**: 3 notches in at the wheel and on foot = D ÷ 1.15³ (±2%); out again restores; Alt+wheel changes the gun,
   the plain wheel never does.
2. **Ease**: in ANGLED, getting in settles D on the drive memory within 2 s (±3 m), getting out on the foot memory;
   θ = §4.1 within 1°.
3. **Views**: O reaches TOPDOWN/ANGLED/ISO on foot and CHASE at the wheel (camera behind the car); `]` turns ISO 90°;
   W then walks up the screen.
4. **Aim ≠ walk**: walking north while aiming east: body ≈ 97.6°, legs ≈ 82° off it, a target east is hit, one north is not.
5. **Cutaway**: a 6-storey (19.2 m) tower between camera and player: ≥ 90% of the player's screen circle matches the
   tower-less render with the cutaway on, < 50% with it off; on the tallest storeyed building's upper floor, every item
   above is hidden.
6. **viewR**: every view × stop × mode: all screen-edge ground points within viewR; a ring at viewR + 10 m off screen.
7. **Perf**: ANGLED/ISO at foot dMax and ANGLED/CHASE at drive dMax over the town: < 150 draw calls.
8. **Look far + CHASE steering**: holding the middle button leans the look point > 1.6× the normal lean (> 12 m) and
   letting go brings it back; in CHASE, W+A turns the car to its own left.
9. **Gun at the side**: a raised one-hand revolver: `_gunX` ≤ −0.15 and the muzzle ≥ 0.15 m to the right (a lefty
   mirrors); the gun's toed-in line passes < 0.05 m from the aim point.
Not in v1: a window seat's dominant-side-first rule (seats.js is another lane's), the hit-rate ±3% A/B, a distant-ridge
card at the horizon, ISO snaps on Q/E (taken by throw-aim and interact; `[` `]` instead), R3 as the pad zoom modifier
(R3 is melee on foot; VIEW is the modifier).
