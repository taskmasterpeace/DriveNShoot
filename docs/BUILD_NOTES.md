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

## Team / faction convention (introduced this run)

- Added `@export var team: int = 0` to both `VehicleEntity` and `CharacterEntity`.
  `0` = player/friendly, `1` = hostile (bandits, pursuers). Projectiles carry a `team` and a
  `source` node; they pass through same-team entities and never hit their own source. This is
  also the hook multiplayer will use to distinguish players later.

---

## System log

### System 1 — Weapons & combat (IN PROGRESS)
- Started by hardening the combat foundation in pure GDScript (highest confidence without a
  live editor): robust team-aware `projectile.gd` that damages BOTH vehicles and characters
  correctly, plus `team` on the two base entity classes, plus `weapon_system.gd` fire-rate
  gating + team/source forwarding + auto-reload.
- TODO next: author `projectile.tscn` (Area2D + Sprite2D bullet + CollisionShape2D, mask =
  block|character|body); author DataWeapon `.tres` for machine_gun/shotgun/rocket_launcher/
  flamethrower/mine_dropper; mount weapon hardpoints on VehicleEntity using DataVehicle slot
  count; on-foot aim+fire; ammo on HUD.
