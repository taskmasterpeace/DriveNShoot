# DRIVN Physics & Combat Lab — L1 playtest guide

**Status:** L1 playable · **Launcher:** `PHYSICS_LAB.bat` · **Scene:** `res://proto3d/tools/physics_combat_lab.tscn`

The lab is standalone and save-isolated. It does not load or write `user://drivn.save`, create
campaign wounds/crime/deaths, advance the world clock, or consume campaign inventory. Backspace or
Start resets the current test; closing the lab discards its temporary bodies and restores the exact
time scale that existed before launch.

## Start here — the 10-minute comparison

1. Double-click `PHYSICS_LAB.bat`.
2. Move and sprint sideways so the sparring partner does not block the straight lane. Fire, dive,
   and charge/release a grenade.
3. Press F1, F2, and F3 (or Y/Triangle repeatedly) and repeat the same motion. Compare input delay,
   stance height, recovery, weapon grip, and unwanted wobble.
4. Hold RMB/RB, point at **Scrap SMG**, and release. Tap the same button to quick-cycle.
5. Press F4/D-pad right through Passive, Return Fire, Hunter, and Duel. Matches are best-of-three,
   nonlethal, and reset after a 1.2-second round card.
6. Press F5 for X-ray, then inspect forward/head/cone/weapon lines, grip labels, contacts, and joints.
7. Press F11/Back after a bad landing to freeze the 20-second Black Box. Comma restores two seconds
   earlier. F12 launches the same trace through all three Mirror Run bodies.
8. Press U/D-pad left for surfaces and I/D-pad up for conditions. Repeat the same stop/dive.
9. Press N/LB to cycle deterministic scenario cards. B changes simulated network quality; M adds
   explicit crowd/physics/render load. The top-right rail reports latency, jitter, loss, queue/drops,
   CPU/script-estimate/physics cost, draw calls, and the first exceeded budget without auto-degrading.
10. Press V, rate Feel/Control/Weight/Readability/Fun from 1–10, add a note, and save the verdict.

## Complete controls

| Action | Keyboard/mouse | Controller |
|---|---|---|
| Move | WASD | left stick |
| Aim | mouse | right stick |
| Sprint / low ready | Shift | L3 |
| Directional dive | Space | A / Cross |
| Fire / physical melee | LMB | RT / R2 |
| Reload | R | X / Square |
| Charge and throw grenade | G | LT / L2 |
| Tap-cycle / hold radial | RMB | RB / R1 |
| Select radial wedge | mouse direction | right stick |
| Body mode | F1 hybrid · F2 active ragdoll · F3 full physics | Y / Triangle cycles |
| Opponent behavior | F4 | D-pad right |
| Surface | U | D-pad left |
| Condition | I | D-pad up |
| Camera Truth Wall | K | D-pad down |
| Input Oscilloscope / calibration panel | L | — |
| Scenario card | N | LB / L1 |
| Freeze/unfreeze Black Box | F11 | Back / View |
| Start Mirror Run | F12 | — |
| Reset station/match | Backspace | Start / Options |
| Verdict Book | V | — |

Keyboard-only inspection controls: F5 X-ray · F6 day/night · F7 clear/dust · F8 headlights ·
F9 normal/binocular range · F10 camera zoom · O door · [ / ] target distance · comma rewind ·
B network preset · M load level. Inside the L panel: sample five seconds of resting drift, use the
recommended deadzone, tune response/sensitivity/trigger/rumble/tap-hold values, apply them to the
live lab pad path (with a short rumble-strength preview), and save or load a named lab-only preset.

## The three bodies

- **F1 Controlled Hybrid:** the campaign candidate. CharacterBody translation, procedural motion,
  two-bone grip IK, tactical low-ready sprint, lowest latency, and easiest networking.
- **F2 Active Ragdoll:** 15 rigid parts, 14 constrained 6DOF joints, strong pose/balance/root motors,
  physical hand recoil and melee impulse. It should stay readable while impacts move through it.
- **F3 Full Physics:** the same articulated mass with softer pose and balance authority and
  force-driven locomotion. Expect more weight, drift, and recovery variance—not collapsed hips,
  runaway speed, self-shooting, or detached limbs.

Mode switches preserve position, weapon, condition, and surface, then free the previous rig.

## Stations and instruments

1. **Body Lane:** sprint, stop, dive, low-ready, and body-mode comparison.
2. **Grip & Gaze Range:** targets at 5/10/20/30/50/75/100/150/240 m, controlled wall/door LOS,
   forward/head/cone/weapon yaw, day/night/dust/headlight/binocular/zoom toggles.
