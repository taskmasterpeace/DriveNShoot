# MapForge v4 — the DIVIDED STATES USA road & world editor + API

One source of truth: **`game/data/usmap.json`** — the same file the game loads at boot
(`ProtoUSMap`), the browser editor edits, and this REST API mutates. Every mutation
saves to disk immediately; restart the game (or F10-reload) to drive the new map.
`GET /api/help` is the always-current machine-readable reference; this file is the tour.

```
node tools/mapforge/server.mjs        # editor at http://localhost:8899, API under /api/*
node tools/mapforge/generate_usa.mjs  # REGENERATES the whole map (overwrites your edits!)
```

## The map model

- **Scale law (60×):** 4 real hours of driving = 4 real minutes. The continental US is
  **150×85 cells of 500 m** = **75 × 42.5 km** of world. `world = world_offset + cell * cell_m`.
- **Layers:** biome char grid (`grid`), state char grid (`states_grid`), `roads`
  (world-meter polylines with lanes/divided/surface/nickname/danger/toll character),
  `exits` (the content sockets), `junctions` (BAKED — never hand-edited), `placements`
  (authored structures), `towns`, `rivers`, `districts` (v4 named polygon areas),
  `authored_zones` (streaming skips them).
- **Biomes:** `.` ocean · `w` water · `F` forest · `f` scrub · `p` plains · `a` farmland ·
  `d` desert · `m` mountains · `s` swamp · `u` urban.
- The plan layer (v4 shared owner+AI TODO pins) is a SIDECAR —
  `game/data/world/map_plan.json` — never game data.

## The laws the API enforces (v4)

- **Field-preserving road writes** — `POST /api/roads` starts from the previous row and
  overlays only the fields you sent: nickname, danger, toll, lanes, divided, `surface`
  (the M3b grip law), and the bake-minted ramp fields (`side`, `geom`) all survive a
  points edit. Editing a RAMP's points clears its `geom`/`side` so the next bake
  re-crafts the 12° peel around your new shape.
- **Milepost exit numbering** — new exits number themselves `round(arc / EXIT_MILE_M)`
  from the highway's south/west origin (mirrors `usmap.gd`; **MERIDIAN = I-95 EXIT 9**
  is the canon anchor). Fresh ids never clobber legacy-era ids.
- **The multi-writer guard** — the FORGE hub's instance, a preview instance, and a
  curl-driving AI can all run at once: an mtime stat before every request re-reads the
  map if another process wrote it. `POST /api/reload` forces a full re-read.
- **The junction bake** — `POST /api/junctions/bake` (re-runnable, character-preserving)
  derives `junctions[]`, re-peels exit geometry, renumbers exits by milepost, stamps
  town streets + network fill. **The MERGE LAW:** a meeting near an existing node is
  ABSORBED into its legs instead of dropped — town grids stay connected to their feeders.

## Endpoints (summary — `GET /api/help` for request shapes)

| Area | Endpoints |
|---|---|
| Read | `GET /api/meta` · `/api/map` · `/api/grid?layer=` · `/api/cell` · `/api/query` |
| Biomes | `PUT /api/cell` · `POST /api/paint` |
| Roads | `GET/POST/DELETE /api/roads` — field-preserving |
| Towns | `GET/POST/DELETE /api/towns` |
| Exits | `GET/POST/DELETE /api/exits` — milepost law; the node owns its ramp roads |
| Junctions | `GET /api/junctions` · `POST /api/junctions/bake` · `GET /api/graph_health` |
| Placements | `GET/POST/DELETE /api/placements` — catalog-validated |
| Structures | `GET/POST/DELETE /api/structures` — the §7 catalog (§9 JOB rule) |
| **Districts (v4)** | `GET/POST/DELETE /api/districts` — named polygons; future territory rows |
| **Plan (v4)** | `GET/POST/DELETE /api/plan` — shared owner+AI TODO pins (open/doing/done) |
| **Route (v4)** | `GET /api/route?ax=&az=&bx=&bz=&vehicle=` — drive-time on the real graph |
| **Vehicles (v4)** | `GET /api/vehicles` — fleet top speeds read live from `car_3d.gd` |
| Housekeeping | `POST /api/reload` |
| Legacy | `POST /api/exit` (v1 bare ramp) · `POST /api/stamp_template` (waystation/hamlet/outpost) |

## Drive-time model (`/api/route`)

- **Law time** = the engine's `road_graph.gd` `KIND_SPEED` (what the in-game GPS quotes):
  interstate 29 m/s · us_route 22 · state_road 19 · county 16 · street 11 · dirt 9 ·
  exit 12; rows override with `speed_mps`.
- **Vehicle time**: interstates run the vehicle's top; every lesser road caps at its law speed.
- **`time_game`** = real seconds × 60: a 7-minute drive is ~7 hours on the game clock.
- Endpoints snap to the 3 nearest distinct roads (an orphan street can't strand the
  route); an unreachable destination routes as close as the net allows and reports
  `reached: false` + `reached_within_m`.

## Graph health (`/api/graph_health`)

Connected-component report over the baked junction graph: `components`, `main_share`,
`orphan_roads` — fragments the bake never tied to the trunk. The editor's ORPHANS layer
paints them red; fix by dragging the feeder road to genuinely meet the network, then BAKE.

## AI recipes

```bash
# What's here? (world coords are the game's Vector3 x/z)
curl "localhost:8899/api/query?wx=110&wz=-325&r=5000"

# How long from Meridian MAIN ST to Saint Regis on a bike?
curl "localhost:8899/api/route?ax=115&az=-290&bx=-5920&bz=10784&vehicle=motorcycle"

# A named district + a plan note for the other editor (human or AI)
curl -X POST localhost:8899/api/districts -d '{"id":"meridian_downtown","name":"DOWNTOWN","kind":"downtown","poly":[[8,-318],[222,-318],[222,-262],[8,-262]]}'
curl -X POST localhost:8899/api/plan -d '{"pos":[120,-380],"text":"race loop start gate here?","status":"open","author":"owner"}'

# Road surgery, then re-run the junction law
curl -X POST localhost:8899/api/roads -d '{"id":"US-50","kind":"us_route","pts":[[-45000,-2000],[-30000,1500],[-18000,900]]}'
curl -X POST localhost:8899/api/junctions/bake -d '{}'
```

## Guardrails

- **Cell (120, 40) stays VIRGINIA forest** — the hand-authored Meridian/I-9 zone lives at
  world `(-60…220, -440…460)` and streaming skips it (`authored_zones`).
- Keep the coastline closed: `.` (ocean) is the world edge.
- `junctions[]` is BAKE OUTPUT — never hand-edit; edit roads, then bake.
- Regenerating (`generate_usa.mjs`) overwrites all edits — the editor/API refines,
  the generator starts over.
- Proof in-engine after big surgery: `junction_bake_sim`, `exit_address_sim`,
  `exit_geometry_sim`, `network_fill_sim`, `town_grid_sim`, `traffic_sim`, `world_sim`.
