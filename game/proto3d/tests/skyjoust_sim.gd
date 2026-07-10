## SKYJOUST proof: thrust/fuel, gravity/air control, lance window, altitude hit,
## knockout/respawn, bot climb/attack, local seats, snapshot, wins result.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SKYJOUST: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 111, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/skyjoust/skyjoust.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("skyjoust"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "pilot-%d" % index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, move: Vector2, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": seat, "device": -1, "move": move, "aim": Vector2.ZERO,
		"held": {"move_up": move.y < 0.0, "move_left": move.x < 0.0,
			"move_right": move.x > 0.0}, "pressed": pressed, "released": {}}


func _ready() -> void:
	print("SKYJOUST: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/skyjoust/skyjoust.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(1111)
	var b := _new_game(1111)
	_check("same seed creates the same rocket pilots", a.pilots == b.pilots)
	_check("solo play fills an AI rival pilot", a.pilots.size() == 2
		and bool((a.pilots[1] as Dictionary)["ai"]))
	var fuel_before := float((a.pilots[0] as Dictionary)["fuel"])
	a.apply_inputs(1, [_snap(0, Vector2(0, -1))])
	_check("rocket thrust climbs and spends fuel", Vector2((a.pilots[0] as Dictionary)["vel"]).y < 0.0
		and float((a.pilots[0] as Dictionary)["fuel"]) < fuel_before)
	var vertical_before := Vector2((a.pilots[0] as Dictionary)["vel"]).y
	a.apply_inputs(2, [_snap(0, Vector2.ZERO)])
	_check("gravity pulls the unpowered rig downward",
		Vector2((a.pilots[0] as Dictionary)["vel"]).y > vertical_before)
	var x_before := Vector2((a.pilots[0] as Dictionary)["vel"]).x
	a.apply_inputs(3, [_snap(0, Vector2.RIGHT)])
	_check("air control changes horizontal velocity", Vector2((a.pilots[0] as Dictionary)["vel"]).x > x_before)
	a.apply_inputs(4, [_snap(0, Vector2.ZERO, {"primary": true})])
	_check("primary action opens a finite lance window", int((a.pilots[0] as Dictionary)["lance_ticks"]) > 0)

	(a.pilots[0] as Dictionary)["pos"] = Vector2(600, 260)
	(a.pilots[1] as Dictionary)["pos"] = Vector2(620, 330)
	(a.pilots[0] as Dictionary)["lance_ticks"] = 5
	(a.pilots[1] as Dictionary)["invulnerable"] = 0
	var knockouts_before := int((a.pilots[0] as Dictionary)["knockouts"])
	_check("an armed pilot striking from above earns a knockout", a.resolve_lance(0, 1)
		and int((a.pilots[0] as Dictionary)["knockouts"]) == knockouts_before + 1)
	_check("knocked-out rival respawns with restored rig and fuel",
		bool((a.pilots[1] as Dictionary)["alive"]) and float((a.pilots[1] as Dictionary)["fuel"]) == a.MAX_FUEL)
	(a.pilots[0] as Dictionary)["pos"] = Vector2(600, 350)
	(a.pilots[1] as Dictionary)["pos"] = Vector2(620, 300)
	(a.pilots[0] as Dictionary)["lance_ticks"] = 5
	(a.pilots[1] as Dictionary)["invulnerable"] = 0
	_check("a lower attacker cannot steal the altitude hit", not a.resolve_lance(0, 1))

	var ai_game := _new_game(1112)
	var ai_before: Vector2 = (ai_game.pilots[1] as Dictionary)["pos"]
	for tick in 20:
		ai_game.apply_inputs(tick + 1, [_snap(0, Vector2.ZERO)])
	_check("AI climbs or closes for a lance without player input",
		(ai_game.pilots[1] as Dictionary)["pos"] != ai_before)

	var local_game := _new_game(1113, 2)
	var local_a: Vector2 = (local_game.pilots[0] as Dictionary)["pos"]
	var local_b: Vector2 = (local_game.pilots[1] as Dictionary)["pos"]
	local_game.apply_inputs(1, [_snap(0, Vector2(-1, -1)),
		_snap(1, Vector2(1, -1))])
	_check("two local seats fly distinct rocket rigs",
		(local_game.pilots[0] as Dictionary)["pos"] != local_a
		and (local_game.pilots[1] as Dictionary)["pos"] != local_b)
	var saved: Dictionary = local_game.snapshot()
	local_game.apply_inputs(2, [_snap(0, Vector2.RIGHT, {"primary": true}),
		_snap(1, Vector2.LEFT, {"mobility": true})])
	local_game.restore_snapshot(saved)
	_check("snapshot restores pilots, fuel, lance windows, score, RNG, and tick",
		local_game.snapshot() == saved)

	var win_game := _new_game(1114, 2)
	win_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	(win_game.pilots[0] as Dictionary)["knockouts"] = win_game.KNOCKOUTS_TO_WIN - 1
	(win_game.pilots[0] as Dictionary)["pos"] = Vector2(600, 240)
	(win_game.pilots[1] as Dictionary)["pos"] = Vector2(620, 325)
	(win_game.pilots[0] as Dictionary)["lance_ticks"] = 5
	(win_game.pilots[1] as Dictionary)["invulnerable"] = 0
	win_game.resolve_lance(0, 1)
	_check("knockout target emits one wins/knockouts result", win_game.finished and results == 1
		and int(win_game.last_result.get("primary", 0)) == 1
		and int((win_game.last_result.get("secondary", {}) as Dictionary).get("knockouts", 0)) == win_game.KNOCKOUTS_TO_WIN)
	_check("completed joust is idempotent", not win_game.debug_force_finish() and results == 1)
	var forced := _new_game(1115, 2)
	_check("catalog completion hook emits a valid SKYJOUST result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "skyjoust")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("SKYJOUST RESULTS: %d passed, %d failed" % [passed, failed])
	print("SKYJOUST: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
