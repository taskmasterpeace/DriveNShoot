# POSE-TO-POSE STRIKES

**Status:** Phase 1 (runtime core, `strike_player.gd`) SHIPPED — commit fa058f5, strike_sim
38/38. Phase 2 (in-stage pose authoring, `motion_stage.gd` TAB mode) SHIPPED — commit
59a6d21, strike_author_sim 37/37. **Phase 3 (combat wire-in + the strike editor, this
arc) — SPEC BELOW, in build (2026-07-07).** **Owner decision (2026-07-07):** locomotion
(walk/run/idle/crouch/sprint) STAYS procedural sliders — small, elegant, sine-driven, keep
it. STRIKES (punch combo, kick, shove, weapon swing) MOVE to pose-to-pose, the
Overgrowth/David Rosen model. A sine wave is smooth by nature; a punch needs SNAP. You
can't slider your way to snap. A punch is 3 keyframes and a good clock, not a formula.

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

---

# PHASE 3 — COMBAT WIRE-IN + THE STRIKE EDITOR (this arc, 2026-07-07)

Phases 1–2 built the runtime and an in-stage pose authoring flow, but the system is
INERT: `weapon.gd`'s `fire()` still calls the retired procedural `main.player.punch()/
kick()/swing()` and resolves damage synchronously at t=0. Tuning a strike row today
changes NOTHING the player feels. Phase 3 closes the loop end to end — **author a strike →
it drives real combat with contact-synced damage → hit a dummy in the stage to feel it →
tune → repeat** — in ONE connected build. Locomotion (MotionForge sliders) stays untouched.

## Overview

Two halves joined by the dummy test. **Part A (wire-in):** make the six existing strike
rows drive live combat, with damage decoupled to the CONTACT pose — the real fix for
"melee feels like a shrug." **Part B (editor):** upgrade `motion_stage.gd`'s TAB
author-mode from raw keyboard hotkeys to an on-screen Control panel (sliders, pose list,
contact radio, timing fields, save) — still IN the live game window on the real box-man
rig and real `ProtoStrikePlayer` (never a browser: the paid-for lesson that a browser
can't run the rig). **Part B.2 (test loop):** a TEST action spawns a dummy and throws the
current strike through the real `weapon.gd` path so you SEE the contact-timed hit.

## Player Fantasy

For the OWNER (the editor's user): "I dragged a slider, hit TEST, and watched the box-man
crack a dummy with a hit that SNAPS — then nudged one number and felt it get meaner, all
without leaving the window or writing code." For the PLAYER (the wire-in's payoff): a
jab→jab→cross that lands ON the snap, not before you see it start — anticipation/action/
recovery, a hit you threw, not a puppet drifting through waypoints.

## Detailed Rules

**Part A — the four wire-in edits (verbatim from `strike_player.gd`'s WIRING NOTE):**

1. **`puppet.gd`** lazily owns ONE `ProtoStrikePlayer`, `setup()` once after `create()`
   with `{torso_twist:torso, torso_lean:torso, shoulder_yaw:shoulder,
   shoulder_pitch:shoulder, hip_kick:hip_r}` and a `Callable` reading
   `character.level("martial_arts")`. A new `is_striking()` (true while
   `strike_player.is_playing()`) joins the existing `_swing_t`/`_kick_t` ownership gates:
   `animate()` backs off `shoulder.rotation.x/y`, `hip_r.rotation.x`, `torso.rotation.x`,
   and the NEW `torso.rotation.y` (twist) for the strike's duration, then reclaims them
   with no pop (the final recovery pose already matches rest). `torso.rotation.y` is
   additive — `animate()` today only writes torso x/z, so it must now also zero y when NOT
   striking. `strike_player._process(delta)` is called from inside `animate(delta,…)` so
   ownership and playback share one clock. Legs/hips stride and breathing keep running
   every frame regardless → punch-while-walking holds.
2. **`player_3d.gd`** gains `play_strike(id: String) -> bool`, a thin wrapper mirroring the
   existing `punch/kick/swing` wrappers, delegating to `puppet.strike_player.play(id)`.
   The old `punch/kick/swing` wrappers STAY (Part A step 4 fallback).
3. **`weapon.gd fire()`** resolves a row id from its existing combo/weapon logic — fists
   tap-beat → `punch_1`/`punch_2` on beats 1–2; finisher beat (`_combo % 3 == 0`) →
   `kick` if `strike_player.can_play("kick")` else `punch_3`; `shove_palm` → `shove`;
   everything steel → `weapon_swing` — then calls `play_strike(id)`. The old skill branch
   `if ma >= 2: beat_is_kick = true` becomes `can_play("kick")` (same number, now read off
   the row's `req_skill`). **The damage-resolution block moves into a one-shot handler
   connected to `strike_player.contact`**: `fire()` captures the target list + resolved
   dmg/shove/kd into a small struct up front (stamina/cooldown/xp spent immediately, as
   today) and connects a one-shot lambda to `contact`, so the melee scan + `take_damage` +
   hit-stop (`cam_rig.add_trauma`) + blood + floater all land when the CONTACT pose is
   reached. Telegraph FX (`ProtoFX.swing_arc`, whoosh audio, `lunge`) stay at fire()-time.
4. **Fallback:** `if not play_strike(id): <retired procedural call for that id>` — an
   unknown/missing `strikes.json` row degrades to the old `punch/kick/swing`, never a
   silent no-op; the fallback retires itself as every id gains a row (all six have one).

**Damage numbers are UNCHANGED** (spec's standing law). The finisher's 1.5× cross / 2.2×
kick + reach/shove/kd bumps stay exactly where they are in `fire()` as combo bookkeeping;
Phase 3 changes only WHICH animation plays (row lookup) and WHEN damage resolves (contact).

**Part B — the editor panel** (on-screen Control in `motion_stage.gd` author-mode):
- **Pose-list column** — one row per pose (1–4): editable name, `ease_ms` + `hold_ms`
  numeric fields, a `curve` cycle (out/in/in_out/linear), and an exclusive **CONTACT
  radio**. Reordering is out of scope (author top-to-bottom; re-capture to change order).
- **Joint sliders** — only the joints the selected strike uses show: `torso_twist`,
  `torso_lean`, `shoulder_yaw`, `shoulder_pitch`, `hip_kick`. Dragging poses the frozen
  upper body live (legs/breathing keep going — pose ON a standing body, not a mannequin).
- **Buttons** — CAPTURE (snapshot current joint values into the selected pose), row-cycle
  (◀ ▶ through `strikes.json` ids; real rows import their poses, never blank), SAVE
  (read-modify-write into `strikes.json`; **reject unless exactly one CONTACT pose**),
  PREVIEW (replay via the owned `ProtoStrikePlayer`), and TEST (Part B.2).
- Existing keyboard hotkeys (1-5, Q/E, C, X, U, ,/. etc.) REMAIN as accelerators — the
  panel is additive; the sim-proven hotkey paths are not removed.

**Part B.2 — the dummy test loop:** TEST spawns (or respawns) a stage-local dummy — a
minimal `Damageable` box in the `threat` group ~2.5 m in front of the stage puppet — and
fires the current strike through the REAL `weapon.gd` melee path (not a bespoke preview),
so contact-synced damage, hit-stop, floater, and knockback all show on the real rig. The
dummy heals/relocates on each press so you can test repeatedly.

## Formulas

No new balance math — Phase 3 is plumbing + tooling. The only timing identity that must
hold: **damage fires at `t_contact`**, where `t_contact = Σ(ease_ms + hold_ms)` over poses
`0..k` and pose `k` is the one with `contact:true` (± one frame ≈ 16.7 ms). Verified in
sim by timestamp, not by "damage happened." Punch-while-walking identity: `hip_l`/`hip_r`
stride phase advances by `speed·delta·cadence` every frame INCLUDING while `is_striking()`.

## Edge Cases

- **Strike canceled before contact** (stagger/death/weapon-swap): `strike_player.cancel()`;
  the one-shot `contact` connection never fires → no damage, no stamina refund (spent up
  front); `puppet` eases owned joints back to rest over a short forced ease, never a pop.
- **Two contact poses on save**: rejected at SAVE with an on-panel error; nothing written.
- **Zero contact poses on save**: same rejection (exactly one, non-negotiable).
- **Finisher at Martial Arts < 2**: `can_play("kick")` false → `punch_3` plays; no crash,
  no kick unlock; damage uses the existing sub-MA2 cross branch (1.5×).
- **Missing row id** referenced by `fire()`: falls back to the retired procedural call.
- **TEST with no valid current row** (unsaved/invalid): button disabled + tooltip, no spawn.
- **Dummy already present** on TEST: reused (healed + repositioned), never duplicated.
- **Strike started mid-stride**: stride phase is never reset (Part A step 1 guarantee).

## Dependencies

- **`puppet.gd`** ← owns `ProtoStrikePlayer`, adds `is_striking()` + `torso.rotation.y`
  handling; `animate()` gains one clock-step call. Bidirectional: `strike_player.gd`'s
  WIRING NOTE names `puppet.gd` as its host.
- **`player_3d.gd`** ← `play_strike()` wrapper; old `punch/kick/swing` kept as fallback.
- **`weapon.gd`** ← `fire()` row-id resolution + contact-callback damage move; melee
  scan/`melee_clear`/stamina/cooldown/xp UNCHANGED. Bidirectional: strikes doc §"The
  Contact Pose" already names `weapon.gd fire()`.
- **`character.gd`** ← `level("martial_arts")` read verbatim through the injected callable.
- **`motion_stage.gd`** ← the editor panel + dummy test; owns its preview `ProtoStrikePlayer`.
- **`data/strikes.json`** ← SAVE target (existing fold convention).
- **MotionForge (:8896)** — untouched; stays the locomotion knob panel. Strikes are
  discrete captures, not continuous sliders, so they live in the stage, not the web forge.

## Tuning Knobs

Inherited from Phase 1 (per-pose `ease_ms` 30–200, `hold_ms` 0–80, `ease_curve`,
`cancel_window_ms`, `req_skill`, pose count 3–4). Phase 3 adds NO new balance knobs — it
makes the existing ones felt. New editor affordance (not a balance knob): joint slider
ranges clamp to the rig's sane rotation limits (≈ ±1.8 rad) so a captured pose can't
author an impossible bend.

## Acceptance Criteria (testable — new `combat_wire_sim`, extended `strike_author_sim`)

1. Driving `weapon.fire()` with fists plays a `ProtoStrikePlayer` row (not the procedural
   tween) — assert `strike_player.is_playing()` true after fire, `strike_id == "punch_1"`.
2. A dummy in melee range takes `take_damage` EXACTLY ONCE and EXACTLY at `t_contact`
   (timestamp-checked, ± one frame) — not at fire()-time, not at strike end.
3. Strike canceled before contact → dummy takes ZERO damage; joints return to rest.
4. `martial_arts = 1`: finisher beat plays `punch_3` (not `kick`); `martial_arts = 2`:
   plays `kick`. No inline `if ma >=` branch selects the animation — `can_play` does.
5. An unmigrated/unknown id → `play_strike` returns false → old procedural call runs
   (fallback asserted, no no-op).
6. Forward movement during a live strike: `hip_l`/`hip_r` stride phase advances every
   frame (punch-while-walking).
7. Editor SAVE with exactly one contact pose writes a valid row round-tripped by
   `ProtoStrikePlayer.fold_strikes_file`; SAVE with zero or two contact poses is rejected,
   file unchanged.
8. TEST spawns exactly one dummy in the `threat` group and it takes contact-timed damage
   via the real path; a second TEST reuses (heals) it, never duplicates.
9. Regression: `strike_sim` 38/38, `motion_sim` 13/13, `strike_author_sim` (≥ its 37
   baseline), `unarmed_sim`, `motion_stage_sim` all stay green.
