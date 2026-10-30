# FEEL: driving and gunplay measured, tuned and held

Robert, after the 2026-10-29 playtest: "You gotta fix the driving, the shooting combat. I think you need a harness."
Earlier the same night: "It doesn't feel like the AI is shooting back. If they are, I can't see where they're coming
from."

The latest numbers, before and after, with frame strips: **docs/renders/web/feel/report.md** (`node tools/feel.mjs`).

## 1. Overview

FEEL is three things:
- **A harness.** The `feel` command (`web/src/agent/feel-api.js`) measures driving and gunplay the way a player feels
  them, through the real code. `node tools/feel.mjs` turns those numbers into a one-page report with frame strips
  from the game camera.
- **A tuning pass**, done in rows, never in one-off code (law 7):
  - the wheel eases toward the keys;
  - the car's weight lags its nose, so it slides and you can catch the slide;
  - the shakes from being tired, afraid and cold stack only up to a cap;
  - every round that passes near you marks its shooter at the screen's edge.
- **Bands.** `web/src/data/feel.js` holds the tuned numbers as `[lo, hi]` rows. The selftest's `feel:` checks fail when
  a later change pushes a number outside its band, so nobody can quietly ruin the feel.

## 2. Player Fantasy

**At the wheel:**
- A tap of A nudges the car and a hold carves the turn.
- At speed you feel weight: the tail steps out a hand's width in a hard corner.
- Pull the handbrake and the car swings and slides sideways in a cloud of skid marks. Let go, give it gas, and it
  straightens up in a third of a second. Do the same on dirt and it slides further and takes longer to catch.
- The camera looks ahead of the car, so the road you are about to hit is on screen.

**With a gun:**
- A rested shooter's revolver puts every round on a man at 15 m.
- When someone shoots at you, you know where it came from. Either you can see him, or a chevron at the screen's edge
  points at him on the first round that comes near you.
- Being exhausted, afraid and cold all at once still shows in your aim, but it doesn't turn your revolver into a
  shotgun.

## 3. Detailed Rules