3. **Dive & Throw Lane:** charged trajectory and recovery inspection on a 520 m-deep floor.
4. **Killhouse:** passive/return-fire/hunter/duel AI and repeatable nonlethal rounds.
5. **Vehicle Damage Bay:** L1 geometry and scenario staging. Visible dents/armor are the L2 slice.

### The ten bonus tools

1. **Mirror Run:** one trace, three simultaneous bodies, separate metrics, no fake winner.
2. **Black Box:** newest 20 seconds/1,200 frames, fire/dive/contact markers, seek and restore.
3. **X-ray:** equivalent collision/joint/contact/grip/aim labels for every body.
4. **Input Oscilloscope:** live raw/normalized axes, five-second drift recommendation, six tuning
   controls, live apply, and named lab-only presets.
5. **Surface Carousel:** asphalt, dirt, wet, mud, gravel, shallow water, low-friction debug.
6. **Condition Dial:** fresh, overloaded, hurt, exhausted, late-game specialist.
7. **Camera Truth Wall:** top-down drive, on-foot, chase, tactical, and broadcast SubViewports.
8. **Scenario Deck:** eight seeded cards with explicit bodies/loadouts/AI/weather/win conditions.
9. **Network & Crowd Chaos:** local/good co-op/bad Wi-Fi/hostile jitter plus explicit load counts.
10. **Verdict Book:** five subjective scores beside objective facts, JSON and Markdown exports.

Calibration presets live at `user://physics_lab/input_presets.json`. Verdicts live only beneath
`user://physics_lab/verdicts/`. Clear All requires a second confirmation.

## Scenario cards

- Pistol Duel
- SMG Suppression
- Martial Arts Bout
- Two in Cover (two real AI bodies sharing one nonlethal team meter)
- Low-Light Hunt
- Vehicle Gunner Pass
- Armored Penetration
- Tournament Final

Selecting the same card and seed reproduces its opening state and event order, including reset
positions, real staged vehicle rigs, loadouts, AI, weather, camera, transport, and a visible objective
counter. Vehicle Gunner Pass moves its rig through the bay; Armored Penetration stages a collision-
active armored SUV with no stray sparring actor. Visible dents/penetration surfaces remain L2, and
Spectacle payouts remain L3.

## DO → EXPECT acceptance card

- **Sprint with a gun** → firearm drops to low ready; support hand does not detach; fire waits for the
  visible raise gate.
- **Dive left/right/back** → travel follows movement, then aim fallback when stationary; body records
  airborne/contact/recovered and regains stance height.
- **Shoot in F2/F3** → ray leaves the weapon, excludes every self-limb, applies recoil, and can hit the
  partner. It must not hit the shooter’s own forearm.
- **Fight with fists in F2/F3** → hand receives a real impulse; nearby clear target takes nonlethal
  round damage; a wall still blocks the strike.
- **Drive-gaze regression** → repeated circles never wind the neck 360°; head/cone return forward;
  weapon aim may remain outside the neck arc.
- **Close/open the gaze door** → 20 m LOS reads blocked at ~12 m, then clear; cone constants do not
  change to force a pass.
- **Finish a duel** → winner card and score appear; no corpse, campaign wound, crime, death, or save.
- **Hide Camera Truth Wall / X-ray** → all five SubViewports or debug updates disable.
- **Bad Wi-Fi + load** → latency/loss/cost are reported; quality/counts do not silently degrade.
- **Open L calibration** → raw and normalized pad values update live; a measured drift deadzone makes
  resting input zero, APPLY changes the lab command path, and campaign bindings remain untouched.
- **Reset** → health, ammo, body, surface, and condition return to baseline; temporary mirror/physics
  bodies are freed.

## Known L1 boundaries

- F2/F3 are intentionally block-built experimental bodies, not final character art or shipped
  campaign replacements.
- Surface/condition changes are lab packets; they do not rewrite campaign bindings, wounds, skills,
  inventory, or vehicle rows.
- Mirror Run reproduces movement, dive, fire recoil, ammo, grip, and body metrics. It is diagnostic
  replay data, not a rendered video.
- Camera lighting presets are readability views; the separate sound overhaul and replacement audio
  assets are not part of L1.
- Visible modular vehicle deformation/directional armor is L2. WATCH/BET/ENTER brackets are L3.
  BACKROOMS '84 is L4.

## Automated evidence

The L1 release sim drives the full path above and must end with `PHYSICS_LAB: ALL CHECKS PASSED`.
Focused sims cover body integrity, grip IK, low-ready sprint, automatic fire, radial behavior, muzzle
pooling, throw charge, gaze/visibility, nonlethal sparring, replay, diagnostics, tools, scenarios,
verdict isolation, vehicles, traffic, and save behavior.
