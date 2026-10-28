# WEB_ROADSCAPE: what stands beside the open road (2026-10-28)

Lane: ROADSIDE (`feat/web-roadside2`), spec `WEB_DEPTH_PLAN.md` §7. The procedural layer of the roadside. Its sibling, `WEB_ROADSIDE.md` (the authored, interactive SITES: the downed tower, the exit billboards, stations you siphon, junkyards, farm belts, the dam), stands on the same roads; this layer keeps off its sites through the chunk's keep-out (`W.roadside.solid`).
Rows: `web/src/data/roadscape.js`. Placer: `web/src/world/roadscape.js`. Agent surface: `web/src/agent/roadscape-api.js` (`roadscape` command and the selftest checks).
Source research: Robert's road research in `docs/reference/lsw/`: `ROAD-BIOMES-2026-09-21.md`, `between-cities.js`, `road-kit.js`, `road-kit-roadside.js` and `relief.js`. LSW counts in units of 0.19 m; every row in DSOA is in metres, converted once in `data/roadscape.js`.

## 1. Overview

Before this lane, every road in the streamed world ran through the same thing: the chunk's biome scatter, held 22 m off the interstate's centreline and 4 m off a county road. Now each road class has its own clear zone, and beyond it stand **scenes** chosen by the research's slot cadence, by road class and by **road biome**:

- tree walls
- houses off the road, with drives and mailboxes
- farmhouses back from the interstate
- sound walls with houses behind them
- billboards
- field fences with crop rows
- windmills and stock tanks
- power lines
- scrub and rocks
- talus
- snow fences and marker poles
- cattails, sawgrass and stilt shacks
- dead gas stops

On real terrain, the interstate's graded bed gets a ditch just past its edge and is raised on an embankment where the road biome calls for one.

Robert's ask: "make sure that the roads, like the open roads... sometimes there's trees close to the road, sometimes there's... depending on where you are in the country."
The research's law: the main road is not wild. The clear zone stays empty, and the ambush ground (woods, sound walls, farm buildings) stands behind it.

## 2. Player Fantasy

You drive out of Phoenix and the dead suburbs follow you for a kilometre behind a broken sound wall, house roofs showing over it. Then billboards for towns that are gone. Then nothing at all for two kilometres of desert, a windmill, nothing again.

In Florida the two-lane runs between walls of cypress and slash pine, close enough that the trees' shadows lie across the road. A mailbox at the end of a dirt drive leads to a house with no roof. A raider could be standing ten metres into those trees and you would never see him. On the interstate you would see him coming across 18 m of mown verge and a ditch.

## 3. Detailed Rules

**Road classes.** `ROAD_CLASSES` lists interstate, divided, two-lane, rural and dirt, each with:

- `clearZone`: metres past the paved edge with nothing in it
- `ditch`: past the graded bed (interstate and divided)
- `nothing`: the factor on a road biome's nothing chance
- `service`: the chance a super-block holds a service stop
- `lsw`: the research's own numbers, in metres

DSOA maps its roads with `CLASS_OF`:

| DSOA road | Class |
|---|---|
| Corridors (I-10, I-95, I-75) | interstate |
| County ribbons (exit cross roads, community access roads) | two-lane |
| Streets, ramps | none (a town's frontage and an interchange's furniture are their own systems) |

**Road biomes.** `ROAD_BIOMES` has ten rows, each tagged with one of the research's six families:

| Road biome | Research family |
|---|---|
| pine-flat | forest |
| swamp | wetland |
| forest-hills | forest |
| farmland | farmland |
| grassland | grassland |
| scrub | grassland |
| desert | desert |
| mountain | forest |
| snow | tundra |
| sprawl | farmland |

Each row carries a nothing chance, a tree mix (`[species, weight, hMin, hMax]`), a raised-bed height, a scrub colour and a ground colour.

`BIOME_MAP` turns a place into a road biome:

1. The DSOA biome letter, from the real landcover (`W.biomeAt`).
2. The region's own table, if any: Florida's `F` is pine-flat; its `s`, `w` and `p` are swamp.
3. The state lists, which override the letter: the snowy north (Alaska, Montana, the Dakotas, the upper Midwest, northern New England) reads its forests and farms as snow country. Appalachia (Virginia, West Virginia, Kentucky, Tennessee, North Carolina, Pennsylvania) reads its farms and scrub as wooded hills.

