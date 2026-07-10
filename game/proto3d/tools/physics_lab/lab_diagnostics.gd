## Direction, visibility, and body facts for the lab. This component observes;
## it never rewrites cone angles, ranges, fades, or body control values.
class_name ProtoLabDiagnostics
extends Node3D

const AMBER := Color("#e8a33a")
const TEAL := Color("#35b6a6")
const RED := Color("#e15b45")
const BONE := Color("#eadfca")

var _xray_enabled: bool = false
var _debug_root: Node3D = null
var _line_mesh: ImmediateMesh = null
var _line_node: MeshInstance3D = null
var _labels: Array[Label3D] = []
var _line_count: int = 0
var _mode: String = ""
var _line_materials: Dictionary = {}


func snapshot(body: Node, target: Node3D, camera: Camera3D,
		vision: Dictionary = {}) -> Dictionary:
	var directions: Dictionary = _body_directions(body)
	var forward: Vector3 = vision.get("forward", directions["forward"])
	var gaze: Vector3 = vision.get("gaze", directions["gaze"])
	var weapon: Vector3 = vision.get("weapon", directions["weapon"])
	var cone_direction: Vector3 = vision.get("cone_direction", gaze)
	forward = _flat_normal(forward)
	gaze = _flat_normal(gaze)
	weapon = _flat_normal(weapon)
	cone_direction = _flat_normal(cone_direction)
	var anchor: Vector3 = _body_anchor(body)
	var target_position: Vector3 = target.global_position
	var to_target: Vector3 = target_position - anchor
	var distance: float = to_target.length()
	var target_direction: Vector3 = _flat_normal(to_target)
	var range_m: float = float(vision.get("range", 100.0))
	var half_angle: float = float(vision.get("half_angle_deg", 55.0))
	var in_cone: bool = distance <= range_m and cone_direction.dot(target_direction) \
		>= cos(deg_to_rad(half_angle))
	var los_facts: Dictionary = _line_of_sight(body, anchor + Vector3.UP,
		target, target_position)
	var behind: bool = camera.is_position_behind(target_position)
	var screen: Vector2 = camera.unproject_position(target_position)
	var view_rect: Rect2 = camera.get_viewport().get_visible_rect()
	var metrics: Dictionary = body.metrics() if body != null and body.has_method("metrics") else {}
	return {
		"source": String(vision.get("source", "turn")),
		"look_age": float(vision.get("look_age", 0.0)),
		"forward_yaw_deg": _yaw_deg(forward),
		"head_yaw_deg": _yaw_deg(gaze),
		"weapon_yaw_deg": _yaw_deg(weapon),
		"cone_yaw_deg": _yaw_deg(cone_direction),
		"distance": distance,
		"screen_position": screen,
		"camera_behind": behind,
		"on_screen": not behind and view_rect.has_point(screen),
		"range": range_m,
		"half_angle_deg": half_angle,
		"clear_radius": tan(deg_to_rad(half_angle)) * minf(distance, range_m),
		"in_cone": in_cone,
		"los": bool(los_facts["clear"]),
		"los_distance": float(los_facts["distance"]),
		"gameplay_visible": in_cone and bool(los_facts["clear"]),
		"fade_member": bool(vision.get("fade_member", distance <= 100.0)),
		"transparency": float(vision.get("transparency", 0.0)),
		"joint_count": int(metrics.get("joint_count", 0)),
		"contact_count": _contact_count(body),
		"grip_left_cm": float(metrics.get("grip_left_cm", 0.0)),
		"grip_right_cm": float(metrics.get("grip_right_cm", 0.0)),
		"fps": Engine.get_frames_per_second(),
		"physics_ms": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
		"process_ms": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
	}


func _body_directions(body: Node) -> Dictionary:
	var combat: Node3D = body.combat_body() if body != null and body.has_method("combat_body") else body
	var forward: Vector3 = combat.global_basis * Vector3.FORWARD
	var gaze: Vector3 = forward
	var weapon: Vector3 = forward
	if combat is ProtoPlayer3D:
		forward = (combat as ProtoPlayer3D).facing()
		gaze = (combat as ProtoPlayer3D).sight_facing()
		weapon = (combat as ProtoPlayer3D).aim_facing()
	elif body != null:
		if "parts" in body and (body.parts as Dictionary).has("head"):
			gaze = ((body.parts as Dictionary)["head"] as Node3D).global_basis * Vector3.FORWARD
		if "_aim_world" in body:
			weapon = body._aim_world
	return {"forward": _flat_normal(forward), "gaze": _flat_normal(gaze),
		"weapon": _flat_normal(weapon)}


