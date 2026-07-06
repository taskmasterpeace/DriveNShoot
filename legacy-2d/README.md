# LEGACY 2D GAME — QUARANTINED

This is the old 2D CarWorld prototype (the systems donor), moved OUT of `game/`
on 2026-07-06 so Godot can never scan, load, or launch it again. It once hijacked
a live 3D playtest (a global F2 hotkey swapped scenes mid-drive) and launched by
default from a stale `run/main_scene`.

- The 3D mainline lives in `game/proto3d/` — see `docs/ENGINE.md`.
- These files are REFERENCE ONLY (design docs for them: `docs/legacy-2d/`).
- `data-vehicles/` holds the old DataVehicle .tres rows (they referenced
  `res://scripts/`, so they came along).
- Nothing here is in the res:// tree. To resurrect a piece, copy it INTO
  `game/` deliberately and re-import.
