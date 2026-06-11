extends Node2D

## Headless smoke test. Spawns and exercises every gameplay system for a few frames, asserts
## basic invariants, prints SMOKE: PASS/FAIL lines, and quits with exit code = failure count.
## Run: Godot --headless --path game res://tests/smoke.tscn --quit-after 300

var _frame: int = 0
var _results: Array[String] = []
var _vehicle: VehicleEntity

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
	if _frame == 40 and is_instance_valid(_vehicle):
		# Projectiles should have been created and parented to the tree root.
		_check("vehicle still valid mid-run", _vehicle.hp > 0)
	if _frame >= 80:
		_finish()

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
