## A save-free sparring controller around the production player puppet and
## production weapon. The body can move, aim, flash, trace, and hit; all damage
## terminates at ProtoLabRound rather than campaign wounds/death.
class_name ProtoLabOpponent
extends Node3D

const DATA_PATH := "res://data/lab_opponents.json"
const SEARCH_LIMIT_S := 4.0

var behavior_id: String = "passive"
var row: Dictionary = {}
var body: ProtoPlayer3D = null
var player: ProtoPlayer3D = null # ProtoWeapon's shooter interface.
var target: Node3D = null
var round_controller: RefCounted = null
var weapon: ProtoWeapon = null
var character: ProtoCharacter = ProtoCharacter.new()
var audio: Node = null
var hud: Node = null
var active_car: Node = null
var fx_parent: Node = null
var shot_spread_deg: float = 0.0
var enabled: bool = true
var fighter_id: String = "opponent"
var opponent_id: String = "player"

var _agent: NavigationAgent3D = null
var _provoked: bool = false
var _reaction_left: float = 0.0
var _last_known: Vector3 = Vector3.ZERO
var _has_last_known: bool = false
var _last_seen_age: float = INF
var _searching: bool = false
var _shots: int = 0
var _hits_taken: int = 0
var _behavior_time: float = 0.0
var _last_muzzle: Vector3 = Vector3.ZERO
var _last_aim: Vector3 = Vector3.FORWARD
var _body_collision_layer: int = 0
var _body_collision_mask: int = 0


func setup(round_in: RefCounted, target_in: Node3D, behavior_in: String = "passive",
		fx_parent_in: Node = null) -> void:
	round_controller = round_in
	target = target_in
	fx_parent = fx_parent_in if fx_parent_in != null else get_parent()
	body = ProtoPlayer3D.create({"skin": Color("#8b604a"), "shirt": Color("#6b3428")})
	body.name = "SparringPartnerBody"
	body.use_player_input = false
	body.is_active = true
	add_child(body)
	_body_collision_layer = body.collision_layer
	_body_collision_mask = body.collision_mask
	player = body
	body.damaged.connect(_on_body_damaged)
	_agent = NavigationAgent3D.new()
	_agent.path_height_offset = 0.0
	_agent.path_desired_distance = 0.45
	_agent.target_desired_distance = 1.0
	body.add_child(_agent)
	set_behavior(behavior_in)
	set_enabled(true)


