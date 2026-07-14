## PACK RAT proof: authored Sokoban maps, strict push/no-pull/no-double rules,
## completion order, semantic input, snapshots, and one levels/moves result.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PACK_RAT: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 12) -> Control:
	var scene := load("res://proto3d/games/pack_rat/pack_rat.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("pack_rat"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(pressed: Dictionary) -> Dictionary:
	return {"seat": 0, "device": -1, "held": pressed.duplicate(),
		"pressed": pressed.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": Vector2.ZERO, "cursor": Vector2.ZERO}


func _ready() -> void:
	print("PACK_RAT: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/pack_rat/pack_rat.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var game := _new_game()
	game.set_level_for_test(["#####", "#@#.#", "# $ #", "#####"])
	var wall_player: Vector2i = game.player_cell
	_check("walls block the worker", not game.move_worker(Vector2i.RIGHT)
		and game.player_cell == wall_player)

	game.set_level_for_test(["#######", "#@$ . #", "#######"])
	_check("one crate pushes into one open square", game.move_worker(Vector2i.RIGHT)
		and game.player_cell == Vector2i(2, 1) and game.crates.has(Vector2i(3, 1)))
	game.move_worker(Vector2i.LEFT)
	_check("walking away never pulls a crate", game.player_cell == Vector2i(1, 1)
		and game.crates.has(Vector2i(3, 1)))

	game.set_level_for_test(["#######", "#@$$. #", "#######"])
	_check("two crates cannot be pushed together", not game.move_worker(Vector2i.RIGHT)
		and game.crates.has(Vector2i(2, 1)) and game.crates.has(Vector2i(3, 1)))

	game.set_level_for_test(["######", "#@ $.#", "######"])
	game.apply_inputs(1, [_snap({"move_right": true})])
	game.apply_inputs(2, [_snap({"move_right": true})])
	_check("semantic movement pushes the final crate onto its bay", game.level_complete
		and game.moves == 2 and game.goals.all(func(point: Vector2i) -> bool: return game.crates.has(point)))

	game.set_level_for_test(["#######", "#@ $ .#", "#     #", "#######"])
	game.move_worker(Vector2i.RIGHT)
	var saved: Dictionary = game.snapshot()
	game.move_worker(Vector2i.RIGHT)
	game.restore_snapshot(saved)
	_check("snapshot restores map, worker, crates, goals, moves, and level", game.snapshot() == saved)

	game.start_match(22, [{"seat": 0}])
	game.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	_check("three original warehouse maps ship", game.LEVELS.size() == 3)
	var names: Array[String] = []
	for _i in game.LEVELS.size():
		names.append(game.level_name)
		game.debug_clear_level()
	_check("levels advance in deterministic authored order", names == ["INTAKE", "COLD AISLE", "NIGHT DOCK"])
	game.debug_clear_level()
	_check("clearing the shelf emits one result only", game.finished and int(results[0]) == 1)
	_check("result reports levels then moves", int(game.last_result.get("primary", 0)) == 3
		and (game.last_result.get("secondary", {}) as Dictionary).has("moves"))
	game.debug_clear_level()
	_check("completion remains idempotent", int(results[0]) == 1)

	var forced := _new_game(33)
	_check("catalog completion hook emits valid PACK RAT result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "pack_rat")
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("PACK_RAT RESULTS: %d passed, %d failed" % [passed, failed])
	print("PACK_RAT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
