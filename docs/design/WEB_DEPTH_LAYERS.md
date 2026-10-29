# WEB_DEPTH_LAYERS: one law for flat things on flat things (2026-10-28)

Lane: Z-FIGHT (`feat/web-zfight`). Robert, 2026-10-28, with screenshots of a blood-splattered sand street beside a store
counter and two police cars between a tall building and a flat roof: "fix the zfighting throughout the game".
Law: `web/src/engine/depthlayers.js`. Detector: `web/src/agent/zfight.js` (the `zfight` command and two selftest checks).
Renders: `docs/renders/web/zfight/`.

## 1. Overview

From the top-down camera most of the screen is horizontal surfaces stacked centimetres apart: the land, a road ribbon on
it, a walk beside the road, a floor slab on a pad, a rug on the floor, blood on the rug. Two that share a plane flicker as
the camera moves ("z-fighting"). Real terrain made it worse: every layer that assumed y = 0 is now somewhere else.

Three things were wrong, and the lane fixes all three:

1. **Coplanar layers inside one mesh.** The streamed road layer holds town streets, walks, yards, lots and every road
   ribbon in ONE mesh, so polygonOffset cannot separate them. Town streets crossed at 0.032 / 0.036 m, walks met walks at
   0.026, ribbons crossed ribbons at the same height (rosewood, tampa, the dry dock), citygen x and z streets and their
   kerbs shared a plane, citygen stair flanks and storey walls came up to exactly the floor-slab top, fire-escape rails
   lay on the flights' rails, and window lintels drew over the ring's own wall tops.
2. **Decals at absolute heights.** Scorch at y = 0.135, smears at 0.15, tyre tracks at 0.035, the interaction ring at
   0.18, car-roof blood at 1.45: all buried on real terrain. Blood at ground + 0.13 also sat under the ring's floor
   finishes (0.132) and rugs (0.15), and upstairs blood was counted from the ground twice.
3. **Depth precision.** The camera's near plane sat at 1 m with the boom out to 175 m: the depth buffer resolved only
   ~1.5 cm at the widest zoom, so 2-4 mm layer gaps flickered.

## 2. Player Fantasy

You never notice the ground. Streets, kerbs, yards and floors are solid paint; blood lies on the shop floor, on the rug
and on the sand outside at every zoom; a roof is a roof, its edge one clean line.

## 3. Detailed Rules (the layer table)

**Opaque layers** write depth and are separated by **lift** (metres over the surface they rest on). **Decals** never write
depth; they lie a lift over the ground or the floor under them (never y = 0), with a polygonOffset and a fixed renderOrder
from their row. Measured from the code (audit 2026-10-28):

