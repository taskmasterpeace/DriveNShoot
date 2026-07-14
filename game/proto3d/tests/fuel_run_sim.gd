## FUEL RUN proof: vehicle acceleration/steer/brake, capture can, carrier drag,
## home pump, steal/drop, short clock, AI route, local seats, snapshot, result.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FUEL_RUN: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 101, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/fuel_run/fuel_run.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("fuel_run"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "buggy-%d" % index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, move: Vector2, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": seat, "device": -1, "move": move, "aim": Vector2.ZERO,
		"held": {"move_up": move.y < 0.0, "move_down": move.y > 0.0,
			"move_left": move.x < 0.0, "move_right": move.x > 0.0},
		"pressed": pressed, "released": {}}


func _ready() -> void:
	print("FUEL_RUN: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/fuel_run/fuel_run.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(1011)
	var b := _new_game(1011)
	_check("same seed creates the same refinery racers and center can",
		a.snapshot()["cars"] == b.snapshot()["cars"] and a.fuel_can == b.fuel_can)
	_check("solo play fills an AI fuel thief", a.cars.size() == 2
		and bool((a.cars[1] as Dictionary)["ai"]))
	var velocity_before := Vector2((a.cars[0] as Dictionary)["vel"])
	a.apply_inputs(1, [_snap(0, Vector2(0, -1))])
	_check("throttle accelerates the buggy", Vector2((a.cars[0] as Dictionary)["vel"]).length() > velocity_before.length())
	var angle_before := float((a.cars[0] as Dictionary)["angle"])
	a.apply_inputs(2, [_snap(0, Vector2(1, -1))])
	_check("steering rotates a moving buggy", float((a.cars[0] as Dictionary)["angle"]) != angle_before)
	var speed_before := Vector2((a.cars[0] as Dictionary)["vel"]).length()
	a.apply_inputs(3, [_snap(0, Vector2(0, 1))])
	_check("brake reduces road speed", Vector2((a.cars[0] as Dictionary)["vel"]).length() < speed_before)

	(a.cars[0] as Dictionary)["pos"] = Vector2(a.fuel_can["pos"])
	_check("touching the center can assigns one carrier", a.try_pickup_can(0)
		and int(a.fuel_can["carrier"]) == 0)
	_check("carrying fuel lowers the buggy speed cap",
		a.current_max_speed(0) < a.BASE_MAX_SPEED)
	(a.cars[0] as Dictionary)["pos"] = Vector2((a.cars[0] as Dictionary)["home"])
	var captures_before := int((a.cars[0] as Dictionary)["captures"])
	_check("returning the can to the home pump captures fuel", a.try_capture(0)
		and int((a.cars[0] as Dictionary)["captures"]) == captures_before + 1
		and int((a.cars[0] as Dictionary)["lap_ms"]) > 0)

	(a.cars[0] as Dictionary)["pos"] = a.FIELD.get_center()
	(a.cars[1] as Dictionary)["pos"] = a.FIELD.get_center() + Vector2(20, 0)
	a.fuel_can = {"pos": Vector2((a.cars[0] as Dictionary)["pos"]), "carrier": 0}
	_check("a close rival can steal the carried can", a.try_steal(1, 0)
		and int(a.fuel_can["carrier"]) == 1)
	_check("carrier may deliberately drop the can", a.drop_can(1)
		and int(a.fuel_can["carrier"]) == -1)

	var ai_game := _new_game(1012)
	var ai_before: Vector2 = (ai_game.cars[1] as Dictionary)["pos"]
	for tick in 20:
		ai_game.apply_inputs(tick + 1, [_snap(0, Vector2.ZERO)])
	_check("AI drives a deterministic route toward fuel or home",
		(ai_game.cars[1] as Dictionary)["pos"] != ai_before)

	var local_game := _new_game(1013, 2)
	var local_a: Vector2 = (local_game.cars[0] as Dictionary)["pos"]
	var local_b: Vector2 = (local_game.cars[1] as Dictionary)["pos"]
	local_game.apply_inputs(1, [_snap(0, Vector2(0, -1)), _snap(1, Vector2(0, -1))])
	_check("two local seats accelerate distinct buggies",
		(local_game.cars[0] as Dictionary)["pos"] != local_a
		and (local_game.cars[1] as Dictionary)["pos"] != local_b)
	var saved: Dictionary = local_game.snapshot()
	local_game.apply_inputs(2, [_snap(0, Vector2(1, -1), {"primary": true}),
		_snap(1, Vector2(-1, 1), {"secondary": true})])
	local_game.restore_snapshot(saved)
	_check("snapshot restores cars, can, captures, clock, RNG, and tick", local_game.snapshot() == saved)

	var clock_game := _new_game(1014, 2)
	clock_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	(clock_game.cars[0] as Dictionary)["captures"] = 2
	clock_game.elapsed_ticks = clock_game.MATCH_TICKS - 1
	clock_game.update_fixed(1.0 / 30.0)
	_check("short clock emits one captures/lap result", clock_game.finished and results == 1
		and int(clock_game.last_result.get("primary", 0)) == 2
		and (clock_game.last_result.get("secondary", {}) as Dictionary).has("lap_ms"))
	_check("completed fuel match is idempotent", not clock_game.debug_force_finish() and results == 1)
	var forced := _new_game(1015, 2)
	_check("catalog completion hook emits a valid FUEL RUN result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "fuel_run")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("FUEL_RUN RESULTS: %d passed, %d failed" % [passed, failed])
	print("FUEL_RUN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
