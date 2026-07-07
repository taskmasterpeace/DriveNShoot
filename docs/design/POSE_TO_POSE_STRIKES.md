# POSE-TO-POSE STRIKES

**Status:** spec, not yet built. **Owner decision (2026-07-07):** locomotion (walk/run/idle/
crouch/sprint) STAYS procedural sliders — small, elegant, sine-driven, keep it. STRIKES
(punch combo, kick, shove, weapon swing) MOVE to pose-to-pose, the Overgrowth/David Rosen
model. A sine wave is smooth by nature; a punch needs SNAP. You can't slider your way to
snap. A punch is 3 keyframes and a good clock, not a formula.

## Overview

A strike stops being math and becomes DATA: an ordered list of hand-authored key poses
(joint angles) code snaps/eases through on a clock — one row per attack in
`data/strikes.json`, the same spine as every other DRIVN system. Locomotion (the sin() rig
in `puppet.gd`) is untouched underneath. The owner poses the box man himself in the motion
stage, captures poses, orders them, tags one CONTACT, saves. No code change, no Blender.

## Player Fantasy

Today a punch is smooth and continuous — it reads as a shrug, not a hit. This buys: **a
strike lands before you finish seeing it start.** Anticipation (the coil) holds just long
enough to register as intent, then SNAPS to contact faster than the eye tracks, then
recovery eases back — anticipation/action/recovery, not a metronome. A clean jab→jab→cross
should feel like YOU threw it, not like the puppet drifted through three waypoints.

## The Data Model [P0]

A **STRIKE ROW** = an ordered array of 3–4 **KEY POSES**, each pose a set of joint targets
+ timing. As fundamental to combat as a `WEAPONS` row is to a gun.

```
strikes.json → rows: punch_1, punch_2, punch_3, kick, shove, weapon_swing, ...
  each row: poses[3-4] {joint targets, hold_ms, ease_ms, ease_curve, contact:bool}
            req_skill {id, level}   cancel_window_ms   chain_next: "<row id>" | ""
```

**Joint targets** — only joints the puppet actually exposes: `torso_twist` (torso
rotation.y, new axis — see Dependencies), `shoulder_yaw`/`shoulder_pitch` (existing
`shoulder.rotation.y/x`), `hip_kick` (existing `hip_r.rotation.x`, kicks only),
`torso_lean` (existing `torso.rotation.x`, kicks/shoves). A pose is a PARTIAL — an
omitted joint holds the previous pose's value (or rest, on pose 1). Deliberately small:
the current rig has no elbow/lower-arm pivot, only a whole-arm shoulder rotation — a
strike targets the joints that exist, not an aspirational rig.

