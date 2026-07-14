## GRIDBREACH proof: deterministic maze, blocking, charge capacity/fuse,
## blast lanes, destructible walls, chains, elimination, AI, local, snapshot.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GRIDBREACH: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 81, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/gridbreach/gridbreach.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("gridbreach"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "breacher-%d" % index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, pressed: Dictionary) -> Dictionary:
	return {"seat": seat, "device": -1, "move": Vector2.ZERO, "aim": Vector2.ZERO,
		"held": pressed.duplicate(), "pressed": pressed.duplicate(), "released": {}}


func _ready() -> void:
	print("GRIDBREACH: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/gridbreach/gridbreach.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(811)
	var b := _new_game(811)
	_check("same seed creates the same sabotage maze", a.grid == b.grid)
	_check("solo play fills an AI saboteur", a.players.size() == 2
		and bool((a.players[1] as Dictionary)["ai"]))
	a.grid = a.blank_grid()
	(a.players[0] as Dictionary)["cell"] = Vector2i(2, 2)
	a.grid[2][3] = a.SOLID
	_check("solid relay walls block grid movement", not a.move_player(0, Vector2i.RIGHT)
		and (a.players[0] as Dictionary)["cell"] == Vector2i(2, 2))
	a.grid[2][3] = a.BREAKABLE
	_check("destructible partitions block before a blast", not a.move_player(0, Vector2i.RIGHT))
	a.grid[2][3] = a.FLOOR
	_check("open cells accept one-tile movement", a.move_player(0, Vector2i.RIGHT)
		and (a.players[0] as Dictionary)["cell"] == Vector2i(3, 2))

	_check("primary action plants one owned charge", a.plant_bomb(0)
		and a.bombs.size() == 1 and int((a.bombs[0] as Dictionary)["owner"]) == 0)
	_check("capacity and occupied-cell rules reject a second charge", not a.plant_bomb(0))
	a.grid = a.blank_grid()
	a.grid[2][4] = a.SOLID
	var lane: Array[Vector2i] = a.compute_blast(Vector2i(2, 2), 4)
	_check("solid walls stop orthogonal blast lanes", lane.has(Vector2i(3, 2))
		and not lane.has(Vector2i(4, 2)) and not lane.has(Vector2i(5, 2)))

	var break_game := _new_game(812, 2)
	break_game.grid = break_game.blank_grid()
	(break_game.players[0] as Dictionary)["cell"] = Vector2i(2, 2)
	(break_game.players[1] as Dictionary)["cell"] = Vector2i(10, 6)
	break_game.grid[2][3] = break_game.BREAKABLE
	break_game.place_bomb_for_test(Vector2i(2, 2), 0, 0)
	break_game.update_fixed()
	_check("blast destroys the first breakable partition in its lane",
		int(break_game.grid[2][3]) == break_game.FLOOR
		and break_game.blasts.any(func(row: Dictionary) -> bool: return row["cell"] == Vector2i(3, 2)))

	var chain_game := _new_game(813, 2)
	chain_game.grid = chain_game.blank_grid()
	(chain_game.players[0] as Dictionary)["cell"] = Vector2i(1, 1)
	(chain_game.players[1] as Dictionary)["cell"] = Vector2i(11, 7)
	chain_game.place_bomb_for_test(Vector2i(5, 4), 0, 30)
	chain_game.place_bomb_for_test(Vector2i(6, 4), 1, 30)
	chain_game.detonate_bomb(0)
	_check("one blast immediately chains a neighboring charge", chain_game.bombs.is_empty()
		and chain_game.blasts.any(func(row: Dictionary) -> bool: return row["cell"] == Vector2i(7, 4)))

	var ai_game := _new_game(814)
	ai_game.grid = ai_game.blank_grid()
	(ai_game.players[1] as Dictionary)["cell"] = Vector2i(6, 4)
	var ai_before: Vector2i = (ai_game.players[1] as Dictionary)["cell"]
	ai_game.place_bomb_for_test(Vector2i(6, 5), 0, 25)
	for tick in 5:
		ai_game.apply_inputs(tick + 1, [_snap(0, {})])
	_check("AI escapes a nearby armed charge", (ai_game.players[1] as Dictionary)["cell"] != ai_before)

	var local_game := _new_game(815, 2)
	local_game.grid = local_game.blank_grid()
	(local_game.players[0] as Dictionary)["cell"] = Vector2i(2, 2)
	(local_game.players[1] as Dictionary)["cell"] = Vector2i(10, 6)
	local_game.apply_inputs(1, [_snap(0, {"move_right": true}),
		_snap(1, {"move_left": true})])
	_check("two local seats move distinct saboteurs",
		(local_game.players[0] as Dictionary)["cell"] == Vector2i(3, 2)
		and (local_game.players[1] as Dictionary)["cell"] == Vector2i(9, 6))
	var saved: Dictionary = local_game.snapshot()
	local_game.apply_inputs(2, [_snap(0, {"primary": true}), _snap(1, {"primary": true})])
	local_game.restore_snapshot(saved)
	_check("snapshot restores grid, players, charges, blasts, RNG, and tick",
		local_game.snapshot() == saved)

	var win_game := _new_game(816, 2)
	win_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	win_game.kill_player(1, 0)
	_check("last saboteur online emits one wins/survival result", win_game.finished
		and results == 1 and int(win_game.last_result.get("primary", 0)) == 1
		and (win_game.last_result.get("secondary", {}) as Dictionary).has("survival_ms"))
	_check("completed breach is idempotent", not win_game.debug_force_finish() and results == 1)
	var forced := _new_game(817, 2)
	_check("catalog completion hook emits a valid GRIDBREACH result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "gridbreach")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("GRIDBREACH RESULTS: %d passed, %d failed" % [passed, failed])
	print("GRIDBREACH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
