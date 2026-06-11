# CarWorld — Build Notes (Fable 5 / autonomous master run)

One lesson or decision per entry, newest at top of each section. This is the persistent
memory for the long autonomous build driven by `MASTER_PROMPT.md`. Reference it at the start
of each system and update entries instead of duplicating.

**Run started:** 2026-06-11 ~11:56 local. Goal: drive CarWorld toward the full vision
(weapons → huge world → towns → bandits/convoys → 32-player MP → polish).

---

## ⚠️ Standing constraints (read first)

- **No live Godot in this harness.** The Godot MCP tools are not connected in this session,
  so I cannot open the editor or run the game to verify. Everything is written as text
  (.gd / .tres / .tscn) and statically reviewed. Progress reports must say "written +
  static-reviewed, needs in-editor playtest" — never "verified working" for anything that
  requires running Godot. The user should open the project in Godot 4.5 to playtest each
  committed increment.
- **Conventions (enforced, see `.claude/rules/gameplay-code.md`):** static typing on all
  vars/params/returns; gameplay values from `.tres`/`Const.gd`, never hardcoded; `delta` for
  all time math; cross-system comms via signals, never direct UI refs; vehicles are
  `CharacterBody2D` with custom physics, NEVER `RigidBody2D`.
- **Commits:** clean messages, NO `Co-Authored-By` line (repo standing rule).

## Damage model (discovered — do not relearn)

- **VehicleEntity** (`entities/vehicles/vehicle_entity.gd`): has own `hp: float`,
  `take_damage(amount: float)`, `_die()`. Applies `GameState.get_damage_multiplier()` (armor)
  and adds heat on hit. Collision damage already wired via `move_and_slide` slide checks.
- **CharacterEntity** (`entities/character_entity.gd`): HP lives in a `HealthController`
  component (`components/health_controller.gd`) via `change_hp(value, from)`. The entity's own
  `take_damage(int)` ONLY does floating text + camera shake — it does NOT subtract HP. To hurt
  a character from code, call `entity.health_controller.change_hp(-dmg, source)`.
- **Melee path:** `HitBox` (Area2D, monitorable, `hp_change`) → `HurtBox` (Area2D, monitoring,
  holds `health_controller`) → on `area_entered`, calls `health_controller.change_hp(...)`.
- **Projectile** (`entities/projectiles/projectile.gd`): Area2D, moves by `velocity`, hits via
  `body_entered`. A `bullet.png` sprite exists at `entities/projectiles/sprites/`. No
  `projectile.tscn` existed yet.
- **Collision layers** (project.godot): 1=block(world), 2=character, 3=body(vehicles/moving),
  4=interaction, 5=hitbox_player, 6=hitbox_enemy, 7=hitbox_environment.

## 🔴 CRITICAL: res:// root + the great path bug (fixed this run)

- **`res://` = the `game/` folder** (project.godot lives at `game/project.godot`,
  main_scene = `res://scenes/levels/test/test_driving.tscn`). There is NO `game/game/`.
- The project was **restructured at some point** and left 27 files with stale
  `res://game/...` paths that resolve to the nonexistent `game/game/...`. The `preload()`
  ones (garage_terminal, upgrade_menu, vehicle_selector) were HARD COMPILE ERRORS — those
  UI features were silently broken. Others (player.tscn, world.tscn, hud, cards, props)
  had missing-dependency breakage.
- **FIXED**: mass `res://game/` → `res://` across all .gd/.tscn/.tres (not the regenerable
  `.godot/` cache). Verified zero remaining. When authoring any new file, ALWAYS use
  `res://<path>` (e.g. `res://scenes/...`, `res://entities/...`) — NEVER `res://game/`.