**Per-pose timing:** `hold_ms` (how long once reached, usually 0 except anticipation) +
`ease_ms` (tween time FROM the previous pose) + `ease_curve` (`out` snap-fast-then-settle,
`in` slow-build, `in_out`, `linear`; default `out` on strike segments, `in_out` on
recovery — never `linear` into contact, that's the floaty bug being fixed).

## Snap/Timing — Seed Numbers (punch_1, the jab) [P0]

| # | Pose | ease_ms | hold_ms | curve | contact |
|---|------|---------|---------|-------|---------|
| 1 | ANTICIPATION — coil back, torso_twist −0.15, shoulder_pitch +0.25 lift | 60 | 20 | out | no |
| 2 | CONTACT — arm punched straight out, shoulder_pitch −1.45 | 50 | 40 | out | **YES** |
| 3 | RECOVERY — arm home, torso_twist 0 | 120 | 0 | in_out | no |

~290ms total. The SNAP reads because pose 1→2 is the shortest ease (50ms, the whole
visible arm travel) while pose 2 HOLDS 40ms before recovery — that hold sells the impact;
skip it and the arm just passes through full extension with nothing for the eye to catch.
Direct port of the already-tuned "windup→slash→settle" rhythm in the procedural `melee`
row — same feel, 3 fixed waypoints and a hold instead of a continuous sine. Kick and
weapon_swing get a 4th pose (see Migration) — bigger, slower commitments, same law: hold
longest at or just before contact.

## The Contact Pose [P0]

Exactly one pose per row carries `contact: true`. Its arrival is the ONLY moment
`weapon.gd`'s melee scan (reach/arc/`melee_clear`, in `fire()`) may apply damage — a hard
decoupling that doesn't exist today. Currently `fire()` resolves the full hit-scan
synchronously the same frame it starts the swing tween: damage lands at t=0 no matter what
the arm is doing. Pose-to-pose fixes this: VISUAL (pose playback) and MECHANIC (the melee
scan) become two systems joined by one signal. `fire()` still spends stamina/ammo/cooldown
and starts the pose row up front, but damage resolution moves into a contact-pose
callback. If the strike is interrupted before contact (stagger, death, weapon swap) the
callback never fires — no damage. Hit-stop/juice (`cam_rig.add_trauma`, blood FX, floater
text) fires alongside contact, not before, so the freeze-frame lands exactly on the snap.

## Combo Chaining [P1]

`punch_1`→`punch_2`→`punch_3` are three rows chained by `chain_next` + `cancel_window_ms`,
riding the SAME input timing the current `_combo`/`_combo_t` system already uses (1.2s
idle-out in `weapon.gd`) — only what plays changes, not the input logic. A row can be
canceled into its `chain_next` as soon as its recovery pose BEGINS (not when it finishes),
if `cancel_window_ms` hasn't elapsed — recovery of punch_1 blends into anticipation of
punch_2 instead of fully settling home first. Miss the window and the row finishes its own
recovery in full; the combo resets, same as today. `punch_3` is the existing finisher beat
(combo%3==0): below Martial Arts 2 it plays a bigger punch_3; at lv2+, `chain_next` on
punch_2 can point at `kick` instead — a DATA swap, never a code branch.

## Blend With Locomotion [P0]

A strike is an UPPER-BODY OVERRIDE, never a full-body replacement. Procedural
(untouched): `legs_pivot`/`hip_l`/`hip_r` stride, torso bob/lean-from-speed, breathing —
all keep running off `animate()`'s sin() math every frame, strike or no strike, so you can
punch while walking. Pose-to-pose (while a strike is live): `torso_twist`,
`shoulder_yaw/pitch`, and — kick only — `hip_r`/`torso_lean` are taken over for the
strike's duration, the identical ownership model to today's `_swing_t`/`_kick_t > 0` gates
that already make `animate()` back off those joints mid-swing; pose-to-pose reuses that
pattern, doesn't invent a new one. On strike end, the last recovery pose's values should
match what `animate()` would produce at rest (`ARM_HANG`, neutral torso) so ownership
returns with no pop. A strike started mid-stride never resets stride phase.

## Martial Arts Skill Gates Rows [P1]

`req_skill` on a row is the entire gate. `character.gd`'s existing `level("martial_arts")`
check moves from an inline branch in `weapon.gd` (`if ma >= 2: beat_is_kick = true...`) to
a row lookup: is `kick`'s `req_skill` level ≤ my martial_arts level? If not, `chain_next`
falls back to the row's `req_skill:0` sibling (plain punch_2 finisher instead of kick).
Existing thresholds carry over as rows, not new numbers:

| Row | req_skill lvl | Unlocks |
|---|---|---|
| punch_1/2/3, shove, weapon_swing | 0 | always (day one) |
| kick | 2 | roundhouse finisher beat |
| throw (shove_palm, grapple range) | 4 | guaranteed floor, bigger shove |
| finisher (fists on downed target) | 6 | ×3 damage execute |

A future belt rank is a new row + a `req_skill` number — never a new `if ma >=` line.

## Authoring Flow (non-programmer, in the stage) [P0]

The motion stage already has the bones: M/P/K strike previews, W item cycle, mouse-aim,
orbit camera, and file-watch auto-refold every 0.5s. Pose authoring layers on top:

1. **Freeze** (new key, suggest `F`) pauses `animate()`'s write to strike joints only —
   legs/breathing keep going, so you pose ON a standing-or-walking body, not a mannequin.
2. **Pose it** — sliders (MotionForge's panel pattern) move `torso_twist`,
   `shoulder_yaw/pitch`, and (kick mode) `hip_r`/`torso_lean` to the values you want.
3. **CAPTURE** snapshots the current joint values as a new pose slot. Repeat for
   contact, recovery, optional 4th.
4. **Order + time** — a column list (pose 1–4) with `ease_ms`/`hold_ms` fields per row
   and one radio button per pose: "this is CONTACT."
5. **SAVE** writes the row into `strikes.json` under the strike id — same write pattern
   MotionForge already uses for `motions.json`.
6. **PREVIEW** — the existing M/P/K keys instantly replay the saved row: the stage's
   0.5s mtime poll picks up the write live, no restart, same loop F10 already runs.

No timeline scrubber, no curve editor, no Blender. Four poses, two numbers per pose, one
checkbox. If a new strike takes longer than five minutes to author, the tool has failed.

## Migration — Seed From the Retired Row [P0]

The current 15-param procedural `melee` row (`puppet.gd` `MOTION["melee"]`, commit
2f07b77) is RETIRED for strikes, but its tuned values become the seed poses so day one
isn't blank. `punch_1`: `punch_out_s`(0.05) → pose-2 `ease_ms`=50; `punch_reach`(1.45) →
pose-2 `shoulder_pitch`=−1.45; `punch_back_s`(0.12) → pose-3 `ease_ms`=120. Same pattern
for `kick` (`kick_out_s`/`kick_height`/`kick_back_s`/`kick_lean`) and `weapon_swing`
(`windup_*` → pose 1, `slash_*`/`gun_twist` → pose 2 contact, `settle_s` → pose 3). The
retired row stays as a code comment during the build (never delete paid-for tuning) but
stops being read once every id it covered has a `strikes.json` row. `shove` had no
procedural row before (it reused `swing()`) — it's the one row that legitimately starts
blank; author it fresh in the stage.

## Diegetic / House Style [P2]

Top-down readability first: a contact pose must read from the God's-eye camera — the ARC
of motion, not just the endpoint, must sweep the silhouette (a punch moving the hand 6
inches won't read at gameplay zoom no matter how snappy). Box aesthetic: poses are joint
ANGLES on the existing box rig — never new geometry, IK, or mesh deform. No purple.

## Dependencies [P0]

`puppet.gd` owns the posed joints and the `_swing_t`/`_kick_t` ownership-gate pattern
strikes reuse; needs one new axis, `torso.rotation.y` (`animate()` today only reads
x/z on torso — adding twist is additive). `weapon.gd`'s melee scan/`melee_clear` wall-law
and stamina/cooldown/xp bookkeeping in `fire()` are unchanged — only WHEN damage
resolves moves, from immediate to contact-triggered. `character.gd`'s
`level("martial_arts")` and its THROW/FINISHER gates are read verbatim, no new skill
math. `motion_stage.gd` is the authoring surface — needs the freeze/capture/order/save
mode (P0, or this spec is unusable by a non-programmer). MotionForge (:8896) is untouched
— it stays the locomotion knob panel; strikes get their own flow in the stage because
poses are discrete captures, not continuous sliders. `data/strikes.json` is new, same
fold convention as `motions.json`/`vehicles.json`. `weapon.gd`'s `fire()` swaps its
`puppet.punch(beat)`/`kick()`/`swing()` calls for a row-id lookup (`play_strike(id)`) —
the one call-site migration.

## Tuning Knobs [P1]

| Knob | Range | Category | Governs |
|---|---|---|---|
| per-pose `ease_ms` | 30–200ms | feel | snap vs. telegraph; <30ms reads as a glitch |
| per-pose `hold_ms` | 0–80ms | feel | impact sell — highest-leverage number here |
| `ease_curve` | out/in/in_out/linear | curve | never `linear` into contact (floaty) |
| `cancel_window_ms` | 100–400ms | gate | combo forgiveness vs. tap-rhythm skill expression |
| `req_skill` level | 0–10 | gate | belt-rank pacing lives here, not in code |
| pose count | 3–4 | feel | 3 fast unarmed, 4 for weapons/kicks needing a distinct windup |

## Edge Cases [P1]

Strike canceled before contact (staggered/downed/weapon-swapped mid-swing): callback
never fires, no damage, no stamina refund (already spent up front); joints return to
`animate()` over a short forced ease, never an instant pop. Two `contact:true` poses in
one row: reject at save time — exactly one, non-negotiable. Chain input arrives during
the contact pose's hold, before recovery starts: buffer it, apply on recovery start
(existing combo-timer forgiveness, unchanged). `req_skill` gate re-checked at the MOMENT
of the chain, never cached from combo start — a lv1 character never sees a kick option
from a stale lv2 buff. Locomotion joints (legs/breathing/head) are out of scope — a
strike row targeting a `leg` joint is invalid data. Missing row for a referenced id:
falls back to the retired procedural call until migrated — never a silent no-op strike.

## Sim Hooks [P0]

A headless sim (`strike_sim`, alongside `motion_sim`/`unarmed_sim`) drives the real input
path, never teleports state: (1) play `punch_1`, assert all 3 poses are visited in
declared order — puppet joint values checked against each pose's targets at expected
timestamps, not just elapsed time; (2) stage a dummy in range, assert `take_damage` fires
exactly once, exactly when the CONTACT pose is reached, not at strike start or end; (3)
drive `punch_1→2→3` with taps inside `cancel_window_ms` and assert the combo chains with
no idle gap, versus taps outside the window resetting to a lone `punch_1`; (4) set
martial_arts to 1 and assert `kick` (req_skill 2) is unreachable — finisher falls back to
ungated punch_3, no crash, no unlock; (5) drive forward movement during a live strike and
assert `hip_l`/`hip_r` stride phase keeps advancing — proving the override/procedural
split holds and you can genuinely punch while walking.
