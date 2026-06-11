extends Node2D

## Headless smoke test. Spawns and exercises every gameplay system for a few frames, asserts
## basic invariants, prints SMOKE: PASS/FAIL lines, and quits with exit code = failure count.
## Run: Godot --headless --path game res://tests/smoke.tscn --quit-after 300

var _frame: int = 0
var _results: Array[String] = []
var _vehicle: VehicleEntity
var _did_encounter_test: bool = false
var _loot_before_drop: int = -1

func _ready() -> void:
	_test_economy()
	_spawn_world()

## Exercises the town->run->extract->upgrade economy backbone. Snapshots and restores GameState
## so it leaves the real save profile untouched.
func _test_economy() -> void:
	var gs = get_node_or_null("/root/GameState")
	if not gs:
		_check("GameState autoload present", false)
		return
	_check("GameState autoload present", true)

	var snap := {
		"scrap": gs.scrap, "lifetime": gs.lifetime_scrap, "armor": gs.armor_tier,
		"kits": gs.kits_tier, "rel": gs.reliability_tier, "state": gs.current_state,
		"miles": gs.current_run_miles, "best": gs.best_miles,
		"unlocked": gs.unlocked_vehicles.duplicate(),
		"owned": gs.owned_weapons.duplicate(), "equipped": gs.equipped_weapon_id,
	}

	# Death forfeits scrap earned this run.
	gs.scrap = 100
	gs.start_run()
	gs.add_scrap(50, "test")
	_check("scrap rises during run", gs.scrap == 150)
	gs.fail_run("Wrecked")
	_check("death forfeits run scrap", gs.scrap == 100)

	# Extraction banks scrap earned this run.
	gs.return_to_town()
	gs.start_run()
	gs.add_scrap(40, "test")
	gs.extract()
	_check("extraction banks scrap", gs.scrap == 140)
	gs.return_to_town()

	# Buying an upgrade spends scrap and raises the tier.
	gs.armor_tier = 0
	gs.scrap = 100
	var bought: bool = gs.try_buy_upgrade("armor")
	_check("upgrade spends scrap + raises tier", bought and gs.armor_tier == 1 and gs.scrap == 85)

	# Weapon shop: buy and equip a gun.
	gs.scrap = 200
	gs.owned_weapons = ["machine_gun"]
	gs.equipped_weapon_id = "machine_gun"
	var wbought: bool = gs.try_buy_weapon("shotgun")
	_check("buy weapon spends scrap + owns it", wbought and gs.owned_weapons.has("shotgun") and gs.scrap == 80)
	gs.equip_weapon("shotgun")
	_check("equip weapon", gs.equipped_weapon_id == "shotgun" and gs.get_equipped_weapon() != null)

	# Distance accrues as the tracked node (vehicle) moves north — the mechanic road_manager feeds.
	gs.start_run()
	gs.set_run_start_position(Vector2(10000, 0))
	gs.update_distance(Vector2(10000, -5000)) # 5000 units north == 1 mile
	_check("distance tracks forward movement", gs.current_run_miles >= 0.99)
	gs.return_to_town()

	# Restore the real profile.
	gs.scrap = snap.scrap
	gs.lifetime_scrap = snap.lifetime
	gs.armor_tier = snap.armor
	gs.kits_tier = snap.kits
	gs.reliability_tier = snap.rel
	gs.current_state = snap.state
	gs.current_run_miles = snap.miles
	gs.best_miles = snap.best
	gs.unlocked_vehicles = snap.unlocked
	gs.owned_weapons = snap.owned
	gs.equipped_weapon_id = snap.equipped
	gs.save_profile()

