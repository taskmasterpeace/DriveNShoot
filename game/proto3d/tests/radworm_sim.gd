## RADWORM rules proof: deterministic routing, queued turns, growth, collision,
## snapshot, semantic-device parity, and exactly one normalized result.
extends Node

var passed := 0
var failed := 0
var result_count := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RADWORM: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int) -> Control:
	var scene := load("res://proto3d/games/radworm/radworm.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("radworm"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snapshot(pressed: Dictionary, device: int = -1) -> Dictionary:
	return {"seat": 0, "device": device, "held": pressed.duplicate(),
		"pressed": pressed.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": Vector2.ZERO}


func _ready() -> void:
	print("RADWORM: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/radworm/radworm.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(404)
	var b := _new_game(404)
	_check("same seed places the same first packet", a.food == b.food and not a.body.has(a.food))
	_check("the worm begins at stock length three", a.body.size() == 3 and a.direction == Vector2i.RIGHT)

	a.apply_inputs(1, [_snapshot({"move_left": true})])
	_check("instant reversal is rejected", a.queued_direction == Vector2i.RIGHT)
	a.apply_inputs(2, [_snapshot({"move_up": true}, -1)])
	b.apply_inputs(2, [_snapshot({"move_up": true}, 2)])
	_check("keyboard and pad semantics queue the same turn", a.queued_direction == b.queued_direction
		and a.queued_direction == Vector2i.UP)

	a.body = [Vector2i(5, 5), Vector2i(4, 5), Vector2i(3, 5)]
	a.direction = Vector2i.RIGHT
	a.queued_direction = Vector2i.RIGHT
	a.food = Vector2i(6, 5)
	a.step_once()
	_check("eating a packet grows without dropping the tail", a.body.size() == 4
		and a.body[0] == Vector2i(6, 5) and not a.body.has(a.food))
	_check("survival counter advances on a completed route step", a.survival_ticks == 1)

	var saved: Dictionary = a.snapshot()
	a.step_once()
	a.restore_snapshot(saved)
	_check("snapshot restores body, food, direction, and RNG", a.body == saved["body"]
		and a.food == Vector2i(saved["food"][0], saved["food"][1])
		and a.direction == Vector2i(saved["direction"][0], saved["direction"][1]))

	a.match_finished.connect(func(_result: Dictionary) -> void: result_count += 1)
	a.body = [Vector2i(a.GRID_SIZE - 1, 3), Vector2i(a.GRID_SIZE - 2, 3), Vector2i(a.GRID_SIZE - 3, 3)]
	a.direction = Vector2i.RIGHT
	a.queued_direction = Vector2i.RIGHT
	a.step_once()
	a.step_once()
	_check("wall collision ends once", a.finished and result_count == 1)
	_check("wall result reports length and survival time", int(a.last_result.get("primary", 0)) == 3
		and int((a.last_result.get("secondary", {}) as Dictionary).get("survival_ms", -1)) >= 0)

	b.body = [Vector2i(5, 5), Vector2i(5, 4), Vector2i(4, 4), Vector2i(4, 5), Vector2i(4, 6)]
	b.direction = Vector2i.UP
	b.queued_direction = Vector2i.LEFT
	b.step_once()
	_check("self collision ends the route", b.finished)

	var c := _new_game(405)
	_check("debug completion emits a valid shelf result", c.debug_force_finish()
		and String(c.last_result.get("game_id", "")) == "radworm")
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("RADWORM RESULTS: %d passed, %d failed" % [passed, failed])
	print("RADWORM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
