# WATER RESEARCH — the one-pass survey before THE WATER'S EDGE (2026-07-09)

**Law honored:** techniques and shader CODE only, MIT/CC0 only, source+license cited in the
file header (the `car_3d.gd` aero-drag precedent). **No art packs** — the banked verdict stands
(DRIVN builds its own; the box aesthetic IS the art).

---

## 1. Survey (what's out there, with licenses)

### A. Toon Style 3D Water Shader — **No textures needed** ⭐ the technique donor
- **Source:** https://godotshaders.com/shader/toon-style-3d-water-shader-no-textures-needed/
- **Author:** Megalithium · **License: CC0** ("can be used freely without the author's permission")
- **Godot:** posted for 4.3, confirmed working on 4.5.1 (our engine: 4.5).
- **Technique:** vertex bob via sin/cos of position+time · water color = TWO TONES blended by a
  procedural layered-circle pattern (`waterlayer()` — no texture sampling anywhere) · shoreline
  foam via `DEPTH_TEXTURE` depth-difference + smoothstep softening · in-shader Perlin-ish noise
  distorts UVs and foam edges.
- **Why it fits DRIVN:** zero textures (no-asset-pack ethos), flat two-tone color (the box
  aesthetic), and every part reads from a TOP-DOWN camera (banding + foam ring are planar effects).

### B. Foam Edge Water Shader — the depth-math donor
- **Source:** https://godotshaders.com/shader/foam-edge-water-shader/
- **Author:** Antz · **License: MIT** ("can be used freely")
- **Godot:** 4.5+.
- **Technique (the precise foam band):** reconstruct linear depth from `DEPTH_TEXTURE`
  (`depth = 1.0 - 2.0 * depth` → perspective divide) · `waterDepth = z_depth - z_pos` clamped ·
  falloff band `1.0 - waterDepth/foamFallOffDistance + foamEdgeBias` · leading-edge attenuation
  when `waterDepth < foamFallOffDistance * foamEdgeDistance`. (Its texture-scroll step is replaced
  by A's procedural noise — we keep the MATH, not the texture.)

### C. Surveyed, not adopted
- **StayAtHomeDev — Single Plane Water Shader / Infinite Ocean in Godot 4**
  (https://stayathomedev.com/tutorials/single-plane-water-shader/ ·
  https://stayathomedev.com/tutorials/making-an-infinite-ocean-in-godot-4/) — the named series.
  Approach per survey: subdivided PlaneMesh + shader albedo/roughness/normal + noise displacement,
  grid-of-planes for infinite ocean. Site refused connection during this pass (ECONNREFUSED);
  technique noted from search index. Its full-PBR look (fresnel/normals) is MORE than the DRIVN
  flat read needs — kept as a reference for the plane/grid setup only.
- **Boujie Water Shader** (https://github.com/Chrisknyfe/boujie_water_shader, Godot 4.x) —
  Gerstner waves + SurfaceTool LODs. MIT, solid, but built for realism/first-person horizons;
  overkill for a top-down two-tone read. Not adopted.
- **godot4-oceanfft** (https://github.com/tessarakkt/godot4-oceanfft) — Tessendorf FFT compute
  ocean. Massive overkill. Not adopted.
- Other godotshaders CC0 toon options (toon-water-shader-godot-4-4, water-shader-toon-like-godot-4-4,
  cartoon-3d-water) — same family as A; A chosen for the no-texture guarantee.

## 2. THE CHOSEN APPROACH (what gets built)

**One `water.gdshader`, written fresh for DRIVN, adapting A's structure with B's foam math.**
Header cites both sources + licenses (the aero-drag precedent).

- **Mesh:** flat `PlaneMesh` water sheets placed per coastal CHUNK by `world_stream` (the chunk
  pipeline already owns "what exists here"); sheet size = chunk-sized quads at sea level
  (`WATER_Y`), only where the map says water. No subdivision needed — the bob is subtle and the
  camera is top-down (VERTEX bob on a quad reads as sheet motion; if flatness shows, subdivide 8×8).
- **Fragment:** flat TWO-TONE deep/shallow color banded by A's procedural circle-noise pattern
  (slow scroll, `TIME`-driven) · **shoreline foam** = B's linear-depth falloff band, softened by
  smoothstep + A's noise distortion — a living white edge wherever water meets land/objects,
  which is exactly the ≥100 m readability signal the top-down camera needs.
- **Vertex:** A's sin/cos bob, low amplitude (~0.08 m) — alive, never choppy.
- **Palette:** deep `Color(0.10, 0.22, 0.30)` / shallow `Color(0.16, 0.38, 0.42)` / foam warm
  white `Color(0.92, 0.94, 0.90)` — muted coastal teals, NO purple (house law), tuned against the
  night/day cycle in acceptance shots.
- **Renderer note:** `DEPTH_TEXTURE` requires the transparent pass (Forward+ — our renderer). In
  HEADLESS sims shaders never run — water GAMEPLAY (stall/swim/ford) is proven by sims against the
  water DATA layer, water LOOK is proven by acceptance renders + the fresh-context judge.

## 3. The gameplay split (research finding, for BLOCK W)

The engine already has: player wade/swim states (`proto3d.gd` `water_state`), swim drain/drown,
dog swim, and a traction matrix with wetness (`MUD_AND_MONSTERS` T1). What does NOT exist: a WATER
DATA layer (where IS water), the ocean visual, car engine-stall in deep water, and the map painting
water. The build therefore adds ONE authority — `water_depth_at(x,z)` on the usmap/world-builder
layer — and every consumer (shader sheet placement, car stall, swim trigger, map paint, drone
overfly) reads THAT. One law, five readers, no drift.
