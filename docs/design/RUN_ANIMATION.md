# THE RUN — running that reads from the driver's seat

**Status:** SPEC (owner ask 2026-07-08 evening, after the fix-pack playtest).
**UNBLOCKED 2026-07-08:** `ANIMATION_FIX_PACK_2.md` shipped (the knee law + real squat) —
the legs hinge correctly now, so this top-down counter-rotation pass is clear to build on
a solid base. Still SPEC (not yet built).
**Base (already SHIPPED, `ANIMATION_FIX_PACK.md` §3.3):** the anti-skate stride solve (feet match the ground at any speed — skate <2%, was a 2.3× moonwalk), whole-body bounce, run lean, ~90° elbow pump, knee lift, heel-up push-off — proven side-on against the mannequin sheet's HUMAN MOVEMENTS REFERENCE strip (`run_form_sim` 12/12, `render_body` BODY_run_side).
**This spec:** the run's remaining gap is **the camera it's actually watched from.** DRIVN is played top-down (`camera_rig.gd`); from above, the strongest running tell isn't the leg silhouette — it's the **shoulder line working against the hips**. Today the chest's yaw carries only turn-lead and two-hand blading; it never swings with the stride, so a sprinting body reads stiff from the game camera even though the side view is right.

---

## 1. Overview