**Steering (player's car only)** — `DRIVING.steerRate`, `DRIVING.steerReturn` in `systems/vehicles.js`
- The keys set a target; the wheel moves toward it at `steerRate`/s.
- Back toward centre (or across to the other lock) it moves at `steerReturn`/s, so letting go straightens up fast.
- The pad's analog stick goes through the same ease.
- The AI's steering is unchanged: it already steers in curves.

**Slide (player's car only)** — `DRIVING.slide { carry, hbCarry, hbGrip }`
- Each frame the car turns by `dh`, and its velocity turns by only `carry × dh`. The rest stays behind as sideways
  slip, which the row's `grip` pulls back in, scaled by the surface (`roadGrip`, the citygen rows) and the tyres.
- On the handbrake, the velocity turns by only `hbCarry × dh` and grip drops to `hbGrip ×`. Letting go restores full
  grip, which is the catch.
- Before this change the velocity turned with the nose every frame, so the car could not slide at all: 0 m/s slip,
  even in a handbrake turn.
- Boats are untouched (`!v.boat`). AI cars keep the old rails for now (see §5).

**Sway cap** — `SWAY.cap` in `data/survival.js`
- The survival effects multiply as before: rest, fear, cold, fever, wounds, sickness and the clone sickness.
- The result, `needs.sway`, is clamped to `cap`.

**Shot read reach** — `SHOT_READ.markReach` in `data/shotread.js`
- When a raider fires a round whose line passes within `markReach` m of you (it is already "at you" inside `reach`),
  its shooter is marked as the round leaves the muzzle.
- Near misses inside the ballistic `nearMiss` (1.6 m) and hits mark as before. A hit still turns the marker red.

**The harness** — `feel part=drive|camera|guns|all|stage`
- **drive**
  - Each land row runs on a sandbox car at (9000, 9000) through `Vehicles.drive` at a fixed 60 Hz. There is no world,
    so a building can't spoil a number.
  - The probe car is marked `feelProbe` so it gets the player's steering and slide.
  - It then runs the LAWMAN on three surface grips.
- **camera**: on a clear strip of the island's flats:
  - how far the settled foot frame reaches across and up/down (by camera projection);
  - how far ahead of a flat-out LAWMAN the view centres, by speed.
- **guns**: on a clear strip, god mode.
  - A stand-in raider is held on its mark at 5, 15 and 30 m.
  - Each round is a fresh trigger pull with a fresh gun.
  - The shooter is rested and healthy: `needs.sway` and `skills.spreadMul` are pinned to 1, and the live values are
    reported apart as `shooter`.
  - Then god mode goes off and a raider with a grudge is turned loose 20 m away. He finds you through the AI's own
    acquire, and you stay topped up.
  - Measured: his first shot, shots, hits, how many he fired from on screen, and how many you could place.
- **stage scene=handbrake|slalom|firefight**: the opening frame of a report strip. `tools/feel.mjs` then plays it with
  the real `drive`/`step` commands and screenshots between the beats.

## 4. Formulas

- **Wheel:** `steerIn += clamp(steer − steerIn, ±rate·dt)`. Here `rate = steerReturn` when the wheel is heading back
  toward centre (or past it), else `steerRate`. Full lock from centre takes `1/steerRate` = 0.17 s.
- **Slip from a turn:** `a = (1 − carry)·dh`, `fwd' = fwd·cos a + side·sin a`, `side' = side·cos a − fwd·sin a`. After
  that, `side *= e^(−grip·dt)` as before.
  - Steady corner slip ≈ `fwd · av · (1 − carry) / grip`. For the LAWMAN at 15 m/s that is ≈ 0.8 m/s, a drift of
    about 3°.
- **Handbrake catch:** slip decays at `grip`/s once you let go. From the ≈6 m/s handbrake slide to under 1 m/s:
  `ln 6 / 6.5` ≈ 0.28 s on blacktop and 0.39 s on dirt (grip × 0.72). The harness measured 0.30 s and 0.43 s.
- **Camera lead (existing, `main.js updateCamera`):** the look target is `v + vel·0.55`, chased at `ZOOM.follow` 5/s.
  The steady lead is therefore `vel·(0.55 − 1/5)` = 0.35·v, which is 11.5 m at 33 m/s.
- **Gun cone:** `spread = row.spread · mode.spread · grip · (1 + bloom) · skills.spreadMul · min(cap, Π sway)`.
  - Recoil recovery = `mode.kick · grip.kick / grip.recover`: 0.08 s for the revolver, 0.04 s per round for the SMG.

## 5. Edge Cases

- **AI cars still drive on rails.** Giving them the slide changes how traffic, chases and the convoy hold their lanes.
  That is a separate pass with those lanes' sims (a follow-up). The probe flag and the player check are the only gates.
- **The foot frame is small.** The default foot zoom is CLOSE (D 22). The frame reaches 17 m across and 8.5 m up or
  down, while a raider's pistol reaches 55 m. A shooter 20 m straight above or below you is off screen; the edge
  marker is what lets you place him (`told` 0.67 → 1.0).
  - Raising the default zoom (`CAMERA.foot.dStart` / `ZOOM.start`) is the camera lane's call and Robert's. It is
    reported here, not changed.
- **The skill multiplier is uncapped.** `skills.spreadMul` (the deep sheet's conditions and injuries, night traits)
  read ×1.5–1.7 on the long-running harness player. Only sway is capped here. Capping the product is the next
  candidate.
- **The probe needs a still, healthy target and shooter.** Before the fixes, the gun numbers were wrong four ways:
  - the stand-in raider stepped aside in the frame the aim takes;
  - hundreds of probe rounds wore the gun to condition 0.24;
  - the target shot back and killed the player;
  - the long-running player was exhausted.
  The probe now holds the target, resets the gun, uses god mode and pins the shooter. `shooter` reports the live state.
- **The edge chevrons are DOM elements**, so the WebGL strips don't show them. `shotread` (the command) lists them.
- **A busy machine:** the tab can miss a poll. `tools/feel.mjs` waits for it (up to 60 s) rather than failing, and
  `--strips-only` re-shoots the strips from `last.json`.

## 6. Dependencies

- **systems/vehicles.js:** the `DRIVING` rows; `drive()` reads `steerIn` and applies the slide rotation. The probe needs
  `spawn`, `remove` and `drive`.
- **data/citygen.js:** the surface grips (blacktop 1, gravel 0.8, dirt 0.72) that the surface run uses.
- **systems/survival.js + data/survival.js:** `SWAY.cap` at the single place `N.sway` is set.
- **systems/shotread.js + data/shotread.js:** `markReach` in `at()`. The `validateShotRead` range is [0, 20].
- **systems/combat.js / arms.js / data/arms.js:** read only (`fire`, `row`, `GRIP`, `STANCE`).
- **main.js `updateCamera`:** read only (`camLook`).
- **agent/api.js:** imports `feelCommands` and `feelChecks` (one line each, beside shot read's).
- **tools/feel.mjs:** HTTP to `/agent/cmd` (`DL_URL`, `DL_TAB`). It writes `docs/renders/web/feel/{report.md,
  last.json, *.jpg}` and reads `baseline.json` (the BEFORE).

## 7. Tuning Knobs

| Row | Value | Range that still feels right | What it does |
|---|---|---|---|
| `DRIVING.steerRate` | 6 /s | 4–10 | lower = lazier wheel; at 3 it reads as drunk, at 15 a tap twitches again |
| `DRIVING.steerReturn` | 10 /s | 6–20 | how fast letting go straightens |
| `DRIVING.slide.carry` | 0.86 | 0.75–0.95 | corner slip; below 0.75 every corner skates |
| `DRIVING.slide.hbCarry` | 0.35 | 0.2–0.6 | how far a handbrake turn slides; lower = longer slide, harder catch |
| `DRIVING.slide.hbGrip` | 0.18 | 0.1–0.35 | grip while the handbrake is held (it was the old 0.18 constant) |
| `SWAY.cap` | 1.7 | 1.3–2.0 (band) | the worst the shakes can make a gun |
| `SHOT_READ.markReach` | 5 m | 2.5–8 | 0 = near misses and hits only (the old behaviour) |
| `FEEL_BANDS.*` | data/feel.js | — | the selftest's bands; the `probe` row sets the run speeds and surfaces |

## 8. Acceptance Criteria (named checks in `agent/feel-api.js`, `selftest only=feel:`)

1. `feel: the bands are well-formed rows`
2. `feel: steering eases to the keys (a tap is a nudge, never a twitch)`: steering delay 0.22–0.4 s for the LAWMAN and
   the sedan (it was 0.18).
3. `feel: a corner has weight but no skate`: corner slip 0.3–3.5 m/s (it was 0).
4. `feel: the handbrake slides, swings and is caught`: slide 3–14 m/s, swing 45–200°, catch 0.15–1.6 s.
5. `feel: dirt slides further than blacktop`: dirt's slide and catch are both at least blacktop's.
6. `feel: 0-60 per row holds its band`.
7. `feel: the shakes stack but never past the cap`: worn out, frozen and terrified at once gives sway in [1.3, cap].
8. `feel: the revolver lands at 5 m and mostly at 15 m`: a rested shooter hits 0.8+ at 5 m and 0.65+ at 15 m (24
   rounds, 0.1 allowance), and the raider's first shot lands 0.35–1.3 s after he finds you.

Shot read's own three checks stay green with `markReach` (`selftest "only=feel:|shot read"`: 20/20).
