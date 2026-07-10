## Hardware collapses here. Bodies never inspect keys, mouse buttons, or pad
## axes; they only consume ProtoLabCommand frames from this sampler.
class_name ProtoLabInput
extends RefCounted

const COMMAND_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_command.gd")

var _stamp: int = 0
var _test_feed: Variant = null
var calibration: RefCounted = null
var _previous: Dictionary = {
	"dive": false, "fire": false, "reload": false, "throw": false,
	"radial": false, "interact": false,
}


func feed_for_test(command: Variant) -> void:
	_test_feed = command


func clear_test_feed() -> void:
	_test_feed = null


func set_calibration(calibration_in: RefCounted) -> void:
	calibration = calibration_in


func sample(camera: Camera3D, origin: Vector3, _delta: float) -> RefCounted:
	if _test_feed != null and not (_test_feed is Dictionary):
		var copy: RefCounted = _test_feed.duplicate_frame()
		if int(copy.get("stamp")) <= 0:
			_stamp += 1
			copy.set("stamp", _stamp)
		return copy
	var raw: Dictionary = _test_feed if _test_feed is Dictionary \
		else _read_hardware(camera, origin)
	return _normalize(raw)


func raw_pad_state() -> Dictionary:
	var connected: Array[int] = Input.get_connected_joypads()
	if connected.is_empty():
		return {"pad_id": -1, "left_stick": Vector2.ZERO, "right_stick": Vector2.ZERO,
			"left_trigger": 0.0, "right_trigger": 0.0}
	var pad_id: int = connected[0]
	return {"pad_id": pad_id,
		"left_stick": Vector2(Input.get_joy_axis(pad_id, JOY_AXIS_LEFT_X),
			Input.get_joy_axis(pad_id, JOY_AXIS_LEFT_Y)),
		"right_stick": Vector2(Input.get_joy_axis(pad_id, JOY_AXIS_RIGHT_X),
			Input.get_joy_axis(pad_id, JOY_AXIS_RIGHT_Y)),
		"left_trigger": clampf(Input.get_joy_axis(pad_id, JOY_AXIS_TRIGGER_LEFT), 0.0, 1.0),
		"right_trigger": clampf(Input.get_joy_axis(pad_id, JOY_AXIS_TRIGGER_RIGHT), 0.0, 1.0)}


func _action_without_axis(action: StringName, raw_axis_strength: float) -> float:
	# InputMap remains authoritative for rebound keys/buttons. When the mapped
	# action is only reporting the analog axis itself, remove that contribution
	# and re-add the calibrated raw axis below.
	var mapped: float = Input.get_action_strength(action)
	return mapped if mapped > raw_axis_strength + 0.05 else 0.0


func _digital_move(raw_pad: Vector2) -> Vector2:
	return Vector2(
		_action_without_axis("move_right", maxf(raw_pad.x, 0.0))
			- _action_without_axis("move_left", maxf(-raw_pad.x, 0.0)),
		_action_without_axis("move_down", maxf(raw_pad.y, 0.0))
			- _action_without_axis("move_up", maxf(-raw_pad.y, 0.0))).limit_length(1.0)


func keyboard_action_move() -> Vector2:
	return _digital_move(raw_pad_state()["left_stick"] as Vector2)