| Layer | Where | Material / depthWrite | polygonOffset | renderOrder | Height law (after this lane) |
|---|---|---|---|---|---|
| island ground plane | `world/city.js` | Std, opaque, dW | - | 0 | y = 0 (Phoenix pad) |
| island sidewalks / plazas | `world/city.js` | Std, opaque | - | 0 | 0.02 / 0.025 |
| island roads (E-W / N-S) | `world/city.js` | Std, opaque | - | 0 | 0.03 / 0.04 (1 cm: fine with the near plane) |
| road paint, cracks, potholes | `world/textures.js` | in the asphalt texture | - | - | - |
| chunk ground | `world/streamer.js` + `chunkgen.js` | Std + vertex colours | - | 0 | the land G(x, z) (8 m grid) |
| chunk road ribbons | `chunkgen.js` road layer | Std | - | 0 | land + **RIBBON_BASE 0.03 + 0.012 x rank** (interstate 0, ramp 1, others 2 + heading third) |
| stop lines | `chunkgen.js` | road layer | - | 0 | land + **PAINT_LIFT 0.09** |
| town yard / lot / walk x / walk z / street x / street z | `chunkgen.js` (ring + holdouts) | road layer | - | 0 | land + **TOWN rows 0.012 ... 0.072** (STEP 0.012); a street + `tieLift(name)` (0 or STEP/2) where two of one axis join |
| cemetery yards, paths, mounds, kerbs (death rites) | `systems/rites.js` | Std (one InstancedMesh `rites`) | - | 0 | the land (or pad) under each piece + rows **cemGround 0.086 < cemPath 0.106 < cemHollow 0.126 < cemKerb 0.146 < cemMound 0.166** (oldest mound top; younger to 0.25, fresh 0.32); markers lying on a mound sit on its top; a stone wall's runs alternate 0.72 / 0.734 (a third height where the last run meets the first); trench humps 0.66 wide on a 1 m spacing (never overlap) |
| ballistics ground scuffs | `systems/ballistics.js` -> `fx.decal` | fx dMesh | blood | 3 | ground + DECAL_Y |
| chunk rock (fills) | `chunkgen.js` | Std, DoubleSide | - | 0 | land + fill profile |
| chunk water | `world/water.js` streamMat | Std, opaque | - | 1 | region sheet 0.015 / river surfaces |
| island river, lake | `world/water.js` | Std, opaque | - | 1 | 0.015 |
| island shore band | `world/water.js` | Std, transparent, no dW | groundDecal | 2 | 0.008 |
| bridge shadow | `world/water.js` | Basic, transparent | shadowBlob | 2 | 0.02 |
| ring / authored floor slab | `world/ring.js` floors pool | Std | - | 0 | pad + 0.12 top |
| ring floor finish | `world/ring.js` props | Std | - | 0 | pad + 0.132 |
| rugs (ring, holdout) | `data/ring.js`, `world/holdout.js` | Std | - | 0 | pad + 0.14-0.15 |
| storey slabs | `world/storeys.js` | Std | - | 0 | Y[k] + **STEP/2** (6 mm over wall tops), finishes Y + 0.012 |
| citygen blocks | `world/citygen/build.js` | Std (one InstancedMesh) | - | 0 | base + 0.04 top |
| citygen x road: kerb / surface | idem | Std | - | 0 | base + 0.08 / 0.10 |
| citygen z road: kerb / surface | idem | Std | - | 0 | base + 0.092 / 0.112 (**+STEP**) |
| citygen stair flanks | idem | Std | - | 0 | top **STEP under** the floor they meet |
| citygen fire-escape landing grating | idem | Std | - | 0 | top **STEP/2 over** the flight's top tread |
| back-lots alley kerb / lane / ruts (x; z +STEP/2) | `world/citygen/backlots-build.js` | citygen mesh | - | 0 | base + 0.046 / 0.062 / 0.074: over the block (0.04), under the streets' kerbs (0.08) |
| back-lots dock apron, yard trodden dirt | idem | citygen mesh | - | 0 | base + 0.057 / 0.046 |
| citygen fire-escape outer rail | idem | Std | - | 0 | **STEP proud** of the flight rail (top and face) |
| roofs (island, ring pool, citygen) | `world/surfaces.js` roofSurface | Std | - | 0 | h + 0.2 slab / top + 0.15; walkable deck = slab top |
| window lintel / head | `systems/interiors.js` | Std | - | 0 | lintel top **STEP under** the wall top; head **STEP over** jambs |
| blood (floor, wall, car) | `systems/blood.js` | Lambert, transparent | blood -4/-8 | 3 | floor: ground or storey floor + **DECAL_Y 0.16**; car: roof top (bbox) + 0.02, rides the car's y |
| fx decals, footprints, pools | `systems/fx.js` dMesh | Lambert, transparent | blood -4/-8 | 3 | ground + DECAL_Y; upstairs `fx.onFloor(c)` |
| skids | `systems/fx.js` sMesh | Lambert, transparent | groundDecal -2/-4 | 2 | ground + **TRACK_Y 0.095** |
| history decals (skid, scorch, oil, bonfire ring, blood trail) | `systems/lookfeel.js` (WEB_LOOK_FEEL.md) | Lambert, transparent | groundDecal | 2 | ground + DECAL_Y + 0.004 + 0.003 x kind (over every floor and rug) |
| tyre tracks | `systems/ambient.js` | Basic, transparent | groundDecal | 2 | ground + TRACK_Y (was 0.035 absolute) |
| foot tracks | `systems/outdoors.js` | Basic, transparent | groundDecal | 2 | ground + DECAL_Y (was 0.115: under floors) |
| hot-ground stain / glow | `systems/hotground.js` | Std / additive | - | 1 / 3 | 0.06 / 0.12 (Phoenix ring, flat datum) |
| stunt airborne shadows | `systems/stunts.js` | Basic, transparent | shadowBlob -3/-6 | 2 | v.gy + 0.05 |
| trap rings, zombie aura | `systems/traps.js`, `zombies.js` | Basic, transparent | ring -6/-12 | 5 | ground + 0.06 |
| interaction ring | `ui/qol.js` | Basic, transparent | ring | 5 | ground + 0.18 (was absolute) |
| spent brass | `systems/ambient.js` | - | - | - | rests on ground + 0.04 (was 0.04 absolute) |
| contact blobs | - | none exist (only stunt shadows) | - | - | - |
| minimap | `world/city.js drawMinimap` | 2D canvas, not a 3D layer | - | - | - |
| cutaway | `systems/cutaway.js` | a screen-space Bayer discard patched into lit materials; no cap mesh | - | - | - |
| sun shadow | `systems/sky.js` | 2048 map, box max(70, viewR x 1.05) | bias -0.0006, **normalBias 0.6 texel** (min 0.04) | - | follows the view centre and its ground |

