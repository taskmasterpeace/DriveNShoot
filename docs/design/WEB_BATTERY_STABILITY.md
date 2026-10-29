# WEB BATTERY STABILITY

## 1. Overview

Eight selftest checks failed in most full batteries on a loaded PC (6–9 game harnesses at once) and passed when run alone.
That slowed every lane's landing. This document records the **real cause of each**, the **fix at the source**, and the
tools added so the next flake names its own cause. One rule held throughout: **never weaken what a check proves**. We
re-staged or retried the STAGING, never the claim. Every bar, count and distance a check asserts is the same as before.

| check | cause (one line) | kind | fix |
|---|---|---|---|
| clone: reaching your husk… | a full pack spilled the kit-up into a ground pile on the husk's spot | state an earlier check left | staging |
| ring residents: by day one of a family goes out… | the residents' "wedged" watchdog measured straight-line progress and fired on every correct route away from the goal; a door leaf open to its stop pinned them | **real game bugs** (2) + staging | `systems/residents.js`, `systems/interiors.js`, staging |
| the town sleeps… | it judged the town "Ike + 20 s", before the game's own 25 s give-up had run | wall-clock-like window, not the game rule | game-time wait |
| underground: Outpost Nine's holdout… | the hatch walk-down check before it leaves the site `warned`; on arrival that went hostile and the soldiers never challenged | state an earlier check left | staging |
| water: a boat's heave… | a 4.2 s sample window is shorter than the 6.3 s swell; ~1% of phases sit in a lull | window vs. physics | longer window |
| doors: planks… | not reproduced (50+ runs alone, after its section, at night, after a burning car, on each of the 7 nearest doors) | — | richer failure detail |
| crew order FALL BACK… | not reproduced (alone 8/8, the crew section 2/2) | — | richer failure detail |
| storeys: a raider with a grudge… | not reproduced (alone 10/10; 16 timed trials 3–15 s against the 20 s bar, day and night) | — | richer failure detail |
| tactics band: a rifleman holds 25-45 m… (added later, §3.9) | the rifleman killed you inside the window, dropped you and wandered home 12 m off; separately, an open goal at the band's edge left him `arrive` short of it, out of band | staging + **real game bug** | godMode for the window; `systems/tactics.js` (an edge goal goes `arrive` into the band) |

## 2. Player Fantasy

There isn't one for the player. The fantasy belongs to the team: **a red battery means a real regression.** A lane
that sees one failure should be able to trust it, read the cause from the detail, and fix it, rather than rerun until
it goes green.

## 3. Detailed Rules (each check: cause → fix → proof)

### 3.0 Why the battery can vary at all

`api._step` runs the sim at a fixed `dt` (1/60) with streaming in sync mode, so a step does the same work on a fast PC and
a slow one. Batteries still differ run to run for three reasons, and every flake below is one of them:

1. **How long the page ran before the battery.** Until `selftest` arrives the game runs real frames. On a loaded PC fewer
   of them run, so the battery starts with a different clock, swell phase (`waves.t`), crowd positions and gate fights.
2. **`Math.random`** is unseeded: think timers, wander points, detour sides, loot rolls (what fills your pack).
3. **State an earlier check left** (dsoa-land §4): a full pack, a pile, a person standing somewhere, a door.

### 3.1 clone: reaching your husk you take your things back

- **Symptom:** `prompt: "E Pick through what's here"` instead of the husk's prompt. With the same cause, the check before it
  can also lose the canteen.
- **Cause (state):** the battery fills your pack long before the clone checks run. The dying check then kits you up at its
  stage: `gainGun('smg')` (you already carry an SMG from "SMG registered", so this one is a *spare*) and a canteen. With no
  room, both spill (`inventory.stow`) into a **ground pile at your feet**, which is exactly where the husk is laid a moment
  later. Standing at the husk, the nearest box was that pile, so the E prompt went to the pile.
- **Reproduced:** fill the pack with scrap and give an SMG, then `only=clone:` → 7/9, with the same prompt failure.
- **Fix (staging, `agent/clone-api.js`):** the dying check empties the pack and clears ground piles within 12 m of its
  stage before the kit-up. What the check proves is unchanged: you die with this kit, the husk holds it, and at the husk
  the prompt is the husk's.
- **Not a game bug:** a pile you dropped beside your husk, and nearer to you, *should* take E.

### 3.2 ring residents: by day one of a family goes out on a run on foot

