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
- DONE: hardened combat foundation (team-aware projectile.gd damages vehicles + characters;
  `team` on base classes; weapon_system.gd cadence/pellets/team/auto-reload). Committed.
- DONE: 4 projectile scenes + 5 weapon .tres. Committed.
  - Projectile scenes: all Area2D, collision_layer=0, collision_mask=7 (block|char|body).
    - projectile.tscn (bullet, 3s) · rocket.tscn (rocket, 4s) · mine.tscn (mine, 25s, sits
      still because weapon projectile_speed=0 → velocity 0; team check lets player drive away,
      enemies trigger it) · flame.tscn (fire_trail, 0.45s short range).
  - Weapons in items/weapons/: machine_gun, shotgun (7 pellets/22°), rocket_launcher,
    flamethrower (2 pellets/0.05s), mine_dropper.
- TODO next: mount weapons on VehicleEntity (plan: add `default_weapons: Array[DataWeapon]`
  to DataVehicle, set in vehicle .tres; VehicleEntity spawns WeaponSystem children at _ready,
  fires on `attack` input, aims forward = transform.x). Then on-foot aim+fire, ammo on HUD,
  enemy shooter type.

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