**Camera** (`systems/camrig.js`): near = clamp(boom D x 0.1, 1, 6) m (was 1 m), far 600 / 1200 tilted (unchanged).
The `screenshot` command's zoom shots set the near plane the same way.

## 4. Formulas

- Depth gap the buffer resolves at distance d: gap = max(eps, 8 d^2 / (near x 2^24)), eps = 0.005 m.
  Example: the widest top-down zoom, D = 175: near 1 m gave 8 x 175^2 / 2^24 = 14.6 mm (a 4 mm street crossing flickered);
  near 6 m gives 2.4 mm, and every row is >= 6 mm apart.
- Ribbon lift: RIBBON_BASE + RIBBON_STEP x rank, rank = 0 interstate, 1 ramp, 2 + floor(heading mod 180 / 60) others.
  Two roads crossing at >= 60 degrees fall in different thirds; ribbons (0.030, 0.042 ...) sit 6 mm off the town steps
  (0.012, 0.024 ...).
- Shadow normal bias: 0.6 x (2 x half) / 2048; half = 70 m -> 0.041 m, half = 180 m -> 0.105 m.
- The render-only lifts in the road layer are applied AFTER the chunk's layout hash (`MeshBuf.lift`, `out.surf.*.dl`), so
  every golden (island, twelve P1 chunks, the real-terrain pins) holds byte for byte.

## 5. Edge Cases

- Two roads of one kind meeting at a shallow Y (< 60 degrees) can still share a third: the detector lists them.
- Two people standing on one spot overlap: characters are not layers (the detector skips `g.charR` meshes).
- Coplanar faces of one plain instanced batch with one colour (two crossing kerbs) draw the same pixel: counted as
  `twins`, not fights. A wall's top (wallSurface paints only the sides) and the cutaway's dither count as plain.
- Glass and smoke are transparent but are not decals: a decal declares itself by its row or its polygonOffset.
- Florida sits 222 km from the origin: float32 on the GPU costs about 1.7 mm of depth (top-down) to 9 mm (ISO / ANGLED
  close) per vertex, uncorrelated between two faces. The rows' 6-12 mm steps hold top-down; tilted views of Florida are the
  thinnest margin (a camera-relative origin would fix it; out of scope).

## 6. Dependencies

- In: `world/chunkgen.js` (road layer), `world/citygen/build.js`, `world/storeys.js`, `systems/interiors.js`, `systems/blood.js`,
  `systems/fx.js`, `systems/ambient.js`, `systems/outdoors.js`, `systems/stunts.js`, `systems/traps.js`, `systems/zombies.js`,
  `ui/qol.js`, `world/water.js`, `systems/camrig.js`, `systems/sky.js`, `main.js`, `systems/ai.js` all read the rows.
