## Shared F2/F3 articulated body. Every visible body part is a RigidBody3D,
## every anatomical connection is a constrained 6DOF joint, and profile rows
## decide how much motor/balance/root authority the player receives.
class_name ProtoLabPhysicalBody
extends Node3D

signal damaged(amount: float, attacker: Node3D)

const PROFILE_SCRIPT := preload("res://proto3d/tools/physics_lab/lab_profiles.gd")
const PELVIS_OFFSET := Vector3(0, 1.08, 0)

var mode_id: String = "active_ragdoll"
var profile: Dictionary = {}
var parts: Dictionary = {}
var joints: Array[Generic6DOFJoint3D] = []
var parents: Dictionary = {}
var rest_offsets: Dictionary = {}
var rest_bases: Dictionary = {}
var weapon: ProtoWeapon = null
var condition: Dictionary = {"id": "fresh", "speed_mult": 1.0, "stamina": 100.0}
var surface: Dictionary = {"id": "asphalt", "stop_decel": 14.0,
	"dive_slide_mult": 1.0, "accel_mult": 1.0, "body_friction": 0.04}

var pelvis: RigidBody3D = null
var left_hand: RigidBody3D = null
var right_hand: RigidBody3D = null
var gun: Node3D = null
var _grip_l: Vector3 = Vector3.ZERO
var _grip_r: Vector3 = Vector3.ZERO
var _muzzle_z: float = 0.34
var _command: RefCounted = null
var _aim_world: Vector3 = Vector3.FORWARD
var _time: float = 0.0
var _last_force: float = 0.0
var _peak_speed: float = 0.0
var _last_reset: Transform3D = Transform3D.IDENTITY
var _dive_state: String = "ready"
var _dive_elapsed: float = 0.0
var _dive_airborne: bool = false
var _dive_contact: bool = false
var _dive_recovered: bool = false


class LabPhysicsPart extends RigidBody3D:
	var damage_callback: Callable

	func take_damage(amount: float, attacker: Node3D = null) -> void:
		if damage_callback.is_valid():
			damage_callback.call(amount, attacker)


func setup(profile_id: String) -> void:
	mode_id = profile_id
	profile = PROFILE_SCRIPT.row(profile_id)
	name = "PhysicalBody_%s" % profile_id
	_build_rig()
	set_weapon("pistol")