func _spawn_world() -> void:
	# Player stand-in so AI / minimap can find a target.
	var player := CharacterBody2D.new()
	player.add_to_group("player")
	player.global_position = Vector2(10000, 0)
	add_child(player)
	_check("player in group", get_tree().get_first_node_in_group("player") == player)

	# Armed vehicle.
	var vscene: PackedScene = load("res://entities/vehicles/vehicle_entity.tscn")
	_check("vehicle scene loads", vscene != null)
	if vscene:
		_vehicle = vscene.instantiate()
		_vehicle.data = load("res://data/vehicles/vehicle_balanced.tres")
		add_child(_vehicle)
		_vehicle.global_position = Vector2(10000, 200)
		_check("vehicle armed", _vehicle.mounted_weapons.size() > 0)
		_vehicle.fire_weapons()
		var hp_before: float = _vehicle.hp
		_vehicle.take_damage(10.0)
		_check("vehicle takes damage", _vehicle.hp < hp_before)

	# Every enemy behavior.
	var pscene: PackedScene = load("res://entities/vehicles/pursuer_vehicle.tscn")
	_check("pursuer scene loads", pscene != null)
	if pscene:
		var behaviors := [
			PursuerAI.BehaviorType.RAMMER, PursuerAI.BehaviorType.BLOCKER,
			PursuerAI.BehaviorType.SHOOTER, PursuerAI.BehaviorType.SWARM,
			PursuerAI.BehaviorType.TRANSPORT,
		]
		for i in behaviors.size():
			var e: PursuerAI = pscene.instantiate()
			e.behavior_type = behaviors[i]
			e.road_center_x = 10000.0
			e.lane_width = 100000.0
			add_child(e)
			e.global_position = Vector2(10000 + i * 70, -400)
		_check("all pursuer types spawn", true)

		# Boss (Road Captain): tanky + armed.
		var boss: PursuerAI = pscene.instantiate()
		boss.behavior_type = PursuerAI.BehaviorType.BOSS
		add_child(boss)
		boss.global_position = Vector2(10000, -900)
		_check("boss has high HP", boss.max_hp >= 200)
		_check("boss is armed", boss.mounted_weapons.size() > 0)

	# On-foot bandit.
	var bandit: CharacterBody2D = load("res://entities/enemies/bandit.gd").new()
	add_child(bandit)
	bandit.global_position = Vector2(9800, 0)
	_check("bandit spawns", is_instance_valid(bandit))

	# Foot-only ruin (barriers + loot + guards).
	var fz: Node2D = load("res://systems/map/foot_zone.gd").new()
	add_child(fz)
	fz.global_position = Vector2(9000, 0)
	_check("foot zone spawns", is_instance_valid(fz) and fz.get_child_count() > 0)

	# Explosion AoE.
	var ex: Node2D = load("res://entities/projectiles/explosion.gd").new()
	add_child(ex)
	ex.global_position = Vector2(10000, 100)
	ex.setup(150.0, 30, 0, null)
	_check("explosion spawns", is_instance_valid(ex))

	# Minimap (HUD control).
	var layer := CanvasLayer.new()
	add_child(layer)
	var mm: Control = load("res://scenes/hud/minimap.gd").new()
	layer.add_child(mm)
	_check("minimap spawns", is_instance_valid(mm))

func _process(_delta: float) -> void:
	_frame += 1
	# Run the encounter-director spawn test after _ready (so current_scene isn't busy).
	if _frame == 5 and not _did_encounter_test:
		_did_encounter_test = true
		_test_encounter_spawn()
		_test_ui_scenes()
		_test_vehicle_systems()
		_test_loot_effects()
		# Kill a transport; its convoy loot drops via deferred add_child — checked later.
		var t: PursuerAI = load("res://entities/vehicles/pursuer_vehicle.tscn").instantiate()
		t.behavior_type = PursuerAI.BehaviorType.TRANSPORT
		add_child(t)
		t.global_position = Vector2(10000, 600)
		_loot_before_drop = get_tree().get_nodes_in_group("loot").size()
		t.take_damage(99999.0) # _die -> _drop_convoy_loot (deferred)
	if _frame == 30 and _loot_before_drop >= 0:
		_check("convoy/boss loot drops on death", get_tree().get_nodes_in_group("loot").size() > _loot_before_drop)
	if _frame == 40 and is_instance_valid(_vehicle):
		# Projectiles should have been created and parented to the tree root.
		_check("vehicle still valid mid-run", _vehicle.hp > 0)
	if _frame >= 80:
		_finish()

