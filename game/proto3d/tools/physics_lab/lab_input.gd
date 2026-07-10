## Hardware collapses here. Bodies never inspect keys, mouse buttons, or pad
## axes; they only consume ProtoLabCommand frames from this sampler.
class_name ProtoLabInput
extends RefCounted

const COMMAND_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_command.gd")

var _stamp: int = 0
var _test_feed: Variant = null
var _previous: Dictionary = {
	"dive": false, "fire": false, "reload": false, "throw": false,
	"radial": false, "interact": false,
}


func feed_for_test(command: Variant) -> void:
	_test_feed = command


func clear_test_feed() -> void:
	_test_feed = null


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


func _read_hardware(camera: Camera3D, origin: Vector3) -> Dictionary:
	var move := Vector2(
		Input.get_axis("move_left", "move_right"),
		-Input.get_axis("move_down", "move_up"))
	var pad_aim := Vector3(
		Input.get_axis("drivn_aim_left", "drivn_aim_right"), 0.0,
		-Input.get_axis("drivn_aim_down", "drivn_aim_up"))
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
		"fire": Input.is_action_pressed("drivn_fire"),
		"reload": Input.is_action_pressed("drivn_reload"),
		"throw": Input.is_action_pressed("drivn_grenade"),
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
		out.move = Vector3(move2.x, 0.0, move2.y).limit_length(1.0)
	elif move_value is Vector3:
		var move3 := move_value as Vector3
		move3.y = 0.0
		out.move = move3.limit_length(1.0)
	var aim: Vector3 = source.get("aim_world", Vector3.FORWARD)
	aim.y = 0.0
	out.aim_world = aim.normalized() if aim.length_squared() > 0.001 else Vector3.FORWARD
	out.sprint = bool(source.get("sprint", false))
	var dive: bool = bool(source.get("dive", false))
	var fire: bool = bool(source.get("fire", false))
	var reload: bool = bool(source.get("reload", false))
	var throwing: bool = bool(source.get("throw", false))
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