**Cadence.** Every roll is a hash of (seed, road, side, slot, what), never a stream.

- **Slot:** 64 m of road on one side (336 u).
- **Block:** 8 slots. Scenes are chosen greedily inside a block, so a block never depends on its neighbour.
- **Super-block:** 3 blocks, about 1.5 km. Two rolls belong here:
  - **Nothing:** one roll for both sides. If it hits, no scene stands on either side for 1.5 km.
  - **Service stop:** one roll, for the one stop the super-block may hold. A gas stop in the middle of nowhere is the trope, so "nothing" never suppresses it.

**Slots and scenes.** Each free slot:

1. Takes the road biome and the distance to the nearest town at its centre.
2. Weighs every eligible scene by `weight[biome] × byClass[class] × knobs`, ramped by `nearCity`. A `cityOnly` scene (the sound wall) stands nowhere else.
3. Fills with probability `total / (total + emptyWeight 6)`.

A `one`-sided scene keeps one hashed side.

**Skipped spans.** A slot is skipped (`corridorRun.skip`, `ribbonRun.skip`):

- within 200 m of a corridor's trimmed start
- within 650 m of an exit
- on a bridge and its fills
- inside the Phoenix island and the ring
- within 380 m of a built town
- for a county road: on a fill or a deck, or within 90 m of the interstate it leaves

**Props.** Each scene's props are placed in the road's own frame: arc length `s`, and metres past the clear zone's edge. Then they are turned into the world.

**Keep-out.** The chunk keeps only what stands inside it. It drops anything its `blocked()` refuses:

- a road or its clear zone (any road's, not just the scene's own)
- the ring, a holdout, a settlement pad or a building
- L1 water and its banks

It also drops anything standing in the region's water (`depthNear`).

**Ditch and bed.** These are cut in `realterrain.js` at survey time, for the corridors (the roads with a graded bed):

- **Ditch:** a sine profile `depth × sin(π t)`, from `at` to `at + width` past the bed (24 m), weighted per centreline point.
- **Bed:** the road biome's `bed`, eased along the road twice over the vertical-curve window and added to the road profile.

Both fall to nothing at an interchange (the bed widened past `formation`), within about 400 m of a pinned pad, and in any chunk water reaches. A county road is not surveyed, so it has neither (§5).

## 4. Formulas (with an example)

```
edge(s)       = paved half-width(s) + clearZone[class]                    (metres from the centreline)
P(nothing)    = min(0.95, NOTHING[biome] × NOTHING_CLASS[class] × knob)  (per super-block, both sides)
w(scene)      = weights[biome] × byClass[class] × density × group knob
                × (1 + nearBoost × (1 − d/nearCity))  if d ≤ nearCity
                × 0.35 (or 0 when cityOnly)           if d > nearCity
P(slot fills) = Σw / (Σw + 6)
ditch(dd)     = depth × sin(π (dd − at) / width) × weight(s)              (dd: metres past the bed's edge, 24 m)
```

**Example: I-10 in open desert, 5 km from Phoenix's edge.**

- **Edge:** the interstate's paved half-width is 3 + 0.5 + 7.2 + 1.5 = 12.2 m. Add the clear zone of 18 m, and the edge is 30.2 m from the centreline.
- **Nothing chance:** P(nothing) = 0.50 × 1.15 = 0.575. Over I-10's desert super-blocks the selftest measured 0.55 (11 of 20). The pure 400 km desert run sits inside its 2.6σ band.
- **Billboard weight:** a billboard slot weighs 1.5 × 3 = 4.5. At 5 km it is past `nearCity` (4 km), so it takes × 0.35 = 1.6.
- **Scrub-and-rock weight:** 5 × 1 = 5.
- **Fill chance:** with the other desert scenes, Σw ≈ 9.5, so P(fill) = 9.5 / 15.5 = 0.61 of the slots in a non-empty super-block.
- **Ditch:** at 3.5 m past the bed (27.5 m from the centreline), the ditch is 0.75 × sin(π × 3/7) = 0.73 m deep.
- **Bed:** desert's raised bed is 1.0 m (6 u), eased in over about 400 m.