Add the missing top-down run reads to the one procedural rig, as MOTION rows: **stride counter-rotation** (the shoulder line oscillates against the pelvis with each step — the #1 overhead tell), an **asymmetric armed carry** (a lowered weapon quiets its arm's pump), and a **camera-truth acceptance loop** (render + sim from the real game pitch, not just the side view). Locomotion stays procedural sines (owner law, 2026-07-07); every knob lands in `MOTION["gait"]` and mirrors into MotionForge in the same commit.

## 2. Player Fantasy

From the driver's seat of the world — the high camera — every gait tells you something before the name tag does. A sprinter's shoulders saw against their hips, arms pumping, head steady: you read "running for their life" in half a second, at a glance, from directly above. A creeping scav barely stirs. A survivor jogging with a lowered machete carries it — one arm quiet, one arm working. Nobody glides, nobody twists like a doorknob, and the pistol raise you already like is untouched.

## 3. Detailed Rules

1. **STRIDE COUNTER-ROTATION (the headline).** The chest yaw gains a stride-phase component: shoulders swing WITH the arm-swing phase (right shoulder forward when the left leg strides — matching the existing arm law at `puppet.gd` free-arm block), pelvis untouched (it already tracks the feet via `legs_pivot`, caller-owned). Composed ADDITIVELY with the existing `_twist` (turn-lead + two-hand blade): `torso.rotation.y = _twist + stride_yaw`. The waist carries its usual 0.45 share; the neck keeps countering (head truer than chest — already law).
2. **It scales with effort, not just speed.** `stride_yaw = stride_twist · sin(_phase) · mix(walk_share, 1.0, run_blend)` — a walk gets a whisper (`walk_share` ~0.35), a sprint gets the full saw. Zero when idle (phase frozen — no drift).
3. **ARMED CARRY ASYMMETRY.** When armed with the gun LOWERED (running with a raised gun is already forbidden — combat stance is walk-speed law, `player_3d.gd`), the weapon arm's counter-swing and elbow pump scale by `carry_pump_mult` (~0.6): the tool arm CARRIES, the free arm WORKS. Unarmed sprint stays symmetric. The raised-pistol pose is untouched (the protected contract).
4. **AIM AND VISION ARE SACRED.** `stride_yaw` writes `torso.rotation.y` — a cosmetic chest twist. `aim_arm` is a torso SIBLING (the aim-sibling law) and the vision cone rides `body_yaw` on the player root, so neither the twin-stick gun direction nor the stealth cone moves a degree. Asserted, not assumed (§8).
5. **CAMERA-TRUTH ACCEPTANCE.** `render_body` gains TOP-DOWN walk/run captures at the live game camera's pitch (read from `camera_rig.gd`, never hardcoded), and `run_form_sim` gains counter-rotation asserts. The reference strip stays the side-view bar; the game camera becomes the second, equally binding bar.
6. **Every human inherits it.** Survivors/crew/motorists/raiders share `animate()` — no call-site changes; per-survivor `gait` multipliers keep individuals distinct.
7. **Flight-phase polish is P2**, noted for MotionForge experimentation only: at `run_blend > 0.85` the existing `column_bob` + `ankle_push` already imply airtime; a dedicated both-feet-off window is a tuning session away, not new architecture — and NOT part of this spec's acceptance.

## 4. Formulas

**Stride yaw:** `stride_yaw = stride_twist · sin(_phase) · mix(walk_share, 1.0, run_blend)`
- `stride_twist` (row, stock **0.14 rad ≈ 8°**, range 0–0.25; >0.3 reads swimmy)
- `walk_share` (row, stock **0.35**, range 0–0.6)
- `run_blend` = existing `clamp((v − 4.0)/(7.2 − 4.0), 0, 1)`; `sin(_phase)` = the existing stride phase (same sine the arms already use — free/left arm back exactly when left leg forward, so shoulders and arms stay phase-locked by construction).
- Worked: sprint v=7.2 → shoulder line oscillates ±8.0°/step at ~5.8 steps/s; brisk walk v=4.2 (run_blend 0.42) → ±0.14·(0.35+0.65·0.42)·57.3° ≈ ±5.0°; creep v=1.5 → run_blend 0 → ±2.8°·(sin taper) — present, subliminal.

**Carry asymmetry:** armed ∧ ¬raised → weapon-arm `swing_mult = carry_pump_mult` (row, stock **0.6**, range 0.3–1.0), elbow pump target `max(elbow_pump · carry_pump_mult, elbow_rest)`. Free arm unchanged. Worked: sprint with lowered machete → free elbow 1.5 rad pumping, tool elbow ~0.9 rad steadied — one working arm, one carrying arm, obvious from above.

**Composition bound:** `|_twist| ≤ 0.55 (turn) + 0.35 (blade)`; adding `|stride_yaw| ≤ 0.25` keeps worst-case chest yaw < 1.15 rad — under the visual shear where box shoulders detach from the chest silhouette (empirically ~1.3; the clamp is the row range, no code clamp needed).

## 5. Edge Cases

- **Sprint into a turn:** `stride_yaw` superimposes on turn-lead `_twist`; both are chest-cosmetic. Worst case bounded (§4). No interaction with `legs_pivot` (feet keep tracking the move vector).
- **Two-hand blade while trotting** (shotgun lowered, moving 4–5 m/s): blade only applies when `raised`; lowered longarm takes carry asymmetry instead — no double-twist stack.
- **Strike mid-run:** `ProtoStrikePlayer` owns `torso_twist` for its duration (strike gate already suppresses animate's chest writes); `stride_yaw` resumes on the strike's settle — the lerp hand-off eats the mismatch, no pop (same law as the swing hand-off).
- **Crouch-run:** `_crouch` already scales stride amplitude ×0.55; `stride_yaw` inherits the same taper through `sin(_phase)`'s amplitude-solved cadence — a low scuttle stays coiled, not sawing.
- **Wounded limp:** the limp shortens one leg's swing but the phase is shared — shoulders keep the honest rhythm; a limping sprint reads hitched, which is correct.
- **Aim/vision invariants:** with `stride_twist = 0.25` forced and a fixed `aim_override`, the muzzle ray direction and the vision-cone yaw are byte-identical across a full stride cycle (sim-asserted).
- **Net ghosts / NPCs:** same `animate()` path; no packets change; a remote sprinter saws identically from the same synced speed.

## 6. Dependencies

- **`puppet.gd`** — the stride-yaw term + carry asymmetry in the arm blocks; rows in `MOTION["gait"]`.
- **`ANIMATION_FIX_PACK.md`** — the shipped base this stacks on (anti-skate, run form); its "EXECUTED" header gains a pointer here for the follow-up.
- **`BODY_RIG_REFERENCE.md`** — the run-law summary appended there points at this spec for the top-down pass (bidirectional).
- **MotionForge** (`tools/motionforge/server.mjs` DEFAULTS + `index.html` seed/labels + README) — `stride_twist`, `walk_share`, `carry_pump_mult` mirrored in the same commit (the paid-for clobber gotcha).
- **`camera_rig.gd`** — supplies the acceptance pitch for `render_body`'s top-down captures (read, not duplicated).
- **`run_form_sim`** — grows the counter-rotation + invariant asserts; stays the one locomotion gate.
- **`vision_cone.gd` / `player_3d.gd`** — untouched, but named because rule 4's invariant is about them.

## 7. Tuning Knobs

| Row | Stock | Safe range | What it tunes |
|---|---|---|---|
| `stride_twist` | 0.14 | 0.0–0.25 | Shoulder-vs-hip saw per step — THE top-down run read; 0 = today's stiff back |
| `walk_share` | 0.35 | 0.0–0.6 | How much of the saw a walk keeps; high values make strolling look urgent |
| `carry_pump_mult` | 0.6 | 0.3–1.0 | Lowered-weapon arm damping; 1.0 = symmetric (tool flails), 0.3 = arm pinned |
| (existing) `elbow_pump` | 1.5 | 1.1–1.8 | Sprint elbow lock the carry mult scales against |
| (existing) `head_stabilize` | 0.5 | 0.0–1.0 | Eyes-level counter — raise it if the new saw makes the head read wobbly from above |

Balance note: pure look — zero gameplay numbers touched (speeds, noise, stamina all live elsewhere and are not knobs here).

## 8. Acceptance Criteria

**`run_form_sim` (extend):**
1. At v=7.2, `torso.rotation.y` oscillates with amplitude `stride_twist` ±30% at the stride frequency (peak-count over one measured cycle matches steps ±1) while `legs_pivot.rotation.y` stays 0 (hips to the feet-tracker, shoulders saw — separation is real).
2. At v=1.5, chest-yaw amplitude ≤ 0.06 rad (a creep doesn't saw).
3. INVARIANT: with `aim_override` fixed and `stride_twist` forced to max, `muzzle_world()` direction and the player `body_yaw` are identical across 2 full cycles (twin-stick + vision-cone untouched).
4. Armed-lowered sprint: weapon-side elbow ≤ `elbow_pump·carry_pump_mult + 0.1` while free elbow ∈ [1.3, 1.7]; unarmed sprint stays symmetric (|left−right| < 0.15).
**`gunfeel_sim`:** still 37/37 byte-identical (the pistol contract survives a third pass).
**Render acceptance:** `render_body` TOP-DOWN walk + run captures at the `camera_rig` pitch — the shoulder saw must be visible in the run frame and absent in the walk frame, judged by eye next to the existing side-view sheet.
**Playtest DO→EXPECT (PLAYTEST_GUIDE):** sprint a circle in the open (V to views if needed) → from the game camera the shoulders visibly work against the hips and the arms pump; draw the pistol standing → exactly as before; sprint with the machete lowered → the blade arm carries while the off arm pumps.

---

## 9. Build order (sim-gated, one commit each)

| # | Task | Files |
|---|---|---|
| 1 | `stride_twist`/`walk_share` rows + the stride-yaw term (+ waist/neck shares) | `puppet.gd` |
| 2 | `carry_pump_mult` armed-lowered asymmetry | `puppet.gd` |
| 3 | `run_form_sim` asserts 1–4 (incl. the aim/vision invariant) | `tests/run_form_sim.gd` |
| 4 | MotionForge mirror (DEFAULTS + seed + labels + README row table) | `tools/motionforge/*` |
| 5 | `render_body` top-down captures at the live camera pitch + doc pointers (fix pack, body reference) | `tools/render_body.gd`, docs |
