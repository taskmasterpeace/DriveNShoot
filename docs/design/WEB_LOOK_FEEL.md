# WEB_LOOK_FEEL: region grades, wind, history on the ground, impact feel, cars that carry the trip (2026-10-29)

Lane: LOOK-FEEL (`feat/web-look-feel`). Rows: `web/src/data/looks.js` (+ `validateLooks`). System: `web/src/systems/lookfeel.js`.
Commands and checks: `web/src/agent/lookfeel-api.js`. Renders: `docs/renders/web/look-feel/`.

Robert's list (2026-10-29), the parts this lane owns: a colour grade per region and time of day in one full-screen pass with a
lookup table, blended across region lines; horizon bands per region (only where the camera can see a horizon); three layers of
identity per region as data rows; wind on what is already there; ground decals that hold history; impact feel; vehicle wear you
can see, which must make the cars look better-travelled, never cheaper.

## 1. Overview

| Piece | What it is | Cost |
|---|---|---|
| **Grade** | The scene renders to the canvas exactly as before. The frame is copied to a texture (`copyFramebufferToTexture`), and one triangle draws it back through a 16³ LUT. The LUT is baked on the CPU from the region rows × the time-of-day rows, blended across state lines and through dawn and dusk. It is rebuilt only when the blend moves. | +1 draw call. Render-only A/B at 1280×720: median +0.01 ms (noise ±0.7 ms). LUT rebuild 0.5 ms CPU, at most every 0.25 s |
| **Horizon** | Each region resolves to a band row (`HORIZONS`). The camera law keeps the horizon off every view, so **no band is drawn and no image was generated** (§3.2). | 0 |
| **Wind** | One uniform set (direction from the sky, strength = base × region × weather, plus a gust wave). It drives the flora shader (per-species stiffness, bend ∝ height², feet planted, shadows sway with it), the streamed bushes, and hanging cloth in the shared box batches. | 0 draw calls; the flora now uses one material per species (same program) |
| **History decals** | One pooled InstancedMesh (an atlas: skid, scorch, oil, bonfire ring, blood trail) on the depth law (`groundDecal`, lifted over the ground, never y = 0). Laid by events and seeded per 160 m cell. | +1 draw call (1024 → 640 instances) |
| **Impact feel** | Hit-stop (the sim runs at 3% for 40–80 ms), a camera kick by calibre, and screen-edge dirt on a crash (inside the grade pass). | 0 |
| **Vehicle wear** | `v.grime` {dust, mud, scrape[4]} by what is under the wheels and the weather. Written to uniforms of a shader layer over each car's paint, with dents tinting their zone. Crashes crack the glass; scrapes throw sparks. A garage repair washes it all. | 0 draw calls; one program for every car |

Settings (pause menu → SETTINGS): **Colour grade** (Off, Soft, Full), **Hit-stop**, **Camera kick**, **Crash dirt** (Off, Half, Full).

## 2. Player Fantasy

You cross out of California, and the light goes amber and hard. Florida's noon is bleached and humid-hot, Texas is dusty orange, and the ridges are cool green haze. At night the whole country goes cold blue, while your lamp's pool stays warm. A tree line moves; laundry in a back yard swings; a storm bends the palms. Beside the interstate, two black tracks leave the lane, cross the shoulder into the grass and stop at an oil stain. You stand on the brakes and lay your own. A shotgun shove kicks the camera; a car into a wall freezes the world for a heartbeat, and mud flicks at the edge of the screen. After a week off-road the car wears a dust coat on its hood and mud round its arches, with bright scored metal where it kissed a wall. It looks like it has been somewhere. The garage washes it.

## 3. Detailed Rules