## 5. Edge Cases

- **Short county roads.** An exit's cross road is 600 m, about 300 m each side of the interstate, and most of it is on fills. It gets almost nothing; its interchange end is skipped. The community access roads (up to 3.8 km) carry the two-lane scenes. DSOA has no long two-lanes yet.
- **Florida's canals.** I-95's canal is 46 m off the road. Tree walls and cattails there are dropped as wet (`depthNear`). The audit check proves none survive in the water.
- **Chunk seams.** A scene whose props span two chunks is computed whole in both chunks; each keeps its own. The check builds a 3 × 3 block of chunks in two orders and gets the same set.
- **Pools.** All props go into existing pools: props, walls, roofs, trunks, shrubs, boulders, barrels and the flora species. A chunk over its per-chunk flora budget drops the rest (`dropped.pool`). Slash pine, cabbage palm and live oak caps were raised for the flatwoods' tree walls.
- **Fences and wires have no collision.** A car goes through a rail fence, as a car would. Poles, billboard posts, windmills, stock tanks, silos, houses, barns, shacks, gas stops, sound walls, trees and big rocks do have collision. Their tags are rows in `data/materials.js`.
- **Burnt houses.** About 30% of houses are a low shell with charred timbers on top. Nobody lives on the roadside.
- **Flat world** (`?terrain=flat`). There is no ditch or bed; the clear zones and scenes are unchanged. The `p1Chunks` golden covers this case.

## 6. Dependencies (both ways)

**Reads:**

