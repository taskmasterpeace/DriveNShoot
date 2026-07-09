# TERRAIN — TEXTURE (shipped) + RELIEF (the next arc)

**Status:** 2026-07-07. Part 1 (per-biome ground TEXTURE) is SHIPPED — `world_builder.gd`
`ground_material()`/`ground_visual()`, `ground_texture_sim` 12/12. Part 2 (RELIEF /
elevation) is the greenlit design below, not yet built. Goal origin: "improve the terrain
in every biome — this adds texture," referencing Terrain3D then LiteTerrain.
**2026-07-08 pointer:** the highway fall-through traced in part to RELIEF v1's
per-chunk-CENTER floor decision (relief↔flat seam cliffs beside roads). The fix contract
is `GROUND_INTEGRITY.md` (rule G4: five-point relief sampling) — it gates how chunk
floors choose relief from here on.

## Overview

The terrain addons don't fit us and we don't adopt them: **Terrain3D** is a Vulkan-oriented
GDExtension (our project is GL Compatibility) and **LiteTerrain** is an editor tool for one
hand-sculpted mesh — both assume a fixed single terrain, while we STREAM a procedural 60×
continent (`world_stream.gd`). We cherry-pick their two good ideas natively: **surface
texture** (done) and **height + altitude/slope coloring** (this arc).

## Player Fantasy

You FEEL the country change through the suspension: cruise flat Florida, then climb into a
rumpled Colorado where the raycast car leans on grades and the ridgelines go grey-then-white
with altitude. Regional identity you drive over, not just a recolored floor — the payoff
that makes a 60× continent worth having.

## Detailed Rules

Part 1 — TEXTURE (shipped): every biome ground is a `StandardMaterial3D` with a shared
procedural mottle albedo + normal map, triplanar world-mapped (no stretch), tinted per
biome. Boxes/houses keep the flat `material()`. See `world_builder.gd`.

Part 2 — RELIEF (proposed):
1. **Relief is data.** One `relief` scalar (0..1) per state/region in `usmap.json`
   (Florida 0.0, Colorado 1.0), painted in MapForge like every other field.
2. **One shared height field.** `ground_y(x, z) = fbm_noise(x, z) * relief_at(x, z) *
   MAX_RELIEF_M`. Deterministic, so neighboring chunks sampling the same function meet with
   no seam/crack — the key to streaming without stitching.
3. **Displaced chunk floors.** The far-chunk `BoxMesh` floor (`world_stream.gd` ~169)
   becomes a subdivided `PlaneMesh` displaced by `ground_y`, with a **`HeightMapShape3D`**
   collider (cheap, purpose-built — never per-chunk trimesh, which would choke streaming).
4. **The authored core stays flat.** Inside the 12 km authored slab (highway + Meridian,
   where roads/towns/structures live at y=0) relief stays 0 — no draping needed there.
   Relief lives in the WILDERNESS far chunks first; extending it under authored content is a
   later step gated on draping (below).
5. **Altitude/slope coloring** (LiteTerrain's one genuinely good idea): tint the ground by
   height and steepness in the ground shader/vertex color — grey cliffs, snow caps up high,
   green lowlands. Cheap, GL-Compatibility-safe, big visual payoff.

## Formulas

- `relief_at(x,z)` = the region's `relief` from `usmap` (bilinear-blended across borders so
  a state line isn't a cliff). Range 0..1.
- `ground_y = fbm(x*FREQ, z*FREQ) * relief_at * MAX_RELIEF_M`. At 1:60 scale a literal
  4000 m Rockies is ~66 m of model relief — dramatic but authored at scale, not literal.
  Suggested `MAX_RELIEF_M ≈ 60`, `FREQ ≈ 0.0015`.
- Snow line / slope tint: `snow = smoothstep(H_SNOW-δ, H_SNOW+δ, ground_y)`, `rock =
  smoothstep(SLOPE_LO, SLOPE_HI, 1 - normal.y)`.

## Edge Cases

- **Coasts/water:** `relief` → 0 at coastlines so Florida/beaches stay at sea level; water
  chunks keep their flat surface.
- **Chunk seams:** guaranteed matched because both sides evaluate the same `ground_y` — no
  stitching pass. A sim must assert `ground_y` continuity across a shared edge.
- **Anything currently at y=0** (roads, town ruins, scatter, structures, the carousel
  portal) must sample `ground_y` to sit ON the surface — **this draping is the bulk of the
  work**, the reason relief starts in wilderness-only far chunks.
- **Collision cost:** `HeightMapShape3D` per chunk only; unload frees it with the chunk.

## Dependencies

- `world_stream.gd` (chunk floor → displaced mesh + heightmap collider; scatter samples
  `ground_y`), `world_builder.gd` (a `ground_y` provider + the slope/altitude shader),
  `usmap.json` + `ProtoUSMap` + MapForge (the `relief` field + painter), `car_3d.gd`
  (already raycast-suspension — drives slopes for FREE, the hard part is done).
- Bidirectional: this doc is the terrain relief contract; `world_stream.gd`'s ground
  section is where it lands.

## Tuning Knobs

| Knob | Range | Governs |
|---|---|---|
| per-region `relief` | 0.0–1.0 | how mountainous a state is (the whole vision) |
| `MAX_RELIEF_M` | 20–80 | global vertical exaggeration at 1:60 |
| `FREQ` | 0.0008–0.003 | hill size (low = broad ranges, high = choppy) |
| `H_SNOW`, `SLOPE_*` | m / 0–1 | where snow caps and rock faces appear |
| chunk subdivisions | 16–64 | mesh fidelity vs. streaming cost |

## Acceptance Criteria (for the relief arc — `terrain_relief_sim`)

1. `ground_y` is deterministic and continuous across a shared chunk edge (sampled both
   sides, equal within ε) — no seams.
2. `relief_at` reads the region `relief` and blends across a state border (no cliff at the
   line); `relief 0` regions produce `ground_y == 0` (flat, e.g. Florida/coast).
3. A displaced far-chunk floor builds a `HeightMapShape3D` whose heights match `ground_y`.
4. Scatter/props in a relief chunk sit on the surface (`y ≈ ground_y`), not floating/buried.
5. The raycast car driven up a graded chunk gains elevation and stays grounded (real
   suspension, no teleport).
6. Altitude/slope tint: a high, steep sample reads rock/snow; a low flat sample reads its
   biome ground.
7. Regression: authored core (highway/Meridian) stays flat; `spine_sim`/`world_sim` green.
