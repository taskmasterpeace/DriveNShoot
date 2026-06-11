extends Node2D

## Full-run integration sim (headless). Wires up GameState + RoadManager + EncounterDirector with
## an active vehicle, starts a run, drives the vehicle north for a while, and asserts the whole
## loop works at runtime: road streams, distance accrues, encounters spawn, extraction ends the run.
## Snapshots/restores the save profile. Run: Godot --headless --path game res://tests/run_sim.tscn --quit-after 600

var _frame: int = 0
var _vehicle: VehicleEntity
var _gs
var _results: Array[String] = []
var _snap: Dictionary = {}
var _done: bool = false

func _ready() -> void:
	_gs = get_node_or_null("/root/GameState")
	if not _gs:
		_check("GameState present", false)
		_finish()
		return
	_snap = {
		"scrap": _gs.scrap, "state": _gs.current_state, "miles": _gs.current_run_miles,
		"heat": _gs.current_heat, "rsp": _gs.run_start_position, "mfu": _gs.max_forward_units,
		"best": _gs.best_miles,
	}

	# Player stand-in (group "player").
	var player := CharacterBody2D.new()
	player.add_to_group("player")
	player.global_position = Vector2(10000, 0)
	add_child(player)

	# Active vehicle the run will follow.
	var vs: PackedScene = load("res://entities/vehicles/vehicle_entity.tscn")
	_vehicle = vs.instantiate()
	_vehicle.data = load("res://data/vehicles/vehicle_balanced.tres")
	add_child(_vehicle)
	_vehicle.global_position = Vector2(10000, 0)
	_vehicle.rotation = -PI / 2.0 # face north
	_vehicle.is_active = true
	_vehicle.input_throttle = 1.0

	# Systems.
	add_child(load("res://systems/map/road_manager.gd").new())
	add_child(load("res://systems/encounter_director.gd").new())

	# Start the run; bump heat so encounters become eligible quickly.
	_gs.start_run()
	_gs.add_heat(30, "sim")

func _process(_delta: float) -> void:
	if _done:
		return
	_frame += 1
	if is_instance_valid(_vehicle):
		_vehicle.input_throttle = 1.0 # keep the throttle pinned so it drives north

	if _frame >= 500:
		_finish()

func _finish() -> void:
	_done = true
	if _gs:
		_check("run reached RUN state", _gs.current_state == 1)
		_check("distance accrued while driving", _gs.current_run_miles > 0.15)
		_check("encounters spawned during run", get_tree().get_nodes_in_group("enemy").size() > 0)
		# Outrun pursuers despawn, so the count stays bounded even over a long drive.
		_check("enemy count stays bounded", get_tree().get_nodes_in_group("enemy").size() < 50)
		if is_instance_valid(_vehicle):
			_vehicle.input_throttle = 0.0
		_gs.extract()
		_check("extraction ends the run", _gs.current_state == 2) # EXTRACT
		# Restore the real profile.
		_gs.scrap = _snap.scrap
		_gs.current_state = _snap.state
		_gs.current_run_miles = _snap.miles
		_gs.current_heat = _snap.heat
		_gs.run_start_position = _snap.rsp
		_gs.max_forward_units = _snap.mfu
		_gs.best_miles = _snap.best
		_gs.save_profile()

	var failed: int = 0
	for r in _results:
		print("RUNSIM: ", r)
		if r.begins_with("FAIL"):
			failed += 1
	print("RUN SIM: %d/%d passed, %d failed" % [_results.size() - failed, _results.size(), failed])
	get_tree().quit(failed)

func _check(label: String, cond: bool) -> void:
	_results.append(("PASS " if cond else "FAIL ") + label)
