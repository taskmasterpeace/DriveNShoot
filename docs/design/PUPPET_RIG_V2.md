# PUPPET RIG V2 — knees, elbows, two-hand grips, recoil

**Status:** GREENLIT by the owner (2026-07-07, "take this and get it working") — spec banked,
build NOT started (it wants a fresh session; see Build Order's gate). **Why:** the characters
don't look right because the rig doesn't have the joints — no knee, no elbow, no forearm.
A two-hand shotgun grip is *physically impossible* on the current rig (one whole-arm
shoulder, no elbow for the off-hand to reach the forend). The owner's diagnosis is correct.

## Overview

Upgrade the ONE box rig (`puppet.gd` — players, NPCs, crew) from ~6 driven pivots to ~16:
`upper_arm→forearm→hand` ×2, `torso_lower`+`torso_upper`, `thigh→calf→foot` ×2, `head`.
Still a kinematic Node3D/BoxMesh hierarchy — **no Skeleton3D, no skinning, no physics
joints, no AnimationPlayer**. Cost is authoring/retrofit, not runtime: ~640 transform writes
per frame at 40 characters is microseconds; draw calls (~16 boxes/char) are fine at our
crowd caps on GL Compatibility, with MultiMesh as the escape hatch if we ever want hundreds.

## Player Fantasy

A shotgun held with BOTH hands, forend gripped. A katana swing that reads shoulder→elbow→
wrist. Punches with real elbows; kicks with real knees — different kicks, different knees.
Recoil that kicks a weak character's whole torso and barely moves a strong one. The box-man
stops shrugging and starts MOVING.

## Detailed Rules

**1. RIG V2 (~16 pivots).** Each joint = a Node3D pivot at the anatomical point, box mesh
hanging below — the identical law to today's shoulder. Segment list verbatim: upper_arm,
forearm, hand ×2 · torso_lower + torso_upper (the "bend a little") · thigh, calf, foot ×2 ·
head. Shoes = thin boxes wrapped on the foot segment (same trick as char-creation clothing).
Faces (later) = one textured quad on the head box + a generated atlas (PixelLab) — a
content-pipeline job once faces are a texture.

**2. THE BACK-COMPAT LAYER — the real work.** Everything today targets OLD joint names
(`motions.json`, `strikes.json`, the TAB pose-authoring stage, ~15 sims, char creation).
So: old names become ALIASES driving the new parents (`shoulder_pitch` → `upper_arm` pitch,
`hip_kick` → `thigh`), and the new child joints get FOLLOW-THROUGH defaults — elbow bends
as a fraction of shoulder swing, knee as a fraction of stride phase, wrist trails the
forearm. Result: every existing animation instantly looks better, nothing breaks, and the
pose stage grows joint keys 1–9 instead of 1–5. `ProtoStrikePlayer.JOINT_AXIS` gains the
new names; old rows keep playing through the aliases.

**3. TWO-HAND GRIPS — the "hold the shotgun right" fix.** Each WEAPONS row gains
`grip_r`/`grip_l` points (local to the weapon mesh). A closed-form 2-bone IK plants each
hand ON its grip: an elbow is a hinge, so it's one `acos` (law of cosines) per arm,
~20 float ops — effectively free, computed in `animate()` when a two-hand weapon is held.
No IK solver library, ever.

**4. RECOIL AS DATA.** A `recoil` block per weapon row: `kick_pitch`, `torso_jolt`,
`stagger_threshold`. Applied as an ADDITIVE spring-damper layer on the affected joints,
decaying over ~200 ms, scaled by the character: `kick × (1 − strength_level × 0.06)` —
a weak character gets thrown, a strong one eats it. Same additive-layer architecture as
strikes, so it stacks with walking and aiming. A belt-rank of recoil control is a number
in a row — never an `if`.

## Formulas

- **2-bone IK (per arm):** given shoulder S, target hand T, lengths a (upper), b (fore):
  `d = clamp(|T−S|, ε, a+b)`; elbow angle `= acos((a²+b²−d²)/(2ab))`; shoulder aim =
  `atan2` toward T plus the interior angle `acos((a²+d²−b²)/(2ad))`. Hinge axis = arm's
  local X. Degenerate (target beyond reach) clamps straight.
- **Follow-through defaults:** `elbow = k_e × shoulder_pitch` (k_e ≈ 0.35 stock),
  `knee = k_k × stride_sin(phase + π·0.12)` (k_k ≈ 0.5) — both MOTION-row tunable.
- **Recoil spring:** `v += (−k·x − c·v)·dt; x += v·dt` per affected joint, impulse
  `x₀ = kick × (1 − strength×0.06)`, stock `k≈180, c≈14` (≈200 ms settle).

## Edge Cases

- A strikes.json row naming an OLD joint plays verbatim through the alias (never a silent
  no-op); naming a NEW joint on an old save's data is just a row edit away.
- IK target unreachable (weapon clipped through a wall): clamp to full extension, never NaN.
- Recoil during a strike: additive layers sum; the contact-pose damage law is untouched.
- Death flop / wound wobble read the ALIAS map so the flop bends knees now (free upgrade).
- Char-creation paper-doll clothing wraps segments by name — new segments default to the
  torso/limb color until rows name them.

## Dependencies

`puppet.gd` (the rig + animate ownership gates) · `strike_player.gd` (JOINT_AXIS grows;
alias resolution at fold time) · `motion_stage.gd` (keys 1–9, capture works on new joints)
· `weapon.gd`/`data/*.json` WEAPONS rows (`grip_r/grip_l`, `recoil` block) ·
`character.gd` (`level("strength")` read for recoil scaling) · `motions.json` (k_e/k_k
follow-through rows) · ~15 puppet-driven sims (the GATE below).

## Tuning Knobs

| Knob | Range | Governs |
|---|---|---|
| `k_e` elbow follow | 0–0.6 | how alive arms look in stock locomotion |
| `k_k` knee follow | 0–0.8 | stride bend — the single biggest look upgrade |
| `grip_r`/`grip_l` per weapon | local m | where hands land on each weapon |
| `recoil.kick_pitch` / `torso_jolt` | rad | the gun's kick |
| `recoil.stagger_threshold` | 0–1 | when a shot rocks the whole body |
| strength scaling `0.06/lv` | const | how much muscle eats recoil |

## Acceptance Criteria / Build Order (each phase lands with sims)

1. **Rig v2 + alias layer** → THE GATE: **every existing sim stays green untouched**
   (crouch, unarmed, strike ×2, motion ×2, dogverb, char, puppet-adjacent suites) — old
   names drive new parents, follow-through defaults visibly bend elbows/knees in the stage.
2. **Grips + 2-bone IK** → shotgun held with BOTH hands (stage-verified screenshot);
   one-hand weapons unchanged; IK clamps sane at full reach.
3. **Recoil rows + strength scaling** → shotgun kick reads at strength 0 vs 8 (sim asserts
   joint displacement ratio); stacks with walking; settles ≤ 250 ms.
4. **Feet/shoes, then the face quad** (content passes, after the arc).

Phases 1–3 are ONE solid build arc — start it at the top of a fresh session, not the tail
of a long one: phase 1 rewires the most-depended-on file in the game and the gate is the
whole sim suite.
