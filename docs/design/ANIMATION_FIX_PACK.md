# THE BODY IN MOTION — the animation fix pack

**Status:** ✅ EXECUTED 2026-07-08 (Tasks 1–6 + tooling/docs). All six defects fixed on the
one rig, sim-gated and eyeballed via `render_body`. Commits: shoulder law, ground law,
walk/run, strike wire-in, bat swing, two-hand grips, MotionForge mirror (on `main`).
Sims green: crouch 21 · run_form 12 (NEW) · rig_v2 50 · grip_ik 18 · gunfeel 37 (pistol
byte-unchanged) · strike 63 · unarmed 14 · combat_feel 15 · motion 13 · spine/signature 17.
**One deferred item (D7):** contact-timed melee DAMAGE (damage still lands synchronously
this pass; the strike VISUAL + white-plank kill shipped). Deferring damage to the contact
pose breaks the ~6-frame combat sims (howler/threat/pvp/unarmed) and is the POSE_TO_POSE
goal's Phase-3 follow-up — do it with a combat-sim sweep, not here.
**Follow-up spec (2026-07-08 evening):** `RUN_ANIMATION.md` — the run's TOP-DOWN read
(stride shoulder-hip counter-rotation, armed-carry asymmetry, camera-truth acceptance);
this pack's §3.3 side-view form is its shipped base.
*(Original spec below, kept as the record.)*

**Was:** SPEC (owner playtest 2026-07-08, the mannequin body's first night out).
**Scope:** `puppet.gd` · `player_3d.gd` · `weapon.gd` · `fx.gd` · `strike_player.gd` · `data/strikes.json` · `data/motions.json` · MotionForge.
**Reference:** the owner's annotated mannequin sheet (the same image behind `BODY_RIG_REFERENCE.md`) — specifically its **HUMAN MOVEMENTS REFERENCE** strip (IDLE / WALK / RUN / JUMP, green arrows = direction of movement). **That strip is the motion bar for walk and run.** JUMP is out of scope (DRIVN's dive/slide own that slot).
**Owner verdicts this spec answers:** crouch shoulders stay up · crouch sinks through the ground · running looks bad from the side · melee/machete is "a little white line" · shotgun/pipe-rocket arms come out of the same shoulder · **the pistol is GOOD — protect it** · bat needs a real baseball swing.

---

## 1. Overview

The MANNEQUIN BODY (022a3d1) gave every human in DRIVN the right sixteen pieces. This pack makes those pieces MOVE right. Six defects from the 2026-07-08 playtest get root-caused and fixed, and two quality bars get set: **walk/run must read like the reference strip from the side**, and **the baseball bat gets a real load→swing→follow-through**. Everything lands as rows (MOTION rows, strikes.json rows, weapon grip rows) on the one rig — so the player, survivors, crew, motorists, raiders, and the lurker all inherit every fix.

### The defect ledger (observed → root cause, with receipts)

