# THE BODY — Definitive Rig Reference

**Owner-set, 2026-07-08. This is the DEFINITIVE spec for the humanoid body.** It
is drawn from the owner's annotated mannequin reference image (FRONT VIEW + PARTS
BREAKDOWN + JOINT MOVEMENT GUIDE). Every human in DRIVN — player, survivors, crew,
motorists, raiders, the lurker — is this one rig fed a data ROW. Code: `puppet.gd`
(`ProtoPuppet`). Do not swap the player body to an imported GLB again: the two GLB
attempts failed (wrong joints, and a heavy skinned mesh hitched physics into a
fall-through-world death). This box rig is ours, light, and correct.

---

## The sixteen pieces (PARTS BREAKDOWN)

Each is its own box. Nothing is welded — every piece rides a joint so it can move.

| Piece | Code node | Notes |
|---|---|---|
| Head | `head` (on `neck`) | ~0.24×0.25×0.23, ≈14% of height. Eyes on the −Z face. |
| Upper torso / chest | `torso` | The lean/twist body. Center y≈1.28. |
| Lower torso / waist | `waist` | Its own piece on the lower-spine swivel. Center y≈1.00. |
| Pelvis / hips | `_pelvis` | Rides `legs_pivot` (faces the walk, not the aim). y≈0.92. |
| Left / right upper arm (bicep) | box under `free_arm` / `shoulder` | len 0.30. |
| Left / right forearm | box under `elbow_l` / `elbow_r` | len 0.28. |
| Left / right hand | `_build_hand()` under `hand_l` / `hand` | palm + `fingers_l`/`fingers_r`. |
| Left / right thigh | box under `hip_l` / `hip_r` | len 0.42. |
| Left / right lower leg (calf) | box under `knee_l` / `knee_r` | len 0.38. |
| Left / right foot | box under `foot_l` / `foot_r` | toe forward, sole on the ground. |

**Both arms are built identically** — bicep, forearm, hand — hanging straight from
the shoulders. Only the JOB differs (aim side vs off side), never the geometry.

## The joints (JOINT MOVEMENT GUIDE)

| Joint | Type | Axis in code | Rotates |
|---|---|---|---|
| Neck | ball | `head_yaw` (y), `head_pitch` (x) | head turn + nod |
| Shoulders | ball | `shoulder_yaw`/`_pitch`, `free_shoulder_yaw`/`_pitch` | arm in any direction |
| Elbows | hinge | `elbow_r`, `elbow_l` (x) | forearm, one-way fold |
| Wrists | ball | `wrist_r`, `wrist_l` (x today) | hand |
| Spine | swivel ×2 | `torso_*` (chest), `waist_*` (waist) | upper + lower twist/lean |
| Hips | ball | `hip_kick` (right), `hip_l_pitch` (left) | thigh |
| Knees | hinge | `knee_r`, `knee_l` (x) | lower leg, one-way fold |
| Ankles | hinge | `ankle_r`, `ankle_l` (x) | foot tilt |
| Fingers | hinge | `fingers_r`, `fingers_l` (x) | **the hands OPEN and CLOSE** |

