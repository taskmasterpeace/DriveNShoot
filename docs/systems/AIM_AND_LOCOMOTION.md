# DRIVN — Aim & Locomotion (decoupled movement / look / aim)

**Status:** ✅ SHIPPED in `game/proto3d/` (2026-07-05) · **Stage:** 4 (Combat Depth) · **Proof:** `tests/aim_sim.tscn` — 21/21
**Feel target:** *"a fight I win by skill and orientation — my feet, my gaze, and my gun are three separate things."*

---

## §1. The core model — three decoupled layers

The character is **feet + torso + head/arms**, and they move independently:

| Layer | Driven by | Rule |
|---|---|---|
| **Feet** (locomotion) | WASD → velocity, screen-relative (W = up-screen) | fully independent of aim — this is what gives strafing |
| **Gaze** (head/arms/gun) | aim intent (mouse ray, binoculars, or sim override) | snaps **instantly** within the Look Arc; **everything sighted or fired follows it** |
| **Torso** (body facing) | follows the feet when relaxed; **dragged by the gaze** when the head hits its limit | rotates at a turn-rate, never instantly |

The mouse is where you're looking/aiming; WASD is where you're walking; they don't have to agree.

In code (`player_3d.gd`): `body_yaw` (torso), `aim_yaw` (gaze), `_move_yaw` (feet) — three
radians, vectors only at the API border: `facing()` = torso, `sight_facing()` = gaze.

## §2. The Look Arc — "your head only turns so far" (the keystone)

The gaze can deviate from the torso by at most `max_look_yaw` (±60°, a 120° arc).
Inside the arc: aim is instant — flick the mouse, the gun follows **now**, and the torso
does not move. Past it: the torso rotates toward the aim at `body_turn_rate` while the
gaze rides the **arc edge**, sweeping with the body until the target comes inside.

Consequences (all intentional, all sim-proven):

- **To aim or look behind you, your body must physically turn** — a short, believable
  delay (~0.55 s for a full 180°). Orientation is a resource you manage.
- **The muzzle obeys the arc, not just the picture** *(implementation delta — the
  original draft implied it; the build enforces it)*: `fire_equipped`, melee, and
  grenades all fire along `player.aim_now(...)` — the **clamped** gaze — never the raw
  mouse vector. Click on something behind you and the round leaves along the arc edge
  while your body comes around. **No instant back-shots. Ever.** (aim_sim proves the
  first shot at a target behind you cannot hit.)
- **The vision cone points where the GAZE points.** `_update_vision_cone` feeds
  `sight_facing()`, so the cone sweeps inside the Look Arc and turning around swings
  the whole cone. One rule now governs sight *and* aim.
- **Every "is he looking?" check reads the same gaze:** the FADE, the lurker's
  freeze-on-eye-contact, and the dog's *"it's BEHIND you"* arc all use `sight_facing()`
  — the dog covers exactly the Look Arc's blind spot.
- Getting flanked is genuinely dangerous: when the dog barks, you must **turn** to
  answer it, and that half-second is where the tension lives.

## §3. Stances

- **Free** (no aim intent): gaze relaxes home to the torso at `head_relax_rate`; torso
  follows the feet at `free_turn_rate`; full speed + sprint. ≈ the pre-decouple default.
- **Combat stance** (gun up): entered by firing/swinging/throwing; the gun keeps
  tracking the mouse **between** shots (main feeds intent every frame while in stance);
  feet strafe freely; torso obeys the Look Arc; **speed ×0.7, sprint refused,
  backpedal ×0.6 on top**; exits after a `stance_lull` (2.5 s) with no trigger pull.
- **Binoculars** = *look intent without the combat taxes*: same gaze pipeline, same
  Look Arc body-drag (glassing behind you turns you around), but no speed penalty.
  From the **cab** the glass still pans free — no neck sim while driving (yet).

Trigger is AUTO (fire = stance), per the design note — RMB stays binoculars. A
dedicated hold-to-aim key remains an option if playtests want pre-aiming without
spending a round; it would just call `enter_stance()` + feed intent.

## §4. The visual (what sells it)

The capsule splits under one `_visual` root (which keeps the dive pitch):
- **`_lower`** — trunk capsule: yaws toward where the **feet** are going.
- **`_upper`** — head + nose + **gun bar** (shows when armed): yaws to the **gaze**.
- The torso yaw is the invisible anchor between them (`_visual.rotation.y`).

Top-down you mostly see the head — so the upper node IS the readable decouple: the
gun stays trained on the mouse while the capsule carries you sideways. Melee
originates from the gaze, so it visibly "swings where you look" for free.

**HUD:** the reticle ticks run **hot** (`Color(1.0, 0.42, 0.28)`) while the aim is
pinned at the arc edge (`aim_pinned()`) — the "your body is still coming around"
tell, so a pinned miss reads as physics, not a bug.

## §5. Integration map (as built)

