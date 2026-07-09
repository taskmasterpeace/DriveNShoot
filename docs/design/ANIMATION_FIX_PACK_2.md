# THE LEGS ARE WRONG — animation fix pack 2 (the knee law + the real squat)

**Status:** ✅ EXECUTED 2026-07-08 (all 6 tasks). The leg flexion signs are anatomy's now:
knees fold BACK, the crouch is a real forward-knee squat, push-off plantarflexes. Verified
by sim + GPU render (run has no bird-leg — front foot clears toe-up, back foot pushes
toe-down; crouch knees measure 0.30–0.39 m forward of the hips). Sims green: run_form 15
(NEW knee/ankle asserts) · rig_v2 50 · crouch 22 (NEW squat-silhouette guard) · strike 63 ·
unarmed 14 · gunfeel 37 (pistol byte-unchanged) · grip_ik 18. Retune landed as the spec's
budgeted no-kiss iteration (hip_fold 0.98, hip_joint_gap 0.11, torso_scale_min 0.72, crouch
lean 0.22, leg_eff 0.75 for the shorter back-folding stride, ankle_push 0.7 to override the
sole-level counter). Rows stayed positive MAGNITUDES; the engine owns the sign.
*(Original spec below, kept as the record.)*

**Was:** SPEC — owner playtest 2026-07-08 late: *"the crouching doesn't look real"* and
*"the running is bending the leg in an odd direction — the knee doesn't bend like that."*
**Scope:** `puppet.gd` · `data/strikes.json` · `tests/rig_v2_sim.gd` · `tests/run_form_sim.gd` · `tests/crouch_sim.gd` · `tools/render_body.gd` · MotionForge row docs.
**Ordering law:** this pack lands **before** `RUN_ANIMATION.md` executes — never tune the
top-down counter-rotation pass on top of legs that hinge backwards.

---

## 1. Overview

Both complaints are ONE root cause: **the leg chain's flexion directions are anatomically
mirrored under the rig's own sign law.** The law (BODY_RIG_REFERENCE, verified by rotation
math: a hanging limb rotated by +X moves its tip toward −Z) says **positive = forward**.
That is correct for elbows — a forearm folds FORWARD — and 022a3d1 authored arms right.
But a **knee is the elbow's MIRROR**: a calf folds BACKWARD (heel toward the butt), i.e.
**NEGATIVE** under the same law. The rig authored knees positive everywhere, the sims
codified it, and the crouch compounded it by also folding the hips backward against its
own comment. Fix pack 1's sprint knee-lift (`knee_lift_run`) made a subtle wrongness
glaring — more bend, wrong way.

### The defect ledger (receipts, continuing the fix-pack numbering)

| # | Owner sees | Root cause (verified) |
|---|---|---|
| D8 | **Run: "the knee doesn't bend like that"** — the swing leg's shin kicks FORWARD of the thigh (bird/backwards knee), worst at sprint | Every gait knee write is POSITIVE: `knee = kr + crouch_knee + (kf·amp + klr)·max(0,sin(φ+kph))` ([puppet.gd:612-614](../../game/proto3d/puppet.gd)). Positive = calf forward = knee apex pointing BACKWARD. `rig_v2_sim:95` codifies it ("one-way hinge, min never below zero") — the assertion enforces the wrong direction. The comment at rig_v2_sim:97 says "only folds forward" — true for ELBOWS, mirrored for knees. |
| D9 | **Crouch "doesn't look real"** — a Z-shaped stool-sit: knees drift BEHIND the hips, feet sneak forward | Two stacked mirrors: (a) the crouch hip fold SUBTRACTS (`hip_l.rotation.x -= hip_fold` [puppet.gd:598-600]) — thighs swing BACKWARD — directly contradicting its own comment ("both hips fold forward"); (b) `crouch_knee` +1.30 folds calves FORWARD. A real squat is the exact opposite: **thighs pitch FORWARD (knees travel in front of the hips), shins angle back, heels planted.** The ground-law plant (fix pack 1) put the boots ON the floor — but under a mirrored pose. |
| D10 | (found in this audit) push-off ankle is inverted | Foot geometry: toe extends −Z; +X rotation lifts the TOE (dorsiflexion — math: (0,0,−1) under +θ → y′=+sinθ). `ankle_push` ADDS positive on the trail leg ([puppet.gd:617-619]) = toes-up at push-off. Real push-off is plantarflexion (heel up, toe down) = **negative**. The row's comment claims "heel-up" — the sign delivers the opposite; the render read okay only because the counter-level term dominates at stock 0.5. |

