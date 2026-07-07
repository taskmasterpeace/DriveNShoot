---
paths:
  - "game/proto3d/tests/**"
---

# Test Standards (the HOUSE sim convention)

**The one law:** every feature lands with a headless SIM that exercises the REAL
path — real input events, real interact chains, never teleport-the-result
(staging positions is the documented exception). This file describes the
convention the ~110 sims in `game/proto3d/tests/` actually use. (An earlier
version of this file prescribed a GDUnit-style `test_[system]_[scenario]`
framework that has never existed in this repo — three separate agents tripped
over the contradiction, and its `paths` didn't even match the real test dir.
This version documents reality.)

## The sim pattern

- One scene per sim: `res://proto3d/tests/<name>_sim.tscn` — a bare `Node`
  with `<name>_sim.gd` attached. Most sims instantiate `proto3d.tscn` under
  the harness (`get_tree().current_scene` is the SIM — game code uses
  `get_parent()` fallbacks, never assumes).
- Checks go through a `_check(name: String, ok: bool)` helper that prints
  `PREFIX: PASS - name` / `PREFIX: FAIL - name`, tallies, and ends with
  `PREFIX RESULTS: N passed, M failed` + `ALL CHECKS PASSED` on green.
  Grep-able, diff-able, no framework.
- Every sim has a WATCHDOG timer that force-quits with a FAIL tally rather
  than hanging a headless run.
- Restore what you touch: `Engine.time_scale` (restore the PREVIOUS value,
  never blindly 1.0), any `user://` or `game/data` file you modify (backup →
  restore in ALL exit paths, including the watchdog).
- Real input: build `InputEventKey`/`InputEventAction`/`InputEventJoypadButton`
  and `Input.parse_input_event()` them; give events several
  `await get_tree().physics_frame` (or `process_frame`) to land.
- Deterministic randomness: seed a local `RandomNumberGenerator`
  (`rng.seed = hash("...")`) — never lean on global RNG in an assertion.
- Isolated staging: stage test actors AWAY from Meridian/the safehouse clutter
  (the proven spot is around `Vector3(6, 0.35, 388)`) so interact scans and
  spawn logic can't grab a neighbor instead of your subject.
- New `class_name` scripts require one
  `--headless --path game --import` run before the sim will parse.
- Run: `Godot_v4.5.1-stable_win64_console.exe --headless --path game
  res://proto3d/tests/<name>.tscn` — kill zombie `*_console.exe` if a port or
  lock hangs.

## What every sim must still honor (kept from the old version)

- Every bug fix leaves a regression check.
- Test data lives in the sim (or a staged copy) — never shared mutable state.
- Performance-sensitive checks state their thresholds explicitly.
- Assertions are precise (`== expected`, bands like `±10%` written out), not
  vague `> 0` smoke checks.
- GDScript gotcha: lambdas capture `int`/`bool` BY VALUE — closure-mutated
  counters need a `Dictionary` wrapper.