static func _rows() -> Dictionary:
	var file := FileAccess.open(DATA_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if parsed is not Dictionary:
		return {}
	return (parsed as Dictionary).get("opponents", {})


func set_behavior(id: String) -> bool:
	var rows: Dictionary = _rows()
	if not rows.has(id):
		return false
	behavior_id = id
	row = (rows[id] as Dictionary).duplicate(true)
	(character.skills["martial_arts"] as Dictionary)["level"] = int(row.get("martial_arts", 0))
	shot_spread_deg = float(row.get("accuracy_deg", 1.0))
	_reaction_left = float(row.get("reaction_s", 0.2))
	_provoked = false
	_searching = false
	_last_seen_age = INF
	_has_last_known = false
	_behavior_time = 0.0
	weapon = ProtoWeapon.new(String(row.get("weapon_id", "pistol")))
	_set_weapon_visual()
	return true


func set_weapon(id: String) -> bool:
	if not ProtoWeapon.WEAPONS.has(id):
		return false
	weapon = ProtoWeapon.new(id)
	row["weapon_id"] = id
	_set_weapon_visual()
	return true


func set_enabled(value: bool) -> void:
	enabled = value
	visible = value
	process_mode = Node.PROCESS_MODE_INHERIT if value else Node.PROCESS_MODE_DISABLED
	if body != null:
		body.collision_layer = _body_collision_layer if value else 0
		body.collision_mask = _body_collision_mask if value else 0


func _set_weapon_visual() -> void:
	if body == null or weapon == null:
		return
	var pose: Dictionary = weapon.info().get("hand_pose", {})
	body.puppet.set_hand_pose(pose.get("offset", Vector3.ZERO),
		bool(pose.get("two_handed", false)), pose.get("grip_l", Vector3.ZERO),
		pose.get("grip_r", Vector3.ZERO), String(pose.get("carry_class", "melee")),
		pose.get("elbow_pole_l", Vector3.ZERO))
	var shape: Dictionary = ProtoWeapon.shape(weapon.id)
	body.puppet.set_weapon_mesh(shape.get("parts", []), float(shape.get("muzzle_z", 0.34)))
	body.puppet.raised = not weapon.is_melee()
	body.set_armed(true)


func set_target(target_in: Node3D) -> void:
	target = target_in


func configure_identity(fighter: String, opponent: String) -> void:
	fighter_id = fighter
	opponent_id = opponent


func reset_at(at: Transform3D) -> void:
	if body == null:
		return
	body.global_transform = at
	body.velocity = Vector3.ZERO
	body.packet = ProtoPlayer3D.empty_packet()
	body.stamina = 100.0
	body.move_state = ProtoPlayer3D.FootState.NORMAL
	body.clear_aim_intent()
	_provoked = false
	_reaction_left = float(row.get("reaction_s", 0.2))
	_last_seen_age = INF
	_has_last_known = false
	_searching = false
	if weapon != null:
		weapon.mag = int(weapon.info()["mag_size"])
		weapon._cd = 0.0


func take_damage(amount: float, attacker: Node3D = null) -> void:
	_on_body_damaged(amount, attacker)


func _on_body_damaged(amount: float, _attacker: Node3D = null) -> void:
	if round_controller == null or round_controller.phase != "active":
		return
	_hits_taken += 1
	_provoked = true
	_reaction_left = float(row.get("reaction_s", 0.2))
	round_controller.hit(fighter_id, amount, {"attacker":opponent_id, "kind":"hit"})


func _physics_process(delta: float) -> void:
	if body == null or weapon == null or target == null or round_controller == null:
		return
	weapon.tick(delta, self)
	_behavior_time += delta
	if round_controller.phase != "active":
		body.packet = ProtoPlayer3D.empty_packet()
		return
	var engaged: bool = behavior_id in ["hunter", "duel"] \
		or (behavior_id == "return_fire" and _provoked)
	if not engaged:
		body.packet = ProtoPlayer3D.empty_packet()
		return
	_reaction_left = maxf(0.0, _reaction_left - delta)
	var visible: bool = _has_line_of_sight()
	if visible:
		_last_known = target.global_position
		_has_last_known = true
		_last_seen_age = 0.0
	else:
		_last_seen_age += delta
	_searching = not visible and _has_last_known and _last_seen_age <= SEARCH_LIMIT_S
	var destination: Vector3 = target.global_position if visible else _last_known
	var movement: Vector3 = Vector3.ZERO
	var distance: float = body.global_position.distance_to(destination)
	if (visible or _searching) and behavior_id in ["hunter", "duel"] \
			and distance > float(row.get("preferred_range", 8.0)):
		movement = _navigation_direction(destination)
	elif visible and behavior_id in ["hunter", "duel"]:
		var toward: Vector3 = target.global_position - body.global_position
		toward.y = 0.0
		if distance < float(row.get("preferred_range", 8.0)) * 0.62:
			movement = -toward.normalized()
		else:
			var lateral := Vector3(-toward.z, 0.0, toward.x).normalized()
			movement = lateral * sin(_behavior_time * 1.7) \
				* float(row.get("cover_bias", 0.0))
	body.packet = {"move": movement, "dive": false,
		"crouch": false, "sprint": movement.length_squared() > 0.01}
	var aim_point: Vector3 = target.global_position + _target_center_offset()
	var direction: Vector3 = (aim_point - body.muzzle_world()).normalized()
	body.set_aim_intent(direction)
	var attack_range: float = lerpf(16.0, 38.0,
		clampf(float(row.get("aggression", 0.0)), 0.0, 1.0))
	if visible and _reaction_left <= 0.0 and distance <= attack_range:
		_try_fire(direction)


func _navigation_direction(destination: Vector3) -> Vector3:
	var next: Vector3 = destination
	if _agent != null:
		_agent.target_position = destination
		var map: RID = _agent.get_navigation_map()
		if map.is_valid() and NavigationServer3D.map_get_iteration_id(map) > 0 \
				and not _agent.is_navigation_finished():
			next = _agent.get_next_path_position()
	var direction: Vector3 = next - body.global_position
	direction.y = 0.0
	return direction.normalized() if direction.length_squared() > 0.01 else Vector3.ZERO


func _target_center_offset() -> Vector3:
	# CharacterBody origins sit at the feet; physical adapters expose the pelvis.
	# Aim both at center mass, not at the ragdoll's narrow hip box.
	return Vector3(0, 0.82, 0) if target is CharacterBody3D else Vector3(0, 0.42, 0)


func _has_line_of_sight() -> bool:
	var start: Vector3 = body.global_position + Vector3(0, 1.1, 0)
	var end: Vector3 = target.global_position + _target_center_offset()
	var query := PhysicsRayQueryParameters3D.create(start, end)
	query.exclude = [body.get_rid()]
	var hit: Dictionary = body.get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		return true
	var collider: Object = hit.get("collider")
	return collider == target or (collider is Node and (
		(collider as Node).is_in_group("player3d")
		or (collider as Node).is_in_group("lab_physics_part")))


func _try_fire(direction: Vector3) -> void:
	if not weapon.can_fire():
		return
	var shot_direction: Vector3 = direction
	_last_muzzle = body.muzzle_world()
	_last_aim = shot_direction
	if weapon.fire(self, _last_muzzle, shot_direction, fx_parent):
		_shots += 1
		body.gun_recoil(weapon.info().get("recoil", {}), 2)
		if weapon.mag <= 0:
			weapon.mag = int(weapon.info()["mag_size"])


func metrics() -> Dictionary:
	return {"behavior": behavior_id, "shots": _shots, "hits_taken": _hits_taken,
		"fighter_id":fighter_id, "opponent_id":opponent_id,
		"provoked": _provoked, "searching": _searching,
		"last_seen_age": _last_seen_age, "has_last_known": _has_last_known,
		"position": body.global_position if body != null else Vector3.ZERO,
		"reaction_s": float(row.get("reaction_s", 0.0)),
		"accuracy_deg": float(row.get("accuracy_deg", 0.0)),
		"aggression": float(row.get("aggression", 0.0)),
		"cover_bias": float(row.get("cover_bias", 0.0)),
		"weapon_id": String(row.get("weapon_id", "")),
		"health": float(row.get("health", 100.0)),
		"martial_arts": int(row.get("martial_arts", 0)),
		"last_muzzle": _last_muzzle, "last_aim": _last_aim}