All 22 joints are drag-authorable in the POSE editor (**POSE.bat** → TAB →
left-drag a part) and nameable in a `strikes.json` pose row. See
`ProtoStrikePlayer.JOINT_NAMES` (the single source of truth, mirrored by the
stage's `AUTHOR_JOINTS`).

## THE SHOULDER LAW + THE GROUND LAW (ANIMATION_FIX_PACK, 2026-07-08)

Two laws were added to `animate()` after the first playtest of this body — see
`docs/design/ANIMATION_FIX_PACK.md` (EXECUTED):

- **THE SHOULDER LAW:** the arm roots (`free_arm`, `shoulder`) are part of the CHEST.
  Every frame they ride `torso.position.y + _sh_above_chest · torso.scale.y` — so a
  crouch, a dead collapse, and the breath all carry the shoulders with the torso, never
  leaving them floating at the standing height. Height only (aim yaw preserves Y).
- **THE GROUND LAW:** a crouch is a FOLD, never a sink. After the pelvis drops,
  `_lowest_sole_y()` re-plants the deepest sole at y=0 — boots stay on the dirt. The knee
  coil (`crouch_knee`) is deep enough that the plant barely moves `legs_pivot`, so the
  no-kiss geometry holds.

Locomotion also gained the **anti-skate stride solve** (cadence solved from speed — no
foot-skate) and **run form** (lean / ~90° pumping elbows / high knee / heel-up) to the
reference strip's RUN panel, and two-hand holds gained a **support-shoulder blade** so the
free hand reaches the fore-grip from its own (anatomical) shoulder — no more "both arms
from one socket."

## THE SIGN LAW (paid-for — the "wrong-way arms" bug was signs)

The puppet faces its **local −Z**. **Positive `rotation.x` swings a hanging limb
FORWARD** (toward −Z). Every pose is authored to this: a punch at contact is
`shoulder_pitch ≈ +1.5` (arm extended at the target); a knee/elbow only folds
forward (positive); a relaxed arm is 0 (hangs straight by geometry).

## THE BUILD PARAMETER — skinny → normal → heavy

`build` in the appearance row: **0 = skinny, 1 = normal, 2 = heavy.** It scales
**widths and depths only** — heights and joint positions never move, so every aim /
strike / crouch number holds on every body. This is the variety axis: the raider is
a slab (1.6), the waif a rail (0.3), the trader grew fat on the market (1.5). The
belly (waist depth) grows fastest. Character creation ties `build` to how a
character looks; the same sixteen blocks read as fifty different people.

## The vertical column (rest, scale 1.0 ≈ 1.8 m)

```
1.80  head top
1.42  neck pivot  (_neck_rest_y)   ← shoulders ride here
1.28  chest center (_chest_rest_y)
1.00  waist center (_waist_rest_y)
0.92  pelvis center
0.90  hip pivots
0.48  knee pivots
0.10  ankle pivots
0.00  soles on the ground
```

The whole column rides these captured rests in `animate()` — never hardcoded
literals (that fought rebuilt geometry). Crouch sinks chest/waist/neck at tuned
fractions so no two faces enter the "kiss zone" (near-coplanar = shimmer); this is
proven by `crouch_sim`'s no-kiss check.

## What the rig can do now (all sim-proven)

- **Idle**: arms hang naturally at the sides, three clean pieces, hands visible.
- **Aim** (armed): the gun arm RAISES forward and holds the barrel level
  (`AIM_RAISE` + `AIM_ELBOW`); the wrist counters so the muzzle stays on the aim.
  Bullets fire along the **mouse aim**, not the gun's angle — the pose is free.
- **Walk/run**: hips stride, knees follow-through, arms counter-swing each opposite
  its own leg.
- **Hands open/close**: fingers curl shut around a held weapon / for a punch, relax
  half-open otherwise, fall open in death.
- **Melee**: punch (jab forward), kick (leg snaps forward, torso leans away),
  weapon swing — all pose-to-pose via `strikes.json`, drag-authorable.
- **Crouch, death sprawl, riding a bike** — all re-authored to the sign law.

## Sims (the regression gates)

`rig_v2_sim` (the rig contract, 48 checks), `strike_sim` (55, strikes resolve
against the real joints), `pose_drag_sim` (the editor drags every joint),
`crouch_sim`, `gunfeel_sim`, `unarmed_sim`, `signature_sim` (build variety),
`spine_sim`. Run before touching `puppet.gd`.

## Render / inspect

`node → res://proto3d/tools/render_body.tscn` (NON-headless — real GPU; the
offscreen path hangs under `--headless`). Renders idle / armed / walk / a
skinny-normal-heavy lineup so proportions are judged by eye, not guessed.