- **Symptom:** `left:false, where:"out"` with `secsOut 6`: out of the house, then back in its doorway when measured.
- **Reproduced:** the battery's own order (the family put to bed by the night check, then the day run), day 2's member,
  10 tries: **3 of 7 promoted runs failed**: wedged 5 times outside the door, 13.2 m at 30 s, or back in the doorway
  (`out43 … IN`, the lead's exact shape). Passing runs took 11–30 s for the "down the street" leg against a 30 s bound.
- **Cause 1 (real bug, `systems/residents.js` walk):** the progress watchdog ("no closer by 0.3 m in 4 s → wedged: drop
  the route, random detour, plan again") measured **straight-line distance to the final goal**. This family's front door
  faces west and its first stop is east. The correct route goes out west and round the house, *away* from the goal, so the
  watchdog fired every 4 s: a fresh route and a random detour each time, often back into the doorway.
  **Fix:** progress is measured **along the route** (to its next point plus the rest of it). Straight-line is kept when
  there is no route.
- **Cause 2 (real bug, `systems/interiors.js` leafCircle):** with false wedges gone, a slower stall showed. The family's
  double front door is pushed open outward to its stop (`DOOR.maxAngle` 1.83 rad), so each leaf sticks ~1 m out from the
  wall. The foot-path grid knows nothing of leaves, and the route south hugs the wall 0.6 m out, straight into the southern
  leaf. Pressed square on (`broad` 1.00) a leaf at its stop yields nothing, and the push-out alone held the walker there,
  their next waypoint right behind it (traced: `th 1.83`, contact `s 0.36/1.07`, `broad 1.00`).
  **Fix:** a leaf at its stop turns an **AI walker** pressing it toward its free end (the remaining push-out goes along
  the leaf), as round a wall's corner. You and cars push leaves exactly as before.
- **Cause 3 (staging):** alone, the check came up "not promoted" (13 free character slots; residents never take the
  reserve). In the battery it borrowed the night check's `freeUp()`. It now stages its own room, as `atFamily()` does.
- **After:** the night-then-day pair on fresh pages, days 1–6: 12/12. Alone 5/5.

### 3.3 the town sleeps: at 23:00 Ike goes to bed and most of the town with him

- **Symptom:** `most:false`, ~24 asleep against ~31 awake.
- **Cause (timing):** at 23:00 every townsperson claims a bed and walks to it at 1.3 m/s. Whoever hasn't reached it
  `TOWN_NIGHT.giveUp` = 25 s later lies down where they stand (`ai.toBed`). So the game's own rule has the town down 25 s
  after bedtime. The check judged the town at **Ike's bedtime + 20 s**, and its comment assumed "a bed 90 m off is
  ~20 s at a walk" (it is ~70 s). When Ike was quick, the window closed at ~21 s, before the give-up, and read a town still
  walking home as awake. A live read in a failing run showed every awake person with a claimed bed and `bedT` just under
  25 s, at 23.82 h (24.6 s after 23:00 at 1/30 game-hour per second).
- **Did the new occupations change "most"?** No. The workforce is off for the battery, none of the awake people were
  workers, and the share (60%) is unchanged.
- **Reproduced:** Ike placed beside his bed and the townsfolk 50 m from home before the check. Old code: 1 asleep / 46
  awake, `bedT 21`. New code: pass.
- **Fix (game-time wait, `agent/api.js`):** count game seconds since 23:00 and judge the town only once at least
  `giveUp + 4` s have run (still ending early once "most" is true). The bar is the same 60%.

### 3.5 underground: Outpost Nine's holdout - challenged once, then shot at

- **Symptom:** `warned:false` and the drone's `flew` tiny (it should cover > 2 m in 4 s).
- **Cause (state from the check before):** "walk down Outpost Nine's hatch" takes you to level 1 at standing 0 and back
  up. The holdout sees you every time and leaves its record `warned` with **~1.3–1.5 s left on the warning** (6 of 6
  runs measured). `warnT` only counts down while the site is live, so the next visit, the holdout check, arrives with
  the warning nearly spent. If the drone or a soldier sees you at the foot of the stairs as it runs out, `hostileNow()`
  fires. Every soldier who sees you takes you as `target` and `grudge`, and a soldier with a target skips the challenge
  logic for good. The drone holds a grudge too, and a hostile drone that sees you hovers 6–9 m off (so it "flew" almost
  nothing). The check resets `alert` to `calm` before the challenge test, but not the soldiers' targets, so: `warned:false`.
  Whether the drone or a soldier is looking at the foot of the stairs in those frames is where the run-to-run variation comes in.
- **A second leg (state):** your roles bias every faction's reading of you (up to ±50, `systems/roles.js`). The check
  means a reading it controls (standing 0, then 50 for the drone's round). With a positive bias of 20 or more (staged)
  the soldiers read you as friendly at standing 0 and hail you instead of challenging: `warned:false` reproduced.
  Real roles move the Remnant between −31 and +13, so this is defensive staging, not the measured cause.
- **Fix (staging, `agent/underground-api.js`):** underground `stage()` calms the site's record (`alert`, `warnT`) before
  entering, and the holdout check resets the roles' bias as the world-memory `stage()` does. The claim (challenged once,
  then shot at) is unchanged. The underground section stays 11/11, and the walk-down-then-holdout pair passes 3/3.

### 3.6 doors, crew FALL BACK, storeys raider: not reproduced

These three pass alone (5/5 each) and did not fail in the hunting runs or the three proof batteries (§9). Hypotheses
ruled out with runs:

- **doors: planks** (`plain held=true`): the door picked (each of the 7 nearest gives in 6.5–8 s), the hour (23, 3, 18),
  the character budget (full; the infected are never recycled), the security bulls (none left near), a burning car
  beside the door, and the sections before it (understreet, wrecks, occupations, materials, doors, gadgets, security).
- **crew order FALL BACK**: refusal (MAN THE GUN is refused below trust −25; a hire starts at 10, and generic rows have no
  flaw), the crew section run whole.
- **storeys raider**: the hour (16 timed trials, 3–15 s day and night against 20 s), fear (it only scatters the unarmed).

**What was added instead:** each now reports, *only when it fails*, everything needed to name the cause on the first
sighting. Planks: each infected's distance, whether it is working the door, who it is after and how, its memory, fire
and layer, and where you stand. FALL BACK: each member's order, seat or deck, distance to the rig, speed, stuck time,
trust, and where the rig is. Storeys: the building, the stair foot, the raider's state, stuck, hold, flee, cower,
knockdown, tactics, and line of sight. Plus the `[entry …]` tag on every failure.

### 3.8 water: a boat's heave, pitch and roll follow waveAt under its hull

- **Symptom:** `the hull barely moved: heave span 0.15`.
- **Cause (window vs. physics):** the check took 12 samples 0.35 s apart, a 4.2 s window. The long swell (62 m) has a
  ~6.3 s period, and the heave is the sum of six components. At some phases the sum sits in a lull between wave groups.
  Which phase the check meets depends on `waves.t`, so on how much game time ran before it (§3.0, reason 1).
- **Measured** (`scratchpad/battery-stable/heave.mjs`, the same sum and hull sampling as `world/waves.js`, gunboat 7.2 × 2.8 m,
  every start phase 0–3000 s in 0.05 s steps):

  | window | min span | phases ≤ 0.15 m |
  |---|---|---|
  | 12 × 0.35 s = 4.2 s (old) | 0.058 m | 1.20% |
  | 12 × 0.6 s = 7.2 s (new) | 0.288 m | 0% |

- **Fix (`agent/sealife-api.js`):** 12 samples 0.6 s apart. The bar (span > 0.15 m) and the per-sample pitch and heave
  match against `waveAt` are unchanged.

### 3.9 tactics band: a rifleman holds 25-45 m (he backs off from 12 m, stays in the band)

Added after the first eight, at the lead's ask: on main `ca1d5c4d` it failed both lead batteries with
`distance 9.8-9.8 band 25.0-45.0 role pin` (P3 here: `23.8-23.8`). He "never moved at all".

- **Cause 1 (staging: he killed you).** He shoots while he moves. Measured (`scratchpad/battery-stable/band-hurt.js`, the
  check's own staging, 10 s): his hits alone came to 66, 85, 102 and 112 hp in four runs, against your 100. A dead target ends
  his fight (`ai.js`: `!t.alive` → `target = null`), so he goes idle and wanders back toward his spawn point 12 m from you
  at 1.6 m/s, and stands there. His `tac` is left as it was, so the detail still read `role pin`. 9.8 m is the idle
  walk back toward the spawn; 23.8 m is the same death caught later in the walk back. A battery reaches the crew section with
  your hp worn down by earlier checks, so it happens more often there than alone (a solo battery heals you on the way in).
  Proof: a probe that tops your hp only at the start shows `DEAD tgt0 sp1.6` and the walk back in 3/3 runs at 25 hp.
- **Fix 1 (`agent/crew-api.js`):** `g.godMode` is on for the check's 16 s and restored after (in a `finally`). He still
  fights for real (aims, fires, suppresses); only the damage to you is off. The claim (lo ≥ 25 and hi ≤ 45 over the last 4 s) is unchanged.
- **Cause 2 (real game bug: a goal at the band's edge).** `steer` stops `T.arrive` (0.9 m) short of a goal. Moving out
  from 12 m, his plans often pick an open spot just inside the band (25.1–25.6 m: the travel cost and the `stay` loyalty
  make the nearest in-band spot win), so he stops 0.9 m short, at 24.2–24.9 m, out of his own band. 1 run in about 15 settled at 24.9 m.
- **Fix 2 (`systems/tactics.js` `plan`):** after the search, an **open** goal (no cover) within `arrive` of a band edge
  (from `b0 − 2·arrive` up to `b0 + arrive`, or `b1 − arrive` up to `b1 + 2·arrive`) moves along the line from the threat to
  `b0 + arrive` (or `b1 − arrive`), if that point is not blocked. A cover goal stays put, since the thing it hides behind
  does not move. Retreats are left alone. It is two hypots at plan rate, with no allocation.
- **Measured after:** 22 slots (the probe directions spin by `c.slot`), every run where you lived settled at 25.2–29.7 m.
- **Diagnostic (on failure only):** the detail adds his position, sight and LOS, storeys, hold/cower/knock/flee, state,
  whether he still targets you, **whether you are down**, your hp, his goal, cover, `why`, plan count and path.

## 4. Formulas

- **Town give-up:** asleep-or-floor by `t_bed + TOWN_NIGHT.giveUp` (25 s). The check now waits
  `max(Ike + 20 s, 23:00 + giveUp + 4 s)` on the game clock (each step is fixed-dt, so this is game time).
  Example: Ike asleep at 1 s → old window 21 s (fails a town walking 60 m), new window ≥ 29 s (all down at 25 s).
- **Swell window:** a window `w` over a component of period `T` spans at least `A(1 − cos(π w / T))` for `w < T`. At
  `w = 4.2 s`, `T = 6.3 s` that is 1.5 A on its own, but the other five components can cancel it. Once `w > T` the long
  component alone spans 2A = 2 × 0.62 × 0.42 ≈ 0.52 m before cancellation. Measured worst: 0.288 m.

- **Residents' progress:** `rem = |wp_ri - c| + Σ_{i≥ri} |wp_{i+1} - wp_i|` (no route: `|goal - c|`). Wedged when `rem` has
  not fallen below `best - 0.3` m for 4 s. Example: a west front door, the stop 50 m east. The straight distance grows
  for the first ~12 m (out and round the house), which read as wedged at 4 s. Along the route it falls 1.6 m/s from the
  first step.
- **A leaf at its stop:** the push-out left over after the leaf yields nothing (`rem` m) is applied along the leaf toward
  its free end, so an AI walker pressed square on slides `rem` per frame round the tip (1 m leaf, 1.6 m/s: under 1 s).

- **Band edge:** for an open goal at distance `d` from the threat, band `[b0, b1]`, `A = T.arrive` = 0.9 m:
  `d' = b0 + A` if `b0 − 2A < d < b0 + A`; `d' = b1 − A` if `b1 − A < d < b1 + 2A`; else `d' = d`. Example: rifle
  `[25, 45]`, a goal at 25.1 m → 25.9 m; he stops ≤ 0.9 m short → ≥ 25.0 m.

## 5. Edge Cases

- A check that fails **only** in the full battery: read the new `[entry …]` tag on its detail (§6, tools) first. It
  names whatever was off neutral as the check began (dialogue, pack, car, deck, underground, upstairs, crouch, the hour,
  the weather, the character budget, where you stood).
- A full pack before any check that kits you up: stage room first (§3.1). The game spilling to the ground is correct.
- A check that visits a guarded site: leftovers on the site's own record (an alert, a warning running) carry into the next
  visit. Stage the record, not just the people (§3.5).
- A walker with no route (the planner found none): the watchdog falls back to straight-line distance, as before.
- A check whose fighter can kill you inside its window: if you die, the fight ends and the fighter goes idle (correct game
  behaviour). Keep you alive (`g.godMode`) for checks about where they stand, not about their damage (§3.9).
- A band goal next to a wall: the nudged point is tested with `pointBlocked`; if it is blocked the goal stays at the edge.
- You, or a car, pressing a leaf at its stop: unchanged (the push-out only). Only the AI's walkers turn round its end.

## 6. Dependencies

- **Tools added (debug-only, read-only):**
  - `runSelfTest` appends `[entry <state>]` to every **failing** check's detail (`entryState(g)` in `agent/api.js`).
    Passing checks are untouched.
  - `globalThis.__selftestNow` (the check in flight) and `globalThis.__selftestResults` (results so far) can be read from
    outside while a battery runs, or after the bridge drops.
  - Richer failure details (only on failure) for the planks, crew FALL BACK, storeys raider, ring residents' run, and
    Outpost Nine checks.
- **Game code changed (real bugs):** `systems/residents.js` `walk` (the progress watchdog measures along the route),
  `systems/interiors.js` `leafCircle` (a leaf open to its stop turns an AI walker round its free end), `systems/tactics.js`
  `plan` (an open goal at a band edge goes `arrive` into the band, §3.9). Every other change is
  in `agent/*` (staging, waits, failure details).
- **Systems these checks read:** `systems/clone.js`, `systems/inventory.js` (stow, groundAt, nearest), `systems/ai.js`
  (toBed, TOWN_NIGHT), `world/waves.js` (ride, sum), `data/waves.js` (SWELL), `systems/residents.js`, `systems/interiors.js`,
  `systems/underground.js` (soldier, drone, hostileNow, warnT), `systems/roles.js` (the factions' bias), `data/society.js`
  (TIERS).
- **Back-references (added):** WEB_STREAMING.md §1.3 R2 (the watchdog and the leaf), WEB_SURVIVAL.md §3.5 (the give-up),
  WEB_UNDERGROUND.md §6 (stage calms the record), WEB_CREW.md §6 (the band-edge goal); `.claude/skills/dsoa-land/SKILL.md` §4 (state from earlier checks) is
  the rule this document applies.

## 7. Tuning Knobs

None added. The knobs these checks lean on, with their safe ranges, stay in their own docs: `TOWN_NIGHT.giveUp` 25 s
(15–40; the town check waits giveUp + 4 s), `WAVES.kind.ocean.amp` 0.62 (0.3–1.2; below ~0.35 the 0.15 m bar needs a
longer window), `SWELL[0].L` 62 m (period ∝ √L; past ~95 m the 7.2 s window is under one period again).

## 8. Acceptance Criteria

- Three full batteries on fresh pages, under load (the other lanes' harnesses running), with none of the eight checks
  failing. Results are in §9.
- Each of the eight checks run alone 5 times: 5/5 each. Results are in §9.
- `node --check` on every touched file; `node tools/ip-lint.mjs` with 0 deny.

## 9. Proof

All on branch `feat/web-battery-stable`, port 3492, each battery on a **fresh page** (a new tab, nothing run in it before),
with the lead's arguments exactly (`{"cmd":"selftest","args":{"budget":2900},"timeoutMs":3000000}`). The other lanes'
harnesses were left running (4–5 headless games besides this one).

| battery | result | time | the eight |
|---|---|---|---|
| P1 | **585/585** | 1982 s | all pass |
| P2 | **585/585** | 958 s | all pass |
| P3 | 584/585 | 955 s | all pass. The one failure is `tactics band: a rifleman holds 25-45 m` (a known flake, not one of the eight); its new tag reads `[entry arms:holstered …]`, a lead for whoever takes it |

Before the fixes: a full battery on the base code 583/585 (grapevine eat-a-body and understreet
manhole failed, neither one of the eight), and one stopped at 495 checks with the eight that had run all passing.

Alone, 5 fresh pages each, final code:

| check | `only=` | result |
|---|---|---|
| water: a boat's heave | `water: a boat's heave` | 5/5 |
| the town sleeps | `the town sleeps` | 5/5 |
| ring residents: by day | `ring residents: by day one of a family` | 5/5 |
| clone: reaching your husk | `clone:` (the chain it needs: it reclaims the husk the checks before it lay) | 5 × 9/9 |
| doors: planks | `doors: planks across` | 5/5 |
| Outpost Nine's holdout | `Outpost Nine's holdout` | 5/5 |
| crew order FALL BACK | `crew order FALL BACK` | 5/5 |
| storeys: a raider with a grudge | `storeys: a raider with a grudge` | 5/5 |

`node --check` on every touched file. `node tools/ip-lint.mjs`: 0 deny, 0 review.
