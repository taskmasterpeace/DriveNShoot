## DEAD GROUND proof: first-click-safe seeded mines, counts, flood, flags,
## semantic cursor/pointer input, win/loss, snapshot, and low-time result.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DEAD_GROUND: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int) -> Control:
	var scene := load("res://proto3d/games/dead_ground/dead_ground.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("dead_ground"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(pressed: Dictionary, cursor_pos: Vector2 = Vector2.ZERO) -> Dictionary:
	return {"seat": 0, "device": -1, "held": pressed.duplicate(),
		"pressed": pressed.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": Vector2.ZERO, "cursor": cursor_pos}


func _ready() -> void:
	print("DEAD_GROUND: start")
	get_tree().create_timer(50.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/dead_ground/dead_ground.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(900)
	var b := _new_game(900)
	a.reveal(Vector2i(4, 4))
	b.reveal(Vector2i(4, 4))
	_check("same seed and first click make the same minefield", a.mines == b.mines)
	var first_ring_safe := true
	for y in range(3, 6):
		for x in range(3, 6):
			first_ring_safe = first_ring_safe and not a.is_mine(Vector2i(x, y))
	_check("first click and its touching ring are safe", first_ring_safe)

	a.start_match(901, [{"seat": 0}])
	a.set_mines_for_test([Vector2i(2, 2), Vector2i(3, 2)])
	_check("adjacent count reads all eight neighbors", a.adjacent_count(Vector2i(2, 3)) == 2
		and a.adjacent_count(Vector2i(0, 0)) == 0)
	a.reveal(Vector2i(0, 0))
	_check("revealing zero floods connected safe ground", a.revealed.size() > 8)

	a.start_match(902, [{"seat": 0}])
	a.set_mines_for_test([Vector2i(2, 2), Vector2i(9, 9)])
	a.cursor = Vector2i(1, 1)
	a.apply_inputs(1, [_snap({"secondary": true})])
	_check("secondary toggles a flag at the semantic cursor", a.flags.has("1,1"))
	a.apply_inputs(2, [_snap({"primary": true})])
	_check("flagged ground cannot be revealed", not a.revealed.has("1,1"))
	a.apply_inputs(3, [_snap({"secondary": true})])
	a.apply_inputs(4, [_snap({"primary": true})])
	_check("unflag then primary reveals the cursor square", a.revealed.has("1,1"))
	a.apply_inputs(5, [_snap({"move_right": true})])
	_check("D-pad/keyboard cursor movement is clamped to the board", a.cursor == Vector2i(2, 1))
	var pointer_point: Vector2 = a.cell_center(Vector2i(3, 3))
	a.apply_inputs(6, [_snap({"primary": true}, pointer_point)])
	_check("mouse pointer selects the same board contract", a.revealed.has("3,3"))

	var saved: Dictionary = a.snapshot()
	a.toggle_flag(Vector2i(4, 4))
	a.restore_snapshot(saved)
	_check("snapshot restores field, reveals, flags, cursor, RNG, and time", a.snapshot() == saved)

	var loss := _new_game(903)
	loss.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	loss.set_mines_for_test([Vector2i(1, 1)])
	loss.reveal(Vector2i(1, 1))
	loss.reveal(Vector2i(1, 1))
	_check("mine strike ends once and records one error", loss.finished and int(results[0]) == 1
		and loss.errors == 1 and not bool(loss.last_result.get("ranked", true)))

	var win := _new_game(904)
	win.set_mines_for_test([Vector2i(9, 9)])
	win.debug_reveal_all_safe()
	_check("revealing every safe square wins", win.finished and win.game_status == "cleared")
	_check("win result follows low clear-time plus errors contract",
		win.last_result.get("primary", null) is int
		and (win.last_result.get("secondary", {}) as Dictionary).has("errors")
		and bool(win.last_result.get("ranked", false)))
	var forced := _new_game(905)
	_check("catalog completion hook emits a valid result", forced.debug_force_finish())
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("DEAD_GROUND RESULTS: %d passed, %d failed" % [passed, failed])
	print("DEAD_GROUND: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
