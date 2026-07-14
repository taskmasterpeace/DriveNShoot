## DIAL TANKS proof: deterministic roster, independent turret, ricochets,
## finite bounce life, mines, damage/round result, AI, local seats, snapshot.
extends Node

var passed := 0
var failed := 0
var result_count := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DIAL_TANKS: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 41, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/dial_tanks/dial_tanks.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("dial_tanks"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "local-%d" % index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, move: Vector2, aim: Vector2, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": seat, "device": -1, "move": move, "aim": aim,
		"held": {"move_up": move.y < 0.0, "move_down": move.y > 0.0,
			"move_left": move.x < 0.0, "move_right": move.x > 0.0},
		"pressed": pressed, "released": {}}


func _ready() -> void:
	print("DIAL_TANKS: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/dial_tanks/dial_tanks.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return

	var a := _new_game(501)
	var b := _new_game(501)
	_check("same seed creates the same arena roster", a.snapshot()["tanks"] == b.snapshot()["tanks"])
	_check("solo play fills a deterministic enemy gunner", a.tanks.size() == 2
		and bool((a.tanks[1] as Dictionary)["ai"]))
	var body_before := float((a.tanks[0] as Dictionary)["angle"])
	a.apply_inputs(1, [_snap(0, Vector2(-1, -1), Vector2.DOWN)])
	_check("tank body and turret rotate independently", float((a.tanks[0] as Dictionary)["angle"]) != body_before
		and absf(float((a.tanks[0] as Dictionary)["turret"]) - PI * 0.5) < 0.1)

	var shell_count: int = a.shells.size()
	_check("primary fire launches an owned shell", a.fire_shell(0)
		and a.shells.size() == shell_count + 1 and int((a.shells[-1] as Dictionary)["owner"]) == 0)
	a.shells = [{"pos": Vector2(a.FIELD.position.x + 2.0, 300.0),
		"vel": Vector2.LEFT * a.SHELL_SPEED, "owner": 0, "bounces": 0, "alive": true}]
	a.update_fixed(0.05)
	_check("shells bank from hard arena walls", not a.shells.is_empty()
		and float((a.shells[0] as Dictionary)["vel"].x) > 0.0
		and int((a.shells[0] as Dictionary)["bounces"]) == 1)
	a.shells = [{"pos": Vector2(a.FIELD.position.x + 2.0, 300.0),
		"vel": Vector2.LEFT * a.SHELL_SPEED, "owner": 0,
		"bounces": a.MAX_BOUNCES, "alive": true}]
	a.update_fixed(0.05)
	_check("a shell expires after its finite ricochet budget", a.shells.is_empty())

	(a.tanks[0] as Dictionary)["pos"] = Vector2(300, 300)
	(a.tanks[1] as Dictionary)["pos"] = Vector2(328, 300)
	var enemy_hp := int((a.tanks[1] as Dictionary)["hp"])
	_check("secondary action plants a mine", a.place_mine(0) and a.mines.size() == 1)
	(a.mines[0] as Dictionary)["arm_ticks"] = 0
	a.update_fixed(1.0 / 30.0)
	_check("an armed mine damages a rival in its trigger ring",
		int((a.tanks[1] as Dictionary)["hp"]) < enemy_hp)
	_check("a tank cannot trigger its own mine", int((a.tanks[0] as Dictionary)["hp"]) == a.START_HP)

	var round_game := _new_game(502, 2)
	round_game.match_finished.connect(func(_result: Dictionary) -> void: result_count += 1)
	round_game.damage_tank(1, round_game.START_HP, 0)
	_check("destroying the last rival completes exactly one round", round_game.finished
		and result_count == 1 and int(round_game.last_result.get("primary", 0)) == 1)
	round_game.damage_tank(1, 1, 0)
	_check("round completion is idempotent", result_count == 1)

	var ai_game := _new_game(503)
	var ai_before: Vector2 = (ai_game.tanks[1] as Dictionary)["pos"]
	for tick in 20:
		ai_game.apply_inputs(tick + 1, [_snap(0, Vector2.ZERO, Vector2.ZERO)])
	_check("solo AI drives toward a target without player input",
		(ai_game.tanks[1] as Dictionary)["pos"] != ai_before)

	var local_game := _new_game(504, 2)
	var local_a: Vector2 = (local_game.tanks[0] as Dictionary)["pos"]
	var local_b: Vector2 = (local_game.tanks[1] as Dictionary)["pos"]
	local_game.apply_inputs(1, [_snap(0, Vector2(0, -1), Vector2.RIGHT),
		_snap(1, Vector2(0, -1), Vector2.LEFT)])
	_check("two local seat snapshots move distinct tanks",
		(local_game.tanks[0] as Dictionary)["pos"] != local_a
		and (local_game.tanks[1] as Dictionary)["pos"] != local_b)
	var saved: Dictionary = local_game.snapshot()
	local_game.apply_inputs(2, [_snap(0, Vector2(1, -1), Vector2.UP),
		_snap(1, Vector2(-1, -1), Vector2.DOWN)])
	local_game.restore_snapshot(saved)
	_check("snapshot restores tanks, shells, mines, RNG, scores, and tick",
		local_game.snapshot() == saved)
	_check("catalog completion hook emits a valid result", local_game.debug_force_finish()
		and String(local_game.last_result.get("game_id", "")) == "dial_tanks")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("DIAL_TANKS RESULTS: %d passed, %d failed" % [passed, failed])
	print("DIAL_TANKS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