### 3.1 The grade
- **Regions** (`LOOK_REGIONS`, 12 rows covering all 48 states of the usmap legend): florida, texas (+OK), desert (AZ NM NV UT), california, gulf, plains (KS NE ND SD IA), appalachia, metro_ne, midwest (rust belt), mountain, northwest, default (New England). Every row has `states`, `grade`, `horizon`, `wind`, `decals`.
- **A grade** works in display space: `temp` (a white-balance multiplier), `tint` (green only), `sat`, `con` (pivot 0.32, so the darks stay the Night setting's), `lift` (shadows), `gain` (highlights), `gamma` and `bleach` (hot highlights).
- **Time of day** (`TIME_GRADES`): dawn, day (identity), dusk and night are smooth bumps round their centres, normalised. The night composes over a region by taking most of the region's lift, contrast and gamma away (`keep = 1 − 0.85 w`) and adding cold blue (hue about 210).
- **Border blend**: the state map is sampled at the view centre and on two rings (1200 m and 600 m, 12 points each). A crossing is about 2.4 km in 25 steps of 0.04.
- **No purple, ever**: `applyGrade` ends in **the purple guard**. A colour the grade pushed into hue 262–328 (that was not already there) is greyed to ≤ 3% saturation. The LUT is baked from this function. `validateLooks` refuses a magenta tint and runs a colour probe through every region × time. The check walks all 4096 lattice colours × 48 region-times.
- **Byte-identical when off**: with the strength at 0 (and no dirt), `render()` is the plain `renderer.render`. An identity pass measured the same luma as the plain render (11.4 = 11.4). The first design (a linear HalfFloat target) changed how the additive glows blend, which made lamp pools and the flashlight bigger and brighter. It was replaced.
- **Below the street** the grade fades to 40%.

### 3.2 The horizon (the honest answer)
`data/camera.js` binds every view by `thetaSum: 80`, which means the frame's top edge stays on the ground. The steepest views (ANGLED close at 50°, CHASE at 52°) plus half the 42° field still look at most 80° off vertical, which is 10° *below* the horizontal. **No view of the game can show a horizon**, so a band would never be on screen. `look action=horizon` reports the law. The check `look-feel: the horizon is never on screen…` proves it on the live camera: at the most tilted view, both top frame corners hit the ground.

What stands: the `HORIZONS` rows (mesas, swamp_treeline, ridges, flat_plains, dead_skyline), every region resolving to one, and `web/public/horizon/README.md`. **Directors Palette: 0 generations, 0 points.** If a view ever lifts the law (a photo mode, a cinematic), the band is one draw call: a cylinder strip at the far plane, tinted by `sky.fog.color`.

### 3.3 Wind
- `uWind = (dirX, dirZ, strength, time)`. Strength = `WIND.base` (0.55 m at 10 m) × the blended region `wind` × the eased weather factor (CLEAR 1, OVERCAST 1.3, RAIN 1.7, STORM 3.2, DUST 2.6, FOG 0.35, ASHFALL 0.6). It is 0 underground.
- **Flora**: per species `STIFF` (saguaro 9, prickly pear 8, joshua 5, dead tree 2.6; palms 0.7–0.8 whip). Offset = `wl × (s·gust·h²/100·(0.75 + 0.25 sin(t·swayHz + ph)) + 0.12 sin(3.1t + ph + 1.7h)·s·h/10) / stiff`, where `wl` is the world wind direction carried into the instance's local frame. The depth material gets the same patch, so shadows sway too.
- **Bushes** (the streamed `shrubs` pool): the same, at stiffness 3.5.
- **Cloth** (the streamed `props` pool and citygen's batch): a unit-cube instance that is a thin hanging panel (thin < 0.09 m, 0.25 < height < 1.45 m, area < 2.2 m², wider than 0.2 m) swings its lower edge downwind and flutters. That covers laundry on the back-lots clotheslines, hung sheets and banners.

### 3.4 History decals
Rows in `DECALS`: skid 0.34×1.1, scorch 5, oil 1.6 (life 72 game hours), bonfire 2.6, blood 0.5×0.8 (life 48 h). Each kind lies at ground + DECAL_Y + 4 mm + 3 mm per kind (over every floor and rug: the zfight check found two seeded marks under a Phoenix floor at TRACK_Y), with the `groundDecal` polygonOffset. Slots 0–383 are seeded history; slots 384–1023 are a ring for events.
- **Events**:
  - a hard stop (from over 9 m/s, decelerating more than 7 m/s²) lays a pair every 0.9 m behind the rear wheels;
  - a crash (over 8.4 m/s) lays a pair;
  - a blast lays a scorch (`fx.explosion` → `onBlast`);
  - a car whose tank is under 0.6 or whose radiator is under 0.5 drips oil (every 1.6 s parked, more often moving);
  - anyone bleeding over 0.25 leaves a blood smear every 1.4 m.
- **Seeded** (a pure hash of the 160 m cell; no RNG stream is touched, so nothing else moves). A cell gets one story, scaled by the region's `decals` mix:
  - **a crash story** beside a road (16%): two wheel tracks run straight in the lane, then bend out over the shoulder 16–26 m off the centreline, ending in an oil stain, sometimes a scorch where it burned, sometimes a blood trail from the wreck;
  - **a camp** (12%, 120–900 m from a town, off the road): a bonfire ring, a soot patch and tyre scuffs.

  Stories are laid inside 420 m of the view, given back past 630 m, and come back the same.
- **From SITE STORIES' history** (`g.stories`, landed 2026-10-29). A place raided within `DECALS.raidHours` (72 game hours) or fallen gets 3 scorches (5 if it fell), 3 blood trails and 4 raiders' wheel tracks, spread across its middle. A refugee camp (`kind: 'refuge'`, made by `makeCamp`) or a raider camp gets its bonfire ring. The marks are keyed by the place's state, so a new raid lays them again and a place that is gone takes its marks with it. They sit with site stories' own soot boxes and burned barricade. Render: `raided-site-history.jpg` (Rust Haven).
- **A hook for SITE-STORIES**: `g.look.history(kind, x, z, {rot, size, alpha, len})` lays a story's mark. `look action=decals kind=… x= z=` does the same from the agent API.

### 3.5 Impact feel
- `IMPACT.calibre` by ammo key: pistol (kick 0.22, stop 40), smg 0.1, rifle 0.2, shells (0.55, 60), rifle_heavy (0.6, 70), bolts, harpoon.
- **A big hit** (≥ 30 damage) by or on the player stops the sim for the calibre's stop (at least 40 ms, at most 80). Melee and bash use 50 ms.
- **A crash** at ≥ 14 m/s with the player aboard stops it for 70 ms. At ≥ 9 m/s it throws screen-edge dirt (it fades over 1.4 s) and cracks the struck side's pane by up to 60% of its strength.
- **A blast within 30 m** stops it up to 80 ms and kicks the camera away from the blast.
- **Hit-stop** is `main.js frame`'s `dt = look.warp(dt)`. The sim runs at 3% of the real frame time until the stop's real milliseconds are spent. It never passes dt = 0 anywhere.
- **The kick** is added to the camera rig's shake offset (`camrig.js`). It is shoved back along the shot and recovers at 14/s.

### 3.6 Vehicle wear
- **Surface under the wheels** (4 Hz, cars within 220 m of the view):
  - the island's streets are paved and the rest of the island is sand;
  - streamed ground within 13 m of a corridor is road;
  - elsewhere the biome decides (swamp is mud; forest, flatwoods, prairie and mountain are grass; desert is sand; the rest is dirt);
  - in rain, unpaved ground is mud;
  - water deeper than 5 cm is mud.
- **Per second** at speed (× speed/20, up to ×2): `dustBy` (road 0.0015 … sand 0.016), `mudBy` (mud 0.03, wet 0.012). Rain washes 0.1%/s of dust and 0.02%/s of mud. The caps are dust 0.85, mud 0.8 and scrape 0.9.
- **Scrapes**: `vehicles.js collide` reports each wall contact. Speed along the wall over 4 m/s scores the zone it ran along (0.08/s × speed/10) and throws sparks every 0.05 s.
- **The shader layer** (`dsoa-wear`, one program for every car):
  - dust is a patchy film, 38% on the tops and heavier low on the sides;
  - mud is caked on the lower sides and flung as specks round the wheel arches and over both ends (what the top-down camera sees);
  - a scrape is bright scored metal, only on the side or end faces of its zone;
  - a dent dulls its zone (−16%, rougher);
  - glass and lamps stay clear; mud and dust kill the metalness and raise the roughness, while the paint's own colour always shows.
- **`vehDamage.repair`** (the garage, a mechanic's "Repair my last ride") calls `look.clean`.

## 4. Formulas (with examples)
- **Time weight**: `x = max(0, 1 − d / (2·half))`, `w = x²(3 − 2x)`, normalised (d is the hour distance, wrapping the clock). At 18:36: dusk 0.58, day 0.24, night 0.17.
- **Region weight** at (x, z) = share of 25 samples (centre + 2 rings × 12) whose state maps to the region. Example: I-10 at the California/Arizona line (s = 9600 m) gives desert 0.7, california 0.3. Six kilometres either side, it is 1.0.
- **Grade** (per channel, display space):

  ```
  r *= 1 + 0.12 temp;  b *= 1 − 0.12 temp;  g += 0.06 tint
  saturation round the luma
  contrast round 0.32
  + lift·(1 − l)²
  × (1 + (gain − 1)·l)
  bleach above l = 0.55
  ^gamma
  then the purple guard
  ```

  Example: Florida noon on Meridian's street: mean luma 118.8 → 132.9, R−B 33 → 49 (bleached, warm). Florida 23:30: 11.4 → 14.0, rgb (11, 12, 11) → (12, 14, 16) (cold, still dark). Arizona 17:30: 81.2 → 86.9, (111, 74, 42) → (128, 76, 37).
- **Hit-stop**: frames frozen = ⌈stop / frame⌉. A 70 ms crash at 60 fps measured 3 frames after the frame it landed in; the sim advanced 0.002 s.
- **Wind**: a 10 m palm (stiffness 0.75) in CLEAR in the desert: s = 0.55 × 1.2 × 1 = 0.66; sway ≈ 0.66·h²/100/0.75 ≈ 0.88 m at the crown. The same palm in a STORM: ×3.2. The check measures storm max > 2× clear max.

## 5. Edge Cases
- **A state the map leaves unnamed** (sea, outside the grid) falls back to `default`. All 48 legend states are listed (checked).
- **The Phoenix island** is ARIZONA (desert).
- **Two lights of grade** never stack. The pass is the last thing drawn; the screenshot command goes through it too, so shots match the game.
- **The `screenshot` command with x/z/zoom** keeps the cutaway circle where the player is on the game camera. A close-up of something else gets dithered there. This is an existing quirk; the wear renders were shot with `cutaway.on = false`.
- **Pause**: the hit-stop timer only runs in live frames. The pause menu freezes it with everything else.
- **A dead car** swaps to the wreck material: its grime is kept but not drawn. `wear` refuses dead cars.
- **`v.wear`** belongs to `systems/upkeep.js` (tyres, brakes, engine), so the paint layer uses `v.grime`.
- **Decal fade** uses a game-hour clock of its own. T (time ×40) ages oil and blood 40× faster.
- **Hit-stop and the network**: it is local feel only. The shard never sees it.

## 6. Dependencies
- **In (reads)**: `systems/sitestories.js` (places, raidedAt, fallen, kind, camp, hours), `sky.js` (time, weather, windX/Z, below), `world/worldindex.js` (stateAt, project, projectAny, biomeAt, towns), `world/city.js` (roadLines, HALF), `world/flora.js` (pools, variantPatch), `streamer.pools` (shrubs, props), `systems/citygen.js` (its batch), `combat.js` WEAPONS (ammo → calibre), `vehiclebodies.js` PART, `vehicledamage.js` (zones, toLocal), `carcombat.js` (windows), `engine/depthlayers.js` (groundDecal, TRACK_Y).
- **Out (shared-file hooks, one line each)**:
  - `main.js`: import; `this.look = new LookFeel(this)` after FX; `dt = this.look.warp(dt)` before `this.time += dt`; `this.look.update(dt)` after `fx.update`; `render()` calls `this.look.render(this.camera)`; `this.look.onShot(p, k, ang)` after the fire shake.
  - `systems/camrig.js`: the kick is added to the shake offset.
  - `systems/combat.js` `damage()`: `g.look?.onHit(...)` after `c.hp -= dmg`.
  - `systems/fx.js` `explosion()`: `this.onBlast?.(x, z)`.
  - `systems/vehicles.js` `collide()`: `g.look?.scrape(...)` on each wall contact; `g.look?.onCrash(v, hitN)` (walls) and `(v, −rv, o)` (car on car).
  - `systems/vehicledamage.js` `repair()`: `this.g.look?.clean(v)`.
  - `world/flora.js`: `variantPatch` exported.
  - `ui/qol.js`: 4 settings (DEFAULTS, menu, apply).
  - `agent/api.js`: import, commands spread, checks call, and the `screenshot` render through the pass.
  - `agent/zfight.js`: `twinSafe` strips the wind's `|wind-*` program keys like the cutaway's `|cut1` (a vertex-only patch: same-colour twins in the prop batch are still twins, not fights).
  - `systems/semis.js` (WEB_SEMIS.md): tractors and trailers wear like any vehicle; `updateWear` skips a `sheltered` vehicle (a car riding in a box trailer's hold).
  - `look` is the observer's command (`agent/devtools.js`): look-feel extends it. Without `action=` it is the observer's screenshot-and-who's-in-it, unchanged; with `action=` it is look-feel.
  - `docs/COMMANDS.md`: regenerated.
- **For other lanes**:
  - SITE-STORIES lays history with `g.look.history(kind, x, z, opts)`;
  - ROADSIDE's kit is the third identity layer (its rows are its own);
  - anything that adds a fullscreen effect composes into this pass rather than adding a second.

## 7. Tuning Knobs (safe ranges)
| Knob | Value | Safe range | Effect |
|---|---|---|---|
| `GRADE.lut` | 16 | 16–32 | LUT resolution (32: 8× rebuild cost) |
| `GRADE.ring`, `ringN` | 1200 m, 12 | 600–3000, 8–16 | width and smoothness of a border crossing |
| `GRADE.strength` | 1 | 0–1 | the whole grade (× the setting) |
| region `grade.*` | rows | sat 0.3–1.6, con 0.7–1.4, gamma 0.7–1.3, tint ≥ 0 | validated |
| `WIND.base` | 0.55 m | 0.2–1.2 | sway at 10 m |
| `WIND.weather.STORM` | 3.2 | 2–5 | storm bend |
| `STIFF.<species>` | 0.6–9 | 0.5–12 | per-species stiffness |
| `DECALS.roadStory`, `campStory` | 0.16, 0.12 | 0–0.4 | how often a cell tells a story |
| `DECALS.brakeDecel` | 7 m/s² | 5–10 | what counts as a hard stop |
| `IMPACT.minStop` / `maxStop` | 40 / 80 ms | 30–120 | hit-stop band |
| `IMPACT.calibre.*.kick` | 0.1–0.6 m | 0–1.2 | camera kick |
| `WEAR.dustBy.*`, `mudBy.*` | rows | ×0.25–×4 | how fast a car gets dirty |
| `WEAR.max.*` | 0.8–0.9 | 0.5–1 | the cap (keeps the paint showing) |

## 8. Acceptance Criteria
Selftest checks (`only=look-feel`, all green):
1. **`look-feel: every look row validates, every state resolves …, no grade turns anything purple`**: `validateLooks` passes; all 48 legend states are in a row; every row has a grade and a resolvable horizon. Every lattice colour × every region × time is probed through the grade (≈ 196k), and none lands in hue 270–320.
2. **`look-feel: the horizon is never on screen in any view …`**: the camera law is checked, plus the live ANGLED view's top corners hitting the ground.
3. **`look-feel: the grade blends across a state line and through dusk …`**: walking I-10, the California→desert line is found. Six kilometres either side it is pure; at the line it is mixed. No 300 m step moves the temperature more than a quarter of the whole change; dusk steps are under 0.1 per 6 game-minutes. On screen in Florida at noon, R−B rises with the pass, and the pass is exactly +1 draw call.
4. **`look-feel: wind moves a tree vertex over time, a storm bends it harder …`**: the offset changes over 0.75 s; STORM strength is more than 2× CLEAR and so is the max sway. A foot never moves. Every flora pool wears the wind material, and its program compiled (runnable).
5. **`look-feel: a hard stop lays skid decals … a crash … freezes 40–80 ms, throws dirt … cracks the glass`**: a real drive and brake on the island flats lays at least 6 skids on the braking path (within 3 m). A full-throttle run into a wall stops 70 ms (frozen 30–100 ms, the sim advancing under 10% of it), dirt goes over 0.2, and the front pane's strength drops.
6. **`look-feel: a big hit freezes 40–80 ms and a small one does not …`**: a 12-damage hit gives no stop; a 48-damage shotgun hit gives 60 ms. The shotgun's kick is more than 2× the SMG's.
7. **`look-feel: a site the site-story system marks as raided shows it on the ground …`**: a real place with `raidedAt` set to now (the state `battle()` leaves) gets scorch, blood and skids within 90 m. Clearing the raid takes them away. A camp made through `addPlace` (kind refuge) gets a bonfire ring.
8. **`look-feel: a car gets dustier off-road than on the road, rain washes some off, and a garage repair cleans it`**: sand gives more than 3× the dust of a paved street. The uniform carries the value, and the wear program compiled. Rain lowers it; `vehDamage.repair` zeroes it.

Measured (port 3484, a PC loaded by other lanes):
- **Batteries** (full selftest, budget 2900, fresh pages):

  | Run | Commit | Result | What failed |
  |---|---|---|---|
  | B1 | 5a869e29 | 568/571 | the observer's `look` and `zfight` (both **mine**, fixed in 8557e08f), and the tactics band |
  | B2 | 1fc28fce | 567/571 | walk-vehicles pickup shot, ring residents, journeys cord, clone husk. Alone: the first three pass; clone husk fails with the error recorded on main |
  | B3 | 1fc28fce | **571/571** | |
  | B4 | 8c0e7ec2 (main 13682073 merged) | 592/593 | underground: Outpost Nine's drone check (passes alone, twice) |
  | B5 | 8c0e7ec2 | 590/593 | materials steel glance and zfight phoenix street (both pass alone, twice), clone husk (the error on main) |

- **Draw calls**: stress 93–95 (base 91–92). The pass is +1 and the history decals are +1. The counter keeps its old meaning (three counts from after the shadow pass): the scene's calls plus the pass's one.
- **Stress ms/frame** (same port): base 7.9 / 9.56 / 8.8. At 1fc28fce: 7.21 / 7.6 / 8.84. At 8c0e7ec2: 8.29 / 9.7 / 11.05 (93–95 draws; the PC was loaded by other lanes' batteries). No regression in the same-page on/off pairs.
- **The pass's own cost**: render-only A/B at 1280×720 gives a median +0.01 ms (6 interleaved pairs × 40 frames, GPU-synced), inside a ±0.7 ms noise band. A LUT rebuild costs 0.5 ms of CPU, at most every 0.25 s and only when the blend moved.
- `ip-lint`: 0 deny.

Renders, game camera, before (grade off) and after: `florida-day`, `arizona-dusk`, `cold-night`, `muddy-car` (+ `-side` at tilt 0.9), `skid-into-ditch` (+ `-close`).

## Not done (listed)
- **Horizon bands**: never visible (§3.2), so none were generated.
- **Tarps and awnings** don't sway. In the shared prop pools they share their shape with rugs and floor finishes, and the shader can't tell a tarp from a rug without a per-instance flag.
- **Outpost Nine's flag** doesn't sway (it is merged static geometry in the base mesh). Flags in the props and citygen batches do, if they are thin hanging panels.
- **Not saved**: grime is not in the save or the shard record; event decals are local and not shard-synced (seeded history is deterministic, so every player sees the same stories).
- No dust on the glass; no per-wheel mud spray particles.
- Ground grass has no blades to sway; the bushes stand in for it.
