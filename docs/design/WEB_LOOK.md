# WEB_LOOK: light, colour, roofs and how a town is laid out

## 1. Overview

Robert, 2026-10-23, on the web engine's cities:
> "It's too dark, bro… I want more colors, and then we're going to have textures as well. But the layouts of the houses
> need to be better… look at the cities, look at how the cities are… these are like kind of burnt out but rebuilt
> versions. Miniature versions of that city… we got to size it to make it make sense."

And, looking at the game camera:
> "We can't just have the top of the buildings looking all boring like that."

This doc covers what was built for that and the study that decides the layouts that come next.

| part | what it does | commit |
|---|---|---|
| Light | `systems/sky.js` light levels, renderer exposure | 97995d9b |
| Colour | palettes for Rust Haven, the ruins and the ring zones; lighter sand, floors and paving | 97995d9b |
| Roofs | `world/surfaces.js`: five procedural roofs on every roof-sized instance | 97995d9b, b676e23d |
| Rust Haven's blocks | `data/holdout.js` and `world/city.js`: sidewalks round dirt yards, a market square, yard fill | b676e23d |
| Floor plans | real rooms in ring houses | separate branch, in progress |

## 2. Player fantasy

You look down on a desert city at noon and it is bright, bleached and readable. Rust Haven looks lived-in: painted
walls, patched roofs, a market under striped canvas round the fire, gardens and water tanks behind the houses. Two
blocks out, the ruins are grey and empty, and you feel the difference before you read a sign.

From above, every roof tells you something:
- a peeling white coat on an old office;
- tarps and a solar panel on a house somebody still lives in;
- clay tile on a bungalow.

At night it is dark enough to need a light, never black.

## 3. Detailed rules

### 3.1 Light

The cause was measured, not judged by eye: mean screen brightness over a 1280×720 shot at the game camera.

| moment | before | after |
|---|---|---|
| noon, Rust Haven street | 53 / 255 | 160 |
| noon, Old Phoenix ruins | n/a | 144 |
| 17:00 | n/a | 114 |
| 18:16 / 19:00, after sunset | 11 | 36 |
| 23:00 | n/a | 51 |

Three causes, each fixed:
1. **three.js r155+ no longer multiplies a light by π.** The sun (2.7) and the sky fill (1.0) were never raised to
   match. They are now `SUN_I` and `HEMI_I` (§7), with a lighter bounce off the sand. Exposure is 1.2 (was 1.05).
2. **Every surface was brown, around #5a–#8a.** See §3.2.
3. **The game starts at 18:36.** Night and the hour after sunset now sit around 36–51 / 255, so they stay readable
   instead of black.

### 3.2 Colour

- **Rust Haven is rebuilt and painted**: adobe, limewash, turquoise and sage trim, ochre, brick
  (`TOWN_COLORS`, `world/city.js`).
- **The ruins are bleached concrete** with the last of the old paint (`RUIN_COLORS`).
- **The Phoenix ring's zones** (`data/ring.js` ZONES):
  - the Dead Houses are stucco;
  - the Strip is cream and terracotta with teal;
  - the Yards are grey-blue steel and rust;
  - the Burn is smoke-dark but never black.
- **Sand, floors and paving are lighter.**
- No purple anywhere: hue 270–320 is banned.

Real albedo textures come later. Roofs are procedural (§3.3), so they cost no texture memory.

### 3.3 Roofs

`world/surfaces.js` `roofSurface(mat)` patches the island's roofs batch and the streamed roofs pool. The top face of
every instance at least `SMALL` across draws one of five roofs, picked by a hash of the instance's centre:

| kind | look |
|---|---|
| 0 corrugated sheet | ribs and sheet seams; some sheets fresh galvanised, some rusted through |
| 1 cool-coated flat | white elastomeric coat peeling in flakes over grey membrane |
| 2 clay tile | barrel-tile courses in terracotta |
| 3 rebuilt patchwork | blue, green and orange tarps, rust sheet, plywood, solar panels |
| 4 tar and gravel | speckled tar with darker patches |

Every roof also gets:
- a lit coping and a dark gutter line inside it, which reads as an edge;
- dust settling toward the middle.

Roofs larger than `BIG_ROOF` (towers, warehouses) are kind 1 or 4 only. Smaller instances (AC units, tanks, vents) get a
grille. Ribs and courses run across the long side.

### 3.4 Rust Haven's blocks

- A block is a `SIDEWALK`-wide strip round its edge. The inside shows the desert ground: yards and lots, not one slab.
  The slab read as a parking lot from the game camera.