func _body_anchor(body: Node) -> Vector3:
	if body != null and body.has_method("combat_body"):
		return (body.combat_body() as Node3D).global_position
	return (body as Node3D).global_position if body is Node3D else global_position


func _line_of_sight(body: Node, start: Vector3, target: Node3D,
		end: Vector3) -> Dictionary:
	var query := PhysicsRayQueryParameters3D.create(start, end)
	var excluded: Array[RID] = []
	var combat: Node = body.combat_body() if body != null and body.has_method("combat_body") else body
	if combat is CollisionObject3D:
		excluded.append((combat as CollisionObject3D).get_rid())
	if target is CollisionObject3D:
		excluded.append((target as CollisionObject3D).get_rid())
	if body != null and "parts" in body:
		for part in (body.parts as Dictionary).values():
			if part is CollisionObject3D:
				excluded.append((part as CollisionObject3D).get_rid())
	query.exclude = excluded
	var hit: Dictionary = target.get_world_3d().direct_space_state.intersect_ray(query)
	return {"clear": hit.is_empty(), "distance": start.distance_to(end) if hit.is_empty()
		else start.distance_to(hit["position"])}


func _contact_count(body: Node) -> int:
	var count: int = 0
	if body != null and "parts" in body:
		for part in (body.parts as Dictionary).values():
			if part is RigidBody3D:
				count += (part as RigidBody3D).get_contact_count()
	return count


func set_xray(enabled: bool, body: Node = null) -> void:
	_xray_enabled = enabled
	_ensure_debug_geometry()
	_debug_root.visible = enabled
	if enabled and body != null:
		update_xray(body)


func updates_enabled() -> bool:
	return _xray_enabled


func update_xray(body: Node) -> void:
	if not _xray_enabled or body == null:
		return
	_ensure_debug_geometry()
	var directions: Dictionary = _body_directions(body)
	_debug_root.global_position = _body_anchor(body) + Vector3.UP
	_mode = String(body.mode_id) if "mode_id" in body else "hybrid"
	_line_mesh.clear_surfaces()
	_add_line(Vector3.ZERO, directions["forward"] * 2.0, TEAL)
	_add_line(Vector3.ZERO, directions["gaze"] * 2.2 + Vector3.UP * 0.08, AMBER)
	_add_line(Vector3.ZERO, directions["weapon"] * 2.5 + Vector3.UP * 0.16, RED)
	_line_count = 3
	var positions: Array[Vector3] = [
		Vector3.ZERO, directions["forward"] * 2.0,
		directions["gaze"] * 2.2 + Vector3.UP * 0.08,
		directions["weapon"] * 2.5 + Vector3.UP * 0.16,
		Vector3(-0.38, 0.25, -0.2), Vector3(0.38, 0.25, -0.2)]
	var texts: Array[String] = ["COM / COLLIDER", "FORWARD", "GAZE + CONE",
		"WEAPON / MUZZLE", "GRIP L", "GRIP R"]
	for i in _labels.size():
		_labels[i].text = texts[i]
		_labels[i].position = positions[i]


func _ensure_debug_geometry() -> void:
	if _debug_root != null:
		return
	_debug_root = Node3D.new()
	_debug_root.name = "LabXRay"
	_debug_root.add_to_group("lab_xray")
	add_child(_debug_root)
	_line_mesh = ImmediateMesh.new()
	_line_node = MeshInstance3D.new()
	_line_node.mesh = _line_mesh
	_debug_root.add_child(_line_node)
	for i in 6:
		var label := Label3D.new()
		label.font_size = 34
		label.pixel_size = 0.008
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.modulate = BONE
		label.add_to_group("lab_xray_label")
		_debug_root.add_child(label)
		_labels.append(label)
	_debug_root.visible = false


func _add_line(from: Vector3, to: Vector3, color: Color) -> void:
	var key: String = color.to_html()
	if not _line_materials.has(key):
		var created := StandardMaterial3D.new()
		created.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		created.albedo_color = color
		_line_materials[key] = created
	var material := _line_materials[key] as StandardMaterial3D
	_line_mesh.surface_begin(Mesh.PRIMITIVE_LINES, material)
	_line_mesh.surface_add_vertex(from)
	_line_mesh.surface_add_vertex(to)
	_line_mesh.surface_end()


func xray_facts() -> Dictionary:
	return {"visible": _debug_root != null and _debug_root.visible,
		"mode": _mode, "line_count": _line_count,
		"label_count": _labels.size()}


static func _flat_normal(value: Vector3) -> Vector3:
	var out := Vector3(value.x, 0.0, value.z)
	return out.normalized() if out.length_squared() > 0.0001 else Vector3.FORWARD


static func _yaw_deg(direction: Vector3) -> float:
	return rad_to_deg(atan2(-direction.x, -direction.z))
