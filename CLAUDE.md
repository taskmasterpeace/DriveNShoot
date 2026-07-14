# Claude AI Development Guide for CarWorld / DRIVN

**Last Updated:** 2026-07-14
**Project Status:** 🚗 3D mainline (`game/proto3d/`) — deep vertical slice, all systems live
**Master spec:** `docs/ENGINE.md` · **Vision:** Autoduel × GTA2 in the DIVIDED STATES OF AMERICA (`docs/DIVIDED_STATES.md`)

---

## 🎯 What this is

Top-down 3D vehicular combat + survival in a compressed USA (60×: 4 real hours of driving = 4 in-game minutes).
**Godot 4.5+, GDScript 2.0, static typing.** Everything is data rows + one engine — adding content ≠ code.

- **res:// = `game/`** (never `res://game/`). Godot exe:
  `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64.exe` (+ `_console.exe` for headless).
- **Run the game:** double-click **`PLAY.bat`** (repo root) — or `Godot --path game res://proto3d/proto3d.tscn`
- **Run the editors:** double-click **`EDITOR.bat`** — THE FORGE hub (:8900) starts/adopts every forge in one tabbed UI
- **Legacy 2D game is QUARANTINED** in `legacy-2d/` at the repo root (2026-07-06) — OUTSIDE res://, so it can never load, launch, or hijack input again (it once F2-swapped a live playtest into the 2D start screen). Reference only; docs in `docs/legacy-2d/`. res:// now holds ONLY `addons/ assets/ data/ proto3d/`.

## 🕹 Controls (current)

**Front door:** a real launch opens on the DRIVN title (`menu.gd`, ProtoMenu) — NEW GAME / CONTINUE (save-gated) / HOST / JOIN(IP) / QUIT. `main.menu_open` swallows gameplay input while up; sims skip it (they run proto3d under a harness, so it checks `current_scene == self`). NEW GAME arms **THE FIRST RUN** (`objectives.gd`) — a guided drive→pull-over→scavenge→home chain that teaches THE CIRCUIT then retires; a veteran never sees it.