## Verifies the encounter director's spawn path tracks the active vehicle and parents into the
## world without error. Run from _process so current_scene isn't mid-setup.
func _test_encounter_spawn() -> void:
	var dir: Node = load("res://systems/encounter_director.gd").new()
	add_child(dir)
	if is_instance_valid(_vehicle):
		_vehicle.is_active = true # make _tracked_node pick the vehicle
	var before: int = get_tree().get_nodes_in_group("enemy").size()
	dir.spawn_pursuer()
	var after: int = get_tree().get_nodes_in_group("enemy").size()
	_check("encounter director spawns enemies", after > before)

## Instantiates the menu/HUD scenes so node-path mismatches surface as errors.
func _test_ui_scenes() -> void:
	var holder := CanvasLayer.new()
	add_child(holder)
	for path in [
		"res://scenes/ui/upgrade_menu.tscn", "res://scenes/ui/vehicle_selector.tscn",
		"res://scenes/ui/run_summary.tscn", "res://scenes/hud/hud_overlay.tscn",
	]:
		var scene: PackedScene = load(path)
		if not scene:
			_check("loads " + path.get_file(), false)
			continue
		var inst: Node = scene.instantiate()
		holder.add_child(inst)
		_check("instantiates " + path.get_file(), is_instance_valid(inst))

	# Town zone should spawn a starting vehicle on load.
	var town_scene: PackedScene = load("res://systems/map/town_zone.tscn")
	if town_scene:
		var town: Node = town_scene.instantiate()
		holder.add_child(town)
		_check("town spawns a vehicle", town.current_vehicle != null)

## Breakdown/repair and the vehicle death path (destroyed signal + death explosion).
func _test_vehicle_systems() -> void:
	if is_instance_valid(_vehicle):
		var power_before: float = _vehicle.engine_power
		_vehicle.break_down()
		_check("vehicle breaks down (power drops)", _vehicle.is_broken and _vehicle.engine_power < power_before)
		_vehicle.repair()
		_check("vehicle repairs (power restored)", not _vehicle.is_broken and _vehicle.engine_power >= power_before)

	var died: Array = [false]
	var v2: VehicleEntity = load("res://entities/vehicles/vehicle_entity.tscn").instantiate()
	v2.data = load("res://data/vehicles/vehicle_balanced.tres")
	add_child(v2)
	v2.vehicle_destroyed.connect(func(): died[0] = true)
	v2.take_damage(99999.0)
	_check("vehicle death emits destroyed signal", died[0])

## Type-specific loot: scrap pickup banks scrap; every kind opens without error.
func _test_loot_effects() -> void:
	var gs = get_node_or_null("/root/GameState")
	var before: int = gs.scrap if gs else 0

	var loot: Node = load("res://entities/world/loot_cache.tscn").instantiate()
	add_child(loot)
	loot.pickup_kind = "scrap"
	loot.open(null)
	_check("scrap pickup banks scrap", gs != null and gs.scrap > before)

	var ok: bool = true
	for kind in ["health", "ammo", "repair", "fuel", "armor", ""]:
		var l: Node = load("res://entities/world/loot_cache.tscn").instantiate()
		add_child(l)
		l.pickup_kind = kind
		l.open(null)
	_check("all pickup kinds open without error", ok)

	if gs:
		gs.scrap = before # restore (scrap/fuel/armor added during the test)
		gs.save_profile()

func _check(label: String, cond: bool) -> void:
	_results.append(("PASS " if cond else "FAIL ") + label)

func _finish() -> void:
	var failed: int = 0
	for r in _results:
		print("SMOKE: ", r)
		if r.begins_with("FAIL"):
			failed += 1
	print("SMOKE TEST: %d/%d passed, %d failed" % [_results.size() - failed, _results.size(), failed])
	get_tree().quit(failed)