- The lot by each block's crossroads is a paved square (`market.square`) with two rows of stalls facing an aisle across
  the plaza fire. Each stall has:
  - a counter with goods;
  - stock behind;
  - a rug underfoot;
  - four posts and a striped canvas awning.
  A stall is solid at counter height (a 2.2 m square, 1 m high: low cover).
- Each building's yard sides with enough margin take one of: a garden bed with crop rows, a water tank (solid), a
  washing line, or shade with a bench. These never go within `doorClear` of a door.
- The fill runs on its own random stream (`HOLDOUT.seed`) after everything else, so no building, spawn or earlier prop
  moved. Its solids changed the island's golden hash once, on purpose, to `eb103eab`.

### 3.4b Ring house lots and walls (built, 053b7745, 1109205b)

- **Ring house lots** (`data/ring.js` YARD, `world/ring.js` yardOf, on the lot's own stream so nothing placed before moves):
  - a 1.8 m concrete-block wall round the back yard (80% of houses);
  - each back wall stands `alley` (1.8 m) in from the lot line, so back-to-back lots leave a 3.6 m alley;
  - a gravel front yard and a desert tree;
  - a concrete driveway up the wider side, with a carport over it (55%);
  - a patio;
  - a pool in a third of the back yards with room (drained, gone green, or kept);
  - a shed;
  - a citrus or palo verde in a back corner. Palo verde and mesquite are clumps of three crowns, citrus is round, and a
    ruin's trees are dead.
- **Walls** (`world/surfaces.js` wallSurface) on the island's walls and the streamed walls pool. Side faces get one of:
  - stucco, 6 in 10 (trowelled, with patched repairs);
  - concrete block, 3 in 10 (0.2 m courses, 0.4 m joints, staggered);
  - brick, 1 in 10.

  Every wall also gets a dirt band at its foot and grime run down from its top. Measured with the GPU flushed every
  frame: 0.60 ms per frame with it, 0.65 without, so no measurable cost.

### 3.5 How a real city is laid out (the study that drives the next layouts)

| real Phoenix | from the air | what we build from it |
|---|---|---|
| **The mile grid**: arterials every mile, collectors at the half mile; older areas are a grid with alleys, post-1970 areas are curving subdivisions | wide roads framing superblocks | the ring keeps the island's 80 m lattice with an arterial every 4th line (the mile, compressed); curving subdivisions are open |
| **Hard corners**: a strip mall or gas station on each corner of an arterial crossing, parking in front | four parking lots at every big crossing | next: strip lots on the corners first |
| **Ranch house lots**: about 18 × 33 m, one storey, a 6 m setback, a carport, a backyard behind a 1.8 m block wall, an alley behind | rows of near-identical roofs, each in a walled yard | ring houses are already this size (9–12.5 × 8–10.5 m); next: backyard block walls (the strongest read of Phoenix from above), carports, alleys |
| **Garden apartments**: two storeys round a courtyard pool | U-shaped roofs round a blue rectangle | a ring kind `apartments`, using storeys |
| **Downtown**: a few towers in a sea of surface parking | towers and lots | the island's tower stumps; parking lots not built yet |
| **Canals** on the diagonal with dirt roads on both banks | straight water at an angle to the grid | a canal row: a landmark and a choke point |
| **Rail and industry** along the rail and the dry river | sheds and sidings | the Yards zone already follows the Iron Line and the wash |

**Burnt out but rebuilt.** The occupied places make their open ground useful, patch their roofs with what they found,
paint their walls, and keep the old streets and lots, because rebuilding happens on the old foundations. The ruins stay
bleached and empty.

**Sizes.** People, cars, doors and rooms are life-size (1:1). Only the distances between cities compress. A miniature
city keeps its parts full size and has fewer of them: fewer blocks, never smaller houses.

**Robert's own generator** (`D:/lsw`, Living Superweapon) was studied for this:
- `floorplan()`: BSP splits with one doorway per cut, so every room is reachable by construction. This is the
  reachability guarantee in the floor-plan work.
- The city planner: zoned cells, edge sockets (a corner shop knows which sides face a street), size tiers by population,
  and a road survey relaxed to a maximum grade.

## 4. Formulas

**Light.**
- `day = smoothstep(-0.12, 0.22, sin((hour - 6) / 12 · π))`
- `sun = lerp(SUN_I[0], SUN_I[1], day) · cloud and dust terms` (unchanged)
- `hemi = lerp(HEMI_I[0], HEMI_I[1], day) · (1 + GOLDEN_FILL · golden) · (1 − 0.25 · clouds)`

Example, noon and clear: day = 1, so the sun is 4.6 and the sky fill is 2.0. Before, they were 2.7 and 1.05.

**Roof pick.** `seed = hash(floor(centre.xz / 2))` in [0, 1).
- If `w · d > BIG_ROOF`: kind = 1 when seed < 0.55, else 4.
- Otherwise: kind = floor(seed · 5).

Example: a 20 × 18 m Rust Haven roof is 360 m², so any of the five. A 40 × 40 m tower stump is 1,600 m², so membrane or
tar.

**Roof colour.** `c_lin = c_display^2.2`, then `out = c_lin · mix(1, tint / mean(tint), ROOF_MIX)`. This shifts hue, not
brightness.

**Yard pick.** A side gets an item when its margin is at least `yard.margin` and a roll passes 0.85. The kind is
weighted by `yard.kinds`: garden 5, washing 3, tank 2, shade 2 (out of 12).

## 5. Edge cases

- **A roof instance smaller than `SMALL` (3.2 m) on its short side** gets the grille, never a roof pattern. A 3 × 6 m
  shed roof reads as a vent. That is accepted until sheds have their own kind.
- **Roofs hidden while you are inside** are zero-scaled instances: no pixels, so nothing is shaded.
- **A stall or yard item that would overlap a solid** (`statics.pointBlocked`), a lamp (within 2.2 m), the plaza
  parking spot (within `keepParking`) or a door (within `doorClear`) is skipped, not moved. A block can end up with
  fewer stalls.
- **The render origin.** The roof hash uses the instance's world centre. If P2's moving render origin lands, roofs would
  change kind as the origin moves. The hash must then use the world position (origin + render position). Recorded for
  WEB_STREAMING P2.
- **Weather**: rain still darkens ground and roads through `sky.js`. Roofs are not wetted.

## 6. Dependencies

| depends on / is used by | how |
|---|---|
| `systems/sky.js` | owns light levels (§7) |
| `world/city.js` | island palettes, sidewalks, the holdout fill, the roofs batch material |
| `world/streamer.js` | the roofs pool material (the ring and streamed towns) |
| `data/ring.js` | zone palettes |
| WEB_STREAMING | the island golden hash re-pin (§3.4); the render-origin note (§5) |
| WEB_STOREYS | storeyed buildings' roofs go through the same material |
| floor plans (in progress) | rooms inside ring houses; next, Rust Haven's buildings |

## 7. Tuning knobs

| knob | where | value | safe range | what it changes |
|---|---|---|---|---|
| `SUN_I` | sky.js | [1.5, 4.6] | night 1.0–2.0, day 3.5–5.5 | contrast and shadow strength; past 5.5 roofs clip white |
| `HEMI_I` | sky.js | [1.55, 2.0] | 1.2–2.4 | how dark shadows and night are |
| `toneMappingExposure` | main.js | 1.2 | 1.0–1.4 | everything at once; prefer the two above |
| `GOLDEN_FILL` | sky.js | 0.75 | 0.4–1.0 | how bright the hour round sunset is |
| `ROOF_MIX` | surfaces.js | 0.3 | 0–0.6 | how much a district's palette tints its roofs |
| `BIG_ROOF` | surfaces.js | 520 m² | 300–1,000 | which roofs are only membrane or tar |
| `SMALL` | surfaces.js | 3.2 m | 2.5–4 | below this a box is a vent, not a roof |
| `YARD.alley` | data/ring.js | 1.8 m | 0 (back walls on the line) to 3 | the alley between back-to-back yards; 0 gives one shared wall |
| `YARD.pool.chance` | data/ring.js | 0.33 | 0–0.6 | pools per back yard with room |
| `SIDEWALK` | city.js | 3.5 m | 2.5–5 | sidewalk width round a block |
| `market.aisle`, `slots`, `fill` | holdout.js | 6.5 m, 6 slots, 0.85 | aisle 5–8 | market density |
| `yard.margin`, `doorClear` | holdout.js | 3.0, 4.5 m | 2.5–4, 3.5–6 | how full the yards are; keep doors clear for walkers |

## 8. Acceptance criteria

- At the game camera, zoom 33, clear weather, Rust Haven at (−40, −40), mean screen luminance is **≥ 130 / 255 at
  12:00** and **≥ 30 / 255 at 19:00 and 23:00**. Measured: 160, 36 and 51.
- Every roof-sized instance shows one of the five kinds, and a roof over `BIG_ROOF` is only kind 1 or 4. Checked by
  screenshot: the 40 m tower stumps in the ruins.
- Draw calls stay at or under 150 (measured: 74 at noon in Rust Haven).
- `selftest` is green twice on fresh pages, including the island golden-hash check (now `eb103eab`).
- `scenario name=stress` does not regress by more than 0.2 ms (A/B against the commit before 97995d9b).
- Proof screenshots are in `docs/renders/web/light-pass/`.