- Separate pre-existing breakage still present (NOT a res://game/ issue, fix later):
  `world.tscn` references `res://systems/map/road_manager.gd` which does not exist;
  `test_world.tscn` references `res://scripts/auto_loads/chunk_manager.gd` (verify it exists).
- Also fixed: `player_entity.gd` `if hud_instance:` (always null) → `if hud_scene:` so the
  in-vehicle HUD actually instantiates.

## Verification sweeps (this run)

- Mixed tab/space indentation (GDScript compile error) found + fixed in 3 files: road_segment.gd,
  garage_terminal.gd, town_zone.gd. Full sweep now CLEAN (awk check: no .gd mixes tab+space indent).
- Broad compile/crash sweep: no remaining undeclared vars, bad preloads, or res://game/ refs.
  Fixed debugger.gd `_toggle_screen_view` null-deref on `hp_bar` (debug toggle would crash if no
  health-bar scene assigned).
- TO REVISIT (lower priority, not yet fixed): SceneManager.gd ~line 216-228 "zelda" transition
  tweens `outgoing_scene` which can be null → crash only if that transition type is used with a
  null outgoing scene. Guard before use.
- FALSE POSITIVE (verified fine, do not "fix"): interaction_controller.gd ~125-131 — the
  interact()/interact_with() calls ARE correctly nested inside `elif nearest.has_method("interact")`.

## Team / faction convention (introduced this run)

- Added `@export var team: int = 0` to both `VehicleEntity` and `CharacterEntity`.
  `0` = player/friendly, `1` = hostile (bandits, pursuers). Projectiles carry a `team` and a
  `source` node; they pass through same-team entities and never hit their own source. This is
  also the hook multiplayer will use to distinguish players later.

---

## System log

### System 1 — Weapons & combat (IN PROGRESS)
- DONE: hardened combat foundation (team-aware projectile.gd damages vehicles + characters;
  `team` on base classes; weapon_system.gd cadence/pellets/team/auto-reload). Committed.
- DONE: 4 projectile scenes + 5 weapon .tres. Committed.
  - Projectile scenes: all Area2D, collision_layer=0, collision_mask=7 (block|char|body).
    - projectile.tscn (bullet, 3s) · rocket.tscn (rocket, 4s) · mine.tscn (mine, 25s, sits
      still because weapon projectile_speed=0 → velocity 0; team check lets player drive away,
      enemies trigger it) · flame.tscn (fire_trail, 0.45s short range).
  - Weapons in items/weapons/: machine_gun, shotgun (7 pellets/22°), rocket_launcher,
    flamethrower (2 pellets/0.05s), mine_dropper.
- DONE: vehicle weapon mounting (VehicleEntity._setup_weapons from data.default_weapon /
  default_weapons; fire on `attack`; weapon_shot→HUD). All 3 vehicles armed. Committed.
- DONE: enemy SHOOTER pursuer (holds range, faces player, fires); encounter_director spawns
  RAMMER/SHOOTER/BLOCKER variety; fixed undeclared pursuer_pending compile error. Committed.
- DONE: on-foot shooting in player_entity.gd — mouse-aimed, fires WeaponSystem child, syncs
  to equipped weapon, default sidearm = machine_gun; is_driving suppresses it while driving;
  ammo flows to HUD. Committed.
- System 1 ESSENTIALLY COMPLETE (needs in-editor playtest). Known refinements (not blocking):
  - On foot with a melee `weapon` (sword) still equipped, pressing attack may also trigger the
    melee state while the gun fires — consider unifying ranged vs melee selection later.
  - Rocket/explosion AoE not implemented (rockets are single-target); flamethrower is discrete
    pellets not a continuous cone. Good enough for now; revisit in polish.
  - Want a dedicated pistol .tres + sprite for the on-foot sidearm (reusing machine_gun now).

### System 2 — Huge world & terrain (IN PROGRESS)
- Correction to initial survey: `systems/map/road_manager.gd` DOES exist — there is a working
  infinite-road streaming system (RoadManager spawns/despawns RoadSegment chunks as the player
  drives north along the road at world x≈10000; difficulty-scaled wreck obstacle patterns).
  Decision: EXTEND this coherently into an open themed wasteland rather than build a conflicting
  grid world. The road remains the spine (pursuer/encounter lane logic depends on x≈10000).
- Found + fixed: `road_segment.gd` mixed 4-space (`_ready`) and TAB (`spawn_obstacles`)
  indentation — a GDScript compile error. This file/road system is only used by `world.tscn`
  (not the main `test_driving.tscn`), so it likely never ran. Normalized `_ready` to tabs.
  NOTE: `town_zone.gd` `_on_gate_entered` (lines ~38-41) ALSO uses spaces while the rest is
  tabs — same latent bug, fix when touching that file.
- DONE: collision layer 8 = `rough_terrain` (project.godot). FootZone (`systems/map/foot_zone.gd`,
  code-generated, no .tscn) = ring of StaticBody2D barriers on rough_terrain. Vehicles mask
  layer 8 (blocked); characters don't (walk through). Interior has a loot cache → "terrain that
  requires walking." VehicleEntity._ready adds `collision_mask |= 1<<7`; PursuerAI mask now
  1+2+128.
- DONE: RoadSegment now lays a wide wasteland backdrop (world_width 4200) + scattered rocks, and
  `maybe_spawn_foot_zone(chance)`; RoadManager spawns ruins more often past 0.5/1.0 mi.
- DONE: REPAIRED world.tscn (the full town→run game scene). It was doubly broken: (1) ext
  resources referenced by PATH inside ExtResource("res://…") instead of declared ids — a parse
  error; (2) the Player was a bare CharacterBody2D missing all components player_entity.gd needs
  (animation_tree etc.) → would crash on _ready. Rewrote header to declare all 7 ext_resources
  with ids, and now INSTANCE the complete player.tscn (uid://dfxvfxqwdnh48, groups=["player"]).
  RoadManager auto-finds the player via the "player" group; TownZone start gate triggers the run.
  UNVERIFIED (no editor): main risk is player.tscn instancing cleanly (its res://game/ paths were
  fixed earlier, so it should). world.tscn is NOT the main scene (test_driving.tscn is) — left
  main_scene unchanged; user can open world.tscn to play the full loop.
- TODO next: minimap/world-map on HUD; biome/theme variety; System 3 (towns/garages — upgrade
  menu UI works now that its path is fixed; consider weapon-buying via GameState economy).

#### Invented UID registry (REUSE these exact uids, do not regenerate — avoids collisions)
- projectile.gd: uid://dalvnt2aygqgg (pre-existing)
- data_weapon.gd: uid://bc7pmqpgxatnh (pre-existing)
- projectile.tscn: uid://bcwprojectilebul · rocket.tscn: uid://bcwprojectilerkt
- mine.tscn: uid://bcwprojectilemin · flame.tscn: uid://bcwprojectileflm
- machine_gun: uid://bcwwpnmachinegun · shotgun: uid://bcwwpnshotgun01
- rocket_launcher: uid://bcwwpnrocket01 · flamethrower: uid://bcwwpnflame01
- mine_dropper: uid://bcwwpnmine01
- NOTE: textures referenced by path only (no .import files exist in this env); Godot will
  import + assign uids on first editor open. Harmless warnings expected on first load.
