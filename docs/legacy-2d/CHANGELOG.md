# CarWorld Changelog

## 2026-06-11 — Multiplayer netcode + GTA2 driving overhaul

**Multiplayer (server-authoritative, built + verified headlessly via `tools/net_test.sh`):**
- `NetworkManager` autoload: host/join over ENet (32 max), server-authoritative player roster,
  spawn handshake, client→server input replication, and automatic ~20 Hz server→client state sync.
- `VehicleEntity.network_peer_id`: the server drives each networked vehicle from the controlling
  peer's replicated input; clients interpolate to the synced state. The host drives its own car
  locally. Single-player path completely unchanged.
- **Playable arena** (`scenes/mp/mp_arena.tscn`): launch two instances, **H** to host / **J** to
  join 127.0.0.1, and drive together. The whole loop (input → server sim → state sync → render)
  is verified cross-process.
- The hard part of 32-player multiplayer is done at the protocol/entity level; remaining is scene
  integration (a `MultiplayerSpawner` in the main world + a host/join menu). See `docs/MULTIPLAYER_PLAN.md`.

**Driving feel (GTA2 arcade):**
- Punchy, distinct braking that decelerates hard against travel direction using each vehicle's
  brake stat (then reverses once stopped) — the brake stat was previously ignored.
- Tuned for momentum: more coast/glide, handbrake power-slides that keep speed, drift that kicks
  in sooner. Per-vehicle character: grippy Behemoth, balanced Scavenger, loose Interceptor/Bike.
- **Skid marks**: fading tire trails laid down while sliding sideways or handbraking at speed.
- Vehicle durability now comes from armor (Behemoth tanks, Bike is fragile); HP was previously
  identical across all vehicles.



## 2026-06-11 — Hardening & ecosystem completion (Phase 7.5, in-editor verified)

The project was opened in Godot 4.5 and is now verified to compile, boot, and run. A headless
test harness (`tools/smoke_test.sh`) drives **32 automated checks** — 28 system/economy smoke
checks plus a 4-check full-run integration sim that starts a run, drives, and confirms the road
streams, encounters escalate, and extraction works. All green; all scenes boot clean.

Fixed (surfaced by the editor + tests):
- Compile errors on first open: a pursuer `enum State` colliding with the global `class_name State`
  (renamed to `AIState`); a `debugger.gd` invalid theme property access.
- **Loop-breaking bugs** (the "track the player, not the vehicle" class): the road, encounter
  director, and minimap all read the hidden/static player while driving — so runs never progressed,
  encounters never spawned mid-drive, and the radar froze. All now track the active vehicle.
- Combat pacing: encounters were one-per-run; now recurring and escalating with heat.
- Loop completeness: the town respawns a vehicle on return; the run-start teleport and town-return
  move/eject the vehicle correctly.
- Robustness: deferred world-root spawns (chained explosions could fail on a busy root); a typed-
  array crash on profile load.

Added to the ecosystem:
- **Extract-or-die stakes**: scrap earned in a run is forfeited on death, banked only on extraction.
- **Arms dealer**: buy and equip weapons at the garage (5-gun catalog, persisted); your vehicle
  mounts the equipped gun.

## 2026-06-11 — Autonomous combat & open-world pass (Phase 7)

A large autonomous build session driven by `MASTER_PROMPT.md`. Added a full combat layer,
an open wasteland with on-foot zones, a complete enemy roster including convoys, and repaired
a substantial backlog of latent bugs that were silently breaking core scenes. All new work is
written and statically reviewed; it needs an in-editor playtest in Godot 4.5 (the editor was not
connected during this session). See `docs/BUILD_NOTES.md` for the technical log and `FEATURES.md`
for the player-facing feature list and how-to-test.

### Combat & Weapons (System 1 — complete)
- Team-aware projectile that correctly damages **both** vehicles and on-foot characters, never
  hits its own shooter or allies, and stops on world geometry.
- Five weapons (data-driven): machine gun, shotgun (7-pellet spread), rocket launcher,
  flamethrower, mine dropper — plus four projectile variants.
- Vehicle-mounted weapons fire on the attack button at each weapon's own cadence; ammo on HUD.
- On-foot, mouse-aimed shooting.
- Explosive rockets and mines with falloff area damage; vehicles explode on destruction (a player
  wreck can chain-detonate nearby enemies).
- Juice: muzzle flash per shot, damage flash on hit, camera shake.

### Enemies & Factions (System 4 — substantial)
- Enemy roster: **Rammer, Blocker, Shooter** (holds range and fires), **Swarm** (fast/fragile
  bikes that attack in packs with flanking escorts), **Transport** (armored hauler).
- **Convoys / mass-transit units**: a chance for an oncoming armored transport with shooter
  escorts; down the transport for a rich loot payload.
- **On-foot bandits** guard the ruins — fight them on foot for the loot.
- Kills award scrap, tying combat to the upgrade economy.

### World & Terrain (System 2 — substantial)
- Open wasteland flanking the road, with scattered rocks and depth-based biome tint
  (rust desert → ashlands → toxic flats).
- **Foot-only ruins**: a new `rough_terrain` collision layer makes barrier rings that vehicles
  can't enter but characters walk through — "terrain that requires walking" — with richer loot
  and bandit guards inside.
- GTA-style **minimap** (top-right radar) in both the test scene and the full game scene.

### Critical bug fixes (the game now actually runs)
- Repaired **27 files** with stale `res://game/...` paths from a past project restructure — the
  `preload` ones were hard compile errors silently breaking the garage, upgrade menu, and vehicle
  selector; others broke the player, HUD, world scene, vehicle cards, and props.
- Fixed **3 files** with mixed tab/space indentation (GDScript compile errors): road_segment,
  garage_terminal, town_zone.
- Repaired malformed `world.tscn` (the full town→run game scene): invalid resource references
  and a crash-prone bare player node; it now loads the complete player and all systems.
- Fixed an undeclared variable in the encounter director (compile error), the in-vehicle HUD that
  never instantiated (always-false guard), the extract/repair panel wired to a nonexistent HUD
  method, a debug-menu null crash, and wired the test vehicles' data so they actually arm.

### Not done (out of scope for this session)
- **Multiplayer (System 5)** — a 32-player server-authoritative layer is a large, multi-week
  build and was not attempted blind. The `team` field on entities is the hook for it.
- **Town/garage economy expansion (System 3)** — the existing garage/upgrade UI was *unbroken*
  this session (path repair), but an arms-dealer/weapon-buying UI was not added.
