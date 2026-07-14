## WASTE HEAP proof: a real cartridge uses the common lifecycle, seeded 2048
## rules merge once per source tile, pause freezes only the cartridge, snapshots
## round-trip, and a locked board emits exactly one normalized result.
## Run: Godot --headless --path game res://proto3d/tests/waste_heap_sim.tscn
extends Node

var passed := 0
var failed := 0
var result_count := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("WASTE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("WASTE: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("WASTE: WATCHDOG")
		get_tree().quit(1))

	var scene_path := "res://proto3d/games/waste_heap/waste_heap.tscn"
	_check("the proof cartridge scene exists", ResourceLoader.exists(scene_path))
	if not ResourceLoader.exists(scene_path):
		_finish()
		return

	var game: Control = (load(scene_path) as PackedScene).instantiate()
	add_child(game)
	game.match_finished.connect(func(_result: Dictionary) -> void: result_count += 1)
	var time_scale_before := Engine.time_scale
	game.configure(ProtoGameRegistry.load_catalog().get_game("waste_heap"), {"profile_id": "local"})
	game.start_match(2048, [{"seat": 0, "profile_id": "local", "name": "RIDER"}])
	_check("seeded start makes a 4x4 board", game.board.size() == 4 and game.board[0].size() == 4)
	_check("seeded start places exactly two tiles", _tile_count(game.board) == 2)

	game.restore_snapshot({
		"board": [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
		"score": 0, "highest_part": 2, "rng_state": 2048, "tick": 0
	})
	game.apply_inputs(1, [{"pressed": {"move_left": true}}])
	_check("equal parts merge left", game.board[0][0] == 4)
	_check("merge score is the produced value", game.score == 4 and game.highest_part == 4)
	_check("a successful move spawns exactly one tile", _tile_count(game.board) == 2)

	game.restore_snapshot({
		"board": [[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
		"score": 0, "highest_part": 2, "rng_state": 99, "tick": 0
	})
	game.apply_inputs(2, [{"pressed": {"move_left": true}}])
	_check("four equal tiles become two pairs, never one chain", game.board[0][0] == 4 and game.board[0][1] == 4)
	_check("both pairs score", game.score == 8)

	var saved: Dictionary = game.snapshot()
	game.restore_snapshot({"board": [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "score": 0})
	game.restore_snapshot(saved)
	_check("snapshot round-trips the board and score", game.board == saved["board"] and game.score == int(saved["score"]))

	game.pause_match(true)
	var paused_state: Dictionary = game.snapshot()
	game.apply_inputs(3, [{"pressed": {"move_right": true}}])
	_check("pause freezes cartridge state", game.snapshot()["board"] == paused_state["board"])
	_check("pause never changes world time scale", Engine.time_scale == time_scale_before)
	game.pause_match(false)

	game.restore_snapshot({
		"board": [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]],
		"score": 160, "highest_part": 4, "rng_state": 7, "tick": 3
	})
	game.apply_inputs(4, [{"pressed": {"move_left": true}}])
	game.apply_inputs(5, [{"pressed": {"move_up": true}}])
	_check("a locked board emits one result only", result_count == 1)
	_check("the result is complete and normalized", game.last_result.get("outcome") == "complete"
		and game.last_result.get("game_id") == "waste_heap" and int(game.last_result.get("primary", 0)) == 160)
	_check("result id is stable and non-empty", String(game.last_result.get("result_id", "")) != "")
	_finish()


func _tile_count(board: Array) -> int:
	var count := 0
	for row in board:
		for value in row:
			count += 1 if int(value) > 0 else 0
	return count


func _finish() -> void:
	print("WASTE RESULTS: %d passed, %d failed" % [passed, failed])
	print("WASTE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
