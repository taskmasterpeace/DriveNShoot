# CarWorld Remake on the DEATHLANDS Web Engine — Plan

**Decision:** the DEATHLANDS three.js engine (agent-drivable, 48-command API, MCP tools, headless runner, self-test) becomes the new CarWorld mainline. It lives at `carworld/web/`, next to the Godot game, which stays untouched as reference. CarWorld's JSON data is ported through adapters, not rewritten. WarWorld contributes simulation code: bot AI, cover, grenades and weapon mechanics. The rigged soldiers in `D:/lsw` are a later model-pipeline phase.

**Rule for every phase:** each feature ships with
- an agent command (or a field in an existing one),
- a `selftest` check,
- a scenario that shows it off,
- and no change to the performance budget: under 150 draw calls, 1080p under 8 ms, zero runtime errors.

**Status (2026-10-22, late):** the game is DIVIDED STATES OF AMERICA. Phases 0-4 are done and well past (world memory, survival, skills, the garage, jumps, the inventory, interiors, the stamped-steel HUD); 73/73 selftest. What landed, how to land it on `feat/web-engine`, and the next blocks are in `docs/RESUME_WEB_ENGINE.md`; the design docs are WEB_WORLD_MEMORY, WEB_FAN_SERVICE_BIBLE, WEB_STREAMING, WEB_JUMPS and WEB_INVENTORY in `docs/design/`.

---

## Phase 0 — Move in (foundation)
- [ ] Copy the engine to `carworld/web/` (no `node_modules`/`dist`), install it, keep `selftest` green, and point carworld's `CLAUDE.md` at it.
- [ ] **Data adapters** (`web/src/data/carworld.js`) that read `carworld/game/data/*.json`:
  - `vehicles.json` becomes `VEHICLES` rows: mass, top speed, grip, armor, and the seat and dog-seat counts.
  - `infected.json` becomes zombie variants (runner, bloater, crawler…).
  - `creatures.json` becomes wildlife and howlers. `items.json`, `loot_tables.json` and `prices.json` become loot.
  - `surfaces.json` and `traction.json` become per-surface grip.
  - `npcs.json`, `security_forces.json` and `rulers.json` become factions and named NPCs.
- [ ] The weapons hard-coded in `proto3d/weapon.gd` move into a data file, merged with WarWorld's `weapons.ts`. Penetration, ricochet and overheating come from WarWorld's `weaponMechanics.ts`.

## Phase 1 — Vehicles with real depth
**Damage model.** Each car has engine, radiator, fuel tank, 4 tires, 6 body zones (front/rear/left/right and 2 corners), lights, windows (already built), doors and bumpers.
- Dents are vertex deformation per zone, applied where the hit lands.
- Doors and bumpers come off and stay on the road as debris.
- Damage has effects:
  - a blown tire pulls the steering
  - a hit radiator overheats, then the engine seizes
  - a punctured tank leaks a fuel trail, and a fire can follow it back to the car
  - broken lights stop lighting the road
  - the engine sputters as it gets damaged
- The chain ends in smoke, then fire, then explosion, then a burnt husk you can salvage.

**Seats.** Driver, shotgun and back seats, each with its own door and window.
- Passengers can be companions (who shoot out of their windows), hostages or bodies.
- `seat` / `swapSeat` commands.
- Carjacking pulls people out through a specific door, and you can shoot from any seat's window.

**Motorcycles.** Lean into turns, wheelies, a counter-steer drift. The rider is exposed (shot, grabbed, clotheslined) and bails or gets thrown on a crash. Bikes can pass between cars.

**Moving set-pieces:**
- A freight train on a rail line across the map: deadly, can be ridden or boarded, and you can cut its cars loose.
- Raider war convoys with turret trucks and outriders.
- A water tanker run to escort.
- Stampedes (cattle or howlers).
- A haboob dust wall with convoys driving in front of it.

**Towing and harpoon (built).** Add a trailer hitch and chained winches, a tow rope between two cars, and dragging wrecks.

## Phase 2 — Terrain with depth, and water
**Heightmap terrain.**
- Mesas, mountains, canyons, washes, buttes.
- Cliffs block movement, ramps and switchback roads climb them, and cars catch air off ridges.
- From a top-down camera, elevation reads through relief shading, cast shadows, parallax and contour fog.
- The nav grid gains slope and height layers. Projectiles arc over ridges and line of sight respects terrain.

**Water.**
- Rivers, a reservoir lake, flooded underpasses and canal channels.
- Shader water with shore foam, wakes and rain rings. Wading slows you down and swimming uses stamina.
- **Diving:** a breath meter, an underwater tint and caustics, sunken loot, and drowning.