func _build_rig() -> void:
	var specs: Array[Dictionary] = [
		{"id":"pelvis", "size":Vector3(0.38,0.28,0.24), "pos":Vector3(0,1.08,0), "w":12.0, "c":Color("#5b554b")},
		{"id":"torso", "size":Vector3(0.48,0.52,0.26), "pos":Vector3(0,1.48,0), "w":15.0, "c":Color("#756b58")},
		{"id":"head", "size":Vector3(0.27,0.28,0.25), "pos":Vector3(0,1.91,0), "w":5.0, "c":Color("#a77e62")},
		{"id":"upper_arm_l", "size":Vector3(0.14,0.31,0.15), "pos":Vector3(-0.34,1.48,0), "w":3.0, "c":Color("#756b58")},
		{"id":"lower_arm_l", "size":Vector3(0.12,0.28,0.13), "pos":Vector3(-0.34,1.18,0), "w":2.2, "c":Color("#a77e62")},
		{"id":"hand_l", "size":Vector3(0.13,0.13,0.12), "pos":Vector3(-0.34,0.97,0), "w":1.0, "c":Color("#a77e62")},
		{"id":"upper_arm_r", "size":Vector3(0.14,0.31,0.15), "pos":Vector3(0.34,1.48,0), "w":3.0, "c":Color("#756b58")},
		{"id":"lower_arm_r", "size":Vector3(0.12,0.28,0.13), "pos":Vector3(0.34,1.18,0), "w":2.2, "c":Color("#a77e62")},
		{"id":"hand_r", "size":Vector3(0.13,0.13,0.12), "pos":Vector3(0.34,0.97,0), "w":1.0, "c":Color("#a77e62")},
		{"id":"upper_leg_l", "size":Vector3(0.17,0.40,0.19), "pos":Vector3(-0.13,0.73,0), "w":7.0, "c":Color("#45463f")},
		{"id":"lower_leg_l", "size":Vector3(0.14,0.36,0.16), "pos":Vector3(-0.13,0.36,0), "w":5.0, "c":Color("#4e5047")},
		{"id":"foot_l", "size":Vector3(0.17,0.12,0.30), "pos":Vector3(-0.13,0.12,-0.07), "w":1.8, "c":Color("#2d2b28")},
		{"id":"upper_leg_r", "size":Vector3(0.17,0.40,0.19), "pos":Vector3(0.13,0.73,0), "w":7.0, "c":Color("#45463f")},
		{"id":"lower_leg_r", "size":Vector3(0.14,0.36,0.16), "pos":Vector3(0.13,0.36,0), "w":5.0, "c":Color("#4e5047")},
		{"id":"foot_r", "size":Vector3(0.17,0.12,0.30), "pos":Vector3(0.13,0.12,-0.07), "w":1.8, "c":Color("#2d2b28")},
	]
	var authored_mass: float = 0.0
	for spec in specs:
		authored_mass += float(spec["w"])
	for spec in specs:
		var part_mass: float = float(profile["mass"]) * float(spec["w"]) / authored_mass
		_make_part(String(spec["id"]), spec["size"], spec["pos"], part_mass, spec["c"])
	pelvis = parts["pelvis"] as RigidBody3D
	left_hand = parts["hand_l"] as RigidBody3D
	right_hand = parts["hand_r"] as RigidBody3D
	pelvis.add_to_group("combatant")
	# Self-collision makes compact ragdolls explode; joints already define contact.
	var bodies: Array = parts.values()
	for i in bodies.size():
		for j in range(i + 1, bodies.size()):
			(bodies[i] as RigidBody3D).add_collision_exception_with(bodies[j] as RigidBody3D)
			(bodies[j] as RigidBody3D).add_collision_exception_with(bodies[i] as RigidBody3D)
	_connect("torso", "pelvis", Vector3(0,1.28,0), 28.0)
	_connect("head", "torso", Vector3(0,1.76,0), 24.0)
	_connect("upper_arm_l", "torso", Vector3(-0.29,1.62,0), 65.0)
	_connect("lower_arm_l", "upper_arm_l", Vector3(-0.34,1.32,0), 95.0)
	_connect("hand_l", "lower_arm_l", Vector3(-0.34,1.02,0), 40.0)
	_connect("upper_arm_r", "torso", Vector3(0.29,1.62,0), 65.0)
	_connect("lower_arm_r", "upper_arm_r", Vector3(0.34,1.32,0), 95.0)
	_connect("hand_r", "lower_arm_r", Vector3(0.34,1.02,0), 40.0)
	_connect("upper_leg_l", "pelvis", Vector3(-0.13,0.94,0), 55.0)
	_connect("lower_leg_l", "upper_leg_l", Vector3(-0.13,0.53,0), 80.0)
	_connect("foot_l", "lower_leg_l", Vector3(-0.13,0.17,-0.03), 38.0)
	_connect("upper_leg_r", "pelvis", Vector3(0.13,0.94,0), 55.0)
	_connect("lower_leg_r", "upper_leg_r", Vector3(0.13,0.53,0), 80.0)
	_connect("foot_r", "lower_leg_r", Vector3(0.13,0.17,-0.03), 38.0)


func _make_part(id: String, size: Vector3, offset: Vector3, part_mass: float,
		color: Color) -> void:
	var body := LabPhysicsPart.new()
	body.name = id
	body.damage_callback = _route_damage
	body.mass = part_mass
	body.position = offset
	body.linear_damp = 0.30
	body.angular_damp = 1.15
	var body_material := PhysicsMaterial.new()
	body_material.friction = 0.04
	body_material.rough = false
	body_material.bounce = 0.0
	body.physics_material_override = body_material
	body.can_sleep = false
	body.contact_monitor = true
	body.max_contacts_reported = 8
	body.continuous_cd = true
	body.add_to_group("lab_physics_part")
	add_child(body)
	var shape_node := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	shape_node.shape = shape
	body.add_child(shape_node)
	var mesh_node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_node.mesh = mesh
	mesh_node.material_override = ProtoWorldBuilder.material(color, 0.78)
	body.add_child(mesh_node)
	parts[id] = body
	rest_offsets[id] = offset
	rest_bases[id] = Basis.IDENTITY


func _route_damage(amount: float, attacker: Node3D = null) -> void:
	damaged.emit(amount, attacker)