func _read_hardware(camera: Camera3D, origin: Vector3) -> Dictionary:
	var pad: Dictionary = raw_pad_state()
	var pad_move: Vector2 = pad["left_stick"]
	var move: Vector2 = _digital_move(pad_move)
	var pad_aim_2d: Vector2 = pad["right_stick"]
	var left_trigger: float = float(pad["left_trigger"])
	var right_trigger: float = float(pad["right_trigger"])
	if calibration != null:
		pad_move = calibration.normalize_stick(pad_move)
		pad_aim_2d = calibration.normalize_stick(pad_aim_2d)
		left_trigger = calibration.normalize_trigger(left_trigger)
		right_trigger = calibration.normalize_trigger(right_trigger)
	if move.is_zero_approx():
		move = pad_move
	var pad_aim := Vector3(pad_aim_2d.x, 0.0, pad_aim_2d.y)
	var aim: Vector3 = pad_aim
	if pad_aim.length() <= 0.25 and camera != null:
		var mouse: Vector2 = camera.get_viewport().get_mouse_position()
		var ray_origin: Vector3 = camera.project_ray_origin(mouse)
		var ray_dir: Vector3 = camera.project_ray_normal(mouse)
		var hit: Variant = Plane(Vector3.UP, origin.y).intersects_ray(ray_origin, ray_dir)
		if hit is Vector3:
			aim = (hit as Vector3) - origin
	return {"move": move, "aim_world": aim,
		"sprint": Input.is_action_pressed("drivn_sprint"),
		"dive": Input.is_action_pressed("jump"),
		"fire": _action_without_axis("drivn_fire", float(pad["right_trigger"])) > 0.5 \
			or right_trigger > 0.0,
		"reload": Input.is_action_pressed("drivn_reload"),
		"throw": _action_without_axis("drivn_grenade", float(pad["left_trigger"])) > 0.5 \
			or left_trigger > 0.0,
		"radial": Input.is_action_pressed("drivn_weapon_wheel"),
		"interact": Input.is_action_pressed("interact")}


func _normalize(raw: Dictionary) -> RefCounted:
	var source: Dictionary = raw
	if raw.has("keyboard"):
		source = raw["keyboard"] as Dictionary
	elif raw.has("pad"):
		source = raw["pad"] as Dictionary
	var out: Variant = COMMAND_SCRIPT.new()
	_stamp += 1
	out.stamp = _stamp
	var move_value: Variant = source.get("move", Vector2.ZERO)
	if move_value is Vector2:
		var move2 := move_value as Vector2
		if raw.has("pad") and calibration != null:
			move2 = calibration.normalize_stick(move2)
		out.move = Vector3(move2.x, 0.0, move2.y).limit_length(1.0)
	elif move_value is Vector3:
		var move3 := move_value as Vector3
		move3.y = 0.0
		out.move = move3.limit_length(1.0)
	var aim: Vector3 = source.get("aim_world", Vector3.FORWARD)
	if raw.has("pad") and calibration != null:
		var aim2: Vector2 = calibration.normalize_stick(Vector2(aim.x, aim.z))
		aim = Vector3(aim2.x, 0.0, aim2.y)
	aim.y = 0.0
	out.aim_world = aim.normalized() if aim.length_squared() > 0.001 else Vector3.FORWARD
	out.sprint = bool(source.get("sprint", false))
	var dive: bool = bool(source.get("dive", false))
	var fire: bool = bool(source.get("fire", false))
	if raw.has("pad") and source.has("right_trigger") and calibration != null:
		fire = calibration.normalize_trigger(float(source["right_trigger"])) > 0.0
	var reload: bool = bool(source.get("reload", false))
	var throwing: bool = bool(source.get("throw", false))
	if raw.has("pad") and source.has("left_trigger") and calibration != null:
		throwing = calibration.normalize_trigger(float(source["left_trigger"])) > 0.0
	var radial: bool = bool(source.get("radial", false))
	var interact: bool = bool(source.get("interact", false))
	out.dive_pressed = _pressed("dive", dive)
	out.fire_pressed = _pressed("fire", fire)
	out.fire_held = fire
	out.fire_released = _released("fire", fire)
	out.reload_pressed = _pressed("reload", reload)
	out.throw_pressed = _pressed("throw", throwing)
	out.throw_held = throwing
	out.throw_released = _released("throw", throwing)
	out.radial_pressed = _pressed("radial", radial)
	out.radial_held = radial
	out.radial_released = _released("radial", radial)
	out.interact_pressed = _pressed("interact", interact)
	_previous["dive"] = dive
	_previous["fire"] = fire
	_previous["reload"] = reload
	_previous["throw"] = throwing
	_previous["radial"] = radial
	_previous["interact"] = interact
	return out


func _pressed(id: String, held: bool) -> bool:
	return held and not bool(_previous.get(id, false))


func _released(id: String, held: bool) -> bool:
	return not held and bool(_previous.get(id, false))
