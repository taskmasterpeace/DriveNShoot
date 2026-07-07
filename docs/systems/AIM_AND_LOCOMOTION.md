# DRIVN — Aim & Locomotion (decoupled movement / look / aim)

**Status:** ✅ SHIPPED in `game/proto3d/` · **Model:** TWIN-STICK "free arms, human eyes" (2026-07-05 playtest pivot) · **Proof:** `tests/aim_sim.tscn` — 15/15
**Feel target:** *"my feet, my gun, and my eyes are three separate things — I point the gun where I want and my body catches up."*

---

## §0. The pivot (read first)

The first cut of this system was a **Look Arc**: the gun itself was clamped to ±60° of the
torso, so you *couldn't shoot directly behind you* — the body had to come around first. The
user playtested it and it felt wrong ("you have to *shoot* to look where the mouse is; I want
twin-stick — look one way, walk the other; the arms should just turn"). So we pivoted to
**Option A, "free arms, human eyes"**: the **gun is free** (aims anywhere instantly, including
behind you — twin-stick), and the **blind spot moved to your EYES** (the vision cone turns at a
human rate). You can now *shoot* behind you before you can *see* behind you — and that gap is
exactly the dog's rear-smell job. This doc describes the shipped twin-stick model.

## §1. The three decoupled layers

The character is **feet + arms + eyes**, each driven independently:

| Layer | Driven by | Rule |
|---|---|---|
| **Feet** (locomotion) | WASD → velocity, screen-relative (W = up-screen) | never waits on the body — this is what gives strafing & "walk one way, look another" |
| **Arms + gun** (aim) | the mouse (aim vector), fed EVERY frame on foot | snap to the mouse **instantly, any direction (full 360)** — bullets & melee fly exactly there |
| **Eyes + torso** (sight) | follow the aim at a human turn rate | carries the vision cone; can't instantly face behind you → the rear **blind spot** |

In code (`player_3d.gd`): `_move_yaw` (feet), `aim_yaw` (arms/gun — snaps to mouse), `body_yaw`
(torso/eyes — eases toward the aim at `body_turn_rate_deg`). Vectors at the border:
`facing()`/`sight_facing()` = torso, **`aim_facing()` = gun**.

## §2. The keystone — "your gun is fast, your eyes are human"

The gun tracks the mouse with zero delay and no clamp; the torso (and the cone it carries) chases
the aim at `body_turn_rate_deg` (~260°/s → a full turn-around takes ~0.7s). Consequences, all
sim-proven:

- **You can shoot anywhere instantly, including directly behind you** (twin-stick). The muzzle
  reads `aim_facing()`, which is the raw mouse vector.
- **You can't SEE behind you instantly.** The vision cone reads `sight_facing()` (the torso),
  which lags. Snap the mouse behind you → the gun points back there *now*, but the cone only
  swings around as your body turns. **Shoot first, see second** — the dog covers the gap.
- **One rule still governs the cone + every "is he looking at me?" check** (`sight_facing()`):
  the lurker's freeze-on-eye-contact and the dog's rear-arc both use the eyes, not the gun. So
  you can blind-fire at the thing the dog barked about before you've turned to look at it.
- **Look one way, walk the other** falls out for free: aim east, hold walk-west → you strafe
  west with the gun trained east.

`max_look_yaw_deg` is now **reserved** (a trait hook) — the blind spot lives in the vision
cone's own half-angle (~70°/side), not an aim clamp.

## §3. Stances (unchanged intent)

- **Aiming is always on** (the arms track the mouse whenever you're on foot & no panel is open) —
  so it does **not** by itself slow you. You walk freely with the gun up.
- **Combat stance** is entered by **firing** (or melee/throw), lasts a `stance_lull` (2.5s): while
  in it, speed ×0.7, sprint refused, backpedal ×0.6 (moving away from where you're aiming). This
  keeps the plant-and-shoot vs run-and-gun decision without punishing you for merely aiming.
- **Binoculars** feed the same aim pipe; the cone rides `aim_facing()` while glassing (you see
  where you point the glass), and the body turns to follow.

## §4. The visual + akimbo

The capsule splits under `_visual` (torso yaw): `_lower` (legs → feet direction) and `_upper`
(head + gun → **aim**, up to a full turn relative to the torso). Top-down, the upper half visibly
swings the gun to the cursor while the legs carry you — the decouple made legible. Because both
arms resolve to `aim_yaw`, **Akimbo (dual-wield) is a straight addition**: a second gun on the
other shoulder reads the same aim vector; no new aiming code. Melee originates its arc from
`aim_facing()`, so it sweeps where you point (360).

**HUD:** the reticle ticks run **hot** while `aim_pinned()` — i.e. your eyes haven't caught up to
your gun (you're firing somewhere you can't fully see yet).

## §5. Integration map (as built)

| Piece | File · function | Role |
|---|---|---|
| The three yaws + turn-follow | `player_3d.gd` · `_update_orientation` | the whole model |
| Gun vector (twin-stick) | `player_3d.gd` · `aim_facing()`, `aim_now()` | muzzle + melee read this; no clamp |
| Eyes vector (blind spot) | `player_3d.gd` · `sight_facing()` = torso | cone, FADE, lurker-freeze, dog-rear |
| Aim fed every frame | `proto3d.gd` · `_physics_process` FOOT block | mouse → intent always (no shoot-to-look) |
| Cone follows eyes / glass | `proto3d.gd` · `_update_vision_cone` | `sight_facing()`, or `aim_facing()` on binoc |
| Fire path | `proto3d.gd` · `fire_equipped`/`throw_grenade` | `aim_now(aim_direction())` → shoots at mouse, 360 |
| Sim aim source | `proto3d.gd` · `aim_direction()` / `aim_override` | headless "mouse" (documented exception) |

## §6. Tunables (`@export` on the player)

`body_turn_rate_deg` (260 — how fast the eyes swing to the gun; **this is the size of the rear
blind-spot window**) · `free_turn_rate_deg` (420 — relaxed torso following the feet) ·
`head_relax_rate_deg` (300) · `stance_speed_mult` (0.7) · `backpedal_mult` (0.6) · `stance_lull`
(2.5s) · `max_look_yaw_deg` (reserved, trait hook). **Trait/gear:** a heavy helmet lowers
`body_turn_rate_deg` (slower to see behind → armored tunnel vision); Eagle-Eyed could widen the
vision cone's arc. **Netcode:** orientation is two yaws, ~2 bytes/tick (`TRAVEL_AND_NETCODE.md`).

## §7. Acceptance (input-driven sim) — `tests/aim_sim.tscn`, 15/15

1. Decouple: aim east + walk north → gun east, position north. ✅
2. **The gun tracks the mouse with no firing** (fixes "shoot to look"). ✅
3. Look one way / walk the other: aim east, walk west → move west, gun east. ✅
4. **Twin-stick 360:** snap the aim behind you → the gun flips there instantly **and a shot
   behind you HITS**. ✅
5. **Eyes lag:** right after that snap the cone/torso still faces the old way (blind spot). ✅
6. **Eyes catch up:** hold it and the torso comes around → now you can see behind (cone follows). ✅
7. Melee lands where you AIM (360). ✅
8. Aiming alone does NOT force stance; **firing** does (speed ×0.7, sprint refused). ✅
9. Circle-strafe: orbit a pivot, radius held, gun trained the whole way. ✅

## §8. Open / v2

- **Arms-only rig:** right now the whole `_upper` (head + gun) swings to the aim; a refined rig
  would turn the *arms* hard and keep the head nearer the torso (less "owl neck" on a 180 flick).
- **Akimbo:** the model is ready; needs a second weapon slot + dual muzzles reading `aim_yaw`.
- **NPC parity:** give lurkers/NPCs the same eyes-lag so you can flank their blind spot.
- ~~**Gamepad:** right-stick maps straight onto the aim pipe~~ — **SHIPPED 2026-07-06** (`input_map.gd` twin-stick pad driver → `aim_override`; `pad_sim`). Aim-assist snap remains open.

---
**In one line:** the gun is twin-stick-instant and the eyes are human-slow — so you can shoot
behind you before you can see behind you, which is exactly the blind spot the dog was built to cover.
