## TILT SALVAGE proof: deterministic portrait pinball launch, walls, bumpers,
## independent flippers, lanes/jackpot, drain, nudge/tilt, snapshot, and result.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TILT_SALVAGE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 51) -> Control:
	var scene := load("res://proto3d/games/tilt_salvage/tilt_salvage.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("tilt_salvage"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(held: Dictionary, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": 0, "device": -1, "held": held.duplicate(),
		"pressed": pressed.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": Vector2.ZERO, "cursor": Vector2.ZERO}


func _ready() -> void:
	print("TILT_SALVAGE: start")
	get_tree().create_timer(50.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/tilt_salvage/tilt_salvage.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var game := _new_game(88)
	_check("portrait table is 540 by 960", game.FIELD_SIZE == Vector2(540, 960))
	game.apply_inputs(1, [_snap({}, {"primary": true})])
	_check("primary launches the salvage ball", game.ball_active and game.ball_vel.y < 0.0)
	var falling_before: float = game.ball_vel.y
	game.physics_step(0.1)
	_check("gravity bends the launched ball downward", game.ball_vel.y > falling_before)

	game.ball_active = true
	game.ball_pos = Vector2(game.BALL_RADIUS - 1.0, 500)
	game.ball_vel = Vector2(-180, 0)
	game.physics_step(0.05)
	_check("table wall reflects the ball", game.ball_vel.x > 0.0)
	var bumper: Vector2 = game.BUMPERS[0]
	game.ball_pos = bumper + Vector2(0, game.BUMPER_RADIUS + game.BALL_RADIUS - 2.0)
	game.ball_vel = Vector2(0, -120)
	var bumper_score: int = game.score
	game.physics_step(0.02)
	_check("bumper collision kicks and scores", game.score > bumper_score and game.ball_vel.y > 0.0)

	game.ball_active = true
	game.tilted = false
	game.ball_pos = Vector2(165, 790)
	game.ball_vel = Vector2(0, 180)
	game.apply_inputs(2, [_snap({"flipper_left": true})])
	_check("left flipper can return the ball independently", game.left_flipper and not game.right_flipper
		and game.ball_vel.y < 0.0)
	game.ball_pos = Vector2(375, 790)
	game.ball_vel = Vector2(0, 180)
	game.apply_inputs(3, [_snap({"flipper_right": true})])
	_check("right flipper has its own control", game.right_flipper and not game.left_flipper
		and game.ball_vel.y < 0.0)

	var before_jackpot: int = game.score
	game.activate_lane(0)
	game.activate_lane(1)
	game.activate_lane(2)
	_check("lighting all salvage lanes awards and resets jackpot", game.jackpots == 1
		and game.score >= before_jackpot + 1000 and game.lanes == [false, false, false])

	game.nudge()
	game.nudge()
	game.nudge()
	_check("repeated nudge tilts and locks the flippers", game.tilted)
	game.apply_inputs(4, [_snap({"flipper_left": true, "flipper_right": true})])
	_check("tilt lockout suppresses both flippers", not game.left_flipper and not game.right_flipper)

	var saved: Dictionary = game.snapshot()
	game.physics_step(0.2)
	game.restore_snapshot(saved)
	_check("snapshot restores ball, velocity, flippers, lanes, tilt, balls, score, and RNG", game.snapshot() == saved)

	var drain := _new_game(89)
	var balls_before: int = drain.balls
	drain.ball_active = true
	drain.ball_pos = Vector2(270, drain.FIELD_SIZE.y + 20)
	drain.ball_vel = Vector2(0, 100)
	drain.physics_step(0.01)
	_check("drain costs one ball and returns to launcher", drain.balls == balls_before - 1
		and not drain.ball_active)
	drain.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	drain.balls = 1
	drain.ball_active = true
	drain.ball_pos = Vector2(270, drain.FIELD_SIZE.y + 20)
	drain.physics_step(0.01)
	drain.physics_step(0.01)
	_check("last drain emits one score result", drain.finished and int(results[0]) == 1
		and (drain.last_result.get("secondary", {}) as Dictionary).has("jackpots"))
	var forced := _new_game(90)
	_check("catalog completion hook emits valid TILT SALVAGE result", forced.debug_force_finish())
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("TILT_SALVAGE RESULTS: %d passed, %d failed" % [passed, failed])
	print("TILT_SALVAGE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
