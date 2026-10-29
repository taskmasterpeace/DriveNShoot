# WEB BATTERY STABILITY

## 1. Overview

Eight selftest checks failed in most full batteries on a loaded PC (6–9 game harnesses at once) and passed when run alone.
That slowed every lane's landing. This document records the **real cause of each**, the **fix at the source**, and the
tools added so the next flake names its own cause. One rule held throughout: **never weaken what a check proves**. We
re-staged or retried the STAGING, never the claim. Every bar, count and distance a check asserts is the same as before.

| check | cause (one line) | kind | fix |
|---|---|---|---|
| clone: reaching your husk… | a full pack spilled the kit-up into a ground pile on the husk's spot | state an earlier check left | staging |
| the town sleeps… | it judged the town "Ike + 20 s", before the game's own 25 s give-up had run | wall-clock-like window, not the game rule | game-time wait |
| water: a boat's heave… | a 4.2 s sample window is shorter than the 6.3 s swell; ~1% of phases sit in a lull | window vs. physics | longer window |
| (the others) | see §3 | | |

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

## 4. Formulas

- **Town give-up:** asleep-or-floor by `t_bed + TOWN_NIGHT.giveUp` (25 s). The check now waits
  `max(Ike + 20 s, 23:00 + giveUp + 4 s)` on the game clock (each step is fixed-dt, so this is game time).
  Example: Ike asleep at 1 s → old window 21 s (fails a town walking 60 m), new window ≥ 29 s (all down at 25 s).
- **Swell window:** a window `w` over a component of period `T` spans at least `A(1 − cos(π w / T))` for `w < T`. At
  `w = 4.2 s`, `T = 6.3 s` that is 1.5 A on its own, but the other five components can cancel it. Once `w > T` the long
  component alone spans 2A = 2 × 0.62 × 0.42 ≈ 0.52 m before cancellation. Measured worst: 0.288 m.

## 5. Edge Cases

- A check that fails **only** in the full battery: read the new `[entry …]` tag on its detail (§6, tools) first. It
  names whatever was off neutral as the check began (dialogue, pack, car, deck, underground, upstairs, crouch, the hour,
  the weather, the character budget, where you stood).
- A full pack before any check that kits you up: stage room first (§3.1). The game spilling to the ground is correct.

## 6. Dependencies

- **Tools added (debug-only, read-only):**
  - `runSelfTest` appends `[entry <state>]` to every **failing** check's detail (`entryState(g)` in `agent/api.js`).
    Passing checks are untouched.
  - `globalThis.__selftestNow` (the check in flight) and `globalThis.__selftestResults` (results so far) can be read from
    outside while a battery runs, or after the bridge drops.
  - Richer failure details (only on failure) for the planks, crew FALL BACK, storeys raider, ring residents' run, and
    Outpost Nine checks.
- **Systems these checks read:** `systems/clone.js`, `systems/inventory.js` (stow, groundAt, nearest), `systems/ai.js`
  (toBed, TOWN_NIGHT), `world/waves.js` (ride, sum), `data/waves.js` (SWELL).
- **Back-references:** `.claude/skills/dsoa-land/SKILL.md` §4 (state from earlier checks), WEB_CLONE_TRAVEL.md,
  WEB_SURVIVAL.md (TOWN_NIGHT), WEB_WATER_LIFE.md.

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

(filled in at hand-back)
