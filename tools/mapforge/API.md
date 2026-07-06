# MapForge — the DEATHLANDS USA map editor & API

One source of truth: **`game/data/usmap.json`** — the same file the game loads at boot
(`ProtoUSMap`), the browser editor paints, and this REST API mutates. Every mutation
saves to disk immediately; restart the game to drive the new map.

```
node tools/mapforge/server.mjs        # editor at http://localhost:8899, API under /api/*
node tools/mapforge/test_api.mjs      # API smoke test (runs on a temp copy)
node tools/mapforge/generate_usa.mjs  # REGENERATES the whole map (overwrites your edits!)
```

## The map model

- **Scale law (60×):** 4 real hours of driving = 4 real minutes. The continental US is
  **150×85 cells of 500 m** = **75 × 42.5 km** of world. `world = world_offset + cell * cell_m`.
- **Layers:** a biome char grid (`grid`), a state char grid (`states_grid`, Voronoi of 48
  states), interstates (`roads` — world-meter polylines), `rivers` (already rasterized as
  water cells), `towns` (anchors the game stamps as ruins/landmarks).
- **Biomes:** `.` ocean · `w` water · `F` forest · `f` scrub · `p` plains · `a` farmland ·
  `d` desert · `m` mountains · `s` swamp · `u` urban.
- The game materializes everything else procedurally per 128 m chunk: forest = trees
  (some solid), farmland = crop rows + barns, water = bog (cross rivers at road **bridges**,
  which are automatic), neighborhoods + small woods appear near interstates, towns get
  welcome signs + husk blocks + landmarks (Vegas strip, the Rusted Arch, the Drowned Monuments).

## Endpoints (also served live at `GET /api/help`)

| Method | Path | Body / params | Does |
|---|---|---|---|
| GET | `/api/help` | — | machine-readable API guide (for AI agents) |
| GET | `/api/meta` | — | dims, scale, legends, counts — no grids, cheap |
| GET | `/api/map` | — | the whole map JSON |
| GET | `/api/grid` | `?layer=biomes\|states` | raw char rows |
| GET | `/api/cell` | `?x=&z=` or `?wx=&wz=` (world m) | biome, state, world pos, nearest road + town |
| PUT | `/api/cell` | `{x, z, biome}` | paint one cell (char or name) |
| POST | `/api/paint` | `{biome, cells:[[x,z],…]}` or `{biome, rect:[x0,z0,x1,z1]}` | bulk paint |
| GET | `/api/roads` | — | the interstate network |
| POST | `/api/roads` | `{id, kind?, pts:[[wx,wz],…]}` | add/replace a road by id |
| DELETE | `/api/roads` | `?id=I-99` | remove a road |
| GET | `/api/towns` | — | all towns |
| POST | `/api/towns` | `{id, name, pos:[wx,wz], kind?, landmark?}` | add/replace a town |
| DELETE | `/api/towns` | `?id=vegas` | remove a town |
| GET | `/api/query` | `?wx=&wz=&r=2000` | everything within r meters of a world point |

## AI recipes

```bash
# What's here? (world coords are the game's Vector3 x/z)
curl "localhost:8899/api/query?wx=110&wz=-325&r=5000"

# Grow a forest along a stretch of I-70
curl -X POST localhost:8899/api/paint -d '{"biome":"forest","rect":[60,33,70,36]}'

# Found a ville with a landmark on the map
curl -X POST localhost:8899/api/towns \
  -d '{"id":"deadwater","name":"DEADWATER","pos":[-21000,-4000],"kind":"ville","landmark":"THE SUNK SILO"}'

# Lay a new state route
curl -X POST localhost:8899/api/roads -d '{"id":"US-50","kind":"route","pts":[[-45000,-2000],[-30000,1500],[-18000,900]]}'
```

## Guardrails

- **Cell (120, 40) stays VIRGINIA forest** — the hand-authored Meridian/I-9 zone lives at
  world `(-60…220, -440…460)` and streaming skips it (`authored_zones`).
- Keep the coastline closed: `.` (ocean) is the world edge.
- Regenerating (`generate_usa.mjs`) overwrites all edits — the editor/API is the way to
  refine; the generator is the way to start over.
- Proof in-engine: `res://proto3d/tests/map_sim.tscn` (data anchors + a real input-driven
  drive across a biome border). Run it after big map surgery.

## MapForge v2 (authored layer, exits, templates)

- `GET /api/placements` — all authored structure placements.
- `POST /api/placements` `{id?, building, pos:[wx,wz], rot?}` — pin a structure at exact
  coordinates. Biomes stay procedural around it; the game spawns it from the placement layer.
- `DELETE /api/placements?id=…` — remove a placement.
- `POST /api/exit` `{town}` or `{pos:[wx,wz], name?}` — auto-build an OFF-RAMP (kind `exit`)
  from the nearest interstate to a town/point, connecting it to the network.
- `POST /api/stamp_template` `{template, town}` or `{template, pos, name?}` — drop a named
  cluster of placements. Templates: `waystation`, `hamlet`, `outpost`.
