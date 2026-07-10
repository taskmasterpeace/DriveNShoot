## F1 adapter: the production CharacterBody3D + procedural puppet, driven only
## by shared lab commands. This is the controlled physics/IK hybrid baseline.
class_name ProtoLabBodyAdapter
extends Node3D

var player: ProtoPlayer3D = null
var weapon: ProtoWeapon = null
var mode_id: String = "hybrid"
var condition: Dictionary = {"id": "fresh", "speed_mult": 1.0, "stamina": 100.0}
var _last_command: RefCounted = null


func setup(appearance: Dictionary = {}) -> void:
	name = "HybridBodyAdapter"
	player = ProtoPlayer3D.create(appearance)
	player.use_player_input = false
	player.is_active = true
	add_child(player)
	set_weapon("pistol")


func apply_command(command: RefCounted, _delta: float) -> void:
	_last_command = command.duplicate_frame()
	player.packet = {"move": command.get("move"), "dive": command.get("dive_pressed"),
		"sprint": bool(command.get("sprint")), "crouch": false}
	player.set_aim_intent(command.get("aim_world"))


func combat_body() -> Node3D:
	return player


func muzzle_world() -> Vector3:
	return player.muzzle_world()


func set_weapon(id: String) -> void:
	weapon = ProtoWeapon.new(id)
	var row: Dictionary = weapon.info()
	var pose: Dictionary = row.get("hand_pose", {})
	player.puppet.set_hand_pose(pose.get("offset", Vector3.ZERO),
		bool(pose.get("two_handed", false)), pose.get("grip_l", Vector3.ZERO),
		pose.get("grip_r", Vector3.ZERO), String(pose.get("carry_class", "melee")),
		pose.get("elbow_pole_l", Vector3.ZERO))
	var shape: Dictionary = ProtoWeapon.shape(id)
	player.puppet.set_weapon_mesh(shape.get("parts", []), float(shape.get("muzzle_z", 0.34)))
	player.puppet.raised = not weapon.is_melee()
	player.set_armed(true)


func reset_at(at: Transform3D) -> void:
	player.global_transform = at
	player.velocity = Vector3.ZERO
	player.stamina = 100.0
	player.move_state = ProtoPlayer3D.FootState.NORMAL
	player.packet = ProtoPlayer3D.empty_packet()
	player.clear_aim_intent()
	player._was_running = false
	player.puppet.set("sprint_target", false)
	player.puppet.set("sprint_blend", 0.0)
	player.puppet.set("low_ready_blend", 0.0)
	if weapon != null:
		weapon.mag = int(weapon.info()["mag_size"])
		weapon._cd = 0.0


func metrics() -> Dictionary:
	var grips: Dictionary = player.puppet.grip_metrics() if player.puppet.has_method("grip_metrics") else {}
	return {
		"finite": player.global_position.is_finite() and player.velocity.is_finite(),
		"speed": Vector2(player.velocity.x, player.velocity.z).length(),
		"stamina": player.stamina,
		"sprinting": player.sprinting(),
		"sprint_blend": float(player.puppet.get("sprint_blend")),
		"low_ready_blend": float(player.puppet.get("low_ready_blend")),
		"grip_left_cm": float(grips.get("left_error_cm", 0.0)),
		"grip_right_cm": float(grips.get("right_error_cm", 0.0)),
		"elbow_l_deg": float(grips.get("elbow_l_deg", 0.0)),
		"dive_state": ProtoPlayer3D.FootState.keys()[player.move_state],
		"condition": String(condition.get("id", "fresh")),
	}


func set_condition(row: Dictionary) -> void:
	condition = row.duplicate(true)
	player.speed_mult = float(row.get("speed_mult", 1.0))
	player.stamina = clampf(float(row.get("stamina", 100.0)), 0.0, player.max_stamina)