- Out: anything new that lays a flat thing on a flat thing reads a row (`layerMesh`, `decalMaterial`, `TOWN`, `STEP`,
  `DECAL_Y`, `TRACK_Y`) and runs `zfight` at its spot. BACK-LOTS (alleys, wheel ruts) and DEATH-RITES (cemetery plots)
  should take a TOWN step and DECAL_Y respectively.

## 7. Tuning Knobs (safe ranges)

| Knob | Value | Safe range | Effect |
|---|---|---|---|
| DEPTH.eps | 0.005 m | 0.003-0.01 | the detector's floor |
| STEP | 0.012 m | 0.008-0.02 | the town/citygen/storey step; bigger = safer, taller stacks |
| RIBBON_BASE | 0.03 m | 0.02-0.04, off the STEP grid by STEP/2 | ribbons over region water (0.015) |
| DECAL_Y | 0.16 m | > highest rug (0.15) | decals over every floor finish |
| TRACK_Y | 0.095 m | > PAINT_LIFT (0.09), < DECAL_Y | tracks over every road |
| near share / min / max | 0.1 / 1 / 6 m | share 0.05-0.15 | depth precision vs clipping tall things at close zoom |
| normalBias texel share | 0.6 | 0.4-1.0 | acne vs peter-panning |

## 8. Acceptance Criteria

- `zfight x z r` lists every coplanar pair round a spot (up faces fail, walls reported), decals buried, the gap.
- Selftest `zfight: no two visible, depth-writing, up-facing faces share a plane ...`: 0 up-face fights and 0 buried
  decals at seven spots (Phoenix street, a ring house interior with the roof cut away, the ring's densest blocks,
  Meridian, I-10 mile 30, Meridian's town cemetery, a stamped county seat's police station and roofs).
- Selftest `zfight: blood shows on a ring shop's floor and on open sand from the widest game zoom`: a red decal changes
  the reddest pixel in its footprint from 140 m up, on a floor and on sand; near plane >= 6 m at the widest zoom.
- Survey (17 spots, before -> after, up-face fight samples): ring house 6338 -> 0, ring dense 4690 -> 0, Meridian 3628 -> 0
  (pre-fix survey: 25510 incl. ribbons), rosewood 1550 -> 0, the dry dock 400 -> 0, El Paso 2109 -> 0, Arizona casino strip
  2441 -> 0, Florida county seat 1039 -> 0, Phoenix street 147 -> 0.
- Goldens unchanged (the render lifts go on after the layout hash); 87-90 draw calls; `scenario name=stress` ms/frame
  base (bfbf3c0b, same port) 6.86 / 6.25 / 5.51, this lane 5.81 / 6.01 / 5.88: no regression.
- Renders, before and after, close (camera 22 m) and wide (150 m): `docs/renders/web/zfight/<spot>-<zoom>-<before|after>.jpg`
  for the Phoenix street, a ring house interior with blood, the ring's dense blocks, Meridian, I-10 mile 30, a county
  seat store front with blood on its sand lot, and the police station roof with two patrol cars at its bays. A still
  frame cannot show a flicker: the detector's numbers are the proof, the renders show nothing broke.

## Not fixed (listed)

- Vertical-face coplanarity ("walls" in the report) is reported, not failed: wall pieces abutting flush (citygen slab
  edges against partitions, ring props, island storey corners) show at sin 8 degrees of their height from the game camera.
  The biggest are citygen's partition ends flush with slab edges (~26k samples in a casino strip).
- Earthworks fills overlapping (I-95 mile 9) are steep faces of one mesh with one colour: reported as walls.
- Breakage debris (`systems/materials.js`): now on the land, each piece of a pile STEP/2 over the last.
- Wide flat roadscape boxes (aprons 8 m, furrows 16 m) are lifted by their centre only and sink at one end on slopes.
- Shadow texel snapping (shimmer as the view moves) is not added.
