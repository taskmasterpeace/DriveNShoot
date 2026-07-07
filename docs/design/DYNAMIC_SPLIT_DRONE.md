# DYNAMIC SPLIT-SCREEN — DRONE PILOTING (+ high-bond dogs)

**Status:** 2026-07-07. Core SHIPPED — the split-screen tech (`split_view.gd` +
`split_screen.gdshader`, ported from godot-demo-projects `viewport/dynamic_split_screen`,
MIT) and the drone-pilot rules (`drone_pilot.gd`), both sim-proven (`split_view_sim` 13/13,
`drone_pilot_sim` 20/20). Guarded wire into `proto3d.gd` is additive and default-off.

## Overview

You walk up to a drone, turn it ON, and fly it yourself while your body stands immobile.
As the bird flies away from you the screen **auto-splits** — your body on one side, the
drone's eye on the other, divided by a line that tracks the real direction between them —
and **merges back to one seamless view** when it returns. The same view module later serves
a high-bond dog: the tighter your bond, the farther it can range before the split appears.

## Player Fantasy

Piloting the bird feels like leaving your body behind — tense, because your body is a
sitting duck while you're heads-down flying. The split screen is the drama: you watch the
gap between you and the drone widen across the screen, and you feel how far you've committed.

## Detailed Rules

**The dynamic split (`ProtoSplitView`, `split_view.gd`):** two SubViewports SHARE the main
`World3D` (`own_world_3d = false`) and render it from two top-down cameras — an ANCHOR (your
body) and a REMOTE (the drone). A fullscreen ColorRect runs `split_screen.gdshader` over
both textures. Cameras sit along the body↔remote line, centred between them when close (one
seamless view) and pushed to a half-`max_separation` offset when far (the split frames the
gap). `split_active` turns on when horizontal separation exceeds `max_separation`. It's an
overlay CanvasLayer — it never touches the main render path, so it's safe to toggle.

**The pilot session (`ProtoDronePilot`, `drone_pilot.gd`) — a 4-state machine:**
- `OFF` → `start(drone)` → **FLYING**: body immobile, split view up, you steer with move
  input at cruise altitude.
- **Can't just switch off in the air.** `request_off()` while airborne begins a **LANDING**
  (a controlled descent); only when it touches down does it actually shut OFF. On the ground
  already, it's an instant off.
- **Attacked while flying** → `on_attacked()` → **HOVER**: the bird can't drop from the sky,
  so it holds position uncontrolled, and your body regains control instantly to defend. From
  HOVER you `land()` it (→ LANDING → OFF) or re-take it.
- Your body is frozen ONLY in FLYING. In HOVER/LANDING/OFF you're free (you bailed / it's
  coming down on its own).

**Wiring (`proto3d.gd`, all guarded by `drone_pilot.is_active()` — default off):** `main`
owns one `ProtoSplitView` + one `ProtoDronePilot`; `enter_drone_pilot(drone)` starts the
session + activates the split; each physics frame while active it updates the pilot, routes
your move axes to `pilot_input`, and zeroes the body's velocity while `body_immobile()`;
player damage (`on_player_clawed`/`on_explosion`) calls `on_attacked()`; the drone's own
autonomous `_physics_process` early-returns while `piloted`; `shut_off` deactivates the
split. Turning a deployed drone on enters pilot mode; the interact action while active
requests off (→ land).

## Formulas

- Split test: `split_active = horizontal_len(remote − anchor) > max_separation`
  (`horizontal_len` ignores Y — altitude never splits).
- Split line direction: perpendicular to `player2_screen − player1_screen` (the shader's
  `split_slope`), so the divider tracks the real body→drone bearing.
- Adaptive line thickness: `lerp(0, thickness, (sep − max_sep) / max_sep)`, clamped — the
  line fades in as the split opens.
- Pilot altitude hold: `y ← lerp(y, FLY_H, 1 − e^(−4·dt))`; descent: `move_toward(y,
  GROUND_Y, LAND_SPEED·dt)`.

## Edge Cases

- Drone destroyed (shot down) mid-flight: pilot `update` sees an invalid drone and fails
  safe to OFF (body freed) — no stuck immobile state.
- `request_off` spammed: idempotent — already-landing stays landing; already-off no-ops.
- Attacked while already HOVER/LANDING: no-op (you already have your body).
- Split with anchor == remote (drone right on you): separation 0 < threshold → one view.
- Vertical-only separation (drone straight overhead): horizontal len 0 → no split.
- Deactivate while flying (forced, e.g. death): split hides; pilot should be off'd by the
  same path so the body isn't left frozen.

## Dependencies

- `split_view.gd` ← `split_screen.gdshader`; shares the main `World3D` (the same trick
  `secondary_view.gd` uses). `drone_pilot.gd` ← a piloted `Node3D` (the drone).
- `proto3d.gd` ← owns both, provides `enter_drone_pilot()`, routes input/freeze/attack/exit.
- `drone.gd` ← a `piloted` flag that suspends its autonomous flight while you fly it.
- Bidirectional: `secondary_view.gd` (the PiP "little window") stays the CLOSE-range eye;
  the split is the FAR-range eye — they're complementary, not replacements.

## Tuning Knobs

| Knob | Range | Governs |
|---|---|---|
| `max_separation` | 12–60 m | how far the remote goes before the screen splits (dogs: scale with bond) |
| `split_line_thickness` | 0–10 px | the divider's weight |
| `cam_height` / `cam_back` | m | the piloted eyes' framing (match the game's top-down feel) |
| `FLY_H` / `FLY_SPEED` / `LAND_SPEED` | m, m/s | drone cruise altitude, pilot speed, descent rate |

## Future — high-bond dogs

The same `ProtoSplitView` drives a "see through the dog" cam for a SOULBOUND dog: bond tier
sets `max_separation` (a tighter bond = it ranges farther before the split), `activate(body,
dog)` on command, `deactivate()` on recall. No new view code — just a different remote and a
bond-scaled threshold. (Retired dogcam PiP is NOT revived; this is the far-range split.)

## Acceptance Criteria

1. `would_split` splits past the horizontal threshold only; altitude never splits.
   (`split_view_sim`) ✓
2. Module builds two shared-`World3D` viewports + the composite shader; `activate` on a
   close pair shows one view, flying the remote far flips `split_active` true, returning
   flips it false. (`split_view_sim`) ✓
3. `start`→FLYING freezes the body + shows the split; piloting moves the drone. ✓
4. `request_off` airborne → LANDING → OFF (never an instant mid-air off); grounded → instant
   off. ✓
5. `on_attacked` while flying → HOVER, body freed, bird stays airborne (does not fall);
   `land` from HOVER → OFF. ✓ (`drone_pilot_sim`)
6. Destroyed drone → fail-safe OFF. ✓
7. Wire is additive: with no session active, `spine_sim` boots green and play is unchanged.
