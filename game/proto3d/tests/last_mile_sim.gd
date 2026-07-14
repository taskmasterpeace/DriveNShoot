## LAST MILE proof: deterministic courier racer controls, traffic, ordered
## checkpoints, collision penalty, ghost line, finish, snapshot, and low time.
extends Node

var passed := 0
var failed := 0
var results := [0]


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LAST_MILE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 500) -> Control:
	var scene := load("res://proto3d/games/last_mile/last_mile.tscn") as PackedScene
	var game: Control = scene.instantiate()
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("last_mile"), {"source": "test"})
	game.start_match(seed_value, [{"seat": 0, "device": -1, "profile_id": "proof"}])
	return game


func _snap(held: Dictionary) -> Dictionary:
	return {"seat": 0, "device": -1, "held": held.duplicate(), "pressed": {},
		"released": {}, "move": Vector2.ZERO, "aim": Vector2.ZERO, "cursor": Vector2.ZERO}


func _ready() -> void:
	print("LAST_MILE: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/last_mile/last_mile.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(808)
	var b := _new_game(808)
	_check("same seed builds identical civilian traffic", a.traffic == b.traffic)
	_check("landscape playfield is 1280 by 720", a.FIELD_SIZE == Vector2(1280, 720))
	var speed_before: float = a.speed
	a.apply_inputs(1, [_snap({"throttle": true})])
	_check("throttle increases courier speed", a.speed > speed_before)
	var throttle_speed: float = a.speed
	a.apply_inputs(2, [_snap({"brake": true})])
	_check("brake reduces speed", a.speed < throttle_speed)
	var lane_before: float = a.lane_x
	a.apply_inputs(3, [_snap({"move_left": true})])
	_check("steering changes lateral lane position", a.lane_x < lane_before)
	for _i in 80:
		a.apply_inputs(4 + _i, [_snap({"move_left": true})])
	_check("road shoulders clamp steering", a.lane_x >= -1.0)

	a.start_match(809, [{"seat": 0}])
	a.distance = a.checkpoints[0] - 2.0
	a.speed = 120.0
	a.update_fixed(0.1)
	_check("crossing the first ordered marker advances checkpoint", a.checkpoint_index == 1)
	a.distance = a.checkpoints[2] - 2.0
	a.update_fixed(0.1)
	_check("skipping ahead never awards an out-of-order marker", a.checkpoint_index == 1)

	a.start_match(810, [{"seat": 0}])
	a.speed = 140.0
	a.lane_x = 0.25
	a.traffic = [{"lane": 0.25, "distance": 4.0, "speed": 40.0, "hit": false}]
	a.update_fixed(0.05)
	_check("traffic contact adds time and kills speed", a.contacts == 1
		and a.penalty_ms > 0 and a.speed < 140.0)
	var penalty_once: int = a.penalty_ms
	a.update_fixed(0.05)
	_check("one traffic body penalizes only once", a.penalty_ms == penalty_once)

	_check("ghost racing line is deterministic and road-bounded",
		a.ghost_lane_at(1234.0) == b.ghost_lane_at(1234.0)
		and absf(a.ghost_lane_at(1234.0)) <= 0.85)
	var saved: Dictionary = a.snapshot()
	a.update_fixed(0.2)
	a.restore_snapshot(saved)
	_check("snapshot restores courier, traffic, checkpoints, clock, and penalties", a.snapshot() == saved)

	var finish := _new_game(811)
	finish.match_finished.connect(func(_result: Dictionary) -> void: results[0] += 1)
	finish.checkpoint_index = finish.checkpoints.size()
	finish.distance = finish.COURSE_LENGTH - 1.0
	finish.speed = 120.0
	finish.update_fixed(0.1)
	finish.update_fixed(0.1)
	_check("finish line emits one result only", finish.finished and int(results[0]) == 1)
	_check("result is low course time with clean-lap tiebreak", finish.last_result.get("primary", null) is int
		and (finish.last_result.get("secondary", {}) as Dictionary).has("clean_laps"))
	var forced := _new_game(812)
	_check("catalog completion hook emits valid LAST MILE result", forced.debug_force_finish())
	_check("rules never change world time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("LAST_MILE RESULTS: %d passed, %d failed" % [passed, failed])
	print("LAST_MILE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