func _connect(child_id: String, parent_id: String, anchor: Vector3,
		limit_deg: float) -> void:
	var joint := Generic6DOFJoint3D.new()
	joint.name = "%s_to_%s" % [child_id, parent_id]
	joint.position = anchor
	add_child(joint)
	joint.node_a = joint.get_path_to(parts[parent_id] as Node)
	joint.node_b = joint.get_path_to(parts[child_id] as Node)
	for axis in ["x", "y", "z"]:
		joint.set("linear_limit_%s/enabled" % axis, true)
		joint.set("linear_limit_%s/lower_distance" % axis, 0.0)
		joint.set("linear_limit_%s/upper_distance" % axis, 0.0)
		joint.set("angular_limit_%s/enabled" % axis, true)
		joint.set("angular_limit_%s/lower_angle" % axis, deg_to_rad(-limit_deg))
		joint.set("angular_limit_%s/upper_angle" % axis, deg_to_rad(limit_deg))
	joint.add_to_group("lab_physics_joint")
	joints.append(joint)
	parents[child_id] = parent_id


func apply_command(command: RefCounted, _delta: float) -> void:
	_command = command.duplicate_frame()
	var aim: Vector3 = command.get("aim_world")
	if aim.length_squared() > 0.001:
		_aim_world = aim.normalized()
	if bool(command.get("dive_pressed")) and _dive_state in ["ready", "recovered"]:
		_start_dive()


func _physics_process(delta: float) -> void:
	if pelvis == null or _command == null:
		return
	_time += delta
	_apply_root_force()
	_peak_speed = maxf(_peak_speed,
		Vector2(pelvis.linear_velocity.x, pelvis.linear_velocity.z).length())
	_apply_pose_motors()
	_apply_grip_spring()
	_update_weapon_visual()
	_update_dive(delta)


func _apply_root_force() -> void:
	var move: Vector3 = _command.get("move")
	move.y = 0.0
	var speed_mult: float = float(condition.get("speed_mult", 1.0))
	var target_speed: float = float(profile["target_speed"]) * speed_mult
	var desired: Vector3 = move.normalized() * target_speed if move.length_squared() > 0.001 else Vector3.ZERO
	var horizontal := Vector3(pelvis.linear_velocity.x, 0.0, pelvis.linear_velocity.z)
	var force: Vector3
	if float(profile["velocity_gain"]) > 0.0:
		force = (desired - horizontal) * float(profile["velocity_gain"])
	else:
		if move.length_squared() > 0.001:
			var drive_direction: Vector3 = move.normalized()
			var forward_speed: float = horizontal.dot(drive_direction)
			var lateral_velocity: Vector3 = horizontal - drive_direction * forward_speed
			# F3 is still accelerated exclusively by forces. Counter-force near the
			# authored cap prevents a low-friction ragdoll from accumulating runaway
			# speed, and lateral drag makes the input feel directional rather than icy.
			force = drive_direction * float(profile["move_force"])
			force -= drive_direction * maxf(0.0,
				forward_speed - target_speed * 0.9) * 400.0
			force -= lateral_velocity * 140.0
		else:
			force = -horizontal * 90.0
	var force_cap: float = float(profile["move_force"]) \
		* float(surface.get("accel_mult", 1.0))
	force = force.limit_length(force_cap)
	# Propulsion belongs to the articulated body, not only the pelvis. Dividing
	# the same authored force by mass keeps the net force unchanged while every
	# segment accelerates together instead of the pelvis towing planted limbs.
	var total_mass: float = float(profile["mass"])
	for part_value in parts.values():
		var part := part_value as RigidBody3D
		part.apply_central_force(force * (part.mass / total_mass))
	_last_force = force.length()
	# Active bodies need a root-height controller as well as angular pose motors;
	# otherwise a perfectly connected ragdoll simply folds onto the floor. F3 has
	# deliberately softer authority, but remains upright and targetable. Diving
	# releases this spring so the airborne/contact sequence stays genuinely free.
	if _dive_state in ["ready", "recovered"]:
		var target_y: float = _last_reset.origin.y + float(profile["stance_height"])
		var height_error: float = target_y - pelvis.global_position.y
		var lift: float = total_mass * 9.8 \
			+ height_error * float(profile["height_kp"]) \
			- pelvis.linear_velocity.y * float(profile["height_kd"])
		pelvis.apply_central_force(Vector3.UP * clampf(lift,
			-float(profile["max_lift_force"]), float(profile["max_lift_force"])))
	var up_error: Vector3 = pelvis.global_basis.y.cross(Vector3.UP)
	var balance: Vector3 = up_error * float(profile["balance_kp"]) \
		- pelvis.angular_velocity * float(profile["balance_kd"])
	pelvis.apply_torque(balance.limit_length(120.0))
	(parts["torso"] as RigidBody3D).apply_torque((up_error * float(profile["balance_kp"]) * 0.6 \
		- (parts["torso"] as RigidBody3D).angular_velocity * float(profile["balance_kd"])).limit_length(90.0))