**Same-class data authored to the wrong knee direction** (all positive where anatomy is negative): riding pose knees +1.35 ("calves folded back" — they fold forward) [puppet.gd:971-972]; dead-sprawl knees +0.8/+0.3 [puppet.gd:1015-1016]; `strikes.json` kick chamber `knee_r: 0.9` (a chamber tucks the shin BACK) and bat load `knee_r: 0.18` (the "sit" bends the back knee — backward, not forward).

**What is explicitly protected:** the SIGN LAW itself (positive = forward stays global — arms/elbows/strikes/aim are CORRECT and untouched); the anti-skate stride solve and cadence (amplitude math is direction-agnostic); the ground-law sole plant (`_lowest_sole_y()` measures live transforms — works for any fold direction); the pistol hold (gunfeel 37 byte-guard); the two-hand grip IK (arms only).

## 2. Player Fantasy

Legs that work like legs. A sprinter's knee drives up with the shin trailing folded BENEATH it — heel kicking toward the butt, toe pointing down off the back leg — like the reference strip, like every human who ever ran. A crouch is a SQUAT: knees forward over the toes, hips sunk back and low between the heels, shins bracing — a coiled scavenger you'd believe could spring, not a mannequin perched on an invisible stool. Nobody's leg ever hinges the wrong way again, in any pose, on any body.

## 3. Detailed Rules

