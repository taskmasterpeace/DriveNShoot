## Prototype proof for the GTA2 camera lab:
## - the standalone scene loads,
## - the camera rides opposite the mouse/facing direction,
## - zoom blends from overhead to third-person height,
## - sprinting is forward-facing, not full-speed backward/sideways.
## Run:
##   Godot_console --headless --path game res://proto3d/tests/camera_lab_sim.tscn
extends Node

const EAST := Vector3(1, 0, 0)
const NORTH := Vector3(0, 0, -1)
const SOUTH := Vector3(0, 0, 1)

var lab: Node = null
var phase: int = 0
var phase_t: float = 0.0
var total_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _p0: Vector3
var _forward_dist: float = 0.0
var _mouse_aim_start := Vector3.ZERO
var _mouse_min_dot: float = 1.0


func _ready() -> void:
	var scene := load("res://proto3d/tools/camera_lab.tscn") as PackedScene
	if scene == null:
		_check("camera lab scene loads", false)
		_finish()
		return
	lab = scene.instantiate()
	add_child(lab)
	print("CAMERA_LAB_SIM: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("CAMERA_LAB_SIM: PASS - %s" % name)
	else:
		failed += 1
		print("CAMERA_LAB_SIM: FAIL - %s" % name)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _finish() -> void:
	print("CAMERA_LAB_SIM RESULTS: %d passed, %d failed" % [passed, failed])
	print("CAMERA_LAB_SIM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _physics_process(delta: float) -> void:
	total_t += delta
	phase_t += delta
	if lab == null:
		return

	match phase:
		0:
			if phase_t > 0.2:
				var api_ok := lab.has_method("set_test_aim_dir") \
					and lab.has_method("set_test_move") \
					and lab.has_method("set_test_zoom") \
					and lab.has_method("reset_test_pose") \
					and lab.has_method("camera_behind_dot") \
					and lab.has_method("camera_height") \
					and lab.has_method("player_position") \
					and lab.has_method("last_speed") \
					and lab.has_method("upper_lower_delta_deg") \
					and lab.has_method("max_twist_deg") \
					and lab.has_method("feet_facing") \
					and lab.has_method("upper_facing") \
					and lab.has_method("footwork_label")
				_check("camera lab exposes test hooks", api_ok)
				if not api_ok:
					_finish()
					return
				lab.call("set_test_zoom", 0.62)
				lab.set("_test_aim_active", false)
				lab.set("_test_move_active", false)
				lab.set("_aim_dir", NORTH)
				lab.call("reset_test_pose", Vector3.ZERO)
				var cam := get_viewport().get_camera_3d()
				var player_px := cam.unproject_position(Vector3(0, 1.0, 0))
				Input.warp_mouse(player_px + Vector2(240, 0))
				_next()
		1:
			if phase_t > 0.25 and _mouse_aim_start == Vector3.ZERO:
				_mouse_aim_start = lab.get("_aim_dir")
				_mouse_min_dot = 1.0
			elif _mouse_aim_start != Vector3.ZERO:
				var now: Vector3 = lab.get("_aim_dir")
				_mouse_min_dot = minf(_mouse_min_dot, now.normalized().dot(_mouse_aim_start.normalized()))
			if phase_t > 1.45:
				_check("fixed mouse beside player does not spin the facing (min dot %.2f)" % _mouse_min_dot,
					_mouse_min_dot > 0.92)
				lab.call("reset_test_pose", Vector3.ZERO)
				lab.call("set_test_aim_dir", NORTH)
				lab.call("reset_test_pose", Vector3.ZERO)
				lab.call("set_test_aim_dir", SOUTH)
				_next()
		2:
			if phase_t > 0.25:
				var delta_deg := float(lab.call("upper_lower_delta_deg"))
				var max_deg := float(lab.call("max_twist_deg"))
				_check("upper body clamps at the waist limit (%.1f <= %.1f)" % [absf(delta_deg), max_deg],
					absf(delta_deg) <= max_deg + 3.0)
				_check("feet do not snap 180 instantly when aim goes behind (dot south %.2f)" % (lab.call("feet_facing") as Vector3).dot(SOUTH),
					(lab.call("feet_facing") as Vector3).dot(SOUTH) < 0.65)
				_next()
		3:
			if phase_t > 1.2:
				var feet: Vector3 = lab.call("feet_facing")
				var upper: Vector3 = lab.call("upper_facing")
				_check("holding rear aim pivots the feet around (feet south %.2f)" % feet.dot(SOUTH),
					feet.dot(SOUTH) > 0.78)
				_check("upper body still points where the mouse asked (upper south %.2f)" % upper.dot(SOUTH),
					upper.dot(SOUTH) > 0.92)
				_check("waist stays bounded while feet catch up (%.1f deg)" % float(lab.call("upper_lower_delta_deg")),
					absf(float(lab.call("upper_lower_delta_deg"))) <= float(lab.call("max_twist_deg")) + 3.0)
				lab.call("reset_test_pose", Vector3.ZERO)
				lab.call("set_test_aim_dir", EAST)
				lab.call("set_test_zoom", 1.0)
				_next()
		4:
			if phase_t > 0.55:
				_check("camera sits opposite the mouse/facing vector (dot %.2f)" % float(lab.call("camera_behind_dot")),
					float(lab.call("camera_behind_dot")) > 0.82)
				_check("overhead zoom is high enough for GTA2 framing (height %.1f)" % float(lab.call("camera_height")),
					float(lab.call("camera_height")) > 18.0)
				lab.call("set_test_zoom", 0.0)
				_next()
		5:
			if phase_t > 0.55:
				_check("close zoom drops toward third-person height (height %.1f)" % float(lab.call("camera_height")),
					float(lab.call("camera_height")) < 8.0)
				lab.call("reset_test_pose", Vector3.ZERO)
				lab.call("set_test_aim_dir", EAST)
				lab.call("set_test_move", Vector2(0, 1), true)
				_p0 = lab.call("player_position")
				_next()
		6:
			if phase_t > 1.0:
				var p1: Vector3 = lab.call("player_position")
				_forward_dist = (p1 - _p0).dot(EAST)
				_check("forward sprint follows facing, not fixed screen north (east %.1fm)" % _forward_dist,
					_forward_dist > 4.5 and absf(p1.z - _p0.z) < 0.7)
				lab.call("reset_test_pose", Vector3.ZERO)
				lab.call("set_test_aim_dir", EAST)
				lab.call("set_test_move", Vector2(0, -1), true)
				_p0 = lab.call("player_position")
				_next()
		7:
			if phase_t > 1.0:
				var p2: Vector3 = lab.call("player_position")
				var back_dist := maxf(0.0, -(p2 - _p0).dot(EAST))
				_check("backward sprint is clamped to backpedal pace (%.1fm < forward %.1fm)" % [back_dist, _forward_dist],
					back_dist < _forward_dist * 0.6 and float(lab.call("last_speed")) < 3.8)
				_check("the lab labels backward movement as backpedal footwork (%s)" % String(lab.call("footwork_label")),
					String(lab.call("footwork_label")) == "BACKPEDAL")
				lab.call("set_test_move", Vector2.ZERO, false)
				_next()
		8:
			_finish()

	if total_t > 12.0:
		print("CAMERA_LAB_SIM: TIMEOUT in phase %d" % phase)
		_finish()
