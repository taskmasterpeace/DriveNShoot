# THE CAROUSEL PORTAL

**Status:** design (2026-07-07). Greenlit goal: "use this for the carousel" —
[OzanA78/godot-exit-portal-free](https://github.com/OzanA78/godot-exit-portal-free) (MIT).
The addon is vendored at `game/addons/exit_portal_free/` (imports clean on our
GL-Compatibility renderer; `plugin.cfg` has `script=""`, so nothing auto-runs until we
wire it). This doc specifies how it becomes THE DIAL — the visible ring you step through
to make a Carousel jump.

## Overview

Today a Carousel gate (`ProtoGate`, inner class in `carousel.gd`) is an invisible
contract: you approach (occupiers wake at <130 m), clear its objective ladder
(power / codes / purge), it SPINS UP (wave defense), goes ACTIVE, and then `interact()`
calls `carousel.jump(id)` to roulette-hop you to another node. The player never SEES the
gate's state — a dormant gate and a live one look the same until you walk up and read a
text prompt. The portal fixes that: a **wobbling sci-fi ring at each gate whose glow/spin
encodes the gate's exact state**, and which, once ACTIVE, is a physical thing you drive
INTO to trigger the jump — THE DIAL made visible and diegetic. No new dungeon-interior
system: the portal drives the `jump()` that already exists, and reflects the state machine
that already exists. Cosmetic where it can be, mechanical only at the one touch point
(step-through → jump).

## Player Fantasy

From across the wastes you can now READ a gate: a dim, slow, desaturated disk means
"dormant — nothing here yet"; an amber disk building its pulse means "you're feeding it,
keep going"; a frantic strobing ring means "SPINUP, survive the waves"; a bright, fast,
clean vortex means "LIVE — drive through and roll THE DIAL." Clearing a base and watching
its portal ignite is the payoff beat; gunning your car through a live ring to gamble a
jump is the ritual. The gate stops being a menu and becomes a place.

## Detailed Rules

**One portal per gate.** Each `ProtoGate` owns a single `portal_wobble.tscn` instance,
added as a child at the gate's center, raised to eye height, scaled to read from the
top-down camera (see Formulas). It is the addon's `Area3D` + baked wobble mesh + three
`portal_disk.gdshader` materials — reused verbatim; we only recolor and drive its
parameters. `exit_room.tscn`, `orbit_camera.gd`, `showcase.*` are the addon's DEMO and are
NOT used.

**The portal mirrors the gate state machine** (a new `set_portal_state()` on `ProtoGate`,
called whenever `state` or `objectives_left` changes):

| Gate state | Portal read | glow_color | pulse_speed | base_alpha | Passable? |
|---|---|---|---|---|---|
| DORMANT, occupiers unspawned | barely there | dim grey-amber | 0.4 | 0.25 | no |
| DORMANT, objectives pending | building | amber | 1.2 | 0.55 | no |
| SPINUP (wave defense) | frantic | hot amber/white | 3.5 | 0.9 | no |
| ACTIVE | live vortex | bright (faction tint) | 2.5 | 1.0 | **YES → jump** |

**The one mechanical touch point.** The portal's `Area3D.body_entered` is connected to a
new `_on_portal_entered(body)` on the gate. It does something ONLY when
`state == "active"` and the body is the player (or a co-op peer): it calls the EXISTING
`carousel.jump(row["id"])` — the identical roulette hop `interact()` triggers today. In any
other state the entry is inert (the ring is a wall you can't use yet, matching the table's
"Passable? no"). The old `interact()`→`jump()` path stays as a fallback/parity trigger; the
portal adds a second, diegetic way to fire the same function, never a new jump rule.

**Recolor to house style.** The addon defaults to cyan (`glow_color 0,1,0.88`). We set
amber/bone (`~1.0, 0.7, 0.2`) as the base, tinted per the controlling faction's color from
`world_state` when a gate is claimed. **No purple** (house rule) — the shader is
`source_color`, any hue is one line.

**Cosmetic vs mechanical.** Cosmetic: colour, pulse/spin, scale, the wobble precession,
faction tint. Mechanical: `body_entered` → `jump()` gated on `state=="active"`, and the
state→parameter mapping (because it's the player's only readout of when the ring is live).

## Formulas

Let `S` = portal scale, `C` = collision cylinder. The addon ships the disk at ~2 m radius
with a `CylinderShape3D(radius 2.0, height 6.0)` — too tall for a gate platform and too big
for the top-down zoom. Set:

- `S = 0.7` (reads clearly at gameplay zoom without swallowing the gate; range 0.6–0.85).
- `C.height = 3.0`, `C.position.y = 1.5` (contains the ring, clears platform geometry).
- Portal `position.y = 1.6 * S` above the gate floor (centered on a driving silhouette).

Shader animation is driven by injecting `elapsed` each frame. To keep it animating when the
game is paused (menus/map up), drive it from a monotonic clock, not a hand-rolled
accumulator that stops with `_process`:

```
elapsed = float(Engine.get_physics_frames()) / physics_tps   # advances even while paused
set_shader_parameter("pulse_speed", STATE_PULSE[state])       # from the table above
```

`STATE_PULSE = {dormant_cold:0.4, dormant_pending:1.2, spinup:3.5, active:2.5}`; the same
dict pattern for `base_alpha` and `glow_color`. All values are the Tuning Knobs below.

## Edge Cases

- **Enter a non-active portal:** `_on_portal_entered` returns immediately (state gate) —
  no jump, no error; the ring is visibly impassable (low alpha) so it reads as "not yet."
- **Enter an ACTIVE portal on foot vs in a car:** both are the player body / in the player
  group → both jump (matches `jump()`'s existing body-agnostic teleport).
- **Co-op peer enters:** same rule; `jump()` already handles the local player — a peer
  stepping through triggers only their own hop (victim/owner-authoritative, per net rules).
- **Gate flips state while the player stands inside the ring:** re-fire `body_entered`
  logic on the state transition to ACTIVE (check overlap), so igniting a portal under a
  waiting player jumps them — no need to step out and back in.
- **Paused game:** portal keeps animating (physics-frame clock), but `body_entered`
  can't fire while physics is paused — correct (no jump mid-menu).
- **Missing mesh/shader** (`meshes/wobble.res`, `portal_disk.gdshader` not at the vendored
  path): the gate logs once and spawns NO portal, falling back to the current
  `interact()`→`jump()` prompt — never a crash, never a gate you can't use.
- **Headless sims:** the dummy renderer stubs materials (a harmless
  `material_get_instance_shader_parameters is null` notice); portal spawn + `body_entered`
  + state gating are all testable without a real GPU.

## Dependencies

- **`carousel.gd` (`ProtoGate`)** ← spawns/owns the portal, adds `set_portal_state()` +
  `_on_portal_entered()`, calls `set_portal_state()` from every `state`/`objectives_left`
  mutation (`_spawn_occupation`, the objective-clear branches in `interact()`, `_try_spinup`,
  `_go_active`). The one mechanical call reuses the existing `carousel.jump(row["id"])` —
  no change to `jump()` itself (line ~125) or `pick_destination`.
- **`game/addons/exit_portal_free/`** ← `portal_wobble.tscn`/`.gd` + `portal_disk.gdshader`
  + `meshes/wobble.res` are consumed; the room/camera/showcase files are ignored (candidates
  for deletion once the wiring is proven, to keep the addon lean).
- **`world_state` / faction colors** ← optional tint source for a claimed gate's glow.
- **Net (`net.gd`)** ← a jump is already local-player-authoritative; the portal changes only
  the TRIGGER, so no new sync (the gate's `state` is host-driven as today).
- **No new data file.** Portal tunables live as consts on `ProtoGate` (or an optional
  `carousel.json` per-gate `portal` sub-dict if we want per-base color later).

## Tuning Knobs

| Knob | Range | Governs |
|---|---|---|
| `portal_scale` | 0.6–0.85 | ring size at gameplay zoom; too big swallows the gate |
| `collision_height` / `_y` | 2.0–4.0 / 1.0–2.0 | the drive-through trigger volume vs platform clip |
| `STATE_PULSE[*]` | 0.3–4.0 | spin/pulse rate per state — the primary "how alive" read |
| `STATE_ALPHA[*]` | 0.2–1.0 | transparency per state — dormant should read as "off" |
| `glow_color` base | any non-purple hue | house style; faction tint overrides when claimed |
| `ring_count` / `swirl_strength` | 1–10 / 0–10 | shader busyness — leave near addon defaults (4 / 3.5) |

## Acceptance Criteria (testable — `carousel_portal_sim`)

1. A spawned `ProtoGate` owns exactly one portal node (the `portal_wobble` `Area3D`),
   scaled to `portal_scale`, collision height/`y` set to the tuned values.
2. `set_portal_state()` maps each of the four states to the specified `pulse_speed` /
   `base_alpha` / `glow_color` shader parameters (assert the parameter values after each
   transition; no purple in any state — hue check).
3. Player body entering the portal while `state == "active"` calls `carousel.jump(id)`
   exactly once (spy the jump / assert the player position changed to a destination cell).
4. Player body entering the portal in DORMANT / SPINUP does NOT jump (position unchanged),
   and logs no error.
5. A gate that transitions to ACTIVE while the player already overlaps the ring jumps them
   without a re-enter.
6. Missing mesh/shader path → no portal spawned, `interact()`→`jump()` still works, no crash.
7. The vendored addon imports and its shader loads on the GL-Compatibility renderer with no
   shader-compile or script-parse error (already verified at vendoring: `showcase.tscn`
   boots headless, only the harmless dummy-renderer material notice).
8. Regression: `carousel_sim` and `carousel2_sim` stay green (the portal is additive — the
   `interact()`/`jump()`/objective ladder paths are unchanged).
