# VehicleForge — the DRIVN fleet editor

Tune every vehicle's stats, cargo, seats, and **armor** with no code. One source of
truth: `game/data/vehicles.json` — the SAME rows `DrivnData` folds into
`ProtoCar3D.VEHICLES` at boot (MASTER_PLAN Goal 1). Edit here, relaunch the game.

```
node tools/vehicleforge/server.mjs      # http://localhost:8898
```

- **Browser editor** — a fleet roster (armor-rated), a per-vehicle tuner with the
  armor gauges front-and-center, live sliders for drivetrain/tires/cargo, and a
  sortable fleet **compare** panel. Every change saves to `vehicles.json`.
- **REST API** (humans + AIs) — `GET /api/help` for the contract. Read/tune/forge
  vehicles by `curl`; a new vehicle is a pure-data row + an `archetype` (a proven
  chassis), no engine code.
- **Tests** — `node tools/vehicleforge/test_api.mjs` (runs on a temp copy).

Fields: `id, name, archetype, family, mass, engine_force, top_speed, reverse_top,
tire_grip{front,rear,dirt}, trunk_volume, passenger_seats, dog_seats,
armor{front,rear,side} (0-100), wound_mult, mounts[]`.
