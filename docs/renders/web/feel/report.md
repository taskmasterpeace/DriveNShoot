# FEEL report — 2026-10-29 (first pass, partial)

Harness: `node tools/dl.mjs scenario name=feel` (`web/src/scenarios/feel.js`). Driving runs every land row through the
real `Vehicles.drive` at a fixed 60 Hz on a sandbox car; combat fires the real guns at a still Dustwolf and turns an
angry one loose on you (god mode). Raw JSON: `scratchpad/feel/before.json`, `after.json`.
`tools/feel.mjs` (writes this page automatically) and frame strips are NOT built yet — see "Left".

## Driving (BEFORE)
| row | 0-60 s | top m/s | turn r @15 m/s | steer delay s | handbrake swing ° (0.8 s) | slide m/s | rev to 5 m/s s | rev top |
|---|---|---|---|---|---|---|---|---|
| interceptor | 2.15 | 37.5 | 10.0 | 0.18 | 88 | 0 | 0.32 | 15 |
| sedan | 3.25 | 32.0 | 9.8 | 0.20 | 80 | 0 | 0.38 | 14 |
| buggy | 1.93 | 35.5 | 8.9 | 0.18 | 105 | 0 | 0.27 | 14 |
| pickup | 4.30 | 29.2 | 10.0 | 0.20 | 75 | 0 | 0.42 | 13 |
| van | — | 25.4 | 10.8 | 0.22 | 63 | 0 | 0.52 | 12 |
| patrol | 4.05 | 29.8 | 10.5 | 0.20 | 72 | 0 | 0.42 | 13 |
| rv | — | 20.2 | 12.8 | 0.23 | 47 | 0 | 0.77 | 10 |
| rig | — | 23.7 | 12.5 | 0.22 | 52 | 0 | 0.57 | 11 |
| apc | — | 19.7 | 13.8 | 0.23 | 43 | 0 | 0.77 | 10 |
| bike | 1.37 | 44.7 | 9.5 | 0.18 | 112 | 0 | 0.25 | 10 |
| atv | 1.83 | 34.7 | 8.9 | 0.18 | 108 | 0 | 0.25 | 12 |

### What the numbers say
1. **There is no slide at all.** Lateral slip is 0 m/s in every row, even under a full-lock handbrake at 20 m/s and in
   a hard slalom: `drive()` adds the heading change before it rebuilds the velocity from (fwd, side), so the velocity
   turns with the nose every frame. The handbrake only changes how fast the car yaws. This is the biggest "doesn't feel
   like driving" cause: no weight, nothing to catch. Fix (next): carry the world-space velocity across the yaw and let
   `grip` pull it in — then tune `grip` per row against `slide`/`catchT` bands.
2. **Keyboard steering is a step.** A tap went straight to full lock; the turn rate hit 90% in 0.18-0.23 s with no
   wheel travel. Fixed with a row (below).
3. **Turn radius is near-identical** (8.9-13.8 m) from a buggy to an APC — the `turn` spread is flattened by the speed
   terms. Worth widening later.
4. **Top speed sits well under `maxSpeed`** (interceptor 37.5 of 46): the 0.18/s rolling drag caps it. Fine if
   intended; the HUD should show the real number.
5. **Reverse is very brisk** (5 m/s in 0.25-0.77 s) — matches Robert's ask for an easier reverse.

## Driving AFTER (DRIVING.steerRate 6/s, steerReturn 10/s)
| row | steer delay s before → after | handbrake swing ° before → after |
|---|---|---|
| interceptor | 0.18 → 0.28 | 88 → 80 |
| sedan | 0.20 → 0.28 | 80 → 72 |
| buggy | 0.18 → 0.27 | 105 → 95 |
| van | 0.22 → 0.30 | 63 → 57 |
| rv | 0.23 → 0.32 | 47 → 42 |
| bike | 0.18 → 0.27 | 112 → 101 |

Every other driving column is unchanged. The delay rises on purpose (a tap is a nudge, a hold is full lock in
~0.17 s of wheel travel). Not yet playtested by hand. **Combat noise:** with no combat change, the revolver at 15 m
read 0.50 one run and 0.25 the next. 16 shots is too few, so the probe needs 60+ shots per cell before any band is set.

## Combat (BEFORE)
| gun | rate s | reload s | mag | hit 5 m | hit 15 m | hit 30 m |
|---|---|---|---|---|---|---|
| .45 revolver | 0.26 | 1.3 | 6 | 0.94 | 0.50 | 0.19 |
| SMG | 0.075 | 1.7 | 32 | 0.56 | 0.25 | 0.31 |

Enemy (angry Dustwolf, pistol, 20 m, 12 s): first shot **0.18 s**, 12 shots, 100% from on screen, tracers on
(ballistics). Hits on you read 0 — god mode suppresses the `hurt` event, so the hit-rate probe must run without god
(staged hp top-ups) — a harness bug, not a finding.

Combat reads: 50% at 15 m with a still revolver is low for a top-down game (the cursor IS the aim); SMG at 5 m only
56% means the spray bloom is too wide up close. Tune `spread`/arms `kick`/`recover` rows next.

## Left (not done tonight)
- `tools/feel.mjs` report writer + frame strips/screenshots; camera look-ahead and collision bounce probes; surface
  grip (road/dirt/mud) probe; moving and in-car hit chance; recoil recovery; time-to-gun-up.
- The slide fix (item 1), combat spread tuning, selftest bands (`only=feel`), COMMANDS rows, full WEB_FEEL.md.