**Watercraft.**
- Airboat, jet ski, raider gunboat and a ferry raft.
- Each has buoyancy, a wake, and handling that depends on its hull.
- Cars that drive into deep water float briefly, then sink with you inside unless you get out.

**Bridges and fords:** collapsible bridges and fords you can drive through.

## Phase 3 — Combat depth
**Throwables**, each with an arc preview, cooking, bounce and roll physics, and the ability to go through a window:
- frag grenade
- molotov, whose fire spreads over fuel, grass and bodies and burns cars
- smoke, which blocks line of sight and AI vision
- flashbang, which blinds and deafens
- pipe bomb
- sticky charge for vehicles
- a rock or bottle thrown as a distraction, which pulls AI and zombies toward the noise

**On-foot moves.** Dive (a forward roll that dodges and passes under fire), a combat roll, vaulting low walls, leaning out of cover, melee combos (from `strikes.json`), shoving, grabbing and dragging.

**AI.** WarWorld's `tactician` brain (push, peel back out of sight, throw grenades into cover) plus CarWorld's squads: road pirates, bandit convoys and bounty hunters.

**Infected variants.** Runner, crawler, bloater (explodes into a gas cloud), brute (knocks cars over) and screamer (summons hordes). Hordes drawn by noise are already built.

## Phase 4 — 100+ QOL and small details (checklist, grows as we go)
**Driving.**
- Ghost preview of the GPS route on the road.
- Auto-headlights at dusk, turn-signal blink, brake lights, reverse beeper.
- Tire tracks in sand that fade, dust trails scaled to speed, mud splash, wet-road reflections.
- Speedometer gear readout, fuel gauge, engine temperature, tire icons, damage diagram (windows already done).
- Collision sparks scaled to impact, camera kick on hits, slow-motion on big crashes (optional).
- Horn makes NPCs leap aside, radio stations in the car.

**On foot.**
- Footstep decals in sand, a stamina bar, crouch walking.
- Holster toggle, weapon wheel on hold, pick-up prompts with item names.
- Ammo counters that flash when low, reload interrupt.

**Feedback.**
- Damage direction indicators, hit markers by limb, kill feed, floating loot text.
- Blood on the camera lens, ear-ring after explosions, screen dirt in dust storms.

**World.**
- Birds that scatter, tumbleweeds, flapping tarps, flickering neon, steam vents, swinging doors.
- Glass and debris that stays, bullet holes in cars, shell casings that pile up, blood trails to bodies.
- Shadows that follow the time of day, heat haze at noon, stars and moon phases.

**People.**
- NPCs react to gunfire (duck, cower, flee), barks on spotting you, idle animations (smoking, leaning).
- Names over heads on hover, faction colour accents, wanted-level police response tiers.

**Interface.**
- Rebindable keys, controller support, colour-blind palette, subtitles, text size.
- Photo mode, replay of the last 10 s, autosave slots, quick-travel between discovered safehouses.
- Map legend and filters, compass ribbon.

**Agents.**
- Every feature has a command plus an event, `bench` per feature, a scenario per feature, and a coverage test that every command has a `selftest` check.

## Phase 5 — The CarWorld world
- Import `usmap.json`:
  - start with one state (Arizona, the Solar King) at full detail
  - roads with lanes and elevation, towns, exits, buildings from `structure_profiles.json`
- Stream map chunks and keep NPCs simulated only near the player.
- Bring in the remaining CarWorld systems, using CarWorld data and docs as the spec:
  - dogs (breeds, bond, whistle commands)
  - scout drone, radio, safehouse and homebase
  - law and respect by state, rulers, bounties
  - crafting, the RV camp, hunger and thirst
  - the Carousel teleport network

## Phase 6 — Characters and assets
- Optional GLB pipeline with skinned instancing (vertex-animation textures) for hero characters and soldiers. Candidate sources: the `D:/lsw` modular hero plus clone-kit (CC0), and the owned mocap packs.
- CarWorld's Blenderforge vehicle GLBs as body meshes, with damage zones mapped onto them.
- Keep the instanced procedural humans as the crowd LOD.

## Order and checkpoints
1. Phase 0, then Phase 1 (damage, seats, motorcycles), then throwables and diving, then terrain and water plus watercraft, then the QOL sweep. The world import comes after the engine features are proven.
2. After each block: `selftest` all green, `bench`, a scenario screenshot set, and `AGENTS.md` and `docs/COMMANDS.md` updated.
