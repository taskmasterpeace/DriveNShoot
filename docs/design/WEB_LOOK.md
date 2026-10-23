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
| Trees and desert plants | `tools/blenderforge/gen_flora.py` (Blender) → `web/public/models/flora/*.glb` → `world/flora.js` (§3.6) | feat/web-trees |

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

### 3.1b The night (dark and scary, 2026-10-23)

Robert's briefing: nights are **truly dark and scary** (the Godot CarWorld's dark nights were the reference). His earlier
"too dark, bro" was about the day, so §3.1 brightened the day and, with it, the night: the night measured as dusk.
- The night end of the moon and the sky fill is now a range, `NIGHT_I` in `systems/sky.js`, set by the pause menu's
  **Night** setting: Pitch dark (0), **Dark and scary (0.12, the default)**, Readable (0.5), Bright (1, the old night).
  Only the night end moves; the day is untouched.
- The flashlight (an additive cone, no light of its own) carries more the darker the night: opacity 0.55 to 0.9 and
  up to 1.45x its 15 m reach (`dark = sky.night x (1 - nightLight)`).
- Street lamps, fires, headlights and glows are what you see by. The fixed light count is unchanged.

Measured (23:00, clear, mean screen luma of the play area, 0-255): the old night 90 (dusk); Dark and scary 22 in a town
with lamps and 24 with the flashlight; Pitch dark 7. Renders: `docs/renders/web/night/` (town-default-flashlight,
desert-dark, desert-old-night-bright). Check: "night is dark" in the selftest.

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

### 3.4c Windows and the ring's working doors and windows

**What a window looks like** (`data/interiors.js` WINDOW_LOOK, `systems/interiors.js` buildFrames). A window used to be
a slot from the sill to the roof with a thin slab of glass in it; from the game camera it read as a gap in the wall
(Robert, 2026-10-23: "this doesn't have good windows"). Now every window has:
- a **lintel** that closes the wall over it, in the building's own colour;
- a **painted frame**: Rust Haven's in cream or teal, the ruins' bare;
- a **mullion and a transom** across the glass, which go when the glass is shot out;
- a **sill** that sticks out;
- **shutters**: painted ones in Rust Haven (60%); in the ruins (15%), one may hang off a hinge.

This adds two draw calls in all, and costs nothing measurable.

**The Phoenix ring's openings are real near you** (`RING_OPENINGS`). A ring building's doors and windows used to be
gaps. Now, within `near` (110 m) of the player, a building's rows from `world/ring.js` geo become the same leaves and
windows the island has:
- **Leaves** swing for walkers and cars, bash people, and are kicked.
- **Glass** cracks and shatters.
- **Boards** go up and are torn off.
- **Climbing through** windows works.
- **Inside doors** hang between rooms.

How it works:
- Their ops go into the chunk ring's cells (`StaticWorld.addRingOp`). They are removed again on detach, and put back if a chunk's slot changes hands (a slot `gen`).
- Meshes come from fixed pools: 480 windows and 220 doors, after the island's slots. Nothing is allocated at runtime.
- Past `far` (150 m) a building detaches, and what happened to its openings waits in `ringState` under their ids (`<lot>:d|i|w<k>`). The save carries it.
- **Doors:**
  - A lived-in house keeps its doors open and hangs no inner leaves. Its residents come and go all day, and a closed inner leaf wedged one of them on the way to bed.
  - The empty houses are shut or ajar, and a ruin has lost some of its doors.

Measured:
- a scan every 0.5 s costs 0.16 ms;
- attaching 38 buildings at once costs 18 ms (once, when you arrive);
- a selftest check shatters a ring pane, leaves (it detaches, its state kept), comes back (still shattered), and walks through a ring door.

**Not done:**
- Ring doors don't lock yet (no padlock slots, and the foot nav's lock-blocking is island-only).
- A building past `far` is gaps again, by design: a level of detail.

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

### 3.6 Trees and desert plants

Robert, on the trees: "We have some Blender skills maybe. Or whatever scripts. Or trees. You should use [them]." Before
this, a palm was a star of flat boxes, palo verde, mesquite and citrus were clumps of icosahedra, a saguaro was seven
boxes, a Joshua tree a stick under green lumps, and the dead trees were sticks with three box limbs.

