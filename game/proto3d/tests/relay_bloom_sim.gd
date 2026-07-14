## RELAY BLOOM proof: seeded rotations, reciprocal connections, source flood,
## terminals, correction/combo scoring, cursor/pointer, snapshot, and result.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RELAY_BLOOM: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 44) -> Control:
	var scene := load("res://proto3d/games/relay_bloom/relay_bloom.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("relay_bloom"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(pressed: Dictionary, pointer: Vector2 = Vector2.ZERO) -> Dictionary:
	return {"seat": 0, "device": -1, "held": pressed.duplicate(),
		"pressed": pressed.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": Vector2.ZERO, "cursor": pointer}


func _ready() -> void:
	print("RELAY_BLOOM: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/relay_bloom/relay_bloom.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(901)
	var b := _new_game(901)
	_check("same seed scrambles identical relay rotations", a.rotations == b.rotations)
	_check("square relay board is five by five", a.GRID_SIZE == 5)
	var straight: int = a.rotate_mask(a.EAST | a.WEST, 1)
	_check("quarter turn rotates east-west into north-south", straight == (a.NORTH | a.SOUTH))
	a.set_rotations_for_test({"0,2": 0, "1,2": 1})
	_check("power requires reciprocal touching edges", not a.tiles_connected(Vector2i(0, 2), Vector2i(1, 2)))
	a.set_rotations_for_test(a.solved_rotations())
	_check("solved network floods source to every terminal", a.terminals_powered()
		and a.powered.size() == a.BASE_MASKS.size())

	a.start_match(902, [{"seat": 0}])
	var corrections_before: int = a.corrections
	a.cursor = Vector2i(1, 2)
	a.rotate_tile(a.cursor)
	_check("non-productive rotation counts a correction and resets combo", a.corrections > corrections_before
		and a.combo == 0)
	var pointer_cell := Vector2i(2, 1)
	a.apply_inputs(1, [_snap({"primary": true}, a.cell_center(pointer_cell))])
	_check("pointer primary rotates the addressed relay", a.cursor == pointer_cell)
	a.apply_inputs(2, [_snap({"move_right": true})])
	_check("D-pad/keyboard moves the same clamped cursor", a.cursor == Vector2i(3, 1))

	var saved: Dictionary = a.snapshot()
	a.rotate_tile(Vector2i(2, 2))
	a.restore_snapshot(saved)
	_check("snapshot restores rotations, power, cursor, score, combo, moves, corrections, and RNG", a.snapshot() == saved)

	var win := _new_game(903)
	win.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	var almost: Dictionary = win.solved_rotations()
	almost["4,2"] = 1
	win.set_rotations_for_test(almost)
	win.rotate_tile(Vector2i(4, 2))
	win.rotate_tile(Vector2i(4, 2))
	win.rotate_tile(Vector2i(4, 2))
	win.rotate_tile(Vector2i(4, 2))
	_check("final terminal connection completes once", win.finished and int(results[0]) == 1
		and win.terminals_powered())
	_check("completion result reports score and max combo", win.last_result.get("primary", null) is int
		and (win.last_result.get("secondary", {}) as Dictionary).has("max_combo"))
	win.rotate_tile(Vector2i(4, 2))
	_check("completed bloom remains idempotent", int(results[0]) == 1)
	var forced := _new_game(904)
	_check("catalog completion hook emits valid RELAY BLOOM result", forced.debug_force_finish())
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("RELAY_BLOOM RESULTS: %d passed, %d failed" % [passed, failed])
	print("RELAY_BLOOM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