1. **THE KNEE LAW (the elbow's mirror).** Under the sign law, a knee flexes **NEGATIVE only**: `knee.rotation.x ∈ [−max_flex, 0]`. Every knee write flips direction — gait follow-through, crouch coil, sprint knee-lift, riding, dead sprawl, strike rows. The magnitudes (how much) stay; the direction (which way) becomes anatomy's.
2. **ROWS ARE MAGNITUDES; ANATOMY OWNS DIRECTION.** MotionForge rows (`knee_follow`, `crouch_knee`, `knee_lift_run`, `knee_rest`, `ankle_push`…) remain POSITIVE numbers — sliders stay intuitive "how much" knobs, no negative-slider weirdness, no `motions.json` migration. The code applies the anatomical sign at the write site. This is the law that prevents re-introducing the bug from a forge save.
3. **THE REAL SQUAT (D9).** The crouch re-poses to the human shape: hips fold **FORWARD** (`+= hip_fold`, matching the existing comment at last), knees fold **BACK** (−), shins near vertical, torso already leaning forward over the knees (shipped). The ground-law plant machinery is untouched — it re-plants soles for ANY pose. Target silhouette, side view: knee joints clearly FORWARD of the hip joints, heels down, head over mid-foot.
4. **ANKLE POLARITY (D10).** Push-off = **negative** (plantarflex, toe down, heel driving) on the trail leg. Add the missing half: a small **positive** dorsiflex on the SWING leg (`swing_toe_up` row, toes clear the ground mid-swing — the reference strip shows it). The existing counter-level term stays as the base.
5. **DATA RE-AUTHOR (same commit as the code flip, or the sims can't be green in between):** riding knees → −1.35 (calves gripping back along the tank, as the comment always intended); dead sprawl knees → negative asymmetric pair (−0.8/−0.3); `strikes.json` kick: chamber `knee_r: −0.9` → snap toward −0.1 at contact (the shin whips out from a REAL chamber); bat load `knee_r: −0.18` (the back-knee sit). Re-capture in the POSE editor afterward for taste — values above are the mechanical re-sign.
6. **THE ASSERTIONS FLIP WITH THE CODE.** `rig_v2_sim` §3/§5: "one-way hinge" becomes `knee_max ≤ +0.001` and "bends past rest" becomes `knee_min < −(kr + 0.05)`; §7 dead-sprawl knee signs; the §5 crouch coil sign. `run_form_sim`: knee-drive amplitude measured as NEGATIVE flexion; ankle push-off asserts TOE-DOWN (foot tip global Y < ankle Y on the trail phase). `crouch_sim` gains the D9 silhouette check (§8.3). A flipped assertion is part of the fix, not test-weakening: the OLD assertions were codified wrongness.
7. **EYES-ON GATE.** `render_body` re-shoots `walk_side` / `run_side` / `crouch_side` after the flip; acceptance is the knee apex pointing FORWARD (−Z) mid-stride and the squat silhouette — judged against the reference strip's RUN panel and the mannequin sheet's KNEE (HINGE) diagram, which draws the fold direction this spec restores.

## 4. Formulas

**Direction table (the one-page law, derived from v′ = rot_x(θ)·v on hanging geometry):**

| Joint | Flex motion | Sign under the law | Today | Fix |
|---|---|---|---|---|
| Elbow | forearm forward/up | + | + ✓ | none |
| Knee | calf back (heel→butt) | **−** | + ✗ | flip |
| Hip (squat) | thigh forward | + | − ✗ | flip |
| Ankle push-off | toe down (plantarflex) | **−** | + ✗ | flip |
| Ankle swing-clear | toe up (dorsiflex) | + | absent | add |

**Gait knee (replaces the positive form):** `knee = −kr − (kf·amp + klr)·max(0, sin(φ + kph))·limp − crouch_knee·c` — identical envelope, mirrored direction; ranges unchanged (kf 0.55, klr 0–1.2, kr 0.06). Worked at sprint (amp 0.85, klr 0.6): peak flexion −(0.06 + (0.47+0.6)) ≈ **−1.13 rad** ≈ 65° of true knee bend on the swing leg — the reference's trailing shin.

**Squat pose at full crouch (c=1), stock retune:** `hip_fold_max` 0.70 → **+0.85** (thigh 49° forward-down), `crouch_knee` 1.30 → **1.00** magnitude (knee −1.00) → shin world angle = +0.85 − 1.00 = **−0.15 rad** (near-vertical, braced slightly back — heels stay down). Fold-drop by the same cosine law as fix pack 1: `0.42·(1−cos 0.85) + 0.38·(1−cos 0.15)` = 0.142 + 0.004 = **0.146 m** pelvis drop from the legs; the sole-plant correction trues the remainder exactly as today (it is direction-agnostic). Knees-forward offset: knee joint sits `0.42·sin(0.85) ≈ 0.32 m` toward −Z of the hip — the squat read, and the §8.3 assert number.

**Ankle:** trail phase `foot += −ankle_push·max(0, −sin(φ_side))` (toe down, stock 0.5, range 0–0.8); swing phase `foot += swing_toe_up·max(0, sin(φ_side))·run_blend` (new row, stock **0.25**, range 0–0.5).

## 5. Edge Cases

- **The plant survives the mirror:** `_lowest_sole_y()` reads live foot-box transforms, so the crouch re-pose re-plants automatically. If the new shin angle rocks the sole, the existing foot counter-level term (and full-counter blend at crouch) trues it — asserted, not assumed.
- **No-kiss under the new squat:** thighs now sweep FORWARD beneath the forward-leaning, compressed torso — the overlap band moves to the chest's FRONT face. `crouch_sim`'s AABB no-kiss checks re-judge it; the standing levers (`hip_joint_gap`, `torso_scale_min`) are the tuning valves if a kiss appears. This is the one visual-risk zone of the pack — expect one tuning iteration.
- **Limp + knee law:** the limp's stiff-leg clamp (`max(rot, −0.12)` on the hip) is hip-side and unaffected; the bad leg's reduced swing now correctly reduces FLEXION magnitude.
- **Kick strike vs the knee gate:** the kick tween owns `hip_r`/`knee_r` while `_kick_t > 0` — unchanged; only the row VALUES re-sign. The contact still lands at hip +1.45 (forward — hips are correctly signed for kicks).
- **Old saves / NPC rows:** appearance rows carry no knee values; nothing persisted stores joint angles — zero migration.
- **motions.json overrides:** existing overrides are magnitudes on the same row names — they keep working verbatim under rule 2 (code owns direction). A NEGATIVE value in a stale hand-edited file clamps to 0 magnitude with a `push_warning`, never a re-inverted knee.
- **The mannequin sheet is the tiebreaker:** its JOINT MOVEMENT GUIDE (KNEE panel) draws flexion backward; any future dispute about a leg sign resolves against that image, not against a sim assertion (assertions were wrong once — the sheet wasn't).

## 6. Dependencies

- **`puppet.gd`** — every knee/ankle/crouch-hip write site (D8/D9/D10); the riding + dead poses.
- **`data/strikes.json` + `strike_player.gd` code floor** — kick + bat knee values re-signed IN THE SAME COMMIT (floor/file parity law from fix pack 1's D6).
- **`rig_v2_sim` / `run_form_sim` / `crouch_sim`** — assertion flips + the new silhouette check; these are the gates, updated as part of the fix (rule 6).
- **`render_body.gd`** — re-shoot the three side captures; no code change beyond re-run.
- **MotionForge** — row VALUES unchanged (magnitude law); only `README.md` + slider labels gain "(magnitude — anatomy owns direction)" and the new `swing_toe_up` row mirrors into DEFAULTS/seed (the clobber gotcha).
- **`ANIMATION_FIX_PACK.md`** (executed) — this is its correction pass; its header gains a pointer here. **`RUN_ANIMATION.md`** (banked, unexecuted) — BLOCKED BY this pack (ordering law); its status line gains the same pointer. **`BODY_RIG_REFERENCE.md`** — its joint table's knee/ankle rows gain the explicit flex direction so the law is written where the rig is defined.
- **`quadruped.gd`** — OUT of scope: the dog's legs are authored to its own gait and read correctly; do not "harmonize" it in this pass.

## 7. Tuning Knobs

| Row | Stock after this pack | Safe range | What it tunes |
|---|---|---|---|
| `knee_follow` | 0.55 (magnitude) | 0.3–0.8 | Stride follow-through depth (now folding the RIGHT way) |
| `knee_lift_run` | 0.6 (magnitude) | 0–1.2 | Sprint swing-leg flexion — the trailing shin fold |
| `knee_rest` | 0.06 (magnitude) | 0.02–0.12 | Standing micro-flex (still never locked) |
| `hip_fold_max` | **+0.85** (direction flipped) | 0.6–1.0 | Squat thigh pitch — how far knees travel forward |
| `crouch_knee` | **1.00** (magnitude, was 1.30) | 0.8–1.4 | Squat shin fold; pairs with hip_fold to keep shins near vertical |
| `ankle_push` | 0.5 (now plantarflex) | 0–0.8 | Heel-up drive off the trail leg |
| `swing_toe_up` (NEW) | 0.25 | 0–0.5 | Swing-leg toe clearance — the reference's lifted forefoot |

Balance note: zero gameplay values change (speeds, noise, stamina untouched); every number above is derived in §4 or carried over as a magnitude.

## 8. Acceptance Criteria

1. **`run_form_sim`:** at v=7.2 the swing knee's flexion reaches ≤ **−0.9 rad** and `knee_max ≤ +0.001` across two full cycles (one-way, the RIGHT way); trail-phase foot tip global Y < ankle joint Y (toe-down push-off); swing-phase foot tip Y > ankle Y − 0.02 (toe clears); skate ratio still ≤ 0.25 at 1.5/4.2/7.2 (the solve untouched).
2. **`rig_v2_sim`:** flipped hinge asserts green; dead sprawl knees negative-asymmetric; riding knees ≤ −1.0; alias law, IK, recoil, connectors all byte-green as today (50 total ±the flipped wording).
3. **`crouch_sim`:** all fix-pack-1 checks stay green (soles = 0, shoulder law, no-kiss both sides) **plus the squat silhouette**: at full crouch each knee joint sits ≥ **0.20 m** toward the facing (−Z) of its hip joint (worked value 0.32 − margin), and the heels' Y ≤ 0.03 (no heel-lift stool-sit).
4. **`strike_sim`:** kick chamber pose reaches `knee_r ≤ −0.7` before contact; bat/kick contact values match the re-authored rows; floor/file parity check extended to the re-signed values.
5. **`gunfeel_sim` 37/37 byte-identical** (pistol contract, third consecutive pass) and `grip_ik_sim` 18/18 (arms untouched).
6. **Render gate:** fresh `BODY_run_side` shows the trailing shin folded BENEATH the thigh (knee apex forward); `BODY_crouch_side` shows knees-over-toes squat, heels down. Judged against the reference strip RUN panel + the sheet's KNEE hinge diagram.
7. **Playtest DO→EXPECT:** sprint side-on past the camera → the back heel kicks up toward the butt, never a forward-snapping shin; hold CTRL by a wall → a squat you'd believe (knees forward, hips low-back, boots flat); ride the motorcycle → calves grip BACK along the tank; kick a lurker → chamber-snap-recover reads like a kick.

---

## 9. Build order (for the executor — each task one commit, sim-gated; NOT this session)

| # | Task | Files | Gate |
|---|---|---|---|
| 1 | THE KNEE LAW in gait + rest + clamps (rule 1-2: magnitudes in, anatomy signs at the write) + flipped `rig_v2_sim`/`run_form_sim` asserts | `puppet.gd`, both sims | run_form, rig_v2 |
| 2 | THE REAL SQUAT: hip `+=`, knee −, retuned rows (§4) + `crouch_sim` silhouette/heel checks; one no-kiss tuning iteration budgeted | `puppet.gd`, `crouch_sim` | crouch (all + new) |
| 3 | Ankle polarity + `swing_toe_up` (D10) | `puppet.gd` | run_form toe asserts |
| 4 | Data re-author: riding, dead sprawl, kick, bat (floor + json parity) | `puppet.gd`, `strikes.json`, `strike_player.gd` | strike_sim, rig_v2 §7 |
| 5 | MotionForge magnitude-law labels + `swing_toe_up` mirror; README row table | `tools/motionforge/*` | forge save round-trip |
| 6 | Render re-shoot + doc pointers (fix pack 1 header, RUN_ANIMATION blocked-by, BODY_RIG_REFERENCE joint-direction column) + PLAYTEST_GUIDE block | tools + docs | eyes-on §8.6 |
