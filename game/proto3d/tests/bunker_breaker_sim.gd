## BUNKER BREAKER proof: deterministic fixed-step breakout physics, paddle
## angles, armor hits/layers, portrait bounds, lives, snapshot, and result.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BUNKER_BREAKER: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 77) -> Control:
	var scene := load("res://proto3d/games/bunker_breaker/bunker_breaker.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("bunker_breaker"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(held: Dictionary, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": 0, "device": -1, "held": held.duplicate(),
		"pressed": pressed.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": Vector2.ZERO, "cursor": Vector2.ZERO}


func _ready() -> void:
	print("BUNKER_BREAKER: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/bunker_breaker/bunker_breaker.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(100)
	var b := _new_game(100)
	_check("same seed builds the same armor layer", a.bricks == b.bricks
		and a.ball_pos == b.ball_pos and a.ball_vel == b.ball_vel)
	_check("portrait playfield is 540 by 960", a.FIELD_SIZE == Vector2(540, 960))

	a.ball_attached = false
	a.paddle_x = 270.0
	a.ball_pos = Vector2(a.paddle_x - 52.0, a.PADDLE_Y - 13.0)
	a.ball_vel = Vector2(0, 260)
	a.physics_step(0.05)
	_check("left paddle edge returns the slug up-left", a.ball_vel.y < 0.0 and a.ball_vel.x < 0.0)
	a.ball_pos = Vector2(a.paddle_x + 52.0, a.PADDLE_Y - 13.0)
	a.ball_vel = Vector2(0, 260)
	a.physics_step(0.05)
	_check("right paddle edge returns the slug up-right", a.ball_vel.y < 0.0 and a.ball_vel.x > 0.0)

	a.start_match(101, [{"seat": 0}])
	a.ball_attached = false
	a.set_bricks_for_test([Rect2(220, 300, 100, 34), Rect2(340, 300, 100, 34)])
	a.ball_pos = Vector2(270, 345)
	a.ball_vel = Vector2(0, -260)
	a.physics_step(0.08)
	_check("slug removes one armor plate and adds score", a.bricks.size() == 1 and a.score > 0)
	var score_after_hit: int = a.score
	a.ball_pos = Vector2(390, 345)
	a.ball_vel = Vector2(0, -260)
	a.physics_step(0.08)
	_check("last plate breaches the layer and seeds the next", a.layers == 1
		and a.bricks.size() > 2 and a.score > score_after_hit)

	a.ball_attached = false
	a.ball_pos = Vector2(5, 500)
	a.ball_vel = Vector2(-200, 0)
	a.physics_step(0.1)
	_check("portrait side walls reflect the slug", a.ball_vel.x > 0.0 and a.ball_pos.x >= a.BALL_RADIUS)
	var lives_before: int = a.lives
	a.ball_attached = false
	a.ball_pos = Vector2(270, a.FIELD_SIZE.y + 20)
	a.ball_vel = Vector2(0, 200)
	a.physics_step(0.01)
	_check("drain costs one life and reattaches", a.lives == lives_before - 1 and a.ball_attached)

	var paddle_before: float = a.paddle_x
	a.apply_inputs(10, [_snap({"move_left": true})])
	_check("semantic held movement drives the paddle", a.paddle_x < paddle_before)
	a.apply_inputs(11, [_snap({}, {"primary": true})])
	_check("primary launches the attached slug", not a.ball_attached)

	var saved: Dictionary = a.snapshot()
	a.physics_step(0.1)
	a.restore_snapshot(saved)
	_check("snapshot restores ball, paddle, plates, score, layer, lives, and RNG", a.snapshot() == saved)

	var loss := _new_game(102)
	loss.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	loss.lives = 1
	loss.ball_attached = false
	loss.ball_pos = Vector2(270, loss.FIELD_SIZE.y + 20)
	loss.ball_vel = Vector2(0, 200)
	loss.physics_step(0.01)
	loss.physics_step(0.01)
	_check("last drain emits one normalized result", loss.finished and int(results[0]) == 1
		and loss.last_result.get("primary", null) is int
		and (loss.last_result.get("secondary", {}) as Dictionary).has("layers"))
	var forced := _new_game(103)
	_check("catalog completion hook emits valid BUNKER BREAKER result", forced.debug_force_finish())
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("BUNKER_BREAKER RESULTS: %d passed, %d failed" % [passed, failed])
	print("BUNKER_BREAKER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