| # | Owner saw | Root cause (verified in code) |
|---|---|---|
| D1 | Crouch: "the shoulders don't go down with you… don't connect" | Both arm roots are ROOT children pinned at y=1.40 (`puppet.gd:384`, `puppet.gd:396`). The crouch drop moves torso/waist/neck only (`puppet.gd:628-630`). At full crouch the neck pivot is at 0.978 while the shoulder balls float at 1.40 — **above the head**. |
| D2 | Crouch: "it goes through the ground" | `legs_pivot.position.y = -hip_drop_frac × drop` (`puppet.gd:642`) sinks the ENTIRE leg tree 0.17 m at full crouch — soles at **−0.17, under the floor**. Crouch is currently a SINK, not a fold. |
| D3 | "Running doesn't look good — look at it from the side" | Foot-skate + no bounce + straight arms. At walk 4.2 m/s the gait covers ~1.8 m/s of ground with the feet (feet slide 2.3×, math in §4.2); the pelvis never bobs (bob is applied to torso/waist/neck only, never `legs_pivot` — `puppet.gd:628-630, 642`); arms swing near-straight (`elbow_rest 0.14`); no run lean, no knee drive, no heel-up trail leg. The reference strip's RUN panel (deep lean, ~90° pumping elbows, high knee, trailing heel) is unreachable with the current rows. |
| D4 | Melee/machete: "a little white line that sticks out" | `ProtoFX.swing_arc` (`fx.gd:107-126`) spawns a pale 0.09×0.03×reach **plank at chest height** (y=1.15) and sweeps it 0.13 s. It fires on EVERY melee (`weapon.gd:298`) — fists, machete, all of it. That plank IS the white line in the screenshot. |
| D5 | Shotgun/pipe rocket: "both arms go to the same shoulder… the shoulders got mixed up" | Three stacked causes: (a) `set_hand_pose` **teleports the free arm's shoulder to x=+0.12 on the gun side** for every two-handed weapon (`puppet.gd:860-863`) — the left arm literally grows out of the right chest; (b) the shotgun's fore-grip row is `grip_l: (0, −0.02, 0.0)` (`weapon.gd:37`) — z=0 puts the "forend" INSIDE the trigger hand, so the IK plants the left hand on top of the right; the pipe's `grip_l` z=−0.12 (`weapon.gd:43`) is barely better; (c) the chest never blades toward a two-hand hold, so any fore-grip is a cross-body reach at max extension. |
| D6 | (found during audit) | `ProtoStrikePlayer.STRIKES` code-floor rows still carry the PRE-mannequin sign convention (contact `shoulder_pitch: −1.45`, `strike_player.gd:79`) while `strikes.json` was re-authored to the SIGN LAW (+1.5). If strikes.json is ever missing/corrupt, the fallback plays every strike **backwards**. |
| D7 | Melee damage timing (from the locked POSE-TO-POSE goal) | `weapon.fire()` applies melee damage instantly on click (`weapon.gd:311+`) while `puppet.swing()/punch()` plays a cosmetic tween (`puppet.gd:887-936`). The shipped `ProtoStrikePlayer` + strikes.json are **not wired into combat** — the wiring plan sits unexecuted at `strike_player.gd:365-405`. |

**What is explicitly protected:** the one-hand pistol hold (`AIM_RAISE`/`AIM_ELBOW` chain, `puppet.gd:207-208, 596-607`) — the owner called it good. Any change that moves the pistol silhouette is a regression.

---

## 2. Player Fantasy

You read bodies at a glance, from any seat in the house. A crouched scav is a coiled, planted crouch — shoulders hunched down WITH the spine, boots on the dirt, never in it. A sprinter drives like the reference strip: leaned in, elbows pumping at ninety, knees lifting, heels kicking up behind. A machete swing is an arm and a blade whipping through an arc you can dodge — not a laser line. A shotgun stance is two honest shoulders: trigger hand back, forend hand forward, chest bladed like someone who's fired one before. And the bat — the KNOCKBACK king — loads over the rear shoulder, uncoils from the hips, and follows through like a home run. The pistol? Already right. One arm, level iron. Don't touch it.

---

## 3. Detailed Rules

### 3.1 THE SHOULDER LAW (fixes D1, half of D5)

**The shoulders are part of the chest. Wherever the chest goes — down, forward, twisted — the shoulder line goes with it.**

1. Both arm roots (`free_arm`, and `shoulder` inside `aim_arm`) get their Y from the **live chest**, every `animate()` frame, after the column writes:
   `arm_root.y = torso.position.y + SH_ABOVE_CHEST × torso.scale.y` where `SH_ABOVE_CHEST = 1.40 − 1.28 = 0.12` (captured at `create()`, never hardcoded). Breath, step bob, crouch drop, the dead sprawl's collapsed chest (`_pose_dead` writes `torso.position.y = 0.35`) — all inherited for free.
2. The arm roots also take the chest's **forward pitch translation**: when the torso pitches over the knees (crouch lean `+0.3×_crouch`, run lean), the shoulder line shifts forward by `sin(torso.rotation.x) × SH_ABOVE_CHEST` on local −Z. (Small — ~0.036 m at full crouch — but it keeps the balls seated on the leaning chest instead of hovering behind it.)
3. **Twist follow:** the shoulder POSITIONS orbit the spine by the chest's live twist: rotate each root's rest (x, z) about the column axis by `torso.rotation.y × shoulder_twist_follow` (row, stock 0.8). Positions only — `aim_arm`'s caller-owned yaw is untouched, so the twin-stick gun direction never moves (the aim-sibling law of `puppet.gd:655-663` survives).
4. **An arm root's lateral home is anatomy, never a prop mount.** Delete the two-handed `free_arm.position.x = 0.12 × handed_sign` teleport (`puppet.gd:860-863`); the free hand reaches a fore-grip with ROTATION (IK), full stop.
5. `pose_riding` and `_pose_dead` keep working with zero edits: they write chest position/rotation, and rule 1-2 derives the shoulder line from it.

### 3.2 THE GROUND LAW (fixes D2)

