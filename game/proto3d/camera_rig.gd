## PROTO-3D camera: top-down follow cam with scroll zoom, velocity look-ahead,
## and binoculars — hold to snap into a narrow-FOV cone looking far in the
## direction you're facing. This is the "you can finally SEE" fix.
class_name ProtoCameraRig
extends Node3D

@export var min_height: float = 9.0
@export var max_height: float = 58.0
@export var normal_fov: float = 62.0
@export var binocular_fov: float = 15.0
@export var binocular_range: float = 85.0
@export var lookahead_time: float = 0.55
@export var lookahead_max: float = 16.0

var target: Node3D = null
var zoom_t: float = 0.45 ## 0 = close, 1 = far
var binoculars: bool = false

var _cam: Camera3D
var _pos_smooth: Vector3
var _look_smooth: Vector3


static func create() -> ProtoCameraRig:
	var rig := ProtoCameraRig.new()
	rig._cam = Camera3D.new()
	rig._cam.far = 600.0
	rig._cam.current = true
	rig.add_child(rig._cam)
	return rig


func add_zoom(amount: float) -> void:
	zoom_t = clampf(zoom_t + amount, 0.0, 1.0)


func snap_to_target() -> void:
	if target == null:
		return
	_pos_smooth = _desired_position()
	_look_smooth = target.global_position
	_cam.global_position = _pos_smooth


func _desired_position() -> Vector3:
	var height := lerpf(min_height, max_height, zoom_t)
	# Always keep a little southward offset so the camera is never perfectly
	# vertical (look_at degenerates) and close zoom gets a GTA-modern tilt.
	var back := lerpf(7.0, 4.5, zoom_t)
	return target.global_position + Vector3(0, height, back)


func _target_velocity() -> Vector3:
	if target is RigidBody3D:
		return (target as RigidBody3D).linear_velocity
	if target is CharacterBody3D:
		return (target as CharacterBody3D).velocity
	return Vector3.ZERO


func _physics_process(delta: float) -> void:
	if target == null:
		return

	# Where should we look? Ahead of motion normally; far downrange with binoculars.
	var look_point: Vector3 = target.global_position
	if binoculars and target.has_method("facing"):
		var dir: Vector3 = target.call("facing")
		dir.y = 0.0
		if dir.length_squared() > 0.01:
			look_point = target.global_position + dir.normalized() * binocular_range
	else:
		var vel := _target_velocity()
		vel.y = 0.0
		var ahead := vel * lookahead_time
		if ahead.length() > lookahead_max:
			ahead = ahead.normalized() * lookahead_max
		look_point = target.global_position + ahead

	var k := 1.0 - exp(-6.0 * delta)
	_pos_smooth = _pos_smooth.lerp(_desired_position(), k)
	_look_smooth = _look_smooth.lerp(look_point, 1.0 - exp(-8.0 * delta))
	_cam.global_position = _pos_smooth

	var dir_to := (_look_smooth - _cam.global_position).normalized()
	var up := Vector3.UP
	if absf(dir_to.dot(up)) > 0.995:
		up = Vector3(0, 0, -1)
	_cam.look_at(_look_smooth, up)

	var fov_target := binocular_fov if binoculars else normal_fov
	_cam.fov = lerpf(_cam.fov, fov_target, 1.0 - exp(-10.0 * delta))