**The factory.** `tools/blenderforge/gen_flora.py` builds every plant from raw vertices in headless Blender 5.1. It
uses no primitives and no booleans. Usage is in the script's header:

```
node tools/blenderforge/blender.mjs gen_flora.py -- --previews --sheet [species...]
```

`blender.mjs` finds Blender 5.x. On this machine that is `D:/Program Files/Blender Foundation/Blender 5.1`. `$BLENDER`
points at 4.5 and is used only if nothing else is found.

**Species.** Each species has three seeded variants. Every variant has 150–600 triangles, and the build fails outside
that budget.

| species | what reads from above | triangles (v0/v1/v2) |
|---|---|---|
| `paloverde` | green limbs through an airy, broken yellow-green crown of leaf puffs; yellow blossom flecks | 458 / 466 / 458 |
| `mesquite` | a dark, low umbrella, wider than it is tall | 460 / 460 / 424 |
| `fanpalm` | a full, ragged disc of pleated fans in three tiers, over a shag skirt and a ringed trunk | 292 / 281 / 303 |
| `datepalm` | a feathery starburst of folded, saw-edged fronds; diamond leaf bases on the trunk; dates | 544 / 536 / 518 |
| `citrus` | a round dark dome dotted with fruit (variant 2 has lemons) | 484 / 460 / 460 |
| `saguaro` | a ribbed star with arms that leave level and turn up; a pale crown | 196 / 336 / 266 |
| `joshua` | forked limbs, each ending in a spiky pom-pom over a dead-leaf collar | 256 / 248 / 248 |
| `ocotillo` | a burst of thin canes with red flower tips | 317 / 398 / 317 |
| `deadtree` | a bleached grey skeleton | 415 / 480 / 495 |
| `tumbleweed` | a tan ball of crooked twigs | 416 / 416 / 416 |
| `creosote` | a low mound of dark olive clumps, flecked yellow | 284 / 242 / 284 |
| `pricklypear` | flat pads turned to the sky, red fruit on the rims | 400 / 368 / 384 |

**Colour.** Colour is per-face vertex colour in one shared material, with no textures. Tops are shaded lighter than
undersides so a crown reads under a high sun. At start-up every palette entry is checked against hue 270–320 (no
purple).

**Output.**
- GLBs: `web/public/models/flora/<species>.glb`, with variant nodes `<species>_v0`–`_v2`.
- Manifest: `web/public/models/flora/flora.json`, with height, crown reach and triangles.
- Previews: `docs/renders/web/flora/<species>_{top,game,hero}.png`, plus the contact sheets `sheet_top.png` and
  `sheet_game.png`. Every preview was looked at before wiring.

**The loader.** `world/flora.js` turns each species into one InstancedMesh, held as a streamer `Pool`:
- Each variant's parts are merged into one geometry with vertex colours.
- The three variants are packed into one geometry. A per-vertex `fvar` says which variant a vertex belongs to. A
  per-instance `aVar` picks the variant to show, and the vertex shader collapses the other two to a point. The shadow
  depth material carries the same patch.
- The result is one draw, plus one shadow draw, per species with anything planted, at the cost of running the vertex
  shader on all three variants.
- The API is `flora.add(kind, x, z, scale, rot, { variant, tint, y })`, then `flora.flush()`. `scale` is a multiple of
  the model's height (`SPECIES[kind].h`); `crownScale()` converts the canopy rows' h, r and squash.
- The GLBs load asynchronously. Until a species arrives, its mesh is a degenerate placeholder.

**Wiring.** Positions, turns, collision boxes and every RNG draw are unchanged. Where old code drew from the RNG for box
limbs or arms, those draws are still made and discarded, so nothing laid out after them moves.

