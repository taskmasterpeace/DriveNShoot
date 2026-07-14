## BLACK ORBIT proof: inertia, wrap, independent aim/fire, asteroid split,
## collision damage, salvage collect/bank, AI, local seats, snapshot, result.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BLACK_ORBIT: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 71, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/black_orbit/black_orbit.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("black_orbit"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "claim-%d" % index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, move: Vector2, aim: Vector2, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": seat, "device": -1, "move": move, "aim": aim,
		"held": {"move_up": move.y < 0.0, "move_left": move.x < 0.0,
			"move_right": move.x > 0.0}, "pressed": pressed, "released": {}}


func _ready() -> void:
	print("BLACK_ORBIT: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/black_orbit/black_orbit.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(711)
	var b := _new_game(711)
	_check("same seed creates identical ships and debris",
		a.snapshot()["ships"] == b.snapshot()["ships"]
		and a.snapshot()["asteroids"] == b.snapshot()["asteroids"])
	_check("solo play fills an AI claim ship", a.ships.size() == 2
		and bool((a.ships[1] as Dictionary)["ai"]))
	var pos_before: Vector2 = (a.ships[0] as Dictionary)["pos"]
	a.apply_inputs(1, [_snap(0, Vector2(0, -1), Vector2.DOWN)])
	var velocity_after: Vector2 = (a.ships[0] as Dictionary)["vel"]
	a.apply_inputs(2, [_snap(0, Vector2.ZERO, Vector2.DOWN)])
	_check("thrust creates inertia that persists after release", velocity_after.length() > 0.0
		and (a.ships[0] as Dictionary)["pos"] != pos_before
		and Vector2((a.ships[0] as Dictionary)["vel"]).length() > 0.0)
	_check("independent aim does not overwrite ship facing",
		absf(float((a.ships[0] as Dictionary)["aim"]) - PI * 0.5) < 0.1)
	(a.ships[0] as Dictionary)["pos"] = Vector2(a.FIELD.end.x + 3.0, 300)
	a.update_fixed(1.0 / 30.0)
	_check("ships wrap across the orbital claim boundary",
		float((a.ships[0] as Dictionary)["pos"].x) < a.FIELD.get_center().x)
	var shot_count: int = a.shots.size()
	_check("primary fire launches one owned projectile", a.fire_shot(0)
		and a.shots.size() == shot_count + 1 and int((a.shots[-1] as Dictionary)["owner"]) == 0)

	a.asteroids = [{"pos": Vector2(500, 300), "vel": Vector2.ZERO, "size": 2}]
	_check("large debris splits and drops original salvage", a.hit_asteroid(0, 0)
		and a.asteroids.size() == 2 and a.salvage_pickups.size() == 1)
	(a.ships[0] as Dictionary)["pos"] = Vector2((a.salvage_pickups[0] as Dictionary)["pos"])
	_check("a ship collects a loose salvage claim", a.collect_salvage(0)
		and int((a.ships[0] as Dictionary)["salvage"]) == 1)
	(a.ships[0] as Dictionary)["pos"] = Vector2((a.ships[0] as Dictionary)["home"])
	_check("returning to the beacon banks carried salvage", a.bank_salvage(0)
		and int((a.ships[0] as Dictionary)["banked"]) == 1
		and int((a.ships[0] as Dictionary)["salvage"]) == 0)

	var hp_before := int((a.ships[1] as Dictionary)["hp"])
	(a.asteroids[0] as Dictionary)["pos"] = Vector2((a.ships[1] as Dictionary)["pos"])
	a.update_fixed(1.0 / 30.0)
	_check("debris collision damages a claim ship",
		int((a.ships[1] as Dictionary)["hp"]) < hp_before)
	var ai_game := _new_game(712)
	var ai_before: Vector2 = (ai_game.ships[1] as Dictionary)["pos"]
	for tick in 24:
		ai_game.apply_inputs(tick + 1, [_snap(0, Vector2.ZERO, Vector2.ZERO)])
	_check("AI thrusts toward debris or claims without player input",
		(ai_game.ships[1] as Dictionary)["pos"] != ai_before)

	var local_game := _new_game(713, 2)
	var local_a: Vector2 = (local_game.ships[0] as Dictionary)["pos"]
	var local_b: Vector2 = (local_game.ships[1] as Dictionary)["pos"]
	local_game.apply_inputs(1, [_snap(0, Vector2(0, -1), Vector2.RIGHT),
		_snap(1, Vector2(0, -1), Vector2.LEFT)])
	_check("two local seats thrust distinct claim ships",
		(local_game.ships[0] as Dictionary)["pos"] != local_a
		and (local_game.ships[1] as Dictionary)["pos"] != local_b)
	var saved: Dictionary = local_game.snapshot()
	local_game.apply_inputs(2, [_snap(0, Vector2(1, -1), Vector2.UP, {"primary": true}),
		_snap(1, Vector2(-1, -1), Vector2.DOWN, {"secondary": true})])
	local_game.restore_snapshot(saved)
	_check("snapshot restores ships, shots, debris, salvage, RNG, and tick",
		local_game.snapshot() == saved)

	var win_game := _new_game(714, 2)
	win_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	(win_game.ships[0] as Dictionary)["salvage"] = win_game.BANK_TARGET
	(win_game.ships[0] as Dictionary)["pos"] = Vector2((win_game.ships[0] as Dictionary)["home"])
	win_game.bank_salvage(0)
	_check("bank target emits one wins/salvage result", win_game.finished and results == 1
		and int(win_game.last_result.get("primary", 0)) == 1
		and int((win_game.last_result.get("secondary", {}) as Dictionary).get("salvage", 0)) >= win_game.BANK_TARGET)
	_check("completed claim match is idempotent", not win_game.debug_force_finish() and results == 1)
	var forced := _new_game(715, 2)
	_check("catalog completion hook emits a valid BLACK ORBIT result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "black_orbit")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("BLACK_ORBIT RESULTS: %d passed, %d failed" % [passed, failed])
	print("BLACK_ORBIT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