**Soles never go below y=0. A crouch is a FOLD — hips and knees coil, the pelvis drops between the heels — never a sink of the leg tree.**

1. `legs_pivot.position.y` stays ≥ 0 in every living pose (the dead sprawl may still lay the pelvis down, it's on the ground anyway).
2. The pelvis/hip-joint drop that the no-kiss law needs comes from **inside** the leg: drop the hip JOINTS (`hip_l/hip_r.position.y`) and `_pelvis` by `leg_fold_drop` (§4.1) while the knees take up the slack (`crouch_knee` already coils them) and the feet **counter-rotate to stay flat and planted** (the existing `foot = −(knee+hip)×0.5` law, retuned so soles read level at full crouch).
3. The torso column's total drop must equal what the folded legs actually give up: `crouch_drop` becomes a DERIVED ceiling, `min(crouch_drop_row, leg_fold_drop + spine_curl)` — the spine compression (`torso_scale_min`) covers the difference, exactly as today.
4. The no-kiss law is preserved as stated (`puppet.gd:66-75`): every pose clearly separated or deep-stable (>0.05 m); `crouch_sim`'s existing shimmer check stays green.
5. The collision capsule behavior is already correct (1.7→1.05, `player_3d.gd:421-429`) — untouched.

### 3.3 WALK & RUN TO THE REFERENCE STRIP (fixes D3 — the goal's named bar)

Locomotion STAYS procedural (owner decision 2026-07-07 — sines for gait, poses for strikes). These rules make the sines honest:

1. **The anti-skate law.** Stride amplitude and cadence are SOLVED from speed so foot ground-speed matches body speed (§4.2). No more moonwalk. `stride_amp`/`cadence_*` become multipliers on the solved values (rows keep working, MotionForge keeps tuning).
2. **The whole column bounces.** Step bob moves `legs_pivot` + torso + waist + neck **together** (one new `column_bob` write on `legs_pivot`, the existing three keep their shares) at 2 bumps per cycle. The head may counter a fraction (`head_stabilize` row) — eyes level, body working.
3. **Run form** blends in by `run_blend = clamp((speed − 2.0) / (run_speed − 2.0), 0, 1)` (`run_speed=7.2`, `player_3d.gd:13`):
   - `run_lean` (row, stock 0.22 rad): torso + waist pitch forward — the reference's drive posture.
   - `elbow_pump` (row, stock 1.5 rad): both elbows LOCK bent at run (the reference's ~90° arms) and the swing moves to the shoulders (`arm_swing` scales up); hands half-fist (`fingers × 0.8`).
   - `knee_lift_run` (row, stock 0.95): swing-phase knee follow rises — the reference's high front knee.
   - `ankle_push` (row, stock 0.5 rad): trail-leg plantar-flex on push-off phase — the reference's heel-up back leg.
4. **Walk form:** `elbow_rest` rises to a natural carry (~0.35) at walk speeds; everything else is the solved stride. The reference's WALK panel — upright torso, opposite arm/leg, planted heel — falls out of rules 1-2.
5. **The side view is the acceptance view.** `render_body.gd` gains WALK-SIDE and RUN-SIDE captures (camera on +X) rendered next to the reference strip, and the new `run_form_sim` (§8) asserts the numbers headlessly.

### 3.4 STRIKES ARE THE MELEE READ — kill the white plank (fixes D4, D7)

1. **Delete the `ProtoFX.swing_arc` call** from `weapon.fire()` (`weapon.gd:298`) and retire the plank for melee entirely. Nothing that isn't a body part or a held weapon may represent a strike.
2. **Wire `ProtoStrikePlayer` into combat** — the plan already written at `strike_player.gd:365-405`, executed verbatim: puppet gets one lazily-created strike child; `main.player.play_strike(id)` thin-wraps it; `is_swinging()` re-points at `is_playing()`; `_swing_t`-gated code paths in `animate()` gate on it unchanged.
3. **Every melee WEAPONS row names its strike** (`strike_row` field): `fists → punch_1/2/3` (combo beats via `chain_next`), finisher kick at Martial Arts 2 → `kick`, `shove_palm → shove`, `wrench/machete → weapon_swing`, `bat → bat_swing` (§3.6), `axe → axe_chop` (P1, overhead chop row). Unknown/missing id → the legacy tween (`puppet.swing()/punch()`) + one `push_warning` — never a silent T-pose (the spec's own fallback law, `strike_player.gd:397-401`).
4. **Damage lands on the CONTACT pose, not the click.** `fire()` captures the swing's targets/damage/shove into a closure and applies it on the `contact()` signal (windup can be dodged; the hit lands when the arm is OUT — the locked POSE-TO-POSE goal, and it fixes the click-instant-hit bug).
5. Optional read, behind a row: `ProtoFX.weapon_trail` — a short ribbon sampled from the ACTUAL weapon tip (`gun` global position) during contact±1 pose, alpha ≤0.35, life ≤0.18 s, per-weapon color row (`trail` on SHAPES; steel glint for machete/axe/bat, NONE for fists). It hugs the true arc because it's sampled from it — it can never become a floating plank.
6. **Sign-law parity (D6):** re-seed `ProtoStrikePlayer.STRIKES` from the re-authored strikes.json values so floor == file on day one.

### 3.5 TWO-HANDED HOLDS — two shoulders, two jobs (fixes D5)

1. Rule 3.1.4 (no shoulder teleport) is the prerequisite.
2. **Every `two_handed: true` gun row MUST author a real `grip_l`** on the forend/tube, in gun-local space (−Z = muzzle):
   - `shotgun`: `grip_l: (0, −0.02, −0.28)` — ON the pump (`weapon.gd:102` puts the pump at z −0.22±0.07), `grip_r: (0, 0, 0.1)` stays.
   - `pipe_rocket`: `grip_l: (0, −0.12, −0.30)` — supporting UNDER the tube ahead of the shoulder (tube spans z −0.5..0.14 at y 0.05).
   - A `data_sim` guard: any `two_handed` HITSCAN/PROJECTILE row with a zero `grip_l` is a FAIL (no more silent legacy holds on longarms).
3. **The chest blades into a two-hand hold:** while `two_handed ∧ raised ∧ armed`, add `blade_yaw` (row, stock 0.35 rad, toward the gun side) to the `_twist` target (`puppet.gd:660-663`). With 3.1.3, the gun-side shoulder pulls back and the free shoulder swings forward — the fore-grip reach shortens by geometry instead of crossing the body. Aim is untouched (twist is position-orbit + chest cosmetic; `aim_arm` stays caller-owned).
4. **IK acceptance** (the hold is only right if the mesh says so, §8): free wrist within 0.03 m of the grip point; elbows point DOWN (`_solve_foregrip_ik`'s lower-elbow branch, `puppet.gd:718-725`, asserted not assumed); the two upper-arm axes separated ≥ 25°; both shoulder balls at anatomical rest (±0.001 from §3.1's derived position).
5. Melee two-handers (bat, axe) do NOT run the fore-grip IK at idle (melee carries low, `raised=false`, `puppet.gd:193-195` — unchanged); their two-hand read lives in the strike rows' authored free-arm joints (§3.6).

### 3.6 THE BASEBALL BAT SWING (the goal's named ask)

A new `strikes.json` row, drag-refinable in the POSE editor (POSE.bat → TAB), authored under the SIGN LAW. Right-handed shown; `handed_sign` mirrors. Four poses, ~530 ms total against the bat's 0.6 s cooldown:

```json
"bat_swing": {
  "poses": [
    { "name": "load", "joints": { "torso_twist": -0.55, "waist_twist": -0.30, "shoulder_yaw": -0.90, "shoulder_pitch": 0.90, "elbow_r": 0.50, "wrist_r": -0.30, "free_shoulder_yaw": -0.50, "free_shoulder_pitch": 0.75, "elbow_l": 0.95, "head_yaw": 0.50, "knee_r": 0.18, "fingers_r": 1.35, "fingers_l": 1.35 }, "ease_ms": 110, "hold_ms": 45, "ease_curve": "out", "contact": false },
    { "name": "contact", "joints": { "torso_twist": 0.60, "waist_twist": 0.35, "shoulder_yaw": 0.55, "shoulder_pitch": 1.15, "elbow_r": 0.10, "wrist_r": 0.0, "free_shoulder_yaw": 0.30, "free_shoulder_pitch": 1.05, "elbow_l": 0.20, "head_yaw": 0.0, "knee_r": 0.06 }, "ease_ms": 80, "hold_ms": 30, "ease_curve": "out", "contact": true },
    { "name": "follow_through", "joints": { "torso_twist": 0.95, "shoulder_yaw": 1.15, "shoulder_pitch": 1.30, "wrist_r": -0.40, "free_shoulder_pitch": 0.85 }, "ease_ms": 70, "hold_ms": 25, "ease_curve": "out", "contact": false },
    { "name": "settle", "joints": { "torso_twist": 0.0, "waist_twist": 0.0, "shoulder_yaw": 0.0, "shoulder_pitch": 0.0, "elbow_r": 0.14, "wrist_r": 0.0, "free_shoulder_yaw": 0.0, "free_shoulder_pitch": 0.0, "elbow_l": 0.14, "head_yaw": 0.0, "knee_r": 0.06, "fingers_r": 0.22, "fingers_l": 0.22 }, "ease_ms": 160, "hold_ms": 0, "ease_curve": "in_out", "contact": false }
  ],
  "req_skill": { "id": "", "level": 0 },
  "cancel_window_ms": 200,
  "chain_next": ""
}
```

The beats, in baseball terms: **LOAD** — bat up over the rear shoulder, both hands stacked on the handle (fists closed), chest and waist coiled away, eyes on the target, a little sit in the back knee. **CONTACT** — the hips lead (waist uncoils first, 0.35 of the chest's 0.60), the shoulders whip the barrel level through chest height, arms extending; damage + the bat's signature shove (7.0, the KNOCKBACK king) land HERE and only here. **FOLLOW-THROUGH** — the bat wraps around the lead shoulder, wrists rolling over; the overswing is what makes it read as mass. **SETTLE** — ease home, `animate()`'s smoothed writes take the handoff.

Hold acceptance: both hand meshes within 0.05 m of the bat's handle box (gun-local z +0.02..+0.18) through load→contact — the two-hand read is REAL, not implied. `grip_r: (0, 0, 0.10)` seats the knob in the trigger palm.

---

## 4. Formulas

### 4.1 Crouch leg-fold drop (§3.2)

```
leg_fold_drop(c) = T·(1 − cos(hip_fold_max·c)) + C·(1 − cos(max(0, knee_net(c) − hip_fold_max·c)))
  T = thigh length = 0.42      C = calf length = 0.38
  c = _crouch ∈ [0,1]
  knee_net(c) = knee_rest + crouch_knee·c
```
Worked at c=1, stock rows (hip_fold_max 0.40, crouch_knee 0.55, knee_rest 0.06): `0.42·(1−cos 0.40) + 0.38·(1−cos 0.21)` = 0.42·0.0789 + 0.38·0.0220 = **0.041 m** — the current fold barely buys 4 cm, which is exactly why the old code cheated by sinking the whole leg tree. To reach a real ~0.17 m pelvis drop with planted feet, the crouch coil must DEEPEN: stock retune `hip_fold_max 0.40 → 0.72`, `crouch_knee 0.55 → 1.05` gives `0.42·(1−cos 0.72) + 0.38·(1−cos 0.39)` = 0.106 + 0.029 = **0.135 m**, and `spine_curl` (torso_scale_min 0.81 → 0.78 range) covers the visual remainder. The rows stay MotionForge-tunable; the LAW is only: column drop ≤ leg_fold_drop + spine give, soles at 0.

### 4.2 The anti-skate stride solve (§3.3)

```
Given speed v (m/s), leg length L = 0.90, effective L_eff = leg_eff·L (row leg_eff 0.92, knee-bend allowance):
  A(v)      = hip amplitude  = min(A_walk_max + (A_run_max − A_walk_max)·run_blend, asin-able)   # rows: 0.62 / 0.85
  S(v)      = step length    = 2·L_eff·sin(A(v))
  ω(v)      = phase rate     = π·v / S(v) · cadence_mult                                          # replaces cadence_base/speed as the DEFAULT
  skate     = |S·(ω/π) − v| / v      → 0 by construction (acceptance metric ≤ 0.25 measured on the mesh)
```
Worked: **walk v=4.2**: S = 2·0.828·sin 0.62 = 0.96 m → ω = π·4.2/0.96 = **13.7 rad/s** (~4.4 steps/s). Today's rows give ω = 2 + 4.2·1.35 = 7.67 → the feet cover 0.75·2.44 = 1.83 m/s of the 4.2 — a **2.3× skate**, the side-view moonwalk. **Run v=7.2**: S = 2·0.828·sin 0.85 = 1.24 m → ω = **18.2 rad/s** (~5.8 steps/s, sprint cadence — right for a 7.2 m/s sprint). `cadence_mult` and the amp rows stay as FEEL knobs on top of the honest solve.

### 4.3 Shoulder line (§3.1)

```
arm_root.y       = torso.position.y + 0.12·torso.scale.y                       # 0.12 = 1.40 − 1.28, captured at create()
arm_root.(x,z)   = rotate_y(rest_xz, torso.rotation.y · shoulder_twist_follow)  # positions orbit; aim yaw untouched
arm_root.z      += −sin(torso.rotation.x) · 0.12                                # ride the chest's forward pitch
```
Worked at full crouch (drop 0.34, scale 0.81): y = (1.28−0.34) + 0.12·0.81 = **1.037** — vs neck pivot 0.978 and head center ~1.19: shoulders sit just below the tucked head, a hunched human. Dead sprawl: y = 0.35 + 0.12 = 0.47 — the arms collapse WITH the chest, no extra code.

### 4.4 Run blend (§3.3)

`run_blend = clamp((v − 2.0) / (7.2 − 2.0), 0, 1)` — 0 at a 2 m/s creep, 1 at full sprint; every run-form row multiplies by it, so walking never inherits sprint form. Example: v=4.2 → 0.42 (a brisk walk takes a hint of lean, no elbow lock at <0.5 gate; `elbow_pump` gates at run_blend > 0.55).

---

## 5. Edge Cases

- **Left-handed rows** (`handed": "left"`): `handed_sign` mirrors grip x (`puppet.gd:707`), blade_yaw sign, and strike yaw joints exactly as swings do today (`×hs`, `puppet.gd:903-909`). Acceptance runs both hands.
- **Build extremes** (0 skinny / 2 heavy): shoulder lateral rest scales with `_sh_x` (chest-edge law, `puppet.gd:379`) — the twist-orbit uses the LIVE rest, so no build-conditional code. Heights/joints don't move with build by design, so §4 numbers hold on every body.
- **Crouch + two-handed aim**: the IK target chain is composed from live transforms (`puppet.gd:705-709`), so lowered shoulders retarget automatically; assert wrist-to-grip ≤ 0.03 m WHILE crouched in `grip_ik_sim`.
- **Strike mid-crouch**: strike joints write rotations on the lowered column — legal by construction; contact damage unchanged.
- **Death mid-strike**: `_pose_dead` takes over via `_dead_blend`; the strike player gets `stop()` on death (wire-in rule) so no tween/pose fight on a corpse.
- **Aim straight up** (IK degenerate cross): existing NaN bail keeps last pose one frame (`puppet.gd:738-741`) — unchanged, still asserted.
- **Unknown / missing strike id**: legacy tween + `push_warning` once per id (§3.4.3). **Missing strikes.json entirely**: code floor plays — which is why D6 (sign parity) is a P0, not housekeeping.
- **motions.json row deleted**: the stock-refold law (`puppet.gd:106-119`) reverts to code stock — new rows participate automatically because they live in `MOTION` stock first.
- **MotionForge unknown-row clobber** (paid-for gotcha): the forge's `DEFAULTS` (server.mjs:31, index.html seed, README table) must mirror EVERY new row in the same commit that adds it, or a forge save can write a partial gait block.
- **NPC puppets** (companion/motorist/raider): they only call `animate()` — shoulder/ground/stride laws apply to them with zero call-site changes; the strike child is lazily created, so non-fighting NPCs pay nothing.
- **Net remote players**: puppets are driven by synced state exactly as today (client-authoritative visuals); strikes trigger from the same weapon path both sides; no new packets. PvP damage stays victim-authoritative — contact-pose timing shifts WHEN the melee claim fires, not who adjudicates it.
- **Headless sims**: `ProtoStrikePlayer` is manual-delta by design (no Tweens, `strike_player.gd:9-12`); `run_form_sim` steps `animate()` with fixed delta and measures MESH positions (never internal vars) — inputs-not-teleports law respected (staging positions allowed).

---

## 6. Dependencies

- **`docs/design/BODY_RIG_REFERENCE.md`** — the column rests, SIGN LAW, and the reference image this pack's motion bar comes from. This pack APPENDS two laws there: THE SHOULDER LAW (§3.1) and THE GROUND LAW (§3.2). (That doc must gain a pointer here — bidirectional.)
- **`docs/design/POSE_TO_POSE_STRIKES.md`** — Phase 3 (combat wire-in) is EXECUTED by §3.4 of this pack; its status line updates to point here.
- **`docs/design/PUPPET_RIG_V2.md`** — alias law (old names drive whole limbs) and the recoil spring are honored untouched; §3.1 adds position-follow on top of rotations only.
- **`weapon.gd` WEAPONS/SHAPES rows** — gain `strike_row` (melee) and real `grip_l` values (longarms); `data_sim` enforces.
- **MotionForge** (`tools/motionforge/server.mjs`, `index.html`, `README.md`) — DEFAULTS mirror for every new row; the treadmill stage (`motion_stage.tscn`) is where run form gets eyeballed side-on.
- **POSE editor** (`motion_stage.gd` TAB mode) — authors/refines `bat_swing` (and `axe_chop`); `JOINT_NAMES` already exposes every joint the row uses.
- **`render_body.gd`** — gains WALK-SIDE / RUN-SIDE captures (the acceptance view).
- **`docs/PLAYTEST_GUIDE.md`** — gains the DO→EXPECT block from §8.
- Consumers of `puppet.animate()` (player, companion, motorist, npc, net ghosts) — no signature change; they inherit everything.

---

## 7. Tuning Knobs

All new knobs are MOTION rows (`rigs.puppet.gait` / `.melee` unless noted), live-tunable at :8896, folded by the stock-refold law.

| Row | Stock | Safe range | What it tunes |
|---|---|---|---|
| `shoulder_twist_follow` | 0.8 | 0.0–1.0 | How much the shoulder line orbits with chest twist; 0 = today's disconnect, 1 = rigid ride |
| `blade_yaw` | 0.35 | 0.0–0.6 | Two-hand stance blading toward the gun side; too high fights the look-arc read |
| `leg_eff` | 0.92 | 0.85–1.0 | Effective leg length in the stride solve; lower = shorter steps, higher cadence |
| `A_walk_max` / `A_run_max` | 0.62 / 0.85 | 0.4–0.8 / 0.6–1.0 | Stride openness at walk/sprint; cadence re-solves to stay skate-free |
| `cadence_mult` | 1.0 | 0.8–1.3 | Feel knob on the solved cadence (gait row `gait` still multiplies per-survivor) |
| `column_bob` | 0.045 m | 0.0–0.09 | Whole-body vertical bounce per step (replaces torso-only bob share) |
| `head_stabilize` | 0.5 | 0.0–1.0 | Fraction of bob the neck counters — eyes level while the body works |
| `run_lean` | 0.22 rad | 0.0–0.35 | Sprint trunk drive; pairs with existing `speed·0.02` base |
| `elbow_pump` | 1.5 rad | 1.1–1.8 | Locked elbow bend at sprint (the reference's ~90° arms); gates at run_blend>0.55 |
| `knee_lift_run` | 0.95 | 0.6–1.2 | Swing-leg knee drive at sprint |
| `ankle_push` | 0.5 rad | 0.0–0.8 | Trail-leg heel-up on push-off |
| `hip_fold_max` | 0.72 (retuned) | 0.4–0.9 | Crouch hip coil — now also the fold-drop driver (§4.1) |
| `crouch_knee` | 1.05 (retuned) | 0.55–1.3 | Crouch knee coil — deeper = lower planted crouch |
| `torso_scale_min` | 0.78 (retuned) | 0.75–0.85 | Spine curl share of the crouch drop |
| `trail` (SHAPES row) | per-weapon | alpha ≤0.35, life ≤0.18 s | Weapon-tip ribbon on strikes; absent = no trail (fists) |
| `bat_swing` pose ms | §3.6 values | ±40% in POSE editor | The swing's snap; contact ease never `linear` (strikes law) |

Balance note: bat damage/shove/knockdown rows are UNTOUCHED — this pack changes when/how the hit reads, not what it's worth (`weapon.gd:59-61` stands).

---

## 8. Acceptance Criteria

Every fix lands with its sim (the iron rule). Suite must be green end-to-end; the named additions:

**`crouch_sim` (extend):** at `_crouch=1` settled: (a) each shoulder ball's global Y within ±0.03 of `torso.position.y + 0.12·torso.scale.y` and ≥0.28 below its standing height; (b) **lowest vertex of every mesh AABB ≥ −0.02** (soles planted — the through-the-floor kill shot); (c) `legs_pivot.position.y ≥ 0`; (d) existing no-kiss checks still green; (e) repeated on `build` 0 and 2.
**`rig_v2_sim` (extend):** equip shotgun → `free_arm.position.x == −_sh_x·handed_sign` exactly (the teleport is dead); shoulder Y follows chest during a scripted breath+bob window.
**`grip_ik_sim` (extend):** shotgun + pipe_rocket, standing AND crouched, right- AND left-handed: free wrist ≤0.03 m from the grip point; upper-arm axis separation ≥25°; elbows below their shoulders; with blading on, aim ray direction unchanged (twin-stick law).
**`run_form_sim` (NEW):** fixed-delta `animate()` at v∈{1.5, 4.2, 7.2}: (a) stance-foot skate ratio ≤0.25 (measured on `foot` mesh global positions in the stance half-cycle); (b) pelvis (`legs_pivot`) bob amplitude within `column_bob`±30% at 2 bumps/cycle; (c) at 7.2: both elbows within [1.3, 1.7] rad, torso pitch ≥0.15, ankle push-off ≥0.25 on the trail phase; (d) at 1.5: elbows ≤0.5 (no sprint arms while creeping).
**`strike_sim` / `unarmed_sim` (extend):** melee `fire()` spawns **zero** `fx_swing`-group nodes; a target inside reach takes damage only inside the contact pose window (±20 ms of the row's contact segment); unknown `strike_row` id falls back to the tween and warns; `STRIKES` floor `punch_1` contact `shoulder_pitch > 0` (sign parity, D6).
**`bat_swing` (in `strike_sim`):** row plays end-to-end in ≤650 ms; both hand meshes ≤0.05 m from the handle box through load→contact; contact fires exactly once; shove impulse applies at contact, not at input.
**`gunfeel_sim` (regression guard):** pistol one-hand hold — shoulder/elbow/wrist chain values byte-identical to pre-pack (the owner's "pistol is good" is a contract).
**`data_sim` (extend):** every `two_handed` gun row has nonzero `grip_l`; every MELEE row's `strike_row` resolves.
**Render acceptance:** `render_body` WALK-SIDE / RUN-SIDE sheets put next to the reference strip — knee lift, elbow angle, lean, heel-up visibly matching RUN; upright opposite-arm WALK.
**Playtest DO→EXPECT (for `PLAYTEST_GUIDE.md`):** crouch by a wall → shoulders sink with you, boots stay on the dirt · sprint past the camera side-on → no skating, bent pumping arms, body bounces · swing machete → the blade arcs, NO white line · shotgun → left hand on the pump, two distinct shoulders, chest bladed · pipe rocket → free hand under the tube · bat a howler → load, CRACK on contact, follow-through, it LAUNCHES · draw the pistol → exactly as before.

---

## 9. Build order (each task = its own commit, sim-gated)

| # | Task | Files | Gate |
|---|---|---|---|
| 1 | THE SHOULDER LAW: chest-follow block in `animate()` (after column writes, before recoil), capture `SH_ABOVE_CHEST` + arm rests in `create()`, delete the `set_hand_pose` teleport | `puppet.gd` | `crouch_sim` (a), `rig_v2_sim`, `gunfeel_sim` |
| 2 | THE GROUND LAW: `legs_pivot ≥ 0`, hip-joint/pelvis fold drop, foot re-plant, crouch row retune (§4.1) | `puppet.gd`, `data/motions.json` stock | `crouch_sim` (b)(c)(d) |
| 3 | Anti-skate solve + column bob + run form rows (§3.3, §4.2) | `puppet.gd` | `run_form_sim` (NEW) |
| 4 | Strike wire-in: puppet strike child, `play_strike`, weapon `strike_row` fields, contact-closure damage, plank deletion, D6 floor re-seed | `puppet.gd`, `player_3d.gd`, `weapon.gd`, `strike_player.gd` | `strike_sim`, `unarmed_sim` |
| 5 | `bat_swing` row (§3.6 JSON verbatim, then POSE-editor refine) + bat `strike_row`; `axe_chop` P1 | `data/strikes.json`, `weapon.gd` | `strike_sim` bat block |
| 6 | Two-hand grips: shotgun/pipe `grip_l` re-author, `blade_yaw`, IK acceptance, `data_sim` guard | `weapon.gd`, `puppet.gd` | `grip_ik_sim`, `data_sim` |
| 7 | Optional weapon-tip trail FX behind SHAPES `trail` rows | `fx.gd`, `weapon.gd` | `strike_sim` (no fx_swing group; trail node lifetime) |
| 8 | Tooling + docs sync: MotionForge DEFAULTS/README mirror, `render_body` side captures, BODY_RIG_REFERENCE law pointers, POSE_TO_POSE status, PLAYTEST_GUIDE block | `tools/motionforge/*`, `render_body.gd`, docs | full suite green |

Tasks 1→3 are the goal's walk/run bar; 4→5 are the bat and the white line's death. 1 must land first (every hold and strike reads off the shoulder line); everything after 3 is order-independent except 7 after 4.