- `world/worldindex.js`: corridors (`project`, `at`, `section`, exits, `mainlineFrom`), ribbons (`s`, `wl`, `wr`, `y`), towns, holdouts, `featuresOf`, `biomeAt`, `regionOf`, `stateAt`
- `world/ring.js` (`depth`, `inCity`)
- `systems/citygen.js` (the plan's towns)
- `world/rivers.js` (`onBridge`, `near`)
- `world/flora.js` (species heights, via chunkgen)

**Hooks into** (shared files):

| File | Change |
|---|---|
| `world/chunkgen.js` | The interstate's clear edge (was 22 m) and the county road's (was 4 m) come from `clearEdge()`. The river-bank brush keeps `EDGE_I + 4` (was 26 m). One `roadscapeStage` call before THE BRUSH. One import. |
| `world/realterrain.js` | Survey-time bed and ditch weights; the ditch in `roadClamp`; two imports. |
| `world/flora.js` | Caps: `sabal` 2400 to 4800 (with a chunk budget of 600), `slashpine` 2400 to 6000 (chunk 900), `liveoak` 1200 to 2400. |
| `data/materials.js` | Tags `soundwall`, `billboard`, `windmill`, `homestead`, `barn`. |
| `data/golden.json` | Four P1 chunks re-pinned, flat and real. |
| `agent/api.js` | Imports, `roadscapeCommands`, `roadscapeChecks`. |

**Read by:** chunk layout (its `out.roadscape` stats) and the `roadscape` command.

## 7. Tuning Knobs (safe ranges)

| Knob | Where | Default | Safe |
|---|---|---|---|
| `clearZone` interstate | ROAD_CLASSES | 18 m | 14-24 (under 14, the ditch is in the trees) |
| `clearZone` two-lane | ROAD_CLASSES | 1.7 m | 0.8-4 |
| `ditch` interstate | ROAD_CLASSES | at 0.5, width 7, depth 0.75 | width 6-10 (the ground grid is 8 m), depth 0.3-1.2 |
| `nothing` per biome | ROAD_BIOMES | 0.05-0.5 | 0-0.8 |
| `bed` per biome | ROAD_BIOMES | 0-1.0 m | 0-1.5 (the grade law holds below about 2) |
| `slot` / `blockSlots` / `superBlocks` / `emptyWeight` | CADENCE | 64 / 8 / 3 / 6 | 48-96 / 6-12 / 2-5 / 3-12 |
| scene `weights`, `byClass`, `nearCity`, `nearBoost` | SCENES | research | weights 0-10 |
| `DEFAULT_KNOBS` (`density`, `nothing`, the group knobs) | data | 1 | 0-3 |
| prop `set`, `depth`, `spacing`, `n` | SCENES props | research converted | `validateRoadscape` keeps reach ≤ 140 m |

`validateRoadscape(rows, species)` rejects:

- unknown biomes, classes or prop kinds
- reversed ranges
- a reach past 140 m
- a missing flora species
- purple anywhere in `LOOK` or the biome colours

## 8. Acceptance Criteria (the selftest's named checks)

1. **rows validate:** every DSOA biome letter maps to a road biome. *Proves the data is consistent and no purple is in it.*
2. **forest two-lane tree wall:** Appalachian hills and Florida flatwoods are walled on more than 45% of slot-sides. The front rank's median is under 2.5 m past the clear zone, and nothing stands inside it. *Proves "trees close to the road".*
3. **sound walls by town only:** I-10's sound walls all stand within 1.4 km of a town's edge (at least 20 of them). A pure sprawl interstate at 30 km has none; at 300 m it has more than 100. *Proves the near-city law.*
4. **desert nothing-stretches:** the empty fraction over the desert super-blocks of I-10 plus 400 km of synthetic desert interstate is within 2.6σ of 0.575, and an empty super-block holds no non-service scene. *Proves NOTHING_CHANCE.*
5. **farmland fences:** the farmland two-lane and interstate both have fence posts, rails and crop rows, and the plains have a windmill and a stock tank. *Proves the farm scenes.*
6. **same seed:** two runs over I-10 hash the same, and a synthetic forest road does too. Another seed differs. A 3 × 3 chunk block gives the same props in either order. A roadside chunk built sliced matches its resident hash. *Proves determinism and the seam law.*
7. **keep-out audit:** every prop the chunks placed, checked against the world directly (corridor clear zones, county road clear zones, L1 and region water, citygen pads, the ring, holdouts, buildings). The spots: I-10 by Phoenix, the open desert, I-95 by Meridian and its canal, I-75 and Meridian's wall. It must place more than 800 props with 0 bad. *Proves nothing stands in a road, a clear zone, water or a settlement.*
8. **ditch and bed:** on the I-10 survey, more than 90% of sampled stations away from exits show a ditch over 0.45 m deep. The desert stations carry a raised bed averaging over 0.6 m. No exit carries ditch weight. *Proves the grading is in the land, not floating props.*

The global `perf budget (< 150 draw calls)` check covers the draw-call budget. The roadscape adds no pool, so it adds no draw calls.

**Screenshots** (game camera, zoom 90, 10:30 clear) are in `docs/renders/web/roadscape/`:

- `florida-twolane.jpg`
- `forest-road.jpg`
- `desert-interstate.jpg`
- `farmland-road.jpg`
- `interstate-by-city.jpg`

**Critic pass.** The three ugliest things found on the first shots, all fixed:

1. Crop rows and understory shrubs rendered washed-out white. The rows were written as sRGB, but the pools take linear colour. Fixed by converting in `rgbOf`.
2. Sound walls were missing, and their caps read as dashed road paint. The keep-out test measured a 4 m panel by its length, not its 0.5 m thickness, so every panel was dropped. Fixed, and the panels were thickened and given posts.
3. Burnt houses read as blank pale boxes. Their fallen roof was hidden inside the solid wall box. Fixed: they are now a low shell with charred timbers on top.

## Not done (follow-ups)

- **Median swales.** The research's swale between divided carriageways needs a median of 24 m or more. DSOA's built median is 6 m, so none is cut.
- **Ditches beside county roads.** These roads are draped on the land, not surveyed.
- **Long two-lanes and dirt roads.** DSOA has none between cities yet. The classes and scenes are ready for them.
- **Interaction.**
  - Roadside houses are solid shells: nothing to search.
  - Billboards are blank faces with no ad copy. The copy belongs to the World Forge and its librarian pass.
- **World Forge tab.** The roadscape rows are validator-ready, but no Forge tab edits them yet.