func _apply_pose_motors() -> void:
	var yaw: float = atan2(-_aim_world.x, -_aim_world.z)
	var body_basis := Basis(Vector3.UP, yaw)
	var gait: float = sin(_time * 8.5) * (0.42 if _command.get("move").length_squared() > 0.01 else 0.0)
	for id in parts:
		var local_target := Basis.IDENTITY
		match String(id):
			"upper_arm_l": local_target = Basis(Vector3.RIGHT, 0.95 - gait * 0.25)
			"lower_arm_l": local_target = Basis(Vector3.RIGHT, 1.10)
			"upper_arm_r": local_target = Basis(Vector3.RIGHT, 1.05 + gait * 0.25)
			"lower_arm_r": local_target = Basis(Vector3.RIGHT, 1.20)
			"upper_leg_l": local_target = Basis(Vector3.RIGHT, gait)
			"upper_leg_r": local_target = Basis(Vector3.RIGHT, -gait)
			"lower_leg_l": local_target = Basis(Vector3.RIGHT, -absf(gait) * 0.45)
			"lower_leg_r": local_target = Basis(Vector3.RIGHT, -absf(gait) * 0.45)
		var target: Basis = body_basis * local_target
		var part := parts[id] as RigidBody3D
		var error: Basis = part.global_basis.inverse() * target
		var q: Quaternion = error.get_rotation_quaternion()
		var axis: Vector3 = q.get_axis()
		var angle: float = q.get_angle()
		if angle > PI:
			angle -= TAU
		if axis.is_finite() and not is_nan(angle):
			var torque: Vector3 = part.global_basis * axis * angle * float(profile["pose_kp"]) \
				- part.angular_velocity * float(profile["pose_kd"])
			part.apply_torque(torque.limit_length(85.0))


func _apply_grip_spring() -> void:
	if gun == null or _grip_l.is_zero_approx():
		return
	var local_grip := Vector3(_grip_l.x, _grip_l.y, _grip_l.z)
	var target: Vector3 = gun.global_transform * local_grip
	var error: Vector3 = target - left_hand.global_position
	var force: Vector3 = error * float(profile["grip_kp"]) \
		- left_hand.linear_velocity * float(profile["grip_kd"])
	left_hand.apply_central_force(force.limit_length(220.0))


func _start_dive() -> void:
	var direction: Vector3 = _command.get("move")
	if direction.length_squared() < 0.001:
		direction = _aim_world
	direction.y = 0.0
	direction = direction.normalized()
	var impulse: Vector3 = (direction * float(profile["dive_impulse"]) \
		* float(surface.get("dive_slide_mult", 1.0)) + Vector3.UP * 4.2) * pelvis.mass
	pelvis.apply_central_impulse(impulse)
	pelvis.apply_torque_impulse(pelvis.global_basis.x * -pelvis.mass * 1.8)
	_dive_state = "airborne"
	_dive_elapsed = 0.0
	_dive_airborne = true


func _update_dive(delta: float) -> void:
	if _dive_state == "ready" or _dive_state == "recovered":
		return
	_dive_elapsed += delta
	if _dive_state == "airborne" and _dive_elapsed > 0.18:
		var contact: bool = false
		for part in parts.values():
			contact = contact or (part as RigidBody3D).get_contact_count() > 0
		if contact or _dive_elapsed > 0.55:
			_dive_contact = true
			_dive_state = "contact"
	if _dive_state == "contact" and _dive_elapsed > 0.85:
		_dive_recovered = true
		_dive_state = "recovered"


func combat_body() -> Node3D:
	return pelvis


func body_velocity() -> Vector3:
	return pelvis.linear_velocity


func anchor_transform() -> Transform3D:
	var anchor_basis := Basis(Vector3.UP, pelvis.rotation.y)
	return Transform3D(anchor_basis, pelvis.global_position - anchor_basis * PELVIS_OFFSET)


func muzzle_world() -> Vector3:
	return gun.global_position - gun.global_basis.z * _muzzle_z if gun != null \
		else pelvis.global_position + Vector3.UP