**EVERY BIND IS A ROW + REBINDABLE** (`data/input_bindings.json` → `ProtoInputMap` fold; **F11 = CONTROLS panel**, press-to-capture for key AND pad slots, persists to user://). **FULL PAD SUPPORT** (Xbox + PS-family; PS2-via-adapter same buttons): left stick move/steer · right stick AIM (twin-stick) · RT fire (tap punch/hold shove parity; becomes the GAS at the wheel, LT brake) · A/✕ dive-handbrake · B/◯ crouch · X/▢ reload · Y/△ interact · LB whistle · RB weapon cycle · D-pad radio/pack/views/sheet · START map · L3 sprint/horn · R3 binoculars · RUMBLE on hits/blasts.

Keyboard (stock): WASD move · SHIFT sprint · **CTRL hold = CROUCH (sprint+tap = SLIDE)** · SPACE dive/handbrake · **E interact** (in car: driver taps out; passenger taps out / **holds to take the wheel**; chest/body: tap opens, **hold = GRAB & DRAG**, E drops) · **LMB unarmed: tap PUNCH combo · hold SHOVE · sprint+tap TACKLE** (MARTIAL ARTS skill: lv2 kicks, lv4 throws, lv6 finishers) · **C whistle ×1 heel ×2 guard ×3 seek hold SIC ×4 SHIELD** · **Y radio scan** (music stations on the dial) · TAB pack/trunk · **K character sheet** · **M map/atlas** · T wait · **B drone recall** (2026-07-14: recall took B; binoculars ride R3/hold-B legacy hint only) · V views · G grenade · R reload (death: wake at the safehouse — beside your PARTNER in co-op) · H horn (carries over the net) · P pet · J character creation · F home beacon · N waypoints (partner arrow / 🛸 drone marks live here) · ` weapon cycle · **F5/F9 save · F6 PvP rules · F7 host · F8 join** · **F10 DEV MODE** (FORGE live-reload incl. motions) · **F11 controls**

**Drone flight (2026-07-14, while piloting — body frozen so the keys are free):** move keys steer · **SPACE/CTRL climb/dive** (held target altitude, ground-clamped 2.5–40m) · **SHIFT boost** (≈1.6×, 2× battery drain) · **E land** · **B recall** · signal WEAK past 85% of range, LOST = the bird flies itself home · the split eye follows altitude ("altitude never splits" law kept).

## 🧩 The systems (all live, all sim-proven)

| System | File(s) | The one-liner |
|---|---|---|
| Puppet rig | `puppet.gd`, `quadruped.gd` | ONE sin()-driven box rig, **V2**: segmented limbs (knees/elbows/feet; alias law — old names drive whole limbs), follow-through MOTION rows, two-hand grips via 2-bone IK (`grip_l`/`grip_r` weapon rows), recoil-as-data spring (strength eats the kick, stagger rocks the torso); wound wobble, bent-limb death sprawl |
| Vehicles | `car_3d.gd` + `data/vehicles.json` | VehicleBody3D; 10 rigs as DATA (DrivnData folds JSON→engine); 5-part damage you FEEL (misfire/slop/flicker/leak); **GLB BODY LAW (2026-07-14)**: authored blenderforge bodies (glass cabins, visible interiors) worn when shipped, box builders stay the fallback stock — NAME LAW: never name a Blender part `*col`/`*wheel` (Godot import grows colliders/wheels) |
| Surface handling | `traction.gd` + `data/surfaces.json` | **THE HANDLING CHARACTER (2026-07-14)**: per-surface rows — grip, rear_bias (loose tail), steer_response, brake, roll_drag (sand/mud BOG), roughness (washboard judder+rumble), yaw_loose (dirt handbrake rotates easy); wetness folds (dirt→mud, wet metal slick); consumed per-axle; scenes without road rects read DIRT — a paved test scene sets `surface_override` (track.gd law) |
| Visible driver | `proto3d.gd` `_pose_cab_driver`, `puppet.gd pose_driving` | cabins wear real glass — the puppet is SEEN at the wheel of EVERY rig (left seat, hands on wheel); shotgun passengers sit right; bike saddle law untouched (`driver_visible_sim`) |
| Blenderforge | `tools/blenderforge/gen_vehicles.py` | Blender 5.1 headless vehicle-body factory → `game/assets/models/vehicles/*.glb` + preview PNGs (review-before-wiring law); Blender MCP installed (uvx blender-mcp + addon) |
| The Showroom | `proto3d/tools/showroom.gd` → `docs/renders/showroom/` | render harness: every vehicle row (5 angles + puppet scale + seated bike rider) + every structure row, judged by EYE — a green sim never proves looks |
| Vegetation | `data/vegetation.json` + `world_stream.gd VEG_STOCK/veg()/_trees()` | **DENSITY AS ROWS (2026-07-14)**: per-biome visual counts (forest deep-east 260/chunk, swamp 70 cypress, mountain conifers), tree SHAPE KINDS as MM tiers (3 draw calls/stand), `_scatter` is MultiMesh; SOLID trunks stay code (the frontier LAW); Meridian apron has 180 authored trees (`vegetation_sim`) |
| Town layout v2 | `tools/mapforge/bake_junctions.mjs stampTownStreets` | **CITIES THAT READ (2026-07-14)**: footprint-aware block-edge frontage, buildings FACE their street (rot law), per-building zoning rings (civic core → residential edge + industrial flank), downtown outskirts, cluster stamps, per-town seeds, versioned regen (`town_layout_version`); 2124 slots/58 towns; runtime dressing in `_stamp_town` (`city_layout_sim`, `town_grid_sim`) |
| World photobooth | `proto3d/tools/world_photobooth.gd` → `docs/renders/world/` | boots the REAL game, teleports, streams, captures the driving camera — the before/after proof tool for any world-look change (windowed, showroom law) |
| Dogs | `dog.gd` | 4 types × breeds; per-dog BOND (STRAY→SOULBOUND); down→bandage save or grave+collar+memorial; metaworld records |
| Crew | `companion.gd` | CREW rows (gunner/mechanic/medic), game-hour job ticks, MORTAL (corpse chest) |
| Motorists/traffic | `motorist.gd`, `track/autopilot.gd`, `traffic.gd` | NPCs drive interstates city-to-city (right-hand-lane routes); player rides shotgun; SEAT ANCHORS (`seats` rows) show riders; **ProtoTraffic (2026-07-07)**: ambient lane-followers on the road polylines — following, exits-to-locations, spawn band, PROMOTE to real ProtoCar3D on bumper/bullet; knobs = `data/traffic.json` rows |
| Combat | `weapon.gd` | data rows; melee scans combatant∪threat; wall-law (`melee_clear`); crit-kill slow-mo; wound taxes |
| Threats | `howler.gd`, `lurker.gd` | pack ROLES (circler/charger/SCREAMER summons), headlight fear, stagger; road pirates (`_update_pirates`) |
| World | `world_stream.gd`, `usmap.gd` | streamed chunks off `data/usmap.json`; authored placements; biomes; states; **ROADS ARE ROWS (2026-07-07)**: lanes 6/4/2 + `divided` per road; twin carriageways + physical median barrier; ONE geometry law (`ProtoUSMap.road_geometry`) shared by paint/grip/traffic; all nearby roads materialize per chunk; **ELEVATION AS ROWS (2026-07-14)**: optional per-point `elev` meters — pitched slabs w/ real deck collision + guard rails + pillars past 1.5m (`ProtoUSMap.elev_at`), flat roads byte-identical (`elevation_sim`) |
| The vertical country | `world_builder.gd`, `usmap.gd`, `tools/mapforge/gen_relief.mjs` | **THE_COUNTRY_PLAN SHIPPED 2026-07-14 (all 3 arcs)**: painted relief grid (150×85 digits, bilinear `relief01`) → macro land (30m, town-terraced, ROAD MEETS THE LAND on `elev_mode:"ground"`); roads climb at ≤6% (adaptive densify — survey segments by COORDINATES, never index); rivers carve 4.5m channels, `water_depth_at` IS the water authority (ford law), water sheets render, bridge decks span carves; ALL 60 blind crossings are real OVERPASSES (`grade:"deck"`+`deck_road`, 6.2m clearance, deck-zone land law); THE SEGMENT GRID (256m buckets) keeps road queries fast (`relief_paint_sim` 16 · `river_sim` 12 · `overpass_sim` 8) |
| The readable road | `world_stream.gd` + bake | ARC 2: every town raises a SEEDED LANDMARK (water tower/grain elevator/steeple/radio mast — rows + silhouette builders, sign names it); FARM BELTS ring approaches (grid cells → farmland); billboards advertise the REAL next exit at REAL milepost miles (`exit_arcs` cache; danger≥3 keeps wasteland warnings); ECOTONE law thins vegetation at biome seams (`readable_road_sim` 15) |
| The living map | `usmap.gd` `district_at`, `world_stream.gd` tints, bake | ARC 3: painted DISTRICTS fold typed → ground tints per kind (boot pass on authored land, 5-point chunk pass elsewhere) + generator fills EMPTY district ground from its own pool (Meridian unification — hand placements untouched); GHOST SITES: 1/3 of county roads grow a GR- spur → dead_motel/dead_gas/drive_in_ruin/roadside_attraction placement CLUSTERS + themed caches, same payload law (`district_sim` 13 · `network_fill_sim` 17) |
| Track pieces | `track_piece.gd` + `data/track_pieces.json` | **RACING DESTRUCTION SET (2026-07-14)**: ramps (cars go AIRBORNE), jump gap, banked curve, barriers + DESTRUCTIBLE barrel stacks/crate walls (Damageable, ram-to-break → debris + scrap chest); placed as placement rows `track:<id>` through the existing layer — owner places via the MapForge TRACK palette (`track_piece_sim`) |
| Weather | `weather.gd` | dust kills the cone, rain kills grip, heat cooks engines — biome-weighted |
| Day/night | `daynight.gd` | 24-min days, moon = night floor, T-wait sprint, `dev_mult` |
| Radio | `radio.gd` | Y scans: distress caches, trade runs, howler warnings, lore; night-weighted |
| Carousel | `carousel.gd` + `data/carousel.json` | 10 DUNGEON bases (occupiers wake on approach); power/codes/purge ladder; PAIR→ROULETTE→THE DIAL; NODE GARAGES; RING EVENTS (nodes besieged — relieve or lose); flesh not steel |
| Events | `events.gd` | deterministic daily roll: caravan / blood moon / STATE AT WAR (weekly) |
| Rulers | `data/rulers.json` | states react to standing at the border: bounty hunters vs hero's welcome |
| THE CIRCUIT | `proto3d.gd` | the named loop: scavenge→upgrade→push→node; HUD pips; cycle payoff |
| First run | `objectives.gd` | NEW-GAME-only onboarding chain: data-row beats that complete on REAL state (drove 60m / out of car / pack grew / at home), one HUD line, then retires; in the save |
| Home base | `homebase.gd` | build board: walls I-III (thin metaworld raids), garage, kennel, workbench, bed |
| RV / camp | `camp.gd` + `character.hunger` | camper rigs grow a camp kit (bed/stove/light); hunger drains on the clock, food_val feeds |
| Metaworld | `metaworld.gd` | off-screen records (dogs) roll raids vs walls; come_home narratives |
| Respect | `respect.gd` | per-faction/state ledger → prices, standing, refusals, market growth |
| Character | `character.gd` | 10 skills level-by-doing; 6-part paper-doll; hp cap; wound taxes |
| Save/load | `save_game()` (F5/F9) | one file: player/dogs/ring/home/ledger/clock/circuit/objectives/deaths |
| Death | `respawn_at_home()` | going down is NOT permadeath (that's the dogs): wake at the safehouse mended, world persists, wasteland takes a cut of scrap/scrip, rig left where it fell; R respawns; deaths counter |
| Multiplayer | `net.gd` (F7/F8) | ENet co-op: remote players+VEHICLES sync (client-authoritative 20Hz, seq-interpolated), HOST-authoritative enemies (clients ghost, suppress own sim); net_loopback.sh live proof |
| Co-op/PvP pass | `net.gd` + `proto3d.gd` | partner NAME TAGS + follow-arrow waypoint, respawn-at-partner, co-op bed rig, net horn pings; F6 peace/duel/ffa, SAFEHOUSE BUBBLE, victim-authoritative PvP damage, kill toast + session bounty on the tag |
| The moveset | `player_3d.gd`, `weapon.gd` | CTRL crouch/slide (noise ×0.55, low capsule); fists/shove WEAPON ROWS + MARTIAL ARTS skill; sprint-tackle knockdown; hold-E drag; auto wade/swim/drown off the real map |
| Dog verbs | `dog.gd`, `buried_cache.gd` | auto-JUMP (fences/gaps, leap row), POUNCE on SIC, Hunter DIG on ProtoBuriedCache → loot_tables |
| Media layer | `media_registry.gd` `tv.gd` `media_panel.gd` `drive_in.gd` `media_pickup.gd` `public_screen.gd` `newsroom.gd` `music.gd` | the cinema plan COMPLETE (design contract: docs/design/CINEMA_MEDIA_LAYER.md): manifest rows → safehouse TV (time passes, save persists) · drive-in (trailers→feature) · found_* pickups · channel-row public screens + event-clip preempts · Newsroom (takeover→TV, bounty→radio) · radio mp3 music stations |
| Scout drone | `drone.gd`, `drone_dock.gd`, `drone_pilot.gd` | safehouse dock → ROUTE SCOUT flies your course (body stays home), 🛸 map marks, returns/recharges, shoot-down-able; **REAL FLIGHT (2026-07-14)**: SPACE/CTRL climb/dive (held target alt, ground-clamped 2.5–40m), SHIFT boost (2× drain), velocity-chasing yaw + banking, SIGNAL WEAK/LOST auto-return at range, altitude-following split eye ("altitude never splits" kept) — `drone_flight_sim` 22/22 |
| Input map | `input_map.gd`, `controls_panel.gd` + `data/input_bindings.json` | every verb = an ACTION row (key+mouse+pad on one action); twin-stick pad driver (right stick → aim_override, trigger job-swap at the wheel, rumble); F11 press-to-capture rebinds persist to user:// |
| Audio/VO | `audio.gd` + `tools/soundforge/` | 57 SFX + 11 TTS lines in 4 LOCKED voices (`voices.json` — never change a voice_id) |
| Paperdoll gear | `gear.gd` + `character.gd` + `data/equipment.json` | THE 19-SLOT PAPERDOLL: ProtoGear catalog (6 armor/7 clothing/6 accessory), every slot bare by default, folds JSON additively (a new gear = a ROW); registers each piece as a usable+priced ITEM + seeds loot (found & bought). EFFECT-WIRED via clean single-consumers (15/19 slots): armor+shirt SOAK at the `take_wound` choke (clamped 0.75) · carry (back/belt→`carry_cap`) · stealth (coat→`stealth_detect_mult`) · unarmed (ring→`unarmed_dmg_mult`) · reload (sash→`reload_mult`) · repair (bracelet→`repair_mult`) · luck (talisman→`scavenge_bonus`) · speed (footwear→`leg_mult`→the one speed site). USE wears one-per-slot, rides the save. The last 4 (face, ear ×2) are grep-verified UNWIREABLE — no rad/toxin/comms system exists to hook, so they need a NEW system (a scope call). faction-ID = respect-ledger design call; Sheet UI = owner's lane. `equip_sim` (31 checks) |

## 🛠 The tool suite (the strategy: models/humans tune content, never code)

- **⚒ THE FORGE hub** `EDITOR.bat` / `node tools/forge/server.mjs` (:8900) — ONE command: starts (or ADOPTS, if already running) Map+Media+Vehicle+Motion+**Showroom** forges, tabbed UI + per-tool "HOW TO USE" drawer + live health dots; children keep their own ports so every existing URL/API still works
- **🛞 BLENDERFORGE** `blender --background --python tools/blenderforge/gen_vehicles.py -- --previews` — Blender 5.1 headless vehicle-body factory → `game/assets/models/vehicles/*.glb` (glass cabins, visible interiors, seats/dash/helm; NAME LAW + full-size-cube + explicit-greenhouse gotchas live in the script header) + preview PNGs (review-before-wiring law). Blender MCP installed (`uvx blender-mcp` in user config + `blender_mcp_addon` enabled)
- **🏛 THE SHOWROOM** `SHOWROOM.bat` / hub tab (:8901) — renders every vehicle row (5 angles + puppet scale + seated bike rider) and every structure row to `docs/renders/showroom/`; RE-RENDER button shells `tools/showroom/run.mjs`; `showroom_sim` guards catalog coverage
- **📷 WORLD PHOTOBOOTH** `Godot --path game res://proto3d/tools/world_photobooth.tscn -- <tag>` — boots the REAL game, teleports to named country spots, streams, captures the driving camera to `docs/renders/world/<tag>/` — the before/after proof tool for any world-look change (windowed, showroom law)
- **VehicleForge** `node tools/vehicleforge/server.mjs` (:8898) — fleet editor, armor-forward, TEST DRIVE, best-lap compare
- **MapForge v4 — THE ROAD EDITOR** `node tools/mapforge/server.mjs` (:8899) — world-space viewport (mouse-anchored zoom, pan, minimap), vertex-level road editing (drag/insert/delete, nearest-end stretch; field-PRESERVING writes — surface/side/geom survive), EXIT pieces w/ **MILEPOST numbering** (address-law mirror), **DISTRICTS** (polygon rows), **PLAN layer** (shared owner+AI TODO pins, sidecar `map_plan.json`), **MEASURE** (A→B drive-time per vehicle: real minutes + 60× game clock, on the real junction graph), **ORPHANS layer** (`/api/graph_health` paints bake gaps red), auto-bake + undo/redo + multi-writer mtime guard; the bake carries the **MERGE LAW** (meetings absorb into nearby nodes' legs — town grids stay tied to their feeders) + edits on ramps clear `geom` so the next bake re-peels; STRUCTURE CATALOG + placements + templates as before; **RDS TOOLS (2026-07-14)**: ELEV tool (arm a vertex, scroll/± in 0.5m steps −5..+30, amber climb tint + height labels; road rows carry optional per-point `elev` meters), road SURFACE picker in the inspector, TRACK palette in PLACE (`track_pieces.json` → placements namespaced `track:<id>`, `GET /api/track_pieces`); the bake also runs **TOWN LAYOUT v2** (street-facing zoned frontage — see the systems table)
- **SoundForge** `tools/soundforge/` — `generate.mjs` (ElevenLabs SFX), `voices.mjs` (TTS, consistent voices)
- **MotionForge** `node tools/motionforge/server.mjs` (:8896) — procedural-motion ROWS (`data/motions.json` overlays code stock), sliders + describe-it NL endpoint; treadmill stage `res://proto3d/tools/motion_stage.tscn`
- **MediaForge** `node tools/mediaforge/server.mjs` (:8897; `npm i` once for ffmpeg-static) — drop MP4s → Theora .ogv + poster + runtime → manifest ROW; test-reel/test-music generators; music mp3 shelves in `game/media/music/`
- **Proving Grounds** `res://proto3d/track/track.tscn` — lap timing, ghosts, chase-AI testbed
- **Data spine** — `Drivn*` schemas (`game/proto3d/data/`), JSON→.tres stamper, `reload_content()` live re-fold (F10 FORGE)

## ✅ Testing (the iron rule)

**Headless sims must exercise the REAL path — inputs, never teleports** (staging positions is the documented exception).
60 sims + net_loopback.sh (full suite green). Run one:
```
Godot_console --headless --path game res://proto3d/tests/<name>.tscn
```
Key sims: `world_sim`, `threat_sim`, `spine_sim`, `signature_sim`, `crew_sim`, `homebase_sim`, `npc_drive_sim`, `carousel_sim`, `carousel2_sim`, `pvp_prep_sim`, `save_sim`, `garage_sim`, `rv_camp_sim`, `visibility_sim`, `data_sim`, `track_sim` — plus the 2026-07-06 arc: `crouch_sim`, `unarmed_sim`, `drag_sim`, `water_sim`, `dogverb_sim`, `motion_sim`, `media_registry_sim`, `tv_sim`, `unlock_media_sim`, `drive_in_sim`, `news_media_sim`, `music_sim`, `drone_scout_sim`, `coop_fun_sim` — plus the RIG V2 trio (2026-07-07): `rig_v2_sim`, `grip_ik_sim`, `recoil_sim` (+ adopted `gunfeel_sim`) — plus the road/traffic pair: `road_lane_sim`, `traffic_sim` — plus the 2026-07-14 arcs: `surface_handling_sim` (10), `driver_visible_sim` (12), `drone_flight_sim` (22), `vehicle_style_sim` (88, box stock + GLB phases), `elevation_sim` (25), `track_piece_sim` (26), `showroom_sim` (194), `vegetation_sim` (15), `city_layout_sim` (17, +identity/belt rows), `town_grid_sim` (10, layout-v2 counts) — plus THE_COUNTRY_PLAN trio (2026-07-14): `relief_paint_sim` (16), `river_sim` (12), `overpass_sim` (8), `readable_road_sim` (15), `district_sim` (13), `network_fill_sim` (17, +ghost law).

### Paid-for gotchas (do not re-pay)
- New `class_name` scripts need `--headless --path game --import` before headless runs.
- `get_tree().current_scene` is the SIM in harnesses — fall back to `get_parent()` for main.
- First headless frame can be >100 ms; tweens run on real frames; input events need several `process_frame`s to land; give every main-scene sim a WATCHDOG timer.
- Cinematics/sims must restore the PREVIOUS `Engine.time_scale`, never blindly 1.0.
- `take_wound` drains core hp too — top hp between staged wounds or the character dies mid-test.
- Chassis-critical + breached tank = fire spiral — separate damage phases in tests.
- Positive `engine_force` pushes +Z (forward is negative). Wheel damping k*2*sqrt(stiffness).
- Kill zombie `*_console.exe` processes if a headless run hangs a port/lock.
- `DataVehicle`/`DataItem` class names are TAKEN by legacy 2D code — the spine uses `Drivn*`.
- Dictionary element access needs explicit types (`var x: float = dict["k"]`) or the parser fails.
- Retargeting a group (e.g. `threat`→`combatant`) can orphan test dummies — melee scans the UNION so any hostile is meleeable however tagged.
- **Godot glTF NAME LAW (2026-07-14):** import hijacks node-name suffixes — `*col` grows a StaticBody3D collider, `*wheel` becomes a VehicleWheel3D (a `steer_col` steering column made every car SELF-COLLIDE and creep). Blender-side names must avoid -col/-convcol/-rigid/-vehicle/-wheel/-navmesh/-occ.
- Blender `primitive_cube_add(size=1.0)` is ALREADY a 1m cube — scale by full size, never size*0.5; Blender 5.x booleans only NICK a hole through a profile-prism's big ngon face (build greenhouses explicitly, booleans for wheel wells only).
- Surface-handling law: staged cars SLIDE on dirt while settling — sims re-stage the player relative to the SETTLED car and stay 14m+ clear of the boot car (INTERACT_RANGE 3.4); a scene without road rects reads as DIRT (paved test scenes set `surface_override = "road"` — track.gd law).
- Killing zombie Godot consoles also kills YOUR background runs — their output files end empty with exit 0; rerun, don't trust.

## 📏 House rules

- Data-driven everything: new vehicle/item/NPC/base/upgrade = a ROW.
- Signals over coupling; components over inheritance; `Damageable` is the one damage class.
- Every feature lands with a sim; every bug fix leaves a regression check.
- Every player-facing feature gets a **/librarian** pass (books are rows, the owner approves all prose — see `docs/design/THE_LIBRARY.md`).
- Commit after every feature (`.claude/rules/git-workflow.md`); push to origin main.
- Surface every system: if the player can't see it, it doesn't exist (sheet K / HUD / prompts).
- No purple. Ever.

## 📚 Doc map

- `docs/HANDOFF.md` — **the authoritative have-vs-should** (read first) · `docs/ENGINE.md` — master spec · `docs/STAGES.md` — roadmap
- `docs/DIVIDED_STATES.md` — lore bible (rulers, THE CAROUSEL) · `docs/WORLD_PILLARS.md` — the five world pillars + eight laws (what the game is ABOUT; P3 = Pillars 1+2+5, road rows first)
- `docs/design/*` — the ACTIVE goal contracts (Living World, drive-by, strikes, loot/NPC/wanted/spawn, population war, car UI, UI language, paperdoll, co-op/PvP) · `docs/systems/*` — per-system design · `docs/PLAYTEST_GUIDE.md` — the DO→EXPECT script
- `docs/legacy-2d/` — the old 2D game's docs (quarantined reference; incl. its BUILD_NOTES journal) · `docs/setup/` — MCP/editor setup
- *(Retired 2026-07-07 doc audit — shipped plans deleted, in git history: MASTER_PLAN, cinema, MOVESET, CAROUSEL, RV_PLAN, UI_UX_PLAN, LOOP2_LIVING_CAR.)*
