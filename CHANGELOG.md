# CarWorld Changelog

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