func set_weapon(id: String) -> void:
	weapon = ProtoWeapon.new(id)
	if gun != null:
		gun.queue_free()
	gun = Node3D.new()
	gun.name = "PhysicalWeapon"
	right_hand.add_child(gun)
	var pose: Dictionary = weapon.info().get("hand_pose", {})
	_grip_l = pose.get("grip_l", Vector3.ZERO)
	_grip_r = pose.get("grip_r", Vector3.ZERO)
	var shape: Dictionary = ProtoWeapon.shape(id)
	_muzzle_z = float(shape.get("muzzle_z", 0.34))
	for part in shape.get("parts", []):
		var mesh_node := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = part.get("size", Vector3(0.06, 0.06, 0.3))
		mesh_node.mesh = mesh
		mesh_node.position = part.get("pos", Vector3.ZERO)
		mesh_node.rotation = part.get("rot", Vector3.ZERO)
		mesh_node.material_override = ProtoWorldBuilder.material(part.get("color", Color("#242426")), 0.8)
		gun.add_child(mesh_node)
	_update_weapon_visual()


func _update_weapon_visual() -> void:
	if gun == null or right_hand == null:
		return
	var direction: Vector3 = _aim_world.normalized() if _aim_world.length_squared() > 0.001 else Vector3.FORWARD
	gun.look_at(gun.global_position + direction, Vector3.UP)
	gun.global_position = right_hand.global_position - gun.global_basis * _grip_r


func apply_recoil(direction: Vector3, row: Dictionary, strength: int) -> void:
	var eat: float = maxf(0.25, 1.0 - float(strength) * 0.06)
	var impulse: float = float(row.get("kick_pitch", 0.08)) * 18.0 * eat
	right_hand.apply_central_impulse(-direction.normalized() * impulse)
	pelvis.apply_central_impulse(-direction.normalized() * impulse * 0.35)


func reset_at(at: Transform3D) -> void:
	_last_reset = at
	for id in parts:
		var part := parts[id] as RigidBody3D
		part.global_transform = Transform3D(at.basis * (rest_bases[id] as Basis),
			at.origin + at.basis * (rest_offsets[id] as Vector3))
		part.linear_velocity = Vector3.ZERO
		part.angular_velocity = Vector3.ZERO
		part.sleeping = false
	_dive_state = "ready"
	_dive_elapsed = 0.0
	_dive_airborne = false
	_dive_contact = false
	_dive_recovered = false
	_peak_speed = 0.0
	if weapon != null:
		weapon.mag = int(weapon.info()["mag_size"])
		weapon._cd = 0.0
	_update_weapon_visual()


func metrics() -> Dictionary:
	var finite: bool = true
	var max_separation: float = 0.0
	var reset_error: float = 0.0
	for id in parts:
		var part := parts[id] as RigidBody3D
		finite = finite and part.global_position.is_finite() and part.linear_velocity.is_finite() \
			and part.angular_velocity.is_finite()
		var expected: Vector3 = _last_reset.origin + _last_reset.basis * (rest_offsets[id] as Vector3)
		reset_error = maxf(reset_error, part.global_position.distance_to(expected))
		if parents.has(id):
			max_separation = maxf(max_separation,
				part.global_position.distance_to((parts[parents[id]] as RigidBody3D).global_position))
	var left_target: Vector3 = gun.global_transform * _grip_l if gun != null else left_hand.global_position
	var right_target: Vector3 = gun.global_transform * _grip_r if gun != null else right_hand.global_position
	return {"finite": finite, "speed": Vector2(pelvis.linear_velocity.x, pelvis.linear_velocity.z).length(),
		"peak_speed": _peak_speed,
		"pelvis_height": pelvis.global_position.y - _last_reset.origin.y,
		"target_speed": float(profile.get("target_speed", 7.2)), "joint_count": joints.size(),
		"part_count": parts.size(), "max_separation": max_separation,
		"force_driven": mode_id == "full_physics" and _last_force > 0.0,
		"last_force": _last_force, "grip_left_cm": left_hand.global_position.distance_to(left_target) * 100.0,
		"grip_right_cm": right_hand.global_position.distance_to(right_target) * 100.0,
		"sprint_blend": 1.0 if bool(_command.get("sprint")) else 0.0,
		"low_ready_blend": 1.0 if bool(_command.get("sprint")) else 0.0,
		"dive_state": _dive_state.to_upper(), "dive_airborne": _dive_airborne,
		"dive_contact": _dive_contact, "dive_recovered": _dive_recovered,
		"reset_error": reset_error, "condition": String(condition.get("id", "fresh"))}


func set_condition(row: Dictionary) -> void:
	condition = row.duplicate(true)


func set_surface(row: Dictionary) -> void:
	surface = row.duplicate(true)
	for part_value in parts.values():
		var part := part_value as RigidBody3D
		var material := part.physics_material_override
		if material != null:
			material.friction = float(row.get("body_friction", 0.04))