| Piece | File · function | Role |
|---|---|---|
| The three yaws + arc + stance | `player_3d.gd` · `_update_orientation`, `aim_now`, `set_aim_intent`, `enter_stance` | the whole model |
| Intent feed | `proto3d.gd` · `_physics_process` binoc block | binoc dir → intent; in-stance mouse → intent; else clear |
| Muzzle clamp | `proto3d.gd` · `fire_equipped`, `throw_grenade` | `aim_now(aim_direction())` — arc gates the shot |
| Cone follows gaze | `proto3d.gd` · `_update_vision_cone` | FOOT facing = `sight_facing()` (drive unchanged) |
| Gaze consumers | `lurker.gd` freeze · `dog.gd` behind-arc · FADE via `_percept_facing` | one gaze, every perception check |
| Pinned reticle | `hud_3d.gd` · `update_reticle(..., pinned)` | hot ticks while the body turns |
| Sim aim source | `proto3d.gd` · `aim_direction()` / `aim_override` | headless "mouse" (documented exception) |
| Sim orientation | `player_3d.gd` · `snap_orientation()` | stage-setting ONLY (fade_sim) — never gameplay |

`face_override` and the instant `facing_dir = dir` snap in `fire_equipped` are **gone** —
they were the "spin 180° per click" hole the Look Arc exists to close.

## §6. Tunables (data-driven, `@export` on the player)

| Tunable | Shipped | What it is |
|---|---|---|
| `max_look_yaw_deg` | 60 | half-arc of the head (120° total) |
| `body_turn_rate_deg` | 220 | torso drag speed when the head is pinned |
| `free_turn_rate_deg` | 420 | relaxed torso following the feet *(delta: two rates — relaxed turns are quicker than a combat drag, or free walking feels sluggish)* |
| `head_relax_rate_deg` | 300 | gaze settling home with no intent |
| `stance_speed_mult` | 0.7 | aiming slows you |
| `backpedal_mult` | 0.6 | applied **continuously** by move-vs-gaze angle *(delta: `lerp(1, 0.6, −gaze·move)` — no threshold pop; pure strafe pays no backpedal tax)* |
| `stance_lull` | 2.5 s | quiet time before the gun relaxes |

**Trait/gear hooks (Stage 4+, wiring exists):** Eagle-Eyed widens `max_look_yaw_deg`;
a heavy helmet slows `body_turn_rate_deg` (armored tunnel vision — sits beside the
eye-patch `vision_*` mults on `ProtoCharacter`). **Netcode note:** the whole
orientation state is two yaws — quantizes to 2 bytes/tick (`TRAVEL_AND_NETCODE.md`).

## §7. Why it makes combat feel alive

- **Circle-strafe:** gun locked on a lurker while you orbit it (sim: 92° orbit, gun dot 1.000 throughout).
- **Kiting:** backpedal (slow) while firing forward at the pursuer.
- **The turn-around cost:** flanked → you must turn — and the first shot physically
  cannot land behind you, so the dog's warning buys you exactly that turn time.
- **Melee sweeps where you look**, not where you walk.
- **Plant-and-shoot vs move-and-spray:** stance slows you, and the bloom cone
  (INTERFACE_AND_BODY §6) already widens with fire — the two stack.

## §8. Acceptance (input-driven sim — house style) — `tests/aim_sim.tscn`, 21/21

1. Aim east + walk north → position moves north, gun stays east (decouple). ✅
2. Torso dragged only to the **arc edge** (dot 0.54 ≈ the sin 30° the geometry predicts). ✅
3. Inside-arc flick → instant snap, torso moves 0.00°. ✅
4. Target BEHIND → first shot **misses** (arc-edge round), body turn measured 0.37 s vs
   0.36 s analytic `(Δ−60°)/220°s`, then the same click connects. ✅
5. Vision cone tracks the gaze (east 1.00), not the feet (north 0.00). ✅
6. Melee hits in the gaze arc; spares a target in reach but outside it. ✅
7. Stance walk ~2.7 m/s · SHIFT refused in stance · backpedal 1.7 vs 2.7 advance ·
   lull exits stance · sprint returns at 7.2 m/s. ✅
8. Circle-strafe: radius held (dev 0.4 m of 4.5 m), gun trained all the way. ✅

Full battery after the refactor: **20/20 suites green** (every prior sim untouched
in behavior; `fade_sim` now stages orientation via `snap_orientation`).

## §9. Open questions / v2

- **Free-look glance:** should the head *softly* track the mouse (slow, arc-clamped)
  outside combat, PZ-style, instead of only looking where you walk? (Needs an
  idle-mouse heuristic; skipped v1 to keep the stance boundary crisp.)
- **NPC parity:** lurkers/NPCs get the same three-yaw model so *their* cones and
  turn costs are gameable (sneak up inside their blind spot) — Stage 6 with PCAS.
- **Gamepad:** right-stick aim maps onto the identical intent pipe; aim-assist =
  a cone snap on `set_aim_intent`, nothing else changes.
- **Dive + aim:** the lunge commits the body; the gaze re-clamps to the new arc next
  frame, so a dive **across** your aim keeps the gun on target within 60° — left as
  emergent (it feels great; formalize only if it breaks something).

---
**In one line:** feet, gaze, and gun are three independent things unified by "your
head only turns so far" — which yields strafing, kiting, and melee-where-you-look,
and makes the vision cone + the dog's blind-spot coverage one coherent system.
