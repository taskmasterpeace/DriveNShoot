## PROTO-3D on-foot player: capsule character, camera-relative WASD, gravity.
class_name ProtoPlayer3D
extends CharacterBody3D

@export var walk_speed: float = 4.2
@export var run_speed: float = 7.2
@export var accel: float = 14.0
@export var dive_speed: float = 9.5
@export var dive_time: float = 0.35
@export var getup_time: float = 0.75

## Named FootState (not State) — a globally-registered class's own enum used as a typed
## var trips GDScript's self-reference type check. Distinct name sidesteps it.
enum FootState { NORMAL, DIVE, GETUP }

var is_active: bool = false
var facing_dir: Vector3 = Vector3.FORWARD
var move_state: FootState = FootState.NORMAL
## When set (binoculars), the body turns toward this even while standing still.
var face_override: Vector3 = Vector3.ZERO

var _visual: Node3D
var _state_t: float = 0.0
var _dive_dir: Vector3 = Vector3.FORWARD


static func create() -> ProtoPlayer3D:
	var p := ProtoPlayer3D.new()
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.35
	cap.height = 1.7
	shape.shape = cap
	shape.position.y = 0.85
	p.add_child(shape)

	p._visual = Node3D.new()
	p.add_child(p._visual)
	var body := MeshInstance3D.new()
	var bmesh := CapsuleMesh.new()
	bmesh.radius = 0.32
	bmesh.height = 1.5
	body.mesh = bmesh
	body.material_override = ProtoWorldBuilder.material(Color(0.55, 0.42, 0.28), 0.8)
	body.position.y = 0.78
	p._visual.add_child(body)
	# Head + face hint so facing reads from above.
	var head := MeshInstance3D.new()
	var hmesh := SphereMesh.new()
	hmesh.radius = 0.19
	hmesh.height = 0.38
	head.mesh = hmesh
	head.material_override = ProtoWorldBuilder.material(Color(0.78, 0.6, 0.45), 0.9)
	head.position.y = 1.66
	p._visual.add_child(head)
	var nose := MeshInstance3D.new()
	var nmesh := BoxMesh.new()
	nmesh.size = Vector3(0.08, 0.08, 0.12)
	nose.mesh = nmesh
	nose.material_override = ProtoWorldBuilder.material(Color(0.7, 0.5, 0.35), 0.9)
	nose.position = Vector3(0, 1.66, -0.2)
	p._visual.add_child(nose)
	return p


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	_state_t += delta

	match move_state:
		FootState.DIVE:
			# Committed: full lunge, no steering.
			velocity.x = _dive_dir.x * dive_speed
			velocity.z = _dive_dir.z * dive_speed
			_visual.rotation.x = lerpf(_visual.rotation.x, -1.25, 10.0 * delta)
			if _state_t >= dive_time:
				move_state = FootState.GETUP
				_state_t = 0.0
			move_and_slide()
			return
		FootState.GETUP:
			# On the ground, getting up — vulnerable, no input.
			velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)
			_visual.rotation.x = lerp_angle(_visual.rotation.x, 0.0, 6.0 * delta)
			if _state_t >= getup_time:
				move_state = FootState.NORMAL
				_visual.rotation.x = 0.0
			move_and_slide()
			return

	var move := Vector3.ZERO
	if is_active:
		var x := Input.get_axis("move_left", "move_right")
		var z := -Input.get_axis("move_down", "move_up")
		move = Vector3(x, 0, z)
		if move.length_squared() > 1.0:
			move = move.normalized()
		# SPACE = dive (commit move: burst, then a get-up delay).
		if Input.is_action_just_pressed("jump"):
			_dive_dir = move.normalized() if move.length_squared() > 0.01 else facing_dir
			move_state = FootState.DIVE
			_state_t = 0.0
			facing_dir = _dive_dir
			return

	var speed := run_speed if Input.is_key_pressed(KEY_SHIFT) else walk_speed
	var target := move * speed
	velocity.x = move_toward(velocity.x, target.x, accel * delta)
	velocity.z = move_toward(velocity.z, target.z, accel * delta)

	if move.length_squared() > 0.01:
		facing_dir = move.normalized()
	elif face_override.length_squared() > 0.01:
		facing_dir = face_override.normalized()
	var target_yaw := atan2(-facing_dir.x, -facing_dir.z)
	_visual.rotation.y = lerp_angle(_visual.rotation.y, target_yaw, 12.0 * delta)

	move_and_slide()


func facing() -> Vector3:
	return facing_dir
