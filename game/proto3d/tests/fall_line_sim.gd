## FALL LINE proof: fixed-step gravity/rotation/thrust/fuel, lateral drift,
## safe-pad landing, crash thresholds, snapshot, and rating/fuel result.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FALL_LINE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 600) -> Control:
	var scene := load("res://proto3d/games/fall_line/fall_line.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("fall_line"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(held: Dictionary) -> Dictionary:
	return {"seat": 0, "device": -1, "held": held.duplicate(),
		"pressed": held.duplicate(), "released": {}, "move": Vector2.ZERO,
		"aim": Vector2.ZERO, "cursor": Vector2.ZERO}


func _ready() -> void:
	print("FALL_LINE: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/fall_line/fall_line.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(701)
	var b := _new_game(701)
	_check("same seed creates the same landing pad and wind", a.pad_center == b.pad_center
		and a.wind == b.wind)
	_check("portrait lander field is 540 by 960", a.FIELD_SIZE == Vector2(540, 960))
	var vy_before: float = a.velocity.y
	a.physics_step(0.2, false, 0.0)
	_check("gravity accelerates the craft downward", a.velocity.y > vy_before)
	var angle_before: float = a.angle
	a.physics_step(0.1, false, 1.0)
	_check("rotation input turns the craft", a.angle > angle_before)

	a.start_match(702, [{"seat": 0}])
	a.velocity = Vector2(0, 35)
	a.angle = 0.0
	var fuel_before: float = a.fuel
	a.physics_step(0.2, true, 0.0)
	_check("thrust spends fuel and fights descent", a.fuel < fuel_before and a.velocity.y < 35.0)
	a.fuel = 0.0
	var empty_before: Vector2 = a.velocity
	a.physics_step(0.1, true, 0.0)
	_check("empty tanks provide no upward thrust", a.velocity.y > empty_before.y)

	a.start_match(703, [{"seat": 0}])
	a.apply_inputs(1, [_snap({"move_right": true, "thrust": true})])
	_check("semantic controls rotate and burn through one input path", a.angle > 0.0 and a.fuel < 100.0)
	a.velocity = Vector2(18, 0)
	var x_before: float = a.craft_pos.x
	a.physics_step(0.2, false, 0.0)
	_check("lateral drift persists without thrust", a.craft_pos.x > x_before)

	var saved: Dictionary = a.snapshot()
	a.physics_step(0.2, false, 0.0)
	a.restore_snapshot(saved)
	_check("snapshot restores craft, velocity, angle, fuel, pad, wind, clock, and RNG", a.snapshot() == saved)

	var landing := _new_game(704)
	landing.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	landing.craft_pos = Vector2(landing.pad_center, landing.GROUND_Y - landing.CRAFT_RADIUS - 1.0)
	landing.velocity = Vector2(2, 18)
	landing.angle = 0.05
	landing.physics_step(0.1, false, 0.0)
	landing.physics_step(0.1, false, 0.0)
	_check("gentle level touchdown on the pad lands once", landing.finished
		and landing.game_status == "landed" and int(results[0]) == 1)
	_check("landing result reports rating and remaining fuel", int(landing.last_result.get("primary", 0)) > 0
		and (landing.last_result.get("secondary", {}) as Dictionary).has("fuel"))

	var crash := _new_game(705)
	crash.craft_pos = Vector2(crash.pad_center, crash.GROUND_Y - crash.CRAFT_RADIUS - 1.0)
	crash.velocity = Vector2(0, 120)
	crash.angle = 0.0
	crash.physics_step(0.1, false, 0.0)
	_check("hard touchdown crashes", crash.finished and crash.game_status == "crashed"
		and int(crash.last_result.get("primary", -1)) == 0)
	var miss := _new_game(706)
	miss.craft_pos = Vector2(25, miss.GROUND_Y - miss.CRAFT_RADIUS - 1.0)
	miss.velocity = Vector2(0, 15)
	miss.angle = 0.0
	miss.physics_step(0.1, false, 0.0)
	_check("gentle dirt touchdown outside the pad still crashes", miss.game_status == "crashed")
	var forced := _new_game(707)
	_check("catalog completion hook emits valid FALL LINE result", forced.debug_force_finish())
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("FALL_LINE RESULTS: %d passed, %d failed" % [passed, failed])
	print("FALL_LINE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