| where | before | now |
|---|---|---|
| island living trees (`city.js`) | trunk cylinders, icosahedron canopies, box-frond palm crowns | `plantIsland()`: palms become `fanpalm`, or `datepalm` one time in three; yard trees become their species |
| island cacti and dead trees (`city.js`) | cylinders; trunk + 3 box limbs | `saguaro` at 2.3 m or taller, else `pricklypear` or `ocotillo`; `deadtree` |
| ring yards (`ring.js` `yardOf` → `chunkgen.js`) | trunks pool + shrub-pool crowns | `g.flora` rows → `fl_<species>` pools; a ruin's yard trees are `deadtree` |
| desert scatter (`chunkgen.js`) | saguaro of 1 + 2 boxes per arm; Joshua trunk + lumps; dead trunk + box limbs | `saguaro`, `joshua`; live `paloverde` (Arizona's 60%) or `deadtree` |

Yucca, barrel and cholla cacti, and the creosote scatter are unchanged. `creosote` and `tumbleweed` are built but not
placed: the streamed shrub scatter has hundreds of instances per chunk, which is too many for the packed-variant vertex
cost.

**Proof** (`docs/renders/web/flora/before_*.jpg` and `after_*.jpg`, at 10:30 in clear weather):
- `market` / `market_close`: Rust Haven's market square with its palms.
- `yard` / `yard_close`: a ring yard at (676, −184) with palo verde in front and citrus behind.
- `saguaro_i10` / `saguaro_close`: saguaro desert beside I-10 at mile 15.
- `joshua_i10` / `joshua_close`: Joshua trees off I-10 at mile 5, in California.

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
| `world/flora.js` | the tree and plant pools (§3.6); `city.js`, `chunkgen.js` and `streamer.js` share them |
| `tools/blenderforge/gen_flora.py` | the models; re-run it after any change to a species, then look at the previews |

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
| `SPECIES[kind].cap` | flora.js | 300–3,000 | ≥ island + hot chunks' use | instances a species can hold at once (`world` reports pool fill) |
| `TRI_MIN`, `TRI_MAX` | gen_flora.py | 150, 600 | — | the per-variant triangle budget the factory enforces |
| `PAL` | gen_flora.py | per species | no hue 270–320 | the plants' colours; checked at start-up |

## 8. Acceptance criteria

- At the game camera, zoom 33, clear weather, Rust Haven at (−40, −40), mean screen luminance is **≥ 130 / 255 at
  12:00** and **≥ 30 / 255 at 19:00 and 23:00**. Measured: 160, 36 and 51.
- Every roof-sized instance shows one of the five kinds, and a roof over `BIG_ROOF` is only kind 1 or 4. Checked by
  screenshot: the 40 m tower stumps in the ruins.
- Draw calls stay at or under 150 (measured: 74 at noon in Rust Haven).
- `selftest` is green twice on fresh pages, including the island golden-hash check (now `eb103eab`).
- `scenario name=stress` does not regress by more than 0.2 ms (A/B against the commit before 97995d9b).
- Proof screenshots are in `docs/renders/web/light-pass/`.

**Trees (§3.6).**
- Every species' preview was looked at before wiring. Every variant has 150–600 triangles, and `gen_flora.py` fails
  the build otherwise.
- Draw calls stay at or under 150. Measured before → after at the default zoom (34 m):

  | place | draw calls |
  |---|---|
  | home | 75 → 79 |
  | Rust Haven's market | 76 → 80 |
  | a ring yard | 71 → 76 |
  | saguaro desert at mile 15 | 61 → 70 |
  | Joshua desert at mile 5 | 58 → 68 |

  At the widest zoom, after: home 88, the densest ring chunk 82, the saguaro desert 72.
- The added draws are at most 10. A planted species costs 1 draw plus 1 for its shadow, and the island's five old
  meshes are gone. Flora pools are not frustum-culled (pool law), so in the desert the island's species still draw;
  that is the +9/+10 there.
- Frame time in one page with the flora pools in the scene and taken out (A/B/A/B, 180 frames each, RTX 4090):

  | place | flora on | flora off |
  |---|---|---|
  | home | 7.7–7.8 ms | 7.0–8.1 ms |
  | ring yard | 8.1–8.5 ms | 7.2–7.7 ms |
  | saguaro desert | 7.9–8.0 ms | 7.5–7.7 ms |

  The cost is under 1 ms. Triangles submitted roughly double, because the packed variants count three times. If a
  weaker GPU is vertex-bound, the fix is one pool per variant: three draws per species instead of one.
- `selftest` is 135/135 twice on fresh pages. That includes the island golden hash (unchanged: no collision box moved),
  "a chunk is a pure function of the data", the pool leak lap, and the ring's draw-call checks.
